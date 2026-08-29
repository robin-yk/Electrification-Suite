#!/usr/bin/env python3
"""Freeze the domain gate for one model, calibrated on a development set.

The gate answers a question the model can answer about itself: is this
candidate one the model is no more uncertain about than the cases where its
error gates were actually measured? The threshold is the given quantile of
the per-case worst-target posterior sigma over a held-out development set,
written to a small JSON that travels with the model. Freezing it in a file
is the point: the gate stops being something a sweep can quietly retune.

Run:
  python tools/openmkm_dynamic/calibrate_gate.py \
      --model models/wide-surrogate-atlas-v3.json \
      --dev 'data/wide/design-wide-validation-w*.jsonl'
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pulse_common import calibrate_sigma_threshold  # noqa: E402
import train_surrogate_wide as T  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--dev", nargs="+", required=True)
ap.add_argument("--sidecar", default=HERE + "/data/wide/atlas-qs-sidecar.json")
ap.add_argument("--quantile", type=float, default=0.95)
ap.add_argument("--out", default=None)
a = ap.parse_args()

model = a.model if os.path.isabs(a.model) else HERE + "/" + a.model
dev_globs = [g if os.path.isabs(g) else HERE + "/" + g for g in a.dev]
sidecar = json.loads(open(a.sidecar).read())["cases"]
recs = [r for r in T.load(dev_globs)
        if r.get("converged") and str(r["design_index"]) in sidecar]
X = np.array([T.features(r, sidecar) for r in recs])
print(f"development set: {len(recs)} cases")

thr, sig = calibrate_sigma_threshold(model, X, a.quantile)
out = {"model": os.path.basename(model), "quantile": a.quantile,
       "sigma_threshold": thr, "development_cases": len(recs),
       "development_sigma": {"median": float(np.median(sig)),
                             "p95": float(np.quantile(sig, 0.95)),
                             "max": float(sig.max())},
       "rule": "worst posterior sigma over the four targets, at or under the "
               "quantile of the same statistic on the development set, AND "
               "inside the design box on the raw controls"}
path = a.out or (HERE + "/data/wide/gate-" +
                 os.path.basename(model).replace(".json", "") + ".json")
json.dump(out, open(path, "w"), indent=1)
print(f"sigma median {np.median(sig):.4f}, p95 {np.quantile(sig, 0.95):.4f}, "
      f"max {sig.max():.4f}")
print(f"GATE FROZEN at sigma <= {thr:.4f} -> {path}")
