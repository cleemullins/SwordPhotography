"""Overlapping photo scan along the ruler: one Nikon capture per inch.

Calibrated 2026-10-25 from two photos: the ruler mark at the image centre was
21.0" at slide_cm 44.475 and 20.0" at slide_cm 47.058. Higher slide_cm moves
the centre toward lower ruler numbers, 2.54 cm per inch.

    python slider_scan.py              scan 16" to 35", every 1"
    python slider_scan.py 20 25        scan 20" to 25"

Every position is an absolute target (not a step from the last one), so
errors do not add up. Results go to scan/scan_log.csv and scan/*.jpg.
Stop at any time: Ctrl+C, or the stop button on the slider.
"""
import csv
import os
import sys
import time

import edelkrone

import nikon
import slider_goto

REF_CM = 47.058             # slide_cm where the image centre read REF_INCH
REF_INCH = 20.0
CM_PER_INCH = 2.54          # higher slide_cm = lower ruler reading
GRAY_CARD_INCH = 32         # the gray card spans 30" to 34"; this shot is centred on it
SETTLE_S = 1.0              # let vibration die down before each capture
OUT_DIR = "scan"


def cm_for_inch(inch):
    return REF_CM - (inch - REF_INCH) * CM_PER_INCH


def inch_for_cm(cm):
    return REF_INCH - (cm - REF_CM) / CM_PER_INCH


def main():
    first = int(sys.argv[1]) if len(sys.argv) > 1 else 16
    last = int(sys.argv[2]) if len(sys.argv) > 2 else 35
    stops = list(range(first, last + 1))
    for inch in stops:
        cm = cm_for_inch(inch)
        if not (slider_goto.RIGHT_END_CM + slider_goto.MARGIN_CM <= cm
                <= slider_goto.LEFT_END_CM - slider_goto.MARGIN_CM):
            raise SystemExit(f'{inch}" needs slide_cm {cm:.2f}, outside the recorded travel')
    os.makedirs(OUT_DIR, exist_ok=True)
    log_path = os.path.join(OUT_DIR, "scan_log.csv")
    device = edelkrone.connect(mac=slider_goto.MAC)
    try:
        if not device.move.wait_until_idle(timeout=10):
            raise SystemExit("slider is not idle; not moving it")
        with open(log_path, "w", newline="") as f:
            log = csv.writer(f)
            log.writerow(["shot", "target_inch", "target_cm", "actual_cm", "actual_inch", "nef", "preview", "note"])
            for shot, inch in enumerate(stops, 1):
                print(f'\n--- shot {shot}/{len(stops)}: {inch}"')
                slider_goto.goto(device, cm_for_inch(inch))
                time.sleep(SETTLE_S)
                actual = device.status.pose.slide_cm
                nef = nikon.capture()
                note = "gray card reference" if inch == GRAY_CARD_INCH else ""
                name = f"scan_{shot:02d}_{inch}in" + ("_graycard" if note else "") + ".jpg"
                jpg = nikon.preview(nef, os.path.join(OUT_DIR, name))
                log.writerow([shot, inch, f"{cm_for_inch(inch):.3f}", f"{actual:.3f}",
                              f"{inch_for_cm(actual):.3f}", nef, jpg, note])
                f.flush()
                print(f'captured {nef} at {actual:.3f} cm ({inch_for_cm(actual):.2f}")')
    finally:
        device.move.stop()
        device.disconnect()
    print(f"\ndone: {len(stops)} shots, log in {log_path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCtrl+C: stopped")
