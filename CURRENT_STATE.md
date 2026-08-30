# Current state

Read this file before using the dynamic-chemistry study.

## Decision in force

The wide GRI-Mech study is a **legacy low-fidelity corpus**. It remains useful
for code development, surrogate architecture, and a later multi-fidelity model.
It does not establish a physical biogas optimum, a fixed-MFC operating map, or
an energy-optimal device.

No bulk campaign may start from these files. Follow the run gates in
`CLAUDE.md` and `AGENTS.md`.

## What is current

| item | status | use |
|---|---|---|
| browser RPH/CJH visualizer | shipping, narrow prescribed model | interactive illustration only |
| `models/wide-surrogate-atlas-v4.json` | last legacy wide model | development reference, not a final model |
| v4 development gate | 1,137 training and 199 development cases | internal diagnostic only |
| `targets-final4-200.json` | unopened | preserve as a legacy fixed-tau test set; do not open for the new model |
| GRI steady and transient records | retained | low-fidelity data and regression cases |
| Aramco schema-2 audit | implemented for new runs | required before any new Aramco campaign |

The v4 model and every result in `data/wide/` use a prescribed temperature
trajectory, constant-pressure CSTR, and instantaneous mass-based `tau_s`.
They are not a fixed-inlet-MFC model.

## Blocking physical decisions

1. Define the final reactor closure: fixed geometric volume, fixed inlet mass
   flow, pressure-controlled outlet, pressure, and inlet state.
2. Decide whether this paper stops at chemical yield and productivity, or also
   claims electrical energy. The latter requires two-way element-gas coupling.
3. Define the biogas composition and hardware bounds.
4. Run the required one-case ladder under the new closure before any pilot:
   analytic or nonreacting, reacting GRI, then paired Aramco with full
   whole-mechanism carbon accounting.

A changed closure, objective, mechanism, or design axis creates a new model.
Do not transfer the legacy model's feature importance, optimum, domain gate,
or sealed test to it without a direct validation.

## Data map

- `data/feed-grid/`: steady GRI CSTR atlas, indexed by temperature and
  mass-based residence time. Low-fidelity only.
- `data/wide/`: legacy wide-box transient GRI campaigns, targets, gates,
  reports, and historical optimization outputs. Read its README before use.
- `data/canonical/` and `data/runs/<commit>/`: earlier narrow-model
  provenance layout. These records remain immutable historical evidence.
- `models/`: serialized legacy model snapshots. Version suffixes describe
  acquisition rounds, not publication-ready releases.

## Known limits of the legacy wide study

- `tau_s` is held constant by changing mass flow every phase step. It is not
  an MFC setpoint.
- The prescribed element temperature does not receive reaction or process-gas
  heat feedback. Existing `kg/kWh` outputs are screening bookkeeping, not a
  closed device-energy result.
- GRI-Mech 3.0 omits the larger gas-phase carbon pool that appears in Aramco.
  Historical C2H2 yields are not physical product-yield claims.
- Pre-schema-2 records retain only eleven named trajectory species. New Aramco
  results must include the whole-mechanism carbon audit and mechanism hash.

## Historical results

The files named `final`, `final3`, `pulsefront*`, `basin*`, and
`objective-survey*` record completed development rounds. They are not current
optimization conclusions. Preserve them for auditability; do not cite or extend
them as though they belonged to the next fixed-flow model.

## Next permitted action

Write and approve a run card for the new closure. Its first execution may only
be the one-case validation ladder stated above. No validation set is opened and
no surrogate is retrained before that ladder passes.
