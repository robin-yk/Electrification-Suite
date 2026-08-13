#!/usr/bin/env python3
"""Steady-PFR element-temperature sweep with OpenMKM for the RPH vs CJH tab.

Runs the Vlachos-group OpenMKM reactor code (gas phase only, GRI-Mech 3.0)
through a sweep of heater-element temperatures. Each run is a steady
plug-flow reactor whose axial temperature profile mirrors the visualizer's
animation: cold feed in, ramp into the Joule-heated plateau, quench, exit.
The outlet state of every run goes into apps/rphcjh/data/openmkm-pfr.json.

Why a steady sweep covers *pulsed* heating: the hot-zone residence time here
is milliseconds while RPH pulse periods are ~1 s, so the reactor is
quasi-steady at every instant of the pulse. A two-state pulse's time-averaged
output is then just the duty-weighted blend of the steady outputs at T_peak
and T_min - which the page computes client-side from this table, keeping the
sliders interactive.

Usage:
  python tools/openmkm/run_sweep.py --omkm <path/to/omkm> \
      [--cantera-lib <path/to/cantera-install/lib>] [--check]
"""
import argparse
import datetime
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "apps" / "rphcjh" / "data" / "openmkm-pfr.json"
MECH = Path(__file__).resolve().parent / "mechanisms" / "gri30-ct25.yaml"

T_GRID_C = list(range(400, 1401, 50))          # element plateau, 21 runs
SPECIES = ["CH4", "CO2", "CO", "H2", "H2O", "C2H2", "C2H4", "C2H6"]
MW = {"CH4": 16.043, "CO2": 44.009, "CO": 28.010, "H2": 2.016,
      "H2O": 18.015, "C2H2": 26.038, "C2H4": 28.054, "C2H6": 30.070}
CARBONS = {"C2H2": 2, "C2H4": 2, "C2H6": 2}

REACTOR_YAML = """\
reactor:
    type: "pfr"
    area: "1.0 cm2"
    length: "6 cm"
    mode: "tprofile"
    temperature: 673
    TProfile:
        "0 cm": 673
        "0.5 cm": 673
        "2 cm": {T_K}
        "3.5 cm": {T_K}
        "5 cm": 773
        "6 cm": 673
    pressure: "1 atm"

inlet_gas:
    flow_rate: "50 cm3/s"

simulation:
    end_time: 50
    solver:
        atol: 1e-10
        rtol: 1e-8
    transient: no

phases:
    gas:
        name: gri30
        initial_state: "CH4:1,CO2:1"
"""


def read_first_last_rows(path):
    lines = [l for l in path.read_text().splitlines()
             if l.strip() and not l.startswith("#")]
    header = lines[0].split()
    return dict(zip(header, lines[1].split())), dict(zip(header, lines[-1].split()))


def run_case(omkm, env, T_C):
    T_K = T_C + 273.15
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        (td / "pfr.yaml").write_text(REACTOR_YAML.format(T_K=f"{T_K:.2f}"))
        shutil.copy(MECH, td / "gri30.yaml")
        subprocess.run([str(omkm), "pfr.yaml", "gri30.yaml"], cwd=td, env=env,
                       check=True, capture_output=True, timeout=600)
        _, mole = read_first_last_rows(td / "gas_mole_ss.dat")
        mass_in, mass = read_first_last_rows(td / "gas_mass_ss.dat")

    x_out = {sp: float(mole[sp]) for sp in SPECIES}
    # mass fractions are conserved per unit mass through the mole-number
    # change, so CH4 conversion is exact on this basis
    y0 = float(mass_in["CH4"])
    conv = 1.0 - float(mass["CH4"]) / y0
    # carbon-basis C2 selectivity from mass fractions
    conv_moles = (y0 - float(mass["CH4"])) / MW["CH4"]
    c2_carbon = sum(float(mass[sp]) / MW[sp] * n for sp, n in CARBONS.items())
    sel = c2_carbon / conv_moles if conv_moles > 1e-12 else 0.0
    return {
        "outlet_molefrac": x_out,
        "ch4_conversion": max(conv, 0.0),
        "c2_selectivity_carbon": min(max(sel, 0.0), 1.0),
    }


def build(omkm, cantera_lib):
    env = dict(os.environ)
    if cantera_lib:
        env["LD_LIBRARY_PATH"] = cantera_lib
    cases = []
    for T_C in T_GRID_C:
        r = run_case(omkm, env, T_C)
        r["element_T_C"] = T_C
        cases.append(r)
        print(f"  {T_C:5d} C  X_CH4 = {r['ch4_conversion']:.4f}  "
              f"S_C2 = {r['c2_selectivity_carbon']:.3f}")
    return {
        "generated": datetime.date.today().isoformat(),
        "engine": "OpenMKM (steady 1-D PFR, gas phase only)",
        "mechanism": "GRI-Mech 3.0",
        "feed": "CH4:1, CO2:1",
        "pressure_atm": 1.0,
        "geometry": {
            "area_cm2": 1.0, "length_cm": 6.0,
            "plateau_cm": [2.0, 3.5], "flow_cm3_s": 50.0,
            "inlet_T_K": 673.0,
        },
        "quasi_steady_note": "hot-zone residence is milliseconds versus ~1 s "
                             "pulse periods, so pulsed operation is the "
                             "duty-weighted blend of these steady states",
        "species": SPECIES,
        "cases": cases,
    }


def close(a, b, rtol=1e-5):
    if isinstance(a, float) and isinstance(b, float):
        return math.isclose(a, b, rel_tol=rtol, abs_tol=1e-12)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(close(x, y, rtol) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(close(a[k], b[k], rtol) for k in a)
    return a == b


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--omkm", required=True, help="path to the omkm binary")
    parser.add_argument("--cantera-lib", default="",
                        help="LD_LIBRARY_PATH entry for the fork's libcantera")
    parser.add_argument("--check", action="store_true",
                        help="recompute and compare against the committed JSON")
    args = parser.parse_args()

    data = build(Path(args.omkm), args.cantera_lib)

    if args.check:
        committed = json.loads(OUT_PATH.read_text())
        for d in (data, committed):
            d.pop("generated", None)
        if close(data, committed):
            print(f"OK: {OUT_PATH} matches a fresh recompute")
            return 0
        print(f"MISMATCH: {OUT_PATH} differs from a fresh recompute. "
              f"Re-run tools/openmkm/run_sweep.py and commit the result.")
        return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} kB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
