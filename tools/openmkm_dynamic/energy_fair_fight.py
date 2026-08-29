"""RPH vs matched-CJH energy fair fight in the (SEC_C2H2, SEC_CO) plane.

STATUS: appendix, and currently NOT quotable. Two accounting defects found
by the adversarial audit after this file was written are fixed in
pulse_common.py but not yet here: the SEC denominator omits the process
duty (sensible plus reaction), and mdot uses the feed molecular weight
where Cantera's mass-based tau implies the reacted mixture's. Rewrite this
on pulse_common before using any number it prints.

Three calculations are kept separate and must not be conflated:
  RPH  pulsed transient prediction: element ODE T(t) -> atlas quasi-steady
       blend -> frozen GP memory correction. Only candidates with a real
       temperature swing (dT >= 100 K, robustness cut at 200 K) qualify.
  QS   the quasi-steady blend itself. It is the baseline the GP corrects,
       a chemical-memory instrument. It is NOT a continuous-heating control
       and is never plotted as one here.
  CJH  a real continuous-heating control: constant drive on the same
       element, same feed, same residence time (and a matched-throughput
       variant), at the SAME cycle-average electric power as the RPH
       candidate. At the periodic state the cycle-average electric input
       equals the cycle-average lumped loss (the storage residual is
       bounded by mass*cp*tol/period, orders below pe), so the matched
       steady temperature solves Q_loss(T_c) = pe. Steady chemistry is the
       atlas itself; no GP is involved on this arm.

Specific energy consumption, element power only (PSU, startup and auxiliary
loads excluded by definition):
  pe   = E_cycle / period,  E_cycle = integral of V^2/R(T(t)) over the on
         phase (uniform phase samples from the element integrator)
  SEC_x = pe / mdot_x  in kWh per kg of product x, for x in {C2H2, CO}

Both fronts minimize (SEC_C2H2, SEC_CO). The pulse wins only where its
front sits left and below the continuous front at equal average power.

Caveats stated once and carried in the report: one-way coupling (reaction
enthalpy does not load the element ODE; candidates where the chemical duty
exceeds EPS_POWER of pe are flagged unsustainable), and GRI-Mech 3.0 has no
C4+/PAH/coke sink, so every high-T C2H2 number is a GRI-screened value, not
a confirmed optimum.

Run:  python3 tools/openmkm_dynamic/energy_fair_fight.py <element-cache.pkl>
      (build the cache first with build_element_cache.py)
"""
import sys, json, math, time, pickle, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
import numpy as np
from run_cstr_case import waveform_temperature, MW, RECORD_SPECIES
from element_drive import (profile_function, cfp_resistance,
                           lumped_loss_power, drive_defaults)

OUTDIR = HERE + '/data/wide'
HF = json.load(open(HERE + '/data/hf-nist.json'))['hf']
R_GAS = 8.314462618
VOID_CM3 = 11.03
EPS_POWER = 0.10
EPS = 1e-4
PEAK_CAP_C = 1800.0
MAX_RATIO = 130.0
J_PER_G_TO_KWH_PER_KG = 1.0/3600.0

# ---------- atlas, resampled exactly as in pareto_sweep.py
T_GRID = np.arange(400.0, 1851.0, 2.0)
QTY = ["conv"] + RECORD_SPECIES
SHEET_X = [0.40, 0.50, 0.60, 5/7, 0.80]
LABELS = ["x040", "x050", "x060", "x071", "x080"]
sheets = []
for lab in LABELS:
    cols = {}
    for l in open(f'{HERE}/data/feed-grid/cjh-grid-{lab}.jsonl'):
        r = json.loads(l)
        m = {sp: r['outlet_molefrac'][sp]*MW[sp] for sp in RECORD_SPECIES}
        tot = sum(m.values())
        cols.setdefault(r['tau_s'], []).append(
            (r['T_C'], [r['ch4_conversion']] + [m[sp]/tot for sp in RECORD_SPECIES]))
    taus = sorted(cols)
    arr = np.empty((len(taus), len(QTY), len(T_GRID)))
    for j, t in enumerate(taus):
        pts = sorted(cols[t])
        Ts = np.array([p[0] for p in pts])
        V = np.array([p[1] for p in pts])
        for q in range(len(QTY)):
            arr[j, q] = np.interp(T_GRID, Ts, V[:, q])
    sheets.append((np.array(taus), arr))
