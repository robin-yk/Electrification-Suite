#!/usr/bin/env python3
"""Checks on the element model and its Scheme S1f calibration.

    python3 tools/openmkm_dynamic/test_element_calibration.py

Each check names the change it guards. They run in about ten seconds.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from element_drive import (drive_defaults, integrate_pulsed_element,
                           lumped_loss_power, steady_temperature)
import calibrate_element_si as cal

HERE = Path(__file__).resolve().parent


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    return bool(cond)


def main():
    ok = True

    # The digitized panel: five pulsed powers with a peak and a mean each, the
    # steady line read at more than twenty powers, all monotone in power and
    # the peak above the mean everywhere.
    d = json.load(open(HERE / "data" / "si" / "scheme-s1f.json"))
    ok &= check(len(d["pulsed_peak"]) == 5 and len(d["pulsed_avg"]) == 5,
                "S1f has five pulsed peaks and five pulsed means")
    ok &= check(len(d["steady"]) >= 20, "S1f steady line read at >= 20 powers")
    for k in ("pulsed_peak", "pulsed_avg", "steady"):
        t = [p["t_c"] for p in d[k]]
        ok &= check(all(b > a for a, b in zip(t, t[1:])), f"{k} rises with power")
    ok &= check(all(pk["t_c"] > av["t_c"] + 300
                    for pk, av in zip(d["pulsed_peak"], d["pulsed_avg"])),
                "every pulsed peak sits well above its mean")

    # steady_temperature inverts lumped_loss_power.
    p = drive_defaults(loss_scale=1.3, contact_conductance=0.02)
    t = steady_temperature(120.0, loss_scale=1.3, contact_conductance=0.02)
    ok &= check(abs(lumped_loss_power(t, p) - 120.0) < 1e-2,
                "steady_temperature inverts the loss to 0.01 W")

    # cp_scale is a real knob: doubling the thermal mass shrinks the swing.
    a = integrate_pulsed_element(voltage=70.0, loss_scale=1.2, cp_scale=1.0)
    b = integrate_pulsed_element(voltage=70.0, loss_scale=1.2, cp_scale=2.0)
    ok &= check((b["t_peak_c"] - b["t_min_c"]) < 0.7 * (a["t_peak_c"] - a["t_min_c"]),
                "cp_scale 2 cuts the swing by more than 30 percent")

    # The two powers: integrated electrical power is what the element received;
    # the SI's reported power evaluates R at T_avg and so reads lower here,
    # because R is smaller at the on-time temperatures than at the mean.
    ok &= check(a["p_avg_w"] > a["p_reported_w"] > 0.85 * a["p_avg_w"],
                "integrated power exceeds SI-formula power by under 15 percent")
    # And the integrated power is what the energy balance says it must be at
    # the periodic state: the cycle's loss, to a few tenths of a percent.
    import numpy as np
    ph = [s[0] for s in a["samples"]]
    ts = [s[1] for s in a["samples"]]
    pa = drive_defaults(loss_scale=1.2)
    loss = np.trapezoid([lumped_loss_power(x, pa) for x in ts], ph)
    ok &= check(abs(loss - a["p_avg_w"]) < 0.01 * a["p_avg_w"],
                f"periodic state: cycle loss {loss:.1f} W equals input {a['p_avg_w']:.1f} W")

    # The calibration itself, to the residuals it has today. Making the model
    # worse fails here.
    c = cal.calibrate()
    ok &= check(c["steady"]["rms_c"] < 15.0,
                f"steady fit rms {c['steady']['rms_c']:.0f} C < 15")
    ok &= check(c["pulsed"]["peak_rms_c"] < 65.0 and c["pulsed"]["avg_rms_c"] < 40.0,
                f"pulsed rms peak {c['pulsed']['peak_rms_c']:.0f} / "
                f"mean {c['pulsed']['avg_rms_c']:.0f} C within 65 / 40")
    ok &= check(abs(c["operating_point"]["t_avg_c"] - cal.OP_AVG_C) < 20.0,
                f"held out: T_avg at T_peak 1800 is {c['operating_point']['t_avg_c']:.0f} C, "
                f"SI states {cal.OP_AVG_C:.0f}")
    ok &= check(c["contact_w_per_k"] > 0 and 1.0 < c["cp_scale"] < 1.5,
                "fitted contact term positive, cp_scale between 1 and 1.5")

    print("\nall ok" if ok else "\nFAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
