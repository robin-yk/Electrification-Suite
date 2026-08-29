"""Aimed acquisition: the deep-swing, long-period, tau-comparable-to-period
region where both X max-gate outliers live. Region-targeted, not
point-targeted, so the sealed set stays a test and not an oracle."""
import sys, json, math, random, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
import run_cstr_design as D
from element_drive import integrate_pulsed_element

rng = random.Random(20260830)
BOX = {"voltage": (28.0, 55.0, "linear"),
       "period_s": (1.0, 10.0, "log"),
       "duty": (0.05, 0.45, "linear"),
       "tau_s": (0.8, 10.0, "log"),
       "feed_x": (0.40, 0.80, "linear")}
targets, drawn = [], 0
while len(targets) < 60:
    drawn += 1
    pt = {}
    for name,(lo,hi,sc) in BOX.items():
        u = rng.random()
        pt[name] = math.exp(math.log(lo)+u*math.log(hi/lo)) if sc=="log" else lo+u*(hi-lo)
    x = pt.pop("feed_x")
    if pt["tau_s"]/pt["period_s"] > D.MAX_TAU_OVER_PERIOD: continue
    d = integrate_pulsed_element(voltage=pt["voltage"], period=pt["period_s"], duty=pt["duty"])
    if not d["converged"] or d["t_peak_c"] > D.PEAK_CAP_C: continue
    if d["t_peak_c"] - d["t_min_c"] < 500: continue   # this batch exists for deep swings
    targets.append({"design_index": 4000000+len(targets)+1,
                    "voltage": pt["voltage"], "period_s": pt["period_s"],
                    "duty": pt["duty"], "tau_s": pt["tau_s"],
                    "feed": f"CH4:{x:.6f}, CO2:{1-x:.6f}"})
out = {"purpose": "aimed acquisition at the deep-swing long-period region where the "
                  "965-case model's two max-gate outliers live; region-targeted so the "
                  "sealed validation set is not leaked into training",
       "seed": 20260830, "drawn": drawn, "kept": len(targets),
       "box": {k: v[:2] for k, v in BOX.items()},
       "extra_filter": "element swing >= 500 K",
       "targets": targets}
p = HERE + '/data/wide/targets-aimed-swing.json'
json.dump(out, open(p, 'w'), indent=1)
print(f"DONE kept {len(targets)} of {drawn} draws")
