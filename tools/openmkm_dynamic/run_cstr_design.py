#!/usr/bin/env python3
"""Space-filling pulsed-CSTR design: the dynamic half of the ML dataset.

The five-period pilot showed the dynamic response departs from the
quasi-steady blend by -28 % to +50 %, non-monotonically in pulse period, so
a steady lookup cannot represent it. This sweeps the waveform design space
that a dynamic surrogate would have to learn.

Each case records the converged periodic state: cycle-average conversion and
C2 selectivity, the matching quasi-steady reference (so the label
`memory_gain = X_dyn / X_qs` is available directly), radical carryover
across the cycle boundary, and a subsampled one-cycle trajectory of the
chemical state.

Sampled axes (4-D Halton, log where the axis spans timescales):

  voltage      25 .. 55 V               electrical drive
  period_s     10 ms .. 10 s      log    pulse timescale
  duty         0.02 .. 0.40              hot fraction
  tau_s        10 ms .. 1 s       log    washout timescale

The CFP energy balance converts the first three controls into the temperature
waveform. T_peak, T_min and ramp shape are outputs rather than free axes.

Usage:
  python tools/openmkm_dynamic/run_cstr_design.py --cases 256 \\
      --output tools/openmkm_dynamic/data/cstr-design-256.jsonl [--start 1]
"""
import argparse
import datetime
import json
import math
import sys
import warnings
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run_cstr_case import (build_params, run_case, mean_temperature,
                           waveform_temperature, RECORD_SPECIES,
                           HOT_MIN_POINTS)
from run_cstr_pilot import quasi_steady_reference

# Four axes, all of them knobs a person can actually turn. The previous design
# sampled seven -- T_peak, T_min, period, duty, two ramp fractions and a waveform
# family -- treating as free inputs quantities the element's thermal mass in fact
# decides. A fixed ramp *fraction* asks a 1 ms period to heat 750->1250 C in 50 us
# and a 10 s period to take half a second over the same rise; no one element does
# both, so that space contained states no hardware can occupy. The waveform is
# now integrated from the element's own energy balance (--waveform physical), and
# T_peak, T_min and the ramp shape are results recorded with each case.
#
# Voltage spans 25-55 V: at 25 V the element barely ignites the chemistry even
# hot, at 55 V a 10 s pulse reaches 2440 C. Period against the element's thermal
# time constant sets the swing, from 7 K at 10 ms (the element cannot follow;
# effectively CJH) to 2300 K at 10 s.
PRIMES = [2, 3, 5, 7]
AXES = {
    "voltage": (25.0, 55.0, "linear"),
    "period_s": (1e-2, 10.0, "log"),
    "duty": (0.02, 0.40, "linear"),
    "tau_s": (1e-2, 1.0, "log"),
}
# Cost guard: a 1 ms pulse washing out a 1 s residence time needs thousands of
# cycles. Cap the work and record `converged` honestly rather than silently
# truncating; downstream training must filter on that flag.
POINTS_PER_CYCLE = 100
MAX_CYCLES = 600

# The wide design. AXES above is frozen: the canonical 285 cases record a
# design_index whose meaning is the Halton walk over exactly those four axes in
# that order, so touching it would silently repoint every existing record. The
# wide walk is a second, separate sequence with its own prime for the new axis.
#
# tau reaches 10 s because the old 1 s ceiling was not a physical bound. It cut
# below laboratory scale: 50 sccm through the Wismann tube's 11.03 cm3 void is
# tau = 2.16 s, and through the Zheng foam's 70.05 cm3 void it is 13.7 s, so the
# old box could not describe either apparatus. duty reaches 0.85 because the
# 0.40 ceiling was where the selectivity-favouring cases piled up; build_params
# needs duty plus the two 0.05 ramps under 1, so 0.85 is the practical top.
# feed_x is the CH4 mole fraction, spanning the five steady sheets the map now
# carries. It is sampled continuously rather than snapped to a sheet, which is
# how tau has always been sampled against the map's 25 columns, and it makes the
# feed interpolation something the held-out cases actually test.
PRIMES_WIDE = [2, 3, 5, 7, 11]
AXES_WIDE = {
    "voltage": (25.0, 55.0, "linear"),
    "period_s": (1e-2, 10.0, "log"),
    "duty": (0.02, 0.85, "linear"),
    "tau_s": (1e-2, 10.0, "log"),
    "feed_x": (0.40, 0.80, "linear"),
}
# Convergence guard, not an information claim. Cycles to convergence track
# tau/P at roughly 4.5 cycles per unit, so past tau/P of about 130 the runner
# hits MAX_CYCLES = 600 and must record converged=False after 140 s of work:
# money spent on a case that downstream training is required to discard. The
# default cap sits just under that wall and nothing else.
#
# It is deliberately NOT set lower. An earlier draft cut at tau/P = 30 on the
# argument that the correction is small out there; joint binning of the 285
# canonical cases showed the correction is governed by the temperature swing,
# not by tau/P (median |logit correction| 0.006 to 0.008 across the whole
# tau/P range once swing < 100 K, versus 1.49 at swing > 400 K), and the old
# box's high-tau/P cases were all small-swing because a short period gives the
# element no time to move. Small correction there is the element's thermal
# inertia, not gas-side averaging, so cutting on tau/P would encode a
# confounded explanation. The pilot samples the 30 to 130 band on purpose to
# test whether large-tau, sub-second-period cases with real swing carry a
# correction the frozen box could never see.
MAX_TAU_OVER_PERIOD = 130.0


