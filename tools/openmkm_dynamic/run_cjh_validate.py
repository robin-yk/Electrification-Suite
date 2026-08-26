#!/usr/bin/env python3
"""Does the CJH map interpolate correctly BETWEEN its grid points?

The surrogate's baseline is read off the committed (T, tau) grid, so every
downstream number inherits the grid's interpolation error -- and a grid is only
ever checked at its own nodes unless someone asks otherwise. This asks: 200
points drawn between the nodes (seeded, reproducible), each solved with the same
steady CSTR the grid used, then compared against what interpolation of the
committed grid claims for that point.

Interpolation matches how the map is meant to be read: bilinear in
(T, log tau), with conversion taken through a logit so the ignition cliff is
interpolated as an odds ratio rather than clipped, and X = 0 below the 400 C
floor taken as fact (the grid is identically zero far above it).

Run: python tools/openmkm_dynamic/run_cjh_validate.py [--points 200] [--output F]
"""
import argparse
import json
import math
import random
import sys
import warnings
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from run_cstr_pilot import steady_state          # noqa: E402
from run_cjh_grid import base_params             # noqa: E402

GRID = HERE / "data" / "canonical" / "cjh-grid.jsonl"
T_LO_C, T_HI_C = 400.0, 1850.0
TAU_LO_S, TAU_HI_S = 0.01, 10.0
EPS = 1e-9


def load_grid():
    columns = {}
    for line in GRID.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        columns.setdefault(round(r["tau_s"], 12), {})[r["T_C"]] = r["ch4_conversion"]
    taus = sorted(columns)
    return taus, {tau: sorted(columns[tau].items()) for tau in taus}


def logit(x):
    x = min(max(x, EPS), 1 - EPS)
    return math.log(x / (1 - x))


def unlogit(v):
    return 1 / (1 + math.exp(-v))


def interp_column(column, T):
    if T <= column[0][0]:
        return column[0][1]
    if T >= column[-1][0]:
        return column[-1][1]
    for i in range(1, len(column)):
        if T <= column[i][0]:
            (t0, x0), (t1, x1) = column[i - 1], column[i]
            f = (T - t0) / (t1 - t0)
            # Logit interpolation would fabricate a cliff crossing between an
            # exactly-zero node and a live one; interpolate linearly there.
            if x0 <= EPS or x1 <= EPS:
                return x0 + (x1 - x0) * f
            return unlogit(logit(x0) + (logit(x1) - logit(x0)) * f)
    return column[-1][1]


def interp_map(taus, columns, T, tau):
    lt = math.log(tau)
    if tau <= taus[0]:
        return interp_column(columns[taus[0]], T)
    if tau >= taus[-1]:
        return interp_column(columns[taus[-1]], T)
    for i in range(1, len(taus)):
        if tau <= taus[i]:
            a, b = taus[i - 1], taus[i]
            f = (lt - math.log(a)) / (math.log(b) - math.log(a))
            xa, xb = interp_column(columns[a], T), interp_column(columns[b], T)
            if xa <= EPS or xb <= EPS:
                return xa + (xb - xa) * f
            return unlogit(logit(xa) + (logit(xb) - logit(xa)) * f)
    return interp_column(columns[taus[-1]], T)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--points", type=int, default=200)
    ap.add_argument("--seed", type=int, default=20260826)
    ap.add_argument("--output", type=Path,
                    default=HERE / "data" / "cjh-grid-validation.json")
    args = ap.parse_args()

    import cantera as ct
    warnings.simplefilter("ignore")

    taus, columns = load_grid()
    rng = random.Random(args.seed)
    rows = []
    for k in range(args.points):
        T = rng.uniform(T_LO_C, T_HI_C)
        tau = math.exp(rng.uniform(math.log(TAU_LO_S), math.log(TAU_HI_S)))
        p = base_params(tau, "const-pressure")
        truth = steady_state(ct, "gri30.yaml", p, T + 273.15)["ch4_conversion"]
        claim = interp_map(taus, columns, T, tau)
        rows.append({"T_C": round(T, 3), "tau_s": tau,
                     "cantera": truth, "interpolated": claim,
                     "abs_error": abs(claim - truth)})
        if (k + 1) % 25 == 0:
            print(f"{k + 1}/{args.points} done, worst so far "
                  f"{max(r['abs_error'] for r in rows):.4f}")

    errors = sorted(r["abs_error"] for r in rows)
    n = len(errors)
    summary = {
        "points": n, "seed": args.seed,
        "median_abs_error": errors[n // 2],
        "p95_abs_error": errors[int(0.95 * n) - 1],
        "max_abs_error": errors[-1],
        "worst": max(rows, key=lambda r: r["abs_error"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"summary": summary, "rows": rows}, indent=1) + "\n")
    print(json.dumps(summary, indent=1))
    verdict = "PASS" if summary["p95_abs_error"] < 0.02 else "REVIEW"
    print(f"{verdict}: p95 |X_interp - X_cantera| = {summary['p95_abs_error']:.4f} "
          f"(gate 0.02, the surrogate acceptance bound)")


if __name__ == "__main__":
    main()
