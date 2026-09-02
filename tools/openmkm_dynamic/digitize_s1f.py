#!/usr/bin/env python3
"""Digitize Scheme S1f of the SI: element temperature against electrical power.

Panel f plots, against time-averaged electrical power in watts, the peak and
the average element temperature under rapid pulse heating (orange asterisks
and dots, five powers each) and the steady-state temperature under continuous
heating (red line). It is the only place the SI relates an electrical input to
a measured temperature at more than one setting, so it is the calibration set
for the lumped element model in element_drive.py. Scheme S1e gave two numbers
for one setting; this panel gives fifteen or so across a factor of three in
power, and the steady line fixes the loss function on its own, with no thermal
mass in the way.

Input is the raster embedded in page 1 of the SI PDF, pulled out with pypdf
(page.images[0]) and written as PNG. The SI is not in this repository; point
--image at your own extraction. The output JSON in data/si/ is what the rest
of the code reads.

Axis calibration is taken from the drawn frame and tick marks, not typed in:
the frame's left edge is 0 W, the 50 W tick locates the scale, the frame's
bottom edge is 0 C and the centres of the 500/1000/1500 tick labels locate the
scale. Marker centroids are connected components of orange pixels inside the
frame, with the orange text labels excluded by their size and aspect. The red
line is followed column by column from its left end, picking the red run
nearest the previous column so the red "Average T" label does not capture it.
"""
import argparse
import json

import numpy as np
from PIL import Image
from scipy import ndimage

# Where panel f sits on the page-1 raster (1952 x 1271): lower-right quadrant.
PANEL_BOX = (0.5, 0.5, 1.0, 1.0)


def frame(black):
    """Return (x0, x1, y0, y1) of the plot frame: the long black runs."""
    def clusters(idx):
        out, start = [], idx[0]
        for a, b in zip(idx[:-1], idx[1:]):
            if b - a > 3:
                out.append(float(idx[(idx >= start) & (idx <= a)].mean()))
                start = b
        out.append(float(idx[idx >= start].mean()))
        return out
    # Frame edges are 3 px lines a few hundred px long; the crop may also hold
    # the neighbouring panel's right edge, so take the two rightmost columns
    # and the two outermost rows.
    cols = clusters(np.where(black.sum(axis=0) > 300)[0])
    rows = clusters(np.where(black.sum(axis=1) > 300)[0])
    assert len(cols) >= 2 and len(rows) >= 2, (cols, rows)
    return cols[-2], cols[-1], rows[0], rows[-1]


def axis_from_ticks(black, x0, x1, y0, y1):
    """Pixels per watt from the 50 W tick, pixels per C from the tick labels."""
    # x: tick marks are short vertical runs just inside the bottom edge.
    yb = int(round(y1))
    band = black[yb - 8:yb - 1, :]
    cols = np.where(band.sum(axis=0) >= 6)[0]
    inner = cols[(cols > x0 + 10) & (cols < x1 - 10)]
    assert len(inner) >= 1, "expected at least the 50 W tick"
    px_per_w = (inner[0] - x0) / 50.0
    # y: tick labels sit left of the frame; their text rows cluster at 0, 500,
    # 1000, 1500. Use the spacing between clusters.
    xl = int(round(x0))
    text = black[:, xl - 55:xl - 10].sum(axis=1) >= 3
    rows = np.where(text)[0]
    runs, start = [], rows[0]
    for a, b in zip(rows[:-1], rows[1:]):
        if b - a > 1:
            runs.append((start, a))
            start = b
    runs.append((start, rows[-1]))
    centres = sorted((a + b) / 2 for a, b in runs if 5 < b - a < 40)
    assert len(centres) == 4, centres
    # The three upper labels are 500 C apart; regress T on centre.
    px_per_c = (centres[-1] - centres[0]) / 1500.0
    # Labels are drawn slightly above their tick; anchor 0 C to the frame
    # bottom, which is the axis line, and keep the label spacing as scale.
    return px_per_w, px_per_c


