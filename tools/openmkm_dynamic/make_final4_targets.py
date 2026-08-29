"""Fourth sealed test set, for the duty-expanded optimizer campaign.

Same distribution as the earlier sealed draws: seeded-random feasible points
over AXES_WIDE, which has always spanned duty 0.02 to 0.85. A fresh block and
a fresh seed because final3 has already been consulted once (the v2 q-ranking
gate); this set stays untouched until the retrained model is frozen, is scored
exactly once, and is never trained on.
"""
import sys, json, math, random, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
import run_cstr_design as D
from element_drive import integrate_pulsed_element

rng = random.Random(20260904)
AX = D.AXES_WIDE
targets, drawn = [], 0
while len(targets) < 200:
    drawn += 1
    pt = {}
    for name,(lo,hi,sc) in AX.items():
        u = rng.random()
        pt[name] = math.exp(math.log(lo)+u*math.log(hi/lo)) if sc=="log" else lo+u*(hi-lo)
    x = pt.pop("feed_x")
    if pt["tau_s"]/pt["period_s"] > D.MAX_TAU_OVER_PERIOD: continue
    d = integrate_pulsed_element(voltage=pt["voltage"], period=pt["period_s"], duty=pt["duty"])
    if not d["converged"] or d["t_peak_c"] > D.PEAK_CAP_C: continue
    targets.append({"design_index": 8400000+len(targets)+1,
                    "voltage": pt["voltage"], "period_s": pt["period_s"],
                    "duty": pt["duty"], "tau_s": pt["tau_s"],
                    "feed": f"CH4:{x:.6f}, CO2:{1-x:.6f}"})
out = {"purpose": "fourth sealed test set: scored once against the model retrained "
                  "after the duty-expanded acquisition round, never trained on, "
                  "never consulted during development",
       "seed": 20260904, "drawn": drawn, "kept": len(targets),
       "box": {k: v[:2] for k,v in AX.items()},
       "feasibility": {"max_tau_over_period": D.MAX_TAU_OVER_PERIOD,
                       "peak_cap_c": D.PEAK_CAP_C},
       "targets": targets}
p = HERE + '/data/wide/targets-final4-200.json'
json.dump(out, open(p,'w'), indent=1)
print(f"DONE kept 200 of {drawn} draws -> {p}")
