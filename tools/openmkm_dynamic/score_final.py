"""Score the FROZEN model on the fresh final set. No retraining anywhere."""
import json, glob, math
import os
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np
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
rows=[json.loads(l) for f in sorted(glob.glob(
    HERE + '/data/wide/design-wide-final-w*.jsonl')) for l in open(f)]
rows=[r for r in rows if r.get('converged') and str(r['design_index']) in SC]
print(f"final sealed set: {len(rows)} converged cases")
def qty(w,xf):
    wci=xf*MW['CH4']/(xf*MW['CH4']+(1-xf)*MW['CO2']); wco2i=1-wci
    cfed=wci/MW['CH4']+wco2i/MW['CO2']
    return {'x_ch4':max(0.0,1-w['CH4']/wci),'x_co2':max(0.0,1-w['CO2']/wco2i),
            'y_c2h2':2*w['C2H2']/MW['C2H2']/cfed,'y_co':w['CO']/MW['CO']/cfed}
report={}
for tgt,tm in M['targets'].items():
    Zt=np.array(tm['train_z']); al=np.array(tm['alpha']); ls=np.array(tm['lengthscales'])
    eb,eg=[],[]
    for r in rows:
        i=r['inputs']; xf=fx(i['feed']); scr=SC[str(r['design_index'])]
        b=qty(scr['outflow_mass_fractions_qs'],xf)[tgt]
        d=qty(r['outputs']['outflow_mass_fractions'],xf)[tgt]
        if d<=1e-6 and b<=1e-6: continue
        z=(np.array([lgt(scr['x_ch4_qs']),math.log10(i['period_s']/i['tau_s']),i['duty'],
                     i['t_peak_K']-273.15,i['t_min_K']-273.15,xf])-mu)/sd
        c=float((tm['sigma_f']**2*mat(z[None,:],Zt,ls))[0]@al)
        eb.append(abs(b-d)); eg.append(abs(sig(lgt(b)+c)-d))
    def st(e):
        e=np.array(e); n=len(e)
        return e.mean(), np.sort(e)[max(0,math.ceil(0.95*n)-1)], e.max(), n
    mb,pb,xb,n=st(eb); mg,pg,xg,_=st(eg)
    ok = mg<=0.02 and pg<=0.05 and xg<=0.10
    report[tgt]=dict(n=n,baseline=[mb,pb,xb],gp=[mg,pg,xg],gates="PASS" if ok else "FAIL")
    print(f"  {tgt:8s} n={n:4d}  baseline {mb:.5f}/{pb:.5f}/{xb:.5f}  gp {mg:.5f}/{pg:.5f}/{xg:.5f}  {report[tgt]['gates']}")
json.dump(report, open(HERE + '/data/wide/final-test-report.json','w'), indent=1)
print("wrote final-test-report.json")
