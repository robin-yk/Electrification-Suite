#!/usr/bin/env python3
"""Draw the two carbon-flux diagrams of pathway_flux.py as one SVG.

Left panel steady (CJH), right panel pulsed (RPH), same conversion, same
scale: edge width and label are percent of the carbon fed that moves along
that lump-to-lump edge; the box under each lump is the share of fed carbon
that leaves the reactor as that lump. Edges below the threshold are not
drawn, and the total they carry is printed in the corner so nothing is
dropped silently. No drawing library: the SVG is written by hand.

    python3 draw_pathway.py --input data/c2pulse/pathway-anchor.json \
        --output ../../docs/figures/pathway-anchor.svg
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

LABEL = {"CH4": "CH4", "CHx": "CH3 / CHx", "C2H6": "C2H6", "C2H4": "C2H4",
         "C2H2": "C2H2", "C3": "C3 (C3H4, C3H3)", "C4H2": "C4H2", "C4": "C4 (C4H4, C4H6)",
         "C5": "C5", "C6H6": "C6H6 benzene", "polyyne": "C6H2 polyyne",
         "C6": "C6 other", "C7+": "C7+"}
# column, row on a grid; the dehydrogenation ladder runs down the left,
# growth products to the right.
POS = {"CH4": (0, 0), "CHx": (0, 1), "C2H6": (0, 2), "C2H4": (0, 3), "C2H2": (0, 4),
       "C3": (1, 2), "C4": (2, 2), "C4H2": (1, 5), "C5": (2, 3.5),
       "C6H6": (2, 1), "polyyne": (2, 5), "C6": (3, 1.5), "C7+": (3, 3)}
W, H = 560, 520
X0, Y0, DX, DY = 90, 60, 135, 88
NODE_W, NODE_H = 96, 30


def xy(l):
    c, r = POS[l]
    return X0 + c * DX, Y0 + r * DY


def edge_path(a, b, offset):
    ax, ay = xy(a)
    bx, by = xy(b)
    dx, dy = bx - ax, by - ay
    n = math.hypot(dx, dy) or 1.0
    ux, uy = dx / n, dy / n
    # start and end at the node border, curve a little so a two-way pair
    # does not overlap
    sx, sy = ax + ux * NODE_W * 0.55, ay + uy * NODE_H * 0.8
    ex, ey = bx - ux * NODE_W * 0.55, by - uy * NODE_H * 0.8
    px, py = -uy, ux
    mx, my = (sx + ex) / 2 + px * offset, (sy + ey) / 2 + py * offset
    return f"M{sx:.1f},{sy:.1f} Q{mx:.1f},{my:.1f} {ex:.1f},{ey:.1f}", (mx, my)


def panel(r, title, threshold, ox, oy):
    edges = r["edges_pct_fed"]
    out = r["outflow_pct_fed"]
    drawn, dropped = [], 0.0
    for k, v in edges.items():
        if v >= threshold:
            drawn.append((k, v))
        else:
            dropped += v
    parts = [f'<g transform="translate({ox},{oy})">',
             f'<text x="{W/2}" y="24" text-anchor="middle" font-size="16" font-weight="600">{title}</text>']
    # edges first, nodes on top
    for k, v in sorted(drawn, key=lambda kv: -kv[1]):
        a, b = k.split("->")
        back = f"{b}->{a}" in edges
        d, (mx, my) = edge_path(a, b, 14 if back else 0)
        width = 1.0 + 1.6 * math.sqrt(v)
        color = "#b03a2e" if b in ("C6H6", "C6", "C7+", "C5") else (
            "#1f5f8b" if b in ("C4H2", "polyyne") else "#444")
        parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width:.1f}" '
                     f'stroke-opacity="0.75" marker-end="url(#arr)"/>')
        parts.append(f'<text x="{mx:.1f}" y="{my - 4:.1f}" text-anchor="middle" font-size="11" '
                     f'fill="{color}" paint-order="stroke" stroke="#fff" stroke-width="3">{v:.1f}</text>')
    for l in r.get("lumps", POS):
        if l not in POS:
            continue
        x, y = xy(l)
        share = out.get(l, 0.0)
        fill = "#fff"
        parts.append(f'<rect x="{x - NODE_W/2}" y="{y - NODE_H/2}" width="{NODE_W}" height="{NODE_H}" '
                     f'rx="5" fill="{fill}" stroke="#222" stroke-width="1.2"/>')
        parts.append(f'<text x="{x}" y="{y + 4}" text-anchor="middle" font-size="11.5">{LABEL[l]}</text>')
        if share >= 0.05:
            parts.append(f'<text x="{x}" y="{y + NODE_H/2 + 13}" text-anchor="middle" font-size="10.5" '
                         f'fill="#555">out {share:.1f} %</text>')
    parts.append(f'<text x="8" y="{H - 8}" font-size="10" fill="#666">'
                 f'edges under {threshold} % not drawn: {dropped:.1f} % of fed carbon in total</text>')
    parts.append("</g>")
    return "\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--threshold", type=float, default=0.3)
    args = ap.parse_args()
    r = json.loads(args.input.read_text())
    for side in ("steady", "pulsed"):
        r[side]["lumps"] = r["lumps"]
    s, p = r["steady"], r["pulsed"]
    x = 100 * s["x_ch4"]
    left = f"CJH steady, {s['t_c']:.0f} C, X {x:.1f} %"
    right = f"RPH pulse, peak {p['t_peak_c']:.0f} C, X {100 * p['x_ch4_last_cycle']:.1f} %"
    sub = (f"Carbon flux, percent of carbon fed. Feed {r['feed']}, tau {r['tau_s']} s, "
           f"AramcoMech 2.0. Red: into rings. Blue: into polyynes.")
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{2*W + 20}" height="{H + 40}" '
           f'viewBox="0 0 {2*W + 20} {H + 40}" font-family="Helvetica, Arial, sans-serif">',
           '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
           'markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#333"/></marker></defs>',
           f'<rect width="100%" height="100%" fill="#fff"/>',
           f'<text x="{W + 10}" y="{H + 28}" text-anchor="middle" font-size="11" fill="#444">{sub}</text>',
           panel(s, left, args.threshold, 0, 0),
           f'<line x1="{W + 10}" y1="10" x2="{W + 10}" y2="{H}" stroke="#ccc"/>',
           panel(p, right, args.threshold, W + 20, 0),
           "</svg>"]
    args.output.write_text("\n".join(svg))
    print("wrote", args.output)


if __name__ == "__main__":
    main()
