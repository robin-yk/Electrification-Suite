#!/usr/bin/env python3
"""Does any single-temperature reactor state reproduce the steady CJH points?

The paper's continuous Joule heating data (Figure 2, 5 percent CH4 in He)
are steady, so they test the reactor picture without any pulse dynamics in
the way. The picture under test is the one every case in this repository has
used: the reacting gas is at the element temperature, in a CSTR or in the
plug-flow limit, for some residence time. If that picture is right, then at
each measured element temperature there is one residence time that gives the
measured conversion, and the selectivities at that residence time match too.

    python3 tools/openmkm_dynamic/cjh_inversion.py

Data: data/premise/cjh-inversion/cjh-{cstr,pfr}.json, produced by

    python3 tools/openmkm_dynamic/premise_probe.py sweep \\
        --mechanism tools/cantera/mechanisms/aramco20.yaml --kind cstr \\
        --feed ch4 --temperature 1000 1150 1230 1400 1470 \\
        --tau 0.002 0.005 0.01 0.02 0.05 0.1 0.2 --output ...

and the same with --kind pfr; ch-{cstr,pfr}.json likewise at 1060, 1150 and
1200 C with tau 0.5, 1, 2 and 4 s for the furnace. fig2_by_eye.json holds the
measured points read by eye from Figure 2, about one unit on each axis, and
is scoping data: it says whether a picture is worth building, not what the
paper measured to three figures.

Two inversions are printed. Matched on conversion: the residence time that
reproduces X, and the selectivities there. Matched on acetylene: the
residence time that reproduces S_C2H2, the conversion there, and the bypass
fraction X_measured / X_model that a hot zone plus untouched gas would need.
"""
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "premise" / "cjh-inversion"


def interp_at(rows, key_in, target, keys_out):
    """Interpolate keys_out in log(tau) at the tau where key_in == target."""
    rs = sorted(rows, key=lambda r: r["tau_s"])
    lt = np.log([r["tau_s"] for r in rs])
    y = np.array([100 * r[key_in] for r in rs])
    if target < y.min() or target > y.max():
        return None
    i = int(np.argmax(y >= target))
    f = (target - y[i - 1]) / (y[i] - y[i - 1])
    l = lt[i - 1] + f * (lt[i] - lt[i - 1])
    return {"tau_ms": 1e3 * np.exp(l),
            **{k: float(np.interp(l, lt, [100 * r[k] for r in rs])) for k in keys_out}}


def main():
    fig = json.load(open(DATA / "fig2_by_eye.json"))
    sel = ("s_c2h2", "s_c2h4", "s_c6h6")
    for kind in ("cstr", "pfr"):
        rows = json.load(open(DATA / f"cjh-{kind}.json"))["rows"]
        print(f"\n{kind.upper()} at the element temperature, CJH points of Figure 2")
        print("  matched on conversion:      T_e    X    tau(ms)   S_C2H2 mod/meas  S_C2H4 mod/meas  S_C6H6 mod/meas")
        for pt in fig["cjh"]:
            if pt["s_c2h2"] is None:
                continue
            rs = [r for r in rows if abs(r["t_c"] - pt["t_c"]) < 1]
            m = interp_at(rs, "x_ch4", pt["x_ch4"], sel + ("x_ch4",))
            if m is None:
                print(f"    {pt['t_c']:6.0f} {pt['x_ch4']:5.1f}   X out of the swept range")
                continue
            print(f"    {pt['t_c']:6.0f} {pt['x_ch4']:5.1f} {m['tau_ms']:8.1f}    "
                  + "  ".join(f"{m[k]:5.1f}/{pt[k]:<5.1f}" for k in sel))
        print("  matched on acetylene:       T_e   tau(ms)  X_hot   S_C2H4 mod/meas  S_C6H6 mod/meas  bypass X_meas/X_hot")
        for pt in fig["cjh"]:
            if pt["s_c2h2"] is None or pt["t_c"] < 1300:
                continue
            rs = [r for r in rows if abs(r["t_c"] - pt["t_c"]) < 1]
            m = interp_at(rs, "s_c2h2", pt["s_c2h2"], sel + ("x_ch4",))
            if m is None:
                print(f"    {pt['t_c']:6.0f}   S_C2H2 {pt['s_c2h2']} not reached")
                continue
            print(f"    {pt['t_c']:6.0f} {m['tau_ms']:8.1f} {m['x_ch4']:6.1f}   "
                  f"{m['s_c2h4']:5.1f}/{pt['s_c2h4']:<5.1f}      {m['s_c6h6']:5.1f}/{pt['s_c6h6']:<5.1f}"
                  f"      {pt['x_ch4'] / m['x_ch4']:.2f}")
    print("\nFurnace (CH) points against a uniform reactor at the furnace temperature, tau 0.5 to 4 s")
    for kind in ("cstr", "pfr"):
        rows = json.load(open(DATA / f"ch-{kind}.json"))["rows"]
        for pt in fig["ch"]:
            rs = [r for r in rows if abs(r["t_c"] - pt["t_c"]) < 1]
            m = interp_at(rs, "x_ch4", pt["x_ch4"], sel)
            if m is None:
                continue
            print(f"  {kind:4} {pt['t_c']:5.0f} C  X {pt['x_ch4']:4.0f}  tau {m['tau_ms'] / 1e3:4.2f} s   "
                  + "  ".join(f"{k[2:].upper()} {m[k]:5.1f}/{pt[k]:<4.1f}" for k in sel))
    print("\nReading: at the residence time that gives the measured conversion, no state has\n"
          "the measured C2H4 alongside its C2H2. C2H4 is a low-severity product and C2H2 a\n"
          "high-severity one; their coexistence means the reacting gas spans a range of\n"
          "severities, which a single-temperature reactor cannot represent.")


if __name__ == "__main__":
    main()
