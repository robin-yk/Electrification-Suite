"""Which frozen constant actually sets the power bill.

plain_numbers.py showed that 75 to 88 percent of the supply's output leaves
as element loss rather than entering the gas. That loss is set by six
numbers in element_drive.py and pulse_common.py that are constants, not
axes:

  ambient_c            25 C      the temperature the element radiates to
  emissivity           0.57      CFP surface
  element area         2*L*W     0.038 x 0.008 m, both faces
  gas_capacity_rate    50 sccm   of a monatomic gas, from the CFP paper
  contact_conductance  0 W/K     no conduction into the supports
  VOID_CM3             11.03     reactor void

None of them is a pulse parameter, so no amount of optimizing the waveform
moves them. This screen asks how much each one is worth, at a fixed
chemistry: for every variant the drive voltage is re-solved so the element
still reaches the SAME peak temperature as the reference case, and the
cycle-average electrical loss is reported at that voltage. Equal peak means
roughly equal chemistry, so the difference in watts is the difference in
what the experiment costs to run.

t_min is reported alongside, because a variant that loses less also cools
less between pulses, and a shallower swing is a different pulse even at
the same peak. Any variant worth adopting has to be re-run through Cantera
before its yields are claimed.

  python tools/openmkm_dynamic/loss_sensitivity.py
"""
import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from element_drive import (integrate_pulsed_element, cfp_resistance,
                           drive_defaults, CFP_ELEMENT, HE_CAPACITY_RATE)

# the best acetylene case in block 8700001, from plain_numbers.py --card
REF = {"voltage": 25.0, "period": 2.717, "duty": 0.230}


def run(**kw):
    p = dict(REF)
    p.update(kw)
    d = integrate_pulsed_element(ambient_c=p.pop("ambient_c", 25.0), **p)
    if not d['converged']:
        return None
    pdrv = drive_defaults(**p)
    n = max(len(d['samples']) - 1, 1)
    pe = sum(p["voltage"]**2/cfp_resistance(tc, pdrv['element'])
             for ph, tc in d['samples'] if ph < p["duty"]) / n
    return {"t_peak_c": d['t_peak_c'], "t_min_c": d['t_min_c'], "element_W": pe,
            "voltage": p["voltage"]}


def at_same_peak(target_c, **kw):
    """Bisect the drive voltage so this variant reaches target_c."""
    lo, hi = 1.0, 400.0
    for _ in range(60):
        mid = 0.5*(lo + hi)
        r = run(voltage=mid, **kw)
        if r is None:
            lo = mid
            continue
        if r['t_peak_c'] < target_c:
            lo = mid
        else:
            hi = mid
    return run(voltage=0.5*(lo + hi), **kw)


if __name__ == '__main__':
    base = run()
    tgt = base['t_peak_c']
    print(f"reference: {REF['voltage']:.0f} V, period {REF['period']} s, "
          f"duty {REF['duty']}, peak {tgt:.0f} C, min {base['t_min_c']:.0f} C, "
          f"element loss {base['element_W']:.1f} W\n")
    print("every variant re-solved to the SAME peak temperature")
    print("swing is what pulsing has to buy; K per W is what it costs\n")
    head = (f"{'variant':32s} {'V':>6} {'min C':>7} {'swing K':>8} {'elem W':>7} "
            f"{'W vs ref':>9} {'K per W':>8}")
    print(head); print('-'*len(head))

    def wide(el, **kw):
        e = copy.deepcopy(CFP_ELEMENT)
        e.update(kw)
        return e

    variants = [("reference", {}),
                ("wall at 400 C", {"ambient_c": 400.0}),
                ("wall at 800 C", {"ambient_c": 800.0}),
                ("wall at 1200 C", {"ambient_c": 1200.0}),
                ("wall at 1400 C", {"ambient_c": 1400.0}),
                ("emissivity 0.30", {"element": wide(None, emissivity=0.30)}),
                ("emissivity 0.15", {"element": wide(None, emissivity=0.15)}),
                ("element half as wide", {"element": wide(None, width=0.004)}),
                ("element twice as wide", {"element": wide(None, width=0.016)}),
                ("no gas sweep", {"gas_capacity_rate": 0.0}),
                ("gas sweep 10x", {"gas_capacity_rate": 10*HE_CAPACITY_RATE}),
                ("supports 1 mW/K", {"contact_conductance": 1e-3}),
                ("wall 1200 C + emissivity 0.30",
                 {"ambient_c": 1200.0, "element": wide(None, emissivity=0.30)})]
    out = []
    for label, kw in variants:
        r = at_same_peak(tgt, **kw)
        if r is None:
            print(f"{label:38s}   did not converge")
            continue
        sw = r['t_peak_c'] - r['t_min_c']
        out.append({"variant": label, "swing_K": sw,
                    "swing_per_W": sw/r['element_W'], **r})
        print(f"{label:32s} {r['voltage']:>6.1f} {r['t_min_c']:>7.0f} "
              f"{sw:>8.0f} {r['element_W']:>7.1f} "
              f"{r['element_W']/base['element_W']:>8.2f}x {sw/r['element_W']:>8.1f}")
    json.dump({"reference": base, "variants": out},
              open(HERE + '/data/wide/loss-sensitivity.json', 'w'), indent=1)
    print("\n-> data/wide/loss-sensitivity.json")
