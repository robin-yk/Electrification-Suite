#!/usr/bin/env python3
"""Pulse optimization of the intermediate in C1 -> C2 -> C3+, on the real element.

The series network A -> B -> C in a CSTR under a temperature program is the
minimal model of why a short hot pulse protects an intermediate (Railkar and
Vlachos 2024). apps/rphcjh/solver.js integrates it exactly: both steps are
first order, so each time step with the temperature frozen is an exponential
update and one cycle composes to an affine map whose fixed point is the
periodic state. This is that solver ported to Python, driven by the
calibrated carbon-paper element (calibrate_element_si.py, Scheme S1f) and
parameterised by rate constants fitted to AramcoMech 2.0 batch trajectories
(lump_fit.py) rather than the page's illustrative defaults.

The question answered: over voltage, period, duty and residence time, which
pulse gives the most C2 per carbon fed, and how does that compare with the
best steady (CJH) point at the same residence time and with the steady
point drawing the same electrical power? Every candidate uses the same
element, the same loss model and the same chemistry; only the drive moves.

What this is not: it is a uniform-temperature CSTR, which cjh_inversion.py
showed is not the device. The result is the mechanism's ranking of drives
on a prescribed temperature history, to be verified on the full mechanism
at the winning conditions (run_cstr_case.py) before it is quoted as more.

    python3 tools/openmkm_dynamic/series_pulse.py \\
        --lump tools/openmkm_dynamic/data/lump/aramco-ch4-he.json \\
        --output tools/openmkm_dynamic/data/lump/series-pulse-front.json
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from element_drive import (integrate_pulsed_element, profile_function,   # noqa: E402
                           lumped_loss_power, drive_defaults, steady_temperature)

R_GAS = 8.314            # the value apps/rphcjh/solver.js uses; parity with the page
K2C = 273.15
T_REF_K = 1373.15


def rate(t_c, k_ref, ea_kj):
    return k_ref * math.exp(-(ea_kj * 1e3 / R_GAS) * (1.0 / (t_c + K2C) - 1.0 / T_REF_K))


def steady_series(t_c, tau, p):
    """Analytic steady CSTR at one temperature from pure A."""
    k1, k2 = rate(t_c, p["k1_ref"], p["ea1"]), rate(t_c, p["k2_ref"], p["ea2"])
    x_a = 1.0 / (1.0 + k1 * tau)
    x_b = k1 * tau * x_a / (1.0 + k2 * tau)
    return {"avg_a": x_a, "avg_b": x_b, "avg_c": max(0.0, 1.0 - x_a - x_b),
            "conversion": 1.0 - x_a, "s_b": x_b / (1.0 - x_a) if x_a < 1 else 0.0}


def series_periodic(temp_at, tau, p, period=1.0, steps=2000):
    """Periodic state of the series CSTR under temp_at(phase), phase in [0, 1).

    Mirrors integrateSeriesCSTR in apps/rphcjh/solver.js step for step.
    """
    dt = period / steps
    inv_tau = 1.0 / tau
    phases = (np.arange(steps) + 0.5) / steps
    t_c = np.array([temp_at(ph) for ph in phases])
    k1 = p["k1_ref"] * np.exp(-(p["ea1"] * 1e3 / R_GAS) * (1.0 / (t_c + K2C) - 1.0 / T_REF_K))
    k2 = p["k2_ref"] * np.exp(-(p["ea2"] * 1e3 / R_GAS) * (1.0 / (t_c + K2C) - 1.0 / T_REF_K))
    lam_a, lam_b = inv_tau + k1, inv_tau + k2
    beta_a, beta_b = np.exp(-lam_a * dt), np.exp(-lam_b * dt)
    x_ass = inv_tau / lam_a
    close = np.abs(lam_b - lam_a) < 1e-9 * (lam_a + lam_b)
    g = np.where(close, dt * beta_a, (beta_a - beta_b) / np.where(close, 1.0, lam_b - lam_a))
    alpha_a = x_ass * (1.0 - beta_a)
    src_const = k1 * x_ass * ((1.0 - beta_b) / lam_b - g)
    src_a = k1 * g

    a0, a_a, b0, b_a, b_b = 0.0, 1.0, 0.0, 0.0, 1.0
    for i in range(steps):
        na0, naa = alpha_a[i] + beta_a[i] * a0, beta_a[i] * a_a
        b0 = beta_b[i] * b0 + src_const[i] + src_a[i] * a0
        b_a = beta_b[i] * b_a + src_a[i] * a_a
        b_b = beta_b[i] * b_b
        a0, a_a = na0, naa
    x_a0 = a0 / (1.0 - a_a)
    x_b0 = (b0 + b_a * x_a0) / (1.0 - b_b)

    x_a, x_b, avg_a, avg_b = x_a0, x_b0, 0.0, 0.0
    peak_b, min_b = -np.inf, np.inf
    for i in range(steps):
        pa, pb = x_a, x_b
        x_a = alpha_a[i] + beta_a[i] * x_a
        x_b = beta_b[i] * x_b + src_const[i] + src_a[i] * pa
        avg_a += (pa + x_a) / 2 / steps
        avg_b += (pb + x_b) / 2 / steps
        peak_b, min_b = max(peak_b, x_b), min(min_b, x_b)
    conv = 1.0 - avg_a
    return {"avg_a": avg_a, "avg_b": avg_b, "avg_c": max(0.0, 1.0 - avg_a - avg_b),
            "conversion": conv, "s_b": avg_b / conv if conv > 0 else 0.0,
            "peak_b": peak_b, "min_b": min_b}


def element_profile(voltage, period, duty, cal, start_c=None):
    r = integrate_pulsed_element(
        voltage=voltage, period=period, duty=duty,
        loss_scale=cal["loss_scale"], cp_scale=cal["cp_scale"],
        contact_conductance=cal["contact_w_per_k"], start_c=start_c)
    return r, profile_function(r)


def steady_power(t_c, cal):
    p = drive_defaults(loss_scale=cal["loss_scale"],
                       contact_conductance=cal["contact_w_per_k"])
    return lumped_loss_power(t_c, p)


def load_lump(path):
    d = json.loads(Path(path).read_text())
    s = d["series"]
    return {"k1_ref": s["k1_ref"], "ea1": s["ea1_kj_mol"],
            "k2_ref": s["k2_ref"], "ea2": s["ea2_kj_mol"], "source": str(path)}


def cjh_front(p, cal, taus, temps):
    """Best steady yield at each tau, and the steady yield against power."""
    rows = []
    for tau in taus:
        for t_c in temps:
            s = steady_series(t_c, tau, p)
            rows.append({"t_c": t_c, "tau_s": tau, "p_avg_w": steady_power(t_c, cal), **s})
    return rows


def pulse_front(p, cal, voltages, periods, duties, taus, log=print):
    rows, n, t0 = [], 0, time.time()
    total = len(voltages) * len(periods) * len(duties)
    for period in periods:
        for duty in duties:
            start = None
            for voltage in voltages:
                r, at = element_profile(voltage, period, duty, cal, start_c=start)
                start = r["t_min_c"]
                n += 1
                if not r["converged"]:
                    continue
                for tau in taus:
                    s = series_periodic(at, tau, p, period=period)
                    rows.append({"voltage_v": voltage, "period_s": period, "duty": duty,
                                 "tau_s": tau, "t_peak_c": r["t_peak_c"],
                                 "t_avg_c": r["t_avg_c"], "t_min_c": r["t_min_c"],
                                 "p_avg_w": r["p_avg_w"], **s})
            if n % 20 == 0:
                log(f"  {n}/{total} element trajectories, {time.time() - t0:.0f} s")
    return rows


def pareto(rows, key_max, key_min):
    """Rows not dominated in (more key_max, less key_min)."""
    rs = sorted(rows, key=lambda r: (r[key_min], -r[key_max]))
    out, best = [], -np.inf
    for r in rs:
        if r[key_max] > best:
            out.append(r)
            best = r[key_max]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lump", type=Path, required=True,
                    help="lump_fit.py output with the fitted series constants")
    ap.add_argument("--voltage", nargs="+", type=float,
                    default=list(np.round(np.arange(30, 81, 5), 1)))
    ap.add_argument("--period-s", nargs="+", type=float,
                    default=[0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0])
    ap.add_argument("--duty", nargs="+", type=float,
                    default=[0.02, 0.05, 0.1, 0.2, 0.35, 0.5])
    ap.add_argument("--tau-s", nargs="+", type=float,
                    default=[0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0])
    ap.add_argument("--cjh-temperature", nargs="+", type=float,
                    default=list(range(900, 1801, 25)))
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()

    from calibrate_element_si import calibrate
    cal = calibrate()
    p = load_lump(args.lump)
    print(f"# series constants from {args.lump}: k1Ref {p['k1_ref']:.3g}/s Ea1 {p['ea1']:.0f}, "
          f"k2Ref {p['k2_ref']:.3g}/s Ea2 {p['ea2']:.0f} kJ/mol")
    print(f"# element: loss_scale {cal['loss_scale']:.3f} cp_scale {cal['cp_scale']:.3f} "
          f"contact {1e3 * cal['contact_w_per_k']:.1f} mW/K")

    cjh = cjh_front(p, cal, args.tau_s, args.cjh_temperature)
    pulses = pulse_front(p, cal, args.voltage, args.period_s, args.duty, args.tau_s)

    best_cjh = max(cjh, key=lambda r: r["avg_b"])
    best_pulse = max(pulses, key=lambda r: r["avg_b"])
    print("\nbest C2 yield (C2 carbon per carbon fed), any residence time")
    print(f"  steady: yield {100 * best_cjh['avg_b']:.2f} %  at {best_cjh['t_c']:.0f} C, "
          f"tau {best_cjh['tau_s']} s, X {100 * best_cjh['conversion']:.1f} %, "
          f"S_C2 {100 * best_cjh['s_b']:.1f} %, {best_cjh['p_avg_w']:.0f} W")
    print(f"  pulse:  yield {100 * best_pulse['avg_b']:.2f} %  at {best_pulse['voltage_v']:.0f} V, "
          f"period {best_pulse['period_s']} s, duty {best_pulse['duty']}, tau {best_pulse['tau_s']} s, "
          f"peak {best_pulse['t_peak_c']:.0f} / avg {best_pulse['t_avg_c']:.0f} / "
          f"min {best_pulse['t_min_c']:.0f} C, X {100 * best_pulse['conversion']:.1f} %, "
          f"S_C2 {100 * best_pulse['s_b']:.1f} %, {best_pulse['p_avg_w']:.0f} W")

    print("\nbest yield at each residence time, steady against pulse")
    print(f"  {'tau s':>6} {'steady %':>9} {'T C':>5} {'W':>4} | {'pulse %':>8} {'V':>3} "
          f"{'period':>7} {'duty':>5} {'peak':>5} {'avg':>5} {'W':>4} | {'gain':>5}")
    per_tau = []
    for tau in args.tau_s:
        c = max((r for r in cjh if r["tau_s"] == tau), key=lambda r: r["avg_b"])
        q = max((r for r in pulses if r["tau_s"] == tau), key=lambda r: r["avg_b"], default=None)
        if q is None:
            continue
        gain = q["avg_b"] / c["avg_b"] if c["avg_b"] > 0 else float("nan")
        per_tau.append({"tau_s": tau, "steady": c, "pulse": q, "gain": gain})
        print(f"  {tau:6.2f} {100 * c['avg_b']:9.2f} {c['t_c']:5.0f} {c['p_avg_w']:4.0f} | "
              f"{100 * q['avg_b']:8.2f} {q['voltage_v']:3.0f} {q['period_s']:7.2f} {q['duty']:5.2f} "
              f"{q['t_peak_c']:5.0f} {q['t_avg_c']:5.0f} {q['p_avg_w']:4.0f} | {gain:5.2f}")

    print("\nyield against electrical power, Pareto fronts (yield up, power down)")
    fc = pareto(cjh, "avg_b", "p_avg_w")
    fp = pareto(pulses, "avg_b", "p_avg_w")
    print(f"  steady front {len(fc)} points, pulse front {len(fp)} points")
    for w in (40, 60, 80, 100, 150, 200):
        cb = max((r["avg_b"] for r in cjh if r["p_avg_w"] <= w), default=0.0)
        pb = max((r["avg_b"] for r in pulses if r["p_avg_w"] <= w), default=0.0)
        print(f"  under {w:3d} W: steady {100 * cb:6.2f} %  pulse {100 * pb:6.2f} %  "
              f"gain {pb / cb if cb > 0 else float('nan'):5.2f}")

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(
            {"series": p, "element": {k: cal[k] for k in ("loss_scale", "cp_scale", "contact_w_per_k")},
             "grid": {"voltage": args.voltage, "period_s": args.period_s, "duty": args.duty,
                      "tau_s": args.tau_s, "cjh_temperature": args.cjh_temperature},
             "best_steady": best_cjh, "best_pulse": best_pulse, "per_tau": per_tau,
             "steady_front": fc, "pulse_front": fp,
             "steady": cjh, "pulses": pulses}, indent=1) + "\n")
        print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