def disc_template(size=19):
    """A filled disc about 19 px across, the plot's average-T marker."""
    c = (size - 1) / 2
    yy, xx = np.mgrid[0:size, 0:size]
    return (xx - c) ** 2 + (yy - c) ** 2 <= (c - 0.5) ** 2


def find_stars(mask, radius=9, min_px=80, min_sym=0.75):
    """Centres of six-armed asterisks.

    An asterisk is a point-symmetric figure whose arms all pass through one
    pixel, so at its centre the 3 x 3 neighbourhood is solid and the mask
    within `radius` is invariant under a half turn. Text glyphs fail the
    symmetry test. The union of two overlapping asterisks is also point
    symmetric about their midpoint, but that midpoint holds only the arm
    segments that overlap, well under `min_px` pixels, while a real centre
    holds all six arms. The legend dash fails the pixel count the same way.
    """
    H, W = mask.shape
    solid = ndimage.minimum_filter(mask, size=3)
    yy, xx = np.mgrid[-radius:radius + 1, -radius:radius + 1]
    disc = (yy ** 2 + xx ** 2) <= radius ** 2
    score = np.zeros(mask.shape)
    for y, x in zip(*np.where(solid)):
        if y < radius or x < radius or y >= H - radius or x >= W - radius:
            continue
        w = mask[y - radius:y + radius + 1, x - radius:x + radius + 1] & disc
        n = w.sum()
        if n < min_px or n > 0.5 * disc.sum():
            continue
        score[y, x] = (w & w[::-1, ::-1]).sum() / n
    mx = ndimage.maximum_filter(score, size=2 * radius + 1)
    ys, xs = np.where((score == mx) & (score >= min_sym))
    return [(int(y), int(x)) for y, x in zip(ys, xs)]


def ncc(img, tpl):
    """Zero-mean normalised cross-correlation of a 0/1 image with a template."""
    from scipy.signal import fftconvolve
    img = img.astype(float)
    t = tpl.astype(float)
    t = (t - t.mean()) / (np.sqrt(((t - t.mean()) ** 2).sum()) + 1e-12)
    n = t.size
    ones = np.ones_like(t)
    num = fftconvolve(img, t[::-1, ::-1], mode="same")
    s1 = fftconvolve(img, ones, mode="same")
    s2 = fftconvolve(img ** 2, ones, mode="same")
    var = s2 - s1 ** 2 / n
    return num / (np.sqrt(np.clip(var, 1e-12, None)))


def peaks(score, thresh, radius):
    """Local maxima of score above thresh, at least radius apart."""
    mx = ndimage.maximum_filter(score, size=2 * radius + 1)
    ys, xs = np.where((score == mx) & (score > thresh))
    order = np.argsort(-score[ys, xs])
    out = []
    for i in order:
        y, x = ys[i], xs[i]
        if all((y - py) ** 2 + (x - px) ** 2 > radius ** 2 for py, px, _ in out):
            out.append((int(y), int(x), float(score[y, x])))
    return out


def refine(mask, y, x, r=4):
    """Centroid of mask pixels within r of (y, x); sub-pixel marker centre."""
    ys, xs = np.where(mask[y - r:y + r + 1, x - r:x + r + 1])
    if len(xs) == 0:
        return float(y), float(x)
    return y - r + ys.mean(), x - r + xs.mean()


def follow_line(red, x_start, x_end, y_seed):
    """Walk columns left to right, taking the red run nearest the last y."""
    pts, y_prev = [], y_seed
    for x in range(x_start, x_end + 1):
        ys = np.where(red[:, x])[0]
        if len(ys) == 0:
            continue
        runs, s = [], ys[0]
        for a, b in zip(ys[:-1], ys[1:]):
            if b - a > 1:
                runs.append((s, a))
                s = b
        runs.append((s, ys[-1]))
        best = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - y_prev))
        yc = (best[0] + best[1]) / 2
        if abs(yc - y_prev) > 4:
            continue
        pts.append((x, yc))
        y_prev = yc
    return pts


