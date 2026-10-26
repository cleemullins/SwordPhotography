"""Stitch the centre strips of a scan run into one image of the object.

    python stitch.py runs                    list the runs found, newest first (JSON)
    python stitch.py info RUN_LOG            what a run contains: frames, interval, range (JSON)
    python stitch.py RUN_LOG [options]       stitch it

Options (all optional; defaults come from the run itself):
    --from INCH --to INCH   ruler range of frame centres to use (default: the whole run)
    --end INCH              how far the outer strips reach past the first/last frame centre
                            (default: half the interval)
    --blend INCH            cross-fade width at each seam (default: 1/4" or a quarter of the
                            interval, whichever is smaller)
    --margin INCH           space kept around the object when cropping (default 0.25)
    --out PATH              output path without extension (default: next to the log,
                            stitched_<from>-<to>in)

How it works
- The interval between shots is read from the log (target_inch). Each frame
  contributes the strip around its own centre column, and neighbouring strips meet
  halfway between the two frame centres, so the strip width always equals the
  interval: no gaps, and the narrowest strips the run allows.
- Frames are placed by registering neighbours on the object itself, not by the
  ruler or slider positions: the object sits above the bed, closer to the camera, so
  it is magnified more than the ruler. A coarse phase correlation of the whole frames
  finds the shift whatever the lens or interval; template matching on the object then
  refines it (x and y) to sub-pixel.
- The object is found as the bright area against the black velvet.
- Stitch one object at a time. Objects at different heights are magnified
  differently (on 2026-10-25: box top ~529 px/in, gray card on the bed ~513 px/in),
  and a seam over mostly background matches poorly; such seams are listed in the
  report as weak_seams (score below WEAK_SEAM_SCORE).

Writes OUT.tif (full resolution), OUT_preview.jpg (quarter size), OUT_seams.jpg
(400 px full-resolution crops centred on each seam) and OUT_report.json.
"""
import argparse
import csv
import glob
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RUN_DIRS = [r"c:\images\*", os.path.join(HERE, "scan", "*")]
OBJECT_THRESHOLD = 20         # grey level separating the object (dark grain dips to ~50) from black velvet (~3)
COARSE_SCALE = 4              # downsampling for the coarse shift
SEARCH_PX = 60                # refine search window around the coarse shift, each way (full resolution)
MIN_OVERLAP_PX = 300          # least shared object width two neighbours need to be registered
WEAK_SEAM_SCORE = 0.6         # below this the match is unreliable (e.g. mostly background between objects)


# --- Runs -------------------------------------------------------------------

def read_log(log_path):
    with open(log_path, newline="") as f:
        return list(csv.DictReader(f))


def preview_path(log_path, row):
    path = row["preview"]
    base = os.path.dirname(os.path.abspath(log_path))
    for candidate in (path, os.path.join(base, os.path.basename(path)), os.path.join(HERE, path)):
        if os.path.exists(candidate):
            return candidate
    return None


def run_info(log_path):
    rows = read_log(log_path)
    targets = [float(r["target_inch"]) for r in rows]
    actual = [float(r["actual_inch"]) for r in rows]
    steps = [abs(b - a) for a, b in zip(targets, targets[1:])]
    interval = float(np.median(steps)) if steps else None
    # The last step can be shorter (the stop is always included); anything else is irregular.
    irregular = [round(s, 3) for s in steps[:-1] if interval and abs(s - interval) > 0.01]
    missing = [r["shot"] for r in rows if not preview_path(log_path, r)]
    return {
        "log": os.path.abspath(log_path),
        "run": os.path.basename(os.path.dirname(os.path.abspath(log_path))),
        "shots": len(rows),
        "interval_inch": interval,
        "irregular_steps": irregular,
        "range_inch": [min(targets), max(targets)] if targets else None,
        "frames": [{"shot": r["shot"], "target_inch": t, "actual_inch": a, "note": r.get("note", "")}
                   for r, t, a in zip(rows, targets, actual)],
        "missing_previews": missing,
        "stitched": sorted(os.path.basename(p) for p in
                           glob.glob(os.path.join(os.path.dirname(os.path.abspath(log_path)), "stitched*.tif"))),
    }


