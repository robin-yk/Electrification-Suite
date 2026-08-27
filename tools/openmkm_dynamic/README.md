# Dynamic pulsed-CSTR pipeline and web surrogate

> **STATUS: model and web inference implemented. Independent final test pending.**
>
> The canonical dataset contains 2,251 steady Cantera CSTR states and 285
> transient physical-drive cases. After dropping 43 dead-zero cases, the GP
> correction fits 194 cases and evaluates on 48 fixed development cases. It
> passes the pre-stated conversion gates (mean 0.0027, p95 0.0105, max
> 0.0276), and the dependency-free JavaScript inference path reproduces the
> Python model. The 48 cases are not an untouched final test: their first
> errors were used to aim the 32-case second round. Run a fresh independent
> Cantera test before treating the web model as a final scientific result.
>
> The shipped scope is one computational model: constant-pressure CSTR,
> CH4:CO2 = 1:1, 1 atm, GRI-Mech 3.0, physical CFP drive, and element peak at
> or below 1800 C. This does not establish that constant pressure is the
> experimental reactor closure.

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

Both the transient integration and the dense steady CSTR map run on
**Cantera (pip, >=3.2)** with GRI-Mech 3.0, and every transient record carries
`engine: "cantera-3.2 transient CSTR"`. These trajectories are never
labeled OpenMKM output. OpenMKM remains the separate steady-PFR reference.
The pilot also cross-anchors selected steady CSTR endpoints between Cantera
and OpenMKM (`type: cstr`, isothermal, matched volume/flow).

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

# retrain against the fixed development split and package browser inference
python tools/openmkm_dynamic/train_surrogate.py --holdout 48 --seed 7 \
    --holdout-from tools/openmkm_dynamic/models/rph-surrogate.json
python tools/openmkm_dynamic/export_web_surrogate.py
```

Requires `pip install cantera` (any 3.x; version is stamped into every
record). The pilot resumes by period value with `--resume`.

## Independent final test

The 48 development cases were used to aim the second training batch, so a
fresh set is required for the final error claim. `make_final_validation.py`
freezes 64 unused Halton conditions without reading transient chemistry,
model predictions, uncertainty, or residuals. The file records a SHA256 seal
over the exact floating-point input values.

```bash
python tools/openmkm_dynamic/make_final_validation.py \
    --output tools/openmkm_dynamic/data/targets-final-validation.json

# after the eight Cantera CI shards are merged
node tools/openmkm_dynamic/evaluate_final_validation.mjs \
    --data tools/openmkm_dynamic/data/final-validation.jsonl \
    --output tools/openmkm_dynamic/data/final-validation-report.json
```

The evaluator imports the browser's own `surrogate.js`, checks the target
seal and development-set disjointness, and applies the pre-stated gates once.
Never append final-validation rows to `canonical/design-physical.jsonl`.

## Dataset family map

| dataset | engine | what it answers |
|---|---|---|
| `tools/openmkm/data/design-results-512.jsonl` | OpenMKM steady PFR | steady operating-space surrogate (T, P, flow, feed, geometry) |
| `tools/openmkm_dynamic/data/cstr-period-pilot.jsonl` | Cantera transient CSTR | pulse-frequency dependence, radical memory, quasi-steady breakdown |
| `tools/openmkm_dynamic/data/canonical/cjh-grid.jsonl` | Cantera steady CSTR | dense `(T, tau)` CJH baseline for the dynamic surrogate |
| `tools/openmkm_dynamic/data/canonical/design-physical.jsonl` | Cantera transient CSTR | canonical RPH training and development-validation cases |
| `apps/rphcjh/data/rph-surrogate.json` | generated CJH grid + GP | dependency-free browser inference bundle |
| `apps/rphcjh/data/openmkm-pfr.json` | OpenMKM steady PFR | the visualizer's 1-D sweep |

The steady 512-case design already returned `TEST_ML_SURROGATES` (local
interpolation misses the 0.02 bar). The pilot decides whether the dynamic
dimension also needs learning: scale to a 256/512-case dynamic design only
if the five pilot periods show a real deviation from the quasi-steady
blend.

## Historical pilot result (2026-08-14)

These original ratios used a time-weighted quasi-steady denominator while
the transient conversion was outflow-weighted. They are retained as the
historical pilot record, not as current surrogate labels. The canonical data
uses the corrected outflow-weighted definition on both sides.

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
