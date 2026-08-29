#!/usr/bin/env python3
"""Bayesian optimization inside each basin, with Cantera in the loop.

map_basins.py says where the distinct regimes are. This refines each one
separately, because the interesting claim about a pulsed reactor is not
"here is the best pulse" but "here are the operating regimes, and here is
the best each can do".

Per basin: a trust region of +/- `radius` grid steps around the basin
centre, clipped to the design box; a few space-filling evaluations; then
batches proposed by expected improvement on a local GP fitted directly to
the TRUE q from Cantera, not to the chemistry surrogate. The global
surrogate chose where to look; inside a basin the ground truth is cheap
enough to optimize against directly, so nothing here inherits the
surrogate's bias.

Each basin keeps the Chebyshev weight that found it, so the scalar being
maximized is that regime's own preference rather than one global trade-off.

Every evaluation is a real converged pulsed-CSTR case and is written to
design-wide-basinbo-w0.jsonl in the 8700001 block, so the points join the
corpus like any other truths.

Run: python tools/openmkm_dynamic/basin_bo.py --basins data/wide/basin-map.json
"""
import argparse
import json
import math
import os
import sys
import time
import warnings
from multiprocessing import Pool

import numpy as np
from scipy.optimize import minimize
from scipy.stats import norm

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

AXES = ('voltage', 'period_s', 'duty', 'tau_s', 'feed_x')
LOG_AXES = {'period_s', 'tau_s'}
BASE_INDEX = 8700001


def to_unit(x, lo, hi):
    z = np.empty_like(x)
    for j, name in enumerate(AXES):
        if name in LOG_AXES:
            z[..., j] = (np.log(x[..., j]) - np.log(lo[j]))/(np.log(hi[j]) - np.log(lo[j]))
        else:
            z[..., j] = (x[..., j] - lo[j])/(hi[j] - lo[j])
    return z


def from_unit(z, lo, hi):
    x = np.empty_like(z)
    for j, name in enumerate(AXES):
        if name in LOG_AXES:
            x[..., j] = np.exp(np.log(lo[j]) + z[..., j]*(np.log(hi[j]) - np.log(lo[j])))
        else:
            x[..., j] = lo[j] + z[..., j]*(hi[j] - lo[j])
    return x


def matern52(A, B, ls):
    r = np.sqrt(5.0*(((A[:, None, :] - B[None, :, :])/ls)**2).sum(-1))
    return (1 + r + r*r/3)*np.exp(-r)


def fit_gp(Z, y):
    """Isotropic Matern 5/2 on few points, lengthscale and scale by marginal
    likelihood. Deliberately simple: a local model on twenty-odd points has
    no business carrying six ARD lengthscales."""
    ym, ys = y.mean(), max(y.std(), 1e-9)
    t = (y - ym)/ys

    def nll(theta):
        ls, sn = math.exp(theta[0]), math.exp(theta[1])
        K = matern52(Z, Z, ls) + (sn*sn + 1e-8)*np.eye(len(Z))
        try:
            L = np.linalg.cholesky(K)
        except np.linalg.LinAlgError:
            return 1e6
        al = np.linalg.solve(L.T, np.linalg.solve(L, t))
        return float(0.5*t @ al + np.log(np.diag(L)).sum())

    best, bestv = None, np.inf
    for l0 in (-1.6, -0.9, -0.2):
        r = minimize(nll, [l0, math.log(0.05)], method='Nelder-Mead',
                     options={'maxiter': 200, 'xatol': 1e-3, 'fatol': 1e-3})
        if r.fun < bestv:
            best, bestv = r.x, r.fun
    ls, sn = math.exp(best[0]), math.exp(best[1])
    K = matern52(Z, Z, ls) + (sn*sn + 1e-8)*np.eye(len(Z))
    L = np.linalg.cholesky(K)
    al = np.linalg.solve(L.T, np.linalg.solve(L, t))

    def post(Zs):
        Ks = matern52(Zs, Z, ls)
        mu = Ks @ al
        v = np.linalg.solve(L, Ks.T)
        var = np.maximum(1.0 - (v*v).sum(0), 1e-12)
        return mu*ys + ym, np.sqrt(var)*ys
    return post


