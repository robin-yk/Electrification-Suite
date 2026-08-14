#!/usr/bin/env python3
"""Five-period pulsed-CSTR pilot: does chemistry remember across pulses?

Runs the transient pulsed CSTR at logarithmically spaced periods, computes
the quasi-steady reference (time average of steady CSTR states over the same
waveform), and cross-anchors the steady endpoints against OpenMKM CSTR
solves when a binary is provided. Only if these cases show a real dynamic
effect is a larger (256/512-case) dynamic dataset worth generating.

Usage:
  python tools/openmkm_dynamic/run_cstr_pilot.py \
      --periods-s 0.001 0.01 0.1 1 10 \
      --output tools/openmkm_dynamic/data/cstr-period-pilot.jsonl \
      [--omkm /path/to/omkm --cantera-lib /path/to/lib]   # steady anchors
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
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_cstr_case import (add_common_args, build_params, run_case,
                           waveform_temperature, make_reactor,
                           RECORD_SPECIES, MW, C2_SPECIES)

HERE = Path(__file__).resolve().parent
OMKM_MECH = HERE.parent / "openmkm" / "mechanisms" / "gri30-ct25.yaml"

OMKM_CSTR = """\
reactor:
    type: cstr
    mode: "isothermal"
    volume: "1 cm3"
    temperature: {T_K:.2f}
    pressure: "1 atm"

inlet_gas:
    flow_rate: "{flow_cm3_s:.6g} cm3/s"

simulation:
    end_time: 50
    transient: true
    stepping: "logarithmic"
    init_step: 1e-12
    solver:
        atol: 1e-15
        rtol: 1e-10

phases:
    gas:
        name: gri30
        initial_state: "CH4:1,CO2:1"
