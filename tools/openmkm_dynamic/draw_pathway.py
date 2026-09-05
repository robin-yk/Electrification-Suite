#!/usr/bin/env python3
"""Draw the two carbon-flux diagrams of pathway_flux.py as one SVG.

Left panel steady (CJH), right panel pulsed (RPH), same conversion, same
scale: edge width and label are percent of the carbon fed that moves along
that lump-to-lump edge; the second line in each box is the share of fed
carbon that leaves the reactor as that lump. Edges below the threshold are
not drawn, and the total they carry is printed under each panel so nothing
is dropped silently. Lumps that neither carry a drawn edge nor leave the
reactor are not drawn either. No drawing library: the SVG is written by
hand, in Arial with real subscripts.

    python3 draw_pathway.py --input data/c2pulse/pathway-anchor.json \
        --output ../../docs/figures/pathway-anchor.svg
"""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

FONT = "Arial, Helvetica, 'Liberation Sans', sans-serif"

# Display names; digits after an element letter become subscripts.
NAME = {"CH4": "CH4", "CHx": "CH3", "COx": "CO2, CO", "C2H6": "C2H6", "C2H4": "C2H4", "C2H2": "C2H2",
        "C3": "C3", "C4H2": "C4H2", "C4": "C4", "C5": "C5", "C6H6": "C6H6",
        "polyyne": "C6H2", "C6": "C6", "C7+": "C7+"}
NOTE = {"CHx": "methyl", "COx": "CO2 in, CO out", "C3": "C3H3, C3H4", "C4": "C4H4, C4H6", "C4H2": "diacetylene",
        "C6H6": "benzene", "polyyne": "triacetylene", "C6": "fulvene, C6H4", "C5": "C5H6",
        "C7+": "larger"}
KIND = {"CH4": "ladder", "CHx": "ladder", "COx": "ladder", "C2H6": "ladder", "C2H4": "ladder", "C2H2": "ladder",
        "C3": "grow", "C4": "grow", "C5": "grow", "C6H6": "ring", "C6": "ring", "C7+": "ring",
        "C4H2": "polyyne", "polyyne": "polyyne"}
FILL = {"ladder": "#f4f4f4", "grow": "#fbf6ea", "ring": "#fbeeec", "polyyne": "#eaf1f7"}
EDGE = {"ladder": "#555555", "ring": "#c0392b", "crack": "#e67e22", "polyyne": "#2471a3"}

# (column, row): the dehydrogenation ladder runs down the left, growth to
# the right, rings top right, polyynes bottom.
POS = {"CH4": (0, 0), "CHx": (0, 1), "COx": (1.05, 0), "C2H6": (0, 2), "C2H4": (0, 3), "C2H2": (0, 4.2),
       "C3": (1.05, 3.3), "C4": (2.05, 2.6), "C6H6": (2.0, 0.9), "C6": (3.05, 1.6),
       "C5": (3.05, 3.2), "C7+": (3.05, 4.2), "C4H2": (1.2, 5.3), "polyyne": (2.4, 5.3)}
W, H = 600, 640
X0, Y0, DX, DY = 88, 84, 140, 94
NODE_W, NODE_H = 108, 54


def sub(formula):
    """C2H4 -> C<tspan ...>2</tspan>H<tspan ...>4</tspan>, in SVG."""
    out = []
    for tok in re.findall(r"\d+|[^\d]+", formula):
        if tok.isdigit():
            out.append(f'<tspan dy="3.2" font-size="72%">{tok}</tspan><tspan dy="-3.2">​</tspan>')
        else:
            out.append(tok)
    return "".join(out)


def xy(l):
    c, r = POS[l]
    return X0 + c * DX, Y0 + r * DY


def border_point(cx, cy, ux, uy):
    """Where a ray from the node centre along (ux, uy) leaves the box."""
    tx = (NODE_W / 2) / abs(ux) if ux else float("inf")
    ty = (NODE_H / 2) / abs(uy) if uy else float("inf")
    t = min(tx, ty) + 3
    return cx + ux * t, cy + uy * t


