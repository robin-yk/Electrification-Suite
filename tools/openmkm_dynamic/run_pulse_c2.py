#!/usr/bin/env python3
"""The C2 pulse study on the full mechanism: which drive protects C2 best?

At matched feed, residence time and conversion, the si-op pulse on
AramcoMech 2.0 makes far less benzene than the steady element
(pulse_vs_steady.py: 17 against 55 percent at tau 0.2 s and 20 percent
conversion on the CH4/CO2 feed). That is one drive. This study moves the
drive's three knobs one at a time from that anchor, on the paper's methane
feed, at one residence time, and asks which direction protects C2 more:
a lower peak (voltage), a shorter cycle (period), a longer hot fraction
(duty). Each case is compared with the steady element at its own conversion
by pulse_vs_steady.py against the CH4-only steady sweep.

The lumped series model (series_pulse.py) is the screen, not the judge: its
two fitted activation energies are equal above 1300 C, so it cannot see the
low-temperature benzene the steady element makes. Every ranking quoted from
this study comes from the mechanism.

    python3 tools/openmkm_dynamic/run_pulse_c2.py plan
    python3 tools/openmkm_dynamic/run_pulse_c2.py run [--jobs 4]
    python3 tools/openmkm_dynamic/run_pulse_c2.py compare
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "c2pulse"
ARAMCO = HERE.parent / "cantera" / "mechanisms" / "aramco20.yaml"
STEADY = HERE / "data" / "premise" / "cjh-inversion" / "cjh-cstr.json"

FEED = "CH4:0.05, HE:0.95"      # Figure 2 feed, 50 sccm, 1 bar
TAU_S = 0.2                     # the residence time the S9 card settled on

# Round 1: the anchor is the SI operating point; each other case moves one
# knob by a large step. The element answered before the chemistry did: 60 V
# peaks at 1233 C and a 0.2 s period at 1131 C, both below the temperature
# at which anything converts in 0.2 s, and 20 percent duty peaks at 3063 C,
# past anything carbon paper survives. The useful window is narrow and
# round 2 steps inside it: peaks between about 1400 and 1800 C.
CASES = [
    {"key": "anchor-siop-1s-d0.05", "voltage": "si-op", "period_s": 1.0, "duty": 0.05},
    {"key": "peak-60V-1s-d0.05", "voltage": "60", "period_s": 1.0, "duty": 0.05},
    {"key": "period-siop-0.2s-d0.05", "voltage": "si-op", "period_s": 0.2, "duty": 0.05},
    {"key": "duty-siop-1s-d0.2", "voltage": "si-op", "period_s": 1.0, "duty": 0.2},
    # round 2
    {"key": "peak-70V-1s-d0.05", "voltage": "70", "period_s": 1.0, "duty": 0.05},
    {"key": "period-siop-2s-d0.05", "voltage": "si-op", "period_s": 2.0, "duty": 0.05},
    {"key": "duty-siop-1s-d0.1", "voltage": "si-op", "period_s": 1.0, "duty": 0.1},
    {"key": "duty-70V-1s-d0.1", "voltage": "70", "period_s": 1.0, "duty": 0.1},
]


def cases():
    out = []
    for c in CASES:
        rec = dict(c)
        rec["output"] = str(DATA / f"{c['key']}.json")
        out.append(rec)
    return out


def command(rec, mechanism=ARAMCO):
    return [sys.executable, str(HERE / "run_cstr_case.py"),
            "--mechanism", str(mechanism),
            "--waveform", "physical",
            "--voltage", str(rec["voltage"]),
            "--element-loss-scale", "si",
            "--period-s", str(rec["period_s"]),
            "--duty", str(rec["duty"]),
            "--t-min-c", "25",
            "--residence-time-s", str(TAU_S),
            "--pressure-atm", "1.0",
            "--feed", FEED,
            "--output", rec["output"]]


def do_plan(args):
    cs = cases()
    print(f"{len(cs)} cases, feed {FEED}, tau {TAU_S} s, mechanism {ARAMCO.name}")
    for rec in cs:
        done = "cached" if Path(rec["output"]).exists() else "to run"
        print(f"  {rec['key']:28} V {rec['voltage']:>6} period {rec['period_s']:<5} "
              f"duty {rec['duty']:<5} {done}")
    if args.commands:
        for rec in cs:
            print(" ".join(command(rec)))
    return 0


def do_run(args):
    DATA.mkdir(parents=True, exist_ok=True)
    todo = [rec for rec in cases() if args.force or not Path(rec["output"]).exists()]
    print(f"{len(todo)} cases to run, {args.jobs} at a time")
    procs, failed = [], []
    for rec in todo:
        while len(procs) >= args.jobs:
            for p, r in list(procs):
                if p.poll() is not None:
                    procs.remove((p, r))
                    (failed if p.returncode else []).append(r["key"])
            if len(procs) >= args.jobs:
                import time
                time.sleep(10)
        log = open(DATA / f"{rec['key']}.log", "w")
        print(f"  starting {rec['key']}", flush=True)
        procs.append((subprocess.Popen(command(rec), stdout=log, stderr=subprocess.STDOUT), rec))
    for p, r in procs:
        p.wait()
        if p.returncode:
            failed.append(r["key"])
    if failed:
        print(f"FAILED: {failed}")
        return 1
    print("all cases finished")
    return 0


def do_compare(args):
    have = [rec["output"] for rec in cases() if Path(rec["output"]).exists()]
    if not have:
        print("no results yet")
        return 1
    return subprocess.run([sys.executable, str(HERE / "pulse_vs_steady.py"),
                           "--steady", str(STEADY), *have]).returncode


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("plan")
    pl.add_argument("--commands", action="store_true")
    pl.set_defaults(func=do_plan)
    rn = sub.add_parser("run")
    rn.add_argument("--jobs", type=int, default=4)
    rn.add_argument("--force", action="store_true")
    rn.set_defaults(func=do_run)
    cp = sub.add_parser("compare")
    cp.set_defaults(func=do_compare)
    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
