# SwordPhotography

Overlapping top-down photo scans of long objects (sword boxes, blades) on a motorized
edelkrone slider, with a Nikon camera triggered over MCP and an Xbox controller for
manual positioning.

The first scan (2026-10-25) photographed a wooden box top and a gray card from 16" to 35"
on a ruler, one shot per inch: 20 frames, each about 12" wide, so neighbouring frames
overlap by about 11".

## What's here

| File | What it does |
|---|---|
| [`slider_scan.py`](slider_scan.py) | The scan: moves to each ruler inch, settles, captures, logs |
| [`slider_goto.py`](slider_goto.py) | Moves the slider to a `slide_cm` position (e.g. the centre) |
| [`xbox_slider.py`](xbox_slider.py) | Drive the slider by hand with an Xbox controller's left stick |
| [`nikon.py`](nikon.py) | Nikon MCP client (`capture`) and NEF preview-JPEG extractor (`preview`) |
| [`tools/controller_probe.py`](tools/controller_probe.py) | Diagnoses the Xbox controller: XInput vs raw HID |
| [`docs/INSTRUCTIONS.md`](docs/INSTRUCTIONS.md) | Step-by-step: setup, calibration, running a scan |
| [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md) | Design notes and everything learned getting it working |
| [`docs/slider_positions.md`](docs/slider_positions.md) | Measured slider travel and positions |
| [`docs/example_scan_log.csv`](docs/example_scan_log.csv) | The log from the first scan |

## Quick start

```powershell
pip install -r requirements.txt
$env:NIKON_MCP_TOKEN = "<token from the Nikon MCP server>"
python slider_scan.py            # 16" to 35", one shot per inch
```

Read [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md) first: the ruler calibration in
`slider_scan.py` is only valid for the rig as it was set up, and the slider must be
checked after a power cycle.

## Hardware

- edelkrone **SliderPLUS v5 PRO / Long** with the **Motor Module for SliderPLUS**
  (reports over Bluetooth as `Motor Module V3`, MAC `C4:DE:E2:EA:5A:E8`, firmware 0.46)
- Nikon camera facing straight down, controlled by the **ArcEngineNet10 MCP** server
  (NikonMCP module) on `http://127.0.0.1:<port>/mcp`; the camera saves `c:\images\NNNN.nef`,
  and each scan moves its shots into a run folder `c:\images\yyyy-mm-ddThh-mm-ss\0.nef, 1.nef, ...`
  (see [Run folders and file naming](docs/INSTRUCTIONS.md#run-folders-and-file-naming))
- Xbox Wireless Controller (Xbox One S, Bluetooth, PID `02E0`)
- Black velvet bed, a SAVAGE aluminum ruler along the bottom edge, a gray card
- Windows 11, Python 3.15, edelkrone SDK 0.1.1

## Safety

Every script stops the slider in a `finally` block before disconnecting. Stop any motion
with **Ctrl+C** or the **stop button on the slider**; in `xbox_slider.py`, also **B**.
Keep the rail path clear of people, cables and objects.
