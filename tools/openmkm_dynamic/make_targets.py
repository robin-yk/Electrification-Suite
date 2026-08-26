#!/usr/bin/env python3
"""Pick the next batch of transient cases where the surrogate actually failed.

The first holdout run passed every gate but max error: two cases at 0.11-0.13,
both in the same physical region -- the resonant memory-effect band where the
transient conversion runs several times the quasi-steady baseline (period near
the residence time, deep cold swings). The GP's own uncertainty does not flag
them, so refusal cannot paper over it: the region is thin in data, and the fix
is data in the region, not a looser gate.

Strategy: take every existing case whose dynamic-to-baseline ratio marks a
strong memory effect, jitter its (voltage, period, duty, tau) by up to +-35 %,
verify each candidate through the element ODE (feasible, converged, peak within
the 1800 C bound), and keep a farthest-point subset so the batch spreads over
the band instead of piling onto one case. Deterministic via --seed.

Run: python tools/openmkm_dynamic/make_targets.py [--count 32] [--seed 11]
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from element_drive import integrate_pulsed_element        # noqa: E402

CANON = HERE / "data" / "canonical" / "design-physical.jsonl"
PEAK_CAP_C = 1800.0
BOUNDS = {"voltage": (25.0, 55.0), "period_s": (0.01, 10.0),
          "duty": (0.02, 0.40), "tau_s": (0.01, 1.0)}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--count", type=int, default=32)
    ap.add_argument("--min-ratio", type=float, default=2.0,
                    help="dynamic/baseline conversion ratio that marks the band")
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--output", type=Path, default=HERE / "data" / "targets-round2.json")
    args = ap.parse_args()
    rng = random.Random(args.seed)

    anchors = []
    for line in CANON.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        o = r["outputs"]
        if o["quasi_steady_ch4_conversion"] > 1e-4 and \
           o["ch4_conversion"] / o["quasi_steady_ch4_conversion"] >= args.min_ratio:
            i = r["inputs"]
            anchors.append({"voltage": i["voltage_V"], "period_s": i["period_s"],
                            "duty": i["duty"], "tau_s": i["tau_s"]})
    if not anchors:
        raise SystemExit("no strong-memory anchors found; lower --min-ratio")
    print(f"{len(anchors)} strong-memory anchors (ratio >= {args.min_ratio})")

    candidates = []
    while len(candidates) < args.count * 6:
        base = rng.choice(anchors)
        c = {}
        for key, (lo, hi) in BOUNDS.items():
            jitter = math.exp(rng.uniform(math.log(0.65), math.log(1.35)))
            c[key] = min(hi, max(lo, base[key] * jitter))
        drive = integrate_pulsed_element(voltage=c["voltage"], period=c["period_s"],
                                         duty=c["duty"])
        if not drive["converged"] or drive["t_peak_c"] > PEAK_CAP_C:
            continue
        c["expected_peak_c"] = round(drive["t_peak_c"], 1)
        c["expected_min_c"] = round(drive["t_min_c"], 1)
        candidates.append(c)
        if len(candidates) % 32 == 0:
            print(f"  {len(candidates)} feasible candidates...")

    # farthest-point over (log period/tau, duty, peak, min) so the batch covers
    # the band's spread rather than clustering on one anchor
    def z(c):
        return (math.log10(c["period_s"] / c["tau_s"]), c["duty"] * 10,
                c["expected_peak_c"] / 300, c["expected_min_c"] / 300)
    chosen = [rng.randrange(len(candidates))]
    dist = [sum((a - b) ** 2 for a, b in zip(z(c), z(candidates[chosen[0]])))
            for c in candidates]
    while len(chosen) < args.count:
        far = max(range(len(candidates)),
                  key=lambda i: dist[i] if i not in chosen else -1.0)
        chosen.append(far)
        for i, c in enumerate(candidates):
            d2 = sum((a - b) ** 2 for a, b in zip(z(c), z(candidates[far])))
            dist[i] = min(dist[i], d2)

    targets = [candidates[i] for i in chosen]
    args.output.write_text(json.dumps({
        "purpose": ("second-round transient cases in the resonant memory band, "
                    "where the first surrogate's two worst holdout errors live"),
        "seed": args.seed, "min_ratio": args.min_ratio,
        "targets": targets}, indent=1) + "\n")
    ratios = sorted(c["period_s"] / c["tau_s"] for c in targets)
    print(f"wrote {len(targets)} targets: P/tau {ratios[0]:.2f}..{ratios[-1]:.2f}, "
          f"peak {min(c['expected_peak_c'] for c in targets):.0f}"
          f"..{max(c['expected_peak_c'] for c in targets):.0f} C")


if __name__ == "__main__":
    main()