def edge_path(a, b, offset):
    ax, ay = xy(a)
    bx, by = xy(b)
    dx, dy = bx - ax, by - ay
    n = math.hypot(dx, dy) or 1.0
    ux, uy = dx / n, dy / n
    px, py = -uy, ux
    sx, sy = border_point(ax, ay, ux + px * offset / n * 3, uy + py * offset / n * 3)
    ex, ey = border_point(bx, by, -ux + px * offset / n * 3, -uy + py * offset / n * 3)
    mx, my = (sx + ex) / 2 + px * offset, (sy + ey) / 2 + py * offset
    return (f"M{sx:.1f},{sy:.1f} Q{mx:.1f},{my:.1f} {ex:.1f},{ey:.1f}",
            ((sx, sy), (mx, my), (ex, ey)), (px, py))


def bezier_point(ctrl, t):
    (sx, sy), (mx, my), (ex, ey) = ctrl
    u = 1 - t
    return (u * u * sx + 2 * u * t * mx + t * t * ex,
            u * u * sy + 2 * u * t * my + t * t * ey)


def overlaps(box, boxes):
    x0, y0, x1, y1 = box
    return any(x0 < b[2] and b[0] < x1 and y0 < b[3] and b[1] < y1 for b in boxes)


def place_label(ctrl, normal, text_w, taken):
    """First point along the curve whose label box touches nothing placed."""
    px, py = normal
    for t in (0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78):
        for side in (1, -1):
            x, y = bezier_point(ctrl, t)
            lx, ly = x + side * px * 13, y + side * py * 13
            box = (lx - text_w / 2 - 2, ly - 8, lx + text_w / 2 + 2, ly + 8)
            if not overlaps(box, taken):
                taken.append(box)
                return lx, ly + 4
    x, y = bezier_point(ctrl, 0.5)
    return x + px * 12, y + py * 12 + 4


def edge_kind(a, b):
    if a in ("C6H6", "C6", "C7+"):
        return "crack"
    if KIND[b] == "ring":
        return "ring"
    if KIND[b] == "polyyne":
        return "polyyne"
    return "ladder"


def co2_carbon_pct(feed):
    """Carbon fed as CO2, as percent of the carbon fed as methane."""
    x = {m.group(1).upper(): float(m.group(2)) for m in re.finditer(r"(\w+):([\d.]+)", feed)}
    return 100 * x.get("CO2", 0.0) / x["CH4"]


def panel(r, title, threshold, ox, oy, co2_pct):
    edges = r["edges_pct_fed"]
    # The COx lump leaves with the CO2 carbon it was fed; show only what it
    # gained from methane carbon, so the box reads the same way as the others.
    out = {l: (v - co2_pct if l == "COx" else v) for l, v in r["outflow_pct_fed"].items()}
    drawn, dropped = [], 0.0
    for k, v in edges.items():
        if v >= threshold:
            drawn.append((k, v))
        else:
            dropped += v
    touched = {s for k, _ in drawn for s in k.split("->")}
    parts = [f'<g transform="translate({ox},{oy})">',
             f'<text x="{W/2}" y="30" text-anchor="middle" font-size="17" font-weight="bold">{title}</text>']
    taken = []
    for l in POS:
        if l in touched or out.get(l, 0.0) >= 0.05:
            x, y = xy(l)
            taken.append((x - NODE_W / 2, y - NODE_H / 2, x + NODE_W / 2, y + NODE_H / 2))
    labels = []
    for k, v in sorted(drawn, key=lambda kv: -kv[1]):
        a, b = k.split("->")
        back = f"{b}->{a}" in edges and edges[f"{b}->{a}"] >= threshold
        d, ctrl, normal = edge_path(a, b, 16 if back else 0)
        kind = edge_kind(a, b)
        color = EDGE[kind]
        width = 1.2 + 1.7 * math.sqrt(v)
        parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width:.1f}" '
                     f'stroke-opacity="0.8" stroke-linecap="round" marker-end="url(#arr-{kind})"/>')
        lx, ly = place_label(ctrl, normal, 7 * len(f"{v:.1f}"), taken)
        labels.append((lx, ly, v, color))
    for lx, ly, v, color in labels:
        parts.append(f'<text x="{lx:.1f}" y="{ly:.1f}" text-anchor="middle" font-size="11.5" '
                     f'font-weight="bold" fill="{color}" paint-order="stroke" stroke="#fff" '
                     f'stroke-width="3.5" stroke-linejoin="round">{v:.1f}</text>')
    for l in POS:
        share = out.get(l, 0.0)
        if l not in touched and share < 0.05:
            continue
        x, y = xy(l)
        parts.append(f'<rect x="{x - NODE_W/2}" y="{y - NODE_H/2}" width="{NODE_W}" height="{NODE_H}" '
                     f'rx="7" fill="{FILL[KIND[l]]}" stroke="#333" stroke-width="1.1"/>')
        note = NOTE.get(l)
        parts.append(f'<text x="{x}" y="{y - 8}" text-anchor="middle" font-size="13.5" '
                     f'font-weight="bold">{sub(NAME[l])}</text>')
        if note:
            parts.append(f'<text x="{x}" y="{y + 6}" text-anchor="middle" font-size="9.5" '
                         f'fill="#666">{sub(note)}</text>')
        if share >= 0.05:
            word = "net +" if l == "COx" else "out "
            parts.append(f'<text x="{x}" y="{y + 19}" text-anchor="middle" font-size="10" '
                         f'fill="#222">{word}{share:.1f} %</text>')
    parts.append(f'<text x="{W/2}" y="{H - 10}" text-anchor="middle" font-size="10" fill="#777">'
                 f'edges under {threshold} % not drawn, {dropped:.1f} % of fed carbon in total</text>')
    parts.append("</g>")
    return "\n".join(parts)


