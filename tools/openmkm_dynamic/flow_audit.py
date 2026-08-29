"""What the tau axis actually asks the hardware to do, in g/h.

run_cstr_case.py sets both mass flow controllers to reactor.mass / tau and
updates them every substep, so the residence time is the control and the
mass flow is whatever the gas density makes it. Under the const-pressure
closure the density falls as 1/T, so the feed rate falls in step with the
temperature inside every cycle. A mass flow controller does the opposite:
it holds g/h and lets tau be the outcome.

This script does not change that. It measures it, so the size of the
mismatch is a number rather than an argument:

  * the within-cycle swing in mass flow the current closure implies,
    which is exactly T_peak/T_min in kelvin
  * the cycle-average feed rate in g/h and in sccm at 0 C, per case
  * what the tau box corresponds to in g/h across the corpus
  * a mass balance on every record: total in against total out, and the
    C, H and O atom balances through the recorded outflow

  python tools/openmkm_dynamic/flow_audit.py 'data/wide/design-wide-*.jsonl'
"""
import argparse
import glob
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from run_cstr_case import MW, RECORD_SPECIES
from pulse_common import PRESSURE_PA, R_GAS, VOID_CM3, T_IN_K

# atoms per molecule, for the element balance
ATOMS = {'CH4': {'C': 1, 'H': 4}, 'CO2': {'C': 1, 'O': 2},
         'CO': {'C': 1, 'O': 1}, 'C2H2': {'C': 2, 'H': 2},
         'H2': {'H': 2}, 'H2O': {'H': 2, 'O': 1},
         'C2H4': {'C': 2, 'H': 4}, 'C2H6': {'C': 2, 'H': 6}}
STD_T = 273.15                      # sccm is per minute at 0 C, 1 atm
MOLAR_VOLUME_CM3 = R_GAS*STD_T/PRESSURE_PA*1e6


def fx(feed):
    d = dict(kv.split(':') for kv in feed.replace(' ', '').split(','))
    return float(d['CH4'])/(float(d['CH4']) + float(d['CO2']))


def one(r):
    i = r['inputs']
    tau, tpk, tmn = i['tau_s'], i['t_peak_K'], i['t_min_K']
    x = fx(i['feed'])
    mw_in = x*MW['CH4'] + (1 - x)*MW['CO2']
    wm = r['outputs']['outflow_mass_fractions']
    mw_out = 1.0/sum(wm[sp]/MW[sp] for sp in RECORD_SPECIES if sp in MW)

    # cycle-average density under the const-pressure closure, using the same
    # 1/T weighting the truth arm uses for everything else
    inv_t = 0.5*(1.0/tpk + 1.0/tmn)
    rho_hot = PRESSURE_PA*mw_out*1e-3/R_GAS*inv_t            # kg/m3
    mdot = rho_hot*VOID_CM3*1e-6/tau*1000.0                  # g/s
    sccm = mdot/mw_in*MOLAR_VOLUME_CM3*60.0

    # element balance on the recorded outflow against the fed composition
    n_in = {'C': x + (1 - x), 'H': 4*x, 'O': 2*(1 - x)}      # per mole fed
    scale = 1.0/(x*MW['CH4'] + (1 - x)*MW['CO2'])            # moles fed per gram
    n_out = {'C': 0.0, 'H': 0.0, 'O': 0.0}
    for sp, w in wm.items():
        if sp not in ATOMS or sp not in MW:
            continue
        for el, k in ATOMS[sp].items():
            n_out[el] += w/MW[sp]*k
    err = {el: abs(n_out[el] - n_in[el]*scale)/max(n_in[el]*scale, 1e-30)
           for el in ('C', 'H', 'O')}
    return {"tau_s": tau, "mdot_g_h": mdot*3600.0, "sccm": sccm,
            "flow_swing": tpk/tmn, "mass_frac_sum": sum(wm.values()),
            "err_C": err['C'], "err_H": err['H'], "err_O": err['O']}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('patterns', nargs='+')
    ap.add_argument('--out', default=HERE + '/data/wide/flow-audit.json')
    a = ap.parse_args()

    files = sorted(f for p in a.patterns for f in glob.glob(p))
    rows = []
    for f in files:
        for l in open(f):
            r = json.loads(l)
            if r.get('converged'):
                rows.append(one(r))
    n = len(rows)
    arr = {k: np.array([z[k] for z in rows]) for k in rows[0]}
    print(f"{n} converged records from {len(files)} files\n")

    def band(k, unit, fmt='.3g'):
        v = arr[k]
        print(f"  {k:14s} min {v.min():{fmt}} p50 {np.median(v):{fmt}} "
              f"p95 {np.percentile(v, 95):{fmt}} max {v.max():{fmt}}  {unit}")

    print("what the tau axis asks for")
    band('tau_s', 's')
    band('mdot_g_h', 'g/h')
    band('sccm', 'sccm at 0 C, 1 atm')
    print("\nwithin-cycle mass flow swing the const-pressure closure implies")
    band('flow_swing', 'x (T_peak/T_min in K); a real MFC holds this at 1.0')
    over = int((arr['flow_swing'] > 2.0).sum())
    print(f"  {over} of {n} cases ({100*over/n:.0f} percent) swing the feed "
          f"rate by more than 2x inside one cycle")

    print("\nmass and element balance on the recorded outflow")
    band('mass_frac_sum', '(should be 1)', '.6f')
    for el in ('C', 'H', 'O'):
        v = arr['err_'+el]
        print(f"  {el} atom balance   p50 {np.median(v):.2e} "
              f"p95 {np.percentile(v, 95):.2e} max {v.max():.2e}  relative")

    json.dump({"records": n, "files": len(files),
               "summary": {k: {"min": float(v.min()),
                               "p50": float(np.median(v)),
                               "p95": float(np.percentile(v, 95)),
                               "max": float(v.max())}
                           for k, v in arr.items()}},
              open(a.out, 'w'), indent=1)
    print(f"\nFLOW AUDIT -> {a.out}")
