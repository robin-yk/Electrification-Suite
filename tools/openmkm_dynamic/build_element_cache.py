"""Build and persist the pulsed-element node cache used by the Pareto sweeps.

Identical grid to pareto_sweep.py. Stores, per feasible node:
voltage, period, duty, the integrated profile dict d (samples, peaks), and two
independent cycle-average powers:
  pe_elec = <V^2/R(T)>_cycle over on-phase samples (electric definition)
  pe_loss = <Q_loss(T)>_cycle over all samples   (thermal definition)
At the periodic state these agree up to sampling error; both are recorded so
the fair-fight analysis can check the match instead of assuming it.
"""
import sys, math, time, pickle
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from element_drive import (integrate_pulsed_element, cfp_resistance,
                           lumped_loss_power, drive_defaults)
from multiprocessing import Pool

PEAK_CAP_C = 1800.0
V_N, P_N, D_N = 14, 22, 10
VS = np.linspace(25, 55, V_N)
PS = np.exp(np.linspace(math.log(0.01), math.log(10.0), P_N))
DS = np.linspace(0.05, 0.85, D_N)

def one_voltage(v):
    out = []
    for P in PS:
        for du in DS:
            try:
                d = integrate_pulsed_element(voltage=v, period=P, duty=du, ambient_c=25.0)
            except Exception:
                continue
            if not d['converged'] or d['t_peak_c'] > PEAK_CAP_C:
                continue
            pdrv = drive_defaults(voltage=v, period=P, duty=du)
            n = max(len(d['samples']) - 1, 1)
            pe_elec = sum(v*v/cfp_resistance(tc, pdrv['element'])
                          for ph, tc in d['samples'] if ph < du) / n
            pe_loss = sum(lumped_loss_power(tc, pdrv)
                          for ph, tc in d['samples'][:-1]) / n
            out.append({'v': v, 'P': P, 'du': du, 'd': d,
                        'pe_elec': pe_elec, 'pe_loss': pe_loss})
    print(f"  V={v:.1f}: {len(out)} feasible", flush=True)
    return out

if __name__ == '__main__':
    t0 = time.time()
    with Pool(3) as pool:
        chunks = pool.map(one_voltage, VS)
    nodes = [n for ch in chunks for n in ch]
    with open(sys.argv[1], 'wb') as f:
        pickle.dump(nodes, f)
    print(f"CACHE DONE: {len(nodes)} nodes in {time.time()-t0:.0f}s -> {sys.argv[1]}")
