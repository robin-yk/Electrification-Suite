# Legacy wide-box GRI data

This directory is an audit trail for the wide prescribed-temperature,
constant-pressure, mass-based-`tau_s` GRI-Mech study. It is not the input
directory for the next fixed-inlet-flow model.

Read `../../../../CURRENT_STATE.md` first.

## What may be reused

| files | status | permitted use |
|---|---|---|
| `design-wide-pilot-*`, `design-wide-batch2-*`, `design-wide-aimed-*` | legacy transient GRI labels | low-fidelity training, regression, and mechanism-comparison anchors |
| `atlas-qs-sidecar.json` | legacy quasi-steady baseline | code reference only until the new closure is validated |
| `models/wide-surrogate-atlas-v4.json` and `gate-wide-surrogate-atlas-v4.json` | last wide model and gate | development reference only |
| `targets-final4-200.json` | unopened fixed-tau GRI target set | preserve unopened; it cannot validate a new fixed-flow model |

## Historical, not current conclusions

- `basin-*`, `pulse-optimizer-*`, `pareto-sweep-*`, `yield-front.json`,
  `objective-survey*`, and `plain-numbers-*` use the legacy closure.
  They are diagnostic records, not a physical operating map or energy result.
- `final-test-report.json`, `final3-test-report.json`, and
  `pulsefront*-roundtrip-report.json` record earlier development tests.
  Their labels must not be reused as final validation after a model change.
- `targets-final-200.json`, `targets-final3-200.json`, and
  `targets-validation-200.json` are opened historical sets.
- `targets-pulsefront*`, `targets-aimed*`, and `targets-pinned-duty.json`
  are acquisition batches from previous development rounds.

## Naming

A `-w0` through `-w3` suffix is a deterministic CI shard. Keep all shards
in a family together. A family name such as `aimed2` or `pulsefront3`
identifies a past acquisition round, not a model version to extend.

## Do not do this

- Do not train a new fixed-flow model directly from these labels.
- Do not open `targets-final4-200.json` for the new model.
- Do not treat a report here as a final physical, energy, or Aramco result.
- Do not delete historical shards merely because a later round superseded them.

New campaigns need a separate directory and a committed run card. They must use
the whole-mechanism carbon schema introduced in `run_cstr_case.py`.
