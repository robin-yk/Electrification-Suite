#!/usr/bin/env python3
"""A hot strip in a slow tube: the conduction-dominated, well-mixed bracket.

At 50 sccm in a 17 mm tube the gas moves at 0.37 cm/s cold. Heat and mass
Peclet numbers on the tube radius are then of order 0.03 to 0.2: conduction
and diffusion beat convection. In that limit the gas alongside the strip has
the steady conduction temperature profile between the strip and the quartz
wall, and every species diffuses across the whole gap many times during the
seconds the gas spends beside the strip. The stagnation-flow picture
(boundary_layer_probe.py) is the opposite limit, gas crossing a thin layer
once with a supply tied to its contact time. The device sits somewhere
between, and the two limits bracket it.

This is the mixed limit, as a Lagrangian slab: N zones across the gap, each
held at its conduction temperature, each a constant-pressure reactor with
the mechanism's chemistry, exchanging mass with its neighbours at the rate
Fickian diffusion gives, for the residence time the gas spends beside the
strip. Then the mixed cup. One diffusivity for every species, the methane
one in the diluent at the interface temperature: hydrocarbons in helium are
within a factor of two of it, hydrogen atoms and molecules two to three
times faster, a scoping approximation and stated as one.

The temperature profile is the steady conduction solution with helium's
conductivity rising as T^0.7, so T^1.7 is linear across the gap. The wall
temperature is nowhere in the paper or SI and is an input to scan.

    python3 tools/openmkm_dynamic/transverse_zones.py --mechanism gri30.yaml \\
        --diluent AR --strip-c 1150 1470 --wall-c 500 --residence-s 1 3 \\
        --zones 24 --output out.json
"""
import argparse
import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np

PRESSURE_PA = 1e5
CH4_FRACTION = 0.05
CONDUCTIVITY_EXPONENT = 0.7   # helium, k ~ T^0.7 over 300 to 2000 K


def profile(strip_k, wall_k, y_over_h):
    """Steady conduction temperature at fractional depth y/H."""
    n = 1.0 + CONDUCTIVITY_EXPONENT
    return (strip_k ** n - (strip_k ** n - wall_k ** n) * y_over_h) ** (1.0 / n)


def build(ct, mech, diluent, strip_c, wall_c, gap_m, zones, precondition):
    feed = f"CH4:{CH4_FRACTION}, {diluent}:{1 - CH4_FRACTION}"
    strip_k, wall_k = strip_c + 273.15, wall_c + 273.15
    dy = gap_m / zones
    area = 1e-4                                   # per unit strip area; cancels
    centers = (np.arange(zones) + 0.5) / zones
    faces = np.arange(1, zones) / zones
    t_zone = profile(strip_k, wall_k, centers)
    t_face = profile(strip_k, wall_k, faces)

    # Mass-based reactors with the dense solver by default. The mole-based
    # reactor with Cantera's adaptive preconditioner is faster for a large
    # mechanism but drained a zone to negative density at twelve zones on
    # GRI; the dense path agreed with it where both ran (conversion within
    # 0.02 percentage points to 0.01 s) and is the one trusted here.
    cls = ct.IdealGasConstPressureMoleReactor if precondition else ct.IdealGasConstPressureReactor
    reactors, sols = [], []
    for t in t_zone:
        g = ct.Solution(mech)
        g.TPX = t, PRESSURE_PA, feed
        r = cls(g, energy="off")
        r.volume = area * dy
        reactors.append(r)
        sols.append(g)

    # Diffusive exchange: equal and opposite mass flows between neighbours,
    # rho D A / dy at the interface, so the net flux of species k is
    # mdot (Y_k,i - Y_k,j), Fick's law with one D for every species.
    probe = ct.Solution(mech)
    i_ch4 = probe.species_index("CH4")
    mfcs = []
    for j, t in enumerate(t_face):
        probe.TPX = t, PRESSURE_PA, feed
        mdot = probe.density * probe.mix_diff_coeffs[i_ch4] * area / dy
        mfcs.append(ct.MassFlowController(reactors[j], reactors[j + 1], mdot=mdot))
        mfcs.append(ct.MassFlowController(reactors[j + 1], reactors[j], mdot=mdot))

    net = ct.ReactorNet(reactors)
    if precondition:
        net.preconditioner = ct.AdaptivePreconditioner()
        net.derivative_settings = {"skip-third-bodies": True, "skip-falloff": True}
    return net, reactors, sols, t_zone, probe


