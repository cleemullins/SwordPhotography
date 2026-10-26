# Instructions

How to set up the rig and reproduce a scan. Commands are PowerShell, run from the repo root.

## 1. One-time setup

1. Install Python 3.11 or newer (3.15 was used) and tick **Add python.exe to PATH**.
   If `python` opens the Microsoft Store, turn off the alias under
   Settings > Apps > Advanced app settings > App execution aliases.
2. Install the edelkrone SDK:

   ```powershell
   pip install -r requirements.txt
   ```

3. Pair the Xbox controller over Bluetooth (Settings > Bluetooth & devices). No extra
   driver or package is needed: `xbox_slider.py` reads it as raw HID.

## 2. Before each session

1. Switch on the slider and **close the edelkrone phone app**: a slider connected to the
   app (or to another script) does not advertise and is not found.
2. Start the Nikon MCP server (ArcEngineNet10). Note its port and bearer token; the port
   can change between runs.

   ```powershell
   $env:NIKON_MCP_TOKEN = "<bearer token>"
   $env:NIKON_MCP_URL   = "http://127.0.0.1:<port>/mcp"   # only if not 50507
   ```

3. Check the camera is connected and ready (`isConnected`, `canCapture`):

   ```powershell
   python -c "import nikon; print(nikon.call('nikon_camera_get_state'))"
   ```

4. Check the slider is found (this only scans, nothing moves):

   ```powershell
   python -m edelkrone.examples.read_device
   ```

   Expect `Motor Module V3 C4:DE:E2:EA:5A:E8`, layout `slide_only`, axis `slide`.

5. **After a power cycle**, the slider reports `is_calibrated: false` and its `slide_cm`
   scale may have moved. Drive to the far right end (see 3) and check it reads about
   **-0.7 cm**. If it doesn't, re-measure the ends and redo the ruler calibration (step 4).

## 3. Manual positioning with the Xbox controller

```powershell
python xbox_slider.py --controller-only   # check the stick, no slider
python xbox_slider.py                     # drive the slider
```

- Left stick left/right moves the carriage, up to `MAX_SPEED` (30%). Releasing it stops.
- **B** or **Ctrl+C** stops and quits.
- Pushing right moves the carriage right (`INVERT = True`); right is **lower** `slide_cm`.
- Only one program can be connected to the slider at a time: quit this before running
  `slider_goto.py` or `slider_scan.py`.

Move to a known position without the controller:

```powershell
python slider_goto.py          # centre of travel, 44.453 cm
python slider_goto.py 20.5     # any slide_cm inside the travel
```

## 4. Ruler calibration

`slider_scan.py` converts ruler inches to `slide_cm` with two constants, `REF_CM` and
`REF_INCH`. Redo them whenever the camera, ruler or slider is moved, or the slider's
scale has shifted after a power cycle.

1. Move the slider so the ruler is near the image centre, e.g. `python slider_goto.py 44.5`.
2. Take a picture and extract a preview:

   ```powershell
   $nef = python nikon.py capture
   python nikon.py preview $nef
   ```

3. Open the `_preview.jpg` and read the ruler value at the **horizontal centre** of the
   image. Note the slider position (`slide_cm`, printed by `slider_goto.py`).
4. Move exactly 2.54 cm toward higher `slide_cm` (`python slider_goto.py <cm + 2.54>`),
   capture again and read the centre again. It should be **1.0" lower**. If the change is
   not 1", or goes the other way, adjust `CM_PER_INCH` or its sign in `slider_scan.py`.
5. Put the second reading into `slider_scan.py`: `REF_CM` = its `slide_cm`,
   `REF_INCH` = its ruler value.

The 2026-10-25 calibration: centre read **21.0" at 44.475 cm** and **20.0" at 47.058 cm**,
so `REF_CM = 47.058`, `REF_INCH = 20.0`, `CM_PER_INCH = 2.54`.

Reading the ruler: in a 6048 px wide frame at this camera height, inch marks are about
505 px apart (about 167 px in a 2000 px wide preview), so a frame spans about 12".

## 5. Running a scan

### With Claude Code: "Create a run"

Open Claude Code in this folder and say **"Create a run"**. The `create-run` skill
(`.claude/skills/create-run/SKILL.md`) walks through:

