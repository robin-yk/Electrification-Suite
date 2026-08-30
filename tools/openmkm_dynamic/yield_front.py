"""Optimize the acetylene yield instead of the energy productivity.

kg/kWh has a denominator that is three quarters heat loss, so optimizing it
mostly optimizes the element's radiation. Yield does not have that problem.
It is carbon fed to carbon in the product, an intensive quantity: no mass
flow, no watts, nothing that depends on how the reactor is plumbed or how
well it is insulated. It is also the target the surrogate is best at, since
y_c2h2 is one of the four quantities the GPs were trained on directly
rather than a ratio assembled from them.

This reports the same sweep the productivity work used, ranked by yield,
and asks the same two questions of it: are the best points on the edge of
the search box, and is the landscape multi-modal.

Yields are on total fed carbon, so y_c2h2 + y_co + unreacted carbon and the
minor species sum to one.

  python tools/openmkm_dynamic/yield_front.py --model models/wide-surrogate-atlas-v4.json --cache <cache>
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
from pulse_common import (load_atlas, load_gp, build_rows, load_h_table,
                          corrected_productivities, support_gate, COL)
from map_basins import grid_index, local_maxima, AXES

BOX = {'voltage': (25.0, 55.0), 'period_s': (0.01, 10.0),
       'duty': (0.02, 0.85), 'tau_s': (0.01, 10.0), 'feed_x': (0.40, 0.80)}


def edges(vals):
    out = []
    for k, (lo, hi) in BOX.items():
        v = vals[k]
        if abs(v - lo) <= 1e-6*max(1.0, lo):
            out.append(k + '-lo')
        if abs(v - hi) <= 1e-6*max(1.0, hi):
            out.append(k + '-hi')
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='models/wide-surrogate-atlas-v4.json')
    ap.add_argument('--gate', default=None)
    ap.add_argument('--cache', required=True)
    ap.add_argument('--fidelity', type=float, default=0.1,
                    help='duty_W/pe_W cap; the one-way coupling assumption')
    ap.add_argument('--top', type=int, default=12)
    ap.add_argument('--merge', type=int, default=1)
    ap.add_argument('--out', default=HERE + '/data/wide/yield-front.json')
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
    y1, y2 = CP['y_c2h2'], CP['y_co']
    fid = CP['duty_W']/rows[:, COL['pe_W']]
    ok, sig, thr = support_gate(rows, model, GATE['sigma_threshold'])
    usable = ok & (fid <= a.fidelity) & np.isfinite(y1) & np.isfinite(y2)
    print(f"{len(rows)} candidates, {int(usable.sum())} supported and trusted, "
          f"{time.time()-t0:.0f}s\n")

    idx, levels = grid_index(rows)
    shape = tuple(len(levels[n]) for n in AXES)

    def card(i):
        v = {n: float(rows[i, COL[n]]) for n in AXES}
        return {**v, "t_on_s": v['period_s']*v['duty'],
                "t_peak_c": float(rows[i, COL['t_peak_c']]),
                "t_min_c": float(rows[i, COL['t_min_c']]),
                "y_c2h2": float(y1[i]), "y_co": float(y2[i]),
                "q_c2h2_kg_kwh": float(CP['q1'][i]),
                "mdot_g_h": float(CP['mdot_g_s'][i]*3600.0),
                "element_W": float(rows[i, COL['pe_W']]),
                "process_W": float(CP['duty_W'][i]),
                "posterior_sigma": float(sig[i]),
                "edges": edges(v)}

    def show(title, order):
        print(title)
        h = (f"{'y_C2H2':>7} {'y_CO':>6} {'t_on s':>7} {'duty':>5} {'P s':>6} "
             f"{'tau s':>6} {'V':>4} {'CH4%':>5} {'Tpk':>5} {'g/h':>7} "
             f"{'W':>6} {'kg/kWh':>7}  edges")
        print(h); print('-'*len(h))
        for i in order:
            c = card(i)
            print(f"{100*c['y_c2h2']:>6.2f}% {100*c['y_co']:>5.1f}% "
                  f"{c['t_on_s']:>7.3g} {c['duty']:>5.2f} {c['period_s']:>6.3g} "
                  f"{c['tau_s']:>6.3g} {c['voltage']:>4.0f} "
                  f"{100*c['feed_x']:>5.0f} {c['t_peak_c']:>5.0f} "
                  f"{c['mdot_g_h']:>7.2f} "
                  f"{c['element_W']+c['process_W']:>6.1f} "
                  f"{c['q_c2h2_kg_kwh']:>7.5f}  "
                  f"{','.join(c['edges']) or 'INTERIOR'}")
        print()

    live = np.where(usable)[0]
    best = live[np.argsort(-y1[live])[:a.top]]
    show(f"top {a.top} by acetylene yield", best)

    # is the yield landscape multi-modal? no scalarization needed: one objective
    score = np.where(usable, y1, -np.inf)
    lm = local_maxima(score, idx, shape, usable)
    lm = lm[np.argsort(-y1[lm])]
    basins, taken = [], []
    for i in lm:
        if any((np.abs(idx[i] - idx[j]) <= a.merge).all() for j in taken):
            continue
        taken.append(i)
        basins.append(card(int(i)))
    print(f"{len(lm)} local maxima in yield, {len(basins)} after merging "
          f"within {a.merge} grid step(s)")
    show(f"top {a.top} yield basins", [b for b in taken[:a.top]])

    on_edge = sum(1 for b in basins if b['edges'])
    print(f"{on_edge} of {len(basins)} yield basins touch a box edge")
    json.dump({"model": os.path.basename(model), "gate": GATE,
               "fidelity_cap": a.fidelity, "candidates": int(len(rows)),
               "usable": int(usable.sum()), "local_maxima": int(len(lm)),
               "basins": basins,
               "top_by_yield": [card(int(i)) for i in best]},
              open(a.out, 'w'), indent=1)
    print(f"\nYIELD FRONT -> {a.out}")
