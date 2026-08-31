#!/usr/bin/env python3
"""Calibrate the lumped element model against the one published T(t) trace.

`element_drive.py` integrates the CFP element from a voltage, a period and a
duty. Nothing had ever checked the temperatures it produces against a measured
pulse train, so the swing it predicts was unverified. This does that check, and
it exists because the alternative was worse: an earlier version of
docs/PREMISE-ARAMCO.md inferred the quench floor by inverting

    T_avg = duty * T_peak + (1 - duty) * T_min

for T_min. That formula is a square wave. Scheme S1e shows the element is a
sawtooth, rising in near-zero time and then decaying continuously for the rest
of the period with no dwell at either end, so the inversion put the floor about
300 C too high. The lesson is cheaper to keep as a script than as a paragraph.

Two numbers are digitized from Scheme S1e and two knobs are fitted to them. The
drive voltage for that panel is not stated, and the model's radiating area is
the bare strip footprint, which ignores both the porosity of the carbon fibre
paper and the fact that the feed flows through the element rather than past it.
So voltage and a loss scale are the free parameters.

The fit is then tested on numbers it never saw: the SI's operating point states
70 V, T_peak about 1800 C and T_avg about 880 C. The calibrated model is asked
for the voltage that reaches 1800 C and the T_avg that comes with it, and both
have to land near the stated pair or the calibration means nothing.

    python3 tools/openmkm_dynamic/calibrate_element_si.py

The quench floor at the operating point is an output of this script. It is not
published: the Optris PI 1M covers 500 to 1800 C, so both ends of the operating
pulse sit on the instrument's limits and the floor is at or below the bottom of
its range.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from element_drive import integrate_pulsed_element


def bisect(f, lo, hi, tol=1e-4, max_iter=200):
    """Root of a monotone f on [lo, hi].

    scipy would do this in one import, but this tool has to run on a CI runner
    whose only dependency is Cantera, and adding scipy to that image to solve
    two scalar roots on monotone functions is the wrong trade. Both functions
    here are monotone by construction: the element's peak rises with voltage,
    and at a fixed peak its floor falls as the loss area grows.
    """
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

# Digitized from Scheme S1e, the RPH trace at 1 Hz and 5 percent duty. The
# panel's y axis was calibrated on its own red dashed steady-state line, which
# the caption places at 700 C and which reads back as 695 C, so these carry
# roughly +/- 10 C of readout error on top of the trace thickness.
S1E_PEAK_C = 1050.0
S1E_FLOOR_C = 477.0

# SI operating point, stated in the Table S1 caption and Fig. S9. Held out of
# the fit and used only to test it.
OP_VOLTAGE_V = 70.0
OP_PEAK_C = 1800.0
OP_AVG_C = 880.0

PERIOD_S = 1.0
DUTY = 0.05


def run(voltage, loss_scale):
    """The element at one drive, with its loss area scaled by loss_scale."""
    return integrate_pulsed_element(voltage=voltage, period=PERIOD_S,
                                    duty=DUTY, loss_scale=loss_scale)


def voltage_for_peak(peak_c, loss_scale):
    return bisect(lambda v: run(v, loss_scale)["t_peak_c"] - peak_c,
                  10.0, 200.0)


def calibrate():
    """Fit loss_scale so that matching the S1e peak also matches its floor."""
    def floor_error(loss_scale):
        v = voltage_for_peak(S1E_PEAK_C, loss_scale)
        return run(v, loss_scale)["t_min_c"] - S1E_FLOOR_C

    loss_scale = bisect(floor_error, 1.0, 4.0)
    voltage = voltage_for_peak(S1E_PEAK_C, loss_scale)
    return loss_scale, voltage, run(voltage, loss_scale)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--tolerance-percent", type=float, default=5.0,
                    help="how far the held-out numbers may miss before this "
                         "exits nonzero")
    args = ap.parse_args()

    loss_scale, v_fit, fit = calibrate()
    uncal = run(OP_VOLTAGE_V, 1.0)
    v_op = voltage_for_peak(OP_PEAK_C, loss_scale)
    op = run(v_op, loss_scale)

    out = {
        "fit": {
            "loss_scale": loss_scale, "voltage_v": v_fit,
            "t_peak_c": fit["t_peak_c"], "t_min_c": fit["t_min_c"],
            "t_avg_c": fit["t_avg_c"],
            "target_peak_c": S1E_PEAK_C, "target_floor_c": S1E_FLOOR_C,
        },
        "held_out_test": {
            "voltage_v": v_op, "stated_voltage_v": OP_VOLTAGE_V,
            "voltage_error_percent": 100 * (v_op - OP_VOLTAGE_V) / OP_VOLTAGE_V,
            "t_avg_c": op["t_avg_c"], "stated_t_avg_c": OP_AVG_C,
            "t_avg_error_percent": 100 * (op["t_avg_c"] - OP_AVG_C) / OP_AVG_C,
        },
        "operating_point": {
            "t_peak_c": op["t_peak_c"], "t_min_c": op["t_min_c"],
            "t_avg_c": op["t_avg_c"], "swing_c": op["t_peak_c"] - op["t_min_c"],
        },
        "uncalibrated_at_stated_voltage": {
            "voltage_v": OP_VOLTAGE_V, "t_peak_c": uncal["t_peak_c"],
            "t_min_c": uncal["t_min_c"], "t_avg_c": uncal["t_avg_c"],
        },
    }
    if args.json:
        print(json.dumps(out, indent=1))
        return 0

    f, h, o, u = (out["fit"], out["held_out_test"], out["operating_point"],
                  out["uncalibrated_at_stated_voltage"])
    print("Fitted to Scheme S1e (peak and floor), 1 Hz at 5 percent duty")
    print(f"  loss scale {f['loss_scale']:.3f} on the radiating area, "
          f"drive {f['voltage_v']:.1f} V")
    print(f"  T_peak {f['t_peak_c']:7.0f} C   target {f['target_peak_c']:.0f}")
    print(f"  T_min  {f['t_min_c']:7.0f} C   target {f['target_floor_c']:.0f}")
    print(f"  T_avg  {f['t_avg_c']:7.0f} C   not measured on that panel")

    print("\nHeld out of the fit, so this is the test")
    print(f"  voltage reaching T_peak {OP_PEAK_C:.0f} C: {h['voltage_v']:.1f} V"
          f"   SI states {h['stated_voltage_v']:.0f} V"
          f"   ({h['voltage_error_percent']:+.1f} percent)")
    print(f"  T_avg there: {h['t_avg_c']:.0f} C"
          f"   SI states {h['stated_t_avg_c']:.0f} C"
          f"   ({h['t_avg_error_percent']:+.1f} percent)")

    print("\nOperating point, calibrated")
    print(f"  T_peak {o['t_peak_c']:7.0f} C")
    print(f"  T_min  {o['t_min_c']:7.0f} C   not published; the IR camera "
          f"bottoms out at 500 C")
    print(f"  T_avg  {o['t_avg_c']:7.0f} C")
    print(f"  swing  {o['swing_c']:7.0f} C")

    print("\nThe same model uncalibrated, at the stated 70 V")
    print(f"  T_peak {u['t_peak_c']:7.0f} C   T_min {u['t_min_c']:7.0f} C"
          f"   T_avg {u['t_avg_c']:7.0f} C")
    print("  It reaches roughly the right peak by under-cooling, which is why "
          "the floor\n  and the mean both come out high.")

    # The held-out numbers are the whole point, so missing them is a failure and
    # not a remark. This also pins loss_scale as a real knob: with the radiating
    # area fixed, no voltage reaches the S1e peak and floor together, the fit
    # cannot be made, and the misses below go far outside any sane tolerance.
    misses = {"voltage": h["voltage_error_percent"],
              "t_avg": h["t_avg_error_percent"]}
    bad = {k: v for k, v in misses.items() if abs(v) > args.tolerance_percent}
    if bad:
        print("\nFAIL: held-out numbers outside "
              f"{args.tolerance_percent:.1f} percent: "
              + ", ".join(f"{k} {v:+.1f}" for k, v in bad.items()))
        return 1
    print(f"\nok: both held-out numbers within {args.tolerance_percent:.1f} percent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
