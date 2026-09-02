#!/usr/bin/env python3
"""Calibrate the lumped element model against Scheme S1f of the SI.

`element_drive.py` integrates the CFP element from a voltage, a period and a
duty. An earlier version of this script fitted it to the two numbers that
Scheme S1e offers (one peak, one floor) and then declared victory when the
model landed within 3 percent of the SI's stated operating point. Two numbers
fit two parameters exactly; that was not a calibration, it was a solve. It is
kept in the git history as a warning.

Scheme S1f is the panel to use. Against time-averaged electrical power it
plots the steady-state temperature under continuous heating (a line, read
here at 29 powers), and under rapid pulse heating the peak and the cycle-mean
temperature (five powers each). digitize_s1f.py turns the figure into
data/si/scheme-s1f.json; this script reads that file and never types a
temperature.

The fit is in two stages because the physics separates that way.

Steady state has no thermal mass in it: input power equals the lumped loss at
that temperature. So the steady line fixes the loss function alone. The model's
loss is radiation from the strip's outline, scaled by loss_scale, plus the
helium's sensible heat, plus an optional linear term for conduction into the
copper clamps that hold the element. Both loss_scale and that conductance are
fitted here by linear least squares; the measured line is neither a pure T^4
nor a pure straight line, and one parameter cannot follow it.

The pulsed points then test the thermal mass, which the steady fit cannot
touch. At each measured power the model is driven to the same reported power
and its peak and mean are compared with the figure. If they miss with a bias,
cp_scale is fitted to the peaks; the mass is stated in the SI and the cp table
is generic carbon fibre, so this is the honest knob.

Power on the figure's x axis is the SI's bookkeeping quantity for pulses,
P = V^2 t_heating / (R(T_avg) t_cycle), with the resistance evaluated at the
cycle-mean temperature (SI, Experimental Setup). The model computes both that
and the actual integrated electrical power; the comparison uses the SI's
definition so the axis means the same thing on both sides.

    python3 tools/openmkm_dynamic/calibrate_element_si.py

The operating point of the kinetics campaigns is stated as 70 V, T_peak about
1800 C and T_avg about 880 C (Fig. S9 caption). Those three numbers do not
agree with each other under the SI's own power formula: 70 V comes to 68 W,
and on Scheme S1f 68 W reaches a peak near 1560 C, while the 1780 C point sits
at 91 W, which the formula turns into 81 V on a 75 V supply. The temperatures
are what the IR camera measured and the voltage is a setting, so the
operating point is defined here by its temperatures, and the voltage the
model needs to reach them is an output.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from element_drive import (K2C, SIGMA_SB, CFP_ELEMENT, drive_defaults,
                           integrate_pulsed_element, lumped_loss_power,
                           steady_temperature)

HERE = Path(__file__).resolve().parent
S1F_JSON = HERE / "data" / "si" / "scheme-s1f.json"

# Fig. S11b of the SI, continuous heating: the figure's own power-law fit of
# the cycle-mean temperature against power, valid over the plotted range. A
# second steady data set, used to say how well the SI agrees with itself.
S11B_FIT = {"a": 202.24, "n": 0.3525, "p_min_w": 65.0, "p_max_w": 275.0}

# Operating point of Fig. S9 and Table S1, from the Fig. S9 caption.
OP_VOLTAGE_V = 70.0
OP_PEAK_C = 1800.0
OP_AVG_C = 880.0

PERIOD_S = 1.0
DUTY = 0.05


def bisect(f, lo, hi, tol=1e-4, max_iter=200):
    """Root of a monotone f on [lo, hi]; no scipy on the CI runner."""
    f_lo, f_hi = f(lo), f(hi)
    if f_lo == 0.0:
        return lo
    if f_hi == 0.0:
        return hi
    if (f_lo > 0) == (f_hi > 0):
        raise ValueError(f"root not bracketed on [{lo}, {hi}]: "
                         f"f(lo)={f_lo:.6g}, f(hi)={f_hi:.6g}")
    for _ in range(max_iter):
        mid = 0.5 * (lo + hi)
        f_mid = f(mid)
        if f_mid == 0.0 or (hi - lo) < tol:
            return mid
        if (f_mid > 0) == (f_lo > 0):
            lo, f_lo = mid, f_mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def secant(f, x0, x1, tol, max_iter=30, lo=None, hi=None):
    """Root of a smooth monotone f by the secant method, bracket-guarded.

    The pulsed element is expensive to integrate, and bisection to 1e-3 V
    over a 200 V bracket costs 18 integrations per root. The functions here
    are smooth and nearly linear in the variable, so a secant step lands in
    three or four. A step that leaves [lo, hi] is replaced by the midpoint.
    """
    f0, f1 = f(x0), f(x1)
    for _ in range(max_iter):
        if f1 == f0:
            break
        x2 = x1 - f1 * (x1 - x0) / (f1 - f0)
        if lo is not None and not (lo <= x2 <= hi):
            x2 = 0.5 * (x0 + x1)
        if abs(x2 - x1) < tol:
            return x2
        x0, f0, x1, f1 = x1, f1, x2, f(x2)
    return x1


_RUN_CACHE = {}


def load_s1f():
    with open(S1F_JSON) as f:
        return json.load(f)


def run(voltage, loss_scale, cp_scale=1.0, contact=0.0, period=PERIOD_S, duty=DUTY):
    key = (round(voltage, 5), round(loss_scale, 8), round(cp_scale, 8), round(contact, 10),
           round(period, 8), round(duty, 8))
    if key not in _RUN_CACHE:
        # Start from the floor of the last run at this parameter set: the
        # periodic state is reached in fewer cycles than from ambient.
        start = None
        for k, r in _RUN_CACHE.items():
            if k[1:] == key[1:]:
                start = r["t_min_c"]
        _RUN_CACHE[key] = integrate_pulsed_element(
            voltage=voltage, period=period, duty=duty, loss_scale=loss_scale,
            cp_scale=cp_scale, contact_conductance=contact, start_c=start)
    return _RUN_CACHE[key]


def fit_steady(steady, with_contact):
    """Least squares on P = ls * rad(T) + h * (T - Ta) + gas(T).

    Linear in (ls, h), so this is one solve, not a search. Returns the fitted
    parameters and the temperature residuals of the fitted loss curve.
    """
    p0 = drive_defaults()
    T = np.array([s["t_c"] for s in steady])
    P = np.array([s["power_w"] for s in steady])
    tk, tak = T + K2C, p0["ambient_c"] + K2C
    el = CFP_ELEMENT
    rad = SIGMA_SB * el["emissivity"] * 2 * el["length"] * el["width"] * (tk ** 4 - tak ** 4)
    gas = p0["gas_capacity_rate"] * np.maximum(0.0, T - p0["gas_inlet_c"])
    cols = [rad, T - p0["ambient_c"]] if with_contact else [rad]
    A = np.column_stack(cols)
    x, *_ = np.linalg.lstsq(A, P - gas, rcond=None)
    ls = float(x[0])
    h = float(x[1]) if with_contact else 0.0
    t_model = np.array([steady_temperature(pw, loss_scale=ls, contact_conductance=h)
                        for pw in P])
    resid = t_model - T
    return {"loss_scale": ls, "contact_w_per_k": h,
            "rms_c": float(np.sqrt(np.mean(resid ** 2))),
            "max_abs_c": float(np.max(np.abs(resid))),
            "bias_c": float(np.mean(resid)), "n": int(len(T))}


def s11b_against_model(ls, h):
    """How far the SI's other steady data set sits from the fitted loss."""
    P = np.linspace(S11B_FIT["p_min_w"], S11B_FIT["p_max_w"], 8)
    T_s11 = S11B_FIT["a"] * P ** S11B_FIT["n"]
    T_mod = np.array([steady_temperature(pw, loss_scale=ls, contact_conductance=h) for pw in P])
    d = T_mod - T_s11
    return {"rms_c": float(np.sqrt(np.mean(d ** 2))), "bias_c": float(np.mean(d)),
            "max_abs_c": float(np.max(np.abs(d)))}