def halton(index, base):
    value, factor = 0.0, 1.0
    while index:
        factor /= base
        index, digit = divmod(index, base)
        value += digit * factor
    return value


def design_point_wide(index):
    """Halton walk over AXES_WIDE. Returns a point carrying an explicit feed."""
    point = {}
    for (name, (low, high, scale)), base in zip(AXES_WIDE.items(), PRIMES_WIDE):
        u = halton(index, base)
        point[name] = (math.exp(math.log(low) + u * math.log(high / low))
                       if scale == "log" else low + u * (high - low))
    x = point.pop("feed_x")
    point["feed"] = f"CH4:{x:.6f}, CO2:{1 - x:.6f}"
    point["feed_x"] = x
    point["waveform"] = "physical"
    return point


def design_point(index):
    point = {}
    for (name, (low, high, scale)), base in zip(AXES.items(), PRIMES):
        u = halton(index, base)
        point[name] = (math.exp(math.log(low) + u * math.log(high / low))
                       if scale == "log" else low + u * (high - low))
    point["waveform"] = "physical"
    return point


def subsample(trajectory, points_per_cycle, keep=40):
    """Keep the final cycle, thinned to `keep` points, at 6 significant digits."""
    n = len(trajectory["time_s"])
    start = max(0, n - points_per_cycle)
    idx = [start + round(i * (points_per_cycle - 1) / (keep - 1))
           for i in range(keep)]
    idx = [i for i in idx if i < n]
    t0 = trajectory["time_s"][idx[0]]
    return {
        "phase": [round((trajectory["time_s"][i] - t0), 9) for i in idx],
        "temperature_K": [trajectory["temperature_K"][i] for i in idx],
        "mole_fractions": {
            sp: [float(f"{trajectory['mole_fractions'][sp][i]:.6g}") for i in idx]
            for sp in RECORD_SPECIES},
    }


# The cap is the materials-trust bound, not a physics wall and not the map's
# edge. The CFP heat-capacity table's last measured row is 1800 C and the
# element model's author places property confidence at least there; past it the
# R(T) line and the constant emissivity are extrapolations of fits made far
# below, and GRI-Mech's own stretch keeps widening. The steady map reaches
# 1850 C so interpolation at the cap is bracketed. An earlier revision capped at
# 1400 -- the map's then-edge -- which read as a physical limit and would have
# discarded 50 finished transient cases the 1800 bound keeps.
PEAK_CAP_C = 1800.0


def design_feasible(point, max_tau_over_period=None):
    cap = MAX_TAU_OVER_PERIOD if max_tau_over_period is None else max_tau_over_period
    if point["tau_s"] / point["period_s"] > cap:
        return False
    from element_drive import integrate_pulsed_element
    drive = integrate_pulsed_element(voltage=point["voltage"],
                                     period=point["period_s"], duty=point["duty"])
    return drive["converged"] and drive["t_peak_c"] <= PEAK_CAP_C


