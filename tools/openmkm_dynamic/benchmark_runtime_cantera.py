#!/usr/bin/env python3
"""Benchmark exact Cantera reruns for cycle-stratified final-validation cases."""

import argparse
import hashlib
import json
import platform
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import cantera as ct

from run_cstr_case import build_params, run_case
from run_cstr_design import MAX_CYCLES, POINTS_PER_CYCLE


# Six sealed final-validation cases spanning 10 to 486 convergence cycles.
SELECTED_DESIGN_INDICES = [1000001, 1000055, 1000011, 1000043, 1000042, 1000006]
REPO_ROOT = Path(__file__).resolve().parents[2]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def repo_path(path):
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(REPO_ROOT))
    except ValueError:
        return str(resolved)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).parent / "data/canonical/final-validation.jsonl",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=1)
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be at least 1")

    rows = {
        row["design_index"]: row
        for row in (
            json.loads(line)
            for line in args.data.read_text().splitlines()
            if line.strip()
        )
    }
    missing = [i for i in SELECTED_DESIGN_INDICES if i not in rows]
    if missing:
        raise KeyError(f"selected design indices missing from dataset: {missing}")

    report = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "cantera_version": ct.__version__,
        "python_version": sys.version,
        "platform": platform.platform(),
        "machine": platform.machine(),
        "dataset": repo_path(args.data),
        "dataset_sha256": sha256(args.data),
        "definition": (
            "Wall time for run_case: transient periodic CSTR integration through "
            "cycle convergence and summary construction. The timing excludes the "
            "quasi-steady reference, input parsing, and Python process startup."
        ),
        "selection": (
            "Six sealed final-validation cases selected before timing to span the "
            "recorded convergence-cycle range."
        ),
        "repeats_per_case": args.repeats,
        "cases": [],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    for design_index in SELECTED_DESIGN_INDICES:
        original = rows[design_index]
        inputs = original["inputs"]
        args_ns = argparse.Namespace(
            mechanism="gri30.yaml",
            t_min_c=25.0,
            t_peak_c=1250.0,
            duty=inputs["duty"],
            waveform="physical",
            voltage=inputs["voltage_V"],
            ramp_up_fraction=0.05,
            ramp_down_fraction=0.05,
            pressure_atm=1.0,
            residence_time_s=inputs["tau_s"],
            feed="CH4:1, CO2:1",
            points_per_cycle=POINTS_PER_CYCLE,
            min_cycles=10,
            max_cycles=MAX_CYCLES,
            cycle_tolerance=1e-7,
            record_cycles=1,
            period_s=inputs["period_s"],
            closure=inputs["closure"],
        )
        params = build_params(args_ns)
        elapsed_values = []
        conversions = []
        rerun_cycles = []
        for _ in range(args.repeats):
            start = time.perf_counter()
            rerun = run_case("gri30.yaml", params)
            elapsed_values.append(time.perf_counter() - start)
            summary = rerun["cycle_summary"]
            conversions.append(summary["mean_ch4_conversion"])
            rerun_cycles.append(summary["cycles_to_convergence"])

        if any(c != original["cycles_to_convergence"] for c in rerun_cycles):
            raise RuntimeError(
                f"{design_index}: convergence-cycle count changed from "
                f"{original['cycles_to_convergence']} to {rerun_cycles}"
            )
        differences = [
            abs(original["outputs"]["ch4_conversion"] - value)
            for value in conversions
        ]
        if max(differences) > 1e-10:
            raise RuntimeError(
                f"{design_index}: conversion changed by {max(differences):.3e}"
            )

        record = {
            "design_index": design_index,
            "recorded_cycles": original["cycles_to_convergence"],
            "rerun_cycles": rerun_cycles,
            "period_s": inputs["period_s"],
            "tau_s": inputs["tau_s"],
            "voltage_V": inputs["voltage_V"],
            "duty": inputs["duty"],
            "recorded_conversion": original["outputs"]["ch4_conversion"],
            "rerun_conversions": conversions,
            "max_abs_conversion_difference": max(differences),
            "wall_time_s": {
                "median": statistics.median(elapsed_values),
                "min": min(elapsed_values),
                "max": max(elapsed_values),
                "values": elapsed_values,
            },
        }
        report["cases"].append(record)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(record), flush=True)


if __name__ == "__main__":
    main()