def evaluate(job):
    idx, pt = job
    import cantera as ct
    import run_cstr_design as D
    from q_ranking_validation import one_case
    spec = {"voltage": pt[0], "period_s": pt[1], "duty": pt[2], "tau_s": pt[3],
            "feed": f"CH4:{pt[4]:.6f}, CO2:{1-pt[4]:.6f}"}
    if spec["tau_s"]/spec["period_s"] > D.MAX_TAU_OVER_PERIOD:
        return idx, None, "tau over period cap"
    try:
        r = D.run_design_case(ct, "gri30.yaml", idx, "const-pressure", dict(spec))
    except Exception as exc:                                   # noqa: BLE001
        return idx, None, f"{type(exc).__name__}: {exc}"
    if not r.get("converged"):
        return idx, None, "not converged"
    c = one_case(r)
    if c is None:
        return idx, None, "truth arm rejected"
    r["_q"] = {"q1": c["q1t"], "q2": c["q2t"], "dT": c["dT"]}
    return idx, r, None


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--basins', default=HERE + '/data/wide/basin-map.json')
    ap.add_argument('--top', type=int, default=5)
    ap.add_argument('--radius', type=float, default=2.0, help='grid steps')
    ap.add_argument('--init', type=int, default=6)
    ap.add_argument('--batch', type=int, default=4)
    ap.add_argument('--rounds', type=int, default=4)
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--out', default=HERE + '/data/wide/basin-bo-report.json')
    ap.add_argument('--truths', default=HERE + '/data/wide/design-wide-basinbo-w0.jsonl')
    a = ap.parse_args()

    B = json.load(open(a.basins))
    basins = B['basins'][:a.top]
    # grid steps of the sweep, for sizing trust regions
    STEP = {'voltage': (55.0-25.0)/13, 'period_s': (10.0/0.01)**(1/21),
            'duty': 0.01, 'tau_s': (10.0/0.01)**(1/19), 'feed_x': (0.80-0.40)/8}
    BOX = {'voltage': (25.0, 55.0), 'period_s': (0.01, 10.0), 'duty': (0.02, 0.85),
           'tau_s': (0.01, 10.0), 'feed_x': (0.40, 0.80)}
    rng = np.random.default_rng(20260907)
    next_index = BASE_INDEX
    out_rows, report = [], []

    for bi, b in enumerate(basins):
        w = float(np.mean(b['weights']))
        centre = np.array([b[n] for n in AXES])
        lo, hi = np.empty(5), np.empty(5)
        for j, n in enumerate(AXES):
            if n in LOG_AXES:
                lo[j] = centre[j]/STEP[n]**a.radius
                hi[j] = centre[j]*STEP[n]**a.radius
            else:
                lo[j] = centre[j] - a.radius*STEP[n]
                hi[j] = centre[j] + a.radius*STEP[n]
            lo[j] = max(lo[j], BOX[n][0])
            hi[j] = min(hi[j], BOX[n][1])
        print(f"\nbasin {bi}: centre t_on {b['t_on_s']:.4f} s, duty {b['duty']:.2f}, "
              f"tau {b['tau_s']:.3g} s, weight {w:.2f}", flush=True)

        Zs = np.vstack([np.full((1, 5), 0.5), rng.random((a.init - 1, 5))])
        X = from_unit(Zs, lo, hi)
        seen_Z, seen_q1, seen_q2 = [], [], []
        t0 = time.time()
        for rd in range(a.rounds + 1):
            jobs = []
            for row in X:
                jobs.append((next_index, tuple(row)))
                next_index += 1
            with Pool(a.jobs) as pool:
                res = pool.map(evaluate, jobs)
            for (idx, rec, err), row in zip(res, X):
                if rec is None:
                    continue
                out_rows.append(rec)
                seen_Z.append(to_unit(row, lo, hi))
                seen_q1.append(rec['_q']['q1'])
                seen_q2.append(rec['_q']['q2'])
            if len(seen_Z) < 4:
                print("  too few converged points to model", flush=True)
                break
            Z = np.array(seen_Z)
            q1 = np.array(seen_q1); q2 = np.array(seen_q2)
            n1, n2 = max(q1.max(), 1e-12), max(q2.max(), 1e-12)
            score = np.minimum(q1/n1/max(w, 1e-9), q2/n2/max(1-w, 1e-9))
            best = score.max()
            print(f"  round {rd}: {len(seen_Z)} evaluations, best scalar {best:.4f}, "
                  f"q1 {q1[score.argmax()]:.5f} q2 {q2[score.argmax()]:.5f}, "
                  f"{time.time()-t0:.0f}s", flush=True)
            if rd == a.rounds:
                break
            post = fit_gp(Z, score)
            cand = rng.random((4000, 5))
            mu, sd = post(cand)
            imp = mu - best
            z = imp/np.maximum(sd, 1e-12)
            ei = imp*norm.cdf(z) + sd*norm.pdf(z)
            pick = []
            for _ in range(a.batch):                 # local penalization
                k = int(np.argmax(ei))
                pick.append(cand[k])
                d = np.sqrt(((cand - cand[k])**2).sum(1))
                ei = ei*(1 - np.exp(-(d/0.15)**2))
            X = from_unit(np.array(pick), lo, hi)

        Z = np.array(seen_Z); q1 = np.array(seen_q1); q2 = np.array(seen_q2)
        n1, n2 = max(q1.max(), 1e-12), max(q2.max(), 1e-12)
        score = np.minimum(q1/n1/max(w, 1e-9), q2/n2/max(1-w, 1e-9))
        k = int(score.argmax())
        x = from_unit(Z[k], lo, hi)
        report.append({
            "basin": bi, "weight": w, "evaluations": int(len(Z)),
            "seed_from_surrogate": {n: b[n] for n in AXES},
            "seed_q": {"q_c2h2": b['q_c2h2'], "q_co": b['q_co']},
            "trust_region": {n: [float(lo[j]), float(hi[j])] for j, n in enumerate(AXES)},
            "best": {n: float(x[j]) for j, n in enumerate(AXES)},
            "best_t_on_s": float(x[1]*x[2]),
            "best_q_c2h2_true": float(q1[k]), "best_q_co_true": float(q2[k])})

    with open(a.truths, 'w') as f:
        for r in out_rows:
            r.pop('_q', None)
            f.write(json.dumps(r, separators=(',', ':')) + "\n")
    json.dump({"basins_file": os.path.basename(a.basins), "settings": vars(a),
               "index_block": BASE_INDEX, "results": report},
              open(a.out, 'w'), indent=1)
    print(f"\n{len(out_rows)} Cantera evaluations -> {a.truths}")
    print(f"BASIN BO -> {a.out}")
