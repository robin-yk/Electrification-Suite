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
V_N, P_N = 14, 22
VS = np.linspace(25, 55, V_N)
PS = np.exp(np.linspace(math.log(0.01), math.log(10.0), P_N))
# v1 is the grid every pulsefront/pulsefront2 number was computed on; x1 opens
# the low-duty edge that most of the v1 primary front sat against: 12 of its 18
# points and all three named picks were at duty 0.05, the grid floor, with the
# other 6 at 0.139 and 0.317. x1 reaches the 0.02 floor the transient design
# box itself sampled.
# The ten v1 values are a subset of x1, so v1 results are reproducible from an
# x1 cache by filtering.
DUTY_GRIDS = {
    'v1': np.linspace(0.05, 0.85, 10),
    'x1': np.concatenate([[0.02, 0.03, 0.04], np.linspace(0.05, 0.85, 10)]),
}
DS = DUTY_GRIDS['v1']

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
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('out', help='pickle path for the node cache')
    ap.add_argument('--duty-grid', choices=sorted(DUTY_GRIDS), default='v1')
    args = ap.parse_args()
    DS = DUTY_GRIDS[args.duty_grid]
    t0 = time.time()
    with Pool(3) as pool:
        chunks = pool.map(one_voltage, VS)
    nodes = [n for ch in chunks for n in ch]
    with open(args.out, 'wb') as f:
        pickle.dump(nodes, f)
    print(f"CACHE DONE ({args.duty_grid}): {len(nodes)} nodes "
          f"in {time.time()-t0:.0f}s -> {args.out}")
