"""Score the pulse-front round trip: did the GP pick the right pulses?

Joins targets-pulsefront.json (the surrogate's predictions, committed
before any Cantera ran) with design-wide-pulsefront-w*.jsonl (the Cantera
truths) and answers, in order:
  1. yield parity: |y_pred - y_true| per case against the campaign gates
  2. q parity: q recomputed from the TRUE outlet composition (density,
     process duty and mass rates all from Cantera's outflow, the same
     truth arm as q_ranking_validation.one_case), relative error per case
  3. ordering: Spearman of predicted vs true q over the verified set
  4. front survival: which verified points remain mutually non-dominated
     when re-evaluated with true q, and the true-q regret of the three
     named picks against the best verified point

Run after the shards, naming the campaign (default the first, pre-closure
one; pulsefront2 is the closure-and-domain-flag campaign):
  python3 tools/openmkm_dynamic/score_pulsefront.py [pulsefront|pulsefront2]
"""
import json, glob
import os
HERE = os.path.dirname(os.path.abspath(__file__))
import sys
sys.path.insert(0, HERE)
import numpy as np
from scipy.stats import spearmanr
from q_ranking_validation import one_case

# Each campaign is graded against the model it was optimized on. pulsefront4
# is the first to use v3, so the model has to travel with the campaign name.
CAMPAIGN_MODEL = {'pulsefront': 'wide-surrogate-atlas.json',
                  'pulsefront2': 'wide-surrogate-atlas.json',
                  'pulsefront3': 'wide-surrogate-atlas.json',
                  'pulsefront4': 'wide-surrogate-atlas-v3.json'}
CAMPAIGN = sys.argv[1] if len(sys.argv) > 1 else 'pulsefront'
if CAMPAIGN not in CAMPAIGN_MODEL:
    raise SystemExit('unknown campaign ' + CAMPAIGN)
os.environ.setdefault('PULSE_MODEL', HERE + '/models/' + CAMPAIGN_MODEL[CAMPAIGN])

T = json.load(open(HERE + f'/data/wide/targets-{CAMPAIGN}.json'))['targets']
pred = {t['design_index']: t for t in T}
runs = [json.loads(l) for f in sorted(glob.glob(
    HERE + f'/data/wide/design-wide-{CAMPAIGN}-w*.jsonl')) for l in open(f)]
runs = {r['design_index']: r for r in runs if r.get('converged')}
print(f"targets {len(pred)}, converged runs {len(runs)}")

rows = []
for di, t in sorted(pred.items()):
    r = runs.get(di)
    if r is None:
        continue
    # input consistency guard: a stale shard must fail loudly
    i = r['inputs']
    for k, tk in (("voltage_V", "voltage"), ("period_s", "period_s"),
                  ("duty", "duty"), ("tau_s", "tau_s")):
        if abs(i[k] - t[tk]) > 1e-9*max(1.0, abs(t[tk])):
            raise SystemExit(f"stale round-trip file: {di} {k} {i[k]} != {t[tk]}")
    c = one_case(r)
    if c is None:
        continue
    p = t['predicted']
    rows.append({
        "design_index": di,
        "y_c2h2_pred": p['y_c2h2'], "y_co_pred": p['y_co'],
        "q1_pred": p['q_c2h2_kg_kwh'], "q2_pred": p['q_co_kg_kwh'],
        "q1_pred_recomputed": c['q1p'], "q2_pred_recomputed": c['q2p'],
        "q1_true": c['q1t'], "q2_true": c['q2t'],
        "y_err_c2h2": None, "y_err_co": None, "dT": c['dT']})
    # true yields from the truth arm live inside one_case's q; recover them
    # directly from the record for the parity line
    from run_cstr_case import MW
    from pulse_common import inlet
    xf = i and float(dict(kv.split(':') for kv in
                          i['feed'].replace(' ', '').split(','))['CH4'])
    xfm = xf/(xf + float(dict(kv.split(':') for kv in
                              i['feed'].replace(' ', '').split(','))['CO2']))
    _, cfed, _ = inlet(xfm)
    wm = r['outputs']['outflow_mass_fractions']
    rows[-1]["y_c2h2_true"] = 2*wm['C2H2']/MW['C2H2']/cfed
    rows[-1]["y_co_true"] = wm['CO']/MW['CO']/cfed
    rows[-1]["y_err_c2h2"] = abs(rows[-1]["y_c2h2_true"] - p['y_c2h2'])
    rows[-1]["y_err_co"] = abs(rows[-1]["y_co_true"] - p['y_co'])

n = len(rows)
if n == 0:
    raise SystemExit("no verified cases")
e1 = np.array([r['y_err_c2h2'] for r in rows])
e2 = np.array([r['y_err_co'] for r in rows])
q1p = np.array([r['q1_pred'] for r in rows]); q1t = np.array([r['q1_true'] for r in rows])
q2p = np.array([r['q2_pred'] for r in rows]); q2t = np.array([r['q2_true'] for r in rows])
rel1 = np.abs(q1p/q1t - 1); rel2 = np.abs(q2p/q2t - 1)

def frontset(a, b):
    keep = []
    for i in range(len(a)):
        if not any((a[j] >= a[i]) & (b[j] >= b[i]) & ((a[j] > a[i]) | (b[j] > b[i]))
                   for j in range(len(a))):
            keep.append(i)
    return set(keep)

pred_front = frontset(q1p, q2p)
true_front = frontset(q1t, q2t)
survive = pred_front & true_front

report = {
    "n_verified": n,
    "yield_parity": {
        "y_c2h2": {"mean": float(e1.mean()), "max": float(e1.max())},
        "y_co": {"mean": float(e2.mean()), "max": float(e2.max())}},
    "q_parity": {
        "q_c2h2": {"median_rel": float(np.median(rel1)), "max_rel": float(rel1.max())},
        "q_co": {"median_rel": float(np.median(rel2)), "max_rel": float(rel2.max())}},
    "ordering": {
        "spearman_q_c2h2": float(spearmanr(q1p, q1t).statistic),
        "spearman_q_co": float(spearmanr(q2p, q2t).statistic)},
    "front_survival": {
        "predicted_front_members": len(pred_front),
        "still_nondominated_in_truth": len(survive),
        "lost": sorted(rows[i]['design_index'] for i in pred_front - survive)},
    "cases": rows,
}
json.dump(report, open(HERE + f'/data/wide/{CAMPAIGN}-roundtrip-report.json', 'w'),
          indent=1)
print(f"yield parity mean/max: C2H2 {e1.mean():.4f}/{e1.max():.4f}, "
      f"CO {e2.mean():.4f}/{e2.max():.4f}")
print(f"q parity median/max rel: q1 {np.median(rel1):.3f}/{rel1.max():.3f}, "
      f"q2 {np.median(rel2):.3f}/{rel2.max():.3f}")
print(f"ordering spearman: q1 {report['ordering']['spearman_q_c2h2']:.3f}, "
      f"q2 {report['ordering']['spearman_q_co']:.3f}")
print(f"front survival: {len(survive)}/{len(pred_front)}")
print(f"SCORE DONE -> data/wide/{CAMPAIGN}-roundtrip-report.json")
