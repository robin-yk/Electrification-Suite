"""Global Pareto sweep over (V, P, duty, tau, feed) for (Y_C2H2, Y_CO).

Pipeline per candidate: element ODE -> T(t) -> atlas quasi-steady blend ->
frozen GP corrections -> predicted yields. No Cantera anywhere. The frontier
candidates are then re-verified BY Cantera in a separate round-trip step.
Claims are bounded: this is the optimum within GRI-Mech 3.0 gas-phase
chemistry, the CSTR closure, and the trained box.
"""
import sys, json, math, time, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
import numpy as np
from run_cstr_case import waveform_temperature, MW, RECORD_SPECIES
from element_drive import integrate_pulsed_element, profile_function, cfp_resistance, drive_defaults

OUTDIR = HERE + '/data/wide'
HF = json.load(open(HERE + '/data/hf-nist.json'))['hf']
R_GAS = 8.314462618
VOID_CM3 = 11.03
EPS_POWER = 0.10   # chemistry may load the element by at most this fraction
EPS = 1e-4
PEAK_CAP_C = 1800.0
MAX_RATIO = 130.0

# ---------- atlas, resampled to a uniform T grid per (sheet, tau column)
T_GRID = np.arange(400.0, 1851.0, 2.0)
QTY = ["conv"] + RECORD_SPECIES
SHEET_X = [0.40, 0.50, 0.60, 5/7, 0.80]
LABELS = ["x040", "x050", "x060", "x071", "x080"]
sheets = []   # sheets[s] = (tau_nodes, array[n_tau, len(QTY), len(T_GRID)])
for lab in LABELS:
    cols = {}
    for l in open(f'{OUTDIR}/../feed-grid/cjh-grid-{lab}.jsonl'.replace('/wide/..', '')):
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
print(f"atlas resampled: {len(sheets)} sheets x {len(sheets[0][0])} tau cols x {len(T_GRID)} T")

def blended_column(x_feed, tau):
    """One (len(QTY), len(T_GRID)) column at exact (feed, tau)."""
    x_feed = min(max(x_feed, SHEET_X[0]), SHEET_X[-1])
    si = min(max(np.searchsorted(SHEET_X, x_feed) - 1, 0), len(SHEET_X)-2)
    fs = (x_feed - SHEET_X[si]) / (SHEET_X[si+1] - SHEET_X[si])
    lt = math.log(min(max(tau, sheets[0][0][0]), sheets[0][0][-1]))
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
GP = {t: prep(t) for t in ("y_c2h2", "y_co", "x_ch4")}
def gp_mean_batch(tgt, Zb):
    Zt, al, ls, sf = GP[tgt]
    d2 = ((Zb[:, None, :] - Zt[None, :, :]) / ls) ** 2
    r = np.sqrt(5.0 * d2.sum(-1))
    return (sf*sf*(1+r+r*r/3)*np.exp(-r)) @ al

lgt = lambda v: math.log(min(1-EPS, max(EPS, v)) / (1 - min(1-EPS, max(EPS, v))))
sig = lambda v: 1.0/(1.0+np.exp(-v))

# ---------- element cache
V_N, P_N, D_N = 14, 22, 10
VS = np.linspace(25, 55, V_N)
PS = np.exp(np.linspace(math.log(0.01), math.log(10.0), P_N))
DS = np.linspace(0.05, 0.85, D_N)
t0 = time.time()
nodes = []
for v in VS:
    for P in PS:
        for du in DS:
            try:
                d = integrate_pulsed_element(voltage=v, period=P, duty=du, ambient_c=25.0)
            except Exception:
                continue
            if not d['converged'] or d['t_peak_c'] > PEAK_CAP_C:
                continue
            pdrv = drive_defaults(voltage=v, period=P, duty=du)
            pe = (sum(v*v/cfp_resistance(tc, pdrv['element'])
                      for ph, tc in d['samples'] if ph < du)
                  / max(len(d['samples']) - 1, 1))
            nodes.append((v, P, du, d, pe))
    print(f"  V={v:.1f} done, feasible so far {len(nodes)}, {time.time()-t0:.0f}s", flush=True)
print(f"element cache: {len(nodes)} feasible nodes in {time.time()-t0:.0f}s")

