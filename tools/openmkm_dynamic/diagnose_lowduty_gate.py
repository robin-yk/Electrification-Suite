"""Is the low-duty edge of the pulsefront3 front physics or the domain guard?

The trained feature box has a duty floor of 0.0202975570, drawn from the one
training case that happened to sit lowest. Every duty = 0.02 grid candidate
therefore fails in_domain by 0.0003 in that one feature, so the reported
primary front cannot contain a 0.02 point no matter what its productivity is.
This recomputes the sweep and reports the fidelity <= 0.1 front twice, with
the domain gate and without it, so the difference is visible rather than
assumed. It writes no campaign artifact; it is a diagnostic.
"""
import json, math, pickle, sys, time
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from pulse_common import (load_atlas, load_gp, build_rows, corrected_productivities,
                          pareto_max, load_h_table, training_box, in_domain, COL)

OUT = HERE + '/data/wide'
HF = json.load(open(HERE + '/data/hf-nist.json'))['hf']
TAUS = np.exp(np.linspace(math.log(0.01), math.log(10.0), 20))
FEEDS = np.linspace(0.40, 0.80, 9)
nodes = pickle.load(open(sys.argv[1], 'rb'))
blended_column = load_atlas(HERE + '/data/feed-grid')
correction = load_gp(HERE + '/models/wide-surrogate-atlas.json')
BOX = training_box(HERE + '/models/wide-surrogate-atlas.json')
H_TABLE = load_h_table(HERE + '/data/enthalpy-gri30.json')
t0 = time.time()
rows = build_rows(nodes, TAUS, FEEDS, blended_column, HF, H_TABLE)
CP = corrected_productivities(rows, correction, H_TABLE)
q1, q2 = CP['q1'], CP['q2']
fid = CP['duty_W']/rows[:, COL['pe_W']]
dom = in_domain(rows, BOX)
duty = rows[:, COL['duty']]
finite = (q1 > 0) & (q2 > 0) & np.isfinite(q1) & np.isfinite(q2)
print(f"rows {len(rows)} in {time.time()-t0:.0f}s")

gated = pareto_max(q1, q2, np.where(finite & (fid <= 0.1) & dom)[0])
open_ = pareto_max(q1, q2, np.where(finite & (fid <= 0.1))[0])

def hist(front):
    h = {}
    for i in front:
        h[round(float(duty[i]), 4)] = h.get(round(float(duty[i]), 4), 0) + 1
    return dict(sorted(h.items()))

print("primary front WITH domain gate:   ", len(gated), hist(gated))
print("primary front WITHOUT domain gate:", len(open_), hist(open_))
print(f"gated  q1max {q1[gated].max():.5f} q2max {q2[gated].max():.5f}")
print(f"open   q1max {q1[open_].max():.5f} q2max {q2[open_].max():.5f}")

# which features push duty=0.02 candidates out of the box, and by how much
FEATS = ['logit_xqs', 'log10_P_over_tau', 'duty', 't_peak_c', 't_min_c', 'feed_x']
sel = np.where(finite & (fid <= 0.1) & (duty < 0.025))[0]
print(f"\nduty 0.02 candidates with fidelity <= 0.1: {len(sel)}, in_domain {int(dom[sel].sum())}")
if len(sel):
    best = sel[np.argmax(q1[sel])]
    print(f"  best by q1: duty {duty[best]:.3f} q1 {q1[best]:.5f} q2 {q2[best]:.5f} "
          f"V {rows[best, COL['voltage']]:.1f} P {rows[best, COL['period_s']]:.3g} "
          f"tau {rows[best, COL['tau_s']]:.3g} dT {rows[best, COL['t_peak_c']]-rows[best, COL['t_min_c']]:.0f}")
    on_front = [i for i in open_ if duty[i] < 0.025]
    print(f"  duty 0.02 points on the ungated front: {len(on_front)}")
    for i in on_front[:8]:
        print(f"    q1 {q1[i]:.5f} q2 {q2[i]:.5f} V {rows[i, COL['voltage']]:.1f} "
              f"P {rows[i, COL['period_s']]:.3g} tau {rows[i, COL['tau_s']]:.3g} "
              f"Tpk {rows[i, COL['t_peak_c']]:.0f}")
print("DIAGNOSTIC DONE")
