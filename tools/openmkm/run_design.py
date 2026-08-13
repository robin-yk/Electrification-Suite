#!/usr/bin/env python3
"""Generate a resumable, space-filling OpenMKM design for surrogate triage.

This intentionally samples a broad steady-PFR domain before any ML model is
chosen.  The resulting JSONL can be fed to benchmark_surrogate.py to answer
whether a simple interpolator is already sufficient.
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MECH = HERE / "mechanisms" / "gri30-ct25.yaml"
SPECIES = ["CH4", "CO2", "CO", "H2", "H2O", "C2H2", "C2H4", "C2H6"]
MW = {"CH4": 16.043, "CO2": 44.009, "CO": 28.010, "H2": 2.016,
      "H2O": 18.015, "C2H2": 26.038, "C2H4": 28.054, "C2H6": 30.070}

RANGES = {
    "element_T_C": (450.0, 1400.0),
    "pressure_atm": (0.5, 10.0),
    "flow_cm3_s": (10.0, 200.0),
    "ch4_fraction": (0.1, 0.9),
    "plateau_length_cm": (0.5, 3.0),
}
PRIMES = [2, 3, 5, 7, 11]

REACTOR = """\
reactor:
    type: "pfr"
    area: "1.0 cm2"
    length: "6 cm"
    mode: "tprofile"
    temperature: 673
    TProfile:
        "0 cm": 673
        "0.5 cm": 673
        "2 cm": {temperature_K:.2f}
        "{plateau_end_cm:.5f} cm": {temperature_K:.2f}
        "5.5 cm": 773
        "6 cm": 673
    pressure: "{pressure_atm:.6g} atm"

inlet_gas:
    flow_rate: "{flow_cm3_s:.6g} cm3/s"

simulation:
    end_time: 50
    solver:
        atol: 1e-10
        rtol: 1e-8
    transient: no

phases:
    gas:
        name: gri30
        initial_state: "CH4:{ch4_fraction:.8f},CO2:{co2_fraction:.8f}"
"""


def halton(index, base):
    value, factor = 0.0, 1.0
    while index:
        factor /= base
        index, digit = divmod(index, base)
        value += digit * factor
    return value


def design_point(index):
    point = {}
    for (name, (low, high)), base in zip(RANGES.items(), PRIMES):
        u = halton(index, base)
        # Pressure and flow span timescales, so sample them logarithmically.
        if name in ("pressure_atm", "flow_cm3_s"):
            point[name] = math.exp(math.log(low) + u * math.log(high / low))
        else:
            point[name] = low + u * (high - low)
    return point


def read_rows(path):
    lines = [line for line in path.read_text().splitlines()
             if line.strip() and not line.startswith("#")]
    header = lines[0].split()
    return dict(zip(header, lines[1].split())), dict(zip(header, lines[-1].split()))


def run_case(binary, env, inputs):
    cfg = dict(inputs)
    cfg.update(temperature_K=inputs["element_T_C"] + 273.15,
               plateau_end_cm=2 + inputs["plateau_length_cm"],
               co2_fraction=1 - inputs["ch4_fraction"])
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "pfr.yaml").write_text(REACTOR.format(**cfg))
        shutil.copy(MECH, tmp / "gri30.yaml")
        subprocess.run([str(binary), "pfr.yaml", "gri30.yaml"], cwd=tmp,
                       env=env, check=True, capture_output=True, timeout=600)
        mass_in, mass = read_rows(tmp / "gas_mass_ss.dat")
        _, mole = read_rows(tmp / "gas_mole_ss.dat")
    y0 = float(mass_in["CH4"])
    conversion = max(0.0, 1 - float(mass["CH4"]) / y0)
    converted_carbon = (y0 - float(mass["CH4"])) / MW["CH4"]
    c2_carbon = sum(2 * float(mass[sp]) / MW[sp]
                    for sp in ("C2H2", "C2H4", "C2H6"))
    return {
        "outlet_molefrac": {sp: float(mole[sp]) for sp in SPECIES},
        "ch4_conversion": conversion,
        "c2_selectivity_carbon": min(1.0, max(0.0, c2_carbon / converted_carbon))
        if converted_carbon > 1e-12 else 0.0,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--omkm", required=True)
    parser.add_argument("--cantera-lib", default="")
    parser.add_argument("--cases", type=int, default=512)
    parser.add_argument("--start", type=int, default=1,
                        help="first Halton index; useful for independent shards")
    parser.add_argument("--output", type=Path,
                        default=HERE / "design-results.jsonl")
    parser.add_argument("--continue-on-error", action="store_true",
                        help="log failed cases to <output>.failures.jsonl and "
                             "keep going instead of aborting the sweep")
    args = parser.parse_args()
    env = dict(os.environ)
    if args.cantera_lib:
        env["LD_LIBRARY_PATH"] = args.cantera_lib
    completed = set()
    if args.output.exists():
        for line in args.output.read_text().splitlines():
            if line.strip():
                completed.add(json.loads(line)["design_index"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    failures_path = args.output.with_suffix(args.output.suffix + ".failures.jsonl")
    with args.output.open("a") as stream:
        for index in range(args.start, args.start + args.cases):
            if index in completed:
                continue
            inputs = design_point(index)
            try:
                outputs = run_case(Path(args.omkm), env, inputs)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
                stderr = (exc.stderr or b"").decode(errors="replace")[-2000:] \
                    if getattr(exc, "stderr", None) else ""
                print(f"{index}: FAILED ({type(exc).__name__}) "
                      f"T={inputs['element_T_C']:.0f} C, "
                      f"P={inputs['pressure_atm']:.2f} atm, "
                      f"F={inputs['flow_cm3_s']:.1f} cm3/s\n{stderr}")
                if not args.continue_on_error:
                    raise
                with failures_path.open("a") as flog:
                    flog.write(json.dumps({
                        "design_index": index, "inputs": inputs,
                        "error": type(exc).__name__, "stderr_tail": stderr,
                    }, separators=(",", ":")) + "\n")
                continue
            record = {"design_index": index, "inputs": inputs,
                      "outputs": outputs}
            stream.write(json.dumps(record, separators=(",", ":")) + "\n")
            stream.flush()
            print(f"{index}: T={inputs['element_T_C']:.0f} C, "
                  f"X={record['outputs']['ch4_conversion']:.4f}")


if __name__ == "__main__":
    main()
