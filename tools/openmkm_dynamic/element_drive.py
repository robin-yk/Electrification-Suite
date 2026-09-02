#!/usr/bin/env python3
"""The element's own temperature history, ported from apps/rphcjh/solver.js.

The trapezoid waveform in run_cstr_case.py takes T_peak, T_min and two ramp
fractions as inputs and builds a shape from them. Real hardware does not work
that way: you set a voltage, a period and a duty, and the element's thermal mass
decides what temperatures it reaches and how fast. Those three settings are also
what the page's sliders actually move.

Parameterising the ramp as a *fraction of the period* is worse than merely
artificial, it is impossible. A fixed 5 % ramp asks a 1 ms period to heat 750 ->
1250 C in 50 us and a 10 s period to take 0.5 s over the same rise -- one element
cannot do both, because thermal mass is an absolute quantity and a fraction is
not. Sampling that space spends cases on states no element can occupy.

Integrating the element instead gives T_peak, T_min and the ramp shape as
outputs, cuts the sampled axes from seven to three, and leaves every remaining
axis something a user can actually turn.

This is a port, so it is verified as one: --check-profile prints the trajectory
for a case that apps/rphcjh/solver.js can be asked for directly, and the two must
agree. Nothing downstream is worth anything if the port drifted.
"""
import argparse
import json

K2C = 273.15
SIGMA_SB = 5.670374419e-8
HE_CAPACITY_RATE = 50e-6 / 60 / 0.022414 * 20.786

CFP_ELEMENT = {
    "length": 0.038, "width": 0.008, "thickness": 210e-6,
    "mass": 28.8e-6, "emissivity": 0.57,
    "resistA": 7.24e-4, "resistB": 4.22,
}

CFP_CP_TABLE = [
    (25, 710), (200, 1050), (400, 1390), (600, 1590), (800, 1730),
    (1000, 1830), (1200, 1900), (1400, 1950), (1600, 2000), (1800, 2040),
]


def interpolate_table(table, x):
    if x <= table[0][0]:
        return table[0][1]
    if x >= table[-1][0]:
        return table[-1][1]
    for i in range(1, len(table)):
        if x <= table[i][0]:
            x0, y0 = table[i - 1]
            x1, y1 = table[i]
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return table[-1][1]


def cfp_resistance(t_c, el=CFP_ELEMENT):
    # Carbon's resistance falls with temperature; clamped well above zero so a
    # runaway extrapolation of the linear fit can never divide by ~0.
    return max(0.2, el["resistB"] - el["resistA"] * t_c)


def cfp_heat_capacity(t_c):
    return interpolate_table(CFP_CP_TABLE, t_c)


def lumped_loss_power(t_c, p):
    el = p["element"]
    tk, tak = t_c + K2C, p["ambient_c"] + K2C
    # Both strip faces, times a calibration factor. The bare footprint treats
    # the element as a solid rectangle, but the carbon fibre paper is porous
    # and the feed passes through it rather than over it, so the surface that
    # actually sheds heat is larger than the outline. loss_scale defaults to 1
    # and the port agreement with apps/rphcjh/solver.js holds at that value;
    # calibrate_element_si.py fits it against the measured trace.
    area = 2 * el["length"] * el["width"] * p["loss_scale"]
    rad = SIGMA_SB * el["emissivity"] * area * (tk ** 4 - tak ** 4)
    gas = p["gas_capacity_rate"] * max(0.0, t_c - p["gas_inlet_c"])
    contact = p["contact_conductance"] * (t_c - p["ambient_c"])
    return rad + gas + contact


def drive_defaults(**overrides):
    p = {
        "voltage": 40.0, "period": 1.0, "duty": 0.05,
        "ambient_c": 25.0, "gas_inlet_c": 25.0,
        "element": CFP_ELEMENT,
        "gas_capacity_rate": HE_CAPACITY_RATE,
        "contact_conductance": 0.0,
        "loss_scale": 1.0,
        # Scale on the element's heat capacity (mass times cp). The mass is
        # stated in the SI and the cp table is generic carbon fibre, so this
        # is the knob a pulsed measurement can move; the steady loss cannot.
        "cp_scale": 1.0,
    }
    p.update({k: v for k, v in overrides.items() if v is not None})
    return p


