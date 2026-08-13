# Dynamic pulsed-CSTR pipeline (transient ground truth)

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
