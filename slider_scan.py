"""Overlapping photo scan along the ruler: one Nikon capture per inch.

Calibrated 2026-10-25 from two photos: the ruler mark at the image centre was
21.0" at slide_cm 44.475 and 20.0" at slide_cm 47.058. Higher slide_cm moves
the centre toward lower ruler numbers, 2.54 cm per inch.

    python slider_scan.py              scan 16" to 35", every 1"
    python slider_scan.py 20 25        scan 20" to 25"
    python slider_scan.py 16 35 2      scan 16" to 35", every 2" (the last stop is always included)
    python slider_scan.py 35 16 1.5    any start, stop and interval in inches, either direction

Every position is an absolute target (not a step from the last one), so
errors do not add up.

Each run gets its own folder under RUN_ROOT, named for its start time as
yyyy-mm-ddThh-mm-ss (Windows does not allow ":" in names). The camera saves
each shot as c:\\images\\NNNN.nef; the scan moves it into the run folder as
0.nef, 1.nef, ... in shot order, next to a preview (0.jpg, ...) and
scan_log.csv, which also records each shot's original camera file name.

Stop at any time: Ctrl+C, or the stop button on the slider.
"""
import csv
import os
import sys
import time
from datetime import datetime

import edelkrone

import nikon
import slider_goto

# slide_cm where the image centre read REF_INCH, when the right end read
# slider_goto.MEASURED_RIGHT_END_CM. If the slider's zero has moved since (a new
# right end in slider_calibration.json), shift by the same amount: the ruler is
# fixed relative to the rail's ends.
REF_CM = 47.058 + (slider_goto.RIGHT_END_CM - slider_goto.MEASURED_RIGHT_END_CM)
REF_INCH = 20.0
CM_PER_INCH = 2.54          # higher slide_cm = lower ruler reading
GRAY_CARD_INCH = 32         # the gray card spans 30" to 34"; this shot is centred on it
SETTLE_S = 1.0              # let vibration die down before each capture
RUN_ROOT = r"c:\images"     # run folders go here, next to the camera's own output


def cm_for_inch(inch):
    return REF_CM - (inch - REF_INCH) * CM_PER_INCH


def inch_for_cm(cm):
    return REF_INCH - (cm - REF_CM) / CM_PER_INCH


def plan_stops(start, stop, interval):
    """Ruler positions from start to stop, every interval inches; stop is always included."""
    if interval <= 0:
        raise ValueError("interval must be more than 0")
    direction = 1 if stop >= start else -1
    count = int(abs(stop - start) / interval + 1e-9)
    stops = [round(start + direction * i * interval, 3) for i in range(count + 1)]
    if abs(stops[-1] - stop) > 1e-6:
        stops.append(round(stop, 3))
    return stops


def move_into_run(src, dst, attempts=20):
    """Moves a saved capture into the run folder, waiting while the camera app still holds it."""
    for _ in range(attempts):
        try:
            os.replace(src, dst)
            return dst
        except PermissionError:
            time.sleep(0.25)
    os.replace(src, dst)
    return dst


def main():
    first = float(sys.argv[1]) if len(sys.argv) > 1 else 16
    last = float(sys.argv[2]) if len(sys.argv) > 2 else 35
    step = float(sys.argv[3]) if len(sys.argv) > 3 else 1
    stops = plan_stops(first, last, step)
    for inch in stops:
        cm = cm_for_inch(inch)
        if not (slider_goto.RIGHT_END_CM + slider_goto.MARGIN_CM <= cm
                <= slider_goto.LEFT_END_CM - slider_goto.MARGIN_CM):
            raise SystemExit(f'{inch:g}" needs slide_cm {cm:.2f}, outside the recorded travel')
    out_dir = os.path.join(RUN_ROOT, datetime.now().strftime("%Y-%m-%dT%H-%M-%S"))
    os.makedirs(out_dir)
    log_path = os.path.join(out_dir, "scan_log.csv")
    print(f"run folder: {out_dir}")
    device = edelkrone.connect(mac=slider_goto.MAC)
    try:
        if not device.move.wait_until_idle(timeout=10):
            raise SystemExit("slider is not idle; not moving it")
        with open(log_path, "w", newline="") as f:
            log = csv.writer(f)
            log.writerow(["shot", "target_inch", "target_cm", "actual_cm", "actual_inch",
                          "nef", "preview", "camera_file", "note"])
            for shot, inch in enumerate(stops):
                print(f'\n--- shot {shot} ({shot + 1}/{len(stops)}): {inch:g}"')
                slider_goto.goto(device, cm_for_inch(inch))
                time.sleep(SETTLE_S)
                actual = device.status.pose.slide_cm
                camera_file = nikon.capture()
                nef = move_into_run(camera_file, os.path.join(out_dir, f"{shot}.nef"))
                jpg = nikon.preview(nef, os.path.join(out_dir, f"{shot}.jpg"))
                note = "gray card reference" if inch == GRAY_CARD_INCH else ""
                log.writerow([shot, inch, f"{cm_for_inch(inch):.3f}", f"{actual:.3f}",
                              f"{inch_for_cm(actual):.3f}", nef, jpg,
                              os.path.basename(camera_file), note])
                f.flush()
                print(f'shot {shot}: {nef} (was {os.path.basename(camera_file)}) '
                      f'at {actual:.3f} cm ({inch_for_cm(actual):.2f}")')
    finally:
        device.move.stop()
        device.disconnect()
    print(f"\ndone: {len(stops)} shots, log in {log_path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCtrl+C: stopped")
