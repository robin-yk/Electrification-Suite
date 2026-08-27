#!/usr/bin/env python3
"""Freeze a model-blind final Cantera test design.

The development holdout was used to aim the second training batch, so it can
no longer provide an independent final estimate. This script selects fresh
physical-drive conditions without reading any transient chemistry output or
model residual. It uses only the declared input box, the CFP element ODE, the
already-fixed CJH map, and the trained model's published validity envelope.

Candidates come from unused Halton indices. A farthest-point pass over the
five deployed features keeps 64 points spread across the claimed domain. The
target list is hashed before Cantera sees it; evaluation must reproduce that
hash and must never add these rows to the training dataset.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from element_drive import (cfp_resistance, drive_defaults, integrate_pulsed_element,
                           lumped_loss_power, profile_function)       # noqa: E402
from run_cjh_validate import interp_map, load_grid                     # noqa: E402
from run_cstr_design import PEAK_CAP_C, design_point                   # noqa: E402

MODEL = HERE / "models" / "rph-surrogate.json"
OUTPUT = HERE / "data" / "targets-final-validation.json"
EPS = 1e-7


def logit(x):
    x = min(max(x, EPS), 1 - EPS)
    return math.log(x / (1 - x))


def quasi_steady(taus, columns, drive, tau_s, phase_points=400):
    at = profile_function(drive)
    weighted = weight_sum = 0.0
    for k in range(phase_points):
        temperature_c = at((k + 0.5) / phase_points)
        conversion = interp_map(taus, columns, temperature_c, tau_s)
        weight = 1 / (temperature_c + 273.15)
        weighted += weight * conversion
        weight_sum += weight
    return weighted / weight_sum


def normalized(features, low, high):
    return [(value - lo) / (hi - lo) for value, lo, hi in zip(features, low, high)]


def target_seal_material(targets):
    keys = ("voltage", "period_s", "duty", "tau_s")
    return "\n".join(
        str(target["design_index"]) + "|" +
        "|".join(struct.pack(">d", float(target[key])).hex() for key in keys)
        for target in targets).encode()


def steady_power_start(voltage, duty):
    """Cheap equal-average-power temperature used only to shorten ODE spin-up."""
    target = duty * voltage * voltage / cfp_resistance(600.0)
    params = drive_defaults()
    lo, hi = 25.0, 3000.0
    for _ in range(70):
        mid = (lo + hi) / 2
        if lumped_loss_power(mid, params) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=64)
    parser.add_argument("--candidate-multiple", type=int, default=8)
    parser.add_argument("--halton-start", type=int, default=10001)
    parser.add_argument("--design-index-start", type=int, default=1000001)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    model = json.loads(MODEL.read_text())
    if model.get("verdict") != "SHIP":
        raise SystemExit("the frozen candidate model has not passed its development gates")
    low, high = model["feature_min"], model["feature_max"]
    taus, columns = load_grid()

    candidates = []
    index = args.halton_start
    needed = args.count * args.candidate_multiple
    while len(candidates) < needed:
        point = design_point(index)
        drive = integrate_pulsed_element(voltage=point["voltage"],
                                         period=point["period_s"],
                                         duty=point["duty"],
                                         start_c=steady_power_start(point["voltage"],
                                                                    point["duty"]))
        if drive["converged"] and drive["t_peak_c"] <= PEAK_CAP_C:
            x_qs = quasi_steady(taus, columns, drive, point["tau_s"])
            features = [logit(x_qs), math.log10(point["period_s"] / point["tau_s"]),
                        point["duty"], drive["t_peak_c"], drive["t_min_c"]]
            if all(lo <= value <= hi for value, lo, hi in zip(features, low, high)):
                candidates.append({
                    **point,
                    "source_halton_index": index,
                    "expected_peak_c": round(drive["t_peak_c"], 6),
                    "expected_min_c": round(drive["t_min_c"], 6),
                    "cjh_x_qs": x_qs,
                    "selection_features": features,
                })
                if len(candidates) % args.count == 0:
                    print(f"accepted {len(candidates)}/{needed} candidates", flush=True)
        index += 1

    z = [normalized(c["selection_features"], low, high) for c in candidates]
    center = [0.5] * len(low)
    chosen = [max(range(len(z)), key=lambda i: sum((a - b) ** 2
                                                   for a, b in zip(z[i], center)))]
    distance = [sum((a - b) ** 2 for a, b in zip(row, z[chosen[0]])) for row in z]
    while len(chosen) < args.count:
        far = max(range(len(z)), key=lambda i: distance[i] if i not in chosen else -1.0)
        chosen.append(far)
        for i, row in enumerate(z):
            d2 = sum((a - b) ** 2 for a, b in zip(row, z[far]))
            distance[i] = min(distance[i], d2)

    targets = []
    for k, candidate_index in enumerate(chosen):
        c = candidates[candidate_index]
        targets.append({
            "design_index": args.design_index_start + k,
            "source_halton_index": c["source_halton_index"],
            "voltage": c["voltage"],
            "period_s": c["period_s"],
            "duty": c["duty"],
            "tau_s": c["tau_s"],
            "expected_peak_c": c["expected_peak_c"],
            "expected_min_c": c["expected_min_c"],
            "cjh_x_qs": c["cjh_x_qs"],
        })
    payload = {
        "schema": 1,
        "purpose": "independent final test; never train on these cases",
        "selection": ("unused Halton inputs, CFP ODE feasibility, dense CJH baseline, "
                      "and published validity envelope only; no transient output, "
                      "model prediction, uncertainty, or residual was consulted"),
        "count": len(targets),
        "halton_start": args.halton_start,
        "candidate_pool": len(candidates),
        "model_canonical_design_sha256": model["canonical_design_sha256"],
        "targets_sha256": hashlib.sha256(target_seal_material(targets)).hexdigest(),
        "targets": targets,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"sealed {len(targets)} final-test targets at {args.output}")
    print(f"targets sha256 {payload['targets_sha256']}")
    print(f"Halton scan {args.halton_start}..{index - 1}; candidate pool {len(candidates)}")
    print(f"peak {min(t['expected_peak_c'] for t in targets):.0f}.."
          f"{max(t['expected_peak_c'] for t in targets):.0f} C; "
          f"P/tau {min(t['period_s']/t['tau_s'] for t in targets):.3g}.."
          f"{max(t['period_s']/t['tau_s'] for t in targets):.3g}")


if __name__ == "__main__":
    main()