LOGTAU = np.log(sheets[0][0])
TAU_MIN, TAU_MAX = float(sheets[0][0][0]), float(sheets[0][0][-1])

def blended_column(x_feed, tau):
    x_feed = min(max(x_feed, SHEET_X[0]), SHEET_X[-1])
    si = min(max(np.searchsorted(SHEET_X, x_feed) - 1, 0), len(SHEET_X)-2)
    fs = (x_feed - SHEET_X[si]) / (SHEET_X[si+1] - SHEET_X[si])
    lt = math.log(min(max(tau, TAU_MIN), TAU_MAX))
    tj = min(max(np.searchsorted(LOGTAU, lt) - 1, 0), len(LOGTAU)-2)
    ft = (lt - LOGTAU[tj]) / (LOGTAU[tj+1] - LOGTAU[tj])
    def sheet_col(s):
        a = sheets[s][1]
        return a[tj]*(1-ft) + a[tj+1]*ft
    return sheet_col(si)*(1-fs) + sheet_col(si+1)*fs

# ---------- frozen model
M = json.load(open(HERE + '/models/wide-surrogate-atlas.json'))
mu, sd = np.array(M['feature_mean']), np.array(M['feature_std'])
def prep(tgt):
    tm = M['targets'][tgt]
    return (np.array(tm['train_z']), np.array(tm['alpha']),
            np.array(tm['lengthscales']), tm['sigma_f'])
GP = {t: prep(t) for t in ("y_c2h2", "y_co")}
def gp_mean_batch(tgt, Zb):
    Zt, al, ls, sf = GP[tgt]
    d2 = ((Zb[:, None, :] - Zt[None, :, :]) / ls) ** 2
    r = np.sqrt(5.0 * d2.sum(-1))
    return (sf*sf*(1+r+r*r/3)*np.exp(-r)) @ al
lgt = lambda v: math.log(min(1-EPS, max(EPS, v)) / (1 - min(1-EPS, max(EPS, v))))
sig = lambda v: 1.0/(1.0+np.exp(-v))

# ---------- helpers shared by both arms
PDRV = drive_defaults()
def loss_at(t_c):
    return lumped_loss_power(t_c, PDRV)
def steady_T_for_power(pw):
    """Continuous element temperature at electric power pw: Q_loss(T)=pw."""
    lo, hi = 25.0, 2500.0
    for _ in range(80):
        mid = 0.5*(lo+hi)
        if loss_at(mid) < pw:
            lo = mid
        else:
            hi = mid
    return 0.5*(lo+hi)
def inlet(xf):
    mw_in = xf*MW['CH4'] + (1-xf)*MW['CO2']
    wci = xf*MW['CH4']/mw_in
    cfed = wci/MW['CH4'] + (1-wci)/MW['CO2']   # mol C per g of feed gas
    w_in = {'CH4': xf*MW['CH4']/mw_in, 'CO2': (1-xf)*MW['CO2']/mw_in}
    return mw_in, cfed, w_in
def chem_from_blend(blend, xf):
    wm = dict(zip(RECORD_SPECIES, blend[1:]))
    _, cfed, w_in = inlet(xf)
    y1 = 2*wm['C2H2']/MW['C2H2']/cfed
    y2 = wm['CO']/MW['CO']/cfed
    dh = sum((wm.get(sp,0.0)-w_in.get(sp,0.0))/MW[sp]*HF[sp]*1000.0
             for sp in RECORD_SPECIES)          # J per g of gas processed
    return blend[0], y1, y2, dh
def secs(pe, mdot, cfed, y1, y2):
    m1 = y1*cfed*mdot*MW['C2H2']/2.0            # g C2H2 per s
    m2 = y2*cfed*mdot*MW['CO']                  # g CO per s
    s1 = pe/m1*J_PER_G_TO_KWH_PER_KG if m1 > 0 else float('inf')
    s2 = pe/m2*J_PER_G_TO_KWH_PER_KG if m2 > 0 else float('inf')
    return s1, s2, m1, m2

# ---------- element cache
cache_path = sys.argv[1] if len(sys.argv) > 1 else HERE + '/data/wide/element-cache.pkl'
nodes = pickle.load(open(cache_path, 'rb'))
mis = max(abs(n['pe_elec']-n['pe_loss'])/n['pe_elec'] for n in nodes)
print(f"element cache: {len(nodes)} nodes, elec-vs-loss power mismatch max {mis:.4f}")

