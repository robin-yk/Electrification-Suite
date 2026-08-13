# OpenMKM PFR sweep pipeline

Generates `apps/rphcjh/data/openmkm-pfr.json`: a steady plug-flow-reactor
sweep over heater-element temperatures, computed with the Vlachos group's
[OpenMKM](https://github.com/VlachosGroup/openmkm) reactor code. The RPH vs
CJH visualizer's "OpenMKM PFR" tab loads this table and blends the steady
states client-side (quasi-steady approximation), so the sliders stay
interactive while the chemistry comes from a full reactor solution.

## Why steady states cover pulsed heating

The hot zone's residence time is milliseconds; RPH pulse periods are ~1 s.
The reactor is therefore quasi-steady at every instant of the pulse, and a
two-state pulse's time-averaged output is the duty-weighted blend of the
steady outputs at T_peak and T_min. That blend is computed in the page from
this 1-D table; no waveform-dependent case matrix is needed.

## Model

- Steady 1-D PFR, gas phase only (no surface phase), GRI-Mech 3.0
  (`mechanisms/gri30-ct25.yaml`, the Cantera-2.5-format copy shipped with
  OpenMKM's examples; the fork cannot read Cantera-3.x YAML).
- Axial temperature profile via OpenMKM's `tprofile` mode, mirroring the
  visualizer's animation: 673 K feed, ramp into the element plateau
  (2–3.5 cm), quench, exit at 6 cm; 1 cm², 50 cm³/s, 1 atm, CH4:CO2 = 1:1.
- Element plateau swept 400–1400 °C in 50 °C steps (21 steady solves,
  ~2 s each).
- Outputs per case: outlet mole fractions, mass-fraction-based CH4
  conversion (exact under mole-number change), carbon-basis C2 selectivity.

GRI-3.0 is a combustion mechanism used here outside its validation range:
trends and the convexity argument are meaningful, absolute conversions are
not. The tab says so on screen.

## Building `omkm`

OpenMKM must be compiled from source against its Cantera 2.5 fork
(`mbkumar/cantera`, branch `openmkm`). `build.sh` automates the whole thing
on a modern toolchain, carrying two source patches (`patches/`) plus two
config-level fixes for 2019-era code on gcc ≥ 10 / Python 3.11 / Boost ≥ 1.83:

```bash
tools/openmkm/build.sh ~/openmkm-build
# → ~/openmkm-build/openmkm/src/build/omkm
```

Alternatively, on a machine with Docker: `docker pull vlachosgroup/openmkm`.

## Usage

```bash
python tools/openmkm/run_sweep.py \
    --omkm ~/openmkm-build/openmkm/src/build/omkm \
    --cantera-lib ~/openmkm-build/cantera-install/lib          # regenerate
python tools/openmkm/run_sweep.py --check --omkm ... --cantera-lib ...  # verify
```

CI (`.github/workflows/openmkm-data.yml`) rebuilds `omkm` (cached on the
patch/build-script hash; only the first run pays the ~25 min compile) and
runs `--check` whenever this directory changes, so the committed JSON cannot
drift from the pipeline.

## Citation

Medasani, B., Kasiraju, S., & Vlachos, D. G. *OpenMKM: An Open-Source C++
Multiscale Modeling Simulator for Homogeneous and Heterogeneous Catalytic
Reactions.* J. Chem. Inf. Model. 2023, 63(11), 3377–3391.