def markers():
    m = []
    for kind, color in EDGE.items():
        m.append(f'<marker id="arr-{kind}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" '
                 f'markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">'
                 f'<path d="M0,0 L10,5 L0,10 z" fill="{color}"/></marker>')
    return "<defs>" + "".join(m) + "</defs>"


def legend(x, y):
    items = [("ladder", "dehydrogenation and growth"), ("ring", "into rings"),
             ("crack", "rings breaking up"), ("polyyne", "into polyynes")]
    parts = []
    for i, (kind, text) in enumerate(items):
        lx = x + i * 190
        parts.append(f'<line x1="{lx}" y1="{y}" x2="{lx + 28}" y2="{y}" stroke="{EDGE[kind]}" '
                     f'stroke-width="3" marker-end="url(#arr-{kind})"/>')
        parts.append(f'<text x="{lx + 38}" y="{y + 4}" font-size="11" fill="#333">{text}</text>')
    return "\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--threshold", type=float, default=0.3)
    args = ap.parse_args()
    r = json.loads(args.input.read_text())
    s, p = r["steady"], r["pulsed"]
    left = f"CJH steady, {s['t_c']:.0f} °C, X = {100 * s['x_ch4']:.1f} %"
    right = (f"RPH pulse, peak {p['t_peak_c']:.0f} °C, X = "
             f"{100 * p['x_ch4_last_cycle']:.1f} %")
    co2_pct = co2_carbon_pct(r["feed"])
    feed = re.sub(r"(\w+):([\d.]+)",
                  lambda m: f"{100 * float(m.group(2)):.0f} % {sub(m.group(1).replace('HE', 'He'))}",
                  r["feed"])
    sub_title = (f"Carbon flux as percent of the carbon fed as methane. Feed {feed}, "
                 f"residence time {r['tau_s']} s, 1 atm, AramcoMech 2.0.")
    total_w, total_h = 2 * W + 24, H + 70
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{total_h}" '
           f'viewBox="0 0 {total_w} {total_h}" font-family="{FONT}">',
           markers(),
           '<rect width="100%" height="100%" fill="#fff"/>',
           panel(s, left, args.threshold, 0, 0, co2_pct),
           f'<line x1="{W + 12}" y1="16" x2="{W + 12}" y2="{H - 4}" stroke="#d0d0d0" stroke-dasharray="4 4"/>',
           panel(p, right, args.threshold, W + 24, 0, co2_pct),
           f'<text x="{total_w/2}" y="{H + 22}" text-anchor="middle" font-size="11" fill="#444">{sub_title}</text>',
           legend(total_w / 2 - 380, H + 48),
           "</svg>"]
    args.output.write_text("\n".join(svg))
    print("wrote", args.output)


if __name__ == "__main__":
    main()
