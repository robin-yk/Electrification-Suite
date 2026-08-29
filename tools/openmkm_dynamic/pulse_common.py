"""Shared machinery for the pulse-space searches.

One place for the pieces that pareto_sweep.py grew inline, so the optimizer,
the fair-fight appendix and any future search cannot drift apart: the atlas
resampled to a uniform temperature grid, the frozen GP correction, the inlet
bookkeeping, the candidate-row builder over a persisted element cache, and
the Pareto extractors. Everything is pure: plain inputs, plain outputs, no
I/O beyond the two data files read at import by the callers.

Column layout of the candidate matrix returned by build_rows():
  0 voltage  1 period_s  2 duty  3 tau_s  4 feed_x  5 t_peak_c  6 t_min_c
  7 x_qs  8 y_c2h2_qs  9 y_co_qs  10 pe_W  11 dh_J_per_g  12 mdot_g_s
  13 cfed_molC_per_g  14 rho_g_m3
"""
import json, math
import numpy as np
from run_cstr_case import waveform_temperature, MW, RECORD_SPECIES
from element_drive import profile_function

R_GAS = 8.314462618
VOID_CM3 = 11.03            # fixed reactor void volume for every candidate
PRESSURE_PA = 101325.0      # fixed pressure for every candidate
EPS = 1e-4
T_GRID = np.arange(400.0, 1851.0, 2.0)
QTY = ["conv"] + RECORD_SPECIES
SHEET_X = [0.40, 0.50, 0.60, 5/7, 0.80]
LABELS = ["x040", "x050", "x060", "x071", "x080"]
COL = {n: i for i, n in enumerate(
    "voltage period_s duty tau_s feed_x t_peak_c t_min_c x_qs y_c2h2_qs "
    "y_co_qs pe_W dh_J_per_g mdot_g_s cfed rho duty_J_per_g".split())}
T_IN_K = 298.15

lgt = lambda v: math.log(min(1-EPS, max(EPS, v)) / (1 - min(1-EPS, max(EPS, v))))
sig = lambda v: 1.0/(1.0+np.exp(-v))


def load_atlas(feed_grid_dir):
    """Resample the 5-sheet steady CJH grid onto T_GRID; return the sheets
    and a blended_column(feed, tau) closure identical to pareto_sweep.py."""
    sheets = []
    for lab in LABELS:
        cols = {}
        for l in open(f'{feed_grid_dir}/cjh-grid-{lab}.jsonl'):
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
    logtau = np.log(sheets[0][0])
    tau_lo, tau_hi = float(sheets[0][0][0]), float(sheets[0][0][-1])

    def blended_column(x_feed, tau):
        x_feed = min(max(x_feed, SHEET_X[0]), SHEET_X[-1])
        si = min(max(np.searchsorted(SHEET_X, x_feed) - 1, 0), len(SHEET_X)-2)
        fs = (x_feed - SHEET_X[si]) / (SHEET_X[si+1] - SHEET_X[si])
        lt = math.log(min(max(tau, tau_lo), tau_hi))
        tj = min(max(np.searchsorted(logtau, lt) - 1, 0), len(logtau)-2)
        ft = (lt - logtau[tj]) / (logtau[tj+1] - logtau[tj])
        def sheet_col(s):
            a = sheets[s][1]
            return a[tj]*(1-ft) + a[tj+1]*ft
        return sheet_col(si)*(1-fs) + sheet_col(si+1)*fs
    return blended_column


def load_gp(model_path, targets=("y_c2h2", "y_co")):
    """Frozen-model batch predictor. Returns predict(target, features)."""
    M = json.load(open(model_path))
    mu, sd = np.array(M['feature_mean']), np.array(M['feature_std'])
    packed = {}
    for tgt in targets:
        tm = M['targets'][tgt]
        packed[tgt] = (np.array(tm['train_z']), np.array(tm['alpha']),
                       np.array(tm['lengthscales']), tm['sigma_f'])

    def correction(tgt, Z):
        Zs = (Z - mu) / sd
        Zt, al, ls, sf = packed[tgt]
        out = np.empty(len(Zs))
        for a in range(0, len(Zs), 20000):
            b = min(a+20000, len(Zs))
            d2 = ((Zs[a:b, None, :] - Zt[None, :, :]) / ls) ** 2
            r = np.sqrt(5.0 * d2.sum(-1))
            out[a:b] = (sf*sf*(1+r+r*r/3)*np.exp(-r)) @ al
        return out
    return correction


def inlet(xf):
    """Feed bookkeeping at CH4 mole fraction xf (CO2 balance)."""
    mw_in = xf*MW['CH4'] + (1-xf)*MW['CO2']
    wci = xf*MW['CH4']/mw_in
    cfed = wci/MW['CH4'] + (1-wci)/MW['CO2']    # mol C per g of feed
    w_in = {'CH4': wci, 'CO2': 1-wci}
    return mw_in, cfed, w_in


def chem_from_blend(blend, xf, hf):
    """Yields on total fed carbon and net reaction enthalpy per g of gas."""
    wm = dict(zip(RECORD_SPECIES, blend[1:]))
    _, cfed, w_in = inlet(xf)
    y1 = 2*wm['C2H2']/MW['C2H2']/cfed
    y2 = wm['CO']/MW['CO']/cfed
    dh = sum((wm.get(sp, 0.0)-w_in.get(sp, 0.0))/MW[sp]*hf[sp]*1000.0
             for sp in RECORD_SPECIES)
    return blend[0], y1, y2, dh


