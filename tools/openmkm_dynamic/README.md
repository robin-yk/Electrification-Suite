# Dynamic pulsed-CSTR pipeline (transient ground truth)

> **STATUS: under development, not wired into the site. Blocked.**
>
> Nothing here feeds any page in `apps/`; it is research tooling parked in
> the repository so it can be picked up later. Two things must be settled
> before any number produced here is quotable:
>
> 1. **Reactor closure is unverified.** The runner uses constant pressure
>    with equal inlet and outlet mass flows, i.e. constant mass and a
>    *breathing volume* (~1.5x over 750-1250 C). The companion experiment is
>    a fixed-volume tube, and the literature closure for that is fixed mass
>    with pressure swinging (tens of percent), which this does not
>    reproduce: the recorded pressure is flat at 1 atm. A variable-mass
>    constant-pressure formulation is separately known to go unphysical at
>    high pulse frequency (negative outlet flow, super-equilibrium
>    conversion); this runner cannot show that specific failure because both
>    mass flows are set equal and positive by construction, and the pilot
>    conversions stay far below equilibrium. That rules out one symptom, not
>    the closure question.
> 2. **No memory test has been run.** Deviation from the quasi-steady blend
>    is not by itself evidence of chemical memory; Arrhenius convexity
>    produces it too. See the pilot section.
>
> The engine split is deliberate and load-bearing: transient integration is
> Cantera, steady anchors are OpenMKM. See "Why a CSTR" below.

Generates the *transient* half of the ML dataset family: an ideal-gas CSTR
under a prescribed trapezoidal temperature pulse train, integrated to
periodic steady state with full species trajectories. This is the data the
quasi-steady blend cannot provide, and the only place pulse-frequency
effects, radical carryover, and heating/cooling hysteresis exist.

## Why a CSTR, and why not OpenMKM for the transient part

The pulsed-heating modeling literature this repo accompanies uses a
well-mixed reactor with prescribed periodic T(t), so the CSTR is the right
first formulation; a dynamic PFR (T(z,t)) is a later extension.

OpenMKM source was inspected for this task (`zerodReactor.cpp`,
`reactor_parser.cpp`): its 0-D reactors support `isothermal`, `adiabatic`,
and `tpd` (one *linear* ramp via `IdealGasTRampReactor`) temperature modes
only. Arbitrary T(t) exists solely as the PFR's **spatial** `tprofile`.
OpenMKM therefore cannot impose a pulse train on a CSTR without source
modification.

The transient integration consequently runs on **Cantera (pip, >=3.2)**
with the same GRI-Mech 3.0 mechanism, and every record carries
`engine: "cantera-3.2 transient CSTR"`. These trajectories are never
labeled OpenMKM output. To keep the dataset family coherent, the pilot
cross-anchors the steady endpoints: the same steady CSTR is solved by both
Cantera and OpenMKM (`type: cstr`, isothermal, matched volume/flow) and the
agreement is printed with every pilot run.

## Formulation

- Constant pressure, prescribed T(t) (energy equation off).
- Trapezoid waveform: ramp-up, T_peak plateau (`duty`), ramp-down, T_min
  floor; fractions must sum below 1.
- Instantaneous mass residence time: inlet/outlet mass flows track
  m(t)/tau every substep.
- Cycle map convergence: the run marches cycles until the cycle-boundary
  composition moves less than `--cycle-tolerance` (max-abs mass fraction),
  then keeps the last `--record-cycles` cycles of trajectory.
- Recorded species include CH3, H, OH so radical carryover across cycle
  boundaries is measurable.

**Open question pinned, not guessed:** whether the companion paper's
reactor is constant-pressure or constant-volume (pressure swinging with
T(t)) is still unverified; publisher access is blocked from this
environment. The `reactor_constraint` field records the formulation used;
a constant-volume variant is the documented follow-up once the paper's
Methods/SI are read.

## Usage

```bash
# one case
python tools/openmkm_dynamic/run_cstr_case.py \
    --period-s 0.1 --t-min-c 750 --t-peak-c 1250 --duty 0.10 \
    --residence-time-s 0.1 --output /tmp/case.json

# five-period pilot + quasi-steady reference + OpenMKM steady anchors
python tools/openmkm_dynamic/run_cstr_pilot.py \
    --periods-s 0.001 0.01 0.1 1 10 \
    --output tools/openmkm_dynamic/data/cstr-period-pilot.jsonl \
    --omkm ~/openmkm-build/openmkm/src/build/omkm \
    --cantera-lib ~/openmkm-build/cantera-install/lib --resume
```

Requires `pip install cantera` (any 3.x; version is stamped into every
record). The pilot resumes by period value with `--resume`.

## Dataset family map

| dataset | engine | what it answers |
|---|---|---|
| `tools/openmkm/data/design-results-512.jsonl` | OpenMKM steady PFR | steady operating-space surrogate (T, P, flow, feed, geometry) |
| `tools/openmkm_dynamic/data/cstr-period-pilot.jsonl` | Cantera transient CSTR | pulse-frequency dependence, radical memory, quasi-steady breakdown |
| `apps/rphcjh/data/openmkm-pfr.json` | OpenMKM steady PFR | the visualizer's 1-D sweep |

The steady 512-case design already returned `TEST_ML_SURROGATES` (local
interpolation misses the 0.02 bar). The pilot decides whether the dynamic
dimension also needs learning: scale to a 256/512-case dynamic design only
if the five pilot periods show a real deviation from the quasi-steady
blend.

## Pilot result (2026-08-14): recorded, NOT yet interpretable

**Do not cite these numbers as evidence of chemical memory.** The reactor
closure below is unverified against the companion paper (see the blocking
issue in the status block at the top of this file), and the numbers are
kept only so the diagnosis can be run against them.

T 750-1250 C, duty 0.10, ramps 5 %, tau = 0.1 s, 1 atm, CH4:CO2 = 1:1,
GRI-3.0. Quasi-steady reference X = 0.0222. Engine anchor: Cantera and
OpenMKM steady CSTR agree to 2e-9 (750 C) and 3.2e-3 absolute (1250 C).

| period | X_dyn | X_dyn / X_qs | CH3 at cycle start |
|---|---|---|---|
| 1 ms | 0.0282 | 1.27 | 5.2e-6 |
| 10 ms | 0.0327 | 1.48 | 5.3e-7 |
| 100 ms | 0.0332 | **1.50** | 1.3e-7 |
| 1 s | 0.0241 | 1.09 | 1.6e-8 |
| 10 s | 0.0161 | 0.72 | 2.6e-8 |

Every tested period deviates beyond the 2 % band and the response is
non-monotonic in period. **What that means is undetermined.** Two readings
are still open, and this pilot cannot separate them:

1. Chemical memory: radicals surviving the cold interval, hysteresis
   between heating and cooling at equal temperature.
2. Arrhenius convexity alone (the Jensen gap the visualizer already shows),
   which produces a pulsing gain with no memory whatsoever, plus whatever
   the unverified closure contributes.

Separating them needs the two tests this pilot did not run: the
equal-temperature heating/cooling state difference H_x (the recorded
trajectories already contain the data), and an equal-histogram waveform
pair that differs only in the *order* of the same temperature sequence.
The double-burst family added later supplies material for the second test
but was not designed as a matched-histogram control.

Until the closure is settled and those two tests run, treat the table as a
recorded observation, not a result.
