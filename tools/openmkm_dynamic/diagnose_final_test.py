#!/usr/bin/env python3
"""Three diagnostics on the sealed 64-case final test, none of which refit.

Raised by external review of the manuscript: (0/6) report the error in
conversion percentage points with R^2 = 1 - SSE/SST; (4) show that the GP's
own uncertainty is calibrated, not merely available; (5) explain whether the
large quasi-steady underpredictions at high conversion are plain error
growth or concentrated composition-history physics.

The features and predictions are the deployed browser path's own, exported
by export_final_features.mjs. The predictive variance is the one quantity
the JS bundle cannot produce (it ships alpha, not the Cholesky factor), so
it is rebuilt here from train_z and the shipped hyperparameters; the mean
recomputed on that path must agree with the JS mean to float precision or
the run aborts.

Usage:
  node tools/openmkm_dynamic/export_final_features.mjs
  python tools/openmkm_dynamic/diagnose_final_test.py
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANON = HERE / "data" / "canonical"

def logit(x):
    x = min(max(x, 1e-7), 1 - 1e-7)
    return math.log(x / (1 - x))

def sigmoid(v):
    return 1 / (1 + math.exp(-v)) if v > -500 else 0.0

def matern52(a, b, ls):
    r2 = sum(((x - y) / l) ** 2 for x, y, l in zip(a, b, ls))
    r = math.sqrt(r2)
    s = math.sqrt(5.0)
    return (1 + s * r + 5 * r2 / 3) * math.exp(-s * r)

def cholesky(K):
    n = len(K)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = K[i][j] - sum(L[i][k] * L[j][k] for k in range(j))
            L[i][j] = math.sqrt(s) if i == j else s / L[j][j]
    return L

def solve_chol(L, y):
    n = len(y)
    f = [0.0] * n
    for i in range(n):
        f[i] = (y[i] - sum(L[i][k] * f[k] for k in range(i))) / L[i][i]
    b = [0.0] * n
    for i in reversed(range(n)):
        b[i] = (f[i] - sum(L[k][i] * b[k] for k in range(i + 1, n))) / L[i][i]
    return b

def mean_(v):
    return sum(v) / len(v)

def quantile(v, f):
    s = sorted(v)
    return s[min(len(s) - 1, max(0, math.ceil(f * len(s)) - 1))]

def pearson(x, y):
    mx, my = mean_(x), mean_(y)
    sx = math.sqrt(sum((a - mx) ** 2 for a in x))
    sy = math.sqrt(sum((a - my) ** 2 for a in y))
    if sx == 0 or sy == 0:
        return float("nan")
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / (sx * sy)

def spearman(x, y):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    return pearson(ranks(x), ranks(y))

# Two-sided standard-normal quantiles for the nominal intervals reported.
Z = {0.50: 0.674489750196082, 0.80: 1.2815515655446004,
     0.90: 1.6448536269514722, 0.95: 1.959963984540054}


def main():
    feats = json.loads((CANON / "final-features.json").read_text())
    bundle = json.loads((HERE.parents[1] / "apps" / "rphcjh" / "data"
                         / "rph-surrogate.json").read_text())
    model = bundle["model"]
    if feats["model_canonical_design_sha256"] != model["canonical_design_sha256"]:
        raise SystemExit("features were exported against a different frozen model")
    cases = feats["cases"]
    ls, sf, sn = model["lengthscales"], model["sigma_f"], model["sigma_n"]
    tz, alpha = model["train_z"], model["alpha"]
    mu, sd = model["feature_mean"], model["feature_std"]

    n = len(tz)
    K = [[sf * sf * matern52(tz[i], tz[j], ls) + (sn * sn if i == j else 0.0)
          for j in range(n)] for i in range(n)]
    L = cholesky(K)

    for c in cases:
        raw = [logit(c["x_qs"]), math.log10(c["period_s"] / c["tau_s"]),
               c["duty"], c["t_peak_c"], c["t_min_c"]]
        z = [(v - m) / s for v, m, s in zip(raw, mu, sd)]
        ks = [sf * sf * matern52(z, t, ls) for t in tz]
        mean = sum(k * a for k, a in zip(ks, alpha))
        # the shipped JS mean and this one must be the same number, or the
        # variance below belongs to a different model than the one evaluated
        if abs(mean - c["delta_pred"]) > 1e-9 * (1 + abs(c["delta_pred"])):
            raise SystemExit(f"mean mismatch on case {c['design_index']}: "
                             f"{mean} vs {c['delta_pred']}")
        v = solve_chol(L, ks)
        var = sf * sf + sn * sn - sum(k * b for k, b in zip(ks, v))
        c["sigma_delta"] = math.sqrt(max(var, 0.0))
        c["delta_true"] = logit(c["x_dyn"]) - logit(c["x_qs"])

    # ---- 1. headline metrics, in conversion percentage points ----
    def metrics(pred_key):
        err = [c[pred_key] - c["x_dyn"] for c in cases]
        ae = [abs(e) for e in err]
        ss_res = sum(e * e for e in err)
        m = mean_([c["x_dyn"] for c in cases])
        ss_tot = sum((c["x_dyn"] - m) ** 2 for c in cases)
        return {
            "mae_pp": 100 * mean_(ae),
            "rmse_pp": 100 * math.sqrt(mean_([e * e for e in err])),
            "mean_signed_pp": 100 * mean_(err),
            "p95_pp": 100 * quantile(ae, 0.95),
            "max_pp": 100 * max(ae),
            "r2_one_minus_sse_sst": 1 - ss_res / ss_tot,
        }
    quasi = metrics("x_qs")
    corrected = metrics("x_pred")
    reduction = 1 - corrected["mae_pp"] / quasi["mae_pp"]

    # ---- 2. GP uncertainty calibration on the independent cases ----
    # The interval is formed where the model lives, in log-odds, and mapped
    # through the same sigmoid as the prediction, so it is the interval a
    # user of the deployed model would actually draw.
    coverage, widths = {}, []
    for level, zq in Z.items():
        hit = 0
        for c in cases:
            lo = sigmoid(logit(c["x_qs"]) + c["delta_pred"] - zq * c["sigma_delta"])
            hi = sigmoid(logit(c["x_qs"]) + c["delta_pred"] + zq * c["sigma_delta"])
            if lo <= c["x_dyn"] <= hi:
                hit += 1
            if level == 0.95:
                widths.append(100 * (hi - lo))
        coverage[f"{level:.2f}"] = hit / len(cases)
    zscores = [(c["delta_true"] - c["delta_pred"]) / c["sigma_delta"] for c in cases]
    half_pp = []
    for c in cases:
        lo = sigmoid(logit(c["x_qs"]) + c["delta_pred"] - Z[0.95] * c["sigma_delta"])
        hi = sigmoid(logit(c["x_qs"]) + c["delta_pred"] + Z[0.95] * c["sigma_delta"])
        half_pp.append(100 * (hi - lo) / 2)
    abs_err_pp = [100 * abs(c["x_pred"] - c["x_dyn"]) for c in cases]
    calibration = {
        "coverage_by_nominal_level": coverage,
        "mean_95_interval_width_pp": mean_(widths),
        "median_95_interval_width_pp": quantile(widths, 0.5),
        "standardized_residuals": {
            "mean": mean_(zscores),
            "stdev": math.sqrt(mean_([(z - mean_(zscores)) ** 2 for z in zscores])),
            "max_abs": max(abs(z) for z in zscores),
        },
        "uncertainty_vs_error": {
            "pearson": pearson(half_pp, abs_err_pp),
            "spearman": spearman(half_pp, abs_err_pp),
        },
    }

    # ---- 3. where the quasi-steady underprediction lives ----
    bands = [("low", 0.0, 0.3), ("mid", 0.3, 0.6), ("high", 0.6, 1.01)]
    by_band = []
    for name, lo, hi in bands:
        sel = [c for c in cases if lo <= c["x_dyn"] < hi]
        if not sel:
            by_band.append({"band": name, "n": 0})
            continue
        signed = [100 * (c["x_qs"] - c["x_dyn"]) for c in sel]
        by_band.append({
            "band": name, "n": len(sel),
            "qs_signed_pp_mean": mean_(signed),
            "qs_mae_pp": mean_([abs(s) for s in signed]),
            "qs_relative_mean": mean_([abs(c["x_qs"] - c["x_dyn"]) / c["x_dyn"]
                                       for c in sel]),
            "corrected_mae_pp": mean_([100 * abs(c["x_pred"] - c["x_dyn"]) for c in sel]),
            "median_period_over_tau": quantile([c["period_s"] / c["tau_s"] for c in sel], 0.5),
            "median_delta_T": quantile([c["t_peak_c"] - c["t_min_c"] for c in sel], 0.5),
            "median_delta_true": quantile([c["delta_true"] for c in sel], 0.5),
        })
    resid = [100 * (c["x_qs"] - c["x_dyn"]) for c in cases]
    drivers = {
        "spearman_qs_residual_vs_x_dyn": spearman(resid, [c["x_dyn"] for c in cases]),
        "spearman_qs_residual_vs_log_p_over_tau":
            spearman(resid, [math.log10(c["period_s"] / c["tau_s"]) for c in cases]),
        "spearman_qs_residual_vs_delta_T":
            spearman(resid, [c["t_peak_c"] - c["t_min_c"] for c in cases]),
        "spearman_delta_true_vs_x_dyn": spearman([c["delta_true"] for c in cases],
                                                 [c["x_dyn"] for c in cases]),
    }

    report = {
        "generated_by": "tools/openmkm_dynamic/diagnose_final_test.py",
        "points": len(cases),
        "quasi_steady": quasi,
        "corrected": corrected,
        "mae_reduction": reduction,
        "calibration": calibration,
        "conversion_bands": by_band,
        "residual_drivers": drivers,
    }
    out = CANON / "final-test-diagnostics.json"
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
