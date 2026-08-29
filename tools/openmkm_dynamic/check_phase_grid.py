#!/usr/bin/env python3
"""Self-check for the cycle substep grid. Needs no Cantera and no data.

Fails on the pre-fix uniform grid, which is the point: at duty 0.02 a
100-point uniform grid lets the chemistry see a peak 217 K below the
element's own, and no energy or convergence diagnostic notices.

Run: python tools/openmkm_dynamic/check_phase_grid.py
"""
import argparse
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run_cstr_case import build_params, phase_grid, waveform_temperature  # noqa: E402

PPC = 100
FAIL = []


def check(label, ok, detail):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: {detail}")
    if not ok:
        FAIL.append(label)


def params(v, period, duty):
    a = argparse.Namespace(
        mechanism="gri30.yaml", t_min_c=25.0, t_peak_c=1250.0, duty=duty,
        waveform="physical", voltage=v, ramp_up_fraction=0.05,
        ramp_down_fraction=0.05, pressure_atm=1.0, residence_time_s=1.0,
        feed="CH4:0.6, CO2:0.4", points_per_cycle=PPC, min_cycles=10,
        max_cycles=600, cycle_tolerance=1e-7, record_cycles=1,
        period_s=period, closure="const-pressure")
    return build_params(a)


def uniform(n):
    return [((k + 0.5) / n, 1.0 / n) for k in range(n)]


print("cycle substep grid self-check")
for duty in (0.02, 0.03, 0.05, 0.10, 0.40, 0.85):
    g = phase_grid({"points_per_cycle": PPC, "duty": duty})
    check(f"partition duty {duty:.2f}", abs(sum(w for _, w in g) - 1.0) < 1e-12,
          f"{len(g)} substeps, widths sum to {sum(w for _, w in g):.12f}")
    check(f"monotone phases duty {duty:.2f}",
          all(g[i][0] < g[i + 1][0] for i in range(len(g) - 1)),
          "midpoints strictly increasing")

# high duty must not pay for the refinement: the hot window already holds
# hot_min points there, so the grid stays at the requested resolution
for duty in (0.20, 0.40, 0.85):
    g = phase_grid({"points_per_cycle": PPC, "duty": duty})
    check(f"no refinement cost at duty {duty:.2f}", len(g) == PPC,
          f"{len(g)} substeps against the requested {PPC}")

# the reason the grid exists: the hot phase the chemistry integrates has to be
# the hot phase the element actually reaches. The uniform grid is not wrong
# everywhere, which is what made this easy to miss: where the element saturates
# inside a short on time it samples the top fine, and it fails where the element
# is still climbing when the power cuts. So the regression guard asks that the
# set contain a case the old grid gets badly wrong, not that it get every case
# wrong.
uniform_deficits = []
for (v, period, duty, tol) in ((41.2, 10.0, 0.02, 5.0), (55.0, 0.1, 0.02, 5.0),
                               (30.0, 1.0, 0.02, 5.0), (36.5, 7.2, 0.03, 5.0),
                               (55.0, 0.2, 0.03, 5.0), (27.3, 2.0, 0.03, 5.0),
                               (27.3, 7.2, 0.05, 5.0), (50.4, 0.5, 0.05, 5.0),
                               (31.9, 5.18, 0.05, 5.0), (36.5, 7.2, 0.07, 5.0),
                               (38.8, 1.0, 0.20, 5.0), (34.2, 0.1, 0.85, 1.0)):
    p = params(v, period, duty)
    peak = max(waveform_temperature(k / 20000.0, p) for k in range(20000))
    seen_adaptive = max(waveform_temperature(ph, p) for ph, _ in phase_grid(p))
    seen_uniform = max(waveform_temperature(ph, p) for ph, _ in uniform(PPC))
    check(f"peak resolved duty {duty:.2f}", peak - seen_adaptive < tol,
          f"deficit {peak - seen_adaptive:.1f} K against the {tol:.0f} K bound "
          f"(uniform {PPC}-point grid: {peak - seen_uniform:.1f} K)")
    uniform_deficits.append((peak - seen_uniform, v, period, duty))

worst = max(uniform_deficits)
check("the uniform grid fails somewhere in this set", worst[0] > 50.0,
      f"worst uniform deficit {worst[0]:.1f} K at V {worst[1]}, P {worst[2]} s, "
      f"duty {worst[3]}, against the adaptive grid's bound of 5 K")

if FAIL:
    print(f"\n{len(FAIL)} CHECK(S) FAILED: {', '.join(FAIL)}")
    raise SystemExit(1)
print("\nALL CHECKS PASS")
