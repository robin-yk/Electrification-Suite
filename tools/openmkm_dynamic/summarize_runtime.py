#!/usr/bin/env python3
"""Combine Cantera and browser timings into a reproducible comparison report."""

import argparse
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(fraction * len(ordered)) - 1)]


def pearson(x_values, y_values):
    x_mean = statistics.mean(x_values)
    y_mean = statistics.mean(y_values)
    numerator = sum(
        (x - x_mean) * (y - y_mean) for x, y in zip(x_values, y_values)
    )
    denominator = math.sqrt(
        sum((x - x_mean) ** 2 for x in x_values)
        * sum((y - y_mean) ** 2 for y in y_values)
    )
    return numerator / denominator


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cantera", type=Path, required=True)
    parser.add_argument("--browser", type=Path, required=True)
    parser.add_argument(
        "--accuracy",
        type=Path,
        default=Path(__file__).parent
        / "data/canonical/final-validation-report.json",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    cantera = json.loads(args.cantera.read_text())
    browser = json.loads(args.browser.read_text())
    accuracy = json.loads(args.accuracy.read_text())
    browser_by_case = {
        row["design_index"]: row for row in browser["by_case_ms"]
    }
    paired = []
    for case in cantera["cases"]:
        browser_case = browser_by_case[case["design_index"]]
        speedup = (
            case["wall_time_s"]["median"] * 1000.0
            / browser_case["median"]
        )
        paired.append(
            {
                "design_index": case["design_index"],
                "cycles_to_convergence": case["recorded_cycles"],
                "period_s": case["period_s"],
                "cantera_median_s": case["wall_time_s"]["median"],
                "browser_median_ms": browser_case["median"],
                "speedup": speedup,
                "abs_conversion_reproduction_difference": case[
                    "max_abs_conversion_difference"
                ],
            }
        )

    speedups = [row["speedup"] for row in paired]
    cycles = [row["cycles_to_convergence"] for row in paired]
    cantera_times = [row["cantera_median_s"] for row in paired]
    cycle_time_r = pearson(cycles, cantera_times)
    report = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "comparison": (
            "Exact Cantera 3.2 transient CSTR wall time divided by the median "
            "wall time of the complete deterministic browser calculation path."
        ),
        "paired_cases": paired,
        "summary": {
            "paired_case_count": len(paired),
            "speedup_min": min(speedups),
            "speedup_median": statistics.median(speedups),
            "speedup_max": max(speedups),
            "max_abs_conversion_reproduction_difference": max(
                row["abs_conversion_reproduction_difference"] for row in paired
            ),
            "cycle_count_vs_cantera_time_pearson_r": cycle_time_r,
            "cycle_count_vs_cantera_time_r_squared": cycle_time_r**2,
            "browser_all_cases": browser["cases"],
            "browser_all_evaluations": browser["evaluations"],
            "browser_all_case_summary_ms": browser["summary_ms"],
        },
        "independent_final_validation": {
            "verdict": accuracy["verdict"],
            "summary": accuracy["summary"],
            "gates": accuracy["gates"],
        },
        "environments": {
            "cantera": {
                "version": cantera["cantera_version"],
                "python": cantera["python_version"],
                "platform": cantera["platform"],
                "machine": cantera["machine"],
            },
            "browser": {
                "node": browser["node_version"],
                "v8": browser["v8_version"],
                "platform": browser["platform"],
                "architecture": browser["architecture"],
                "processor": browser["processor"],
            },
        },
        "interpretation_limits": [
            "Wall-clock values depend on hardware and software versions.",
            "The Cantera sample uses one or more complete reruns per selected case; "
            "the browser value uses the median of repeated evaluations after warm-up.",
            "Convergence cycles do not determine runtime alone. Pulse period, "
            "residence time, and chemical stiffness also change integration cost.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
