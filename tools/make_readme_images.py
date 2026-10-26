"""Make the README's images from a run and one of its stitches.

    python tools/make_readme_images.py RUN_LOG STITCH_REPORT [--out docs/images]

Writes, all from the run's embedded-JPEG previews and the stitch report:
    run_frames.jpg     every frame of the run, the ones used in the stitch highlighted
    strips.jpg         each used frame with the strip taken from it marked
    overlap.jpg        the used frames laid out where registration placed them, overlapping,
                       with the strip from each lit and the stitched result underneath
    assembled.jpg      the stitched result with its seams and source frames labelled
    seams.jpg          full-resolution crops centred on each seam, scaled down
    box_top.jpg        the stitched result at 2000 px wide
    box_top_full.jpg   the stitched result at full resolution
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import stitch  # noqa: E402

THUMB_W = 400
GAP = 12
FONT = cv2.FONT_HERSHEY_SIMPLEX
AMBER = (0, 176, 255)       # BGR
WHITE = (255, 255, 255)
GREY = (150, 150, 150)
BG = (24, 24, 24)


def label(img, text, org, scale=0.7, color=WHITE, thickness=2):
    cv2.putText(img, text, org, FONT, scale, (0, 0, 0), thickness + 3, cv2.LINE_AA)
    cv2.putText(img, text, org, FONT, scale, color, thickness, cv2.LINE_AA)


def grid(tiles, columns):
    th, tw = tiles[0].shape[:2]
    rows = (len(tiles) + columns - 1) // columns
    sheet = np.full((rows * th + (rows + 1) * GAP, columns * tw + (columns + 1) * GAP, 3), BG, np.uint8)
    for i, tile in enumerate(tiles):
        r, c = divmod(i, columns)
        y, x = GAP + r * (th + GAP), GAP + c * (tw + GAP)
        sheet[y:y + th, x:x + tw] = tile
    return sheet


def thumb(img):
    scale = THUMB_W / img.shape[1]
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA), scale


def main():
    p = argparse.ArgumentParser()
    p.add_argument("log")
    p.add_argument("report")
    p.add_argument("--out", default="docs/images")
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    report = json.load(open(a.report))
    info = stitch.run_info(a.log)
    rows = stitch.read_log(a.log)
    used = {f["shot"] for f in report["frames"]}
    ppi = report["object_px_per_inch"]

    # 1. Every frame of the run.
    tiles = []
    for row in rows:
        img = cv2.imread(stitch.preview_path(a.log, row))
        t, _ = thumb(img)
        if row["shot"] not in used:
            t = (t * 0.35).astype(np.uint8)
        else:
            cv2.rectangle(t, (1, 1), (t.shape[1] - 2, t.shape[0] - 2), AMBER, 3)
        text = f'{float(row["target_inch"]):g}"'
        if row.get("note"):
            text += "  gray card"
        label(t, text, (10, 30), color=WHITE if row["shot"] in used else GREY)
        tiles.append(t)
    sheet = grid(tiles, 4)
    cv2.imwrite(os.path.join(a.out, "run_frames.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])

    # 2. The strip each used frame contributes, in that frame's own coordinates.
    frames = report["frames"]
    offsets = [f["offset_px"][0] for f in frames]
    tiles = []
    for i, f in enumerate(frames):
        row = next(r for r in rows if r["shot"] == f["shot"])
        img = cv2.imread(stitch.preview_path(a.log, row))
        w = img.shape[1]
        lo = w / 2 - ((offsets[i] - offsets[i - 1]) / 2 if i > 0 else report["end_inch"] * ppi)
        hi = w / 2 + ((offsets[i + 1] - offsets[i]) / 2 if i < len(frames) - 1 else report["end_inch"] * ppi)
        t, s = thumb(img)
        x0, x1 = int(lo * s), int(hi * s)
        dim = (t * 0.3).astype(np.uint8)
        dim[:, x0:x1] = t[:, x0:x1]
        cv2.rectangle(dim, (x0, 0), (x1 - 1, dim.shape[0] - 1), AMBER, 2)
        cv2.line(dim, (int(w / 2 * s), 0), (int(w / 2 * s), 14), WHITE, 1)
        label(dim, f'{f["target_inch"]:g}"', (10, 30))
        tiles.append(dim)
    cv2.imwrite(os.path.join(a.out, "strips.jpg"), grid(tiles, 4), [cv2.IMWRITE_JPEG_QUALITY, 85])

    tif = report["outputs"][0]
    result = cv2.imread(tif)

    # 2b. Overlap: every used frame at its registered position, one lane each, then the result.
    w = cv2.imread(stitch.preview_path(a.log, rows[0])).shape[1]
    mid = len(frames) // 2
    oys = [f["offset_px"][1] for f in frames]
    r0, r1 = report["object_rows_in_frame"]
    pad = int(0.15 * ppi)
    centres = [w / 2 + ox for ox in offsets]
    bounds = ([centres[0] - report["end_inch"] * ppi]
              + [(c0 + c1) / 2 for c0, c1 in zip(centres, centres[1:])]
              + [centres[-1] + report["end_inch"] * ppi])
    crop_left = bounds[1] - report["seam_x_px"][0]        # result's left edge, in frame-0 pixels
    span0, span1 = min(0.0, crop_left), max(offsets[-1] + w, crop_left + result.shape[1])
    scale = 1600 / (span1 - span0)
    lane_h = int((r1 - r0 + 2 * pad) * scale)
    label_w = 0
    rows_h = len(frames) * (lane_h + 6)
    res_small = cv2.resize(result, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    canvas = np.full((rows_h + 26 + res_small.shape[0] + 6, 1600 + label_w, 3), BG, np.uint8)
    X = lambda px: int(round((px - span0) * scale)) + label_w  # noqa: E731
    for i, f in enumerate(frames):
        row = next(r for r in rows if r["shot"] == f["shot"])
        img = cv2.imread(stitch.preview_path(a.log, row))
        dy = int(round(oys[i] - oys[mid]))
        band = img[max(0, r0 - pad - dy): r1 + pad - dy]
        band = cv2.resize(band, (X(offsets[i] + w) - X(offsets[i]), lane_h), interpolation=cv2.INTER_AREA)
        dim = (band * 0.32).astype(np.uint8)
        s0, s1 = X(bounds[i]) - X(offsets[i]), X(bounds[i + 1]) - X(offsets[i])
        dim[:, s0:s1] = band[:, s0:s1]
        y = i * (lane_h + 6)
        x = X(offsets[i])
        canvas[y:y + lane_h, x:x + dim.shape[1]] = dim
        cv2.rectangle(canvas, (x, y), (x + dim.shape[1] - 1, y + lane_h - 1), GREY, 1)
        cv2.rectangle(canvas, (x + s0, y), (x + s1 - 1, y + lane_h - 1), AMBER, 2)
        label(canvas, f'{f["target_inch"]:g}"', (x + 6, y + 22), scale=0.55)
    y_res = rows_h + 26
    label(canvas, "stitched result", (X(crop_left) + 6, y_res - 8), scale=0.55)
    canvas[y_res:y_res + res_small.shape[0], X(crop_left):X(crop_left) + res_small.shape[1]] = res_small
    for b in bounds[1:-1]:
        cv2.line(canvas, (X(b), 0), (X(b), canvas.shape[0] - 1), AMBER, 1)
    cv2.imwrite(os.path.join(a.out, "overlap.jpg"), canvas, [cv2.IMWRITE_JPEG_QUALITY, 88])

    # 3. The assembled result with its seams and the frame each strip came from.
    scale = 1600 / result.shape[1]
    small = cv2.resize(result, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    band = 44
    canvas = np.full((small.shape[0] + band, small.shape[1], 3), BG, np.uint8)
    canvas[band:] = small
    seams = [x * scale for x in report["seam_x_px"]]
    edges = [0.0] + seams + [float(small.shape[1])]
    for x in seams:
        cv2.line(canvas, (int(x), band), (int(x), canvas.shape[0] - 1), AMBER, 2)
    for f, x0, x1 in zip(frames, edges, edges[1:]):
        text = f'{f["target_inch"]:g}"'
        (tw, _), _ = cv2.getTextSize(text, FONT, 0.7, 2)
        label(canvas, text, (int((x0 + x1) / 2 - tw / 2), 30))
    cv2.imwrite(os.path.join(a.out, "assembled.jpg"), canvas, [cv2.IMWRITE_JPEG_QUALITY, 88])

    # 4. Seam close-ups.
    seam_img = cv2.imread(report["outputs"][2])
    scale = 1600 / seam_img.shape[1]
    seam_small = cv2.resize(seam_img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(a.out, "seams.jpg"), seam_small, [cv2.IMWRITE_JPEG_QUALITY, 85])

    # 5. The result, for the page and at full resolution.
    scale = 2000 / result.shape[1]
    cv2.imwrite(os.path.join(a.out, "box_top.jpg"),
                cv2.resize(result, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA),
                [cv2.IMWRITE_JPEG_QUALITY, 88])
    cv2.imwrite(os.path.join(a.out, "box_top_full.jpg"), result, [cv2.IMWRITE_JPEG_QUALITY, 92])

    for name in sorted(os.listdir(a.out)):
        path = os.path.join(a.out, name)
        img = cv2.imread(path)
        print(f"{name:20s} {img.shape[1]}x{img.shape[0]}  {os.path.getsize(path) / 1e6:.2f} MB")
    print(f'interval {info["interval_inch"]}"  frames used {len(frames)}  scale {ppi} px/in')


if __name__ == "__main__":
    main()
