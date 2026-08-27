#!/usr/bin/env python3
"""Train the RPH correction surrogate, and judge it against pre-stated gates.

What is learned. Not the conversion and not the memory-gain ratio: the model
learns delta = logit(X_dyn) - logit(X_qs), the log-odds correction the real
transient applies to the outflow-weighted quasi-steady baseline. Predictions
reconstruct X = sigmoid(logit(X_qs) + delta), so they cannot leave (0, 1); a
zero-mean prior means the correction dies away from data, which is also the
physically correct long-period limit; and nothing divides by a near-zero
baseline, which is what made the ratio label explode on cold cases.

Inputs per case, standardized: logit(X_qs), log10(period/tau), duty, T_peak,
T_min. Voltage is deliberately absent -- the element ODE already spent it
producing the two temperatures.

Model: Gaussian-process regression, Matern 5/2 kernel, one length-scale per
input, hyperparameters by marginal likelihood. Pure standard library: at
n ~ 250 a Cholesky costs milliseconds-to-seconds and a numpy dependency buys
nothing but a second environment to break. Compared against two controls on
a held-out set chosen by farthest-point coverage, never seen during fitting:

  A  no correction (the quasi-steady baseline as-is)
  B  inverse-distance interpolation of delta (k = 8)
  C  the GP

Gates, stated before the numbers: holdout |X error| mean <= 0.02, p95 <= 0.05,
max <= 0.10; mean error at least 30 % below control A; every prediction in
(0, 1). Failing any gate keeps the model off the page.

Run: python tools/openmkm_dynamic/train_surrogate.py [--holdout 48] [--seed 7]
"""
import argparse
import hashlib
import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANON = HERE / "data" / "canonical"
EPS = 1e-7


def logit(x):
    x = min(max(x, EPS), 1 - EPS)
    return math.log(x / (1 - x))


def sigmoid(v):
    if v >= 0:
        return 1 / (1 + math.exp(-v))
    e = math.exp(v)
    return e / (1 + e)


def load_cases():
    rows, dead = [], 0
    for line in (CANON / "design-physical.jsonl").read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        i, o = r["inputs"], r["outputs"]
        x_dyn, x_qs = o["ch4_conversion"], o["quasi_steady_ch4_conversion"]
        # A case where both the transient and the baseline are effectively zero
        # carries no correction to learn -- the answer is "still zero" -- and
        # its logits sit at the clamp, which is the clamp speaking, not data.
        if x_dyn < 1e-6 and x_qs < 1e-6:
            dead += 1
            continue
        rows.append({
            "index": r["design_index"],
            "features": [logit(x_qs),
                         math.log10(i["period_s"] / i["tau_s"]),
                         i["duty"],
                         i["t_peak_K"] - 273.15,
                         i["t_min_K"] - 273.15],
            "x_dyn": x_dyn, "x_qs": x_qs,
            "target": logit(x_dyn) - logit(x_qs),
            "period_over_tau": i["period_s"] / i["tau_s"],
        })
    return rows, dead


def standardize(train, others=()):
    """Fit feature scaling on training rows, then apply it everywhere."""
    d = len(train[0]["features"])
    mean = [sum(r["features"][j] for r in train) / len(train) for j in range(d)]
    std = [max(1e-12, math.sqrt(sum((r["features"][j] - mean[j]) ** 2 for r in train)
                                / len(train))) for j in range(d)]
    for r in list(train) + list(others):
        r["z"] = [(r["features"][j] - mean[j]) / std[j] for j in range(d)]
    return mean, std


def farthest_point_holdout(rows, count, seed):
    """Coverage, not luck: start from the case nearest the centroid's antipode
    and repeatedly take the case farthest from everything already taken, so the
    holdout spans the extremes of every axis instead of clustering."""
    rng = random.Random(seed)
    chosen = [rng.randrange(len(rows))]
    dist = [min(sum((a - b) ** 2 for a, b in zip(r["z"], rows[chosen[0]]["z"]))
                for _ in [0]) for r in rows]
    while len(chosen) < count:
        far = max(range(len(rows)), key=lambda i: dist[i] if i not in chosen else -1)
        chosen.append(far)
        for i, r in enumerate(rows):
            d2 = sum((a - b) ** 2 for a, b in zip(r["z"], rows[far]["z"]))
            dist[i] = min(dist[i], d2)
    picked = set(chosen)
    return ([r for i, r in enumerate(rows) if i not in picked],
            [r for i, r in enumerate(rows) if i in picked])


