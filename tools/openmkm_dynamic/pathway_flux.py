#!/usr/bin/env python3
"""Carbon flux between species lumps, pulsed against steady at equal conversion.

The C2 pulse study (`run_pulse_c2.py`, `docs/C2-PULSE.md`) reports where the
carbon ends up. This asks how it got there: for every reaction, the carbon
moved from each reactant to each product is charged to a species-to-species
edge, integrated over one converged cycle of the pulsed case and over unit
time for the steady CSTR solved at the same conversion. Edges are then summed
into a dozen lumps (CH4, CHx, C2H6, C2H4, C2H2, C3, C4H2, other C4, C5, C6H6,
polyynes, other C6, C7+) and written as percent of the carbon fed as
methane, so the two diagrams share a scale, and so do plates for feeds with
and without CO2.

Element-flux convention, the same one Cantera's ReactionPathDiagram uses: a
reaction with net rate q moves q nu_i nC_i carbon out of reactant i and
splits it among products in proportion to nu_j nC_j. Reversible reactions
running backwards are charged the other way.

The pulsed case is re-integrated here rather than read from its file because
the case files keep only the outflow, not the rates. Three cycles from the
feed are enough: the reactor is flushed five times per period, so the state
at a cycle boundary is within one percent of the converged one, and the
conversion of the last cycle is printed against the file's value as the
check.

    python3 pathway_flux.py --case data/c2pulse/anchor-siop-1s-d0.05.json \
        --output data/c2pulse/pathway-anchor.json
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_cstr_case as rc                                    # noqa: E402

PRESSURE_PA = 101325.0
LUMP_ORDER = ["CH4", "CHx", "COx", "C2H6", "C2H4", "C2H2", "C3", "C4H2", "C4",
              "C5", "C6H6", "polyyne", "C6", "C7+"]


def lump_of(name, n_c):
    if n_c == 0:
        return None
    if name == "CH4":
        return "CH4"
    if n_c == 1:
        # CO2 and CO carry one carbon each; on the CH4/CO2 feed they are
        # the feed and its reforming product, not methane fragments.
        return "COx" if "O" in name else "CHx"
    if n_c == 2:
        if name in ("C2H6", "C2H5"):
            return "C2H6"
        if name in ("C2H4", "C2H3"):
            return "C2H4"
        return "C2H2"
    if n_c == 3:
        return "C3"
    if n_c == 4:
        return "C4H2" if name in ("C4H2", "C4H3-I", "C4H3-N", "C4H") else "C4"
    if n_c == 5:
        return "C5"
    if n_c == 6:
        if name in ("C6H6", "C6H5"):
            return "C6H6"
        if name in ("C6H2", "C6H3", "C6H"):
            return "polyyne"
        return "C6"
    return "C7+"


class FluxAccumulator:
    """Integrates net rates of progress, split by sign, in kmol per reaction."""

    def __init__(self, gas):
        self.gas = gas
        n_c = np.array([gas.n_atoms(i, "C") for i in range(gas.n_species)], float)
        nu_r = np.asarray(gas.reactant_stoich_coeffs, float)   # species x rxn
        nu_p = np.asarray(gas.product_stoich_coeffs, float)
        self.a = nu_r * n_c[:, None]      # carbon leaving each reactant, forward
        self.b = nu_p * n_c[:, None]      # carbon entering each product, forward
        self.q_fwd = np.zeros(gas.n_reactions)
        self.q_rev = np.zeros(gas.n_reactions)
        self.n_c = n_c
        self.lumps = [lump_of(gas.species_name(i), int(n_c[i]))
                      for i in range(gas.n_species)]

    def add(self, kinetics, volume_m3, dt_s):
        q = np.asarray(kinetics.net_rates_of_progress) * volume_m3 * dt_s
        self.q_fwd += np.maximum(q, 0.0)
        self.q_rev += np.maximum(-q, 0.0)

    def edges(self, carbon_fed_kmol):
        """Lump-to-lump carbon flux as percent of carbon fed."""
        n_l = len(LUMP_ORDER)
        idx = {l: k for k, l in enumerate(LUMP_ORDER)}
        F = np.zeros((n_l, n_l))
        # forward: a -> b ; reverse: b -> a
        for q, src, dst in ((self.q_fwd, self.a, self.b), (self.q_rev, self.b, self.a)):
            tot = dst.sum(axis=0)
            live = np.nonzero((q > 0) & (tot > 0))[0]
            for k in live:
                share = dst[:, k] / tot[k]
                s_i = np.nonzero(src[:, k])[0]
                d_j = np.nonzero(share)[0]
                for i in s_i:
                    li = self.lumps[i]
                    if li is None:
                        continue
                    for j in d_j:
                        lj = self.lumps[j]
                        if lj is None or lj == li:
                            continue
                        F[idx[li], idx[lj]] += q[k] * src[i, k] * share[j]
        F *= 100.0 / carbon_fed_kmol
        return {f"{LUMP_ORDER[i]}->{LUMP_ORDER[j]}": float(F[i, j])
                for i in range(n_l) for j in range(n_l) if F[i, j] > 0}

    def outflow_lumps(self, w_kmol_by_species):
        out = {l: 0.0 for l in LUMP_ORDER}
        for i, l in enumerate(self.lumps):
            if l is not None:
                out[l] += w_kmol_by_species[i] * self.n_c[i]
        return out


def methane_carbon(gas, n_feed):
    """Carbon fed as methane, the basis of every percentage written here.

    On the CH4/CO2 feed half the fed carbon is CO2, which barely reacts at
    these temperatures; normalising on methane carbon keeps a plate for that
    feed on the same scale as one for methane in helium.
    """
    return float(n_feed[gas.species_index("CH4")])


def steady_fluxes(ct, mech, feed, t_c, tau):
    gas = ct.Solution(mech)
    gas.TPX = t_c + 273.15, PRESSURE_PA, feed
    r = ct.IdealGasReactor(gas, energy="off", clone=False)
    f = ct.Solution(mech)
    f.TPX = t_c + 273.15, PRESSURE_PA, feed
    mdot = r.mass / tau
    ct.MassFlowController(ct.Reservoir(f), r, mdot=mdot)
    ct.MassFlowController(r, ct.Reservoir(f), mdot=mdot)
    ct.ReactorNet([r]).advance(60 * tau)
    acc = FluxAccumulator(gas)
    acc.add(r.kinetics, r.volume, 1.0)                       # per second
    mw = np.asarray(gas.molecular_weights)
    n_feed = mdot * np.asarray(f.Y) / mw                     # kmol/s per species
    n_out = mdot * np.asarray(r.phase.Y) / mw
    carbon_fed = methane_carbon(gas, n_feed)
    x = 1.0 - n_out[gas.species_index("CH4")] / n_feed[gas.species_index("CH4")]
    out = acc.outflow_lumps(n_out)
    return {"t_c": t_c, "tau_s": tau, "x_ch4": float(x),
            "edges_pct_fed": acc.edges(carbon_fed),
            "outflow_pct_fed": {l: 100 * v / carbon_fed for l, v in out.items()}}


def steady_at_conversion(ct, mech, feed, tau, x_target, lo=1100.0, hi=1350.0):
    for _ in range(14):
        mid = 0.5 * (lo + hi)
        gas = ct.Solution(mech)
        gas.TPX = mid + 273.15, PRESSURE_PA, feed
        r = ct.IdealGasReactor(gas, energy="off", clone=False)
        f = ct.Solution(mech)
        f.TPX = mid + 273.15, PRESSURE_PA, feed
        mdot = r.mass / tau
        ct.MassFlowController(ct.Reservoir(f), r, mdot=mdot)
        ct.MassFlowController(r, ct.Reservoir(f), mdot=mdot)
        ct.ReactorNet([r]).advance(60 * tau)
        i = gas.species_index("CH4")
        x = 1.0 - r.phase.X[i] / f.X[i]
        if x < x_target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def pulsed_fluxes(ct, mech, case, cycles):
    inp = case["inputs"]
    parser = argparse.ArgumentParser()
    rc.add_common_args(parser)
    parser.add_argument("--period-s", type=float)
    args = parser.parse_args([
        "--mechanism", mech, "--waveform", "physical",
        "--voltage", str(inp["voltage_V"]), "--element-loss-scale", "si",
        "--period-s", str(inp["period_s"]), "--duty", str(inp["duty"]),
        "--t-min-c", "25", "--residence-time-s", str(inp["tau_s"]),
        "--pressure-atm", str(inp["pressure_Pa"] / 101325.0),
        "--feed", inp["feed"], "--closure", inp["closure"],
        "--min-cycles", str(cycles), "--max-cycles", str(cycles)])
    p = rc.build_params(args)
    state = {"acc": None, "t_prev": 0.0, "w_out": None, "mdot_dt": 0.0}

    def on_sample(cycle, t, T, reactor):
        dt = t - state["t_prev"]
        state["t_prev"] = t
        if cycle != cycles:
            return
        if state["acc"] is None:
            state["acc"] = FluxAccumulator(reactor.phase)
            state["w_out"] = np.zeros(reactor.phase.n_species)
        state["acc"].add(reactor.kinetics, reactor.volume, dt)
        mdot = reactor.mass / p["tau_s"]
        state["w_out"] += mdot * np.asarray(reactor.phase.Y) * dt
        state["mdot_dt"] += mdot * dt

    gas, reactor, cyc, audit = rc.integrate(ct, mech, p, on_sample=on_sample)
    acc = state["acc"]
    mw = np.asarray(gas.molecular_weights)
    y_feed = ct.Solution(mech)
    y_feed.TPX = p["t_min_K"], p["pressure_Pa"], p["feed"]
    n_feed = state["mdot_dt"] * np.asarray(y_feed.Y) / mw
    n_out = state["w_out"] / mw
    carbon_fed = methane_carbon(gas, n_feed)
    out = acc.outflow_lumps(n_out)
    return {"cycles_integrated": cycles,
            "x_ch4_last_cycle": cyc[-1]["ch4_conversion"],
            "x_ch4_case_file": case["cycle_summary"]["mean_ch4_conversion"],
            "t_peak_c": p["t_peak_K"] - 273.15, "t_min_c": p["t_min_K"] - 273.15,
            "edges_pct_fed": acc.edges(carbon_fed),
            "outflow_pct_fed": {l: 100 * v / carbon_fed for l, v in out.items()}}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--case", type=Path, required=True)
    ap.add_argument("--mechanism", default=str(HERE.parent / "cantera" / "mechanisms" / "aramco20.yaml"))
    ap.add_argument("--cycles", type=int, default=3)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    import cantera as ct
    warnings.simplefilter("ignore")
    case = json.loads(args.case.read_text())
    feed, tau = case["inputs"]["feed"], case["inputs"]["tau_s"]
    x = case["cycle_summary"]["mean_ch4_conversion"]
    t_match = steady_at_conversion(ct, args.mechanism, feed, tau, x)
    steady = steady_fluxes(ct, args.mechanism, feed, t_match, tau)
    print(f"steady matched at {t_match:.1f} C, X {100 * steady['x_ch4']:.2f} %", flush=True)
    pulsed = pulsed_fluxes(ct, args.mechanism, case, args.cycles)
    print(f"pulsed last-cycle X {100 * pulsed['x_ch4_last_cycle']:.2f} % "
          f"(file {100 * pulsed['x_ch4_case_file']:.2f} %)", flush=True)
    result = {"case": str(args.case), "mechanism": args.mechanism, "feed": feed,
              "tau_s": tau, "lumps": LUMP_ORDER, "steady": steady, "pulsed": pulsed}
    args.output.write_text(json.dumps(result, indent=1))
    for label, r in (("steady", steady), ("pulsed", pulsed)):
        print(f"\n{label}: edges above 0.3 % of carbon fed")
        for k, v in sorted(r["edges_pct_fed"].items(), key=lambda kv: -kv[1]):
            if v >= 0.3:
                print(f"  {k:18} {v:7.2f}")
        print("  outflow:", {k: round(v, 2) for k, v in r["outflow_pct_fed"].items() if v > 0.05})


if __name__ == "__main__":
    main()