def digitize(image_path):
    page = Image.open(image_path).convert("RGB")
    W, H = page.size
    bx = tuple(int(v * s) for v, s in zip(PANEL_BOX, (W, H, W, H)))
    im = np.array(page.crop(bx)).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    black = (r < 100) & (g < 100) & (b < 100)
    orange = (r > 200) & (g > 100) & (g < 190) & (b < 110)
    red = (r > 180) & (g < 100) & (b < 100)

    x0, x1, y0, y1 = frame(black)
    px_per_w, px_per_c = axis_from_ticks(black, x0, x1, y0, y1)
    to_w = lambda x: (x - x0) / px_per_w
    to_c = lambda y: (y1 - y) / px_per_c

    # Markers: correlate the plot region (frame plus a margin, since the top
    # asterisk straddles the frame line) with synthetic shapes and keep the
    # local maxima. Text glyphs do not reach the threshold; the legend is
    # excluded by position.
    region = np.zeros_like(orange)
    region[int(y0) - 12:int(y1) - 2, int(x0) + 3:int(x1) - 2] = True
    om = orange & region
    legend_top = y1 - 0.2 * (y1 - y0)
    stars = [refine(om, y, x) for y, x in find_stars(om) if y < legend_top]
    dots = [refine(om, y, x) for y, x, _ in peaks(ncc(om, disc_template()), 0.55, 8)
            if y < legend_top]
    peak = sorted(({"power_w": to_w(x), "t_c": to_c(y)} for y, x in stars),
                  key=lambda d: d["power_w"])
    avg = sorted(({"power_w": to_w(x), "t_c": to_c(y)} for y, x in dots),
                 key=lambda d: d["power_w"])

    inside = np.zeros_like(black)
    inside[int(y0) + 3:int(legend_top), int(x0) + 3:int(x1) - 2] = True
    # Red line: its left end is the leftmost red column inside the frame that
    # lies below the orange peak markers; seed there.
    red_in = red & inside
    cols = np.where(red_in.sum(axis=0) > 0)[0]
    xs = int(cols[0])
    ys = np.where(red_in[:, xs])[0]
    pts = follow_line(red_in, xs, int(x1) - 3, float(ys.mean()))
    steady = [{"power_w": to_w(x), "t_c": to_c(y)} for x, y in pts]
    # Thin to whole-watt samples for the record; the fit reads these.
    thinned, last = [], -1e9
    for p in steady:
        if p["power_w"] - last >= 5.0:
            thinned.append(p)
            last = p["power_w"]

    return {
        "source": "Scheme S1f, SI of Kwak et al., ACS Energy Lett. 2025, 10, 6188",
        "image": str(image_path),
        "frame_px": {"x0": x0, "x1": x1, "y0": y0, "y1": y1},
        "px_per_w": px_per_w, "px_per_c": px_per_c,
        "pulsed_peak": peak, "pulsed_avg": avg, "steady": thinned,
        "n_line_points": len(steady),
    }, (im, stars, dots, pts)


def overlay(dbg, out_path):
    """Draw what was picked on the crop, for a human to check."""
    from PIL import ImageDraw
    im, stars, dots, pts = dbg
    img = Image.fromarray(im.astype("uint8"))
    d = ImageDraw.Draw(img)
    for (y, x), col in [(p, "green") for p in stars] + [(p, "blue") for p in dots]:
        d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=col, width=2)
    for x, y in pts[::3]:
        d.point((x, y), fill="black")
    img.save(out_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--image", required=True, help="page-1 raster of the SI as PNG")
    ap.add_argument("--out", default="tools/openmkm_dynamic/data/si/scheme-s1f.json")
    ap.add_argument("--overlay", help="write a check image with picked points")
    args = ap.parse_args()
    data, dbg = digitize(args.image)
    if args.overlay:
        overlay(dbg, args.overlay)
    with open(args.out, "w") as f:
        json.dump(data, f, indent=1)
    print(f"peak {len(data['pulsed_peak'])}  avg {len(data['pulsed_avg'])}  "
          f"steady {len(data['steady'])} (from {data['n_line_points']} columns)")
    for k in ("pulsed_peak", "pulsed_avg", "steady"):
        print(k, " ".join(f"({p['power_w']:.1f}W,{p['t_c']:.0f}C)" for p in data[k]))


if __name__ == "__main__":
    main()