def matern52(za, zb, ls):
    r2 = sum(((a - b) / l) ** 2 for a, b, l in zip(za, zb, ls))
    r = math.sqrt(r2) * math.sqrt(5)
    return (1 + r + r * r / 3) * math.exp(-r)


def cholesky(K):
    n = len(K)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = K[i][j] - sum(L[i][k] * L[j][k] for k in range(j))
            L[i][j] = math.sqrt(max(s, 1e-12)) if i == j else s / L[j][j]
    return L

def solve_chol(L, y):
    n = len(L)
    a = [0.0] * n
    for i in range(n):
        a[i] = (y[i] - sum(L[i][k] * a[k] for k in range(i))) / L[i][i]
    b = [0.0] * n
    for i in reversed(range(n)):
        b[i] = (a[i] - sum(L[k][i] * b[k] for k in range(i + 1, n))) / L[i][i]
    return b


class GP:
    def __init__(self, train, ls, sf, sn):
        self.train, self.ls, self.sf, self.sn = train, ls, sf, sn
        n = len(train)
        K = [[sf * sf * matern52(train[i]["z"], train[j]["z"], ls)
              + (sn * sn if i == j else 0.0) for j in range(n)] for i in range(n)]
        self.L = cholesky(K)
        self.alpha = solve_chol(self.L, [r["target"] for r in train])

    def log_marginal(self):
        y = [r["target"] for r in self.train]
        fit = -0.5 * sum(a * b for a, b in zip(self.alpha, y))
        logdet = -sum(math.log(self.L[i][i]) for i in range(len(y)))
        return fit + logdet - 0.5 * len(y) * math.log(2 * math.pi)

    def predict(self, z):
        ks = [self.sf * self.sf * matern52(z, r["z"], self.ls) for r in self.train]
        mean = sum(k * a for k, a in zip(ks, self.alpha))
        v = solve_chol(self.L, ks)
        var = self.sf * self.sf + self.sn * self.sn - sum(k * b for k, b in zip(ks, v))
        return mean, math.sqrt(max(var, 0.0))


def fit_gp(train, seed):
    rng = random.Random(seed)
    d = len(train[0]["z"])
    best = None
    for trial in range(48):
        ls = [math.exp(rng.uniform(math.log(0.3), math.log(5.0))) for _ in range(d)]
        sf = math.exp(rng.uniform(math.log(0.2), math.log(3.0)))
        sn = math.exp(rng.uniform(math.log(0.01), math.log(0.5)))
        gp = GP(train, ls, sf, sn)
        lm = gp.log_marginal()
        if best is None or lm > best[0]:
            best = (lm, ls, sf, sn)
    lm, ls, sf, sn = best
    # coordinate refinement around the winner
    for _ in range(2):
        for which in range(d + 2):
            for factor in (0.7, 1.4):
                ls2, sf2, sn2 = list(ls), sf, sn
                if which < d:
                    ls2[which] *= factor
                elif which == d:
                    sf2 *= factor
                else:
                    sn2 *= factor
                gp = GP(train, ls2, sf2, sn2)
                lm2 = gp.log_marginal()
                if lm2 > lm:
                    lm, ls, sf, sn = lm2, ls2, sf2, sn2
    return GP(train, ls, sf, sn), lm


def idw_predict(train, z, k=8, power=2.0):
    scored = sorted(train, key=lambda r: sum((a - b) ** 2 for a, b in zip(z, r["z"])))
    top = scored[:k]
    num = den = 0.0
    for r in top:
        d2 = sum((a - b) ** 2 for a, b in zip(z, r["z"]))
        if d2 < 1e-18:
            return r["target"]
        w = 1.0 / d2 ** (power / 2)
        num += w * r["target"]
        den += w
    return num / den


