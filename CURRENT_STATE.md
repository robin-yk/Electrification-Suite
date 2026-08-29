# Current state

One page. Read this first; do not re-read the repository to reconstruct it.

## Sequence in force

low-duty support -> freeze model -> new sealed validation -> optimization.
Nothing outside this sequence: no figures, no web changes, no CJH comparison.

## Model

| | |
|---|---|
| development model | `models/wide-surrogate-atlas-v3.json` (sha 9c38ad5545ec) |
| training cases | 1137 (pilot 479, batch2 486, aimed 60, aimed2 40, aimed-lowduty 60, pinned-duty 12) |
| development gates, 199 validation cases | x_ch4 0.00583/0.01918/0.04620, x_co2 0.00620/0.02815/0.06345, y_c2h2 0.00271/0.00933/0.03608, y_co 0.00239/0.00995/0.02616 (mean/p95/max, gates 0.02/0.05/0.10) |
| frozen domain gate | `data/wide/gate-wide-surrogate-atlas-v3.json`, worst-target posterior sigma <= 0.7409 |
| status | DEVELOPMENT. Not a final model. No optimum is claimed from it. |

v3 is superseded once the 160 recomputed labels land; that model will be v4.

## Data

| | |
|---|---|
| Cantera transient cases | 1849 converged, 56 files, `data/wide/design-wide-*.jsonl` |
| quasi-steady sidecar | `data/wide/atlas-qs-sidecar.json`, 1849 cases |
| element node cache | x1 grid, 2399 feasible nodes, duty 0.02 to 0.85 |
| sweep candidates | 406449 |
| sealed, never opened | `data/wide/targets-final4-200.json` (block 8400001, seed 20260904) |

Index blocks in use: 2000001 wide walk, 3000001 validation, 4000001 aimed,
5000001 final, 6000001 frontier2, 6100001 aimed2, 6300001 frontier (relabelled),
7000001 final3, 8000001 pulsefront, 8100001 pulsefront2, 8200001 pulsefront3,
8300001 aimed-lowduty, 8350001 pinned-duty, 8400001 final4 sealed,
8500001 pulsefront4, 8600001 pulsefront5 (withdrawn, no truths). Never reused.

## Gates passing

`python tools/openmkm_dynamic/preflight.py --model <model>` runs all four.

- time grid: 12 extreme conditions against an 8x reference, worst yield error 0.57 percent against a 1 percent gate; peak resolved within 5 K everywhere
- thermodynamic floor: caps q_C2H2 0.249, q_CO 0.815 kg/kWh from the reaction enthalpies
- domain: frozen sigma gate exists and is calibrated on held-out cases
- indices: 1868 indices, 0 carrying two different sets of conditions

## Next

1. finish recomputing the 160 audit-flagged labels, rebuild sidecar, train v4
2. recalibrate and freeze the v4 gate, rerun preflight
3. basin map, then per-basin Bayesian optimization with Cantera in the loop
4. only then open final4 and any further sealed set

## Standing rules beyond CLAUDE.md

- Validation lives in code, state lives in this file, chat carries decisions only.
- No campaign starts until preflight passes.
- Do not recompute data or caches whose inputs are unchanged.
- Explain physics only from a diagnostic's output, never from a guess.
