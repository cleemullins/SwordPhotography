"""Move the SliderPLUS v5 to a slide_cm position using the joystick.

The SDK has no move-to-position for a slider, so this drives toward the
target, slows down as it gets close and stops within TOLERANCE_CM.

    python slider_goto.py            go to the centre of travel (44.453 cm)
    python slider_goto.py 60.0       go to 60.0 cm

Stop at any time: Ctrl+C, or the stop button on the slider.
"""
import sys
import time

import edelkrone

MAC = "C4:DE:E2:EA:5A:E8"   # Motor Module V3 on the SliderPLUS v5
RIGHT_END_CM = -0.708       # from docs/slider_positions.md
LEFT_END_CM = 89.613
CENTRE_CM = (RIGHT_END_CM + LEFT_END_CM) / 2

FAST = 0.3                  # same cap as xbox_slider.py
SLOW = 0.1                  # within SLOW_ZONE_CM of the target
SLOW_ZONE_CM = 5.0
TOLERANCE_CM = 0.3
MARGIN_CM = 1.0             # refuse targets this close to either end
TIMEOUT_S = 120.0
INTERVAL = 0.1


def goto(device, target):
    deadline = time.monotonic() + TIMEOUT_S
    start = device.status.pose.slide_cm
    print(f"from {start:.3f} cm to {target:.3f} cm")
    # Positive joystick speed raises slide_cm.
    while True:
        here = device.status.pose.slide_cm
        error = target - here
        if abs(error) <= TOLERANCE_CM:
            break
        if not (RIGHT_END_CM - MARGIN_CM <= here <= LEFT_END_CM + MARGIN_CM):
            print(f"\nposition {here:.3f} cm is outside the recorded travel: stopping")
            break
        if time.monotonic() > deadline:
            print(f"\ntook longer than {TIMEOUT_S:.0f} s: stopping")
            break
        speed = FAST if abs(error) > SLOW_ZONE_CM else SLOW
        device.move.joystick(slide=speed if error > 0 else -speed)
        print(f"\rspeed {speed if error > 0 else -speed:+.2f}   at {here:7.3f} cm   ", end="", flush=True)
        time.sleep(INTERVAL)
    device.move.stop()
    print(f"\nstopped at {device.status.pose.slide_cm:.3f} cm (target {target:.3f} cm)")


def main():
    target = float(sys.argv[1]) if len(sys.argv) > 1 else CENTRE_CM
    if not (RIGHT_END_CM + MARGIN_CM <= target <= LEFT_END_CM - MARGIN_CM):
        raise SystemExit(f"target {target} cm is not inside the recorded travel "
                         f"({RIGHT_END_CM} to {LEFT_END_CM} cm, minus {MARGIN_CM} cm at each end)")
    device = edelkrone.connect(mac=MAC)
    try:
        if not device.move.wait_until_idle(timeout=10):
            raise SystemExit("slider is not idle; not moving it")
        goto(device, target)
    finally:
        device.move.stop()
        device.disconnect()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCtrl+C: stopped")
