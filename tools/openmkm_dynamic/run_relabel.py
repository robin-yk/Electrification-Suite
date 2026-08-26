#!/usr/bin/env python3
"""Relabel finished transient cases against the outflow-weighted baseline.

The 192 physical-drive cases were labelled by dividing an outflow-weighted
dynamic outlet by a time-weighted quasi-steady blend -- two different averages,
whose mismatch manufactured a spurious 0.72 at the 10 s quasi-steady limit.
The transient halves of those cases cost real integration time and are correct;
only the cheap baseline under each label was wrong. This recomputes exactly
that: for every historic case whose element peak sits inside the 1800 C
materials-trust bound, rebuild its T(t) from the recorded (voltage, period,
duty) -- the element ODE is deterministic -- recompute the quasi-steady
reference with the weighted blend, and divide the stored dynamic outlet by it.

Cases above the bound are dropped from the output and counted out loud. The
transient results are never touched; nothing here integrates chemistry in time.

Run: python tools/openmkm_dynamic/run_relabel.py --source <design-physical.jsonl>
"""
import argparse
import json
import sys
import warnings
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from run_cstr_case import build_params                    # noqa: E402
from run_cstr_pilot import quasi_steady_reference         # noqa: E402
from run_cstr_design import PEAK_CAP_C                    # noqa: E402


def rebuild_params(inputs):
    args = argparse.Namespace(
        mechanism="gri30.yaml", t_min_c=25.0, t_peak_c=1250.0,
        duty=inputs["duty"], waveform="physical", voltage=inputs["voltage_V"],
        ramp_up_fraction=inputs["ramp_up_fraction"],
        ramp_down_fraction=inputs["ramp_down_fraction"],
        pressure_atm=inputs["pressure_Pa"] / 101325.0,
        residence_time_s=inputs["tau_s"], feed=inputs["feed"],
        points_per_cycle=inputs["points_per_cycle"], min_cycles=10,
        max_cycles=0, cycle_tolerance=1e-7, record_cycles=1,
        period_s=inputs["period_s"], closure=inputs["closure"])
    return build_params(args)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--output", type=Path,
                    default=HERE / "out" / "design-shard-relabel.jsonl")
    args = ap.parse_args()

    import cantera as ct
    warnings.simplefilter("ignore")

    kept = dropped = 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w") as stream:
        for line in args.source.read_text().splitlines():
            if not line.strip():
                continue
            record = json.loads(line)
            p = rebuild_params(record["inputs"])
            rebuilt_peak = p["t_peak_K"] - 273.15
            stored_peak = record["inputs"]["t_peak_K"] - 273.15
            if abs(rebuilt_peak - stored_peak) > 0.5:
                raise SystemExit(
                    f"index {record['design_index']}: rebuilt element peak "
                    f"{rebuilt_peak:.1f} C does not match the stored {stored_peak:.1f} C; "
                    "the drive is supposed to be deterministic and this run cannot "
                    "be trusted to relabel what it cannot reproduce")
            if rebuilt_peak > PEAK_CAP_C:
                dropped += 1
                continue
            qs = quasi_steady_reference(ct, "gri30.yaml", p, n_grid=9)
            x_dyn = record["outputs"]["ch4_conversion"]
            x_qs = qs["ch4_conversion_outflow_weighted"]
            record["outputs"].update({
                "quasi_steady_ch4_conversion": x_qs,
                "quasi_steady_ch4_conversion_time_weighted": qs["ch4_conversion"],
                "quasi_steady_c2_selectivity": qs["c2_selectivity_outflow_weighted"],
                "memory_gain": x_dyn / x_qs if x_qs > 1e-12 else None,
            })
            record["relabelled"] = ("outflow-weighted quasi-steady baseline; "
                                    "transient result untouched")
            stream.write(json.dumps(record, separators=(",", ":")) + "\n")
            kept += 1
            if kept % 20 == 0:
                print(f"{kept} relabelled...")
    print(f"kept {kept} within the {PEAK_CAP_C:.0f} C bound, dropped {dropped} above it")


if __name__ == "__main__":
    main()
