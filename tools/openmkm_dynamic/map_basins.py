#!/usr/bin/env python3
"""Find the distinct local optima of the pulse space, not just its best point.

The sweep grid is regular in five controls (V, period, duty, tau, feed), so
"local maximum" has an exact meaning here: a candidate no worse than every
neighbour reachable by one step along any single axis. Scalarizing the two
objectives with a family of weights and collecting the local maxima of each
member exposes the regimes rather than one winner, which is the question
that matters for a pulsed reactor: a short-pulse high-duty operating point
and a long-period deep-swing one are different machines, not two readings
of the same optimum.

Chebyshev scalarization is used because a weighted sum can only ever find
points on the convex part of a front, and the interesting regimes here are
not guaranteed to be convex.

Basins are then merged: two local maxima belong to the same basin when they
are within `--merge` grid steps of each other in every control. Each
surviving basin is reported with the controls that define its regime, on
time t_on = period times duty first, because duty alone does not
distinguish a 0.2 ms pulse from a 0.2 s one.

Run: python tools/openmkm_dynamic/map_basins.py --campaign pulsefront5
"""
import argparse
import json
import math
import os
import pickle
import sys
import time
import warnings

import numpy as np

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pulse_common import (load_atlas, load_gp, build_rows, load_h_table,  # noqa: E402
                          corrected_productivities, support_gate, COL)

AXES = ('voltage', 'period_s', 'duty', 'tau_s', 'feed_x')


def grid_index(rows):
    """Map each row onto integer coordinates of the sweep grid."""
    idx = np.empty((len(rows), len(AXES)), dtype=np.int64)
    levels = {}
    for a, name in enumerate(AXES):
        v = rows[:, COL[name]]
        u = np.unique(np.round(v, 9))
        levels[name] = u
        idx[:, a] = np.searchsorted(u, np.round(v, 9))
    return idx, levels


