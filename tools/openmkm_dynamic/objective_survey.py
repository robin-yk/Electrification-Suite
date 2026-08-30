"""Three questions the converged corpus can answer without any surrogate.

The campaign has been optimizing kg/kWh, a ratio whose denominator is three
quarters element radiation. Acetylene yield is the obvious alternative: it
is carbon fed to carbon in the product, so no mass flow and no watts enter
it, and it is one of the four quantities the GPs are trained on directly
rather than a ratio assembled from them. This script asks what the 1959
converged Cantera cases say, with no model in the loop at all.

  1. how high does the acetylene yield go, and at what kind of pulse
  2. does pulsing beat its own quasi-steady reference, which is the only
     controlled form of the question: same temperature trajectory, same
     residence time, same feed, chemistry allowed to keep its memory or not
  3. what the one-way coupling constraint duty_W/pe_W <= 0.1 excludes

Yields are on total fed carbon. The quasi-steady reference is the one each
record already carries, so question 2 costs nothing to ask.

  python tools/openmkm_dynamic/objective_survey.py
"""
import glob
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from run_cstr_case import MW
from pulse_common import inlet
from plain_numbers import plain

# Biogas is CH4 plus CO2 with the CH4 fraction set by the digester, not by
# the experimenter. Anaerobic digestion and landfill gas do not reach the
# 0.80 the design box allows, so the composition ceiling is a constraint to
# tighten rather than an axis to open. The bands here are placeholders until
# the feedstock is cited; --feed-band overrides them.
FEED_BANDS = [('current design box', 0.40, 0.80),
              ('wide biogas', 0.45, 0.75),
              ('typical biogas', 0.50, 0.70),
              ('core biogas', 0.55, 0.65)]

SWING_BINS = [(0, 50), (50, 150), (150, 400), (400, 700), (700, 1000), (1000, 3000)]
FID_BINS = [(0.0, 0.1, 'in use, <= 0.1'), (0.1, 0.5, '0.1 to 0.5'),
            (0.5, 1.0, '0.5 to 1.0'), (1.0, np.inf, 'above 1.0')]


def fx(feed):
    d = dict(kv.split(':') for kv in feed.replace(' ', '').split(','))
    return float(d['CH4'])/(float(d['CH4']) + float(d['CO2']))


def load(patterns, with_power=True):
    out = []
    for pat in patterns:
        for f in sorted(glob.glob(pat)):
            for l in open(f):
                r = json.loads(l)
                if not r.get('converged'):
                    continue
                i, o = r['inputs'], r['outputs']
                x = fx(i['feed'])
                _, cfed, _ = inlet(x)
                d, qs = o['outflow_mass_fractions'], o.get(
                    'quasi_steady_outflow_mass_fractions')
                rec = {"y1": 2*d['C2H2']/MW['C2H2']/cfed,
                       "y2": d['CO']/MW['CO']/cfed,
                       "y1_qs": (2*qs['C2H2']/MW['C2H2']/cfed) if qs else None,
                       "swing": i['t_peak_K'] - i['t_min_K'],
                       "t_peak_c": i['t_peak_K'] - 273.15,
                       "duty": i['duty'], "period_s": i['period_s'],
                       "tau_s": i['tau_s'], "feed_x": x,
                       "voltage_V": i['voltage_V']}
                if with_power:
                    z = plain(r)
                    if z is None:
                        continue
                    g = z['out_g_h']['C2H2']
                    rec.update({"element_W": z['element_W'],
                                "process_W": z['process_W'],
                                "total_W": z['total_W'],
                                "feed_g_h": z['feed_g_h'], "c2h2_g_h": g,
                                "fidelity": z['process_W']/max(z['element_W'], 1e-12),
                                "q1": g/1000.0/(z['total_W']/1000.0)
                                      if g > 0 else 0.0})
                out.append(rec)
    return out


