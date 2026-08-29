"""Global pulse-condition search: energy productivity Pareto, pulses only.

The question this answers: among the searched pulse conditions
(V, period, duty, tau, feed x_CH4), which produce C2H2 and CO most
energy-efficiently on FIXED hardware? Both objectives are maximized:

  q_C2H2 = mdot_C2H2 / P_total   [kg per kWh of electricity]
  q_CO   = mdot_CO   / P_total   [kg per kWh]

with P_total the steady electric draw: the element ODE's cycle-average
loss power V^2/R(T) over the on phase PLUS the process duty, mdot times
the absolute-enthalpy rise from cold feed to the outflow at reaction
temperature (sensible plus reaction, GRI NASA polynomials). The bare
loss-side power alone produced SEC values below the thermodynamic floor
of this chemistry, which is how the omission was caught.
Fixed across every candidate, so this is a comparison of pulse conditions
and nothing else: reactor void volume (11.03 cm3), element geometry and
heat-loss model, pressure (1 atm), and the carbon accounting basis (yields
on total fed carbon). No per-candidate volume rescaling.

Prediction chain per candidate, no Cantera anywhere:
  (V, P, d) -> element ODE T(t) -> steady CJH atlas blend -> frozen GP
  memory correction -> y_C2H2, y_CO -> mass rates -> q_C2H2, q_CO
The steady atlas is the GP's internal baseline, not a comparison arm.

Candidates are never filtered by duty or swing: if a high-duty low-swing
condition wins, it is reported as the optimum of the searched pulse space
in exactly those words. Interpretation rule carried in the report meta.

Three named picks from the front:
  lean_c2h2   the max-q_C2H2 end
  lean_co     the max-q_CO end
  balanced    argmax of J = min(q_C2H2/q_C2H2_max, q_CO/q_CO_max)

The 20 to 30 front picks are written to targets-pulsefront2.json (indices
8100001+; the 8000001 block belongs to the first, pre-closure campaign and
is never reused because its truths are already on disk) for Cantera round-trip verification; matching there is what
licenses the claim that the GP accelerated the global pulse search.

Scope: GRI-Mech 3.0, gas-phase CSTR, the trained box. No C4+/PAH/coke
sink, so high-T C2H2 values are GRI-screened, not confirmed optima.
Element and process power only; PSU, startup and auxiliaries excluded.
One-way coupling: the element ODE does not feel the gas load, so where
the process duty is large against the loss power the prescribed T(t) is
optimistic; waveform_fidelity = duty_W/pe_W is reported per point and
the front is additionally cut at fidelity <= 1 for a conservative view.

Run:  python3 tools/openmkm_dynamic/pulse_optimizer.py <element-cache.pkl>
"""
import sys, json, math, time, pickle, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
import numpy as np
from pulse_common import (load_atlas, load_gp, build_rows,
                          corrected_productivities, pareto_max, load_h_table,
                          training_box, in_domain,
                          COL, VOID_CM3, PRESSURE_PA, MW)

OUTDIR = HERE + '/data/wide'
HF = json.load(open(HERE + '/data/hf-nist.json'))['hf']
TAUS = np.exp(np.linspace(math.log(0.01), math.log(10.0), 20))
FEEDS = np.linspace(0.40, 0.80, 9)
N_VERIFY = 28

# Campaigns own their index block and their duty grid; blocks are never
# reused. pulsefront2 ran on the v1 element cache (duty 0.05 to 0.85) and its
# whole primary front sat on the 0.05 edge, so pulsefront3 runs on the x1
# cache that opens duty down to the 0.02 floor of the transient design box.
CAMPAIGNS = {
    'pulsefront2': {'base_index': 8100001, 'duty_grid': 'v1',
                    'report': 'pulse-optimizer-report.json',
                    'targets': 'targets-pulsefront2.json'},
    'pulsefront3': {'base_index': 8200001, 'duty_grid': 'x1',
                    'report': 'pulse-optimizer-pulsefront3-report.json',
                    'targets': 'targets-pulsefront3.json'},
}