# ---------- sweep
TAUS = np.exp(np.linspace(math.log(0.01), math.log(10.0), 20))
FEEDS = np.linspace(0.40, 0.80, 9)
N_PHASE = 200
rows = []
t0 = time.time()
for ni, (v, P, du, d, pe) in enumerate(nodes):
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
            col = blended_column(xf, tau)          # (12, nT)
            samp = np.empty((len(QTY), N_PHASE))
            for q in range(len(QTY)):
                samp[q] = np.interp(TphC, T_GRID, col[q])
            blend = (samp * w).sum(axis=1) / w.sum()
            x_qs = blend[0]
            wm = dict(zip(RECORD_SPECIES, blend[1:]))
            wci = xf*MW['CH4']/(xf*MW['CH4']+(1-xf)*MW['CO2'])
            cfed = wci/MW['CH4'] + (1-wci)/MW['CO2']
            y1q = 2*wm['C2H2']/MW['C2H2']/cfed
            y2q = wm['CO']/MW['CO']/cfed
            # power bookkeeping at the reference void volume: enthalpy change
            # of the quasi-steady composition, throughput from the phase-mean
            # density. Both scale linearly in volume, so eps fixes the
            # sustainable throughput in closed form later.
            mw_in = xf*MW['CH4'] + (1-xf)*MW['CO2']
            w_in = {'CH4': xf*MW['CH4']/mw_in, 'CO2': (1-xf)*MW['CO2']/mw_in}
            rho = float(np.mean(101325.0*mw_in/(R_GAS*Tph)))
            mdot = rho*VOID_CM3*1e-6/tau
            dh = sum((wm.get(sp,0.0)-w_in.get(sp,0.0))/MW[sp]*HF[sp]*1000.0
                     for sp in RECORD_SPECIES)
            rows.append((v, P, du, tau, xf, d['t_peak_c'], d['t_min_c'],
                         x_qs, y1q, y2q, pe, dh*mdot, mdot))
    if ni % 200 == 0:
        print(f"  node {ni}/{len(nodes)}, rows {len(rows)}, {time.time()-t0:.0f}s", flush=True)
rows = np.array(rows)
print(f"sweep grid: {len(rows)} candidates in {time.time()-t0:.0f}s")

# ---------- GP corrections in batches
Z = np.stack([np.array([lgt(x) for x in rows[:, 7]]),
              np.log10(rows[:, 1]/rows[:, 3]), rows[:, 2],
              rows[:, 5], rows[:, 6], rows[:, 4]], axis=1)
Zs = (Z - mu) / sd
pred = {}
for tgt, base_col in (("y_c2h2", 8), ("y_co", 9), ("x_ch4", 7)):
    out = np.empty(len(rows))
    for a in range(0, len(rows), 20000):
        b = min(a+20000, len(rows))
        out[a:b] = gp_mean_batch(tgt, Zs[a:b])
    base = np.clip(rows[:, base_col], EPS, 1-EPS)
    pred[tgt] = sig(np.log(base/(1-base)) + out)
    print(f"  {tgt} predicted", flush=True)

y1, y2 = pred['y_c2h2'], pred['y_co']

# ---------- energy objective. At the eps-capped scale-out the element power
# and the flow both cancel, leaving a pure chemistry quantity: endotherm per
# gram of acetylene, divided by eps. Computed for every candidate.
wci_all = rows[:,4]*MW['CH4']/(rows[:,4]*MW['CH4']+(1-rows[:,4])*MW['CO2'])
cfed_all = wci_all/MW['CH4'] + (1-wci_all)/MW['CO2']
gph_per_g = y1*cfed_all*MW['C2H2']/2*3600.0          # g C2H2 per (g gas/s)... per hour per g/s
dh_per_g = rows[:,11]/np.maximum(rows[:,12],1e-30)   # J per g of gas
with np.errstate(divide='ignore', invalid='ignore'):
    kwh_eps = np.where(y1>1e-4, dh_per_g/np.maximum(gph_per_g,1e-30)*3600.0/EPS_POWER/3600.0, np.inf)
    # dh_per_g [J/g] / gph_per_g [gC2H2*s/(g*h)] -> J*h/(gC2H2*s) ... keep it simple:
    # energy per g C2H2 = dh_per_g / (y1*cfed*MW/2) [J/g], /3.6e6 -> kWh/kg is *1000/3.6e6
    e_per_g = dh_per_g/np.maximum(y1*cfed_all*MW['C2H2']/2.0,1e-30)   # J per g C2H2
    kwh_eps = np.where(y1>1e-4, e_per_g/3.6e6*1000.0/EPS_POWER, np.inf)  # kWh per kg at eps cap
# ---------- Pareto front (maximize both)
order = np.argsort(-y1)
front = []
best2 = -1.0
for i in order:
    if y2[i] > best2:
        front.append(i)
        best2 = y2[i]
front = np.array(front)
print(f"Pareto front: {len(front)} points")

