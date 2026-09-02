#!/usr/bin/env python3
"""The Fig. S9 reaction-order study, run against a mechanism that has benzene.

Table S1 of the SI reports fifteen power-law exponents: five species across
three series, each fitted as r = a [P]^n with an R squared. That is the
sharpest published test of this device in the paper, because an exponent is a
derivative. Matching one selectivity at one point says the model can reach a
state; matching an exponent says the model responds correctly when a knob
moves, which is the only property an optimizer can be built on.

What is compared, and what is not
--------------------------------
Exponents only. The rate constant `a` is quoted in g/h, which needs the
reactor's void volume, and neither the paper nor the SI gives one; the
`VOID_CM3` in pulse_common.py has no source. A constant scale on the rate
shifts `a` and leaves `n` untouched, so the exponents survive the missing
volume and the intercepts cannot be compared at all.

Rates come from `carbon_audit.species_out_kmol`, the kmol of each species
leaving per cycle, which schema 2 records directly. At 1 Hz that is kmol per
second up to the reactor volume, constant across a series and therefore absent
from the slope.

The experiment holds total flow at 50 sccm and varies composition, so helium is
displaced as CO2 or CH4 rises. Here residence time is held fixed instead, which
is the same statement: the molar throughput of a constant-pressure reactor at
fixed tau does not depend on what the mixture is made of.

Not every exponent is a target. Four of the fifteen were fitted with an R
squared below 0.62, one as low as 0.12, which means the experiment resolved no
dependence there rather than a shallow one. Those rows are reported and
excluded from the gate; see ACCEPTANCE in RUNCARD-S9.md.

    python3 tools/openmkm_dynamic/run_s9_orders.py plan
    python3 tools/openmkm_dynamic/run_s9_orders.py run --mechanism <yaml>
    python3 tools/openmkm_dynamic/run_s9_orders.py fit
"""
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "s9"
ARAMCO = HERE.parent / "cantera" / "mechanisms" / "aramco20.yaml"

# SI, Flow Control: 50 sccm total at 1 atm, each reactant 5.06 kPa at 5 mol%.
TOTAL_KPA = 101.325
P_LOW_KPA = 5.06
P_HIGH_KPA = 40.24
N_POINTS = 5

# SI, Table S1 caption: 70 V, 5 percent duty, 1 Hz.
DRIVE = {
    # "si-op" is the voltage at which the calibrated element peaks at the SI's
    # stated 1800 C, computed by calibrate_element_si.py at run time. The SI
    # states 70 V, but its 70 V, 1800 C and 880 C do not agree with each other
    # under its own pulsed power formula, and the temperatures are the
    # measured ones. See RUNCARD-S9.md.
    "voltage": "si-op", "period_s": 1.0, "duty": 0.05}
TAU_S = 0.2
DILUENT = "HE"

SPECIES = ("C2H4", "C2H2", "C6H6", "CO", "H2")

# SI, Table S1. Exponent and R squared as published, transcribed once, here,
# because they are measurements and cannot be computed from anything we have.
MEASURED = {
    "co2": {"C2H4": (-0.12, 0.6068), "C2H2": (0.18, 0.6133),
            "C6H6": (0.37, 0.7249), "CO": (1.33, 0.9995), "H2": (0.11, 0.3753)},
    "ch4": {"C2H4": (0.89, 0.9935), "C2H2": (1.03, 0.9448),
            "C6H6": (1.65, 0.9935), "CO": (0.08, 0.1242), "H2": (0.94, 0.9546)},
    "prop": {"C2H4": (0.84, 0.9984), "C2H2": (1.13, 0.9281),
             "C6H6": (1.49, 0.9674), "CO": (1.12, 0.9944), "H2": (1.78, 0.9003)},
}
SERIES_LABEL = {
    "co2": "CO2 dependence, CH4 fixed at 5.06 kPa",
    "ch4": "CH4 dependence, CO2 fixed at 5.06 kPa",
    "prop": "proportional, CO2/CH4 = 1",
}
# The experiment's own fit quality. Below this the published exponent describes
# scatter, not a dependence, so it is not something a model can be asked to hit.
R2_FLOOR = 0.62


