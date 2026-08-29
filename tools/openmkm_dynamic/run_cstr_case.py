#!/usr/bin/env python3
"""Transient pulsed-CSTR ground truth for the dynamic-heating ML dataset.

Integrates an ideal-gas CSTR under a prescribed trapezoidal temperature
pulse train T(t) to periodic steady state and records the full chemical
trajectory, including radical carryover across cycle boundaries. This is
the ground truth the quasi-steady blend cannot provide.

Engine note (provenance): OpenMKM's 0-D reactors support only isothermal,
adiabatic, and single-linear-ramp (TPD) temperature modes; arbitrary T(t)
exists only as the PFR's *spatial* profile. The transient pulse problem is
therefore integrated with Cantera (pip, >=3.2) using the same GRI-Mech 3.0
mechanism, and results are labeled engine="cantera-3.2". Steady-state
anchors of the same formulation are cross-checked against OpenMKM CSTR
solves by run_cstr_pilot.py, which ties this dataset to the OpenMKM steady
family. Do not relabel these trajectories as OpenMKM output.

Formulation: constant pressure, prescribed T(t) (energy equation off),
fixed feed composition, instantaneous mass residence time tau: inlet and
outlet mass flows track m(t)/tau every substep, so tau is well defined
while the reactor mass follows rho(T) at constant P. Constant-volume
(pressure-swing) operation is selectable through --closure, and the choice is
recorded with every case.
"""
import argparse
import datetime
import json
import math
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

RECORD_SPECIES = ["CH4", "CO2", "CO", "H2", "H2O",
                  "C2H2", "C2H4", "C2H6", "CH3", "H", "OH"]
# Molar masses for every recorded species, matching tools/openmkm/run_sweep.py
# where the two lists overlap, so a yield computed from either file agrees.
MW = {"CH4": 16.043, "CO2": 44.010, "CO": 28.010, "H2": 2.016, "H2O": 18.015,
      "C2H2": 26.038, "C2H4": 28.054, "C2H6": 30.070,
      "CH3": 15.035, "H": 1.008, "OH": 17.007}
C2_SPECIES = ("C2H2", "C2H4", "C2H6")


def waveform_temperature(phase, p):
    """T(t) over one cycle, phase in [0,1).

    Families beyond the trapezoid exist so a surrogate trained on this data
    cannot degenerate into a square-wave interpolator: "sine" has no plateau
    at all, and "double" splits the same hot fraction into two shorter
    bursts, which probes pulse *spacing* at fixed duty and temperature.
    """
    lo, hi = p["t_min_K"], p["t_peak_K"]
    span = hi - lo
    family = p.get("waveform", "trapezoid")

    if family == "physical":
        # T(t) integrated from the element's own energy balance rather than
        # drawn. build_params() caches the interpolator, because the ODE takes
        # hundreds of cycles to reach its periodic state and this is called once
        # per substep. The element model works in Celsius and everything here is
        # Kelvin, so the conversion belongs at this boundary -- without it the
        # cycle mean came out below the cycle minimum, which is how it was found.
        return p["_profile"](phase) + 273.15

    if family == "sine":
        # raised cosine touching both endpoints and holding neither. `duty`
        # does not set the shape here, so cases carry mean_temperature_K as
        # the family-independent descriptor a surrogate should key on.
        return lo + span * 0.5 * (1 - math.cos(2 * math.pi * phase))

    if family == "double":
        # two identical bursts per cycle: same duty and ramps, half the width
        return waveform_temperature((phase * 2) % 1.0,
                                    dict(p, waveform="trapezoid"))

    # trapezoid; "square" is the same shape with the ramps forced to zero
    d = p["duty"]
    ru = rd = 0.0
    if family != "square":
        ru, rd = p["ramp_up_fraction"], p["ramp_down_fraction"]
    if phase < ru:
        return lo + span * (phase / ru if ru else 1.0)
    if phase < ru + d:
        return hi
    if phase < ru + d + rd:
        return hi - span * ((phase - ru - d) / rd if rd else 1.0)
    return lo


