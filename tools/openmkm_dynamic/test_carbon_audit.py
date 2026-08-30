#!/usr/bin/env python3
"""Checks on the schema-2 carbon audit in run_cstr_case.py.

Run by hand, like the rest of tools/verification: the Node suite in tests/
covers the browser solvers and cannot import Cantera.

    python3 tools/openmkm_dynamic/test_carbon_audit.py            # GRI only
    python3 tools/openmkm_dynamic/test_carbon_audit.py --aramco   # adds ~7 min

Every assertion here fails against schema 1. The bucketing checks fail because
carbon_group and CARBON_GROUPS did not exist; the closure and partition checks
fail because the result carried no carbon_audit key at all; and the last check
fails because eleven named species cannot report the carbon that leaves through
the ones they do not name.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_cstr_case import (CARBON_GROUPS, RECORD_SPECIES, SCHEMA_VERSION,
                           build_params, carbon_group, run_case)

MECH_DIR = Path(__file__).resolve().parents[1] / "cantera" / "mechanisms"
ARAMCO = MECH_DIR / "aramco20.yaml"
FAILURES = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


def bucket_checks():
    print("carbon_group buckets")
    check("C0 holds the carbon-free species", carbon_group(0) == "C0")
    check("negative counts cannot escape the partition", carbon_group(-1) == "C0")
    for n in range(1, 7):
        check(f"C{n} is its own bucket", carbon_group(n) == f"C{n}")
    check("C7 folds into the tail", carbon_group(7) == "C7+")
    check("C24 folds into the same tail", carbon_group(24) == "C7+")
    check("every bucket is declared",
          {carbon_group(n) for n in range(0, 40)} == set(CARBON_GROUPS))


class Args:
    """The knobs build_params reads, at values that keep the case short."""
    mechanism = "gri30.yaml"
    t_min_c, t_peak_c, duty = 750.0, 1300.0, 0.10
    waveform, voltage = "trapezoid", 40.0
    ramp_up_fraction = ramp_down_fraction = 0.05
    pressure_atm, residence_time_s = 1.0, 0.05
    # Argon, not the helium the experiment uses: GRI-Mech carries no HE, and
    # these checks are structural, so the diluent only has to exist in both.
    feed = "CH4:0.05, AR:0.95"
    points_per_cycle, min_cycles, max_cycles = 60, 3, 0
    cycle_tolerance, record_cycles = 1e-6, 1
    closure, period_s = "const-pressure", 0.2


def audit_checks(mech, label, expect_outside_record):
    args = Args()
    args.mechanism = mech
    print(f"\n{label}: {mech}")
    result = run_case(mech, build_params(args))

    check("result declares schema 2", result.get("schema_version") == SCHEMA_VERSION)
    prov = result.get("mechanism_provenance") or {}
    check("mechanism label is the argument, not a hardcoded name",
          result.get("mechanism") == str(mech))
    check("mechanism file is digested", bool(prov.get("mechanism_sha256")))
    check("species list is digested", bool(prov.get("species_list_sha256")))
    check("no condensed phase is claimed", prov.get("solid_carbon_modeled") is False)

    audit = result.get("carbon_audit")
    check("carbon_audit is present", audit is not None)
    if audit is None:
        return

    check("buckets partition the mechanism", audit["group_partition_ok"],
          f"residual {audit['group_partition_residual_kmol']:+.2e} kmol")
    counted = sum(g["n_species_in_group"] for g in audit["groups"].values())
    check("every species lands in exactly one bucket",
          counted == prov["n_species"], f"{counted} of {prov['n_species']}")
    group_sum = sum(g["fraction_of_carbon_out"] for g in audit["groups"].values())
    check("bucket fractions sum to one", abs(group_sum - 1.0) < 1e-9,
          f"sum {group_sum:.12f}")

    for element in ("C", "H", "O"):
        stats = audit["elements"][element]
        rel = stats["residual_fraction_of_in"]
        if rel is None:
            # Not in the feed, so there is no scale to be relative to. This
            # feed has no oxygen; the audit must say so rather than divide by
            # a rounding-level inlet and report a fake imbalance.
            check(f"{element} is absent from the feed and says so unscaled",
                  abs(stats["in_kmol"]) <= 1e-20 and abs(stats["residual_kmol"]) < 1e-18,
                  f"residual {stats['residual_kmol']:+.1e} kmol")
        else:
            check(f"{element} closes against the inventory change",
                  abs(rel) < 1e-10, f"residual/in {abs(rel):.1e}")

    outside = audit["carbon_outside_record_species"]
    # species_out_kmol is sparse: it drops species whose cycle outflow is
    # exactly zero, which under an oxygen-free feed includes H2O and OH. The
    # requirement is that nothing which actually flowed went unrecorded.
    missing = [sp for sp in RECORD_SPECIES
               if sp not in audit["species_out_kmol"]
               and result["cycle_summary"]["outflow_mass_fractions"][sp] > 0.0]
    check("no RECORD_SPECIES with outflow is missing from the audit",
          not missing, f"missing {missing}" if missing else "")
    if expect_outside_record:
        # The reason schema 2 exists. GRI-Mech leaks a trace through C3; a
        # mechanism with an aromatic pool leaks a fifth of the fed carbon, and
        # schema 1 wrote none of it to disk.
        check("carbon outside RECORD_SPECIES is material", outside > 0.05,
              f"{100 * outside:.3f} percent")
    else:
        check("carbon outside RECORD_SPECIES is a trace", outside < 0.01,
              f"{100 * outside:.4f} percent")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--aramco", action="store_true",
                    help="also run the 493-species case, roughly 7 minutes")
    args = ap.parse_args()

    bucket_checks()
    audit_checks("gri30.yaml", "GRI-Mech", expect_outside_record=False)
    if args.aramco:
        if not ARAMCO.exists():
            raise SystemExit(f"missing {ARAMCO}")
        audit_checks(str(ARAMCO), "AramcoMech", expect_outside_record=True)

    print(f"\n{len(FAILURES)} failed")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
