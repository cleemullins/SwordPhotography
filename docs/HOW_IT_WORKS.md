# How it works

Design notes and what was learned setting up the rig on 2026-10-25.

## Overview

```
Xbox controller --(Bluetooth HID)--> xbox_slider.py --+
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

- **XInput does not see the controller on this PC.** `xinput1_4`, `xinput1_3` and
  `xinput9_1_0` all return `ERROR_DEVICE_NOT_CONNECTED` (1167) for all four slots, from
  every process tried (sandboxed shell, the app's terminal, a foreground PowerShell
  window). Windows shows the controller connected, with the standard `xinputhid` filter
  driver, and no remapper (Steam Input, HidHide, ViGEm, DS4Windows) is running.
  Microsoft's **GameInput Redist** service and `GameInputRawInputProxy` are running, along
  with an "XBOX Synthetic Gamepad Bus"; the likely cause is that this stack intercepts
  XInput, but that was not confirmed.
- **Raw HID works.** The controller's HID interface (`VID 045E PID 02E0`) opens with
  `CreateFile` and delivers 16-byte input reports. `xbox_slider.py` reads those directly
  with SetupAPI + `hid.dll` through `ctypes` (no packages needed).
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
  `ReadFile` fails, which Windows does within a few seconds of the link dropping.
- Stick to speed: deadzone 7849 (of 32767), then the remaining travel squared, times
  `MAX_SPEED` (0.3), for fine control near the centre.

## The scan

- **Calibration**: two photos 2.54 cm apart. The ruler value at the image centre went
  from 21.0" (44.475 cm) to 20.0" (47.058 cm): 2.58 cm per 1", within reading error of
  2.54 cm, and higher cm = lower ruler value. `slider_scan.py` uses
  `slide_cm = 47.058 - (inch - 20) * 2.54`, so 16" = 57.218 cm and 35" = 8.958 cm.
- **Absolute targets**: each stop is computed from the calibration, not stepped from the
  last stop, so positioning errors don't accumulate.
- **Per shot**: `goto` (10% speed for 1" steps), wait 1 s for vibration to settle, read
  the actual `slide_cm`, capture, extract the preview, append to `scan_log.csv`.
- **Result** (see [example_scan_log.csv](example_scan_log.csv)): 20 shots, actual centres
  16.05" to 34.97", every shot within 0.05" of its target. Checked by eye: the ruler at the
  image centre matched the target in the 32" and 35" frames.
- **Coverage**: a frame spans about 12" of ruler, so 1" steps overlap by about 11". The box
  top ran from about 16.9" to 27.9"; the gray card sat at about 29.4"–32.8" and is fully
  in the 30"–34" frames. The 32" frame is the gray card reference (`c:\images\0020.nef`).

## Exposure

The gray card looks noticeably brighter in the 35" frame than in the 32" frame, and the
black background shows more lint. Either the camera's automatic exposure changed between
shots or the lighting is uneven across the bed; this wasn't investigated. For color
grading from one gray card shot, set exposure (and white balance) to manual so every
frame is exposed the same way.

## Ideas not done yet

- Store the scan start/end as edelkrone pose slots (`device.poses.store()`), which would
  give the device's own planned moves instead of the joystick loop.
- Run contrast autofocus (`nikon_camera_contrast_af`, needs live view) once before a scan.
- Stitch the frames, using the ruler or the logged `actual_inch` for alignment.
- Ask edelkrone support how to reference a SliderPLUS v5 (the support assistant timed out).
