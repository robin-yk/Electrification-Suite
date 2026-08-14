#!/usr/bin/env python3
"""Does waveform-parameter interpolation predict the dynamic response?

Same triage question as tools/openmkm/benchmark_surrogate.py, asked of the
dynamic dataset: leave-one-out inverse-distance interpolation over the
waveform design space, scored on cycle-average conversion, C2 selectivity,
and the memory gain (X_dyn / X_qs) that is the whole reason this dataset
exists. Only if this baseline misses the target is a learned dynamic
surrogate justified.

Timescale axes enter as logarithms because the pilot's response varies over
decades of pulse period, and the waveform family enters as one-hot columns
so shapes are never averaged into each other.

Usage:
  python tools/openmkm_dynamic/benchmark_dynamic.py \\
      tools/openmkm_dynamic/data/cstr-design-256.jsonl
"""
import argparse
import json
import math
from pathlib import Path

WAVEFORMS = ["trapezoid", "square", "sine", "double"]
TARGETS = [("ch4_conversion", "CH4 conversion"),
           ("c2_selectivity_carbon", "C2 selectivity"),
           ("memory_gain", "memory gain X_dyn/X_qs")]
THRESHOLD = 0.02


def featurize(inputs):
    f = [math.log10(inputs["period_s"]), math.log10(inputs["tau_s"]),
         inputs["duty"], inputs["t_peak_K"], inputs["t_min_K"],
         inputs["mean_temperature_K"]]
    f += [1.0 if inputs["waveform"] == w else 0.0 for w in WAVEFORMS]
    return f


def load(path, require_converged=True):
    rows, skipped = [], 0
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if require_converged and not r.get("converged", True):
            skipped += 1
            continue
        if r["outputs"].get("memory_gain") is None:
            skipped += 1
            continue
        rows.append((featurize(r["inputs"]),
                     [r["outputs"][k] for k, _ in TARGETS]))
    return rows, skipped


def predict_idw(train, query, scales, neighbors):
    scored = []
    for x, y in train:
        d2 = sum(((a - b) / s) ** 2 for a, b, s in zip(x, query, scales))
        scored.append((d2, y))
    scored.sort(key=lambda pair: pair[0])
    chosen = scored[:min(neighbors, len(scored))]
    if chosen[0][0] < 1e-20:
        return chosen[0][1]
    w = [1 / pair[0] for pair in chosen]
    return [sum(wi * pair[1][j] for wi, pair in zip(w, chosen)) / sum(w)
            for j in range(len(TARGETS))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    parser.add_argument("--neighbors", type=int, default=8)
    parser.add_argument("--include-unconverged", action="store_true")
    args = parser.parse_args()

    rows, skipped = load(args.data, not args.include_unconverged)
    if len(rows) < 6:
        raise SystemExit("need at least 6 usable cases")
    n_feat = len(rows[0][0])
    scales = []
    for j in range(n_feat):
        col = [r[0][j] for r in rows]
        scales.append((max(col) - min(col)) or 1.0)

    errors = [[] for _ in TARGETS]
    worst_case = [None] * len(TARGETS)
    for i, (query, truth) in enumerate(rows):
        pred = predict_idw(rows[:i] + rows[i + 1:], query, scales, args.neighbors)
        for j in range(len(TARGETS)):
            e = pred[j] - truth[j]
            errors[j].append(e)
            if worst_case[j] is None or abs(e) > abs(worst_case[j][0]):
                worst_case[j] = (e, i, truth[j], pred[j])

    print(f"cases={len(rows)} (skipped {skipped}) features={n_feat} "
          f"model=local-IDW({args.neighbors})")
    worst = 0.0
    for j, (_, label) in enumerate(TARGETS):
        err = errors[j]
        mae = sum(abs(v) for v in err) / len(err)
        rmse = math.sqrt(sum(v * v for v in err) / len(err))
        p95 = sorted(abs(v) for v in err)[int(0.95 * (len(err) - 1))]
        maxe = max(abs(v) for v in err)
        worst = max(worst, maxe)
        e, i, t, pr = worst_case[j]
        print(f"{label}: MAE={mae:.5f} RMSE={rmse:.5f} p95={p95:.5f} "
              f"MAX={maxe:.5f} (row {i}: true {t:.5f} vs predicted {pr:.5f})")
    print("decision=" + ("SIMPLE_INTERPOLATOR_SUFFICIENT" if worst <= THRESHOLD
                         else "TEST_ML_SURROGATES") +
          f" (max holdout error {'<=' if worst <= THRESHOLD else '>'} {THRESHOLD})")


if __name__ == "__main__":
    main()