# ---------- RPH candidates (same grid as pareto_sweep.py)
TAUS = np.exp(np.linspace(math.log(0.01), math.log(10.0), 20))
FEEDS = np.linspace(0.40, 0.80, 9)
N_PHASE = 200
rows = []
t0 = time.time()
for ni, nd in enumerate(nodes):
    v, P, du, d, pe = nd['v'], nd['P'], nd['du'], nd['d'], nd['pe_elec']
    p = {"t_min_K": d['t_min_c']+273.15, "t_peak_K": d['t_peak_c']+273.15,
         "period_s": P, "duty": du, "waveform": "physical",
         "ramp_up_fraction": 0.05, "ramp_down_fraction": 0.05,
         "_profile": profile_function(d)}
    Tph = np.array([waveform_temperature((k+0.5)/N_PHASE, p) for k in range(N_PHASE)])
    w = 1.0/Tph
    TphC = Tph - 273.15
    for tau in TAUS:
        if tau/P > MAX_RATIO:
            continue
        for xf in FEEDS:
            col = blended_column(xf, tau)
            samp = np.empty((len(QTY), N_PHASE))
            for q in range(len(QTY)):
                samp[q] = np.interp(TphC, T_GRID, col[q])
            blend = (samp * w).sum(axis=1) / w.sum()
            x_qs, y1q, y2q, dh = chem_from_blend(blend, xf)
            mw_in, cfed, _ = inlet(xf)
            rho = float(np.mean(101325.0*mw_in/(R_GAS*Tph)))
            mdot = rho*VOID_CM3*1e-6/tau
            rows.append((v, P, du, tau, xf, d['t_peak_c'], d['t_min_c'],
                         x_qs, y1q, y2q, pe, dh, mdot, cfed, rho))
    if ni % 300 == 0:
        print(f"  node {ni}/{len(nodes)}, rows {len(rows)}, {time.time()-t0:.0f}s", flush=True)
rows = np.array(rows)
print(f"candidates: {len(rows)} in {time.time()-t0:.0f}s")

# GP memory corrections on the RPH arm only
Z = np.stack([np.array([lgt(x) for x in rows[:, 7]]),
              np.log10(rows[:, 1]/rows[:, 3]), rows[:, 2],
              rows[:, 5], rows[:, 6], rows[:, 4]], axis=1)
Zs = (Z - mu) / sd
pred = {}
for tgt, base_col in (("y_c2h2", 8), ("y_co", 9)):
    out = np.empty(len(rows))
    for a in range(0, len(rows), 20000):
        b = min(a+20000, len(rows))
        out[a:b] = gp_mean_batch(tgt, Zs[a:b])
    base = np.clip(rows[:, base_col], EPS, 1-EPS)
    pred[tgt] = sig(np.log(base/(1-base)) + out)
y1, y2 = pred['y_c2h2'], pred['y_co']

pe_a, dh_a, mdot_a, cfed_a = rows[:,10], rows[:,11], rows[:,12], rows[:,13]
dT = rows[:,5] - rows[:,6]
m1 = y1*cfed_a*mdot_a*MW['C2H2']/2.0
m2 = y2*cfed_a*mdot_a*MW['CO']
with np.errstate(divide='ignore'):
    sec1 = np.where(m1>0, pe_a/np.maximum(m1,1e-30)*J_PER_G_TO_KWH_PER_KG, np.inf)
    sec2 = np.where(m2>0, pe_a/np.maximum(m2,1e-30)*J_PER_G_TO_KWH_PER_KG, np.inf)
chem_W = dh_a*mdot_a
sustainable = chem_W <= EPS_POWER*pe_a

def pareto_min(s1, s2, idx):
    """Indices of the (min s1, min s2) front within idx."""
    order = idx[np.argsort(s1[idx], kind='stable')]
    front, best = [], np.inf
    for i in order:
        if s2[i] < best:
            front.append(i); best = s2[i]
    return np.array(front)

