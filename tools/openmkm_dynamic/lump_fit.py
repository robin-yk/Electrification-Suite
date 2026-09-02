#!/usr/bin/env python3
"""Fit the lumped C1 -> C2 -> C3+ series to AramcoMech batch trajectories.

The pulse question for methane is the intermediate's question: C2 (ethane,
ethylene, acetylene) forms from methane and is consumed into C3+ (C4, C6,
benzene, everything heavier), and a short hot pulse can favour the first
step over the second when their activation energies differ. The series
model A -> B -> C in apps/rphcjh/solver.js carries that argument with four
numbers: two activation energies and two rate constants at 1100 C. Those
defaults are illustrative. This script fits them to the full mechanism.

Data: a constant-temperature, constant-pressure batch of the paper's feed
(5 percent CH4 in helium, 1 bar) at each temperature, sampled at log-spaced
times; the carbon is lumped into C1 (methane), C2 (every two-carbon species)
and C3+ (everything heavier). At each temperature k1 comes from the methane
decay, first order, and k2 from a least-squares fit of the analytic A -> B
-> C solution to the C2 trajectory with k1 held. Then Arrhenius lines
through the per-temperature constants, weighted equally, and the residual
of every point reported. First order in both steps is the model's
assumption, not the mechanism's, and the residuals say how far it holds.

    python3 tools/openmkm_dynamic/lump_fit.py \\
        --mechanism tools/cantera/mechanisms/aramco20.yaml \\
        --temperature 1000 1100 1200 1300 1400 1500 1600 1700 1800 \\
        --output tools/openmkm_dynamic/data/lump/aramco-ch4-he.json
"""
import argparse
import json
import math
import sys
import time
import warnings
from pathlib import Path

import numpy as np

PRESSURE_PA = 1e5
CH4_FRACTION = 0.05
R_GAS = 8.314462618
T_REF_K = 1373.15          # 1100 C, the anchor solver.js uses


def batch_trajectory(ct, mech, t_c, feed, t_first=1e-7, t_max=100.0, per_decade=12,
                     c1_stop=0.02):
    """Log-spaced samples from t_first until methane is nearly gone or t_max.

    The window is found by integrating, not guessed from a rate line: at high
    temperature a guessed window landed inside the radical induction period
    and read it as a slow rate.
    """
    gas = ct.Solution(mech)
    gas.TPX = t_c + 273.15, PRESSURE_PA, feed
    n_c = np.array([gas.n_atoms(k, "C") for k in range(gas.n_species)], float)
    lump = np.where(n_c == 1, 0, np.where(n_c == 2, 1, np.where(n_c >= 3, 2, -1)))
    r = ct.IdealGasConstPressureReactor(gas, energy="off")
    net = ct.ReactorNet([r])
    out, t = [], t_first
    while t <= t_max:
        net.advance(t)
        carbon = n_c * r.thermo.X
        tot = carbon.sum()
        fr = [float(carbon[lump == g].sum() / tot) for g in (0, 1, 2)]
        out.append([t] + fr)
        if fr[0] < c1_stop:
            break
        t *= 10 ** (1.0 / per_decade)
    return np.array(out)


def series_solution(t, k1, k2):
    """A -> B -> C from pure A: the B fraction at time t."""
    if abs(k1 - k2) < 1e-9 * (k1 + k2):
        return k1 * t * np.exp(-k1 * t)
    return k1 / (k2 - k1) * (np.exp(-k1 * t) - np.exp(-k2 * t))


def fit_temperature(traj):
    """k1 from the methane decay past induction, k2 from C2 with k1 held.

    Methane pyrolysis has an induction period while the radical pool builds,
    then a first-order decay. The line ln C1 = a - k1 t is fitted between 10
    and 60 percent conversion; its intercept gives the induction time
    t0 = a / k1, and the series solution is evaluated from t0. A pulse
    shorter than t0 at its own temperature does not see the fitted rate,
    which is a caveat the optimizer inherits.
    """
    t, c1, c2 = traj[:, 0], traj[:, 1], traj[:, 2]
    m = (c1 < 0.9) & (c1 > 0.4)
    if m.sum() < 3:
        m = (c1 < 0.97) & (c1 > 0.2)
    if m.sum() < 2:
        raise SystemExit("too few points in the decay window; widen the sampling")
    A = np.vstack([np.ones(m.sum()), -t[m]]).T
    (a, k1), *_ = np.linalg.lstsq(A, np.log(c1[m]), rcond=None)
    k1 = float(k1)
    t0 = max(0.0, float(a / k1))
    ts = np.clip(t - t0, 0.0, None)

    def misfit(lk2):
        return float(np.sum((series_solution(ts, k1, math.exp(lk2)) - c2) ** 2))
    lo, hi = math.log(k1) - 12.0, math.log(k1) + 6.0
    g = (math.sqrt(5) - 1) / 2
    a, b = hi - g * (hi - lo), lo + g * (hi - lo)
    fa, fb = misfit(a), misfit(b)
    for _ in range(80):
        if fa < fb:
            hi, b, fb = b, a, fa
            a = hi - g * (hi - lo)
            fa = misfit(a)
        else:
            lo, a, fa = a, b, fb
            b = lo + g * (hi - lo)
            fb = misfit(b)
    k2 = math.exp(0.5 * (lo + hi))
    pred = series_solution(ts, k1, k2)
    return {"k1": k1, "k2": k2, "induction_s": t0,
            "c2_rms": float(np.sqrt(np.mean((pred - c2) ** 2))),
            "c2_peak_model": float(pred.max()), "c2_peak_mech": float(c2.max()),
            "c1_rms_log": float(np.sqrt(np.mean((np.log(c1[m]) - a + k1 * t[m]) ** 2)))}


