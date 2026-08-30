#!/usr/bin/env python3
"""Does the mechanism reproduce the published RPH benzene suppression?

The RPH-versus-CJH story in Kwak et al., ACS Energy Lett. 2025, 10, 6188 rests
on one measured quantity: S_C6H6 against CH4 conversion (Figure 2d, Figure 3a).
Pulsing is reported to hold benzene under 5 percent while continuous heating
climbs past 20 percent conversion, and the climb coincides with a drop in
S_C2H2, which is read as a C2H2 to C6H6 route.

GRI-Mech 3.0 cannot represent that route: it has no C6H6, no C4, no aromatics
at all. The kinetic modelling in the paper used GRI-Mech, so the premise has
never been tested by a mechanism able to express it. This probe runs the same
comparison on a mechanism that can.

Two modes:

  sweep       steady CJH baselines, CSTR and the plug-flow limit, over a
              temperature and residence-time grid, optionally with CO2 co-feed
  summarize   read pulsed cases produced by run_cstr_case.py and tabulate them
              against the steady baselines

Conversion and selectivity are taken from moles per kg (Y_i / W_i), not from
mole fractions. This is a constant-pressure system and methane coupling raises
the total mole count, so a mole-fraction basis would report dilution as
conversion.

Selectivity follows the paper's definition, SI page S6:

    S_CxHy = ([CxHy] * x) / (sum_i [CiHj] * i) * 100

The denominator sums carbon over hydrocarbons only. CO is not in it. That
matters more than it looks: on a denominator of carbon converted from CH4,
which does include CO, adding CO2 appears to destroy a quarter of the
acetylene selectivity, and on the paper's denominator the same results move
by about two points. The first reading is an artefact of the denominator.
Both are reported here, `s_c2h2` on the paper's basis and `s_c2h2_conv` on the
CH4-converted basis, so the difference stays visible instead of being a
silent convention.
"""
import argparse
import json
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

PRESSURE_PA = 1e5                 # 1 bar, as stated in the paper's captions
FEEDS = {
    # Figure 2: methane only. Figure 3: the 1:1 CH4/CO2 mixture. Both are
    # heavily diluted in helium at Q = 50 sccm, which is the carrier the
    # transient design box dropped when it moved to a CH4/CO2 binary.
    "ch4": "CH4:0.05, HE:0.95",
    "ch4co2": "CH4:0.05, CO2:0.05, HE:0.90",
}
TRACKED = ("CH4", "CO2", "CO", "H2", "H2O", "C2H2", "C2H4", "C2H6", "C6H6")


def hydrocarbon_mask(gas):
    """The CiHj set the paper's selectivity denominator sums over: carries
    carbon, carries no oxygen. CH4 is excluded at the point of use, being the
    reactant rather than a product."""
    return [gas.n_atoms(i, "C") > 0 and gas.n_atoms(i, "O") == 0
            for i in range(gas.n_species)]


def _basis(gas, n_atom, idx, n_in, Y_out, X_out, is_hc):
    """Conversion and both selectivity bases from one outlet state."""
    n = Y_out / gas.molecular_weights
    d_ch4 = n_in[idx["CH4"]] - n[idx["CH4"]]
    conv = (lambda sp: float(n_atom[idx[sp]] * n[idx[sp]] / d_ch4)
            if d_ch4 > 1e-14 else (lambda sp: 0.0))
    hc_carbon = sum(n_atom[i] * n[i] for i in range(gas.n_species)
                    if is_hc[i] and i != idx["CH4"])
    sel = (lambda sp: float(n_atom[idx[sp]] * n[idx[sp]] / hc_carbon)
           if hc_carbon > 1e-20 else (lambda sp: 0.0))
    c2 = sel("C2H2") + sel("C2H4") + sel("C2H6")
    co2_in = n_in[idx["CO2"]]
    return {
        "x_ch4": float(d_ch4 / n_in[idx["CH4"]]),
        "s_c2h2": sel("C2H2"), "s_c2h4": sel("C2H4"), "s_c6h6": sel("C6H6"),
        "s_c2h2_conv": conv("C2H2"), "s_co_conv": conv("CO"),
        # the Figure S5 metric: acetylene share of the C2 pool
        "c2h2_of_c2": sel("C2H2") / c2 if c2 > 0 else 0.0,
        "x_co2": (float((co2_in - n[idx["CO2"]]) / co2_in)
                  if co2_in > 1e-14 else None),
        "x_h2": float(X_out[idx["H2"]]), "x_h2o": float(X_out[idx["H2O"]]),
    }


