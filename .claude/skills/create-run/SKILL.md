---
name: create-run
description: Sets up and starts a photo scan run on the SwordPhotography rig (edelkrone slider + Nikon MCP camera). Asks for the Nikon MCP API key if it isn't stored yet, on the first run checks the slider's calibration (driving to both rail ends with the Xbox controller if needed), then asks the ruler start, stop and shot interval in inches with the last run's answers as defaults, confirms and runs slider_scan.py.
when_to_use: Use when the user says "Create a run", "create a run", "new run", "start a run", "set up a run" or "do another scan".
---

# Create a run

Walk the user through these questions, then start the scan. All commands run from the
repo root (`C:\git\SwordPhotography`) in PowerShell. Python and Git may not be on PATH
in your shell; refresh it first with
`$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`.

## 1. Load what's already known

```powershell
python run_config.py show
```

It prints JSON: `token_set` (true/false, never the token itself) and `defaults`, the
`start`, `stop` and `interval` from the last run (empty the first time).

## 2. API key (only if `token_set` is false)

Ask in chat, in one short message, for the Nikon MCP server's API key (the bearer token
shown by the ArcEngineNet10 MCP server), and wait for the reply. Don't ask again once it's
stored. Store it without echoing it back:

```powershell
'<token>' | python run_config.py set-token
```

This saves it in the Windows user environment variable `NIKON_MCP_TOKEN`; `nikon.py`
reads it from there whenever it needs it. Never write the token into a file in the repo,
and never repeat it in chat. If the user asks to change the key, run `set-token` again.

## 3. Slider calibration (first run only)

Do this step on the **first run**: the first time this skill runs in the current Claude
conversation, or whenever the user says the slider was switched off or the rig was moved.
Otherwise skip to step 4.

Make sure nothing else is connected to the slider (see the end of this file), then:

```powershell
python run_config.py slider-status
```

It connects (nothing moves) and prints JSON with `is_calibrated`, `slide_cm`,
`activity`, `battery_percent` and the rail ends in use.

- If `is_calibrated` is **true**, say so in one line and go to step 4.
- If it's **false** (this SliderPLUS v5 always reports false: the SDK has no command to
  reference a slider), calibrate the rail's ends with the Xbox controller:

  1. Tell the user: the slider isn't calibrated, so they'll drive it to each end of the
     rail with the Xbox controller's left stick (right on the stick moves the carriage
     right; ease off near the end; B or Ctrl+C quits). Ask them to check the rail path is
     clear and close the edelkrone phone app.
  2. Start the controller program in a Terminal panel tab titled `Xbox slider control`:
     `python xbox_slider.py`. Read the tab to confirm it printed `connected at ... cm`.
     Tell the user to click into that tab before using the stick: when Windows runs the
     controller as an XInput gamepad, the stick only reaches the program while its
     window has focus (otherwise it may move the mouse pointer).
     If it's stuck on `waiting for the Xbox controller`, ask the user to press the Xbox
     button; see docs/INSTRUCTIONS.md troubleshooting if that doesn't help.
  3. Ask with AskUserQuestion: "Drive the slider all the way to the RIGHT end, then tell
     me." Options: `It's at the right end`, `Cancel`.
  4. Read the tab's last line (`speed +0.00   at <cm> cm`): that is the right end. Check
     the speed shown is `+0.00` (stopped); if not, ask the user to let go of the stick and
     read again.
  5. Same for the **LEFT** end: AskUserQuestion "Drive the slider all the way to the LEFT
     end, then tell me." Read the position the same way. The left end must read higher
     than the right end; if not, ask the user to check they went to the right ends.
  6. Stop the controller program (`stop_terminal_tab` on that tab: Ctrl+C stops the
     slider and disconnects), and wait for `Ctrl+C: stopped` before going on.
  7. Store the ends:

     ```powershell
     python run_config.py set-ends <right_cm> <left_cm>
     ```

     It prints `travel_cm`, `travel_change_cm`, `right_end_moved_cm` and
     `ruler_offset_cm`. Tell the user the travel and how far the ends moved.
     - The rail's travel should stay about 90.32 cm. If `travel_change_cm` is more than
       about 0.5 cm either way, say the reading looks off and offer to redo the ends.
     - If the right end moved (e.g. after a power cycle), the scan shifts its ruler
       positions by `ruler_offset_cm` automatically. This assumes the camera and ruler
       haven't moved; if they have, the ruler calibration must be redone
       (docs/INSTRUCTIONS.md, step 4) before scanning.

  If the user cancels, stop the controller program and don't start a run.

## 4. Start, stop and interval

Ask all three in **one** AskUserQuestion call, three questions, each with
`multiSelect: false`:

1. **Start** ("Where on the ruler should the run start, in inches?", header `Start`)
2. **Stop** ("Where on the ruler should the run stop, in inches?", header `Stop`)
3. **Interval** ("How far should the slider move between shots, in inches?", header `Interval`)

For each question:
- If there's a saved default, make it the first option, labelled e.g.
  `16" (last run) (Recommended)`.
- Add one or two other sensible options (start/stop: 16" and 35", the full box and gray
  card; interval: 1" and 2"), without duplicating the default.
- The user can always pick "Other" and type any number. Accept inches with or without
  `"`, and fractions like 1.5.

## 5. Check the plan

```powershell
python run_config.py plan <start> <stop> <interval>
```

It prints JSON with `ok`, `shots`, `stops_inch`, `stops_cm`, `reachable_inch`,
`outside_travel`, `includes_gray_card` and `estimated_minutes`.

- If `ok` is false, tell the user which stops are outside the slider's reach
  (`reachable_inch`) and go back to step 4.
- The frame is about 12" wide, so an interval over about 10" leaves gaps between shots:
  warn the user and ask again if so.

## 6. Confirm the motion, then save and run

The edelkrone safety rules require describing the motion and getting an explicit go-ahead
before anything moves. In one short message, state: the first stop and its `slide_cm`
(the slider first travels there at 30% speed), the number of shots and the inch stops,
the interval, that each step runs at 10% speed with a 1 s settle, whether the gray card
(32") is one of the stops, the estimated time, where the run folder will be
(`c:\images\yyyy-mm-ddThh-mm-ss\`, see docs/INSTRUCTIONS.md, "Run folders and file
naming"), and that Ctrl+C in the terminal tab or the slider's stop button stops it.
Ask with AskUserQuestion: "Is the rail path clear? Start the run?" with options
`Start the run` and `Change something`.

On `Start the run`:

```powershell
python run_config.py save <start> <stop> <interval>
```

then start the scan in a Terminal panel tab (`run_in_terminal`) so the user can press
Ctrl+C, titled e.g. `run 16-35 every 2in`:

```
python slider_scan.py <start> <stop> <interval>
```

Don't put the token on the command line: `nikon.py` reads it from the user environment.

On `Change something`, go back to step 4 with the new answers as defaults.

## 7. Watch and report

The scan prints `run folder: ...` first. Wait for it to finish without polling in a
tight loop (for example, a background command that waits until `scan_log.csv` in that
folder has one row per shot). Then report: the run folder, the number of shots, the
largest gap between `target_inch` and `actual_inch` in `scan_log.csv`, and which shot
number is the gray card reference (the `note` column). If the scan stopped early, show
the last lines of the terminal tab and say what failed.

Before starting, if `slider_scan.py`, `xbox_slider.py` or `slider_goto.py` is already
running in another tab, tell the user: the slider accepts only one connection, so that
program must be quit first.