def gain(z):
    return (z['y1']/z['y1_qs']) if z['y1_qs'] and z['y1_qs'] > 1e-6 else None


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--feed-band', nargs=2, type=float, metavar=('LO', 'HI'),
                    default=None,
                    help='restrict every question to this CH4 fraction band')
    ap.add_argument('--top', type=int, default=6)
    a = ap.parse_args()
    R = load([HERE + '/data/wide/design-wide-*.jsonl'])
    ALL = R
    if a.feed_band:
        lo, hi = a.feed_band
        R = [z for z in R if lo - 1e-9 <= z['feed_x'] <= hi + 1e-9]
        print(f"restricted to CH4 fraction {lo} to {hi}\n")
    print(f"{len(R)} converged Cantera cases, no surrogate anywhere\n")
    y1 = np.array([z['y1'] for z in R])
    print(f"acetylene yield on fed carbon: max {100*y1.max():.2f} percent, "
          f"p99 {100*np.percentile(y1, 99):.2f}, median {100*np.median(y1):.2f}\n")

    print("1. yield and pulse gain against the temperature swing")
    print("   gain = dynamic yield / the record's own quasi-steady reference")
    h = (f"{'swing K':>14} {'n':>5} {'best y_C2H2':>12} {'gain p50':>9} "
         f"{'gain p90':>9} {'gain max':>9} {'gain > 1':>9}")
    print(h); print('   ' + '-'*len(h))
    for lo, hi in SWING_BINS:
        m = [z for z in R if lo <= z['swing'] < hi]
        g = np.array([z['y1']/z['y1_qs'] for z in m
                      if z['y1_qs'] and z['y1_qs'] > 1e-6])
        if len(g) < 5:
            continue
        b = 100*max(z['y1'] for z in m)
        print(f"{lo:>6}-{hi:<7} {len(m):>5} {b:>11.2f}% {np.median(g):>9.3f} "
              f"{np.percentile(g, 90):>9.3f} {g.max():>9.2f} "
              f"{100*(g > 1).mean():>8.0f}%")

    print("\n2. the largest pulse gains, in grams and watts")
    cand = [z for z in R if z['y1_qs'] and z['y1_qs'] > 1e-6]
    cand.sort(key=lambda z: -z['y1']/z['y1_qs'])
    h = (f"{'gain':>6} {'y_C2H2':>7} {'y_qs':>6} {'Tpk':>5} {'duty':>5} "
         f"{'P s':>6} {'tau s':>6} {'in g/h':>8} {'C2H2 g/h':>9} {'tot W':>7}")
    print('   ' + h); print('   ' + '-'*len(h))
    for z in cand[:5]:
        print(f"   {z['y1']/z['y1_qs']:>6.1f} {100*z['y1']:>6.2f}% "
              f"{100*z['y1_qs']:>5.2f}% {z['t_peak_c']:>5.0f} {z['duty']:>5.2f} "
              f"{z['period_s']:>6.3g} {z['tau_s']:>6.3g} {z['feed_g_h']:>8.3f} "
              f"{z['c2h2_g_h']:>9.5f} {z['total_W']:>7.2f}")
    z = max(R, key=lambda z: z['y1'])
    print(f"   best absolute yield for contrast: {100*z['y1']:.2f} percent at "
          f"{z['t_peak_c']:.0f} C, duty {z['duty']:.2f}, "
          f"{z['feed_g_h']:.1f} g/h in, {z['c2h2_g_h']:.2f} g/h C2H2, "
          f"{z['total_W']:.0f} W, gain "
          f"{z['y1']/z['y1_qs'] if z['y1_qs'] else float('nan'):.2f}")

    print("\n3. what the one-way coupling constraint excludes")
    h = (f"{'fidelity band':>16} {'n':>5} {'best y_C2H2':>12} "
         f"{'best kg/kWh':>12} {'best g/h':>9}")
    print('   ' + h); print('   ' + '-'*len(h))
    for lo, hi, lab in FID_BINS:
        m = [z for z in R if lo <= z['fidelity'] < hi]
        if not m:
            continue
        print(f"   {lab:>16} {len(m):>5} "
              f"{100*max(z['y1'] for z in m):>11.2f}% "
              f"{max(z['q1'] for z in m):>12.5f} "
              f"{max(z['c2h2_g_h'] for z in m):>9.3f}")
    ins = [z for z in R if z['fidelity'] <= 0.1]
    out = [z for z in R if z['fidelity'] > 0.1]
    print(f"   inside  {len(ins):>4} cases: best kg/kWh "
          f"{max(z['q1'] for z in ins):.5f}, best yield "
          f"{100*max(z['y1'] for z in ins):.2f} percent")
    print(f"   outside {len(out):>4} cases: best kg/kWh "
          f"{max(z['q1'] for z in out):.5f}, best yield "
          f"{100*max(z['y1'] for z in out):.2f} percent")

    print("\n4. what the feedstock composition allows")
    h = (f"{'band':>22} {'n':>5} {'best y_C2H2':>12} {'best gain':>10} "
         f"{'best kg/kWh':>12} {'best g/h':>9}")
    print('   ' + h); print('   ' + '-'*len(h))
    for lab, lo, hi in FEED_BANDS:
        m = [z for z in ALL if lo - 1e-9 <= z['feed_x'] <= hi + 1e-9]
        if not m:
            continue
        g = [v for v in (gain(z) for z in m) if v]
        print(f"   {lab:>22} {len(m):>5} "
              f"{100*max(z['y1'] for z in m):>11.2f}% {max(g):>10.1f} "
              f"{max(z['q1'] for z in m):>12.5f} "
              f"{max(z['c2h2_g_h'] for z in m):>9.3f}")
    print("   the yield ceiling is the feedstock's, not the pulse's: every "
          "step toward real biogas")
    print("   takes it down, because there is less methane carbon fed per "
          "carbon fed at all.")

    # a band run is a subset, so it must not overwrite the full-corpus file
    name = ('objective-survey.json' if not a.feed_band else
            'objective-survey-x%03d-%03d.json' % (round(1000*a.feed_band[0]),
                                                  round(1000*a.feed_band[1])))
    json.dump({"cases": len(R), "feed_band": a.feed_band, "records": R},
              open(HERE + '/data/wide/' + name, 'w'))
    print(f"\n-> data/wide/{name}")
