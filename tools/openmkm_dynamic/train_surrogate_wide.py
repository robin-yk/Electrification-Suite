#!/usr/bin/env python3
"""Train the wide-box correction GPs: four targets over six features, on numpy.

The shipped trainer (train_surrogate.py) is pure Python and fine at 194
points; one dense Cholesky there is milliseconds. At the wide campaign's 500
to 2000 points a pure-Python factorization is minutes and a hyperparameter
fit needs hundreds of them, so this trainer redoes the same mathematics on
numpy/scipy. Same kernel (Matern 5/2 ARD), same standardization, same
logit-difference targets, same gates. Before trusting it on new data, run
--check-shipped: it rebuilds the shipped 194-point conversion model's kernel
from the artifact's own train_z/alpha and must reproduce every parity case.

Targets, all corrections in logit space on quantities bounded in (0, 1):
  x_ch4    logit(X_CH4)  - logit(X_CH4,qs)
  x_co2    logit(X_CO2)  - logit(X_CO2,qs)
  y_c2h2   logit(Y_C2H2) - logit(Y_C2H2,qs)   carbon yield on TOTAL fed carbon
  y_co     logit(Y_CO)   - logit(Y_CO,qs)     carbon yield on TOTAL fed carbon
Yields use the total-carbon basis because carbon conservation bounds them in
[0, 1] regardless of feed; the CH4-carbon basis, which the paper may prefer to
QUOTE, is derivable from the same stored fractions and can exceed 1 for CO.

Features (6): logit(x_qs), log10(period/tau), duty, t_peak_C, t_min_C, feed_x.
The first five are the shipped model's features; feed_x is the CH4 mole
fraction parsed from the recorded feed string.

Usage:
  python tools/openmkm_dynamic/train_surrogate_wide.py --check-shipped
  python tools/openmkm_dynamic/train_surrogate_wide.py \
      --train tools/openmkm_dynamic/data/wide/design-wide-pilot-w*.jsonl \
      --test  tools/openmkm_dynamic/data/wide/design-wide-validation-w*.jsonl \
      --output tools/openmkm_dynamic/models/wide-surrogate.json
"""
import argparse
import glob
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent

MW = {"CH4": 16.043, "CO2": 44.010, "CO": 28.010, "H2": 2.016, "H2O": 18.015,
      "C2H2": 26.038, "C2H4": 28.054, "C2H6": 30.070,
      "CH3": 15.035, "H": 1.008, "OH": 17.007}
C2 = ("C2H2", "C2H4", "C2H6")
# The logit floor is 1e-4, not machine-small. A quantity below 1e-4 is below
# anything the absolute-error gates can see, but its logit against a 1e-9
# clamp is a large number set by the clamp constant rather than by physics,
# and near-zero atlas baselines then hand the GP training targets that are
# essentially noise of amplitude ten logit units. That noise wrecked the
# X_CH4 hyperparameters (sigma_n 0.21, length scales collapsed to 0.3) in
# the first atlas-baseline fit. Flooring at 1e-4 bounds every target by
# logit(1-1e-4) - logit(1e-4) and makes the fit independent of the clamp.
EPS = 1e-4
GATES = {"mean": 0.02, "p95": 0.05, "max": 0.10}


def logit(x):
    x = min(1.0 - EPS, max(EPS, x))
    return math.log(x / (1.0 - x))


def sigmoid(v):
    if v >= 0:
        return 1.0 / (1.0 + math.exp(-v))
    e = math.exp(v)
    return e / (1.0 + e)


def feed_x(feed_string):
    parts = dict(kv.split(":") for kv in feed_string.replace(" ", "").split(","))
    a, b = float(parts["CH4"]), float(parts["CO2"])
    return a / (a + b)


def feed_mass_fractions(x):
    m_ch4 = x * MW["CH4"]
    m_co2 = (1.0 - x) * MW["CO2"]
    tot = m_ch4 + m_co2
    return m_ch4 / tot, m_co2 / tot