def run_design_case(ct, mech, index, closure="const-pressure", point=None):
    # index < 0 marks a targeted case: the point is handed in rather than drawn
    # from the Halton walk, so second-round batches aimed at a weak region run
    # through the identical machinery and land in the identical schema.
    point = dict(point) if point is not None else design_point(index)
    args = argparse.Namespace(
        mechanism=mech, t_min_c=25.0, t_peak_c=1250.0,
        duty=point["duty"], waveform="physical", voltage=point["voltage"],
        ramp_up_fraction=0.05, ramp_down_fraction=0.05, pressure_atm=1.0,
        residence_time_s=point["tau_s"], feed=point.get("feed", "CH4:1, CO2:1"),
        points_per_cycle=POINTS_PER_CYCLE, hot_min_points=HOT_MIN_POINTS,
        min_cycles=10, max_cycles=MAX_CYCLES,
        cycle_tolerance=1e-7, record_cycles=1, period_s=point["period_s"],
        closure=closure)
    p = build_params(args)
    result = run_case(mech, p)
    qs = quasi_steady_reference(ct, mech, p, n_grid=9)
    cs = result["cycle_summary"]
    # The label divides like by like: the dynamic outlet is outflow-weighted,
    # so the baseline must be the outflow-weighted blend, not the time average.
    x_dyn = cs["mean_ch4_conversion"]
    x_qs = qs["ch4_conversion_outflow_weighted"]
    return {
        "design_index": index,
        "engine": result["engine"],
        "mechanism": result["mechanism"],
        "inputs": result["inputs"],
        "outputs": {
            "ch4_conversion": x_dyn,
            "c2_selectivity_carbon": cs["mean_c2_selectivity_carbon"],
            "quasi_steady_ch4_conversion": x_qs,
            "quasi_steady_c2_selectivity": qs["c2_selectivity_carbon"],
            "memory_gain": x_dyn / x_qs if x_qs > 1e-12 else None,
            "outflow_mass_fractions": cs["outflow_mass_fractions"],
            "quasi_steady_outflow_mass_fractions": qs["outflow_mass_fractions"],
            "radical_carryover": cs["radical_carryover_at_cycle_start"],
        },
        "converged": cs["converged"],
        "cycles_to_convergence": cs["cycles_to_convergence"],
        "trajectory": subsample(result["trajectory"],
                                result["inputs"].get("substeps_per_cycle",
                                                     POINTS_PER_CYCLE)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mechanism", default="gri30.yaml")
    parser.add_argument("--cases", type=int, default=256)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--output", type=Path,
                        default=HERE / "data" / "cstr-design-256.jsonl")
    parser.add_argument("--continue-on-error", action="store_true")
    parser.add_argument("--targets", type=Path, default=None,
                        help="JSON of explicit {voltage, period_s, duty, tau_s} cases; "
                             "overrides the Halton walk entirely")
    parser.add_argument("--target-shard", type=int, default=0,
                        help="zero-based explicit-target shard")
    parser.add_argument("--target-shards", type=int, default=1,
                        help="number of explicit-target shards")
    parser.add_argument("--wide", action="store_true",
                        help="draw from AXES_WIDE (tau to 10 s, duty to 0.85, feed "
                             "axis) instead of the frozen four-axis walk. Use an "
                             "index range at or above 2000001 so a wide case can "
                             "never be confused with a frozen-walk case.")
    parser.add_argument("--closure", default="const-pressure",
                        choices=["const-pressure", "const-volume"],
                        help="reactor closure; recorded with every case")
    parser.add_argument("--max-tau-over-period", type=float,
                        default=MAX_TAU_OVER_PERIOD,
                        help="skip cases whose tau/P exceeds this; the default "
                             "sits where MAX_CYCLES stops convergence, see the "
                             "comment at MAX_TAU_OVER_PERIOD")
    args = parser.parse_args()

    import cantera as ct
    warnings.simplefilter("ignore")

    done = set()
    if args.output.exists():
        for line in args.output.read_text().splitlines():
            if line.strip():
                done.add(json.loads(line)["design_index"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    failures = args.output.with_suffix(args.output.suffix + ".failures.jsonl")

    if args.targets:
        if args.target_shards < 1 or not 0 <= args.target_shard < args.target_shards:
            raise SystemExit("target shard must satisfy 0 <= shard < shards")
        spec = json.loads(args.targets.read_text())
        # t_min_c doubles as the ambient the element cools toward under the
        # physical waveform, and t_peak_c is overwritten by the ODE; both still
        # need to exist for the shared plumbing.
        work = [(int(t.get("design_index", -(k + 1))),
                 dict({kk: t[kk] for kk in ("voltage", "period_s", "duty", "tau_s")},
                      t_min_c=25.0, t_peak_c=1250.0,
                      **({"feed": t["feed"]} if "feed" in t else {})))
                for k, t in enumerate(spec["targets"])
                if k % args.target_shards == args.target_shard]
    else:
        work = [(index, None) for index in range(args.start, args.start + args.cases)]

    with args.output.open("a") as stream:
        for index, target_point in work:
            if index in done:
                continue
            draw = design_point_wide if args.wide else design_point
            point = dict(target_point) if target_point else draw(index)
            if not design_feasible(point, args.max_tau_over_period):
                ratio = point["tau_s"] / point["period_s"]
                why = (f"tau/P={ratio:.1f} over the {args.max_tau_over_period:.0f} "
                       f"convergence cap"
                       if ratio > args.max_tau_over_period
                       else f"element peak past {PEAK_CAP_C:.0f} C")
                print(f"{index}: SKIP infeasible ({why}; {point['voltage']:.1f} V, "
                      f"P={point['period_s']:.3g} s, duty {point['duty']:.2f}, "
                      f"tau={point['tau_s']:.3g} s)")
                continue
            try:
                record = run_design_case(ct, args.mechanism, index, args.closure,
                                         target_point or point)
            except Exception as exc:                      # noqa: BLE001
                print(f"{index}: FAILED {type(exc).__name__}: {exc}")
                if not args.continue_on_error:
                    raise
                with failures.open("a") as flog:
                    flog.write(json.dumps({
                        "design_index": index, "inputs": point,
                        "error": f"{type(exc).__name__}: {exc}"}) + "\n")
                continue
            stream.write(json.dumps(record, separators=(",", ":")) + "\n")
            stream.flush()
            o, i = record["outputs"], record["inputs"]
            gain = o["memory_gain"]
            print(f"{index}: {i['waveform'][:4]} P={i['period_s']:.3g}s "
                  f"tau={i['tau_s']:.3g}s X={o['ch4_conversion']:.4f} "
                  f"gain={'n/a' if gain is None else f'{gain:.3f}'} "
                  f"conv={record['converged']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