1. **API key**, only if it isn't stored yet. It's saved in the Windows user environment
   variable `NIKON_MCP_TOKEN` (`run_config.py set-token`), which `nikon.py` reads when it
   needs it. It is never written to the repo.
2. **Slider calibration, on the first run** (first run in a Claude conversation, or after
   the slider was switched off or the rig moved). It reads the slider's status; this
   SliderPLUS v5 always reports `is_calibrated: false`, so it starts `xbox_slider.py` and
   has you drive to the far right, then the far left. The two readings are stored in
   `slider_calibration.json` (`run_config.py set-ends`). If the slider's zero moved, the
   scan shifts its ruler positions by the same amount.
3. **Start, stop and interval** in ruler inches, offering the last run's answers
   (`run_defaults.json`) as defaults. Any numbers work, including fractions and a start
   higher than the stop.
4. **Check and confirm**: it checks every stop is within the slider's reach, describes
   the motion, and waits for your go-ahead before anything moves.
5. **Run and report**: `slider_scan.py` in a terminal tab (Ctrl+C stops it), then a
   summary of the run folder and positioning accuracy.

`run_defaults.json` and `slider_calibration.json` are per-machine and not committed.

### By hand

1. Clear the rail path. Check the gray card and object are where you expect on the ruler.
2. Lock the camera: **manual focus, aperture, shutter speed, ISO and white balance**
   (5600K was used). Anything left on auto changes from frame to frame; see "Exposure and
   white balance" in HOW_IT_WORKS.md.
3. Run:

   ```powershell
   python slider_scan.py              # 16" to 35", every 1" (20 shots)
   python slider_scan.py 16 35 2      # every 2" (11 shots; the last stop is always included)
   python slider_scan.py 18 30        # any inch range
   ```

   The scan moves to the first stop at 30% speed, then steps at 10% speed, waits 1 s to
   settle, captures, moves the file into the run folder, and logs. 20 shots take about
   2–3 minutes.
4. Results: one run folder, see "Run folders and file naming" below.
5. Check a few previews: the ruler value at the image centre should match `target_inch`
   in the log.

### Run folders and file naming

Every run of `slider_scan.py` is stored in its **own folder**, and the images inside it
are named **only by their shot number**:

```
c:\images\
  2026-10-25T21-51-11\        <- one run, named for its start time
    0.nef   0.jpg             <- shot 0: raw file and its preview
    1.nef   1.jpg
    2.nef   2.jpg
    ...
    scan_log.csv              <- one row per shot
```

- **Folder name**: the run's start time as `yyyy-mm-ddThh-mm-ss` (local time, 24-hour).
  This is ISO 8601 with `-` instead of `:` between hours, minutes and seconds, because
  Windows does not allow `:` in file or folder names. Names sort in time order.
- **File names**: `0`, `1`, `2`, ... in shot order, starting at 0, with no padding and no
  inch or label in the name. `N.nef` is the raw file, `N.jpg` its preview.
- **Where the details are**: `scan_log.csv` maps each shot number to its ruler position
  (`target_inch`, `actual_inch`), slider position (`target_cm`, `actual_cm`), the camera's
  original file name (`camera_file`, e.g. `0045.nef`) and notes. The shot centred on the
  gray card (32") is marked `gray card reference` in the `note` column.
- **How it's done**: the Nikon MCP server cannot choose where it saves (its tools take no
  arguments), so the camera still writes `c:\images\NNNN.nef`. Right after each capture,
  `slider_scan.py` moves that file into the run folder and renames it. The run folder must
  be on the same drive as `c:\images` for the move to be instant.
- `RUN_ROOT` at the top of `slider_scan.py` sets where run folders are created
  (default `c:\images`).

Runs made before this convention (2026-10-25, before 21:58) left their raw files as
`c:\images\0004.nef` ... `0047.nef` and their previews in the repo's `scan\` folder.

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Slider not found | Close the edelkrone app and any other script; switch the slider off and on |
| `slider is not idle` | Wait: a slider may run a movement of its own after power-on |
| Controller "waiting..." forever | Wake it (Xbox button); run `python tools/controller_probe.py` |
| Camera capture times out | Check `nikon_camera_get_state`: connected, `canCapture: true`; check the MCP port |
| Slider stops early in a scan | The `slide_cm` moved outside the recorded travel: re-measure the ends |
