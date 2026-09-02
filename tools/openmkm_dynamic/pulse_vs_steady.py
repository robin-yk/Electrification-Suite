#!/usr/bin/env python3
"""Pulsed cases against the steady element at the same feed, tau and conversion.

The fair question for a pulse is not whether it beats a steady point of the
same power or the same mean temperature but whether, at the residence time
the reactor actually has and the conversion the pulse reached, a steady
element could have made the same product slate. Selectivity to an
intermediate falls with conversion in any A -> B -> C network, so comparing
at different conversions reads partly as a slide along that curve.

For each pulsed case (schema 2, run_cstr_case.py) this finds, in a steady
CSTR sweep on the same feed and mechanism (premise_probe.py sweep --kind
cstr), the temperature at the same tau that gives the same CH4 conversion,
by interpolation in temperature, and prints the selectivities there beside
the pulse's. Same feed is checked, not assumed.

    python3 tools/openmkm_dynamic/pulse_vs_steady.py \\
        --steady tools/openmkm_dynamic/data/lump/steady-cstr-ch4co2.json \\
        tools/openmkm_dynamic/data/s9/conditions-siop/*.json
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def pulse_summary(path):
    d = json.loads(Path(path).read_text())
    inp, cyc = d["inputs"], d["cycle_summary"]
    from premise_probe import audit_basis
    b = audit_basis(d)
    return {"path": str(path), "feed": inp["feed"], "tau_s": inp["tau_s"],
            "voltage_v": inp.get("voltage_V"), "period_s": inp["period_s"],
            "duty": inp["duty"], "t_peak_c": inp["t_peak_K"] - 273.15,
            "t_min_c": inp["t_min_K"] - 273.15,
            "t_mean_c": inp["mean_temperature_K"] - 273.15,
            "p_avg_w": inp.get("element_p_avg_w"),
            "x_ch4": 100 * b["x_ch4"], "s_c2h2": 100 * b["s_c2h2"],
            "s_c2h4": 100 * b["s_c2h4"], "s_c6h6": 100 * b["s_c6h6"]}


def normalize_feed(s):
    parts = [p.strip().upper().replace(" ", "") for p in s.split(",")]
    return ",".join(sorted(parts))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cases", nargs="+", type=Path)
    ap.add_argument("--steady", type=Path, required=True)
    args = ap.parse_args()
    sw = json.loads(args.steady.read_text())
    feeds = {k: normalize_feed(v) for k, v in sw["feeds"].items()}
    rows = sw["rows"]

    print(f"steady sweep: {args.steady}  kind {sw['kind']}")
    print(f"  {'tau':>5} {'pulse':>28} {'X %':>6} | {'steady T':>8} | "
          f"{'C2H2 p/s':>12} {'C2H4 p/s':>12} {'C6H6 p/s':>12} | {'W':>4}")
    for path in args.cases:
        p = pulse_summary(path)
        label = next((k for k, v in feeds.items() if v == normalize_feed(p["feed"])), None)
        if label is None:
            print(f"  {p['tau_s']:5} {Path(path).name:>28}  feed {p['feed']} not in the sweep")
            continue
        rs = sorted((r for r in rows if r["feed"] == label and abs(r["tau_s"] - p["tau_s"]) < 1e-9),
                    key=lambda r: r["t_c"])
        if not rs:
            print(f"  {p['tau_s']:5} {Path(path).name:>28}  no steady points at this tau")
            continue
        T = np.array([r["t_c"] for r in rs])
        X = np.array([100 * r["x_ch4"] for r in rs])
        if not (X.min() <= p["x_ch4"] <= X.max()):
            print(f"  {p['tau_s']:5} {Path(path).name:>28} {p['x_ch4']:6.2f} | outside the "
                  f"steady range {X.min():.2f} to {X.max():.2f}")
            continue
        order = np.argsort(X)
        t_at = float(np.interp(p["x_ch4"], X[order], T[order]))
        sel = {k: float(np.interp(t_at, T, [100 * r[k] for r in rs]))
               for k in ("s_c2h2", "s_c2h4", "s_c6h6")}
        name = (f"{p['voltage_v']:.0f}V {p['period_s']:g}s d{p['duty']:g} "
                f"pk{p['t_peak_c']:.0f}")
        print(f"  {p['tau_s']:5} {name:>28} {p['x_ch4']:6.2f} | {t_at:8.0f} | "
              f"{p['s_c2h2']:5.1f}/{sel['s_c2h2']:5.1f} {p['s_c2h4']:5.1f}/{sel['s_c2h4']:5.1f} "
              f"{p['s_c6h6']:5.1f}/{sel['s_c6h6']:5.1f} | "
              f"{p['p_avg_w'] if p['p_avg_w'] is None else round(p['p_avg_w']):>4}")


if __name__ == "__main__":
    main()
