#!/usr/bin/env python3
"""Paper-basis selectivities from schema-2 case files, as one table.

The selectivity definition is the SI's, page S6:

    S_CxHy = ([CxHy] * x) / (sum_i [CiHj] * i) * 100

so the denominator sums carbon over hydrocarbons only. CO and CO2 are not in
it, and CH4 is the reactant rather than a product. Getting that denominator
wrong once already produced a retracted conclusion, which is why it lives in
one function instead of being rewritten at each call site.

Carbon comes from `carbon_audit.species_out_kmol`, the kmol of each species
leaving per cycle that schema 2 records, so nothing is inferred from the
eleven named trajectory species.

    python3 tools/openmkm_dynamic/summarize_cases.py results/*.json
"""
import argparse
import json
import sys
from pathlib import Path

# Published RPH figures at about 20 percent conversion, for the last column.
PAPER = {"S_C2H2": "> 80", "S_C6H6": "< 5"}


def carbon_counts(mechanism):
    """Carbon and oxygen atom counts per species, from the mechanism itself."""
    import cantera as ct
    gas = ct.Solution(mechanism)
    return {s: (gas.n_atoms(s, "C"), gas.n_atoms(s, "O"))
            for s in gas.species_names}


def summarize(path, counts_cache):
    d = json.loads(Path(path).read_text())
    mech = d["mechanism"]
    if mech not in counts_cache:
        counts_cache[mech] = carbon_counts(mech)
    counts = counts_cache[mech]
    out = d["carbon_audit"]["species_out_kmol"]

    hc = {}
    for sp, kmol in out.items():
        nc, no = counts.get(sp, (0, 0))
        if nc > 0 and no == 0 and sp != "CH4":
            hc[sp] = kmol * nc
    total = sum(hc.values()) or float("nan")

    inp, cs = d["inputs"], d["cycle_summary"]
    return {
        "file": Path(path).name,
        "voltage_V": inp.get("voltage_V"),
        "tau_s": inp["tau_s"],
        "t_peak_C": inp["t_peak_K"] - 273.15,
        "t_min_C": inp["t_min_K"] - 273.15,
        "X_CH4": 100 * cs["mean_ch4_conversion"],
        "S_C2H2": 100 * hc.get("C2H2", 0.0) / total,
        "S_C2H4": 100 * hc.get("C2H4", 0.0) / total,
        "S_C6H6": 100 * hc.get("C6H6", 0.0) / total,
        "S_C4H2": 100 * hc.get("C4H2", 0.0) / total,
        "converged": cs["converged"],
        "carbon_outside_record": 100 * d["carbon_audit"]["carbon_outside_record_species"],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    cache, rows = {}, []
    for p in sorted(args.paths):
        try:
            rows.append(summarize(p, cache))
        except Exception as exc:                        # noqa: BLE001
            print(f"skipped {p}: {exc}", file=sys.stderr)
    if not rows:
        return 1
    if args.json:
        print(json.dumps(rows, indent=1))
        return 0

    print(f"{'V':>4} {'tau':>6} {'T_peak':>7} {'T_min':>6} {'X_CH4':>7} "
          f"{'S_C2H2':>8} {'S_C2H4':>7} {'S_C6H6':>8} {'S_C4H2':>7} {'outside':>8}")
    for r in sorted(rows, key=lambda r: (r["voltage_V"] or 0, r["tau_s"])):
        v = f"{r['voltage_V']:.0f}" if r["voltage_V"] else "-"
        print(f"{v:>4} {r['tau_s']:6.2f} {r['t_peak_C']:7.0f} {r['t_min_C']:6.0f} "
              f"{r['X_CH4']:6.2f}% {r['S_C2H2']:7.2f}% {r['S_C2H4']:6.2f}% "
              f"{r['S_C6H6']:7.2f}% {r['S_C4H2']:6.2f}% "
              f"{r['carbon_outside_record']:7.2f}%")
    print(f"\npaper, RPH near 20 percent conversion: "
          f"S_C2H2 {PAPER['S_C2H2']}, S_C6H6 {PAPER['S_C6H6']}")
    unconverged = [r["file"] for r in rows if not r["converged"]]
    if unconverged:
        print(f"NOT CONVERGED: {unconverged}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