def evaluate(name, holdout, delta_of):
    errs = []
    for r in holdout:
        x_hat = sigmoid(logit(r["x_qs"]) + delta_of(r))
        errs.append(abs(x_hat - r["x_dyn"]))
    errs_sorted = sorted(errs)
    n = len(errs)
    return {"model": name,
            "mean": sum(errs) / n,
            "p95": errs_sorted[max(0, math.ceil(0.95 * n) - 1)],
            "max": errs_sorted[-1]}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--holdout", type=int, default=48)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--export", type=Path, default=HERE / "models" / "rph-surrogate.json")
    ap.add_argument("--holdout-from", type=Path, default=None,
                    help="previous model JSON whose sealed holdout_indices must be reused")
    args = ap.parse_args()

    rows, dead = load_cases()
    if args.holdout_from:
        sealed = set(json.loads(args.holdout_from.read_text())["holdout_indices"])
        train = [r for r in rows if r["index"] not in sealed]
        holdout = [r for r in rows if r["index"] in sealed]
        missing = sorted(sealed - {r["index"] for r in holdout})
        if missing:
            raise SystemExit(f"sealed holdout indices missing from canonical data: {missing}")
        if len(holdout) != len(sealed):
            raise SystemExit("sealed holdout indices are not unique in canonical data")
        mean, std = standardize(train, holdout)
    else:
        # Select the first sealed holdout in a common scaling, then refit the
        # scaling on training data alone so holdout information enters no fit.
        standardize(rows)
        train, holdout = farthest_point_holdout(rows, args.holdout, args.seed)
        mean, std = standardize(train, holdout)
    print(f"cases {len(rows)} (dead-zero dropped {dead}) -> train {len(train)}, holdout {len(holdout)}")

    gp, lm = fit_gp(train, args.seed)
    print(f"GP: log-marginal {lm:.1f}, lengthscales "
          + " ".join(f"{l:.2f}" for l in gp.ls) + f", sf {gp.sf:.3f}, sn {gp.sn:.3f}")

    results = [
        evaluate("A CJH as-is", holdout, lambda r: 0.0),
        evaluate("B IDW(k=8)", holdout, lambda r: idw_predict(train, r["z"])),
        evaluate("C GP", holdout, lambda r: gp.predict(r["z"])[0]),
    ]
    print(f"\n{'model':<14}{'mean|dX|':>10}{'p95':>9}{'max':>9}")
    for res in results:
        print(f"{res['model']:<14}{res['mean']:>10.4f}{res['p95']:>9.4f}{res['max']:>9.4f}")

    a, c = results[0], results[2]
    long_period = [r for r in holdout if r["period_over_tau"] >= 30]
    lp_gate = (max(abs(gp.predict(r["z"])[0]) for r in long_period)
               if long_period else float("nan"))
    gates = {
        "mean<=0.02": c["mean"] <= 0.02,
        "p95<=0.05": c["p95"] <= 0.05,
        "max<=0.10": c["max"] <= 0.10,
        ">=30% better than A": c["mean"] <= 0.7 * a["mean"],
        "long-period correction small": (not long_period) or lp_gate < 0.35,
    }
    print(f"\nlong-period holdout cases: {len(long_period)}, worst |delta| {lp_gate:.3f}"
          if long_period else "\nno long-period cases in holdout")
    verdict = all(gates.values())
    for gate, ok in gates.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {gate}")
    print("VERDICT:", "SHIP" if verdict else "DO NOT SHIP")

    args.export.parent.mkdir(parents=True, exist_ok=True)
    data_path = CANON / "design-physical.jsonl"
    feature_min = [min(r["features"][j] for r in rows) for j in range(len(mean))]
    feature_max = [max(r["features"][j] for r in rows) for j in range(len(mean))]
    parity_cases = []
    for r in sorted(holdout, key=lambda row: row["index"])[:8]:
        delta, _ = gp.predict(r["z"])
        parity_cases.append({
            "design_index": r["index"],
            "features": r["features"],
            "x_qs": r["x_qs"],
            "predicted_delta": delta,
            "predicted_conversion": sigmoid(logit(r["x_qs"]) + delta),
        })
    args.export.write_text(json.dumps({
        "kind": "gp-matern52-ard on logit-difference correction",
        "feature_names": ["logit_x_qs", "log10_period_over_tau", "duty", "t_peak_c", "t_min_c"],
        "feature_mean": mean, "feature_std": std,
        "feature_min": feature_min, "feature_max": feature_max,
        "lengthscales": gp.ls, "sigma_f": gp.sf, "sigma_n": gp.sn,
        "train_z": [r["z"] for r in train],
        "alpha": gp.alpha,
        "holdout_report": results, "gates": gates, "verdict": "SHIP" if verdict else "DO NOT SHIP",
        "holdout_indices": sorted(r["index"] for r in holdout),
        "train_indices": sorted(r["index"] for r in train),
        "parity_cases": parity_cases,
        "dead_zero_dropped": dead, "seed": args.seed,
        "canonical_design_sha256": hashlib.sha256(data_path.read_bytes()).hexdigest(),
        "holdout_reused_from": str(args.holdout_from) if args.holdout_from else None,
        "evaluation_role": ("development validation after targeted acquisition; "
                            "independent final test pending" if args.holdout_from else
                            "initial development validation"),
    }, indent=1) + "\n")
    print(f"\nexported {args.export} ({args.export.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