def voltage_for_power(p_w, key, ls, cp, h):
    """The drive whose `key` power (reported or integrated) equals p_w.

    Reported power is close to V^2 duty / R, so the square root of the target
    times a typical resistance is a good first guess.
    """
    v0 = (p_w * 3.5 / DUTY) ** 0.5
    return secant(lambda v: run(v, ls, cp, h)[key] - p_w, v0, 1.05 * v0,
                  tol=1e-3, lo=5.0, hi=200.0)


def check_pulsed(data, ls, cp, h, key="p_reported_w"):
    """Drive the model to each measured power; compare peak and mean."""
    rows = []
    for pk, av in zip(data["pulsed_peak"], data["pulsed_avg"]):
        p_w = 0.5 * (pk["power_w"] + av["power_w"])
        v = voltage_for_power(p_w, key, ls, cp, h)
        r = run(v, ls, cp, h)
        rows.append({"power_w": p_w, "voltage_v": v,
                     "t_peak_meas_c": pk["t_c"], "t_peak_model_c": r["t_peak_c"],
                     "t_avg_meas_c": av["t_c"], "t_avg_model_c": r["t_avg_c"],
                     "t_min_model_c": r["t_min_c"],
                     "p_avg_w": r["p_avg_w"], "p_reported_w": r["p_reported_w"]})
    dpk = np.array([r["t_peak_model_c"] - r["t_peak_meas_c"] for r in rows])
    dav = np.array([r["t_avg_model_c"] - r["t_avg_meas_c"] for r in rows])
    return {"rows": rows, "power_key": key,
            "peak_rms_c": float(np.sqrt(np.mean(dpk ** 2))), "peak_bias_c": float(dpk.mean()),
            "avg_rms_c": float(np.sqrt(np.mean(dav ** 2))), "avg_bias_c": float(dav.mean())}


