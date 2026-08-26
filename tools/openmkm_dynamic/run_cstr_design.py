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

Sampled axes (6-D Halton, log where the axis spans timescales):

  period_s     1 ms .. 10 s      log    pulse timescale
  tau_s        10 ms .. 1 s      log    washout timescale
  duty         0.05 .. 0.60             hot fraction
  t_peak_c     1000 .. 1400 C           where chemistry runs
  t_min_c      500 .. 900 C             quench floor
  waveform     trapezoid/square/sine/double  shape diversity

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
                           waveform_temperature, RECORD_SPECIES)
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


def halton(index, base):
    value, factor = 0.0, 1.0
    while index:
        factor /= base
        index, digit = divmod(index, base)
        value += digit * factor
    return value


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


def run_design_case(ct, mech, index, closure="const-pressure"):
    point = design_point(index)
    args = argparse.Namespace(
        mechanism=mech, t_min_c=25.0, t_peak_c=1250.0,
        duty=point["duty"], waveform="physical", voltage=point["voltage"],
        ramp_up_fraction=0.05, ramp_down_fraction=0.05, pressure_atm=1.0,
        residence_time_s=point["tau_s"], feed="CH4:1, CO2:1",
        points_per_cycle=POINTS_PER_CYCLE, min_cycles=10, max_cycles=MAX_CYCLES,
        cycle_tolerance=1e-7, record_cycles=1, period_s=point["period_s"],
        closure=closure)
    p = build_params(args)
    result = run_case(mech, p)
    qs = quasi_steady_reference(ct, mech, p, n_grid=9)
    cs = result["cycle_summary"]
    x_dyn, x_qs = cs["mean_ch4_conversion"], qs["ch4_conversion"]
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
            "radical_carryover": cs["radical_carryover_at_cycle_start"],
        },
        "converged": cs["converged"],
        "cycles_to_convergence": cs["cycles_to_convergence"],
        "trajectory": subsample(result["trajectory"], POINTS_PER_CYCLE),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mechanism", default="gri30.yaml")
    parser.add_argument("--cases", type=int, default=256)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--output", type=Path,
                        default=HERE / "data" / "cstr-design-256.jsonl")
    parser.add_argument("--continue-on-error", action="store_true")
    parser.add_argument("--closure", default="const-pressure",
                        choices=["const-pressure", "const-volume"],
                        help="reactor closure; recorded with every case")
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

    with args.output.open("a") as stream:
        for index in range(args.start, args.start + args.cases):
            if index in done:
                continue
            try:
                record = run_design_case(ct, args.mechanism, index, args.closure)
            except Exception as exc:                      # noqa: BLE001
                print(f"{index}: FAILED {type(exc).__name__}: {exc}")
                if not args.continue_on_error:
                    raise
                with failures.open("a") as flog:
                    flog.write(json.dumps({
                        "design_index": index, "inputs": design_point(index),
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