def row_dict(i):
    pe, q, mdot = rows[i,10], rows[i,11], rows[i,12]
    scale = EPS_POWER*pe/max(q,1e-12)            # volume multiplier to hit eps
    wci = rows[i,4]*MW['CH4']/(rows[i,4]*MW['CH4']+(1-rows[i,4])*MW['CO2'])
    cfed = wci/MW['CH4'] + (1-wci)/MW['CO2']
    gph_c2h2 = float(y1[i])*cfed*MW['C2H2']/2*mdot*3600*scale
    return {"voltage_V": float(rows[i,0]), "period_s": float(rows[i,1]),
            "duty": float(rows[i,2]), "tau_s": float(rows[i,3]),
            "feed_x": float(rows[i,4]), "t_peak_c": float(rows[i,5]),
            "t_min_c": float(rows[i,6]),
            "pred_y_c2h2": float(y1[i]), "pred_y_co": float(y2[i]),
            "pred_x_ch4": float(pred['x_ch4'][i]),
            "qs_y_c2h2": float(rows[i,8]), "qs_y_co": float(rows[i,9]),
            "element_W": float(pe), "endotherm_W_at_ref": float(q),
            "eps_at_ref": float(q/max(pe,1e-12)),
            "max_void_cm3_at_eps10": float(11.03*scale),
            "gph_c2h2_per_element_at_eps10": gph_c2h2,
            "kwh_per_kg_c2h2_at_eps10": float(pe/max(gph_c2h2,1e-12)) if gph_c2h2>1e-9 else None}

y1m, y2m = y1[front].max(), y2[front].max()
J = np.minimum(y1/max(y1m,1e-12), y2/max(y2m,1e-12))
picks = {"max_y_c2h2": int(front[np.argmax(y1[front])]),
         "max_y_co": int(front[np.argmax(y2[front])]),
         "balance_minmax": int(np.argmax(J))}
ratio = y1/np.maximum(y2, 1e-12)
band = (ratio >= 0.5) & (ratio <= 2.0)
if band.any():
    s = np.where(band)[0]
    picks["best_sum_in_band"] = int(s[np.argmax((y1+y2)[s])])

# energy-yield frontier: maximize Y_C2H2, minimize kWh/kg at the eps cap
ok = np.isfinite(kwh_eps) & (y1 > 0.02)
oi = np.where(ok)[0][np.argsort(-y1[ok])]
efront = []
bestE = np.inf
for i in oi:
    if kwh_eps[i] < bestE:
        efront.append(int(i)); bestE = kwh_eps[i]
emin = int(np.where(ok)[0][np.argmin(kwh_eps[ok])])

report = {
    "generated_from": "frozen wide-surrogate-atlas.json, atlas-only path",
    "grid": {"nodes": len(nodes), "candidates": int(len(rows)),
             "taus": len(TAUS), "feeds": len(FEEDS), "phase_points": N_PHASE},
    "front_size": int(len(front)),
    "front": [row_dict(i) for i in front[np.linspace(0, len(front)-1, min(60, len(front))).astype(int)]],
    "picks": {k: row_dict(i) for k, i in picks.items()},
    "energy": {
        "definition": "kWh per kg C2H2 at the eps=0.10 power-consistency cap; "
                      "element power and flow cancel there, leaving endotherm "
                      "per gram of product over eps",
        "min_kwh_point": dict(row_dict(emin), kwh_eps=float(kwh_eps[emin])),
        "front": [dict(row_dict(i), kwh_eps=float(kwh_eps[i]))
                  for i in efront[:40]],
    },
}
json.dump(report, open(f'{OUTDIR}/pareto-sweep-report.json', 'w'), indent=1)
for k, i in picks.items():
    r = row_dict(i)
    print(f"{k:16s} Y_C2H2 {r['pred_y_c2h2']:.4f} Y_CO {r['pred_y_co']:.4f} | "
          f"V {r['voltage_V']:.1f} P {r['period_s']:.3g} duty {r['duty']:.2f} "
          f"tau {r['tau_s']:.3g} x {r['feed_x']:.2f} Tpk {r['t_peak_c']:.0f} Tmn {r['t_min_c']:.0f}")

# round-trip targets: the picks plus a spread of the front
chosen = sorted(set(list(picks.values()) + [int(i) for i in
                front[np.linspace(0, len(front)-1, min(16, len(front))).astype(int)]]))
targets = []
for n, i in enumerate(chosen):
    r = row_dict(i)
    targets.append({"design_index": 6000000+n+1, "voltage": r["voltage_V"],
                    "period_s": r["period_s"], "duty": r["duty"], "tau_s": r["tau_s"],
                    "feed": f"CH4:{r['feed_x']:.6f}, CO2:{1-r['feed_x']:.6f}",
                    "predicted": {"y_c2h2": r["pred_y_c2h2"], "y_co": r["pred_y_co"]}})
json.dump({"purpose": "round-trip verification of the predicted Pareto frontier",
           "targets": targets}, open(f'{OUTDIR}/targets-frontier.json', 'w'), indent=1)
print(f"wrote pareto-sweep-report.json and targets-frontier.json ({len(targets)} round-trip targets)")
print("SWEEP DONE")