# The closure is the choice this file used to make silently. Constant pressure
# lets the gas expand as it heats, so at a fixed mass flow the residence time
# falls when the element is hot; a fixed-volume tube instead swings its pressure
# and holds the residence time. The companion experiment is a fixed-volume tube,
# and the literature closure for it is constant mass with pressure swinging, so
# the two are not interchangeable at the temperatures swept here (750-1250 C is
# a 1.5x density change). Both are now selectable and the choice is recorded
# with every case, because a surrogate trained on one cannot be read as the
# other and nothing downstream can tell them apart after the fact.
CLOSURES = {
    "const-pressure": "IdealGasConstPressureReactor",
    "const-volume": "IdealGasReactor",
}


def make_reactor(ct, mech, p):
    gas = ct.Solution(mech)
    gas.TPX = p["t_min_K"], p["pressure_Pa"], p["feed"]
    feed = ct.Solution(mech)
    feed.TPX = p["t_min_K"], p["pressure_Pa"], p["feed"]
    closure = p.get("closure", "const-pressure")
    if closure not in CLOSURES:
        raise SystemExit(f"unknown closure {closure!r}; choose from {sorted(CLOSURES)}")
    reactor = getattr(ct, CLOSURES[closure])(gas, energy="off", clone=False)
    inlet = ct.Reservoir(feed)
    outlet = ct.Reservoir(feed)
    mfc_in = ct.MassFlowController(inlet, reactor, mdot=reactor.mass / p["tau_s"])
    mfc_out = ct.MassFlowController(reactor, outlet, mdot=reactor.mass / p["tau_s"])
    net = ct.ReactorNet([reactor])
    return gas, reactor, mfc_in, mfc_out, net


def integrate(ct, mech, p, on_sample=None):
    """March cycles until the cycle-boundary state stops moving."""
    gas, reactor, mfc_in, mfc_out, net = make_reactor(ct, mech, p)
    y_feed_ch4 = gas.Y[gas.species_index("CH4")]
    i_ch4 = gas.species_index("CH4")
    i_rec = {sp: gas.species_index(sp) for sp in RECORD_SPECIES}
    n_sub = p["points_per_cycle"]
    dt = p["period_s"] / n_sub
    cycles = []
    prev_boundary = None
    t = 0.0
    for cycle in range(1, p["max_cycles"] + 1):
        w_ch4 = w_feed = w_total = 0.0
        c2_carbon = conv_carbon = 0.0
        w_out = {sp: 0.0 for sp in RECORD_SPECIES}
        for k in range(n_sub):
            phase = (k + 0.5) / n_sub
            T = waveform_temperature(phase, p)
            gas.TP = T, p["pressure_Pa"]
            reactor.syncState()
            mdot = reactor.mass / p["tau_s"]
            mfc_in.mass_flow_rate = mdot
            mfc_out.mass_flow_rate = mdot
            net.reinitialize()
            t += dt
            net.advance(t)
            y = reactor.phase.Y
            w_ch4 += mdot * y[i_ch4] * dt
            w_feed += mdot * y_feed_ch4 * dt
            w_total += mdot * dt
            for sp in RECORD_SPECIES:
                w_out[sp] += mdot * y[i_rec[sp]] * dt
            conv_carbon += mdot * (y_feed_ch4 - y[i_ch4]) / MW["CH4"] * dt
            c2_carbon += mdot * sum(
                2 * y[gas.species_index(sp)] / MW[sp] for sp in C2_SPECIES) * dt
            if on_sample:
                on_sample(cycle, t, T, reactor)
        boundary = reactor.phase.Y.copy()
        residual = (float(abs(boundary - prev_boundary).max())
                    if prev_boundary is not None else float("inf"))
        prev_boundary = boundary
        conversion = 1.0 - w_ch4 / w_feed
        selectivity = (min(1.0, max(0.0, c2_carbon / conv_carbon))
                       if conv_carbon > 1e-15 else 0.0)
        # Outflow-weighted mean outlet mass fractions: the same mdot dt weight
        # the conversion integral uses, so a species yield derived from these is
        # consistent with ch4_conversion by construction. Recorded per species
        # because the optimization objective needs Y_C2H2 and Y_CO separately;
        # the lumped C2 selectivity cannot be split after the fact without the
        # 3 percent reconstruction error of re-averaging the thinned trajectory.
        cycles.append({"cycle": cycle, "boundary_residual": residual,
                       "ch4_conversion": conversion,
                       "c2_selectivity_carbon": selectivity,
                       "outflow_mass_fractions": {
                           sp: w_out[sp] / w_total for sp in RECORD_SPECIES}})
        if cycle >= p["min_cycles"] and residual < p["cycle_tolerance"]:
            break
    return gas, reactor, cycles