# ---------- matched CJH control per RPH point (computed lazily on fronts
# and on a subsample for the sanity check; the mapping depends only on the
# element node and (tau, feed), all deterministic)
def matched_cjh(i):
    v, P, du, tau, xf = rows[i,0], rows[i,1], rows[i,2], rows[i,3], rows[i,4]
    pe = pe_a[i]
    t_c = steady_T_for_power(pe)
    v_c = math.sqrt(pe*cfp_resistance(t_c, PDRV['element']))
    mw_in, cfed, _ = inlet(xf)
    rho_c = 101325.0*mw_in/(R_GAS*(t_c+273.15))
    out = {"T_c": t_c, "V_c": v_c, "pe_W": float(pe)}
    for name, tau_c in (("same_tau", tau),
                        ("same_mdot", tau*rho_c/rows[i,14])):
        tau_used = min(max(tau_c, TAU_MIN), TAU_MAX)
        col = blended_column(xf, tau_used)
        blend = np.array([np.interp(t_c, T_GRID, col[q]) for q in range(len(QTY))])
        x_c, y1c, y2c, dhc = chem_from_blend(blend, xf)
        mdot_c = rho_c*VOID_CM3*1e-6/tau_used
        s1c, s2c, _, _ = secs(pe, mdot_c, cfed, y1c, y2c)
        out[name] = {"tau_s": float(tau_used), "tau_clamped": bool(tau_used != tau_c),
                     "x": float(x_c), "y_c2h2": float(y1c), "y_co": float(y2c),
                     "mdot_g_s": float(mdot_c),
                     "sec_c2h2": float(s1c), "sec_co": float(s2c),
                     "sustainable": bool(dhc*mdot_c <= EPS_POWER*pe)}
    return out

def row_out(i):
    mc = matched_cjh(i)
    a, b = mc['same_tau'], mc['same_mdot']
    return {
        "voltage": float(rows[i,0]), "period_s": float(rows[i,1]),
        "duty": float(rows[i,2]), "tau_s": float(rows[i,3]),
        "feed_x": float(rows[i,4]), "p_over_tau": float(rows[i,1]/rows[i,3]),
        "t_peak_c": float(rows[i,5]), "t_min_c": float(rows[i,6]),
        "dT_K": float(dT[i]), "pe_W": float(pe_a[i]),
        "mdot_g_s": float(mdot_a[i]), "chem_W": float(chem_W[i]),
        "sustainable": bool(sustainable[i]),
        "y_c2h2": float(y1[i]), "y_co": float(y2[i]),
        "sec_c2h2": float(sec1[i]), "sec_co": float(sec2[i]),
        "matched_cjh": mc,
        "gain_same_tau": {"sec_c2h2": float(a['sec_c2h2']-sec1[i]),
                          "sec_co": float(a['sec_co']-sec2[i])},
        "gain_same_mdot": {"sec_c2h2": float(b['sec_c2h2']-sec1[i]),
                           "sec_co": float(b['sec_co']-sec2[i])},
    }

finite = np.isfinite(sec1) & np.isfinite(sec2)
report = {"meta": {
    "definitions": {
        "pe_W": "cycle-average electric power, E_cycle/period, V^2/R(T) over the on phase; element only, PSU and auxiliaries excluded",
        "sec": "SEC_x = pe / mdot_x in kWh per kg of product x",
        "rph": "element ODE T(t) -> atlas quasi-steady blend -> frozen GP memory correction",
        "qs": "quasi-steady blend, the GP baseline; a chemical-memory instrument, NOT a continuous-heating control",
        "cjh": "constant drive on the same element and heat-loss model at equal cycle-average electric power, Q_loss(T_c)=pe; chemistry from the steady atlas",
        "matching": "same feed and same tau (same_tau) plus a same feed-mass-flow variant (same_mdot); same pressure, element geometry and loss model by construction",
        "scope": "GRI-Mech 3.0 gas-phase CSTR; no C4+/PAH/coke sink, so the frontier is GRI-screened, not a confirmed optimum; one-way coupling flagged via sustainable"},
    "element_cache": {"nodes": len(nodes), "max_power_mismatch": float(mis)},
    "candidates": int(len(rows)), "finite_sec": int(finite.sum()),
    "sustainable_count": int((finite & sustainable).sum())}}

for cut in (100.0, 200.0):
    idx = np.where(finite & (dT >= cut))[0]
    fr = pareto_min(sec1, sec2, idx)
    report[f"rph_front_dT{int(cut)}"] = {
        "n_candidates": int(len(idx)), "n_front": int(len(fr)),
        "points": [row_out(i) for i in fr]}
    print(f"RPH front dT>={cut:.0f}K: {len(fr)} of {len(idx)}", flush=True)

