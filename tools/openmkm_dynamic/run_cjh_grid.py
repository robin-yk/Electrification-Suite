#!/usr/bin/env python3
"""Dense steady CSTR grid over (T, tau): the floor the RPH surrogate stands on.

The 512-case PFR sweep cannot serve here, deliberately: it is a different
reactor (OpenMKM plug flow) with a differently defined residence time
(plateau length over flow, not mass over feed rate). quasi_steady_reference
already refuses to touch it and integrates its own CSTR anchors instead;
this file is that refusal made into a dataset. Every point uses the same
make_reactor / steady_state pair the transient cases use, so the map and
the cases can never disagree about which reactor they describe.

Feed, pressure and closure are fixed (CH4:CO2 = 1:1, 1 atm) and recorded.
Fixing the feed is also what makes a 2-D map sufficient: in the PFR data
conversion collapsed onto (T, tau), but selectivity kept a CH4-fraction
dependence (+0.38 rank correlation) that only disappears with the feed held.

The temperature spacing is 25 C, tightened to 5 C where the previous coarse
pass saw conversion move through the ignition cliff (1 % to 99 %) at the
neighbouring tau. Uniform 5 C everywhere would be ~4x the cases for
resolution that matters only on the cliff; uniform 25 C leaves the cliff to
interpolation error, which the RPH correction model would then inherit as
if it were dynamics.

Run:  python tools/openmkm_dynamic/run_cjh_grid.py --output data/cjh-grid.jsonl
      [--tau-points 25] [--closure const-pressure] [--shard K --shards N]
"""
import argparse
import datetime
import json
import math
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_cstr_case import build_params, CLOSURES          # noqa: E402
from run_cstr_pilot import steady_state                   # noqa: E402

T_LO_C, T_HI_C = 400.0, 1400.0
COARSE_STEP_C = 25.0
FINE_STEP_C = 5.0
TAU_LO_S, TAU_HI_S = 0.01, 10.0


def base_params(tau_s, closure):
    args = argparse.Namespace(
        mechanism="gri30.yaml", t_min_c=25.0, t_peak_c=1250.0, duty=0.10,
        waveform="trapezoid", ramp_up_fraction=0.05, ramp_down_fraction=0.05,
        pressure_atm=1.0, residence_time_s=tau_s, feed="CH4:1, CO2:1",
        points_per_cycle=200, min_cycles=1, max_cycles=1, cycle_tolerance=1e-7,
        record_cycles=1, period_s=1.0, closure=closure)
    return build_params(args)


def tau_grid(n):
    ratio = TAU_HI_S / TAU_LO_S
    return [TAU_LO_S * ratio ** (i / (n - 1)) for i in range(n)]


def coarse_temperatures():
    n = int(round((T_HI_C - T_LO_C) / COARSE_STEP_C))
    return [T_LO_C + COARSE_STEP_C * i for i in range(n + 1)]


def refine_temperatures(coarse_rows):
    """5 C spacing wherever a coarse neighbour pair crosses the cliff."""
    fine = set()
    for tau, rows in coarse_rows.items():
        ordered = sorted(rows, key=lambda r: r["T_K"])
        for a, b in zip(ordered, ordered[1:]):
            xa, xb = a["ch4_conversion"], b["ch4_conversion"]
            lo, hi = min(xa, xb), max(xa, xb)
            if hi > 0.01 and lo < 0.99 and hi - lo > 0.05:
                t0, t1 = a["T_K"] - 273.15, b["T_K"] - 273.15
                steps = int(round((t1 - t0) / FINE_STEP_C))
                for k in range(1, steps):
                    fine.add((round(t0 + FINE_STEP_C * k, 1), tau))
    return sorted(fine)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mechanism", default="gri30.yaml")
    ap.add_argument("--tau-points", type=int, default=25)
    ap.add_argument("--closure", default="const-pressure", choices=sorted(CLOSURES))
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--shards", type=int, default=1)
    args = ap.parse_args()

    import cantera as ct
    warnings.simplefilter("ignore")

    taus = tau_grid(args.tau_points)
    my_taus = [t for i, t in enumerate(taus) if i % args.shards == args.shard]

    # Resume support: everything already in the file is loaded once, so a
    # restarted shard recomputes nothing and the refinement pass still sees the
    # coarse conversions it needs.
    have = {}
    if args.output.exists():
        for line in args.output.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                have[(round(r["T_C"], 1), round(r["tau_s"], 6))] = r["ch4_conversion"]
    args.output.parent.mkdir(parents=True, exist_ok=True)

    meta = {"generator": "tools/openmkm_dynamic/run_cjh_grid.py",
            "engine": "cantera steady CSTR (same make_reactor as the transient cases)",
            "mechanism": "GRI-Mech 3.0", "closure": args.closure,
            "feed": "CH4:1, CO2:1", "pressure_atm": 1.0,
            "generated": datetime.date.today().isoformat()}

    def emit(stream, T_C, tau, pass_name):
        key = (round(T_C, 1), round(tau, 6))
        if key not in have:
            p = base_params(tau, args.closure)
            r = steady_state(ct, args.mechanism, p, T_C + 273.15)
            row = {"T_C": T_C, "tau_s": tau, "pass": pass_name, **meta,
                   "ch4_conversion": r["ch4_conversion"],
                   "c2_selectivity_carbon": r["c2_selectivity_carbon"],
                   "outlet_molefrac": r["outlet_molefrac"]}
            stream.write(json.dumps(row, separators=(",", ":")) + "\n")
            stream.flush()
            have[key] = r["ch4_conversion"]
        return have[key]

    coarse_rows = {}
    with args.output.open("a") as stream:
        for tau in my_taus:
            rows = [{"T_K": T_C + 273.15,
                     "ch4_conversion": emit(stream, T_C, tau, "coarse")}
                    for T_C in coarse_temperatures()]
            coarse_rows[tau] = rows
            print(f"tau={tau:.4g}s coarse done "
                  f"({sum(1 for r in rows if r['ch4_conversion'] > 0.01)} live)")
        for T_C, tau in refine_temperatures(coarse_rows):
            emit(stream, T_C, tau, "fine")
    print(f"grid complete: {len(have)} points in {args.output}")


if __name__ == "__main__":
    main()
