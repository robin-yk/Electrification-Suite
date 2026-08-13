#!/usr/bin/env python3
"""Cross-validate simple surrogates before adding an ML dependency."""
import argparse
import json
import math
from pathlib import Path


def load(path):
    if path.suffix == ".jsonl":
        rows = [json.loads(line) for line in path.read_text().splitlines() if line]
        names = list(rows[0]["inputs"])
        return names, [[r["inputs"][n] for n in names] for r in rows], [
            [r["outputs"]["ch4_conversion"], r["outputs"]["c2_selectivity_carbon"]]
            for r in rows]
    data = json.loads(path.read_text())
    return ["element_T_C"], [[c["element_T_C"]] for c in data["cases"]], [
        [c["ch4_conversion"], c["c2_selectivity_carbon"]] for c in data["cases"]]


def predict_idw(train_x, train_y, query, scales, neighbors=8):
    distances = []
    for x, y in zip(train_x, train_y):
        d2 = sum(((a - b) / s) ** 2 for a, b, s in zip(x, query, scales))
        distances.append((d2, y))
    distances.sort(key=lambda pair: pair[0])
    chosen = distances[:min(neighbors, len(distances))]
    if chosen[0][0] < 1e-20:
        return chosen[0][1]
    weights = [1 / pair[0] for pair in chosen]
    return [sum(w * pair[1][j] for w, pair in zip(weights, chosen)) / sum(weights)
            for j in range(2)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path)
    parser.add_argument("--neighbors", type=int, default=8)
    args = parser.parse_args()
    names, xs, ys = load(args.data)
    if len(xs) < 6:
        raise SystemExit("need at least 6 cases")
    scales = [max(row[j] for row in xs) - min(row[j] for row in xs)
              for j in range(len(names))]
    errors = [[], []]
    for i, query in enumerate(xs):
        pred = predict_idw(xs[:i] + xs[i + 1:], ys[:i] + ys[i + 1:],
                           query, scales, args.neighbors)
        for j in range(2):
            errors[j].append(pred[j] - ys[i][j])
    labels = ["CH4 conversion", "C2 selectivity"]
    print(f"cases={len(xs)} inputs={','.join(names)} model=local-IDW({args.neighbors})")
    worst = 0
    for label, err in zip(labels, errors):
        mae = sum(abs(v) for v in err) / len(err)
        rmse = math.sqrt(sum(v * v for v in err) / len(err))
        maxe = max(abs(v) for v in err)
        worst = max(worst, maxe)
        print(f"{label}: MAE={mae:.5f} RMSE={rmse:.5f} MAX={maxe:.5f}")
    if worst <= 0.02:
        print("decision=SIMPLE_INTERPOLATOR_SUFFICIENT (max holdout error <= 0.02)")
    else:
        print("decision=TEST_ML_SURROGATES (local interpolation misses the 0.02 target)")


if __name__ == "__main__":
    main()