import argparse
ap = argparse.ArgumentParser()
ap.add_argument('--campaign', choices=sorted(CAMPAIGNS), default='pulsefront2')
ap.add_argument('--cache', default=OUTDIR + '/element-cache.pkl',
                help='element node cache pickle; its duty grid must match the campaign')
cli = ap.parse_args()
CAMP = CAMPAIGNS[cli.campaign]
BASE_INDEX = CAMP['base_index']

cache_path = cli.cache
nodes = pickle.load(open(cache_path, 'rb'))
duty_min_cache = min(n['du'] for n in nodes)
want_min = 0.02 if CAMP['duty_grid'] == 'x1' else 0.05
if abs(duty_min_cache - want_min) > 1e-9:
    raise SystemExit(f"cache duty floor {duty_min_cache} does not match "
                     f"campaign {cli.campaign} ({CAMP['duty_grid']} wants {want_min}); "
                     f"rebuild with build_element_cache.py --duty-grid {CAMP['duty_grid']}")
mis = max(abs(n['pe_elec']-n['pe_loss'])/n['pe_elec'] for n in nodes)
print(f"element cache: {len(nodes)} nodes, elec-vs-loss power mismatch max {mis:.4f}")

t0 = time.time()
blended_column = load_atlas(HERE + '/data/feed-grid')
correction = load_gp(HERE + '/models/wide-surrogate-atlas.json')
BOX = training_box(HERE + '/models/wide-surrogate-atlas.json')
H_TABLE = load_h_table(HERE + '/data/enthalpy-gri30.json')
rows = build_rows(nodes, TAUS, FEEDS, blended_column, HF, H_TABLE,
                  progress=lambda ni, nn, nr: print(
                      f"  node {ni}/{nn}, rows {nr}, {time.time()-t0:.0f}s", flush=True))
t_build = time.time()-t0
print(f"candidates: {len(rows)} in {t_build:.0f}s")

t1 = time.time()
CP = corrected_productivities(rows, correction, H_TABLE)
y1, y2, q1, q2 = CP['y_c2h2'], CP['y_co'], CP['q1'], CP['q2']
m1, m2, p_total, duty_W = CP['m1_g_s'], CP['m2_g_s'], CP['p_total_W'], CP['duty_W']
mdot_c = CP['mdot_g_s']
t_pred = time.time()-t1
print(f"GP-corrected yields and productivities in {t_pred:.0f}s")

pe = rows[:, COL['pe_W']]
chem_W = rows[:, COL['dh_J_per_g']]*rows[:, COL['mdot_g_s']]
fidelity = duty_W/pe
dT = rows[:, COL['t_peak_c']] - rows[:, COL['t_min_c']]

dom = in_domain(rows, BOX)
finite = (q1 > 0) & (q2 > 0) & np.isfinite(q1) & np.isfinite(q2)
idx = np.where(finite)[0]
front = pareto_max(q1, q2, idx)
# PRIMARY front: prescribed T(t) trusted only where the process load is a
# small perturbation on the element's own loss power. The element ODE cools
# against the 50 sccm He lab carrier (about 1 W at temperature, under 1% of
# pe, so the He-vs-feed double count is negligible), but it never feels the
# CH4/CO2 stream; at fidelity 1 the waveform would sag badly, so 0.1 is the
# defensible cut until the coupling is two-way.
idx_f = np.where(finite & (fidelity <= 0.1) & dom)[0]
front_f = pareto_max(q1, q2, idx_f)
# named picks come only from in-domain candidates: the round trip refuted
# the extrapolated corner that previously supplied lean_c2h2
idx_d = np.where(finite & dom)[0]
q1max, q2max = q1[idx_d].max(), q2[idx_d].max()
J = np.minimum(q1/q1max, q2/q2max)
i_bal = idx_d[np.argmax(J[idx_d])]
i_c2h2 = idx_d[np.argmax(q1[idx_d])]
i_co = idx_d[np.argmax(q2[idx_d])]
# primary-front picks, normalized inside the trusted set
q1max_f, q2max_f = q1[idx_f].max(), q2[idx_f].max()
Jf = np.minimum(q1/q1max_f, q2/q2max_f)
j_bal = idx_f[np.argmax(Jf[idx_f])]
j_c2h2 = idx_f[np.argmax(q1[idx_f])]
j_co = idx_f[np.argmax(q2[idx_f])]
print(f"front: {len(front)} of {len(idx)} candidates; "
      f"q_C2H2 max {q1max:.4g} kg/kWh, q_CO max {q2max:.4g} kg/kWh, "
      f"balanced J {J[i_bal]:.3f}")