def geometric(lo, hi, n):
    """n points from lo to hi, evenly spaced in log, as a power law wants."""
    r = (hi / lo) ** (1.0 / (n - 1))
    return [lo * r ** i for i in range(n)]


def cases():
    """Every unique condition across the three series, keyed by feed."""
    grid, out = geometric(P_LOW_KPA, P_HIGH_KPA, N_POINTS), {}
    for series, pairs in (
        ("co2", [(P_LOW_KPA, p) for p in grid]),
        ("ch4", [(p, P_LOW_KPA) for p in grid]),
        ("prop", [(p, p) for p in grid]),
    ):
        for ch4_kpa, co2_kpa in pairs:
            key = f"ch4_{ch4_kpa:07.3f}-co2_{co2_kpa:07.3f}"
            rec = out.setdefault(key, {
                "key": key, "ch4_kpa": ch4_kpa, "co2_kpa": co2_kpa,
                "x_ch4": ch4_kpa / TOTAL_KPA, "x_co2": co2_kpa / TOTAL_KPA,
                "series": [],
            })
            rec["series"].append(series)
    for rec in out.values():
        x_dil = 1.0 - rec["x_ch4"] - rec["x_co2"]
        if x_dil <= 0:
            raise SystemExit(f"{rec['key']}: no room left for diluent")
        rec["feed"] = (f"CH4:{rec['x_ch4']:.6f}, CO2:{rec['x_co2']:.6f}, "
                       f"{DILUENT}:{x_dil:.6f}")
        rec["output"] = str(DATA / f"{rec['key']}.json")
    return [out[k] for k in sorted(out)]


def command(rec, mechanism):
    return [sys.executable, str(HERE / "run_cstr_case.py"),
            "--mechanism", str(mechanism),
            "--waveform", "physical",
            "--voltage", str(DRIVE["voltage"]),
            "--element-loss-scale", "si",
            "--period-s", str(DRIVE["period_s"]),
            "--duty", str(DRIVE["duty"]),
            "--t-min-c", "25",
            "--residence-time-s", str(TAU_S),
            "--pressure-atm", "1.0",
            "--feed", rec["feed"],
            "--output", rec["output"]]


def do_plan(args):
    cs = cases()
    print(f"{len(cs)} unique conditions across three series, "
          f"{N_POINTS} points each\n")
    print(f"{'condition':34} {'CH4 kPa':>9} {'CO2 kPa':>9}  series")
    for rec in cs:
        print(f"{rec['key']:34} {rec['ch4_kpa']:9.2f} {rec['co2_kpa']:9.2f}  "
              + ",".join(rec["series"]))
    done = sum(1 for rec in cs if Path(rec["output"]).exists())
    print(f"\ncached {done} of {len(cs)}; {len(cs) - done} would run")
    if args.commands:
        print()
        for rec in cs:
            print(" ".join(command(rec, args.mechanism)))
    return 0


def do_run(args):
    DATA.mkdir(parents=True, exist_ok=True)
    cs = cases()
    for i, rec in enumerate(cs, 1):
        out = Path(rec["output"])
        if out.exists() and not args.force:
            print(f"[{i}/{len(cs)}] cached  {rec['key']}")
            continue
        print(f"[{i}/{len(cs)}] running {rec['key']}  {rec['feed']}", flush=True)
        r = subprocess.run(command(rec, args.mechanism))
        if r.returncode != 0:
            # Preserve what finished and stop, rather than leaving a half
            # campaign that later reads as a whole one.
            print(f"FAILED at {rec['key']}; {i - 1} cases preserved")
            return 1
    return 0


def rate_kmol_per_cycle(path, species):
    d = json.loads(Path(path).read_text())
    return d["carbon_audit"]["species_out_kmol"].get(species, 0.0)


