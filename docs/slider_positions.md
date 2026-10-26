# edelkrone SliderPLUS v5 positions

Device: SliderPLUS v5 PRO / Long, driven by Motor Module V3 (`C4:DE:E2:EA:5A:E8`), firmware 0.46.
Positions are `device.status.pose.slide_cm` as reported by the edelkrone SDK (0.1.1).

| Name | slide_cm | Recorded | How |
|---|---|---|---|
| Far right (end of rail) | **-0.708** | 2026-10-25 | Driven to the end with the Xbox controller, then read while stopped |
| Far left (end of rail) | **89.613** | 2026-10-25 | Driven to the end with the Xbox controller, then read while stopped |

Total travel: **90.321 cm** (89.613 − (−0.708)). Centre of travel: **44.453 cm**.

## Notes

- Direction: moving the carriage **right lowers** `slide_cm`; moving left raises it.
- Xbox control: `xbox_slider.py` uses `INVERT = True` so pushing the stick right moves the carriage right.
- The slider reported `is_calibrated: false` when these were recorded. The SDK has no command to
  reference a slider, and its cm scale may not survive a power cycle: after switching the slider
  off and on, check a known position (for example drive to the far right again) before trusting these numbers.
- Other positions seen: 27.8 cm at first connection; 33.36 cm after the first Xbox session.
