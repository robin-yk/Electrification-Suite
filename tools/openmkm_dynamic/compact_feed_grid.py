#!/usr/bin/env python3
"""Lift the per-row constant metadata of a finished feed-grid build into a
manifest. Every row of a cjh-grid-x*.jsonl repeats the generator, engine,
mechanism, closure, feed, pressure and date; across a ~30k-row build that is a
third of the bytes saying the same seven things. This rewrites each file with
those keys removed and records them once in manifest.json, per file, alongside
row counts and the numeric ranges.

Run only on a COMPLETE build: run_cjh_grid.py's resume logic tolerates the
compact rows (it reads T_C, tau_s, ch4_conversion, all kept), but rows it
appends afterwards would carry the metadata again and the manifest would no
longer describe every row. Compact once, at the end.

Usage: python tools/openmkm_dynamic/compact_feed_grid.py <dir with cjh-grid-*.jsonl>
"""
import json
import sys
from pathlib import Path

META_KEYS = ("generator", "engine", "mechanism", "closure", "feed",
             "pressure_atm", "generated")


def main(directory):
    directory = Path(directory)
    manifest = {"note": "shared per-file metadata lifted out of the rows by "
                        "compact_feed_grid.py; each row keeps T_C, tau_s, pass, "
                        "ch4_conversion, c2_selectivity_carbon, outlet_molefrac",
                "files": {}}
    for path in sorted(directory.glob("cjh-grid-*.jsonl")):
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        shared = {k: rows[0][k] for k in META_KEYS if k in rows[0]}
        for r in rows:
            for k in shared:
                if r.get(k) != shared[k]:
                    raise SystemExit(f"{path.name}: row metadata differs on {k!r}; "
                                     f"refusing to compact a mixed file")
        compact = []
        for r in rows:
            compact.append({k: v for k, v in r.items() if k not in shared})
        path.write_text("\n".join(json.dumps(r, separators=(",", ":"))
                                  for r in compact) + "\n")
        manifest["files"][path.name] = dict(
            shared, rows=len(compact),
            T_C_range=[min(r["T_C"] for r in compact), max(r["T_C"] for r in compact)],
            tau_s_range=[min(r["tau_s"] for r in compact), max(r["tau_s"] for r in compact)])
        print(f"{path.name}: {len(compact)} rows compacted")
    out = directory / "manifest.json"
    out.write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "data" / "feed-grid")