def fit_cp_scale(data, ls, h, key):
    """cp_scale at which the pulsed peaks have no bias against the figure.

    More thermal mass means a lower peak at the same power, so the bias is
    monotone in cp_scale and one bisection finds it.
    """
    return secant(lambda cp: check_pulsed(data, ls, cp, h, key)["peak_bias_c"],
                  1.0, 1.2, tol=1e-3, lo=0.3, hi=3.0)


def operating_point(ls, cp, h, peak_c, period=PERIOD_S, duty=DUTY):
    """The voltage at which the element peaks at peak_c on this waveform.

    The peak is set by the energy per pulse against a T^4 loss, so the
    starting guess scales the 1 Hz, 5 percent pair by the on-time.
    """
    scale = (PERIOD_S * DUTY / (period * duty)) ** 0.5
    v = secant(lambda vv: run(vv, ls, cp, h, period, duty)["t_peak_c"] - peak_c,
               65.0 * scale, 75.0 * scale, tol=1e-3, lo=5.0, hi=400.0)
    r = run(v, ls, cp, h, period, duty)
    return {"voltage_v": v, "period_s": period, "duty": duty,
            "t_peak_c": r["t_peak_c"], "t_min_c": r["t_min_c"],
            "t_avg_c": r["t_avg_c"], "p_avg_w": r["p_avg_w"],
            "p_reported_w": r["p_reported_w"]}


