#!/usr/bin/env python3
"""A hot strip in cold gas, as a stagnation-flow boundary layer.

Every case in this repository put the reacting gas at the element's
temperature, in a CSTR or the plug-flow limit. The steady CJH points of the
paper's Figure 2 falsify that (cjh_inversion.py): at the residence time that
gives the measured conversion no single-temperature state carries the
measured ethylene alongside its acetylene, because ethylene is a low-severity
product and acetylene a high-severity one. Their coexistence means the gas
reacts over a range of temperatures at once, which is what a thermal boundary
layer on a hot strip in a cold tube is.

Cantera's one-dimensional stagnation solver is the cheapest model of that
class that already exists and is verified: a cold feed flows toward a plate
held at the strip temperature, heats through the boundary layer, reacts where
it is hot, and leaves radially. Transport is mixture-averaged from the
mechanism's own data. The geometry is not the device's (the device is flow
along the strip, not onto it), so the inlet velocity is an effective
parameter standing in for contact time, one number per case; the plate
temperature is the calibrated element temperature.

The outlet composition is the mixed-cup average across the gap, weighted by
the radial outflow rho * V, where V is the spread rate v_r / r. Conversion and
selectivity are on the paper's basis: hydrocarbon carbon, CH4 excluded from
the denominator, CO not in it.

The inlet temperature is the far boundary of the thermal layer. Room
temperature is the cold-tube limit. The quartz wall the strip actually faces
is radiatively heated and sits hundreds of degrees above ambient; in the
device the gas between strip and wall is conduction-dominated (Peclet number
on the tube radius about 0.03), so a hot inlet stands in for the heated wall
and --inlet-c sets it. That temperature is not measured anywhere in the
paper or SI and any value given here is an assumption to be scanned.

    python3 tools/openmkm_dynamic/boundary_layer_probe.py \\
        --mechanism gri30.yaml --diluent AR --plate-c 1470 \\
        --velocity-cm-s 0.4 1 2 5 10 --output out.json
"""
import argparse
import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np

PRESSURE_PA = 1e5
INLET_T_K = 300.0
CH4_FRACTION = 0.05


def solve_one(ct, mech, diluent, plate_c, u_in_m_s, width_m, inlet_t_k=INLET_T_K):
    gas = ct.Solution(mech)
    feed = f"CH4:{CH4_FRACTION}, {diluent}:{1 - CH4_FRACTION}"
    # u is the superficial velocity the same mass flow has at 300 K, the
    # sccm-based number, whatever temperature the gas enters at. Cases at
    # different inlet temperatures then carry the same mass flow.
    gas.TPX = INLET_T_K, PRESSURE_PA, feed
    mdot = gas.density * u_in_m_s
    gas.TPX = inlet_t_k, PRESSURE_PA, feed
    sim = ct.ImpingingJet(gas=gas, width=width_m)
    sim.inlet.mdot = mdot
    sim.inlet.T = inlet_t_k
    sim.inlet.X = feed
    sim.surface.T = plate_c + 273.15
    sim.set_initial_guess(products="inlet")
    sim.set_refine_criteria(ratio=3.0, slope=0.1, curve=0.2, prune=0.05)
    sim.transport_model = "mixture-averaged"
    t0 = time.time()
    sim.solve(loglevel=0, auto=True)
    wall = time.time() - t0

    w = sim.density * sim.spread_rate
    y_out = (sim.Y * w).sum(axis=1) / w.sum()
    gas.TPY = INLET_T_K, PRESSURE_PA, y_out
    x = gas.X
    n_c = np.array([gas.n_atoms(k, "C") for k in range(gas.n_species)], float)
    is_hc = np.array([gas.n_atoms(k, "C") > 0 and gas.n_atoms(k, "O") == 0
                      for k in range(gas.n_species)])
    i = gas.species_index
    c_tot = float((n_c * x).sum())
    conv = 1.0 - x[i("CH4")] / c_tot
    den = float((n_c * x)[is_hc].sum() - x[i("CH4")])

    def sel(sp):
        if sp not in gas.species_names or den <= 0:
            return None
        return float(n_c[i(sp)] * x[i(sp)] / den)

    hot = sim.grid[sim.T > sim.surface.T - 300.0]
    return {"plate_c": plate_c, "u_in_cm_s": 100 * u_in_m_s, "width_mm": 1e3 * width_m,
            "inlet_c": inlet_t_k - 273.15, "mdot_kg_m2_s": float(mdot),
            "diluent": diluent, "x_ch4": float(conv),
            "s_c2h2": sel("C2H2"), "s_c2h4": sel("C2H4"), "s_c2h6": sel("C2H6"),
            "s_c6h6": sel("C6H6"), "s_c4h2": sel("C4H2"),
            "hot_layer_mm": float(1e3 * (hot.max() - hot.min())) if len(hot) else 0.0,
            "grid_points": int(len(sim.grid)), "wall_s": wall}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mechanism", default="gri30.yaml")
    ap.add_argument("--diluent", default="HE")
    ap.add_argument("--plate-c", nargs="+", type=float, default=[1470.0])
    ap.add_argument("--velocity-cm-s", nargs="+", type=float, default=[0.4, 1.0, 2.0, 5.0])
    ap.add_argument("--width-mm", type=float, default=4.5,
                    help="strip face to tube wall: (17 mm ID - 8 mm strip) / 2")
    ap.add_argument("--inlet-c", type=float, default=INLET_T_K - 273.15,
                    help="far-boundary gas temperature; room temperature is the "
                         "cold-tube limit, a hotter value stands in for the "
                         "radiatively heated quartz wall")
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()
    import cantera as ct
    warnings.simplefilter("ignore")
    rows = []
    inlet_t_k = args.inlet_c + 273.15
    print(f"# {args.mechanism}  diluent {args.diluent}  gap {args.width_mm} mm  "
          f"inlet {args.inlet_c:.0f} C")
    print("  T_plate  u(cm/s)    X_CH4   S_C2H2  S_C2H4  S_C6H6  hot(mm)  wall(s)")
    for t_c in args.plate_c:
        for u in args.velocity_cm_s:
            r = solve_one(ct, args.mechanism, args.diluent, t_c, u / 100.0,
                          args.width_mm / 1e3, inlet_t_k)
            rows.append(r)
            f = lambda v: "   .  " if v is None else f"{100 * v:6.1f}"
            print(f"  {t_c:7.0f} {u:8.2f}   {100 * r['x_ch4']:6.2f}   {f(r['s_c2h2'])}  "
                  f"{f(r['s_c2h4'])}  {f(r['s_c6h6'])}   {r['hot_layer_mm']:5.2f}   {r['wall_s']:5.0f}")
            sys.stdout.flush()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(
            {"mechanism": args.mechanism, "pressure_Pa": PRESSURE_PA, "inlet_T_K": inlet_t_k,
             "ch4_fraction": CH4_FRACTION, "rows": rows}, indent=1) + "\n")
        print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
