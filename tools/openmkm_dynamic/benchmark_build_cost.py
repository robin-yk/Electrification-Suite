#!/usr/bin/env python3
"""What did the surrogate cost to build, and what does one condition cost?

benchmark_runtime_cantera.py already times six sealed cases against the
browser path and reports a speedup. That answers how much faster one
evaluation is. It does not answer the question a reviewer asks next: the
surrogate had to be built before it could answer anything, so how many
evaluations does the screen have to run before the build is repaid? This
file measures the terms that break-even needs, which the runtime benchmark
does not collect.

Two things differ from that benchmark, deliberately. Its six cases were
chosen to span 10 to 486 convergence cycles, which makes their median a
spread-by-design statistic rather than a population one; here the transient
sample is stratified and weighted so its mean estimates the whole 285-case
set. And it times only the transient path, where break-even also needs the
steady map, the labelling references, and the fit.

Three costs are separated because they are charged to different accounts:

  transient        one design point through run_case: what screening one
                   candidate costs if there is no surrogate. This is the
                   number the speedup divides into.
  quasi-steady     the 9-point steady reference that turns a transient run
                   into a *training label*. Charged to the build, never to
                   the screen: a designer screening candidates does not need
                   the baseline, only the answer.
  steady map       one node of the dense (T, tau) CSTR grid the quasi-steady
                   blend interpolates. 2,251 of these underlie the surrogate.

Timing every case would take hours and buy nothing: the population mean is
what the projection needs, and a stratified draw estimates it with far less
spread than a plain one. Each stratum's measured mean is weighted by its
true share of the population, so the estimate is of the whole set and not of
the sample.

Strata are cut on cycles_to_convergence because it is the strongest single
predictor available before a case is run, not because it determines cost.
It does not: measured here, cases that all converged in 10 cycles ran from
0.93 s to 13.5 s, a factor of fourteen, because pulse period and stiffness
set the integrator's step count independently of how many cycles the outer
map takes. The weighting is what makes the estimate unbiased; the choice of
stratifying variable only affects how tight it is.

The absolute seconds belong to this machine and are recorded with it. The
ratio in the report is what travels.

Usage:
  python tools/openmkm_dynamic/benchmark_build_cost.py [--transient 40]
      [--steady 60] [--reference 16] [--strata 8] [--seed 11]
"""
import argparse
import json
import platform
import random
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANON = HERE / "data" / "canonical"
sys.path.insert(0, str(HERE))

import cantera as ct                                          # noqa: E402
from run_cstr_case import build_params, run_case               # noqa: E402
from run_cstr_pilot import quasi_steady_reference, steady_state  # noqa: E402
from run_cstr_design import POINTS_PER_CYCLE, MAX_CYCLES       # noqa: E402

MECH = "gri30.yaml"


def design_params(inputs):
    """Rebuild the exact parameter set the canonical case was run with."""
    args = argparse.Namespace(
        mechanism=MECH, t_min_c=25.0, t_peak_c=1250.0,
        duty=inputs["duty"], waveform="physical", voltage=inputs["voltage_V"],
        ramp_up_fraction=0.05, ramp_down_fraction=0.05, pressure_atm=1.0,
        residence_time_s=inputs["tau_s"], feed="CH4:1, CO2:1",
        points_per_cycle=POINTS_PER_CYCLE, min_cycles=10, max_cycles=MAX_CYCLES,
        cycle_tolerance=1e-7, record_cycles=1, period_s=inputs["period_s"],
        closure="const-pressure")
    return build_params(args)