def local_maxima(score, idx, shape, mask):
    """Rows that beat every one-step neighbour present on the grid."""
    flat = np.ravel_multi_index(idx.T, shape)
    best = np.full(int(np.prod(shape)), -np.inf)
    owner = np.full(int(np.prod(shape)), -1, dtype=np.int64)
    sel = np.where(mask)[0]
    best[flat[sel]] = score[sel]
    owner[flat[sel]] = sel
    strides = np.array([int(np.prod(shape[a+1:])) for a in range(len(shape))])
    keep = np.ones(len(sel), dtype=bool)
    for a in range(len(shape)):
        for step in (-1, 1):
            nb = idx[sel].copy()
            nb[:, a] += step
            valid = (nb[:, a] >= 0) & (nb[:, a] < shape[a])
            nf = flat[sel] + step*strides[a]
            nf = np.where(valid, nf, 0)
            nbest = np.where(valid, best[nf], -np.inf)
            keep &= score[sel] >= nbest
    return sel[keep]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='models/wide-surrogate-atlas-v3.json')
    ap.add_argument('--gate', default=None,
                    help='frozen gate json; default is the model of the same name')
    ap.add_argument('--cache', required=True)
    ap.add_argument('--weights', type=int, default=9)
    ap.add_argument('--merge', type=int, default=1,
                    help='grid steps within which two maxima are one basin')
    ap.add_argument('--out', default=HERE + '/data/wide/basin-map.json')
    a = ap.parse_args()

    model = a.model if os.path.isabs(a.model) else HERE + '/' + a.model
    gate = a.gate or (HERE + '/data/wide/gate-' +
                      os.path.basename(model).replace('.json', '') + '.json')
    GATE = json.load(open(gate))

    HF = json.load(open(HERE + '/data/hf-nist.json'))['hf']
    TAUS = np.exp(np.linspace(math.log(0.01), math.log(10.0), 20))
    FEEDS = np.linspace(0.40, 0.80, 9)
    nodes = pickle.load(open(a.cache, 'rb'))
    t0 = time.time()
    rows = build_rows(nodes, TAUS, FEEDS, load_atlas(HERE + '/data/feed-grid'),
                      HF, load_h_table(HERE + '/data/enthalpy-gri30.json'))
    CP = corrected_productivities(rows, load_gp(model),
                                  load_h_table(HERE + '/data/enthalpy-gri30.json'))
    q1, q2 = CP['q1'], CP['q2']
    fid = CP['duty_W']/rows[:, COL['pe_W']]
    ok, sig, thr = support_gate(rows, model, GATE['sigma_threshold'])
    usable = ok & (fid <= 0.1) & (q1 > 0) & (q2 > 0) & np.isfinite(q1) & np.isfinite(q2)
    print(f"{len(rows)} candidates, {int(usable.sum())} supported and trusted, "
          f"{time.time()-t0:.0f}s")

    idx, levels = grid_index(rows)
    shape = tuple(len(levels[n]) for n in AXES)
    n1, n2 = q1[usable].max(), q2[usable].max()
    found = {}
    for w in np.linspace(0.0, 1.0, a.weights):
        # Chebyshev: maximize the worst weighted normalized objective
        score = np.minimum(q1/n1/max(w, 1e-9), q2/n2/max(1-w, 1e-9))
        for i in local_maxima(score, idx, shape, usable):
            found.setdefault(int(i), []).append(round(float(w), 3))
    print(f"{len(found)} local maxima over {a.weights} scalarizations")

    order = sorted(found, key=lambda i: -len(found[i]))
    basins, taken = [], []
    for i in order:
        if any((np.abs(idx[i] - idx[j]) <= a.merge).all() for j in taken):
            continue
        taken.append(i)
        # A basin's own preference is the weight at which it scores best, not
        # the mean of the weights that found it: averaging the nine weights of
        # a robust basin returns 0.5 for every one of them, which would send
        # every refinement after the same balanced trade-off and erase the
        # regime distinction the map exists to show.
        wb = max(found[i], key=lambda w: min(q1[i]/n1/max(w, 1e-9),
                                             q2[i]/n2/max(1 - w, 1e-9)))
        basins.append({
            "row": int(i), "weights": found[i], "best_weight": float(wb),
            "voltage": float(rows[i, COL['voltage']]),
            "period_s": float(rows[i, COL['period_s']]),
            "duty": float(rows[i, COL['duty']]),
            "t_on_s": float(rows[i, COL['period_s']]*rows[i, COL['duty']]),
            "tau_s": float(rows[i, COL['tau_s']]),
            "feed_x": float(rows[i, COL['feed_x']]),
            "t_peak_c": float(rows[i, COL['t_peak_c']]),
            "dT_K": float(rows[i, COL['t_peak_c']] - rows[i, COL['t_min_c']]),
            "q_c2h2": float(q1[i]), "q_co": float(q2[i]),
            "posterior_sigma": float(sig[i]),
            "waveform_fidelity": float(fid[i])})
    print(f"{len(basins)} distinct basins after merging within {a.merge} grid step(s)\n")
    print(f"{'#':>2} {'t_on':>8} {'P':>7} {'duty':>5} {'tau':>7} {'V':>5} "
          f"{'x':>5} {'Tpk':>6} {'dT':>6} {'q1':>8} {'q2':>8} {'w hits':>7}")
    for k, b in enumerate(basins):
        print(f"{k:>2} {b['t_on_s']:>8.4f} {b['period_s']:>7.3g} {b['duty']:>5.2f} "
              f"{b['tau_s']:>7.3g} {b['voltage']:>5.1f} {b['feed_x']:>5.2f} "
              f"{b['t_peak_c']:>6.0f} {b['dT_K']:>6.0f} {b['q_c2h2']:>8.5f} "
              f"{b['q_co']:>8.5f} {len(b['weights']):>7}")
    json.dump({"model": os.path.basename(model), "gate": GATE,
               # the normalizers the Chebyshev scores were built on; anything
               # that reuses these scores has to reuse these numbers, not a
               # normalizer recomputed from its own sample
               "q_ref": {"q_c2h2": float(n1), "q_co": float(n2)},
               "scalarizations": a.weights, "merge_steps": a.merge,
               "candidates": int(len(rows)), "usable": int(usable.sum()),
               "local_maxima": len(found), "basins": basins},
              open(a.out, 'w'), indent=1)
    print(f"\nBASIN MAP -> {a.out}")