def point(i):
    return {
        "voltage": float(rows[i, COL['voltage']]),
        "period_s": float(rows[i, COL['period_s']]),
        "duty": float(rows[i, COL['duty']]),
        "tau_s": float(rows[i, COL['tau_s']]),
        "feed_x": float(rows[i, COL['feed_x']]),
        "p_over_tau": float(rows[i, COL['period_s']]/rows[i, COL['tau_s']]),
        "t_peak_c": float(rows[i, COL['t_peak_c']]),
        "t_min_c": float(rows[i, COL['t_min_c']]),
        "dT_K": float(dT[i]),
        "pe_W": float(pe[i]), "duty_W": float(duty_W[i]),
        "p_total_W": float(p_total[i]),
        "waveform_fidelity": float(fidelity[i]),
        "mdot_g_s": float(mdot_c[i]),
        "mw_out_est": float(CP['mw_out_est'][i]),
        "y_c2h2": float(y1[i]), "y_co": float(y2[i]),
        "m_c2h2_g_h": float(m1[i]*3600.0), "m_co_g_h": float(m2[i]*3600.0),
        "q_c2h2_kg_kwh": float(q1[i]), "q_co_kg_kwh": float(q2[i]),
        "sec_c2h2_kwh_kg": float(1.0/q1[i]), "sec_co_kwh_kg": float(1.0/q2[i]),
        "chem_W": float(chem_W[i]),
        "in_domain": bool(dom[i]),
        "J_balance": float(J[i]),
    }

# decimated cloud for the figure: uniform random subsample, seeded
rng = np.random.default_rng(20260829)
cloud_n = min(2500, len(idx))
cloud = rng.choice(idx, size=cloud_n, replace=False)
cloud_pts = [{"q1": float(q1[i]), "q2": float(q2[i]),
              "t_peak_c": float(rows[i, COL['t_peak_c']]),
              "dT_K": float(dT[i])} for i in cloud]