# ---------- standalone continuous front on the same hardware
cjh_rows = []
for v in np.linspace(25.0, 55.0, 61):
    lo, hi = 25.0, 2500.0
    for _ in range(80):
        mid = 0.5*(lo+hi)
        if v*v/cfp_resistance(mid, PDRV['element']) > loss_at(mid):
            lo = mid
        else:
            hi = mid
    t_ss = 0.5*(lo+hi)
    if t_ss > PEAK_CAP_C:
        continue
    pw = loss_at(t_ss)
    for tau in TAUS:
        for xf in FEEDS:
            mw_in, cfed, _ = inlet(xf)
            rho = 101325.0*mw_in/(R_GAS*(t_ss+273.15))
            mdot = rho*VOID_CM3*1e-6/tau
            col = blended_column(xf, tau)
            blend = np.array([np.interp(t_ss, T_GRID, col[q]) for q in range(len(QTY))])
            x_c, y1c, y2c, dhc = chem_from_blend(blend, xf)
            s1c, s2c, _, _ = secs(pw, mdot, cfed, y1c, y2c)
            cjh_rows.append((v, t_ss, pw, tau, xf, y1c, y2c, s1c, s2c,
                             1.0 if dhc*mdot <= EPS_POWER*pw else 0.0))
cjh_rows = np.array(cjh_rows)
cf = np.isfinite(cjh_rows[:,7]) & np.isfinite(cjh_rows[:,8])
cidx = np.where(cf)[0]
cfront = pareto_min(cjh_rows[:,7], cjh_rows[:,8], cidx)
report["cjh_front"] = {
    "n_candidates": int(cf.sum()), "n_front": int(len(cfront)),
    "points": [{"voltage": float(cjh_rows[i,0]), "T_ss_c": float(cjh_rows[i,1]),
                "pe_W": float(cjh_rows[i,2]), "tau_s": float(cjh_rows[i,3]),
                "feed_x": float(cjh_rows[i,4]), "y_c2h2": float(cjh_rows[i,5]),
                "y_co": float(cjh_rows[i,6]), "sec_c2h2": float(cjh_rows[i,7]),
                "sec_co": float(cjh_rows[i,8]),
                "sustainable": bool(cjh_rows[i,9] > 0.5)} for i in cfront]}
print(f"CJH front: {len(cfront)} of {int(cf.sum())}")

# ---------- sanity: near-zero-swing pulses must land on their matched control
sane = np.where(finite & (dT < 50.0) & (rows[:,5] > 500.0))[0]
if len(sane) > 400:
    sane = sane[np.linspace(0, len(sane)-1, 400).astype(int)]
gaps = []
for i in sane:
    mc = matched_cjh(i)
    s = mc['same_tau']
    if np.isfinite(s['sec_c2h2']) and sec1[i] > 0:
        gaps.append(abs(s['sec_c2h2']-sec1[i])/sec1[i])
report["sanity_low_swing"] = {
    "n": len(gaps), "median_rel_gap_sec_c2h2": float(np.median(gaps)) if gaps else None,
    "p90_rel_gap_sec_c2h2": float(np.percentile(gaps, 90)) if gaps else None}
print(f"low-swing sanity: median rel gap {report['sanity_low_swing']['median_rel_gap_sec_c2h2']}")

# ---------- verdict
for cut in (100, 200):
    pts = report[f"rph_front_dT{cut}"]["points"]
    wins_tau = sum(1 for p in pts if p['gain_same_tau']['sec_c2h2'] > 0
                   and p['gain_same_tau']['sec_co'] > 0)
    wins_md = sum(1 for p in pts if p['gain_same_mdot']['sec_c2h2'] > 0
                  and p['gain_same_mdot']['sec_co'] > 0)
    report[f"verdict_dT{cut}"] = {
        "n_front": len(pts),
        "rph_dominates_matched_same_tau": wins_tau,
        "rph_dominates_matched_same_mdot": wins_md}
    print(f"dT>={cut}: front {len(pts)}, beats matched control on BOTH SECs: "
          f"same_tau {wins_tau}, same_mdot {wins_md}")

json.dump(report, open(f'{OUTDIR}/rph-vs-cjh-energy-report.json', 'w'), indent=1)
print("FAIR FIGHT DONE ->", f'{OUTDIR}/rph-vs-cjh-energy-report.json')