def quantities(record, sidecar=None):
    """The four bounded targets and their quasi-steady twins, from one case.

    With a sidecar, the quasi-steady side comes from the atlas-interpolated
    blend the DEPLOYMENT computes rather than the Cantera reference recorded
    with the case. Training against the reference and deploying against the
    atlas looks harmless in absolute terms (the interpolation differs by
    about 0.002 mean) but is fatal in logit space wherever a conversion is
    near zero: X_CO2 deployed that way scored 0.907 p95 against a 0.05 gate.
    The correction must be learned against the baseline it will be added to.
    """
    o = record["outputs"]
    x = feed_x(record["inputs"]["feed"])
    w_ch4_in, w_co2_in = feed_mass_fractions(x)
    carbon_fed = w_ch4_in / MW["CH4"] + w_co2_in / MW["CO2"]

    def block(w):
        return {
            "x_ch4": max(0.0, 1.0 - w["CH4"] / w_ch4_in),
            "x_co2": max(0.0, 1.0 - w["CO2"] / w_co2_in),
            "y_c2h2": 2.0 * w["C2H2"] / MW["C2H2"] / carbon_fed,
            "y_co": w["CO"] / MW["CO"] / carbon_fed,
        }

    if sidecar is not None:
        w_qs = sidecar[str(record["design_index"])]["outflow_mass_fractions_qs"]
    else:
        w_qs = o["quasi_steady_outflow_mass_fractions"]
    return (block(o["outflow_mass_fractions"]), block(w_qs))


def features(record, sidecar=None):
    i, o = record["inputs"], record["outputs"]
    if sidecar is not None:
        x_qs = sidecar[str(record["design_index"])]["x_ch4_qs"]
    else:
        x_qs = o["quasi_steady_ch4_conversion"]
    return [logit(x_qs),
            math.log10(i["period_s"] / i["tau_s"]),
            i["duty"],
            i["t_peak_K"] - 273.15,
            i["t_min_K"] - 273.15,
            feed_x(i["feed"])]


def load(patterns):
    rows = []
    for pattern in patterns:
        for path in sorted(glob.glob(pattern)):
            for line in Path(path).read_text().splitlines():
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def matern52_cross(A, B, ls):
    d2 = ((A[:, None, :] - B[None, :, :]) / ls) ** 2
    r = np.sqrt(5.0 * d2.sum(axis=-1))
    return (1.0 + r + r * r / 3.0) * np.exp(-r)


def neg_lml_grad(theta, Z, y, D2=None):
    """Negative log marginal likelihood and its analytic gradient.

    A numeric gradient costs dim+2 kernel factorizations per L-BFGS step; the
    analytic one costs one factorization plus one explicit inverse. D2, the
    unscaled pairwise square differences, never changes during a fit, so the
    caller precomputes it once instead of rebuilding the (n, n, d) broadcast
    on every evaluation.
    """
    n, d = Z.shape
    ls = np.exp(theta[:d])
    sf, sn = math.exp(theta[d]), math.exp(theta[d + 1])
    if D2 is None:
        D2 = (Z[:, None, :] - Z[None, :, :]) ** 2
    S = D2 / (ls * ls)                                   # scaled square dists
    r = np.sqrt(5.0 * S.sum(axis=-1))
    k = (1.0 + r + r * r / 3.0) * np.exp(-r)
    K = sf * sf * k + sn * sn * np.eye(n)
    try:
        L = np.linalg.cholesky(K)
    except np.linalg.LinAlgError:
        return 1e12, np.zeros_like(theta)
    alpha = np.linalg.solve(L.T, np.linalg.solve(L, y))
    Kinv = np.linalg.solve(L.T, np.linalg.solve(L, np.eye(n)))
    nll = float(0.5 * y @ alpha + np.log(np.diag(L)).sum()
                + 0.5 * n * math.log(2 * math.pi))
    # dK/dtheta contracted with W = alpha alpha^T - K^{-1}; grad of nll is
    # -(1/2) sum(W * dK). dk/dr = -(r/3)(1+r)e^{-r}; dr/dlog ls_i = -5 S_i / r.
    W = np.outer(alpha, alpha) - Kinv
    with np.errstate(divide="ignore", invalid="ignore"):
        dk_dr_over_r = np.where(r > 0, -(1.0 / 3.0) * (1 + r) * np.exp(-r), 0.0)
    grad = np.empty_like(theta)
    for i in range(d):
        dK = sf * sf * dk_dr_over_r * (-5.0 * S[:, :, i])
        grad[i] = -0.5 * float((W * dK).sum())
    grad[d] = -0.5 * float((W * (2.0 * sf * sf * k)).sum())
    grad[d + 1] = -0.5 * float(np.trace(W) * 2.0 * sn * sn)
    return nll, grad