def steady(ct, gas, mech, feed, t_c, tau, kind):
    """One steady solve. kind is 'cstr' or 'pfr'.

    The plug-flow limit is a Lagrangian fluid element at constant pressure and
    prescribed temperature, integrated for the residence time. It matters here:
    a CSTR holds the whole charge at the outlet conversion, which is exactly
    the state that makes benzene, so the reactor idealisation is not neutral
    for the quantity under test.
    """
    n_atom = [gas.n_atoms(i, "C") for i in range(gas.n_species)]
    is_hc = hydrocarbon_mask(gas)
    idx = {s: gas.species_index(s) for s in TRACKED}
    gas.TPX = t_c + 273.15, PRESSURE_PA, feed
    n_in = gas.Y / gas.molecular_weights
    if kind == "cstr":
        r = ct.IdealGasReactor(gas, energy="off")
        f = ct.Solution(mech)
        f.TPX = t_c + 273.15, PRESSURE_PA, feed
        mdot = r.mass / tau
        ct.MassFlowController(ct.Reservoir(f), r, mdot=mdot)
        ct.MassFlowController(r, ct.Reservoir(f), mdot=mdot)
        ct.ReactorNet([r]).advance(60 * tau)     # 60 space times to steady
    else:
        r = ct.IdealGasConstPressureReactor(gas, energy="off")
        ct.ReactorNet([r]).advance(tau)
    import numpy as np
    return _basis(gas, np.asarray(n_atom, float), idx, n_in,
                  r.thermo.Y, r.thermo.X, is_hc)


def audit_basis(case, mechanism=None):
    """Same quantities, read from a run_cstr_case.py schema-2 result.

    species_out_kmol is the whole-mechanism cycle outflow, so the hydrocarbon
    denominator can be summed over the real species set rather than over a
    chosen shortlist. That needs the mechanism loaded to know which species
    carry oxygen; without it, only the CH4-converted basis is available.
    """
    audit = case.get("carbon_audit")
    if audit is None or "species_out_kmol" not in audit:
        raise SystemExit(f"{case.get('mechanism')}: schema-1 result, no "
                         "carbon_audit; rerun with the current solver")
    n = audit["species_out_kmol"]
    has_co2 = "CO2" in case["inputs"]["feed"]
    # The feed is CH4 alone or CH4 and CO2 at 1:1, so carbon in splits evenly.
    ch4_in = audit["carbon_in_kmol"] / (2.0 if has_co2 else 1.0)
    d_ch4 = ch4_in - n.get("CH4", 0.0)
    conv = lambda sp, k: k * n.get(sp, 0.0) / d_ch4 if d_ch4 > 0 else 0.0

    import cantera as ct
    import warnings
    warnings.simplefilter("ignore")
    gas = ct.Solution(mechanism or case["mechanism"])
    is_hc = hydrocarbon_mask(gas)
    hc_carbon = sum(gas.n_atoms(gas.species_index(sp), "C") * v
                    for sp, v in n.items()
                    if sp != "CH4" and is_hc[gas.species_index(sp)])
    sel = (lambda sp, k: k * n.get(sp, 0.0) / hc_carbon
           if hc_carbon > 1e-20 else lambda sp, k: 0.0)
    c2 = sel("C2H2", 2) + sel("C2H4", 2) + sel("C2H6", 2)
    total = sum(n.values())
    return {
        "x_ch4": d_ch4 / ch4_in,
        "s_c2h2": sel("C2H2", 2), "s_c2h4": sel("C2H4", 2),
        "s_c6h6": sel("C6H6", 6),
        "s_c2h2_conv": conv("C2H2", 2), "s_co_conv": conv("CO", 1),
        "c2h2_of_c2": sel("C2H2", 2) / c2 if c2 > 0 else 0.0,
        "x_co2": ((ch4_in - n.get("CO2", 0.0)) / ch4_in) if has_co2 else None,
        "x_h2": n.get("H2", 0.0) / total, "x_h2o": n.get("H2O", 0.0) / total,
    }


HEAD = (f"{'T_C':>6}{'tau_s':>7}  {'feed':<8}{'X_CH4':>8}{'S_C2H2':>8}"
        f"{'S_C2H4':>8}{'S_C6H6':>8}{'C2H2/C2':>9}{'|conv:':>7}"
        f"{'S_C2H2':>8}{'S_CO':>7}{'|':>2}{'X_CO2':>7}{'x_H2':>8}{'x_H2O':>8}")