def arrhenius(temps_c, ks):
    """ln k = ln kRef - Ea/R (1/T - 1/T_REF): returns (kRef at 1100 C, Ea kJ/mol, rms in ln k)."""
    x = np.array([1 / (t + 273.15) - 1 / T_REF_K for t in temps_c])
    y = np.log(np.array(ks))
    A = np.vstack([np.ones_like(x), -x]).T
    (lnk, ea_over_r), *_ = np.linalg.lstsq(A, y, rcond=None)
    resid = y - A @ np.array([lnk, ea_over_r])
    return {"k_ref": float(math.exp(lnk)), "ea_kj_mol": float(ea_over_r * R_GAS / 1e3),
            "rms_ln_k": float(np.sqrt(np.mean(resid ** 2))),
            "max_abs_ln_k": float(np.abs(resid).max())}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mechanism", default="gri30.yaml")
    ap.add_argument("--diluent", default="HE",
                    help="GRI has no helium; use AR there")
    ap.add_argument("--temperature", nargs="+", type=float,
                    default=[1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800])
    ap.add_argument("--t-max-s", type=float, default=100.0)
    ap.add_argument("--fit-above-c", type=float, default=None,
                    help="Arrhenius lines through the temperatures at or above this; "
                         "every temperature is still run and reported")
    ap.add_argument("--per-decade", type=int, default=12)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()
    import cantera as ct
    warnings.simplefilter("ignore")

    feed = f"CH4:{CH4_FRACTION}, {args.diluent}:{1 - CH4_FRACTION}"
    per_t = []
    print(f"# {args.mechanism}  feed {feed}  {PRESSURE_PA / 1e5:.0f} bar")
    print(f"  {'T_C':>5} {'k1 1/s':>10} {'k2 1/s':>10} {'induct s':>9} {'C2 peak mech':>13} "
          f"{'C2 peak fit':>12} {'C2 rms':>7} {'wall':>6}")
    for t_c in args.temperature:
        t0 = time.time()
        traj = batch_trajectory(ct, args.mechanism, t_c, feed, t_max=args.t_max_s,
                                per_decade=args.per_decade)
        fit = fit_temperature(traj)
        wall = time.time() - t0
        per_t.append({"t_c": t_c, "t_end_s": float(traj[-1, 0]), **fit,
                      "trajectory": traj.tolist(), "wall_s": wall})
        print(f"  {t_c:5.0f} {fit['k1']:10.3e} {fit['k2']:10.3e} {fit['induction_s']:9.2e} "
              f"{100 * fit['c2_peak_mech']:13.1f} {100 * fit['c2_peak_model']:12.1f} "
              f"{100 * fit['c2_rms']:7.2f} {wall:6.1f}")
        sys.stdout.flush()

    used = [p for p in per_t if args.fit_above_c is None or p["t_c"] >= args.fit_above_c]
    temps = [p["t_c"] for p in used]
    a1 = arrhenius(temps, [p["k1"] for p in used])
    a2 = arrhenius(temps, [p["k2"] for p in used])
    print(f"\nArrhenius lines through {len(used)} of {len(per_t)} temperatures"
          + (f" ({args.fit_above_c:.0f} C and above)" if args.fit_above_c is not None else ""))
    print(f"C1 -> C2: k1Ref {a1['k_ref']:.3g} 1/s at 1100 C, Ea {a1['ea_kj_mol']:.0f} kJ/mol, "
          f"rms {a1['rms_ln_k']:.2f} in ln k (max {a1['max_abs_ln_k']:.2f})")
    print(f"C2 -> C3+: k2Ref {a2['k_ref']:.3g} 1/s at 1100 C, Ea {a2['ea_kj_mol']:.0f} kJ/mol, "
          f"rms {a2['rms_ln_k']:.2f} in ln k (max {a2['max_abs_ln_k']:.2f})")
    print(f"solver.js defaults: ea1 400, k1Ref 30; ea2 80, k2Ref 1")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(
            {"mechanism": args.mechanism, "feed": feed, "pressure_Pa": PRESSURE_PA,
             "t_ref_c": T_REF_K - 273.15, "lumps": ["C1: CH4", "C2: every two-carbon species",
                                                    "C3+: every species with three or more carbons"],
             "series": {"k1_ref": a1["k_ref"], "ea1_kj_mol": a1["ea_kj_mol"],
                        "k2_ref": a2["k_ref"], "ea2_kj_mol": a2["ea_kj_mol"],
                        "fit_k1": a1, "fit_k2": a2,
                        "fitted_temperatures_c": temps},
             "per_temperature": per_t}, indent=1) + "\n")
        print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
