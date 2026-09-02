#!/usr/bin/env python3
"""The Python series solver against the JavaScript one it was ported from.

apps/rphcjh/solver.js is the product; series_pulse.py must reproduce its
integrateSeriesCSTR to round-off on the same temperature program, else the
optimization runs on a different model than the page shows. A trapezoid
from pulseWaveform is the program, the page's SERIES_DEFAULTS the rates.

    python3 tools/openmkm_dynamic/test_series_pulse.py
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import series_pulse as sp  # noqa: E402

JS = """
import { integrateSeriesCSTR, pulseWaveform, steadySeriesCSTR, SERIES_DEFAULTS }
  from "%s";
const wf = { duty: 0.05, ramp: 0.02, tPeak: 1700, tMin: 600 };
const out = [];
for (const tau of [0.05, 0.5, 2.0]) {
  const r = integrateSeriesCSTR({ tau, period: 1, steps: 2000, tempFn: ph => pulseWaveform(ph, wf) });
  const s = steadySeriesCSTR(1200, { tau });
  out.push({ tau, avgA: r.avgA, avgB: r.avgB, peakB: r.peakB, sA: s.xA, sB: s.xB });
}
console.log(JSON.stringify(out));
"""


def trapezoid(ph, duty=0.05, ramp=0.02, t_peak=1700.0, t_min=600.0):
    hi, lo = duty, 1 - duty
    r = min(ramp, hi * 0.98, lo * 0.98)
    r_up, r_dn = min(r, hi * 0.98), min(r, lo * 0.98)
    span = t_peak - t_min
    if ph < r_up:
        return t_min + span * (ph / r_up)
    if ph < hi:
        return t_peak
    if ph < hi + r_dn:
        return t_peak - span * ((ph - hi) / r_dn)
    return t_min


def main():
    js_path = (HERE.parent.parent / "apps" / "rphcjh" / "solver.js").as_uri()
    script = HERE / "_series_port_check.mjs"
    script.write_text(JS % js_path)
    try:
        out = subprocess.run(["node", str(script)], capture_output=True, text=True, check=True)
    finally:
        script.unlink(missing_ok=True)
    ref = json.loads(out.stdout.strip().splitlines()[-1])
    p = {"k1_ref": 30.0, "ea1": 400.0, "k2_ref": 1.0, "ea2": 80.0}
    fails = 0
    for row in ref:
        tau = row["tau"]
        r = sp.series_periodic(trapezoid, tau, p, period=1.0, steps=2000)
        s = sp.steady_series(1200.0, tau, p)
        for name, a, b in (("avgA", r["avg_a"], row["avgA"]), ("avgB", r["avg_b"], row["avgB"]),
                           ("peakB", r["peak_b"], row["peakB"]),
                           ("steady xA", s["avg_a"], row["sA"]), ("steady xB", s["avg_b"], row["sB"])):
            ok = abs(a - b) <= 1e-9 * max(1.0, abs(b))
            fails += not ok
            print(f"  {'ok  ' if ok else 'FAIL'} tau {tau:4} {name:10} py {a:.12g} js {b:.12g}")
    print(f"\n{fails} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