"""


def steady_state(ct, mech, p, T_K):
    """Steady CSTR outlet at fixed T: integrate the same reactor for 40 tau."""
    ps = dict(p, t_min_K=T_K, t_peak_K=T_K, duty=0.0,
              ramp_up_fraction=0.0, ramp_down_fraction=0.0)
    gas, reactor, mfc_in, mfc_out, net = make_reactor(ct, mech, ps)
    i_ch4 = gas.species_index("CH4")
    y_feed = gas.Y[i_ch4]
    gas.TP = T_K, p["pressure_Pa"]
    reactor.syncState()
    net.reinitialize()
    net.advance(40 * p["tau_s"])
    y = reactor.phase.Y
    conv = 1.0 - y[i_ch4] / y_feed
    conv_c = (y_feed - y[i_ch4]) / MW["CH4"]
    c2_c = sum(2 * y[gas.species_index(sp)] / MW[sp] for sp in C2_SPECIES)
    sel = min(1.0, max(0.0, c2_c / conv_c)) if conv_c > 1e-15 else 0.0
    x = reactor.phase.X
    return {"T_K": T_K, "ch4_conversion": max(0.0, conv),
            "c2_selectivity_carbon": sel,
            "outlet_molefrac": {sp: float(x[gas.species_index(sp)])
                                for sp in RECORD_SPECIES}}


def quasi_steady_reference(ct, mech, p, n_grid=13, n_phase=400):
    """Time average of steady states over the waveform (the blend the app uses)."""
    lo, hi = p["t_min_K"], p["t_peak_K"]
    grid_T = [lo + (hi - lo) * i / (n_grid - 1) for i in range(n_grid)]
    table = {T: steady_state(ct, mech, p, T) for T in grid_T}

    def interp(T, key):
        if T <= grid_T[0]: return table[grid_T[0]][key]
        if T >= grid_T[-1]: return table[grid_T[-1]][key]
        j = max(i for i, g in enumerate(grid_T) if g <= T)
        f = (T - grid_T[j]) / (grid_T[j + 1] - grid_T[j])
        return table[grid_T[j]][key] * (1 - f) + table[grid_T[j + 1]][key] * f

    xs = ss = 0.0
    for k in range(n_phase):
        T = waveform_temperature((k + 0.5) / n_phase, p)
        xs += interp(T, "ch4_conversion")
        ss += interp(T, "ch4_conversion") * interp(T, "c2_selectivity_carbon")
    x_avg = xs / n_phase
    return {"ch4_conversion": x_avg,
            "c2_selectivity_carbon": ss / xs if xs > 1e-15 else 0.0,
            "endpoints": {"t_min": table[grid_T[0]], "t_peak": table[grid_T[-1]]}}


def openmkm_steady_anchor(omkm, cantera_lib, p, T_K):
    """Steady OpenMKM CSTR at fixed T with matched volumetric residence time."""
    env = dict(os.environ)
    if cantera_lib:
        env["LD_LIBRARY_PATH"] = cantera_lib
    flow = 1.0 / p["tau_s"]          # V = 1 cm3, tau = V/Q
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        (td / "cstr.yaml").write_text(OMKM_CSTR.format(T_K=T_K, flow_cm3_s=flow))
        shutil.copy(OMKM_MECH, td / "gri30.yaml")
        subprocess.run([str(omkm), "cstr.yaml", "gri30.yaml"], cwd=td, env=env,
                       check=True, capture_output=True, timeout=600)
        lines = [l for l in (td / "gas_mass_ss.dat").read_text().splitlines()
                 if l.strip() and not l.startswith("#")]
        hdr = lines[0].split()
        first = dict(zip(hdr, lines[1].split()))
        last = dict(zip(hdr, lines[-1].split()))
    y0, y1 = float(first["CH4"]), float(last["CH4"])
    return {"T_K": T_K, "ch4_conversion": max(0.0, 1 - y1 / y0)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_args(parser)
    parser.add_argument("--periods-s", type=float, nargs="+",
                        default=[0.001, 0.01, 0.1, 1.0, 10.0])
    parser.add_argument("--output", type=Path,
                        default=HERE / "data" / "cstr-period-pilot.jsonl")
    parser.add_argument("--omkm", default="")
    parser.add_argument("--cantera-lib", default="")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    import cantera as ct
    warnings.simplefilter("ignore")

    done = set()
    if args.resume and args.output.exists():
        for line in args.output.read_text().splitlines():
            if line.strip():
                done.add(json.loads(line)["inputs"]["period_s"])
    args.output.parent.mkdir(parents=True, exist_ok=True)

    base = build_params(argparse.Namespace(**{**vars(args), "period_s": 1.0,
                                              "max_cycles": args.max_cycles}))
    qs = quasi_steady_reference(ct, args.mechanism, base)
    anchors = None
    if args.omkm:
        anchors = {
            "t_min": openmkm_steady_anchor(args.omkm, args.cantera_lib, base,
                                           base["t_min_K"]),
            "t_peak": openmkm_steady_anchor(args.omkm, args.cantera_lib, base,
                                            base["t_peak_K"])}

    print(f"quasi-steady reference: X={qs['ch4_conversion']:.5f} "
          f"S_C2={qs['c2_selectivity_carbon']:.4f}")
    if anchors:
        for k in ("t_min", "t_peak"):
            cant = qs["endpoints"][k]["ch4_conversion"]
            omkm_x = anchors[k]["ch4_conversion"]
            print(f"steady anchor {k}: cantera X={cant:.5f} vs openmkm "
                  f"X={omkm_x:.5f} (diff {abs(cant-omkm_x):.2e})")

    rows = []
    with args.output.open("a") as stream:
        for period in args.periods_s:
            if period in done:
                print(f"period={period}s already done, skipping")
                continue
            p = build_params(argparse.Namespace(
                **{**vars(args), "period_s": period,
                   "max_cycles": args.max_cycles}))
            result = run_case(args.mechanism, p)
            result["quasi_steady_reference"] = {
                "ch4_conversion": qs["ch4_conversion"],
                "c2_selectivity_carbon": qs["c2_selectivity_carbon"]}
            if anchors:
                result["openmkm_steady_anchors"] = anchors
            stream.write(json.dumps(result, separators=(",", ":")) + "\n")
            stream.flush()
            cs = result["cycle_summary"]
            dyn = cs["mean_ch4_conversion"]
            ratio = dyn / qs["ch4_conversion"] if qs["ch4_conversion"] > 1e-12 else float("nan")
            rows.append((period, cs, ratio))
            print(f"period={period:g}s cycles={cs['cycles_to_convergence']} "
                  f"converged={cs['converged']} X_dyn={dyn:.5f} "
                  f"X_dyn/X_qs={ratio:.3f} "
                  f"S_C2={cs['mean_c2_selectivity_carbon']:.4f} "
                  f"CH3_carryover={cs['radical_carryover_at_cycle_start']['CH3']:.3e}")

    print("\nsummary (dynamic vs quasi-steady):")
    for period, cs, ratio in rows:
        flag = "MEMORY EFFECT" if abs(ratio - 1) > 0.02 else "quasi-steady OK"
        print(f"  P={period:g}s  X_dyn/X_qs={ratio:.3f}  {flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
