"""Aimed acquisition round 3: the opened low-duty deep-swing habitat.

The pulsefront3 sweep put its whole primary front at duty 0.03 to 0.05,
period 1.9 to 7.2 s, tau 3.4 to 10 s, swing 916 to 1582 K, and the round
trips have shown the frozen model 20 to 35 percent conservative on Y_C2H2
exactly in deep swing. This batch densifies training there, region-targeted
(a box around the habitat with margin, not the front points themselves) so
the sealed sets stay tests and not oracles. Block 8300001.
"""
import sys, json, math, random, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
import run_cstr_design as D
from element_drive import integrate_pulsed_element

rng = random.Random(20260905)
BOX = {"voltage": (26.0, 55.0, "linear"),
       "period_s": (1.5, 10.0, "log"),
       "duty": (0.02, 0.07, "linear"),
       "tau_s": (2.5, 10.0, "log"),
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
    if d["t_peak_c"] - d["t_min_c"] < 600: continue   # the habitat is deep swings
    targets.append({"design_index": 8300000+len(targets)+1,
                    "voltage": pt["voltage"], "period_s": pt["period_s"],
                    "duty": pt["duty"], "tau_s": pt["tau_s"],
                    "feed": f"CH4:{x:.6f}, CO2:{1-x:.6f}"})
out = {"purpose": "aimed acquisition in the low-duty deep-swing habitat the "
                  "pulsefront3 primary front occupies, where the frozen model is "
                  "known conservative on Y_C2H2; region-targeted so sealed sets "
                  "stay tests",
       "seed": 20260905, "drawn": drawn, "kept": len(targets),
       "box": {k: v[:2] for k, v in BOX.items()},
       "extra_filter": "element swing >= 600 K",
       "targets": targets}
p = HERE + '/data/wide/targets-aimed-lowduty.json'
json.dump(out, open(p, 'w'), indent=1)
print(f"DONE kept {len(targets)} of {drawn} draws -> {p}")