def run_case(mech, p):
    import cantera as ct
    from collections import deque
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        # ring buffer keeps the last record_cycles cycles of trajectory, so a
        # single integration serves both convergence and recording
        ring = deque(maxlen=p["record_cycles"])
        idx_cache = {}

        def sample(cycle, t, T, r):
            if not ring or ring[-1]["cycle"] != cycle:
                ring.append({"cycle": cycle, "time_s": [], "temperature_K": [],
                             "pressure_Pa": [],
                             "mole_fractions": {sp: [] for sp in RECORD_SPECIES}})
            buf = ring[-1]
            buf["time_s"].append(round(t, 9))
            buf["temperature_K"].append(round(T, 3))
            buf["pressure_Pa"].append(round(float(r.phase.P), 1))
            x = r.phase.X
            if not idx_cache:
                idx_cache.update({sp: r.phase.species_index(sp)
                                  for sp in RECORD_SPECIES})
            for sp in RECORD_SPECIES:
                buf["mole_fractions"][sp].append(float(x[idx_cache[sp]]))

        gas, reactor, cycles = integrate(ct, mech, p, on_sample=sample)
        trajectory = {"time_s": [], "temperature_K": [], "pressure_Pa": [],
                      "mole_fractions": {sp: [] for sp in RECORD_SPECIES}}
        for buf in ring:
            trajectory["time_s"] += buf["time_s"]
            trajectory["temperature_K"] += buf["temperature_K"]
            trajectory["pressure_Pa"] += buf["pressure_Pa"]
            for sp in RECORD_SPECIES:
                trajectory["mole_fractions"][sp] += buf["mole_fractions"][sp]
        last = cycles[-1]
        first_boundary = {sp: trajectory["mole_fractions"][sp][0]
                          for sp in ("CH3", "H", "OH")}
        return {
            "engine": f"cantera-{ct.__version__} transient CSTR "
                      f"({p['closure']}, prescribed T(t), mass-based tau)",
            "mechanism": "GRI-Mech 3.0",
            "generated": datetime.date.today().isoformat(),
            # voltage_V and drive_cycles exist only under --waveform physical,
            # so the comprehension takes what the case actually has.
            "inputs": {k: p[k] for k in
                       ("closure", "voltage_V", "drive_cycles",
                        "t_min_K", "t_peak_K", "period_s", "duty", "waveform",
                        "mean_temperature_K", "ramp_up_fraction",
                        "ramp_down_fraction", "pressure_Pa", "tau_s", "feed",
                        "points_per_cycle") if k in p},
            "reactor_constraint": f"{p['closure']}_prescribed_T",
            "cycle_summary": {
                "converged": last["boundary_residual"] < p["cycle_tolerance"],
                "cycles_to_convergence": len(cycles),
                "cycle_boundary_residual": last["boundary_residual"],
                "mean_ch4_conversion": last["ch4_conversion"],
                "mean_c2_selectivity_carbon": last["c2_selectivity_carbon"],
                "outflow_mass_fractions": last["outflow_mass_fractions"],
                "radical_carryover_at_cycle_start": first_boundary,
            },
            "convergence_history": [
                {k: c[k] for k in ("cycle", "boundary_residual",
                                   "ch4_conversion")}
                for c in cycles[:: max(1, len(cycles) // 50)]],
            "trajectory": trajectory,
        }


def mean_temperature(p, n=2000):
    """Time-average of the actual waveform.

    `duty` means different things across families (plateau fraction for the
    trapezoid, nothing at all for the raised cosine), so this is the
    family-independent descriptor to train and compare on.
    """
    return sum(waveform_temperature((k + 0.5) / n, p) for k in range(n)) / n


def build_params(args):
    total_ramp = args.ramp_up_fraction + args.ramp_down_fraction
    if total_ramp + args.duty >= 1.0:
        raise SystemExit("duty + ramps must stay below 1")
    max_cycles = args.max_cycles or min(
        5000, max(args.min_cycles, int(12 * args.residence_time_s / args.period_s) + 5))
    p = {
        "t_min_K": args.t_min_c + 273.15,
        "t_peak_K": args.t_peak_c + 273.15,
        "period_s": args.period_s,
        "duty": args.duty,
        "waveform": getattr(args, "waveform", "trapezoid"),
        "ramp_up_fraction": args.ramp_up_fraction,
        "ramp_down_fraction": args.ramp_down_fraction,
        "pressure_Pa": args.pressure_atm * 101325.0,
        "tau_s": args.residence_time_s,
        "feed": args.feed,
        "points_per_cycle": args.points_per_cycle,
        "min_cycles": args.min_cycles,
        "max_cycles": max_cycles,
        "cycle_tolerance": args.cycle_tolerance,
        "record_cycles": args.record_cycles,
        "closure": getattr(args, "closure", "const-pressure"),
    }
    if p["waveform"] == "physical":
        # T_peak and T_min stop being inputs here: the element decides them from
        # the voltage, the period and its own thermal mass. They are recorded as
        # results so a case still reports the temperatures it actually reached.
        from element_drive import integrate_pulsed_element, profile_function
        drive = integrate_pulsed_element(
            voltage=args.voltage, period=args.period_s, duty=args.duty,
            ambient_c=args.t_min_c)
        if not drive["converged"]:
            raise SystemExit("element drive did not reach a periodic state")
        p["_profile"] = profile_function(drive)
        p["t_peak_K"] = drive["t_peak_c"] + 273.15
        p["t_min_K"] = drive["t_min_c"] + 273.15
        p["voltage_V"] = args.voltage
        p["drive_cycles"] = drive["cycles"]
    p["mean_temperature_K"] = mean_temperature(p)
    return p


def add_common_args(parser):
    parser.add_argument("--mechanism", default="gri30.yaml")
    parser.add_argument("--t-min-c", type=float, default=750.0)
    parser.add_argument("--t-peak-c", type=float, default=1250.0)
    parser.add_argument("--duty", type=float, default=0.10)
    parser.add_argument("--waveform", default="trapezoid",
                        choices=["trapezoid", "square", "sine", "double", "physical"])
    parser.add_argument("--voltage", type=float, default=40.0,
                        help="drive voltage; only used by --waveform physical, where "
                             "it replaces --t-peak-c as the thing you actually set")
    parser.add_argument("--ramp-up-fraction", type=float, default=0.05)
    parser.add_argument("--ramp-down-fraction", type=float, default=0.05)
    parser.add_argument("--pressure-atm", type=float, default=1.0)
    parser.add_argument("--residence-time-s", type=float, default=0.1)
    parser.add_argument("--feed", default="CH4:1, CO2:1")
    parser.add_argument("--points-per-cycle", type=int, default=200)
    parser.add_argument("--min-cycles", type=int, default=20)
    parser.add_argument("--max-cycles", type=int, default=0,
                        help="0 = auto from residence time / period")
    parser.add_argument("--cycle-tolerance", type=float, default=1e-7)
    parser.add_argument("--record-cycles", type=int, default=3)
    parser.add_argument("--closure", default="const-pressure", choices=sorted(CLOSURES),
                        help="const-pressure: gas expands, residence time falls when hot. "
                             "const-volume: pressure swings, residence time held.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_args(parser)
    parser.add_argument("--period-s", type=float, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    p = build_params(args)
    result = run_case(args.mechanism, p)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result) + "\n")
    cs = result["cycle_summary"]
    print(f"period={args.period_s}s cycles={cs['cycles_to_convergence']} "
          f"converged={cs['converged']} X={cs['mean_ch4_conversion']:.5f} "
          f"S_C2={cs['mean_c2_selectivity_carbon']:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
