#!/usr/bin/env python3
"""Promote a run's datasets into canonical/, with the evidence that earned it.

Collect jobs write runs/<commit>/ and never touch canonical/. Promotion is a
deliberate act: name the run, name the datasets, and say in one line what
validation earned the promotion -- that line lands in canonical/manifest.json
where the next reader looks first. Refuses to promote over a newer canonical
entry without --force, and refuses an empty evidence string always.

Run: python tools/openmkm_dynamic/promote.py <run-sha7> <dataset.jsonl>... \
       --evidence "200 off-node points, p95 0.0005 (run 33015864752)"
"""
import argparse
import datetime
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS, CANON = HERE / "data" / "runs", HERE / "data" / "canonical"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("run")
    ap.add_argument("datasets", nargs="+")
    ap.add_argument("--evidence", required=True,
                    help="what validation earned this promotion; recorded verbatim")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if not args.evidence.strip():
        raise SystemExit("an empty evidence string is not a validation")

    source = RUNS / args.run
    if not source.is_dir():
        raise SystemExit(f"no such run directory: {source}")
    CANON.mkdir(parents=True, exist_ok=True)
    manifest_path = CANON / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "rule": "only validated runs are promoted here; collect jobs write "
                "runs/<commit>/ and never touch this directory",
        "datasets": {},
    }
    for name in args.datasets:
        src = source / name
        if not src.exists():
            raise SystemExit(f"{args.run} has no {name}")
        entry = manifest["datasets"].get(name)
        if entry and not args.force:
            raise SystemExit(f"{name} is already promoted (from {entry.get('from_run')}); "
                             "pass --force to replace it deliberately")
        shutil.copy(src, CANON / name)
        rows = sum(1 for l in src.read_text().splitlines() if l.strip())
        manifest["datasets"][name] = {
            "rows": rows, "from_run": args.run,
            "sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
            "promoted": datetime.date.today().isoformat(),
            "validation": args.evidence,
        }
        print(f"promoted {name}: {rows} rows from runs/{args.run}")
    manifest["promoted"] = datetime.date.today().isoformat()
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")


if __name__ == "__main__":
    main()
