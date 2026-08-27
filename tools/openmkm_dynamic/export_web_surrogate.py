#!/usr/bin/env python3
"""Package the validated CJH map and trained GP for dependency-free web use."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANON = HERE / "data" / "canonical"
MODEL = HERE / "models" / "rph-surrogate.json"
FINAL_VALIDATION = CANON / "final-validation-report.json"
OUTPUT = HERE.parents[1] / "apps" / "rphcjh" / "data" / "rph-surrogate.json"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    model = json.loads(MODEL.read_text())
    if model.get("verdict") != "SHIP":
        raise SystemExit("refusing to export a surrogate that did not pass its gates")
    validation = json.loads(FINAL_VALIDATION.read_text())
    if validation.get("verdict") != "PASS":
        raise SystemExit("refusing to export a surrogate that failed its independent test")
    if validation.get("model_design_sha256") != model.get("canonical_design_sha256"):
        raise SystemExit("independent test does not match the trained model")

    design = CANON / "design-physical.jsonl"
    grid_path = CANON / "cjh-grid.jsonl"
    if model.get("canonical_design_sha256") != sha256(design):
        raise SystemExit("model was not trained on the current canonical design dataset")
    design_rows = [json.loads(line) for line in design.read_text().splitlines()
                   if line.strip()]
    input_keys = ("voltage_V", "period_s", "duty", "tau_s")
    input_bounds = {
        key: {
            "min": min(row["inputs"][key] for row in design_rows),
            "max": max(row["inputs"][key] for row in design_rows),
        }
        for key in input_keys
    }

    columns = {}
    for line in grid_path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        columns.setdefault(row["tau_s"], []).append(
            [row["T_C"], row["ch4_conversion"]])
    packed = [{"tau_s": tau, "points": sorted(points)}
              for tau, points in sorted(columns.items())]
    bundle = {
        "schema": 1,
        "scope": {
            "mechanism": "GRI-Mech 3.0",
            "feed": "CH4:1, CO2:1",
            "pressure_atm": 1.0,
            "closure": "const-pressure",
            "peak_cap_c": 1800.0,
            "input_bounds": input_bounds,
        },
        "provenance": {
            "canonical_design_sha256": sha256(design),
            "canonical_grid_sha256": sha256(grid_path),
            "trained_model_sha256": sha256(MODEL),
        },
        "grid": {
            "temperature_min_c": 400.0,
            "temperature_max_c": 1850.0,
            "tau_min_s": packed[0]["tau_s"],
            "tau_max_s": packed[-1]["tau_s"],
            "columns": packed,
        },
        "model": model,
        "validation": {
            "verdict": validation["verdict"],
            "target_sha256": validation["target_sha256"],
            "summary": validation["summary"],
            "gates": validation["gates"],
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(bundle, separators=(",", ":")) + "\n")
    print(f"exported {OUTPUT}: {OUTPUT.stat().st_size / 1024:.0f} KB, "
          f"{len(packed)} tau columns")


if __name__ == "__main__":
    main()
