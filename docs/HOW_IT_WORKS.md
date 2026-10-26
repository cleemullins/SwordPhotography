# How it works

Design notes and what was learned setting up the rig on 2026-10-25.

## Overview

```
Xbox controller --(XInput or raw HID)--> xbox_slider.py --+
                                                      +--(edelkrone SDK, BLE)--> Motor Module V3 --> SliderPLUS v5
                       slider_goto.py / slider_scan.py +
                                     |
                                     +--(HTTP JSON-RPC, bearer token)--> Nikon MCP server --> camera --> c:\images\*.nef
```

The camera faces straight down; the slider moves the platform so that the part of the bed
under the camera changes. A ruler along the bottom of the frame gives the position.

## The slider (edelkrone SDK)

- Package `edelkrone` (PyPI) 0.1.1, Python >= 3.11. Talks Bluetooth LE through `bleak`.
  Calls are synchronous. The API reference is the guide installed with the package
  (`site-packages/edelkrone/README.md` and `doc/*.pdf`).
- The SDK's supported list names SliderPLUS **v6**, not v5. The v5 is driven through its
  separate **Motor Module**, which the SDK finds as `Motor Module V3` and connects to with
  layout `slide_only`, axis `slide`, capabilities `manual_drive, position, settings,
  stored_pose`.
- Connect with `edelkrone.connect(mac="C4:DE:E2:EA:5A:E8")`. A scan takes about 8 s.
- **Position**: `device.status.pose.slide_cm`. Measured travel: **-0.708 cm** (far right)
  to **89.613 cm** (far left), 90.32 cm in all, centre 44.453 cm. Right = lower cm.
- **Calibration**: the slider reports `is_calibrated: false`. The SDK has **no command to
  reference a slider**; the guide says `is_calibrated` is information only and moves still
  work. The cm scale held steady for the whole session, but may not survive a power cycle.
- **No move-to-position for a slider.** The SDK offers the joystick and stored pose slots
  only. `slider_goto.py` therefore closes the loop itself: joystick toward the target at
  30% (10% within 5 cm), re-read `slide_cm` every 100 ms, stop within 0.3 cm. In practice
  it stopped 0.03–0.14 cm short of the target, consistently on the near side.
- **Joystick rules** (from the SDK guide): speeds are fractions of max (-1..1); the
  command must be repeated about every 100 ms; if commands stop, the device keeps the last
  speed for 1.5 s and then stops; a zero speed stops at once. Always call
  `device.move.stop()` in `finally`: disconnecting does not stop the motor.
- **Speeds measured**: 10% is about 0.97 cm/s once moving. 10% is enough to start the
  motor (no minimum speed problem).

## The camera (Nikon MCP server)

- The server is "ArcEngineNet10 MCP" 0.1.0, streamable HTTP at `http://127.0.0.1:<port>/mcp`
  with `Authorization: Bearer <token>`. It returns plain JSON (no SSE) and no session id.
- Tools (all take no arguments): `nikon_hello`, `nikon_camera_get_state`,
  `nikon_camera_toggle_connection`, `nikon_camera_capture`, `nikon_camera_toggle_live_view`,
  `nikon_camera_contrast_af`.
- `nikon_camera_capture` returns `status: "accepted"` with `statusMessage: "Capturing..."`
  immediately. `nikon.capture()` then polls `nikon_camera_get_state` until
  `lastCapturedImagePath` changes and `statusMessage` starts with `Saved`.
- Captures use the app's **no-autofocus** path: focus stays wherever it was set.
- Files are 6048 x 4032 NEF (about 18.8 MB). `nikon.preview()` extracts the largest JPEG
  embedded in the NEF (a full-size preview, about 1.8 MB) by walking the JPEG segments,
  so no raw converter is needed to look at a shot.

## The Xbox controller

Windows has presented the same Bluetooth controller in two different ways on this PC,
so `xbox_slider.py` supports both and picks whichever is available, XInput first. It
prints which: `controller found (XInput slot 0)` or `controller found (raw Bluetooth HID)`.

- **Mode 1: raw HID only** (2026-10-25, morning). XInput (`xinput1_4`, `xinput1_3`,
  `xinput9_1_0`) returned `ERROR_DEVICE_NOT_CONNECTED` (1167) for all four slots from
  every process tried, while the controller's HID interface (`VID 045E PID 02E0`) opened
  with `CreateFile` and delivered 16-byte input reports. The HID device ID was
  `HID\{00001124-...}_VID&0002045E_PID&02E0\...`.
- **Mode 2: XInput** (2026-10-25, evening). The HID device ID gained `&IG_00`
  (`HID\{00001124-...}&VID_045E&PID_02E0&IG_00\...`), meaning Windows' `xinputhid` driver now
  runs it as a gamepad. XInput slot 0 then reports the controller, and **raw HID reads
  receive nothing** (the device opens, but no reports arrive). In this mode, moving the
  stick also moved the mouse pointer when no game had focus, and XInput delivered the
  stick to the script **while its terminal had focus**.