def line(t_c, tau, label, r):
    """Columns left of 'conv:' are the paper's hydrocarbon basis; the two to
    its right are the CH4-converted basis, which includes CO."""
    xco2 = "     ." if r["x_co2"] is None else f"{100 * r['x_co2']:6.1f}%"
    return (f"{t_c:6.0f}{tau:7.2f}  {label:<8}{100 * r['x_ch4']:7.2f}%"
            f"{100 * r['s_c2h2']:7.2f}%{100 * r['s_c2h4']:7.2f}%"
            f"{100 * r['s_c6h6']:7.2f}%{100 * r['c2h2_of_c2']:8.2f}%{'':>7}"
            f"{100 * r['s_c2h2_conv']:7.2f}%{100 * r['s_co_conv']:6.1f}%{'':>2}"
            f"{xco2}{100 * r['x_h2']:7.3f}%{100 * r['x_h2o']:7.3f}%")


def cmd_sweep(args):
    import cantera as ct
    warnings.simplefilter("ignore")
    gas = ct.Solution(args.mechanism)
    print(f"# {args.mechanism}  {gas.n_species} species  "
          f"{gas.n_reactions} reactions   kind={args.kind}")
    rows = []
    print(HEAD)
    for tau in args.tau:
        for t_c in args.temperature:
            for label in args.feed:
                r = steady(ct, gas, args.mechanism, FEEDS[label],
                           t_c, tau, args.kind)
                rows.append(dict(t_c=t_c, tau_s=tau, feed=label,
                                 kind=args.kind, **r))
                print(line(t_c, tau, label, r))
                sys.stdout.flush()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(
            {"mechanism": args.mechanism, "pressure_Pa": PRESSURE_PA,
             "feeds": FEEDS, "kind": args.kind, "rows": rows}, indent=1) + "\n")
        print(f"\nwrote {args.output}")


def cmd_summarize(args):
    cases = []
    for path in sorted(args.cases):
        case = json.loads(path.read_text())
        label = "ch4co2" if "CO2" in case["inputs"]["feed"] else "ch4"
        cases.append((case["inputs"]["t_peak_K"] - 273.15,
                      case["inputs"]["tau_s"], label, case,
                      audit_basis(case, args.mechanism)))
    print(HEAD)
    for t_pk, tau, label, case, r in sorted(cases, key=lambda c: (c[0], c[1])):
        print(line(t_pk, tau, label, r))
    print("\n# T_C is the pulse peak. Closure of the last converged cycle:")
    for t_pk, tau, label, case, _ in sorted(cases, key=lambda c: (c[0], c[1])):
        el = case["carbon_audit"]["elements"]
        # Recomputed from residual_kmol and in_kmol rather than read from
        # residual_fraction_of_in. Results written before that field learned
        # to say "not fed" carry a ratio of two rounding-level numbers in the
        # oxygen column of every methane-only case, which reads as a gross
        # imbalance and is not one.
        rel = ", ".join(
            ("n/a" if el[e]["in_kmol"] <= 1e-20
             else f"{el[e]['residual_kmol'] / el[e]['in_kmol']:+.1e}")
            for e in ("C", "H", "O"))
        print(f"  peak {t_pk:.0f} C tau {tau:.2f} s {label:<8} "
              f"converged={case['cycle_summary']['converged']} "
              f"C/H/O residual/in = {rel}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sweep", help="steady CJH baselines")
    s.add_argument("--mechanism",
                   default=str(Path(__file__).resolve().parents[1]
                               / "cantera" / "mechanisms" / "aramco20.yaml"))
    s.add_argument("--kind", choices=("cstr", "pfr"), default="cstr")
    s.add_argument("--feed", nargs="+", choices=sorted(FEEDS),
                   default=["ch4", "ch4co2"])
    s.add_argument("--temperature", nargs="+", type=float,
                   default=[1200, 1300, 1400, 1500])
    s.add_argument("--tau", nargs="+", type=float, default=[0.05, 0.2, 1.0])
    s.add_argument("--output", type=Path)
    s.set_defaults(func=cmd_sweep)

    m = sub.add_parser("summarize", help="tabulate pulsed cases")
    m.add_argument("cases", nargs="+", type=Path)
    m.add_argument("--mechanism", help="override the path recorded in the "
                   "results, for reading them on another machine")
    m.set_defaults(func=cmd_summarize)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
