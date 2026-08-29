"""Every campaign number in grams per hour and watts.

kg/kWh is a ratio, and a ratio hides both of the things a person actually
has to buy: how much gas goes through the reactor and how much power the
supply has to deliver. This script takes converged Cantera records and
prints, per case, what goes in, what comes out and what it costs, with no
normalization anywhere.

Everything here is arithmetic on the record's own outputs plus the same
element drive the truth arm uses, so it introduces no new physics and no
new fit. mdot comes from the outflow density over the residence time, the
element loss is the cycle-average V^2/R over the on phase, and the process
heat is the enthalpy the stream picks up between the 298.15 K inlet and
the 1/T-weighted cycle-average outlet.

  python tools/openmkm_dynamic/plain_numbers.py data/wide/design-wide-basinbo-w0.jsonl
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from run_cstr_case import MW, RECORD_SPECIES, waveform_temperature
from element_drive import (integrate_pulsed_element, cfp_resistance,
                           drive_defaults, profile_function)
from pulse_common import (inlet, load_h_table, PRESSURE_PA, R_GAS, VOID_CM3,
                          T_IN_K)

# the same cycle sampling the truth arm in q_ranking_validation.py uses, so
# the enthalpy average and the density here are not a second convention
N_PHASE = 200

hT, hsp = load_h_table(HERE + '/data/enthalpy-gri30.json')


def fx(feed):
    d = dict(kv.split(':') for kv in feed.replace(' ', '').split(','))
    ch4, co2 = float(d['CH4']), float(d['CO2'])
    return ch4/(ch4 + co2)


def plain(r):
    """Grams per hour and watts for one converged record, or None."""
    i = r['inputs']
    v, P, du, tau = i['voltage_V'], i['period_s'], i['duty'], i['tau_s']
    xf = fx(i['feed'])
    d = integrate_pulsed_element(voltage=v, period=P, duty=du, ambient_c=25.0)
    if not d['converged']:
        return None
    pdrv = drive_defaults(voltage=v, period=P, duty=du)
    n = max(len(d['samples']) - 1, 1)
    # element ohmic loss, averaged over the whole cycle: the supply only
    # drives during the on phase but the bill is per second of operation
    pe = sum(v*v/cfp_resistance(tc, pdrv['element'])
             for ph, tc in d['samples'] if ph < du) / n
    p = {"t_min_K": d['t_min_c']+273.15, "t_peak_K": d['t_peak_c']+273.15,
         "period_s": P, "duty": du, "waveform": "physical",
         "ramp_up_fraction": 0.05, "ramp_down_fraction": 0.05,
         "_profile": profile_function(d)}
    Tph = np.array([waveform_temperature((k+0.5)/N_PHASE, p)
                    for k in range(N_PHASE)])
    w = 1.0/Tph
    havg = {sp: float((np.interp(Tph, hT, hsp[sp])*w).sum()/w.sum())
            for sp in RECORD_SPECIES}
    _, cfed, w_in = inlet(xf)
    h_in = sum(w_in[sp]*float(np.interp(T_IN_K, hT, hsp[sp]))
               for sp in ('CH4', 'CO2'))

    wm = r['outputs']['outflow_mass_fractions']
    mw_t = 1.0/sum(wm[sp]/MW[sp] for sp in RECORD_SPECIES)
    rho = float(np.mean(PRESSURE_PA*mw_t/(R_GAS*Tph)))     # g/cm3-consistent
    mdot = rho*VOID_CM3*1e-6/tau                           # g/s, in = out
    duty_W = (sum(wm[sp]*havg[sp] for sp in RECORD_SPECIES) - h_in)*mdot
    gph = 3600.0*mdot
    out = {sp: gph*wm[sp] for sp in RECORD_SPECIES}
    return {
        "voltage_V": v, "period_s": P, "duty": du, "tau_s": tau,
        "t_on_s": P*du, "feed_x": xf,
        "t_peak_c": d['t_peak_c'], "t_min_c": d['t_min_c'],
        "feed_g_h": gph, "out_g_h": out,
        "element_W": pe, "process_W": duty_W, "total_W": pe + duty_W,
        "kwh_per_kg_c2h2": (pe + duty_W)/1000.0/(out['C2H2']/1000.0)
                           if out['C2H2'] > 0 else float('inf'),
        "kwh_per_kg_co": (pe + duty_W)/1000.0/(out['CO']/1000.0)
                         if out['CO'] > 0 else float('inf')}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--sort', default='C2H2', help='species to rank by, or "CO"')
    ap.add_argument('--top', type=int, default=12)
    ap.add_argument('--json', default=None)
    a = ap.parse_args()

    recs = [json.loads(l) for f in a.files for l in open(f)]
    rows = [x for x in (plain(r) for r in recs if r.get('converged')) if x]
    rows.sort(key=lambda z: -z['out_g_h'][a.sort])
    print(f"{len(rows)} converged cases, ranked by {a.sort} out\n")
    head = (f"{'V':>4} {'P s':>7} {'duty':>5} {'t_on s':>7} {'tau s':>6} "
            f"{'CH4%':>5} {'Tpk C':>6} | {'in g/h':>8} {'CH4':>7} {'CO2':>7} "
            f"{'C2H2':>7} {'CO':>7} {'H2':>6} | {'elem W':>7} {'proc W':>7} "
            f"{'tot W':>7} | {'kWh/kg':>7}")
    print(head)
    print('-'*len(head))
    for z in rows[:a.top]:
        o = z['out_g_h']
        key = z['kwh_per_kg_c2h2'] if a.sort == 'C2H2' else z['kwh_per_kg_co']
        print(f"{z['voltage_V']:>4.0f} {z['period_s']:>7.3g} {z['duty']:>5.3f} "
              f"{z['t_on_s']:>7.3g} {z['tau_s']:>6.3g} {100*z['feed_x']:>5.0f} "
              f"{z['t_peak_c']:>6.0f} | {z['feed_g_h']:>8.2f} {o['CH4']:>7.3f} "
              f"{o['CO2']:>7.3f} {o['C2H2']:>7.4f} {o['CO']:>7.3f} "
              f"{o['H2']:>6.4f} | {z['element_W']:>7.1f} {z['process_W']:>7.2f} "
              f"{z['total_W']:>7.1f} | {key:>7.0f}")
    if a.json:
        json.dump(rows, open(a.json, 'w'), indent=1)
        print(f"\n-> {a.json}")
