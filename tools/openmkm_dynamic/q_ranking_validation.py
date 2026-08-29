"""Does the surrogate rank pulses correctly on ENERGY PRODUCTIVITY?

pulse_ranking_validation.py certified the yield ordering. The optimizer's
objective is q = mdot_product/P_total in kg/kWh, whose prediction stacks
three more model layers on the yields: the element loss power, the
throughput from the reacted-mixture density, and the process duty from the
quasi-steady composition. This scores the q ordering on the three
held-out sets. Provenance matters and is carried in the report: the
'validation' set gated every development iteration and steered aimed round
one, and the 'final' set triggered aimed round two, so both are
development-consulted; only 'final3' is a sealed set in the strict sense.
Quote sealed evidence from final3 alone; the pooled table is a secondary
all-campaigns view.

Two arms per case, identical element waveform (the ODE is shared):
  predicted  the deployment path exactly as pulse_optimizer computes it:
             atlas blend composition for duty and density, GP-corrected
             yields for the mass rates
  true       yields and composition from the recorded Cantera outflow;
             enthalpy and density evaluated with the same 1/T cycle
             weighting so the comparison isolates model error, not
             convention differences. The truth-side duty pairs the
             cycle-average composition with the cycle-average enthalpy
             (the phase correlation term is unrecorded; stated caveat).

Metrics per objective (q_c2h2, q_co): Spearman, Kendall, top-5/10 overlap,
regret@1 and regret@5 in kg/kWh, plus the median relative q error.

Run:  python3 tools/openmkm_dynamic/q_ranking_validation.py
"""
import json, glob, math, time
import os
HERE = os.path.dirname(os.path.abspath(__file__))
import sys
sys.path.insert(0, HERE)
import warnings
warnings.filterwarnings("ignore")
import numpy as np
from multiprocessing import Pool
from scipy.stats import spearmanr, kendalltau
from element_drive import (integrate_pulsed_element, cfp_resistance,
                           drive_defaults, profile_function)
from run_cstr_case import waveform_temperature, MW, RECORD_SPECIES
from pulse_common import (load_atlas, load_gp, load_h_table, inlet,
                          chem_from_blend, balance_closure, CLOSURE_SPECIES,
                          QTY, T_GRID, R_GAS, VOID_CM3,
                          PRESSURE_PA, T_IN_K, EPS, lgt, sig)

HF = json.load(open(HERE + '/data/hf-nist.json'))['hf']
N_PHASE = 200
blended_column = load_atlas(HERE + '/data/feed-grid')
# The model under test. A campaign that froze a different artifact selects it
# with PULSE_MODEL rather than editing this line, so a scorer can never quietly
# grade one campaign's targets against another campaign's model.
MODEL_PATH = os.environ.get('PULSE_MODEL',
                            HERE + '/models/wide-surrogate-atlas.json')
correction = load_gp(MODEL_PATH)
hT, hsp = load_h_table(HERE + '/data/enthalpy-gri30.json')

SETS = {"validation": "design-wide-validation-w*.jsonl",
        "final": "design-wide-final-w*.jsonl",
        "final3": "design-wide-final3-w*.jsonl"}
PROVENANCE = {"validation": "development-consulted (gated iterations, steered aimed round 1)",
              "final": "development-consulted (triggered aimed round 2)",
              "final3": "sealed (never consulted before the model froze)"}

def fx(s):
    p = dict(kv.split(':') for kv in s.replace(' ', '').split(','))
    return float(p['CH4'])/(float(p['CH4'])+float(p['CO2']))

