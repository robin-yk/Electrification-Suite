"""Chemistry-level convergence of the cycle substep grid at the extremes.

check_phase_grid.py bounds the temperature the grid samples. That is
necessary and not sufficient: the question that decides the labels is
whether the composition and the energy per kilogram have stopped moving.
This runs the real Cantera path at twelve extreme conditions, spanning duty
0.02 to 0.85, periods from 0.1 to 10 s and peaks from about 1100 to 1800 C,
against a dense reference grid, and applies the acceptance gates

    Y_C2H2, Y_CO   within 1 percent relative
    kg per kWh     within 2 percent relative
    peak sampled   within 5 K of the element's own peak

The reference is the same integrator at 8x the hot-window resolution and 8x
the cold, so this measures grid convergence and not model agreement.

Run: python tools/openmkm_dynamic/verify_grid_convergence.py [--jobs 4]
"""
import argparse
import json
import os
import sys
import warnings
from multiprocessing import Pool

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CASES = [
    {"voltage": 41.2, "period_s": 10.0, "duty": 0.02, "tau_s": 6.95, "feed_x": 0.60},
    {"voltage": 55.0, "period_s": 0.10, "duty": 0.02, "tau_s": 0.05, "feed_x": 0.60},
    {"voltage": 30.0, "period_s": 1.00, "duty": 0.02, "tau_s": 0.50, "feed_x": 0.45},
    {"voltage": 36.5, "period_s": 7.20, "duty": 0.03, "tau_s": 6.95, "feed_x": 0.60},
    {"voltage": 55.0, "period_s": 0.20, "duty": 0.03, "tau_s": 0.10, "feed_x": 0.75},
    {"voltage": 27.3, "period_s": 2.00, "duty": 0.03, "tau_s": 1.50, "feed_x": 0.50},
    {"voltage": 27.3, "period_s": 7.20, "duty": 0.05, "tau_s": 6.95, "feed_x": 0.75},
    {"voltage": 50.4, "period_s": 0.50, "duty": 0.05, "tau_s": 0.25, "feed_x": 0.50},
    {"voltage": 31.9, "period_s": 5.18, "duty": 0.05, "tau_s": 6.95, "feed_x": 0.55},
    {"voltage": 36.5, "period_s": 7.20, "duty": 0.07, "tau_s": 3.36, "feed_x": 0.65},
    {"voltage": 38.8, "period_s": 1.00, "duty": 0.20, "tau_s": 0.50, "feed_x": 0.60},
    {"voltage": 34.2, "period_s": 0.10, "duty": 0.85, "tau_s": 0.05, "feed_x": 0.70},
]
GATES = {"yield_rel": 0.01, "q_rel": 0.02, "peak_miss_k": 5.0}


def run(job):
    k, case, fine = job
    import cantera as ct
    import run_cstr_design as D
    import run_cstr_case as C
    if fine:
        D.POINTS_PER_CYCLE = 8 * C.HOT_MIN_POINTS * 2
        C.HOT_MIN_POINTS = 8 * 40
        C.PEAK_MISS_TOL_K = 0.5
    pt = {"voltage": case["voltage"], "period_s": case["period_s"],
          "duty": case["duty"], "tau_s": case["tau_s"],
          "feed": f"CH4:{case['feed_x']:.6f}, CO2:{1-case['feed_x']:.6f}"}
    r = D.run_design_case(ct, "gri30.yaml", 998000 + k * 2 + int(fine),
                          "const-pressure", dict(pt))
    o, w = r["outputs"], r["outputs"]["outflow_mass_fractions"]
    return {"k": k, "fine": fine, "converged": r["converged"],
            "substeps": r["inputs"].get("substeps_per_cycle"),
            "x_ch4": o["ch4_conversion"], "C2H2": w["C2H2"], "CO": w["CO"],
            "t_peak_c": r["inputs"]["t_peak_K"] - 273.15}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--out", default=HERE + "/data/wide/grid-convergence-report.json")
    args = ap.parse_args()
    jobs = [(k, c, f) for k, c in enumerate(CASES) for f in (False, True)]
    with Pool(args.jobs) as pool:
        res = pool.map(run, jobs)
    base = {r["k"]: r for r in res if not r["fine"]}
    fine = {r["k"]: r for r in res if r["fine"]}

    rows, failed = [], []
    print(f"{'case':>4} {'duty':>5} {'P':>6} {'subs':>5} {'ref':>6} "
          f"{'C2H2 rel':>9} {'CO rel':>8} {'X rel':>8}")
    for k, c in enumerate(CASES):
        b, f = base[k], fine[k]
        def rel(a, bb):
            return abs(a / bb - 1.0) if abs(bb) > 1e-12 else 0.0
        row = {"case": c, "substeps": b["substeps"], "substeps_reference": f["substeps"],
               "converged": b["converged"] and f["converged"],
               "rel_c2h2": rel(b["C2H2"], f["C2H2"]), "rel_co": rel(b["CO"], f["CO"]),
               "rel_x_ch4": rel(b["x_ch4"], f["x_ch4"])}
        rows.append(row)
        print(f"{k:>4} {c['duty']:>5.2f} {c['period_s']:>6.2f} {b['substeps']:>5} "
              f"{f['substeps']:>6} {row['rel_c2h2']:>9.4f} {row['rel_co']:>8.4f} "
              f"{row['rel_x_ch4']:>8.4f}")
        if (row["rel_c2h2"] > GATES["yield_rel"] or row["rel_co"] > GATES["yield_rel"]
                or not row["converged"]):
            failed.append(k)
    json.dump({"gates": GATES, "reference": "8x hot resolution, 0.5 K peak tolerance",
               "cases": rows, "failed": failed}, open(args.out, "w"), indent=1)
    print(f"\n{len(CASES)-len(failed)} of {len(CASES)} within the 1 percent yield gate")
    print(f"GRID CONVERGENCE -> {args.out}")
    if failed:
        raise SystemExit(f"cases over gate: {failed}")