def stratified(rows, key, count, strata, rng):
    """Draw `count` rows spread over `strata` equal-count bands of `key`.

    Returns (sample, weights) where weights[i] is the share of the population
    the row's stratum holds, so a weighted mean estimates the population mean.
    """
    ordered = sorted(rows, key=key)
    n = len(ordered)
    bands = [ordered[round(i * n / strata):round((i + 1) * n / strata)]
             for i in range(strata)]
    bands = [b for b in bands if b]
    per = max(1, count // len(bands))
    sample, weights = [], []
    for band in bands:
        picked = rng.sample(band, min(per, len(band)))
        share = (len(band) / n) / len(picked)
        sample += picked
        weights += [share] * len(picked)
    return sample, weights


def summarize(seconds, weights, population):
    """Sample spread, plus the population mean and total the weights imply."""
    ordered = sorted(seconds)

    def q(f):
        return ordered[min(len(ordered) - 1, max(0, round(f * len(ordered)) - 1))]

    mean = sum(s * w for s, w in zip(seconds, weights))
    spread = statistics.pstdev(seconds) if len(seconds) > 1 else 0.0
    return {
        "sampled": len(seconds), "population": population,
        "mean": mean, "median": q(0.5), "p95": q(0.95),
        "min": ordered[0], "max": ordered[-1], "sample_stdev": spread,
        "projected_total": mean * population,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--transient", type=int, default=40)
    ap.add_argument("--steady", type=int, default=60)
    ap.add_argument("--reference", type=int, default=16)
    ap.add_argument("--strata", type=int, default=8)
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--output", type=Path, default=CANON / "cantera-cost.json")
    args = ap.parse_args()
    rng = random.Random(args.seed)

    design = [json.loads(line) for line
              in (CANON / "design-physical.jsonl").read_text().splitlines() if line.strip()]
    grid = [json.loads(line) for line
            in (CANON / "cjh-grid.jsonl").read_text().splitlines() if line.strip()]

    # Warm the mechanism parse out of the first measurement: loading gri30.yaml
    # is a once-per-process cost, not a per-condition one, so it is timed on
    # its own rather than charged to whichever case happens to run first.
    t0 = time.perf_counter()
    ct.Solution(MECH)
    mech_load = time.perf_counter() - t0
    run_case(MECH, design_params(design[0]["inputs"]))

    print(f"transient: {args.transient} of {len(design)} cases", flush=True)
    tr_rows, tr_w = stratified(design, lambda r: r["cycles_to_convergence"],
                               args.transient, args.strata, rng)
    tr_s, tr_cycles = [], []
    for i, row in enumerate(tr_rows):
        p = design_params(row["inputs"])
        t0 = time.perf_counter()
        result = run_case(MECH, p)
        dt = time.perf_counter() - t0
        tr_s.append(dt)
        tr_cycles.append(result["cycle_summary"]["cycles_to_convergence"])
        print(f"  [{i + 1}/{len(tr_rows)}] index {row['design_index']:>5} "
              f"cycles {tr_cycles[-1]:>4} {dt:8.3f} s", flush=True)

    print(f"quasi-steady reference: {args.reference} cases", flush=True)
    qs_rows, qs_w = stratified(design, lambda r: r["inputs"]["tau_s"],
                               args.reference, args.strata, rng)
    qs_s = []
    for i, row in enumerate(qs_rows):
        p = design_params(row["inputs"])
        t0 = time.perf_counter()
        quasi_steady_reference(ct, MECH, p, n_grid=9)
        qs_s.append(time.perf_counter() - t0)
        print(f"  [{i + 1}/{len(qs_rows)}] {qs_s[-1]:8.3f} s", flush=True)

    print(f"steady map: {args.steady} of {len(grid)} nodes", flush=True)
    st_rows, st_w = stratified(grid, lambda r: r["T_C"], args.steady, args.strata, rng)
    st_s = []
    for i, row in enumerate(st_rows):
        p = design_params(design[0]["inputs"])
        p["tau_s"] = row["tau_s"]
        t0 = time.perf_counter()
        steady_state(ct, MECH, p, row["T_C"] + 273.15)
        st_s.append(time.perf_counter() - t0)
        if (i + 1) % 10 == 0:
            print(f"  [{i + 1}/{len(st_rows)}] {st_s[-1]:8.4f} s", flush=True)

    print("GP fit", flush=True)
    with tempfile.TemporaryDirectory() as tmp:
        cmd = [sys.executable, str(HERE / "train_surrogate.py"),
               "--holdout-from", str(HERE / "models" / "rph-surrogate.json"),
               "--export", str(Path(tmp) / "model.json")]
        t0 = time.perf_counter()
        subprocess.run(cmd, check=True, capture_output=True)
        fit_s = time.perf_counter() - t0

    report = {
        "generated_by": "tools/openmkm_dynamic/benchmark_build_cost.py",
        "machine": {
            "cpu": platform.processor() or platform.machine(),
            "python": platform.python_version(), "cantera": ct.__version__,
            "platform": platform.platform(),
            "note": "single-threaded; absolute seconds are machine-specific",
        },
        "seed": args.seed, "strata": args.strata,
        "mechanism_load_seconds": mech_load,
        "transient": summarize(tr_s, tr_w, 1),
        "transient_set": summarize(tr_s, tr_w, len(design)),
        "quasi_steady": summarize(qs_s, qs_w, 1),
        "quasi_steady_set": summarize(qs_s, qs_w, len(design)),
        "steady_state": summarize(st_s, st_w, 1),
        "steady_map": summarize(st_s, st_w, len(grid)),
        "gp_fit": {"seconds": fit_s,
                   "note": "reproduces the shipped fit with the sealed holdout"},
        "cycles_sampled": tr_cycles,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    t = report["transient"]
    print(f"\ntransient    mean {t['mean']:.3f} s   median {t['median']:.3f} s"
          f"   max {t['max']:.3f} s")
    print(f"steady node  mean {report['steady_state']['mean']:.4f} s")
    print(f"GP fit       {fit_s:.2f} s")
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
