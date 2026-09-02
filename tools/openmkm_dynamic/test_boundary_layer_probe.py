#!/usr/bin/env python3
"""Checks on boundary_layer_probe.py that a small mechanism can run quickly.

GRI-Mech 3.0 with argon; each stagnation solve takes a few seconds. These are
plumbing checks, not physics: that the mass flow follows the sccm definition
whatever the inlet temperature, that the far-boundary temperature is honoured
and moves conversion the right way, and that the mixed-cup bookkeeping closes.

    python3 tools/openmkm_dynamic/test_boundary_layer_probe.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import boundary_layer_probe as bl  # noqa: E402


def main():
    import cantera as ct
    import warnings
    warnings.simplefilter("ignore")
    fails = []

    def check(name, ok, detail=""):
        print(f"  {'ok  ' if ok else 'FAIL'} {name}  {detail}")
        if not ok:
            fails.append(name)

    cold = bl.solve_one(ct, "gri30.yaml", "AR", 1400.0, 0.01, 4.5e-3)
    hot = bl.solve_one(ct, "gri30.yaml", "AR", 1400.0, 0.01, 4.5e-3, inlet_t_k=773.15)

    check("inlet temperature recorded", abs(hot["inlet_c"] - 500.0) < 1e-6
          and abs(cold["inlet_c"] - 26.85) < 1e-6,
          f"{cold['inlet_c']:.2f} / {hot['inlet_c']:.2f} C")
    check("hotter far boundary raises conversion", hot["x_ch4"] > cold["x_ch4"],
          f"X {100 * cold['x_ch4']:.2f} -> {100 * hot['x_ch4']:.2f} %")
    check("hotter far boundary thickens the hot layer",
          hot["hot_layer_mm"] >= cold["hot_layer_mm"],
          f"{cold['hot_layer_mm']:.2f} -> {hot['hot_layer_mm']:.2f} mm")
    check("selectivities sum below one",
          all(r["s_c2h2"] + r["s_c2h4"] + r["s_c2h6"] <= 1.0 + 1e-9 for r in (cold, hot)),
          f"{cold['s_c2h2'] + cold['s_c2h4'] + cold['s_c2h6']:.3f}")
    check("conversion between zero and one",
          all(0.0 < r["x_ch4"] < 1.0 for r in (cold, hot)))

    # The mass flow is the sccm one regardless of inlet temperature: at the
    # same u the two cases must have been given the same inlet mdot, and it
    # must be the 300 K density times u.
    gas = ct.Solution("gri30.yaml")
    gas.TPX = bl.INLET_T_K, bl.PRESSURE_PA, "CH4:0.05, AR:0.95"
    want = gas.density * 0.01
    check("sccm mass flow independent of inlet temperature",
          abs(cold["mdot_kg_m2_s"] - want) < 1e-12
          and abs(hot["mdot_kg_m2_s"] - want) < 1e-12,
          f"{cold['mdot_kg_m2_s']:.4e} / {hot['mdot_kg_m2_s']:.4e} kg/m2/s")

    faster = bl.solve_one(ct, "gri30.yaml", "AR", 1400.0, 0.02, 4.5e-3)
    check("doubling the velocity lowers conversion", faster["x_ch4"] < cold["x_ch4"],
          f"X {100 * cold['x_ch4']:.2f} -> {100 * faster['x_ch4']:.2f} %")

    print(f"\n{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
