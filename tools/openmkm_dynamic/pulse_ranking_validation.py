"""Does the surrogate rank PULSED conditions correctly for optimization?

The absolute-error gates certify prediction quality. Optimization needs a
different property: on a set of candidate pulses, the surrogate's ordering
must agree with Cantera's, and the surrogate's chosen best must be nearly
as good as the true best. This scores both on the three sealed sets, which
the frozen model has never trained on, overall and restricted to real-swing
pulses (dT >= 100 K, >= 200 K).

Metrics per objective (y_c2h2, y_co, and the balance objective y_c2h2+y_co):
  spearman, kendall       rank agreement, predicted vs Cantera
  top-k overlap           |pred-top-k intersect true-top-k| for k = 5, 10
  regret@1, regret@5      true_best minus the true value of the best case
                          inside the surrogate's top-1 / top-5 picks, in
                          absolute yield units; 0 means the surrogate's
                          pick IS the true optimum

Run:  python3 tools/openmkm_dynamic/pulse_ranking_validation.py
"""
import json, glob, math
import os
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np
from scipy.stats import spearmanr, kendalltau

M = json.load(open(HERE + '/models/wide-surrogate-atlas.json'))
SC = json.load(open(HERE + '/data/wide/atlas-qs-sidecar.json'))['cases']
mu, sd = np.array(M['feature_mean']), np.array(M['feature_std'])
MW = {"CH4":16.043,"CO2":44.010,"CO":28.010,"C2H2":26.038}
EPS = 1e-4
lgt = lambda v: math.log(min(1-EPS,max(EPS,v))/(1-min(1-EPS,max(EPS,v))))
sig = lambda v: 1/(1+math.exp(-v))
def mat(A,B,ls):
    d2=((A[:,None,:]-B[None,:,:])/ls)**2; r=np.sqrt(5*d2.sum(-1))
    return (1+r+r*r/3)*np.exp(-r)
def fx(s):
    p=dict(kv.split(':') for kv in s.replace(' ','').split(','))
    return float(p['CH4'])/(float(p['CH4'])+float(p['CO2']))
def qty(w,xf):
    wci=xf*MW['CH4']/(xf*MW['CH4']+(1-xf)*MW['CO2']); wco2i=1-wci
    cfed=wci/MW['CH4']+wco2i/MW['CO2']
    return {'y_c2h2':2*w['C2H2']/MW['C2H2']/cfed,'y_co':w['CO']/MW['CO']/cfed}

SETS = {"validation": "design-wide-validation-w*.jsonl",
        "final": "design-wide-final-w*.jsonl",
        "final3": "design-wide-final3-w*.jsonl"}
GPX = {}
for tgt in ("y_c2h2","y_co"):
    tm=M['targets'][tgt]
    GPX[tgt]=(np.array(tm['train_z']),np.array(tm['alpha']),
              np.array(tm['lengthscales']),tm['sigma_f'])

def load_set(pat):
    rows=[json.loads(l) for f in sorted(glob.glob(HERE+'/data/wide/'+pat)) for l in open(f)]
    rows=[r for r in rows if r.get('converged') and str(r['design_index']) in SC]
    out=[]
    for r in rows:
        i=r['inputs']; xf=fx(i['feed']); scr=SC[str(r['design_index'])]
        z=(np.array([lgt(scr['x_ch4_qs']),math.log10(i['period_s']/i['tau_s']),i['duty'],
                     i['t_peak_K']-273.15,i['t_min_K']-273.15,xf])-mu)/sd
        rec={'dT': i['t_peak_K']-i['t_min_K'], 'index': r['design_index']}
        for tgt in ("y_c2h2","y_co"):
            Zt,al,ls,sf=GPX[tgt]
            c=float((sf*sf*mat(z[None,:],Zt,ls))[0]@al)
            b=qty(scr['outflow_mass_fractions_qs'],xf)[tgt]
            rec['pred_'+tgt]=sig(lgt(b)+c)
            rec['true_'+tgt]=qty(r['outputs']['outflow_mass_fractions'],xf)[tgt]
        out.append(rec)
    return out

def score(recs, obj):
    if obj == 'balance':
        p=np.array([r['pred_y_c2h2']+r['pred_y_co'] for r in recs])
        t=np.array([r['true_y_c2h2']+r['true_y_co'] for r in recs])
    else:
        p=np.array([r['pred_'+obj] for r in recs])
        t=np.array([r['true_'+obj] for r in recs])
    n=len(p)
    if n < 10:
        return {"n": n, "note": "too few cases"}
    sp=spearmanr(p,t).statistic; kt=kendalltau(p,t).statistic
    po=np.argsort(-p); to=np.argsort(-t)
    res={"n": n, "spearman": float(sp), "kendall": float(kt)}
    for k in (5,10):
        res[f"top{k}_overlap"]=int(len(set(po[:k]) & set(to[:k])))
    tbest=t[to[0]]
    res["true_best"]=float(tbest)
    res["regret_at_1"]=float(tbest - t[po[0]])
    res["regret_at_5"]=float(tbest - t[po[:5]].max())
    return res

report={}
pooled=[]
for name,pat in SETS.items():
    recs=load_set(pat)
    pooled += recs
    report[name]={}
    for cls,lo in (("all",0.0),("dT100",100.0),("dT200",200.0)):
        sub=[r for r in recs if r['dT']>=lo]
        report[name][cls]={obj: score(sub,obj) for obj in ("y_c2h2","y_co","balance")}
    print(f"{name}: {len(recs)} cases, dT>=100K {sum(1 for r in recs if r['dT']>=100)}, "
          f"dT>=200K {sum(1 for r in recs if r['dT']>=200)}")
report["pooled"]={}
for cls,lo in (("all",0.0),("dT100",100.0),("dT200",200.0)):
    sub=[r for r in pooled if r['dT']>=lo]
    report["pooled"][cls]={obj: score(sub,obj) for obj in ("y_c2h2","y_co","balance")}

for cls in ("all","dT100","dT200"):
    for obj in ("y_c2h2","y_co","balance"):
        s=report["pooled"][cls][obj]
        print(f"pooled {cls:6s} {obj:8s} n={s['n']:4d} spearman {s['spearman']:.3f} "
              f"kendall {s['kendall']:.3f} top5 {s['top5_overlap']}/5 top10 {s['top10_overlap']}/10 "
              f"regret@1 {s['regret_at_1']:.4f} regret@5 {s['regret_at_5']:.4f} "
              f"(true best {s['true_best']:.4f})")
json.dump(report, open(HERE+'/data/wide/pulse-ranking-report.json','w'), indent=1)
print("RANKING DONE -> data/wide/pulse-ranking-report.json")