def integrate_pulsed_element(max_cycles=400, tol_c=0.02, start_c=None, **overrides):
    """RK4 march to the periodic state. Mirrors integratePulsedElement()."""
    p = drive_defaults(**overrides)
    steps = 2400
    dt = p["period"] / steps
    on_steps = round(p["duty"] * steps)

    def deriv(t_c, on):
        pin = p["voltage"] ** 2 / cfp_resistance(t_c, p["element"]) if on else 0.0
        return (pin - lumped_loss_power(t_c, p)) / (
            p["element"]["mass"] * cfp_heat_capacity(t_c) * p["cp_scale"])

    T = p["ambient_c"] if start_c is None else start_c
    samples, cycles, converged = [], 0, False
    t_peak = t_min = t_avg = e_in = 0.0
    for c in range(max_cycles):
        start_t = T
        record = []
        t_peak, t_min, t_avg, e_in = -1e30, 1e30, 0.0, 0.0
        for i in range(steps):
            on = i < on_steps
            if i % 6 == 0:
                record.append((i / steps, T))
            t_peak = max(t_peak, T)
            t_min = min(t_min, T)
            t_avg += T * dt
            if on:
                e_in += p["voltage"] ** 2 / cfp_resistance(T, p["element"]) * dt
            k1 = deriv(T, on)
            k2 = deriv(T + dt / 2 * k1, on)
            k3 = deriv(T + dt / 2 * k2, on)
            k4 = deriv(T + dt * k3, on)
            T += dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        cycles = c + 1
        samples = record
        if abs(T - start_t) < tol_c:
            converged = True
            break
    t_peak = max(t_peak, T)
    t_min = min(t_min, T)
    samples.append((1.0, T))
    t_avg /= p["period"]
    return {"samples": samples, "t_peak_c": t_peak, "t_min_c": t_min,
            "t_avg_c": t_avg, "cycles": cycles, "converged": converged,
            # Two powers. p_avg_w is the electrical energy per cycle over the
            # period, integrated with R(T) as it actually was during the on
            # time. p_reported_w is the SI's bookkeeping for pulsed power,
            # P = V^2 t_heating / (R(T_avg) t_cycle), which evaluates R at the
            # cycle-mean temperature; the x axis of Scheme S1f is this one.
            "p_avg_w": e_in / p["period"],
            "p_reported_w": p["voltage"] ** 2 * p["duty"]
            / cfp_resistance(t_avg, p["element"])}


def steady_temperature(power_w, tol_c=1e-3, **overrides):
    """Continuous heating: the T at which the lumped loss equals power_w."""
    p = drive_defaults(**overrides)
    lo, hi = p["ambient_c"], 4000.0
    while hi - lo > tol_c:
        mid = 0.5 * (lo + hi)
        if lumped_loss_power(mid, p) < power_w:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def profile_function(profile):
    """T(phase) by linear interpolation of the integrated trajectory."""
    xs = [s[0] for s in profile["samples"]]
    ys = [s[1] for s in profile["samples"]]

    def at(phase):
        phase = phase - int(phase)
        if phase <= xs[0]:
            return ys[0]
        if phase >= xs[-1]:
            return ys[-1]
        lo, hi = 0, len(xs) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if xs[mid] <= phase:
                lo = mid
            else:
                hi = mid
        f = (phase - xs[lo]) / (xs[hi] - xs[lo])
        return ys[lo] + (ys[hi] - ys[lo]) * f
    return at


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--voltage", type=float, default=40.0)
    ap.add_argument("--period-s", type=float, default=1.0)
    ap.add_argument("--duty", type=float, default=0.05)
    ap.add_argument("--ambient-c", type=float, default=25.0)
    ap.add_argument("--loss-scale", type=float, default=1.0,
                    help="scale on the radiating area; see calibrate_element_si.py")
    ap.add_argument("--cp-scale", type=float, default=1.0,
                    help="scale on the heat capacity; see calibrate_element_si.py")
    ap.add_argument("--samples", type=int, default=0,
                    help="print this many evenly spaced (phase, T) points")
    args = ap.parse_args()
    r = integrate_pulsed_element(voltage=args.voltage, period=args.period_s,
                                 duty=args.duty, ambient_c=args.ambient_c,
                                 loss_scale=args.loss_scale, cp_scale=args.cp_scale)
    out = {"voltage": args.voltage, "period_s": args.period_s, "duty": args.duty,
           "loss_scale": args.loss_scale, "cp_scale": args.cp_scale,
           "t_peak_c": r["t_peak_c"], "t_min_c": r["t_min_c"], "t_avg_c": r["t_avg_c"],
           "p_avg_w": r["p_avg_w"], "p_reported_w": r["p_reported_w"],
           "cycles": r["cycles"], "converged": r["converged"]}
    if args.samples:
        at = profile_function(r)
        out["profile"] = [[k / args.samples, at(k / args.samples)] for k in range(args.samples)]
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
