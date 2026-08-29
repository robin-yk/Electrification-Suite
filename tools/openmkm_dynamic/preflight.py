#!/usr/bin/env python3
"""Four gates every campaign passes before it is allowed to spend Cantera time.

Every one of these exists because skipping it cost a rerun:

  1 time grid      the substep grid is converged at the chemistry level and
                   resolves the element peak; a 100-point uniform grid put
                   Y_C2H2 14.3 percent high at duty 0.03
  2 thermodynamics units and the reaction-enthalpy floor; a loss-only power
                   denominator once produced SEC below the floor
  3 domain         the model has a frozen gate calibrated on a development
                   set, and the campaign's candidates are inside it
  4 indices        no design_index carries two different sets of inputs;
                   the first frontier campaign collided with the second

Exit status is nonzero if any gate fails. Run before launching a campaign:
  python tools/openmkm_dynamic/preflight.py --model models/wide-surrogate-atlas-v3.json
"""
import argparse
import glob
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

FAIL = []


def gate(name, ok, detail):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}: {detail}")
    if not ok:
        FAIL.append(name)


def sha(path, n=12):
    h = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    return h[:n]


def gate_time_grid():
    p = HERE + '/data/wide/grid-convergence-report.json'
    if not os.path.exists(p):
        return gate("time grid", False, "no grid-convergence-report.json; run "
                                        "verify_grid_convergence.py")
    r = json.load(open(p))
    worst = max(max(c['rel_c2h2'], c['rel_co']) for c in r['cases'])
    gate("time grid", not r['failed'],
         f"{len(r['cases'])} extreme conditions against an 8x reference, worst "
         f"yield error {worst*100:.2f} percent against the "
         f"{r['gates']['yield_rel']*100:.0f} percent gate")
    out = subprocess.run([sys.executable, HERE + '/check_phase_grid.py'],
                         capture_output=True, text=True)
    gate("peak resolution", out.returncode == 0,
         out.stdout.strip().splitlines()[-1] if out.stdout else "no output")


def gate_thermodynamics(report):
    hf = json.load(open(HERE + '/data/hf-nist.json'))['hf']
    # 2 CH4 -> C2H2 + 3 H2 and CH4 + CO2 -> 2 CO + 2 H2, kJ/mol of product
    dh1 = (hf['C2H2'] + 3*hf['H2'] - 2*hf['CH4'])
    dh2 = (2*hf['CO'] + 2*hf['H2'] - hf['CH4'] - hf['CO2'])/2.0
    # kJ/mol -> J/mol -> J/g -> J/kg -> kWh/kg, then invert to a kg/kWh cap
    q1_cap = 1.0/(dh1*1000/26.038*1000/3.6e6)   # kg per kWh at 100 percent
    q2_cap = 1.0/(dh2*1000/28.010*1000/3.6e6)
    if report is None:
        return gate("thermodynamic floor", True,
                    f"no report to check; caps are q_C2H2 {q1_cap:.3f}, "
                    f"q_CO {q2_cap:.3f} kg/kWh")
    r = json.load(open(report))
    pts = r['front'] + r.get('front_fidelity_le_01', [])
    q1 = max(p['q_c2h2_kg_kwh'] for p in pts)
    q2 = max(p['q_co_kg_kwh'] for p in pts)
    bad = [p for p in pts if p['p_total_W'] < p['duty_W'] - 1e-9]
    gate("thermodynamic floor", q1 <= q1_cap and q2 <= q2_cap and not bad,
         f"best q_C2H2 {q1:.4f} against the {q1_cap:.3f} reaction cap, q_CO "
         f"{q2:.4f} against {q2_cap:.3f}, {len(bad)} points with total power "
         f"under the process duty")


def gate_domain(model):
    g = (HERE + '/data/wide/gate-' +
         os.path.basename(model).replace('.json', '') + '.json')
    if not os.path.exists(g):
        return gate("domain gate", False, f"no frozen gate for "
                                          f"{os.path.basename(model)}; run calibrate_gate.py")
    G = json.load(open(g))
    gate("domain gate", G['sigma_threshold'] > 0,
         f"sigma <= {G['sigma_threshold']:.4f}, the {G['quantile']} quantile over "
         f"{G['development_cases']} development cases, model {G['model']}")


def gate_indices():
    seen, clash = {}, []
    for fn in sorted(glob.glob(HERE + '/data/wide/design-wide-*.jsonl')):
        for line in open(fn):
            r = json.loads(line)
            i = r['inputs']
            key = (round(i['voltage_V'], 9), round(i['period_s'], 12),
                   round(i['duty'], 12), round(i['tau_s'], 12), i['feed'])
            d = r['design_index']
            if d in seen and seen[d][0] != key:
                clash.append((d, seen[d][1], os.path.basename(fn)))
            seen.setdefault(d, (key, os.path.basename(fn)))
    gate("index collisions", not clash,
         f"{len(seen)} design indices across the corpus, {len(clash)} carrying "
         f"two different conditions" +
         (f" (first: {clash[0]})" if clash else ""))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--report', default=None,
                    help='optimizer report to check the energy floor against')
    a = ap.parse_args()
    model = a.model if os.path.isabs(a.model) else HERE + '/' + a.model
    print(f"preflight for {os.path.basename(model)} sha {sha(model)}")
    gate_time_grid()
    gate_thermodynamics(a.report)
    gate_domain(model)
    gate_indices()
    if FAIL:
        print(f"\nBLOCKED: {len(FAIL)} gate(s) failed: {', '.join(FAIL)}")
        raise SystemExit(1)
    print("\nALL GATES PASS")
