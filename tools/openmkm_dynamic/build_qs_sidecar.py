"""Atlas-quasi-steady sidecar: for every wide-campaign case, the quasi-steady
conversion and outflow mass fractions computed the way DEPLOYMENT computes
them (element ODE waveform + 5-feed atlas interpolation), keyed by design
index. Zero Cantera."""
import sys, json, glob, math, bisect, warnings
import os
HERE = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings("ignore")
sys.path.insert(0, HERE)
from run_cstr_case import waveform_temperature, MW, RECORD_SPECIES
from element_drive import integrate_pulsed_element, profile_function

SHEETS = {}
for lab, x in (("x040",0.40),("x050",0.50),("x060",0.60),("x071",5/7),("x080",0.80)):
    cols = {}
    for l in open(f'{HERE}/data/feed-grid/cjh-grid-{lab}.jsonl'):
        r = json.loads(l)
        m = {sp: r['outlet_molefrac'][sp]*MW[sp] for sp in RECORD_SPECIES}
        tot = sum(m.values())
        cols.setdefault(r['tau_s'], []).append((r['T_C'], r['ch4_conversion'],
                                                {sp: m[sp]/tot for sp in RECORD_SPECIES}))
    for k in cols: cols[k].sort(key=lambda t: t[0])
    SHEETS[x] = (sorted(cols), cols)
FEEDS = sorted(SHEETS)

def col_interp(pts, T):
    Ts = [p[0] for p in pts]
    if T <= Ts[0]: p = pts[0]; return p[1], p[2]
    if T >= Ts[-1]: p = pts[-1]; return p[1], p[2]
    i = max(0, min(bisect.bisect_left(Ts, T)-1, len(pts)-2))
    f = (T-Ts[i])/(Ts[i+1]-Ts[i])
    return (pts[i][1]+(pts[i+1][1]-pts[i][1])*f,
            {sp: pts[i][2][sp]+(pts[i+1][2][sp]-pts[i][2][sp])*f for sp in RECORD_SPECIES})

def sheet_at(xf, T, tau):
    taus, cols = SHEETS[xf]
    tau = min(max(tau, taus[0]), taus[-1])
    j = max(0, min(bisect.bisect_left(taus, tau)-1, len(taus)-2))
    f = (math.log(tau)-math.log(taus[j]))/(math.log(taus[j+1])-math.log(taus[j]))
    x0,w0 = col_interp(cols[taus[j]], T); x1,w1 = col_interp(cols[taus[j+1]], T)
    return x0+(x1-x0)*f, {sp: w0[sp]+(w1[sp]-w0[sp])*f for sp in RECORD_SPECIES}

def atlas_at(xf, T, tau):
    xf = min(max(xf, FEEDS[0]), FEEDS[-1])
    j = max(0, min(bisect.bisect_left(FEEDS, xf)-1, len(FEEDS)-2))
    f = (xf-FEEDS[j])/(FEEDS[j+1]-FEEDS[j])
    xa,wa = sheet_at(FEEDS[j], T, tau); xb,wb = sheet_at(FEEDS[j+1], T, tau)
    return xa+(xb-xa)*f, {sp: wa[sp]+(wb[sp]-wa[sp])*f for sp in RECORD_SPECIES}

def feed_x(s):
    p = dict(kv.split(':') for kv in s.replace(' ','').split(','))
    return float(p['CH4'])/(float(p['CH4'])+float(p['CO2']))

path = HERE + '/data/wide/atlas-qs-sidecar.json'
try:
    out = json.load(open(path))["cases"]
    print(f"resuming with {len(out)} existing cases", flush=True)
except Exception:
    out = {}
files = sorted(glob.glob(HERE + '/data/wide/design-wide-*.jsonl'))
for fn in files:
    for l in open(fn):
        r = json.loads(l)
        if not r.get('converged'): continue
        i = r['inputs']
        idx = str(r['design_index'])
        if idx in out: continue
        drive = integrate_pulsed_element(voltage=i['voltage_V'], period=i['period_s'],
                                         duty=i['duty'], ambient_c=25.0)
        p = dict(i, _profile=profile_function(drive))
        xf = feed_x(i['feed'])
        wx = wsum = 0.0; wsp = {sp:0.0 for sp in RECORD_SPECIES}
        for k in range(400):
            T = waveform_temperature((k+0.5)/400, p)
            xq, wq = atlas_at(xf, T-273.15, i['tau_s'])
            w = 1.0/T; wx += w*xq; wsum += w
            for sp in RECORD_SPECIES: wsp[sp] += w*wq[sp]
        out[idx] = {"x_ch4_qs": wx/wsum,
                    "outflow_mass_fractions_qs": {sp: wsp[sp]/wsum for sp in RECORD_SPECIES}}
    print(f"{fn.split('/')[-1]}: cumulative {len(out)}", flush=True)
json.dump({"source": "element ODE + feed-grid atlas, 400 phase points, 1/T outflow weighting",
           "cases": out}, open(path, 'w'))
print(f"DONE {len(out)} cases -> {path}", flush=True)