def one_case(r):
    """Both q arms for one sealed record; None if the element diverges."""
    i = r['inputs']
    v, P, du, tau = i['voltage_V'], i['period_s'], i['duty'], i['tau_s']
    xf = fx(i['feed'])
    try:
        d = integrate_pulsed_element(voltage=v, period=P, duty=du, ambient_c=25.0)
    except Exception:
        return None
    if not d['converged']:
        return None
    pdrv = drive_defaults(voltage=v, period=P, duty=du)
    n = max(len(d['samples']) - 1, 1)
    pe = sum(v*v/cfp_resistance(tc, pdrv['element'])
             for ph, tc in d['samples'] if ph < du) / n
    p = {"t_min_K": d['t_min_c']+273.15, "t_peak_K": d['t_peak_c']+273.15,
         "period_s": P, "duty": du, "waveform": "physical",
         "ramp_up_fraction": 0.05, "ramp_down_fraction": 0.05,
         "_profile": profile_function(d)}
    Tph = np.array([waveform_temperature((k+0.5)/N_PHASE, p)
                    for k in range(N_PHASE)])
    w = 1.0/Tph
    TphC = Tph - 273.15
    h_at = {sp: np.interp(Tph, hT, hsp[sp]) for sp in RECORD_SPECIES}
    havg = {sp: float((h_at[sp]*w).sum()/w.sum()) for sp in RECORD_SPECIES}
    mw_in, cfed, w_in = inlet(xf)
    h_in = sum(w_in[sp]*float(np.interp(T_IN_K, hT, hsp[sp]))
               for sp in ('CH4', 'CO2'))

    # predicted arm: deployment path with the element-balance closure
    col = blended_column(xf, tau)
    samp = np.empty((len(QTY), N_PHASE))
    for q in range(len(QTY)):
        samp[q] = np.interp(TphC, T_GRID, col[q])
    blend = (samp * w).sum(axis=1) / w.sum()
    x_qs, y1q, y2q, _, x2q = chem_from_blend(blend, xf, HF)
    Z = np.array([[lgt(x_qs), math.log10(P/tau), du,
                   d['t_peak_c'], d['t_min_c'], xf]])
    def corr(tgt, base):
        return 1.0/(1.0 + math.exp(-(lgt(base) + float(correction(tgt, Z)[0]))))
    y1p = corr('y_c2h2', y1q)
    y2p = corr('y_co', y2q)
    x1p = corr('x_ch4', x_qs)
    x2p = corr('x_co2', x2q)
    n = balance_closure(np.array([xf]), np.array([x1p]), np.array([x2p]),
                        np.array([y1p]), np.array([y2p]))[:, 0]
    mws = np.array([MW[sp] for sp in CLOSURE_SPECIES])
    mass = n*mws
    mw_mix = mass.sum()/max(n.sum(), 1e-12)
    w_out_p = mass/max(mass.sum(), 1e-30)
    rho_p = PRESSURE_PA*mw_mix/R_GAS*float(np.mean(1.0/Tph))
    mdot_p = rho_p*VOID_CM3*1e-6/tau
    duty_p = float(sum(w_out_p[k]*havg[sp]
                       for k, sp in enumerate(CLOSURE_SPECIES))) - h_in
    pt_p = pe + duty_p*mdot_p
    q1p = y1p*cfed*mdot_p*MW['C2H2']/2.0/pt_p*3600.0
    q2p = y2p*cfed*mdot_p*MW['CO']/pt_p*3600.0

    # true arm: recorded Cantera outflow composition and yields
    wm = r['outputs']['outflow_mass_fractions']
    y1t = 2*wm['C2H2']/MW['C2H2']/cfed
    y2t = wm['CO']/MW['CO']/cfed
    mw_t = 1.0/sum(wm[sp]/MW[sp] for sp in RECORD_SPECIES)
    rho_t = float(np.mean(PRESSURE_PA*mw_t/(R_GAS*Tph)))
    mdot_t = rho_t*VOID_CM3*1e-6/tau
    duty_t = sum(wm[sp]*havg[sp] for sp in RECORD_SPECIES) - h_in
    pt_t = pe + duty_t*mdot_t
    q1t = y1t*cfed*mdot_t*MW['C2H2']/2.0/pt_t*3600.0
    q2t = y2t*cfed*mdot_t*MW['CO']/pt_t*3600.0
    return {"dT": i['t_peak_K']-i['t_min_K'], "pe": pe,
            "q1p": q1p, "q2p": q2p, "q1t": q1t, "q2t": q2t,
            "duty_p": duty_p*mdot_p, "duty_t": duty_t*mdot_t}