def calibrate(with_contact=True, fit_cp=True, power_key="p_reported_w"):
    """The full fit. Returns a dict; the element parameters are the first keys."""
    data = load_s1f()
    st = fit_steady(data["steady"], with_contact)
    ls, h = st["loss_scale"], st["contact_w_per_k"]
    cp = fit_cp_scale(data, ls, h, power_key) if fit_cp else 1.0
    pulsed = check_pulsed(data, ls, cp, h, power_key)
    return {"loss_scale": ls, "contact_w_per_k": h, "cp_scale": cp,
            "steady": st, "s11b": s11b_against_model(ls, h), "pulsed": pulsed,
            "operating_point": operating_point(ls, cp, h, OP_PEAK_C),
            "stated_voltage": {**{"voltage_v": OP_VOLTAGE_V},
                               **{k: v for k, v in run(OP_VOLTAGE_V, ls, cp, h).items()
                                  if k != "samples"}}}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--no-contact", action="store_true",
                    help="radiation-only loss: one parameter instead of two")
    ap.add_argument("--no-cp-fit", action="store_true",
                    help="keep the SI mass and the cp table as they are")
    ap.add_argument("--power-key", default="p_reported_w",
                    choices=["p_reported_w", "p_avg_w"],
                    help="which model power is matched to the figure's axis")
    # The fit's own residual is 59 C on the peaks (the 91 W point alone is
    # +108 C, and it sits under the IR camera's 1800 C ceiling, which may be
    # the reason). The guard is set just above that so a change to
    # element_drive.py that makes the fit worse fails here.
    ap.add_argument("--tolerance-c", type=float, default=65.0,
                    help="pulsed RMS above this, on peak or mean, exits nonzero")
    args = ap.parse_args()

    cal = calibrate(not args.no_contact, not args.no_cp_fit, args.power_key)
    if args.json:
        print(json.dumps(cal, indent=1))
    else:
        st, pu, op, sv = cal["steady"], cal["pulsed"], cal["operating_point"], cal["stated_voltage"]
        print(f"Steady line, {st['n']} points from Scheme S1f")
        print(f"  loss_scale {st['loss_scale']:.3f}   contact {st['contact_w_per_k']*1e3:.2f} mW/K")
        print(f"  residual rms {st['rms_c']:.0f} C  max {st['max_abs_c']:.0f} C  bias {st['bias_c']:+.0f} C")
        s11 = cal["s11b"]
        print(f"  Fig. S11b fit against this loss: rms {s11['rms_c']:.0f} C  bias {s11['bias_c']:+.0f} C")
        print(f"\nPulsed points, matched on {pu['power_key']}, cp_scale {cal['cp_scale']:.3f}")
        print("   P(W)   V     peak meas/model     avg meas/model    T_min   P_int")
        for r in pu["rows"]:
            print(f"  {r['power_w']:5.1f} {r['voltage_v']:5.1f}   "
                  f"{r['t_peak_meas_c']:5.0f} / {r['t_peak_model_c']:5.0f}      "
                  f"{r['t_avg_meas_c']:4.0f} / {r['t_avg_model_c']:4.0f}     "
                  f"{r['t_min_model_c']:4.0f}   {r['p_avg_w']:5.1f}")
        print(f"  peak rms {pu['peak_rms_c']:.0f} C (bias {pu['peak_bias_c']:+.0f})   "
              f"avg rms {pu['avg_rms_c']:.0f} C (bias {pu['avg_bias_c']:+.0f})")
        print(f"\nOperating point defined by T_peak = {OP_PEAK_C:.0f} C")
        print(f"  needs {op['voltage_v']:.1f} V  (SI states {OP_VOLTAGE_V:.0f})   "
              f"T_avg {op['t_avg_c']:.0f} (SI states {OP_AVG_C:.0f})   T_min {op['t_min_c']:.0f}")
        print(f"  power: integrated {op['p_avg_w']:.1f} W, SI formula {op['p_reported_w']:.1f} W")
        print(f"\nAt the stated {OP_VOLTAGE_V:.0f} V the same model gives")
        print(f"  T_peak {sv['t_peak_c']:.0f}  T_min {sv['t_min_c']:.0f}  T_avg {sv['t_avg_c']:.0f}   "
              f"power integrated {sv['p_avg_w']:.1f} W, SI formula {sv['p_reported_w']:.1f} W")
    worst = max(cal["pulsed"]["peak_rms_c"], cal["pulsed"]["avg_rms_c"])
    if worst > args.tolerance_c:
        print(f"\nFAIL: pulsed rms {worst:.0f} C exceeds {args.tolerance_c:.0f} C", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