- What switches between the modes wasn't established. Running alongside: Microsoft's
  **GameInput Redist** service and `GameInputRawInputProxy`, an "XBOX Synthetic Gamepad
  Bus", the Xbox PC app and `XboxService`. No remapper (Steam Input, HidHide, ViGEm,
  DS4Windows, reWASD) was running in either mode.
- **Practical rule**: keep the terminal running `xbox_slider.py` focused while driving.
  `tools/controller_probe.py` shows which mode the controller is in.

Raw HID details (mode 1), read with SetupAPI + `hid.dll` through `ctypes`, no packages:
- Report layout (report id `0x01`, older Xbox One S Bluetooth firmware):

  | Bytes | Field |
  |---|---|
  | 0 | report id `0x01` |
  | 1-2 | left stick X, little-endian 0..65535, centre 32768 |
  | 3-4 | left stick Y |
  | 5-6, 7-8 | right stick X, Y |
  | 9-12 | triggers |
  | 13 | d-pad |
  | 14 | buttons: bit 0 A, **bit 1 B**, ... |

- **The controller only sends a report when something changes.** A stick held still at
  full sends nothing, so "no recent report" cannot be used as a lost-controller check
  (it would stop the slider during a steady hold). A lost controller is detected when
  `ReadFile` fails (raw HID) or `XInputGetState` stops returning success (XInput), which
  Windows does within a few seconds of the link dropping.
- XInput gives the left stick X as a signed -32768..32767 and B as button bit `0x2000`;
  the stick rests around +500 to +2100 on this controller, inside the deadzone.
- Stick to speed: deadzone 7849 (of 32767), then the remaining travel squared, times
  `MAX_SPEED` (0.3), for fine control near the centre.

## The scan

- **Calibration**: two photos 2.54 cm apart. The ruler value at the image centre went
  from 21.0" (44.475 cm) to 20.0" (47.058 cm): 2.58 cm per 1", within reading error of
  2.54 cm, and higher cm = lower ruler value. `slider_scan.py` uses
  `slide_cm = 47.058 - (inch - 20) * 2.54`, so 16" = 57.218 cm and 35" = 8.958 cm.
- **Absolute targets**: each stop is computed from the calibration, not stepped from the
  last stop, so positioning errors don't accumulate.
- **Per shot**: `goto` (10% speed for 1" and 2" steps), wait 1 s for vibration to settle,
  read the actual `slide_cm`, capture, move the camera's `NNNN.nef` into the run folder as
  `<shot>.nef`, extract the preview, append to `scan_log.csv`. Run folders and file names
  are described in [INSTRUCTIONS.md](INSTRUCTIONS.md#run-folders-and-file-naming).
- **Result** (see [example_scan_log.csv](example_scan_log.csv)): 20 shots, actual centres
  16.05" to 34.97", every shot within 0.05" of its target. Checked by eye: the ruler at the
  image centre matched the target in the 32" and 35" frames.
- **Coverage**: a frame spans about 12" of ruler, so 1" steps overlap by about 11". The box
  top ran from about 16.9" to 27.9"; the gray card sat at about 29.4"–32.8" and is fully
  in the 30"–34" frames. The 32" frame is the gray card reference (`c:\images\0020.nef`).

## Exposure and white balance

Measured as the average colour of the same patch of gray card (ruler 30.0"–32.2") in each
frame's embedded JPEG preview, so these include the camera's own processing:

| Camera settings | 30" frame | 32" frame | 34" frame | 35" frame |
|---|---|---|---|---|
| All auto (first scan) | n/a | 138 / 187 / 246 | n/a | 235 / 253 / 255 |
| Manual focus, aperture, shutter; auto WB | 40 / 69 / 105 | 69 / 70 / 71 | 68 / 69 / 69 | 65 / 66 / 66 |
| ...and white balance locked at 5600K | 50 / 50 / 53 | 48 / 48 / 51 | 44 / 45 / 47 | 42 / 42 / 44 |

- With auto exposure the card swung from blue-tinted to clipped white between frames.
- With exposure locked but auto white balance, the frame with the most warm wood in it
  (30") came out blue: the camera cooled the whole frame to compensate.
- With everything locked, the card is neutral in every frame (R = G, B about 3 higher).
- **Edge falloff**: the card is about 17% darker 4–5" from the frame centre than at the
  centre (the same is seen on the wood). That is vignetting or uneven light, not a camera
  setting. With 2" steps and 12" frames, use only the middle few inches of each frame when
  stitching, or divide by a flat-field frame of an evenly lit blank card.
- At 5600K the card sits at about 48/255, roughly 1.5 stops under where an 18% gray card
  normally lands (115–125). Raw files recover this, but more exposure helps the shadows.

## Ideas not done yet

- Store the scan start/end as edelkrone pose slots (`device.poses.store()`), which would
  give the device's own planned moves instead of the joystick loop.
- Run contrast autofocus (`nikon_camera_contrast_af`, needs live view) once before a scan.
- Stitch the frames, using the ruler or the logged `actual_inch` for alignment.
- Ask edelkrone support how to reference a SliderPLUS v5 (the support assistant timed out).