def load_h_table(path):
    """Absolute mass enthalpies h_i(T) in J/g from make_enthalpy_table.py."""
    d = json.load(open(path))
    Ts = np.array(d['T_K'], dtype=float)
    return Ts, {sp: np.array(d['h_J_per_g'][sp]) for sp in d['h_J_per_g']}


def build_rows(nodes, taus, feeds, blended_column, hf, h_table,
               max_ratio=130.0, n_phase=200, progress=None):
    """Candidate matrix over cache nodes x taus x feeds; layout in COL."""
    hT, hsp = h_table
    h_in_cache = {}
    rows = []
    for ni, nd in enumerate(nodes):
        v, P, du, d, pe = nd['v'], nd['P'], nd['du'], nd['d'], nd['pe_elec']
        p = {"t_min_K": d['t_min_c']+273.15, "t_peak_K": d['t_peak_c']+273.15,
             "period_s": P, "duty": du, "waveform": "physical",
             "ramp_up_fraction": 0.05, "ramp_down_fraction": 0.05,
             "_profile": profile_function(d)}
        Tph = np.array([waveform_temperature((k+0.5)/n_phase, p)
                        for k in range(n_phase)])
        w = 1.0/Tph
        TphC = Tph - 273.15
        h_at = {sp: np.interp(Tph, hT, hsp[sp]) for sp in RECORD_SPECIES}
        for tau in taus:
            if tau/P > max_ratio:
                continue
            for xf in feeds:
                col = blended_column(xf, tau)
                samp = np.empty((len(QTY), n_phase))
                for q in range(len(QTY)):
                    samp[q] = np.interp(TphC, T_GRID, col[q])
                blend = (samp * w).sum(axis=1) / w.sum()
                x_qs, y1q, y2q, dh = chem_from_blend(blend, xf, hf)
                mw_in, cfed, w_in = inlet(xf)
                # density must use the reacted-mixture molecular weight:
                # Cantera defines mdot = reactor.mass/tau on the actual
                # composition, and at deep conversion the mixture MW halves,
                # so the feed MW would inflate throughput by up to 2x
                inv_mw_ph = sum(samp[1+si]/MW[sp]
                                for si, sp in enumerate(RECORD_SPECIES))
                rho = float(np.mean(PRESSURE_PA/(R_GAS*Tph*inv_mw_ph)))
                mdot = rho*VOID_CM3*1e-6/tau
                # process duty per gram: outflow-weighted mixture enthalpy at
                # T(t) minus the cold feed, absolute convention, so sensible
                # heating and reaction enthalpy arrive as one difference
                h_mix_ph = sum(samp[1+si]*h_at[sp]
                               for si, sp in enumerate(RECORD_SPECIES))
                h_out = float((h_mix_ph*w).sum()/w.sum())
                if xf not in h_in_cache:
                    h_in_cache[xf] = sum(
                        w_in[sp]*float(np.interp(T_IN_K, hT, hsp[sp]))
                        for sp in ('CH4', 'CO2'))
                duty_g = h_out - h_in_cache[xf]
                rows.append((v, P, du, tau, xf, d['t_peak_c'], d['t_min_c'],
                             x_qs, y1q, y2q, pe, dh, mdot, cfed, rho, duty_g))
        if progress and ni % 300 == 0:
            progress(ni, len(nodes), len(rows))
    return np.array(rows)


def gp_features(rows):
    """Feature matrix in the frozen model's order."""
    return np.stack([np.array([lgt(x) for x in rows[:, COL['x_qs']]]),
                     np.log10(rows[:, COL['period_s']]/rows[:, COL['tau_s']]),
                     rows[:, COL['duty']],
                     rows[:, COL['t_peak_c']], rows[:, COL['t_min_c']],
                     rows[:, COL['feed_x']]], axis=1)


def corrected_yields(rows, correction):
    """Apply the logit-space GP memory correction to both yield targets."""
    Z = gp_features(rows)
    out = {}
    for tgt, base_col in (("y_c2h2", COL['y_c2h2_qs']), ("y_co", COL['y_co_qs'])):
        base = np.clip(rows[:, base_col], EPS, 1-EPS)
        out[tgt] = sig(np.log(base/(1-base)) + correction(tgt, Z))
    return out['y_c2h2'], out['y_co']


def productivities(rows, y1, y2):
    """kg of product per kWh of steady electric draw, and the mass rates.
    The draw is element losses plus process duty; g/s per W equals kg per
    kWh times 1/3600."""
    m1 = y1*rows[:, COL['cfed']]*rows[:, COL['mdot_g_s']]*MW['C2H2']/2.0
    m2 = y2*rows[:, COL['cfed']]*rows[:, COL['mdot_g_s']]*MW['CO']
    p_total = (rows[:, COL['pe_W']]
               + rows[:, COL['duty_J_per_g']]*rows[:, COL['mdot_g_s']])
    q1 = m1/p_total*3600.0
    q2 = m2/p_total*3600.0
    return q1, q2, m1, m2, p_total


def pareto_max(a, b, idx):
    """Indices from idx on the maximize-both front, sorted by a descending.
    Ties in a are visited best-b first so a weakly dominated tie-mate can
    never slip in ahead of its dominator."""
    order = idx[np.lexsort((-b[idx], -a[idx]))]
    front, best = [], -np.inf
    for i in order:
        if b[i] > best:
            front.append(i)
            best = b[i]
    return np.array(front)


def pareto_min(a, b, idx):
    order = idx[np.lexsort((b[idx], a[idx]))]
    front, best = [], np.inf
    for i in order:
        if b[i] < best:
            front.append(i)
            best = b[i]
    return np.array(front)
