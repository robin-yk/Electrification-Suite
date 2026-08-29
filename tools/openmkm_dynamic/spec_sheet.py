"""Spec sheet: grams in, watts, grams out, for one operating point.

Everything from models already on disk; no Cantera. The gas chemistry side
uses the recorded transient truth when a design_index is given, so this demo
is exact, not surrogate. Wattage is the CFP element's cycle-average
electrical draw from the same drive that produced T(t). Chemical enthalpy
demand is computed from the composition change with standard heats of
formation, and reported SEPARATELY because the element energy balance does
not include it (the model's coupling is one-way).
"""
import sys, json, glob, math, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
from run_cstr_case import MW, RECORD_SPECIES
from element_drive import integrate_pulsed_element, cfp_resistance, drive_defaults

R_GAS = 8.314462618
# heats of formation live in one shared file so this tool and the figure
# build cannot drift apart on a thermochemical constant
_HF_PATH = __import__('pathlib').Path(__file__).resolve().parent / 'data' / 'hf-nist.json'
HF = json.loads(_HF_PATH.read_text())["hf"]

def feed_x(s):
    p = dict(kv.split(':') for kv in s.replace(' ', '').split(','))
    return float(p['CH4']) / (float(p['CH4']) + float(p['CO2']))

def spec(record, void_cm3):
    i, o = record['inputs'], record['outputs']
    xf = feed_x(i['feed'])
    P_pa = i['pressure_Pa']
    # cycle-average gas density from the recorded T(t), const pressure
    tr = record['trajectory']
    Ts = tr['temperature_K']
    mw_mix_in = xf * MW['CH4'] + (1 - xf) * MW['CO2']       # g/mol, feed
    rho_avg = sum(P_pa * mw_mix_in / (R_GAS * T) for T in Ts) / len(Ts)  # g/m3
    mdot = rho_avg * (void_cm3 * 1e-6) / i['tau_s']          # g/s through the reactor
    w_in = {'CH4': xf * MW['CH4'] / mw_mix_in, 'CO2': (1 - xf) * MW['CO2'] / mw_mix_in}
    w_out = o['outflow_mass_fractions']
    # element electrical draw for this drive
    d = integrate_pulsed_element(voltage=i['voltage_V'], period=i['period_s'],
                                 duty=i['duty'], ambient_c=25.0)
    p = drive_defaults(voltage=i['voltage_V'], period=i['period_s'], duty=i['duty'])
    # samples are (phase_fraction, T_C) tuples over one period; power flows
    # only while the drive is on, i.e. phase < duty
    on = [(ph, tc) for ph, tc in d['samples'] if ph < i['duty']]
    pe = (sum(i['voltage_V'] ** 2 / cfp_resistance(tc, p['element']) for _, tc in on)
          / max(len(d['samples']) - 1, 1))
    # chemical enthalpy demand per gram of throughput
    dh = sum((w_out.get(sp, 0.0) - w_in.get(sp, 0.0)) / MW[sp] * HF[sp] * 1000.0
             for sp in RECORD_SPECIES)                        # J per g of gas
    g_h = lambda w: mdot * w * 3600.0
    out = {
        'in_CH4_g_h': g_h(w_in['CH4']), 'in_CO2_g_h': g_h(w_in['CO2']),
        'out_C2H2_g_h': g_h(w_out['C2H2']), 'out_CO_g_h': g_h(w_out['CO']),
        'out_H2_g_h': g_h(w_out['H2']), 'unreacted_CH4_g_h': g_h(w_out['CH4']),
        'electric_W': pe, 'chemistry_W': dh * mdot,
        'kWh_per_kg_C2H2': pe / max(g_h(w_out['C2H2']), 1e-12) if g_h(w_out['C2H2']) > 1e-9 else None,
        'kWh_per_kg_useful': pe / max(g_h(w_out['C2H2']) + g_h(w_out['CO']), 1e-12),
        'X_CH4': o['ch4_conversion'],
    }
    return out, d

rows = {}
for f in glob.glob(str(__import__('pathlib').Path(__file__).resolve().parent / 'data' / 'wide' / 'design-wide-*.jsonl')):
    for l in open(f):
        r = json.loads(l)
        if r.get('converged'):
            rows[r['design_index']] = r

VOID = 11.03   # cm3, Wismann tube void volume, the paper's cross-checked reactor
score = lambda r: r['outputs']['outflow_mass_fractions']['C2H2'] * r['outputs']['ch4_conversion']
cands = {"max throughput (short tau)": max(rows.values(), key=score),
         "lab regime (tau >= 1 s)": max((r for r in rows.values() if r['inputs']['tau_s'] >= 1.0),
                                        key=score)}
for label, best in cands.items():
  s, d = spec(best, VOID)
  i = best['inputs']
  print(f"== {label}  (design {best['design_index']}), Wismann tube void {VOID} cm3:")
  print(f"  drive: {i['voltage_V']:.1f} V, period {i['period_s']*1000:.0f} ms, duty {i['duty']:.2f}"
      f" -> element {d['t_min_c']:.0f} to {d['t_peak_c']:.0f} C")
  print(f"  feed CH4:CO2 = {feed_x(i['feed'])/(1-feed_x(i['feed'])):.2f}:1, tau {i['tau_s']:.2f} s, 1 atm")
  print(f"  IN   CH4 {s['in_CH4_g_h']:8.2f} g/h    CO2 {s['in_CO2_g_h']:8.2f} g/h")
  print(f"  OUT  C2H2 {s['out_C2H2_g_h']:7.2f} g/h    CO {s['out_CO_g_h']:8.2f} g/h    "
      f"H2 {s['out_H2_g_h']:6.2f} g/h    CH4 unreacted {s['unreacted_CH4_g_h']:7.2f} g/h")
  print(f"  POWER  element draw {s['electric_W']:7.1f} W    reaction endotherm {s['chemistry_W']:6.1f} W")
  print(f"  ENERGY per kg C2H2: {s['electric_W']/max(s['out_C2H2_g_h'],1e-9):.1f} kWh/kg   "
        f"per kg C2H2+CO: {s['electric_W']/max(s['out_C2H2_g_h']+s['out_CO_g_h'],1e-9):.1f} kWh/kg")
  feasible = s['electric_W'] > abs(s['chemistry_W'])
  print(f"  X_CH4 {100*s['X_CH4']:.1f} %   "
        f"self-consistency: element {s['electric_W']:.0f} W vs endotherm {s['chemistry_W']:.0f} W -> "
        f"{'OK, element can carry the chemistry' if feasible else 'VIOLATED: prescribed T(t) is not sustainable at this throughput'}")
  print()
