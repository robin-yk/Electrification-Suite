"""Peak-sampling audit over every recorded Cantera case.

The substep grid decides which temperatures the chemistry actually
integrates. For each case this recomputes the element's own peak from the
recorded drive and the hottest temperature the case's grid sampled, and
reports the miss

    dT_miss = T_element_peak - max(T over the substeps that were used)

Cases are read, never modified. The output names every case whose miss is
over the tolerance, so the recompute list is set by the data rather than by
whatever batch someone happened to suspect.

Run: python tools/openmkm_dynamic/audit_peak_sampling.py [--tol 5.0]
"""
import argparse
import glob
import json
import os
import sys
import warnings
from multiprocessing import Pool

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from element_drive import integrate_pulsed_element, profile_function  # noqa: E402
from run_cstr_case import phase_grid, waveform_temperature  # noqa: E402


def one(rec):
    i = rec["inputs"]
    if i.get("waveform") != "physical":
        return None                      # drawn waveforms hold their plateau
    d = integrate_pulsed_element(voltage=i["voltage_V"], period=i["period_s"],
                                 duty=i["duty"], ambient_c=25.0)
    if not d["converged"]:
        return None
    p = {"_profile": profile_function(d), "waveform": "physical",
         "duty": i["duty"], "points_per_cycle": i.get("points_per_cycle", 100),
         "t_min_K": d["t_min_c"] + 273.15, "t_peak_K": d["t_peak_c"] + 273.15}
    n_sub = i.get("substeps_per_cycle")
    if n_sub is None:                    # pre-fix record: uniform grid
        n = i.get("points_per_cycle", 100)
        grid = [((k + 0.5) / n, 1.0 / n) for k in range(n)]
        version = "uniform"
    else:
        grid = phase_grid(p)
        version = "adaptive"
        if len(grid) != n_sub:           # a third grid we do not know about
            version = f"unknown({n_sub})"
    peak = max(waveform_temperature(k / 20000.0, p) for k in range(20000))
    seen = max(waveform_temperature(ph, p) for ph, _ in grid)
    return {"design_index": rec["design_index"], "grid": version,
            "substeps": len(grid),
            "hot_substeps": sum(1 for ph, _ in grid if ph < i["duty"]),
            "duty": i["duty"], "period_s": i["period_s"], "tau_s": i["tau_s"],
            "t_on_s": i["period_s"] * i["duty"],
            "dT_miss_K": peak - seen, "t_peak_c": d["t_peak_c"]}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tol", type=float, default=5.0)
    ap.add_argument("--out", default=HERE + "/data/wide/peak-sampling-audit.json")
    args = ap.parse_args()

    files = sorted(glob.glob(HERE + "/data/wide/design-wide-*.jsonl"))
    recs = []
    for fn in files:
        camp = os.path.basename(fn).split("design-wide-")[1].rsplit("-w", 1)[0]
        for line in open(fn):
            r = json.loads(line)
            if r.get("converged"):
                r["_campaign"] = camp
                recs.append(r)
    print(f"{len(recs)} converged cases over {len(files)} files", flush=True)

    with Pool(4) as pool:
        out = [r for r in pool.map(one, recs, chunksize=8) if r]
    camp_of = {r["design_index"]: r["_campaign"] for r in recs}
    for r in out:
        r["campaign"] = camp_of.get(r["design_index"], "?")

    bad = sorted((r for r in out if r["dT_miss_K"] > args.tol),
                 key=lambda r: -r["dT_miss_K"])
    by_camp = {}
    for r in out:
        c = by_camp.setdefault(r["campaign"], {"n": 0, "over_tol": 0, "worst": 0.0})
        c["n"] += 1
        c["worst"] = max(c["worst"], r["dT_miss_K"])
        if r["dT_miss_K"] > args.tol:
            c["over_tol"] += 1
    print(f"audited {len(out)} physical-waveform cases, tolerance {args.tol} K")
    for c in sorted(by_camp):
        v = by_camp[c]
        print(f"  {c:16s} n {v['n']:4d}  over tol {v['over_tol']:4d}  "
              f"worst {v['worst']:8.1f} K")
    print(f"TOTAL over tolerance: {len(bad)} of {len(out)}")
    json.dump({"tolerance_K": args.tol, "audited": len(out),
               "over_tolerance": len(bad), "by_campaign": by_camp,
               "cases": out}, open(args.out, "w"), indent=1)
    print(f"AUDIT DONE -> {args.out}")