report = {
    "meta": {
        "campaign": cli.campaign,
        "duty_grid": {"name": CAMP['duty_grid'],
                      "duty_min": float(duty_min_cache),
                      "duty_max": float(max(n['du'] for n in nodes))},
        "objective": "maximize (q_C2H2, q_CO) = (mdot_C2H2/Pbar, mdot_CO/Pbar) in kg/kWh over pulse conditions (V, period, duty, tau, feed_x)",
        "fixed_basis": {"void_cm3": VOID_CM3, "pressure_pa": PRESSURE_PA,
                        "element": "shared CFP element and lumped-loss model",
                        "yields": "fraction of total fed carbon"},
        "power": "P_total = element loss power E_cycle/period PLUS process duty mdot*(h_out(T)-h_in(298.15K)) from GRI NASA polynomials; PSU, startup and auxiliaries excluded",
        "chain": "(V,P,d) -> element ODE T(t) -> steady CJH atlas blend (internal GP baseline, not a comparison arm) -> frozen GP correction on all four targets -> element-balance closure of the outlet (CH4, CO2, CO, C2H2, H2, H2O) -> throughput, duty and yields on the corrected composition",
        "interpretation_rule": "no candidate was removed for high duty or low swing; if such a condition tops the front, the finding is that the searched pulse space is optimal there, not that continuous heating won",
        "scope": "GRI-Mech 3.0 gas-phase CSTR, trained box; no C4+/PAH/coke sink, so the front is GRI-screened; waveform_fidelity = duty_W/pe marks where the one-way-coupled T(t) is optimistic, and front_fidelity_le_01 is the primary result until the element ODE feels the feed",
        "known_mismatch": "the process duty uses the quasi-steady composition while the yields carry the GP memory correction; the Cantera round-trip recomputes q from true outlet compositions to bound this",
        "element_cache": {"nodes": len(nodes), "max_power_mismatch": float(mis)},
        "timing_s": {"row_build": round(t_build, 1), "gp_predict": round(t_pred, 1)},
        "candidates": int(len(rows)), "usable": int(len(idx)),
        "in_domain": int(dom.sum()),
        "front_out_of_domain": int(sum(1 for i in front if not dom[i])),
        "front_fidelity_le_01": int(len(front_f)),
        "domain_note": "in_domain means every GP feature inside the trained box reconstructed from the frozen model; the round trip refuted exactly the extrapolated front members (8000001, 8000005 at log10(P/tau) past the trained 2.744), so out-of-domain candidates are reported but never picked",
    },
    "front": [point(int(i)) for i in front],
    "front_fidelity_le_01": [point(int(i)) for i in front_f],
    "picks": {"lean_c2h2": point(int(i_c2h2)),
              "lean_co": point(int(i_co)),
              "balanced": point(int(i_bal))},
    "picks_fidelity_le_01": {"lean_c2h2": point(int(j_c2h2)),
                             "lean_co": point(int(j_co)),
                             "balanced": point(int(j_bal))},
    "cloud": cloud_pts,
}

# swing composition of the front, for the write-up
for lab, lo in (("dT_lt_50", -1), ("dT_50_200", 50), ("dT_ge_200", 200)):
    if lo < 0:
        n = int(sum(1 for i in front if dT[i] < 50))
    elif lo == 50:
        n = int(sum(1 for i in front if 50 <= dT[i] < 200))
    else:
        n = int(sum(1 for i in front if dT[i] >= 200))
    report['meta'][f'front_{lab}'] = n

json.dump(report, open(f"{OUTDIR}/{CAMP['report']}", 'w'), indent=1)

# verification targets: spread across the front plus the three picks
sel = list(dict.fromkeys(
    [int(i) for i in front[np.linspace(0, len(front)-1,
                                       min(N_VERIFY-9, len(front))).astype(int)]]
    + [int(i) for i in front_f[np.linspace(0, len(front_f)-1,
                                           min(6, len(front_f))).astype(int)]]
    + [int(i_c2h2), int(i_co), int(i_bal),
       int(j_c2h2), int(j_co), int(j_bal)]))
targets = []
for k, i in enumerate(sel):
    targets.append({
        "design_index": BASE_INDEX + k,
        "voltage": float(rows[i, COL['voltage']]),
        "period_s": float(rows[i, COL['period_s']]),
        "duty": float(rows[i, COL['duty']]),
        "tau_s": float(rows[i, COL['tau_s']]),
        "feed": f"CH4:{rows[i, COL['feed_x']]:.6f}, CO2:{1-rows[i, COL['feed_x']]:.6f}",
        "predicted": {"y_c2h2": float(y1[i]), "y_co": float(y2[i]),
                      "q_c2h2_kg_kwh": float(q1[i]), "q_co_kg_kwh": float(q2[i]),
                      "pe_W": float(pe[i]), "p_total_W": float(p_total[i]),
                      "mdot_g_s": float(mdot_c[i])}})
json.dump({"purpose": "round-trip verification of the pulse energy-productivity front",
           "campaign": cli.campaign, "targets": targets},
          open(f"{OUTDIR}/{CAMP['targets']}", 'w'), indent=1)
print(f"PULSE OPTIMIZER DONE ({cli.campaign}): front {len(front)}, "
      f"verify targets {len(targets)}")
