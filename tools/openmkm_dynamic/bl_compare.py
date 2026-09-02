#!/usr/bin/env python3
"""Does the boundary-layer picture reproduce the steady CJH points?

Reads the scans written by boundary_layer_probe.py and the Figure 2 CJH
points read by eye (fig2_by_eye.json), and answers two questions per scan.

Matched on conversion: at each measured plate temperature, the inlet
velocity at which the model's conversion equals the measured one, found by
interpolation in log u, and the selectivities there. The picture passes when
one velocity, or a smooth trend of velocities, carries the measured acetylene,
ethylene and benzene together. A velocity that has to change by a factor of
ten between neighbouring temperatures is a fit, not a picture.

Temperature slope: the apparent activation energy of conversion between two
plate temperatures at fixed velocity, against the same number from the
measured points. Kinetics alone gives about 400 to 470 kJ/mol on this
mechanism (cjh_inversion.py sweeps); the measured points give about 130. A
picture with the right transport limitation must land near the measured
number before any velocity is fitted.

    python3 tools/openmkm_dynamic/bl_compare.py \\
        tools/openmkm_dynamic/data/premise/cjh-inversion/bl-aramco-he-*.json
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "premise" / "cjh-inversion"
R_KJ = 8.314e-3


def load(paths):
    """Rows from every file, grouped by inlet temperature."""
    groups = {}
    for path in paths:
        d = json.loads(Path(path).read_text())
        key = (Path(d["mechanism"]).name, round(d["inlet_T_K"] - 273.15))
        g = groups.setdefault(key, {"mechanism": d["mechanism"], "rows": []})
        g["rows"].extend(d["rows"])
    return groups


def match_on_conversion(rows, x_target):
    """Velocity where model X equals x_target, and selectivities there."""
    rs = sorted(rows, key=lambda r: r["u_in_cm_s"])
    lu = np.log([r["u_in_cm_s"] for r in rs])
    x = np.array([100 * r["x_ch4"] for r in rs])
    if not (x.min() <= x_target <= x.max()):
        return None
    # X falls with u; interpolate on the reversed, increasing arrays.
    order = np.argsort(x)
    l = float(np.interp(x_target, x[order], lu[order]))
    out = {"u_cm_s": math.exp(l)}
    for k in ("s_c2h2", "s_c2h4", "s_c6h6", "s_c4h2"):
        ys = [r[k] for r in rs]
        out[k] = None if any(y is None for y in ys) else \
            float(np.interp(l, lu, [100 * y for y in ys]))
    return out


def e_app(t1_c, x1, t2_c, x2):
    if x1 <= 0 or x2 <= 0:
        return None
    return R_KJ * math.log(x2 / x1) / (1 / (t1_c + 273.15) - 1 / (t2_c + 273.15))


def fmt(v, w=6, d=1):
    return " " * (w - 1) + "." if v is None else f"{v:{w}.{d}f}"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scans", nargs="*", type=Path,
                    default=sorted(DATA.glob("bl-aramco-he-*.json")))
    ap.add_argument("--fig2", type=Path, default=DATA / "fig2_by_eye.json")
    args = ap.parse_args()

    fig = json.loads(args.fig2.read_text())
    meas = {r["t_c"]: r for r in fig["cjh"] if r["s_c2h2"] is not None}
    groups = load(args.scans)
    if not groups:
        raise SystemExit("no scans found")

    for (_, inlet_c), g in sorted(groups.items()):
        rows = g["rows"]
        print(f"\n{g['mechanism']}  inlet {inlet_c} C  "
              f"({len(rows)} cases, {len(args.scans)} files)")
        print("\nmodel, every case")
        print(f"  {'T_plate':>7} {'u cm/s':>7} {'X':>7} {'S_C2H2':>7} {'S_C2H4':>7} "
              f"{'S_C6H6':>7} {'S_C4H2':>7}")
        for r in sorted(rows, key=lambda r: (r["plate_c"], r["u_in_cm_s"])):
            print(f"  {r['plate_c']:7.0f} {r['u_in_cm_s']:7.2f} {100 * r['x_ch4']:7.2f} "
                  f"{fmt(None if r['s_c2h2'] is None else 100 * r['s_c2h2'], 7)} "
                  f"{fmt(None if r['s_c2h4'] is None else 100 * r['s_c2h4'], 7)} "
                  f"{fmt(None if r['s_c6h6'] is None else 100 * r['s_c6h6'], 7)} "
                  f"{fmt(None if r['s_c4h2'] is None else 100 * r['s_c4h2'], 7)}")

        print("\nmatched on conversion: measured (Figure 2 by eye) against the model "
              "at the velocity that gives the measured X")
        print(f"  {'T_plate':>7} {'X meas':>7} | {'u cm/s':>7} {'S_C2H2':>7} {'S_C2H4':>7} "
              f"{'S_C6H6':>7} | {'meas':>7} {'meas':>7} {'meas':>7}")
        for t_c, m in sorted(meas.items()):
            sub = [r for r in rows if abs(r["plate_c"] - t_c) < 0.5]
            if not sub:
                continue
            hit = match_on_conversion(sub, m["x_ch4"])
            if hit is None:
                xs = sorted(100 * r["x_ch4"] for r in sub)
                print(f"  {t_c:7.0f} {m['x_ch4']:7.1f} | out of range: model X "
                      f"{xs[0]:.2f} to {xs[-1]:.2f} over the velocities run")
                continue
            print(f"  {t_c:7.0f} {m['x_ch4']:7.1f} | {hit['u_cm_s']:7.3f} "
                  f"{fmt(hit['s_c2h2'], 7)} {fmt(hit['s_c2h4'], 7)} {fmt(hit['s_c6h6'], 7)} | "
                  f"{m['s_c2h2']:7.1f} {m['s_c2h4']:7.1f} {m['s_c6h6']:7.1f}")

        print("\napparent activation energy of conversion, kJ/mol, at fixed velocity")
        temps = sorted({r["plate_c"] for r in rows})
        us = sorted({r["u_in_cm_s"] for r in rows})
        pairs = [(a, b) for a, b in zip(temps, temps[1:])] + \
                ([(temps[0], temps[-1])] if len(temps) > 2 else [])
        head = "  " + f"{'u cm/s':>7}" + "".join(f" {a:.0f}->{b:.0f}".rjust(12) for a, b in pairs)
        print(head)
        for u in us:
            at = {r["plate_c"]: r["x_ch4"] for r in rows if abs(r["u_in_cm_s"] - u) < 1e-9}
            cells = []
            for a, b in pairs:
                e = e_app(a, at.get(a, 0), b, at.get(b, 0)) if a in at and b in at else None
                cells.append(fmt(e, 12, 0))
            print(f"  {u:7.2f}" + "".join(cells))
        cells = []
        mt = {t: m["x_ch4"] for t, m in meas.items()}
        for a, b in pairs:
            e = e_app(a, mt[a], b, mt[b]) if a in mt and b in mt else None
            cells.append(fmt(e, 12, 0))
        print(f"  {'measured':>7}" + "".join(cells))


if __name__ == "__main__":
    main()
