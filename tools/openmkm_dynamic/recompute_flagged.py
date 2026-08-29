"""Recompute every case the peak-sampling audit flagged, in place.

Reads peak-sampling-audit.json, re-runs each flagged design_index through
the current substep grid with its own recorded inputs, and rewrites the
campaign file with the new record substituted for the old one. Cases the
audit passed are copied through untouched, so a file's unflagged rows are
byte-identical afterwards.

Run: python tools/openmkm_dynamic/recompute_flagged.py [--jobs 4] [--dry-run]
"""
import argparse
import glob
import json
import os
import sys
import time
import warnings
from multiprocessing import Pool

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def redo(job):
    idx, inp = job
    import cantera as ct
    import run_cstr_design as D
    pt = {"voltage": inp["voltage_V"], "period_s": inp["period_s"],
          "duty": inp["duty"], "tau_s": inp["tau_s"], "feed": inp["feed"]}
    try:
        r = D.run_design_case(ct, "gri30.yaml", idx,
                              inp.get("closure", "const-pressure"), dict(pt))
    except Exception as exc:                                   # noqa: BLE001
        return idx, None, f"{type(exc).__name__}: {exc}"
    return idx, r, None


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--audit", default=HERE + "/data/wide/peak-sampling-audit.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    audit = json.loads(open(args.audit).read())
    flagged = {c["design_index"] for c in audit["cases"]
               if c["dT_miss_K"] > audit["tolerance_K"]}
    print(f"audit tolerance {audit['tolerance_K']} K, flagged {len(flagged)} cases")

    files = sorted(glob.glob(HERE + "/data/wide/design-wide-*.jsonl"))
    work, where = [], {}
    for fn in files:
        for line in open(fn):
            r = json.loads(line)
            if r["design_index"] in flagged and r.get("converged"):
                work.append((r["design_index"], r["inputs"]))
                where[r["design_index"]] = fn
    print(f"{len(work)} flagged records found across {len(set(where.values()))} files")
    if args.dry_run:
        raise SystemExit(0)

    t0 = time.time()
    with Pool(args.jobs) as pool:
        done = {}
        for k, (idx, rec, err) in enumerate(pool.imap_unordered(redo, work), 1):
            if err:
                print(f"  {idx}: FAILED {err}", flush=True)
                continue
            done[idx] = rec
            if k % 10 == 0:
                print(f"  {k}/{len(work)} in {time.time()-t0:.0f}s", flush=True)
    print(f"recomputed {len(done)} of {len(work)} in {time.time()-t0:.0f}s")

    touched = 0
    for fn in sorted(set(where.values())):
        rows, changed = [], 0
        for line in open(fn):
            r = json.loads(line)
            if r["design_index"] in done:
                r = done[r["design_index"]]
                changed += 1
            rows.append(r)
        if changed:
            with open(fn, "w") as f:
                for r in rows:
                    f.write(json.dumps(r, separators=(",", ":")) + "\n")
            touched += 1
            print(f"  {os.path.basename(fn)}: {changed} records replaced")
    print(f"RECOMPUTE DONE: {touched} files rewritten")