def fit(Z, y, seed):
    d = Z.shape[1]
    rng = np.random.default_rng(seed)
    starts = [np.concatenate([np.full(d, math.log(2.0)),
                              [math.log(max(1e-3, y.std())), math.log(0.04)]])]
    for _ in range(5):
        starts.append(np.concatenate([rng.uniform(-1.0, 2.5, d),
                                      [rng.uniform(-3, 1), rng.uniform(-5, -1)]]))
    D2 = (Z[:, None, :] - Z[None, :, :]) ** 2
    results = [minimize(neg_lml_grad, s0, args=(Z, y, D2), jac=True,
                        method="L-BFGS-B",
                        bounds=[(-3, 8)] * d + [(-6, 3), (-9, 1)],
                        options={"maxiter": 300})
               for s0 in starts]
    best = min(results, key=lambda r: r.fun)
    ls = np.exp(best.x[:-2])
    sf, sn = math.exp(best.x[-2]), math.exp(best.x[-1])
    K = sf * sf * matern52_cross(Z, Z, ls) + sn * sn * np.eye(len(Z))
    L = np.linalg.cholesky(K)
    alpha = np.linalg.solve(L.T, np.linalg.solve(L, y))
    return {"lengthscales": ls, "sigma_f": sf, "sigma_n": sn,
            "alpha": alpha, "L": L, "lml": -best.fun,
            "starts_agreeing": sum(1 for r in results
                                   if abs(r.fun - best.fun) < 1e-3)}


def p95(errors):
    ordered = sorted(errors)
    return ordered[max(0, math.ceil(0.95 * len(ordered)) - 1)]


def evaluate(name, truth, baseline, predicted):
    rows = {}
    for label, values in (("baseline", baseline), ("gp", predicted)):
        errs = [abs(a - b) for a, b in zip(values, truth)]
        stats = {"mean": float(np.mean(errs)), "p95": float(p95(errs)),
                 "max": float(max(errs)), "n": len(errs)}
        stats["gates"] = {f"{k}<={v}": stats[k] <= v for k, v in GATES.items()}
        rows[label] = stats
    print(f"  {name:8s} n={rows['gp']['n']:4d}  "
          f"baseline {rows['baseline']['mean']:.5f}/{rows['baseline']['p95']:.5f}/{rows['baseline']['max']:.5f}  "
          f"gp {rows['gp']['mean']:.5f}/{rows['gp']['p95']:.5f}/{rows['gp']['max']:.5f}  "
          f"gates {'PASS' if all(rows['gp']['gates'].values()) else 'FAIL'}")
    return rows