def score(sub, key):
    pv = np.array([c[key+'p'] for c in sub])
    tv = np.array([c[key+'t'] for c in sub])
    ok = (pv > 0) & (tv > 0) & np.isfinite(pv) & np.isfinite(tv)
    pv, tv = pv[ok], tv[ok]
    n = len(pv)
    if n < 10:
        return {"n": n, "note": "too few"}
    po, to = np.argsort(-pv), np.argsort(-tv)
    rel = np.abs(pv/tv - 1.0)
    out = {"n": n,
           "spearman": float(spearmanr(pv, tv).statistic),
           "kendall": float(kendalltau(pv, tv).statistic),
           "median_rel_q_err": float(np.median(rel)),
           "p90_rel_q_err": float(np.percentile(rel, 90)),
           "true_best_kg_kwh": float(tv[to[0]]),
           "regret_at_1": float(tv[to[0]] - tv[po[0]]),
           "regret_at_5": float(tv[to[0]] - tv[po[:5]].max())}
    for k in (5, 10):
        out[f"top{k}_overlap"] = int(len(set(po[:k]) & set(to[:k])))
    return out

if __name__ == '__main__':
    t0 = time.time()
    report = {"convention": "truth-side duty pairs cycle-average composition "
              "with 1/T-weighted cycle-average enthalpy; the phase correlation "
              "term is unrecorded in the campaign files",
              "provenance": PROVENANCE}
    pooled = []
    per_set = {}
    for name, pat in SETS.items():
        rows = [json.loads(l) for f in sorted(glob.glob(HERE+'/data/wide/'+pat))
                for l in open(f)]
        rows = [r for r in rows if r.get('converged')]
        with Pool(3) as pool:
            recs = [c for c in pool.map(one_case, rows) if c]
        pooled += recs
        per_set[name] = recs
        print(f"{name}: {len(recs)} cases, {time.time()-t0:.0f}s", flush=True)
    def classed(recs):
        out = {}
        for cls, lo in (("all", 0.0), ("dT100", 100.0), ("dT200", 200.0)):
            sub = [c for c in recs if c['dT'] >= lo]
            out[cls] = {"q_c2h2": score(sub, 'q1'), "q_co": score(sub, 'q2')}
        return out
    for name, recs in per_set.items():
        report[name] = classed(recs)
    report_sets = classed(pooled)
    report["pooled"] = report_sets
    print("--- sealed evidence (final3 only) ---")
    for cls in ("all", "dT100"):
        for obj in ("q_c2h2", "q_co"):
            s = report["final3"][cls][obj]
            if 'spearman' in s:
                print(f"final3 {cls:6s} {obj:7s} n={s['n']:4d} spearman {s['spearman']:.3f} "
                      f"top10 {s['top10_overlap']}/10 regret@1 {s['regret_at_1']:.4f} "
                      f"regret@5 {s['regret_at_5']:.4f} medrel {s['median_rel_q_err']:.3f}")
    print("--- pooled, all campaigns (secondary) ---")
    for cls in ("all", "dT100", "dT200"):
        for obj in ("q_c2h2", "q_co"):
            s = report_sets[cls][obj]
            print(f"pooled {cls:6s} {obj:7s} n={s['n']:4d} "
                  f"spearman {s['spearman']:.3f} kendall {s['kendall']:.3f} "
                  f"top5 {s['top5_overlap']}/5 top10 {s['top10_overlap']}/10 "
                  f"regret@1 {s['regret_at_1']:.4f} regret@5 {s['regret_at_5']:.4f} "
                  f"kg/kWh (true best {s['true_best_kg_kwh']:.4f}) "
                  f"medrel {s['median_rel_q_err']:.3f}")
    json.dump(report, open(HERE+'/data/wide/q-ranking-report.json', 'w'), indent=1)
    print("Q RANKING DONE -> data/wide/q-ranking-report.json")
