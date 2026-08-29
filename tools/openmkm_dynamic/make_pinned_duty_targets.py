"""Twelve truths pinned at exactly duty 0.02, the floor of the design box.

The trained feature box is the bounding box of the training set, and the
lowest duty any training case happened to carry is 0.0202976. Every duty =
0.02 candidate on the x1 optimizer grid therefore fails the in-domain test by
0.0003 in one feature, and the diagnostic (diagnose_lowduty_gate.py) shows
what that costs: open the gate and 6 duty-0.02 points join the primary front,
with q_C2H2 max 5 percent and q_CO max 9 percent above the gated values, at
peak temperatures of 1467 to 1726 C. Those points are not physically
excluded, they are bookkeeping-excluded.

The aimed batch's own minimum is 0.020250, which would still leave the grid
floor outside. These cases sit exactly on 0.02 so the retrained box reaches
the design box's own floor and the low-duty edge can be judged on its
chemistry. Block 8350001. Region-varied in every other axis so this is
support, not an oracle for particular grid points.
"""
import sys, json, math, random, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
import run_cstr_design as D
from element_drive import integrate_pulsed_element

rng = random.Random(20260906)
DUTY = 0.02
BOX = {"voltage": (30.0, 55.0, "linear"),
       "period_s": (2.0, 10.0, "log"),
       "tau_s": (2.5, 10.0, "log"),
       "feed_x": (0.40, 0.80, "linear")}
targets, drawn = [], 0
while len(targets) < 12:
    drawn += 1
    pt = {}
    for name, (lo, hi, sc) in BOX.items():
        u = rng.random()
        pt[name] = math.exp(math.log(lo)+u*math.log(hi/lo)) if sc == "log" else lo+u*(hi-lo)
    x = pt.pop("feed_x")
    pt["duty"] = DUTY
    if pt["tau_s"]/pt["period_s"] > D.MAX_TAU_OVER_PERIOD: continue
    d = integrate_pulsed_element(voltage=pt["voltage"], period=pt["period_s"], duty=DUTY)
    if not d["converged"] or d["t_peak_c"] > D.PEAK_CAP_C: continue
    targets.append({"design_index": 8350000+len(targets)+1,
                    "voltage": pt["voltage"], "period_s": pt["period_s"],
                    "duty": DUTY, "tau_s": pt["tau_s"],
                    "feed": f"CH4:{x:.6f}, CO2:{1-x:.6f}"})
out = {"purpose": "pin the trained-domain duty floor to the design box's own 0.02 "
                  "so the optimizer's lowest duty row is judged on chemistry rather "
                  "than on the bounding box of whatever the training draw happened "
                  "to contain",
       "seed": 20260906, "drawn": drawn, "kept": len(targets), "duty_pinned": DUTY,
       "box": {k: v[:2] for k, v in BOX.items()},
       "targets": targets}
p = HERE + '/data/wide/targets-pinned-duty.json'
json.dump(out, open(p, 'w'), indent=1)
print(f"DONE kept {len(targets)} of {drawn} draws -> {p}")
