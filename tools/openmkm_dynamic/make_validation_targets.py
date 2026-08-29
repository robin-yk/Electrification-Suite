import sys, json, math, random, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
import run_cstr_design as D
from element_drive import integrate_pulsed_element

rng = random.Random(20260829)
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
    targets.append({"design_index": 3000000+len(targets)+1,
                    "voltage": pt["voltage"], "period_s": pt["period_s"],
                    "duty": pt["duty"], "tau_s": pt["tau_s"],
                    "feed": f"CH4:{x:.6f}, CO2:{1-x:.6f}"})
out = {"purpose": "independent validation of the wide-box surrogate: 200 seeded-random "
                  "feasible points, drawn separately from the Halton training walk",
       "seed": 20260829, "drawn": drawn, "kept": len(targets),
       "box": {k: v[:2] for k,v in AX.items()},
       "feasibility": {"max_tau_over_period": D.MAX_TAU_OVER_PERIOD,
                       "peak_cap_c": D.PEAK_CAP_C},
       "targets": targets}
p = HERE + '/data/wide/targets-validation-200.json'
json.dump(out, open(p,'w'), indent=1)
print(f"DONE kept 200 of {drawn} draws -> {p}")