def mixed_cup(reactors, probe):
    """Total moles of every species over the slab, as mole fractions."""
    moles = np.zeros(probe.n_species)
    for r in reactors:
        g = r.thermo
        moles += g.X * r.mass / g.mean_molecular_weight
    return moles / moles.sum()


def paper_basis(probe, x):
    n_c = np.array([probe.n_atoms(k, "C") for k in range(probe.n_species)], float)
    is_hc = np.array([probe.n_atoms(k, "C") > 0 and probe.n_atoms(k, "O") == 0
                      for k in range(probe.n_species)])
    i = probe.species_index
    c_tot = float((n_c * x).sum())
    conv = 1.0 - x[i("CH4")] / c_tot
    den = float((n_c * x)[is_hc].sum() - x[i("CH4")])

    def sel(sp):
        if sp not in probe.species_names or den <= 0:
            return None
        return float(n_c[i(sp)] * x[i(sp)] / den)
    return conv, {sp: sel(sp) for sp in ("C2H2", "C2H4", "C2H6", "C6H6", "C4H2")}


def run_case(ct, mech, diluent, strip_c, wall_c, gap_m, zones, residences, precondition):
    net, reactors, sols, t_zone, probe = build(
        ct, mech, diluent, strip_c, wall_c, gap_m, zones, precondition)
    x0 = mixed_cup(reactors, probe)
    out, t0 = [], time.time()
    for tau in sorted(residences):
        net.advance(tau)
        x = mixed_cup(reactors, probe)
        conv, sel = paper_basis(probe, x)
        out.append({"strip_c": strip_c, "wall_c": wall_c, "gap_mm": 1e3 * gap_m,
                    "zones": zones, "residence_s": tau, "x_ch4": float(conv),
                    "s_c2h2": sel["C2H2"], "s_c2h4": sel["C2H4"], "s_c2h6": sel["C2H6"],
                    "s_c6h6": sel["C6H6"], "s_c4h2": sel["C4H2"],
                    "t_zone_min_c": float(t_zone.min() - 273.15),
                    "t_zone_max_c": float(t_zone.max() - 273.15),
                    "wall_s": time.time() - t0})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mechanism", default="gri30.yaml")
    ap.add_argument("--diluent", default="HE")
    ap.add_argument("--strip-c", nargs="+", type=float, default=[1470.0])
    ap.add_argument("--wall-c", nargs="+", type=float, default=[500.0])
    ap.add_argument("--gap-mm", type=float, default=8.5,
                    help="strip face to tube wall, the tube radius")
    ap.add_argument("--zones", type=int, default=24)
    ap.add_argument("--residence-s", nargs="+", type=float, default=[1.0, 3.0])
    ap.add_argument("--preconditioner", action="store_true",
                    help="mole reactors with the adaptive preconditioner; see build()")
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()
    import cantera as ct
    warnings.simplefilter("ignore")
    rows = []
    print(f"# {args.mechanism}  diluent {args.diluent}  gap {args.gap_mm} mm  "
          f"zones {args.zones}")
    print("  T_strip  T_wall  tau(s)    X_CH4   S_C2H2  S_C2H4  S_C6H6  wall(s)")
    for wall_c in args.wall_c:
        for strip_c in args.strip_c:
            rs = run_case(ct, args.mechanism, args.diluent, strip_c, wall_c,
                          args.gap_mm / 1e3, args.zones, args.residence_s,
                          args.preconditioner)
            rows.extend(rs)
            f = lambda v: "   .  " if v is None else f"{100 * v:6.1f}"
            for r in rs:
                print(f"  {strip_c:7.0f} {wall_c:7.0f} {r['residence_s']:7.2f}   "
                      f"{100 * r['x_ch4']:6.2f}   {f(r['s_c2h2'])}  {f(r['s_c2h4'])}  "
                      f"{f(r['s_c6h6'])}   {r['wall_s']:5.0f}")
                sys.stdout.flush()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(
            {"mechanism": args.mechanism, "pressure_Pa": PRESSURE_PA,
             "ch4_fraction": CH4_FRACTION, "diluent": args.diluent,
             "conductivity_exponent": CONDUCTIVITY_EXPONENT, "rows": rows}, indent=1) + "\n")
        print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