def check_shipped():
    art = json.loads((HERE.parent.parent / "apps" / "rphcjh" / "data"
                      / "rph-surrogate.json").read_text())["model"]
    Z = np.array(art["train_z"])
    alpha = np.array(art["alpha"])
    ls = np.array(art["lengthscales"])
    sf = art["sigma_f"]
    worst = 0.0
    for case in art["parity_cases"]:
        z = (np.array(case["features"]) - np.array(art["feature_mean"])) \
            / np.array(art["feature_std"])
        delta = float(sf * sf * matern52_cross(z[None, :], Z, ls)[0] @ alpha)
        worst = max(worst, abs(delta - case["predicted_delta"]))
    print(f"shipped-model parity: {len(art['parity_cases'])} cases, "
          f"max |delta - recorded| = {worst:.3e}")
    if worst > 1e-9:
        raise SystemExit("numpy kernel does NOT reproduce the shipped model")
    print("numpy kernel reproduces the shipped conversion model. OK")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check-shipped", action="store_true")
    ap.add_argument("--train", nargs="+", default=[])
    ap.add_argument("--test", nargs="+", default=[])
    ap.add_argument("--output", type=Path, default=None)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--qs-sidecar", type=Path, default=None,
                    help="atlas quasi-steady sidecar; when given, features and "
                         "targets use the deployment baseline instead of the "
                         "recorded Cantera reference")
    args = ap.parse_args()

    if args.check_shipped:
        check_shipped()
        if not args.train:
            return

    sidecar = None
    if args.qs_sidecar:
        sidecar = json.loads(args.qs_sidecar.read_text())["cases"]
        print(f"quasi-steady baseline: atlas sidecar ({len(sidecar)} cases)")
    train = [r for r in load(args.train) if r.get("converged")
             and (sidecar is None or str(r["design_index"]) in sidecar)]
    test = [r for r in load(args.test) if r.get("converged")
            and (sidecar is None or str(r["design_index"]) in sidecar)]
    print(f"train {len(train)} converged cases, test {len(test)}")

    Zr = np.array([features(r, sidecar) for r in train])
    mu, sd = Zr.mean(axis=0), Zr.std(axis=0)
    sd[sd == 0] = 1.0
    Zt = (Zr - mu) / sd
    Ztest = (np.array([features(r, sidecar) for r in test]) - mu) / sd if test else None

    model_out = {"schema": 1, "kind": "wide-box logit-difference GPs, Matern 5/2 ARD",
                 "feature_names": ["logit_x_qs", "log10_period_over_tau", "duty",
                                   "t_peak_c", "t_min_c", "feed_x"],
                 "feature_mean": mu.tolist(), "feature_std": sd.tolist(),
                 "quasi_steady_baseline": ("atlas sidecar" if sidecar is not None
                                           else "recorded Cantera reference"),
                 "train_cases": len(train), "seed": args.seed, "targets": {}}

    for target in ("x_ch4", "x_co2", "y_c2h2", "y_co"):
        keep, deltas = [], []
        for j, r in enumerate(train):
            dyn, qs = quantities(r, sidecar)
            if dyn[target] <= 1e-6 and qs[target] <= 1e-6:
                continue                      # dead zero, matches the shipped rule
            keep.append(j)
            deltas.append(logit(dyn[target]) - logit(qs[target]))
        Ztr, y = Zt[keep], np.array(deltas)
        fitted = fit(Ztr, y, args.seed)
        print(f"{target}: {len(keep)} live, lml {fitted['lml']:.1f}, "
              f"ls {np.round(fitted['lengthscales'], 2).tolist()}, "
              f"sf {fitted['sigma_f']:.3f}, sn {fitted['sigma_n']:.4f}, "
              f"starts agreeing {fitted['starts_agreeing']}/8")

        results = {}
        if test:
            truth, base, pred = [], [], []
            Ktest = fitted["sigma_f"] ** 2 * matern52_cross(Ztest, Ztr,
                                                            fitted["lengthscales"])
            for j, r in enumerate(test):
                dyn, qs = quantities(r, sidecar)
                if dyn[target] <= 1e-6 and qs[target] <= 1e-6:
                    continue
                truth.append(dyn[target])
                base.append(qs[target])
                pred.append(sigmoid(logit(qs[target])
                                    + float(Ktest[j] @ fitted["alpha"])))
            results = evaluate(target, truth, base, pred)

        model_out["targets"][target] = {
            "live_train": len(keep), "train_row_indices": keep,
            "lengthscales": fitted["lengthscales"].tolist(),
            "sigma_f": fitted["sigma_f"], "sigma_n": fitted["sigma_n"],
            "alpha": fitted["alpha"].tolist(),
            "train_z": Zt[keep].tolist(),
            "log_marginal_likelihood": fitted["lml"],
            "validation": results}

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(model_out) + "\n")
        print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
