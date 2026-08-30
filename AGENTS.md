# Codex instructions

Read the root `CLAUDE.md` completely before working in this repository. Its
commands, architecture rules, validation requirements, generated-file rules,
commit conventions, traps, and the section `Surgical changes and expensive
research runs` all apply to Codex. If this file and `CLAUDE.md` differ, follow
the stricter rule and report the conflict.

## Surgical work

Make the smallest change that fully solves the request. Read the target, its
callers, its tests, and the outputs it invalidates before editing. Do not
refactor adjacent code, rename unrelated symbols, redesign interfaces, or
regenerate unrelated artifacts.

Preserve unrelated user changes. Use `rg` for search and `apply_patch` for
local file edits. Do not use destructive Git or filesystem commands without
explicit approval.

## Expensive research runs

Do not launch a bulk simulation, retraining run, sweep, active-learning batch,
or optimization campaign until every gate in `CLAUDE.md` passes. Follow this
order:

1. Freeze the research question and claim boundary.
2. State the physical and chemical closures.
3. Pass an analytic or nonreacting case.
4. Pass one reacting low-fidelity case.
5. Pass one paired higher-fidelity case.
6. Pass mass, elemental, and numerical-convergence checks.
7. Run a small pilot.
8. Use a learning curve to justify more samples.
9. Obtain the human author's approval for the run count and estimated cost.

Stop when a gate fails. Preserve completed outputs and prevent queued follow-on
jobs from starting. Do not diagnose an unexpected result as physics before
checking bookkeeping, units, convergence, closure, and domain support.

Any run expected to exceed 20 cases or 10 CPU-minutes requires the committed run
card specified in `CLAUDE.md` and explicit human approval. Do not produce
citable data with an uncommitted scratch script.

A changed reactor closure, mechanism, objective, or design axis defines a new
model. Do not transfer feature importance, validation status, optimum points,
or sealed tests without proof. A test set is no longer sealed after its result
influences development.
