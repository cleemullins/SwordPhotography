---
name: stitch-run
description: Stitches a scan run's frames into one high-resolution image of the object, using the run's own shot interval. Asks which run (newest by default), which ruler range to stitch, and the blend width, then runs stitch.py, checks the seams and reports.
when_to_use: Use when the user says "Stitch a run", "stitch the last run", "stitch run <name>", "make the stitched image" or "combine the shots".
---

# Stitch a run

Run from the repo root (`C:\git\SwordPhotography`) in PowerShell. Refresh PATH first:
`$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`.
Note: piping one program's output into another in Windows PowerShell adds a byte-order
mark that breaks JSON parsing. Read the JSON output directly instead.

## 1. Find the run

```powershell
python stitch.py runs
```

Lists runs newest first (`c:\images\<run>\` and older ones in the repo's `scan\`), each
with `shots`, `interval_inch`, `range_inch` and any `stitched` outputs it already has.
If the user named a run, use it; otherwise the newest is the default. If there's more than
one run, ask with AskUserQuestion ("Which run should I stitch?"), the newest first and
marked "(Recommended)", the next two as other options, each labelled with its folder name,
interval and range.

```powershell
python stitch.py info <run>\scan_log.csv
```

Read `interval_inch`, `range_inch`, `frames` (with `target_inch` and `note`),
`irregular_steps` and `missing_previews`.

- If `missing_previews` isn't empty, say which shots are missing and stop.
- If `irregular_steps` isn't empty, mention it: the stitch still works (strips meet
  halfway between neighbours), but strip widths will differ.

## 2. Ask what to stitch

The strip width is not a question: each frame's strip runs halfway to its neighbours,
so it always equals the run's interval (e.g. ±1" around each frame centre for a 2" run).
State that in one line.

Ask in one AskUserQuestion call:

1. **Range** ("Which part of the run should I stitch, in ruler inches?", header `Range`).
   Stitch one object at a time: objects at different heights are magnified differently,
   and seams over bare background match poorly. Options: the range of frames covering
   the main object if you can tell from the run (look at the first, middle and last
   previews, or a previous stitch report for the same setup), the whole run
   (`range_inch`), and "Other" for custom from–to. Frames whose `note` is
   `gray card reference` are usually a separate object.
2. **Blend** ("How wide should the cross-fade at each seam be?", header `Blend`).
   Default `min(1/4", interval/4)` "(Recommended)"; also offer half that, and "None"
   (hard seams, 0).

Only ask about `--end` (how far the outer strips reach past the first and last frame
centres, default half the interval) or `--margin` (space around the object, default
1/4") if the user brings it up.

## 3. Stitch

```powershell
python stitch.py <run>\scan_log.csv --from <from> --to <to> --blend <blend>
```

It writes `stitched_<from>-<to>in.tif` (full resolution), `..._preview.jpg`,
`..._seams.jpg` (400 px full-resolution crops centred on each seam) and
`..._report.json` in the run folder, and prints the report.

If it exits with "cannot register shots ...", the interval is too wide for the frame or
the object doesn't reach into both frames: tell the user, and suggest a narrower range.

## 4. Check before reporting

- Read the report: every seam's `score` and `weak_seams`. A seam under 0.6 is
  unreliable; name it (shots and inches) and suggest leaving that end out of the range.
- `dx_px` should be nearly the same for every full-interval step (the last step can be
  shorter); one that differs by more than about 2% suggests a bad match.
- Open `..._preview.jpg` and `..._seams.jpg` with Read and look: the object's edges and
  texture should run straight through the middle of each seam crop, with no doubling or
  step.

## 5. Report

Give the full path of the `.tif`, its size in pixels and inches, the scale
(`object_px_per_inch`), the number of frames and seams, the worst seam score, and
anything that needs attention (weak seams, irregular steps, a visible seam). Mention
that the image is built from the frames' embedded JPEG previews (8-bit, camera-processed);
a raw-based version needs the frames converted to 16-bit TIFFs with identical settings.