def list_runs():
    logs = []
    for pattern in RUN_DIRS:
        logs += glob.glob(os.path.join(pattern, "scan_log.csv"))
    logs.sort(key=os.path.getmtime, reverse=True)
    runs = []
    for log in logs:
        info = run_info(log)
        runs.append({k: info[k] for k in ("run", "log", "shots", "interval_inch", "range_inch", "stitched")})
    return runs


# --- Registration -----------------------------------------------------------

def object_rows(gray):
    """Rows covered by the object: the longest bright run above the ruler."""
    h, w = gray.shape
    band = gray[:, w // 3: 2 * w // 3]
    bright = (np.median(band, axis=1) > OBJECT_THRESHOLD).astype(np.int8)
    bright[int(h * 0.72):] = 0          # the ruler runs along the bottom
    best, start = (0, 0), None
    for y, b in enumerate(bright):
        if b and start is None:
            start = y
        if (not b or y == h - 1) and start is not None:
            end = y if not b else y + 1
            if end - start > best[1] - best[0]:
                best = (start, end)
            start = None
    if best[1] - best[0] < h // 20:
        return 0, int(h * 0.72)         # no clear object: use everything above the ruler
    return best


def coarse_shift(a, b, rows):
    """Whole-object shift from phase correlation of downsampled frames."""
    s = COARSE_SCALE
    a_small = cv2.resize(a[rows[0]:rows[1]], None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA)
    b_small = cv2.resize(b[rows[0]:rows[1]], None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA)
    window = cv2.createHanningWindow(a_small.shape[::-1], cv2.CV_32F)
    (sx, sy), response = cv2.phaseCorrelate(np.float32(b_small), np.float32(a_small), window)
    return sx * s, sy * s, response


def refine_shift(a, b, coarse, rows):
    """Template matching on the object around the coarse shift.

    Returns (dx, dy, score): a pixel at (x, y) in A is at (x - dx, y - dy) in B.
    """
    h, w = a.shape
    cdx, cdy = coarse
    # Columns of A that B also sees, and where A shows the object.
    ov0, ov1 = int(max(0, cdx)) + SEARCH_PX, int(min(w, w + cdx)) - SEARCH_PX
    obj = np.where(np.median(a[rows[0]:rows[1]], axis=0) > OBJECT_THRESHOLD)[0]
    lo, hi = max(ov0, obj.min() + 20 if obj.size else ov0), min(ov1, obj.max() - 20 if obj.size else ov1)
    if hi - lo < MIN_OVERLAP_PX:
        raise ValueError(f"only {max(0, hi - lo)} px of shared object between neighbours")
    tw = int(min(hi - lo, w // 8))
    x0 = (lo + hi) // 2 - tw // 2
    th = (rows[1] - rows[0]) - 2 * SEARCH_PX
    y0 = rows[0] + SEARCH_PX
    template = a[y0:y0 + th, x0:x0 + tw]
    bx0 = int(round(x0 - cdx)) - SEARCH_PX
    by0 = int(round(y0 - cdy)) - SEARCH_PX
    bx0c, by0c = max(0, bx0), max(0, by0)
    search = b[by0c:by0 + th + 2 * SEARCH_PX, bx0c:bx0 + tw + 2 * SEARCH_PX]
    score = cv2.matchTemplate(search, template, cv2.TM_CCOEFF_NORMED)
    _, peak, _, (px, py) = cv2.minMaxLoc(score)

    def subpixel(values, i):
        if 0 < i < len(values) - 1:
            l, c, r = values[i - 1], values[i], values[i + 1]
            denom = l - 2 * c + r
            return i + (0.5 * (l - r) / denom if denom else 0.0)
        return float(i)

    bx = bx0c + subpixel(score[py, :], px)
    by = by0c + subpixel(score[:, px], py)
    return float(x0 - bx), float(y0 - by), float(peak)


# --- Stitching --------------------------------------------------------------

def seam_montage(image, seam_xs, half=200):
    crops = []
    for x in seam_xs:
        x = int(round(x))
        crop = image[:, max(0, x - half):x + half]
        if crop.shape[1] < 2 * half:
            crop = cv2.copyMakeBorder(crop, 0, 0, 0, 2 * half - crop.shape[1], cv2.BORDER_CONSTANT)
        crops.append(cv2.copyMakeBorder(crop, 0, 0, 4, 4, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
    return np.hstack(crops) if crops else None


def stitch(log_path, first=None, last=None, end=None, blend=None, margin=0.25, out=None):
    info = run_info(log_path)
    interval = info["interval_inch"]
    if not interval:
        raise SystemExit("the run has fewer than two shots")
    first = info["range_inch"][0] if first is None else first
    last = info["range_inch"][1] if last is None else last
    end = interval / 2 if end is None else end
    blend = min(0.25, interval / 4) if blend is None else blend

    rows_log = [r for r in read_log(log_path) if first - 1e-6 <= float(r["target_inch"]) <= last + 1e-6]
    rows_log.sort(key=lambda r: float(r["target_inch"]))
    if len(rows_log) < 2:
        raise SystemExit(f"need at least two frames between {first:g}\" and {last:g}\"")
    frames = []
    for r in rows_log:
        path = preview_path(log_path, r)
        if not path:
            raise SystemExit(f"preview for shot {r['shot']} not found: {r['preview']}")
        frames.append({"shot": r["shot"], "inch": float(r["actual_inch"]), "target": float(r["target_inch"]),
                       "path": path})
    out = out or os.path.join(os.path.dirname(os.path.abspath(log_path)), f"stitched_{first:g}-{last:g}in")

    images = [cv2.imread(fr["path"], cv2.IMREAD_COLOR) for fr in frames]
    grays = [cv2.cvtColor(im, cv2.COLOR_BGR2GRAY) for im in images]
    h, w = grays[0].shape
    mid = len(frames) // 2
    rows = object_rows(grays[mid])

    offsets, seams = [(0.0, 0.0)], []
    for i in range(len(frames) - 1):
        d_inch = frames[i + 1]["inch"] - frames[i]["inch"]
        cdx, cdy, response = coarse_shift(grays[i], grays[i + 1], rows)
        try:
            dx, dy, score = refine_shift(grays[i], grays[i + 1], (cdx, cdy), rows)
        except ValueError as e:
            raise SystemExit(f'cannot register shots {frames[i]["shot"]} and {frames[i + 1]["shot"]} '
                             f'({frames[i]["target"]:g}" and {frames[i + 1]["target"]:g}"): {e}. '
                             "The interval may be too wide for the frame, or the object doesn't reach "
                             "into both frames: narrow the range with --from/--to.")
        offsets.append((offsets[-1][0] + dx, offsets[-1][1] + dy))
        seams.append({"shots": [frames[i]["shot"], frames[i + 1]["shot"]],
                      "inches": [frames[i]["inch"], frames[i + 1]["inch"]],
                      "dx_px": round(dx, 2), "dy_px": round(dy, 2),
                      "coarse_px": [round(cdx, 1), round(cdy, 1)], "coarse_response": round(response, 3),
                      "score": round(score, 4), "px_per_inch": round(dx / d_inch, 2)})
    px_per_inch = float(np.median([abs(s["px_per_inch"]) for s in seams]))

    # Strips: each frame's centre column +/- halfway to its neighbours; the outer strips
    # reach `end` inches past the first and last centres.
    centres = [w / 2 + ox for ox, _ in offsets]
    end_px = end * px_per_inch
    bounds = [centres[0] - end_px] + [(a + b) / 2 for a, b in zip(centres, centres[1:])] + [centres[-1] + end_px]
    blend_px = blend * px_per_inch
    min_oy, max_oy = min(o[1] for o in offsets), max(o[1] for o in offsets)
    left = int(np.floor(bounds[0] - blend_px))
    width = int(np.ceil(bounds[-1] + blend_px)) - left
    top = int(np.floor(min_oy))
    height = h + int(np.ceil(max_oy - min_oy)) + 1
    acc = np.zeros((height, width, 3), np.float32)
    wsum = np.zeros((1, width, 1), np.float32)
    xs = np.arange(width, dtype=np.float32) + left

    for i, (im, (ox, oy)) in enumerate(zip(images, offsets)):
        lo, hi = bounds[i], bounds[i + 1]
        if i == 0:
            ramp_lo = (xs >= lo).astype(np.float32)
        else:
            ramp_lo = np.clip((xs - (lo - blend_px / 2)) / blend_px, 0, 1)
        if i == len(images) - 1:
            ramp_hi = (xs <= hi).astype(np.float32)
        else:
            ramp_hi = np.clip(((hi + blend_px / 2) - xs) / blend_px, 0, 1)
        weight = (ramp_lo * ramp_hi).astype(np.float32)
        cols = np.where(weight > 0)[0]
        c0, c1 = cols.min(), cols.max() + 1
        m = np.float32([[1, 0, ox - left - c0], [0, 1, oy - top]])
        piece = cv2.warpAffine(im, m, (c1 - c0, height), flags=cv2.INTER_LANCZOS4,
                               borderMode=cv2.BORDER_CONSTANT)
        acc[:, c0:c1] += piece.astype(np.float32) * weight[None, c0:c1, None]
        wsum[:, c0:c1] += weight[None, c0:c1, None]
    canvas = np.clip(acc / np.maximum(wsum, 1e-6), 0, 255).astype(np.uint8)

    # Crop to the object plus a margin (or to the strips, if no object stands out).
    g = cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY)
    r0 = int(rows[0] + offsets[mid][1] - top)
    r1 = int(rows[1] + offsets[mid][1] - top)
    obj_cols = np.where(np.median(g[r0:r1], axis=0) > OBJECT_THRESHOLD)[0]
    m_px = int(margin * px_per_inch)
    y0, y1 = max(0, r0 - m_px), min(height, r1 + m_px)
    if obj_cols.size:
        x0, x1 = max(0, obj_cols.min() - m_px), min(width, obj_cols.max() + 1 + m_px)
    else:
        x0, x1 = int(bounds[0] - left), int(bounds[-1] - left)
    result = canvas[y0:y1, x0:x1]
    seam_xs = [b - left - x0 for b in bounds[1:-1]]

    cv2.imwrite(out + ".tif", result)
    cv2.imwrite(out + "_preview.jpg", cv2.resize(result, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA),
                [cv2.IMWRITE_JPEG_QUALITY, 92])
    montage = seam_montage(result, [x for x in seam_xs if 0 <= x < result.shape[1]])
    if montage is not None:
        cv2.imwrite(out + "_seams.jpg", montage, [cv2.IMWRITE_JPEG_QUALITY, 92])
    report = {
        "log": os.path.abspath(log_path),
        "interval_inch": interval, "from_inch": first, "to_inch": last,
        "end_inch": end, "blend_inch": blend, "margin_inch": margin,
        "frames": [{"shot": fr["shot"], "target_inch": fr["target"], "actual_inch": fr["inch"],
                    "offset_px": [round(o[0], 2), round(o[1], 2)]} for fr, o in zip(frames, offsets)],
        "seams": seams,
        "worst_seam_score": min(s["score"] for s in seams),
        "weak_seams": [{"shots": s["shots"], "inches": s["inches"], "score": s["score"]}
                       for s in seams if s["score"] < WEAK_SEAM_SCORE],
        "object_px_per_inch": round(px_per_inch, 2),
        "drift_px_per_inch_y": round(float(np.median([s["dy_px"] / s["dx_px"] for s in seams])) * px_per_inch, 2),
        "object_rows_in_frame": [int(rows[0]), int(rows[1])],
        "size_px": [int(result.shape[1]), int(result.shape[0])],
        "size_inch": [round(result.shape[1] / px_per_inch, 2), round(result.shape[0] / px_per_inch, 2)],
        "seam_x_px": [round(x, 1) for x in seam_xs],
        "outputs": [out + ".tif", out + "_preview.jpg", out + "_seams.jpg"],
    }
    with open(out + "_report.json", "w") as f:
        json.dump(report, f, indent=2)
    return report


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "runs":
        print(json.dumps(list_runs(), indent=2))
        return
    if len(sys.argv) > 2 and sys.argv[1] == "info":
        print(json.dumps(run_info(sys.argv[2]), indent=2))
        return
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("log")
    p.add_argument("--from", dest="first", type=float)
    p.add_argument("--to", dest="last", type=float)
    p.add_argument("--end", type=float)
    p.add_argument("--blend", type=float)
    p.add_argument("--margin", type=float, default=0.25)
    p.add_argument("--out")
    a = p.parse_args()
    report = stitch(a.log, a.first, a.last, a.end, a.blend, a.margin, a.out)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
