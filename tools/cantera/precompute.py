#!/usr/bin/env python3
"""Precompute detailed-mechanism reference data for the RPH vs CJH visualizer.

Runs Cantera over a fixed temperature grid for each configured mechanism and
writes apps/rphcjh/data/cantera.json, which the visualizer loads to display a
detailed-chemistry cross-check next to its lumped-parameter model. Everything
here is a property of temperature alone (rates at the fresh feed, transport
coefficients, equilibrium state), so the page's own time-averaging machinery
keeps working client-side and no waveform-dependent quantity is baked in.

Usage:
  python tools/cantera/precompute.py                 # regenerate the JSON
  python tools/cantera/precompute.py --check         # verify committed JSON
                                                     # matches a fresh run
"""
import argparse
import datetime
import json
import math
import sys
import warnings
from pathlib import Path

import cantera as ct

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "apps" / "rphcjh" / "data" / "cantera.json"

FEED = "CH4:1, CO2:1"
PRESSURE = ct.one_atm
T_GRID_C = list(range(400, 1401, 20))          # 51 points
EA_FIT_WINDOW_C = (1000, 1400)                 # high-T window for the Ea fit

MECHANISMS = [
    {
        "key": "gri30",
        "name": "GRI-Mech 3.0",
        "file": "gri30.yaml",                  # bundled with Cantera
        "source": "bundled with Cantera",
        "note": "natural-gas combustion mechanism; not validated for "
                "oxygen-free pyrolysis above ~1200 C",
    },
    {
        "key": "aramco20",
        "name": "AramcoMech 2.0",
        "file": str(Path(__file__).resolve().parent / "mechanisms" / "aramco20.yaml"),
        "source": "NUI Galway, converted from CHEMKIN via ck2yaml "
                  "(mirror: github.com/jiweiqi/CollectionOfMechanisms)",
        "note": "C0-C4 mechanism with validated C2 chemistry; closer to the "
                "pyrolysis-relevant pathways than GRI-3.0",
    },
]


def loglog_slope(T_K, values):
    """Least-squares slope of ln(value) vs ln(T): the power-law exponent."""
    xs = [math.log(t) for t in T_K]
    ys = [math.log(v) for v in values]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    return num / den


def arrhenius_ea(T_K, keff):
    """Least-squares slope of ln(keff) vs 1/T, converted to Ea in kJ/mol."""
    xs = [1.0 / t for t in T_K]
    ys = [math.log(k) for k in keff]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    return -(num / den) * ct.gas_constant / 1e6


def compute_mechanism(spec):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")        # Aramco excited-species NASA-poly seams
        gas = ct.Solution(spec["file"], transport_model="mixture-averaged")

    i_ch4 = gas.species_index("CH4")
    keff, eq_x_ch4, eq_conv, d_ch4, lam, mu = [], [], [], [], [], []

    for TC in T_GRID_C:
        TK = TC + 273.15

        # effective first-order rate of CH4 consumption at the fresh feed.
        # From a radical-free feed this is the initiation-limited rate; it is a
        # defined, reproducible metric, not a conversion prediction.
        gas.TPX = TK, PRESSURE, FEED
        rate = -gas.net_production_rates[i_ch4]            # kmol/m3/s
        conc = gas.concentrations[i_ch4]
        keff.append(max(rate / conc, 1e-300))

        d_ch4.append(gas.mix_diff_coeffs[i_ch4])
        lam.append(gas.thermal_conductivity)
        mu.append(gas.viscosity)

        # constant-TP equilibrium of the closed feed. Mass fractions are
        # conserved per unit mass, so conversion is 1 - Y_eq/Y_0 exactly.
        y0 = gas.Y[i_ch4]
        gas.equilibrate("TP")
        eq_x_ch4.append(gas.X[i_ch4])
        eq_conv.append(1.0 - gas.Y[i_ch4] / y0)

    fit_T = [tc + 273.15 for tc in T_GRID_C
             if EA_FIT_WINDOW_C[0] <= tc <= EA_FIT_WINDOW_C[1]]
    fit_k = [k for tc, k in zip(T_GRID_C, keff)
             if EA_FIT_WINDOW_C[0] <= tc <= EA_FIT_WINDOW_C[1]]
    T_K = [tc + 273.15 for tc in T_GRID_C]

    return {
        "name": spec["name"],
        "source": spec["source"],
        "note": spec["note"],
        "n_species": gas.n_species,
        "n_reactions": gas.n_reactions,
        "keff_1_s": keff,
        "eq_ch4_molefrac": eq_x_ch4,
        "eq_ch4_conversion": eq_conv,
        "D_ch4_m2_s": d_ch4,
        "lambda_W_mK": lam,
        "mu_Pa_s": mu,
        "Ea_eff_kJ_mol": arrhenius_ea(fit_T, fit_k),
        "beta_D": loglog_slope(T_K, d_ch4),
        "beta_lambda": loglog_slope(T_K, lam),
        "beta_mu": loglog_slope(T_K, mu),
    }


def build():
    return {
        "generated": datetime.date.today().isoformat(),
        "cantera_version": ct.__version__,
        "feed": FEED,
        "pressure_atm": 1.0,
        "T_grid_C": T_GRID_C,
        "ea_fit_window_C": list(EA_FIT_WINDOW_C),
        "mechanisms": {spec["key"]: compute_mechanism(spec) for spec in MECHANISMS},
    }


def close(a, b, rtol=1e-6):
    if isinstance(a, float) and isinstance(b, float):
        return math.isclose(a, b, rel_tol=rtol, abs_tol=1e-280)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(close(x, y, rtol) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(close(a[k], b[k], rtol) for k in a)
    return a == b


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="recompute and compare against the committed JSON "
                             "instead of overwriting it")
    args = parser.parse_args()

    data = build()

    if args.check:
        committed = json.loads(OUT_PATH.read_text())
        # provenance fields legitimately differ between runs
        for d in (data, committed):
            d.pop("generated", None)
        if close(data, committed):
            print(f"OK: {OUT_PATH} matches a fresh recompute "
                  f"(cantera {ct.__version__})")
            return 0
        print(f"MISMATCH: {OUT_PATH} differs from a fresh recompute. "
              f"Re-run tools/cantera/precompute.py and commit the result.")
        return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} kB, "
          f"cantera {ct.__version__})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