def fit_power_law(pressures, rates):
    """Least squares on log r against log P. Returns (n, r2) or None."""
    pts = [(math.log(p), math.log(r)) for p, r in zip(pressures, rates) if r > 0]
    if len(pts) < 3:
        return None
    n = len(pts)
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    sxx = sum((x - mx) ** 2 for x, _ in pts)
    sxy = sum((x - mx) * (y - my) for x, y in pts)
    if sxx <= 0:
        return None
    slope = sxy / sxx
    ss_tot = sum((y - my) ** 2 for _, y in pts)
    ss_res = sum((y - (my + slope * (x - mx))) ** 2 for x, y in pts)
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return slope, r2


def do_fit(args):
    cs = {rec["key"]: rec for rec in cases()}
    missing = [k for k, rec in cs.items() if not Path(rec["output"]).exists()]
    if missing:
        print(f"{len(missing)} of {len(cs)} results missing; "
              f"run the campaign first")
        for k in missing[:5]:
            print(f"  {k}")
        return 1

    report, gated, passed = {}, 0, 0
    for series in ("co2", "ch4", "prop"):
        members = [rec for rec in cs.values() if series in rec["series"]]
        axis = "co2_kpa" if series == "co2" else "ch4_kpa"
        members.sort(key=lambda r: r[axis])
        pressures = [rec[axis] for rec in members]
        print(f"\n{SERIES_LABEL[series]}")
        print(f"  {'species':8} {'n model':>9} {'n meas':>8} {'diff':>8} "
              f"{'R2 model':>9} {'R2 meas':>8}   gate")
        report[series] = {}
        for sp in SPECIES:
            rates = [rate_kmol_per_cycle(rec["output"], sp) for rec in members]
            fit = fit_power_law(pressures, rates)
            n_meas, r2_meas = MEASURED[series][sp]
            if fit is None:
                print(f"  {sp:8} {'no fit':>9} {n_meas:8.2f}")
                report[series][sp] = {"model": None, "measured": n_meas}
                continue
            n_mod, r2_mod = fit
            in_gate = r2_meas >= R2_FLOOR
            ok = abs(n_mod - n_meas) <= args.tolerance
            mark = ("pass" if ok else "MISS") if in_gate else "not resolved"
            if in_gate:
                gated += 1
                passed += int(ok)
            print(f"  {sp:8} {n_mod:9.2f} {n_meas:8.2f} {n_mod - n_meas:+8.2f} "
                  f"{r2_mod:9.4f} {r2_meas:8.4f}   {mark}")
            report[series][sp] = {
                "model_n": n_mod, "model_r2": r2_mod,
                "measured_n": n_meas, "measured_r2": r2_meas,
                "in_gate": in_gate, "pass": ok,
            }

    print(f"\n{passed} of {gated} gated exponents within "
          f"{args.tolerance:.2f}; {len(SPECIES) * 3 - gated} not resolved by "
          f"the experiment (R2 below {R2_FLOOR})")
    if args.report:
        Path(args.report).write_text(json.dumps(
            {"tolerance": args.tolerance, "r2_floor": R2_FLOOR,
             "gated": gated, "passed": passed, "series": report}, indent=1))
        print(f"wrote {args.report}")
    return 0 if gated and passed == gated else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    pl = sub.add_parser("plan", help="list the conditions without running them")
    pl.add_argument("--commands", action="store_true")
    pl.add_argument("--mechanism", default=str(ARAMCO))
    pl.set_defaults(func=do_plan)

    rn = sub.add_parser("run", help="run the campaign, skipping cached cases")
    rn.add_argument("--mechanism", default=str(ARAMCO))
    rn.add_argument("--force", action="store_true", help="recompute cached cases")
    rn.set_defaults(func=do_run)

    ft = sub.add_parser("fit", help="fit exponents and compare with Table S1")
    ft.add_argument("--tolerance", type=float, default=0.35,
                    help="how far a gated exponent may miss")
    ft.add_argument("--report", default=None)
    ft.set_defaults(func=do_fit)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
