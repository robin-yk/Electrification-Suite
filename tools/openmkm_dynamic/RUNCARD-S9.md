# Run card: Fig. S9 reaction orders on AramcoMech 2.0

Required by `CLAUDE.md` because the campaign exceeds ten CPU-minutes. Written
and committed before the run starts, with the generator
`tools/openmkm_dynamic/run_s9_orders.py`.

## Purpose

Table S1 of the SI reports fifteen power-law exponents, five species across
three series, each with an R squared. This campaign computes the same fifteen
from AramcoMech 2.0 and compares them.

The question is not whether the model can reach a measured state. The premise
check already showed it can: at the paper's conditions Aramco reproduces
`S_C2H2` near 80 percent with `S_C6H6` under 5 percent, which GRI-Mech cannot
express at all. The question here is whether the model moves correctly when a
knob moves. An exponent is a derivative, and a derivative is what an optimizer
consumes. A model that lands on one measured point but responds wrongly to a
change in feed will rank two candidate designs wrongly, and every optimum built
on it is then an artefact of the model rather than a property of the device.

This gate therefore decides whether any surrogate or optimization work over
Aramco is worth starting.

## Claim boundary

Passing licenses one statement: over the feed range 5.06 to 40.24 kPa, at 70 V,
5 percent duty, 1 Hz, in a constant-pressure CSTR at fixed residence time, this
mechanism reproduces the measured sensitivity of these five species to feed
partial pressure. It licenses nothing about absolute rates, about temperatures
outside the calibrated element trajectory, about residence times other than the
one run, or about the plug-flow limit.

## Inputs

| | value | source |
|---|---|---|
| mechanism | AramcoMech 2.0, 493 species, 2716 reactions | `tools/cantera/mechanisms/aramco20.yaml`, sha256 recorded per case |
| drive | 70 V, 1 Hz, 5 percent duty | SI, Table S1 caption |
| waveform | `physical`, integrated from the element energy balance | not a drawn trapezoid, see below |
| element loss scale | `si`, fitted, not typed | `calibrate_element_si.py` |
| element trajectory | T_peak 1729 C, T_min 525 C, T_avg 839 C | output of the above at 70 V |
| pressure | 1 atm | SI, Flow Control |
| residence time | 0.2 s, fixed across every case | assumption, see risks |
| diluent | helium | SI, Flow Control |
| CO2 series | CH4 at 5.06 kPa, CO2 5.06 to 40.24 kPa, 5 points geometric | SI, Table S1 |
| CH4 series | CO2 at 5.06 kPa, CH4 5.06 to 40.24 kPa, 5 points geometric | SI, Table S1 |
| proportional series | CO2/CH4 = 1, both 5.06 to 40.24 kPa, 5 points | SI, Table S1 |
| unique conditions | 13, the corner being shared by all three series | `run_s9_orders.py plan` |

The waveform matters and is the reason this campaign is not a rerun of the
twelve premise cases. Those used a trapezoid with flat plateaus at both ends.
Scheme S1e shows the element is a sawtooth with no dwell anywhere, so the
premise cases held the gas at peak far longer than the device does, in a
pathway whose whole argument is about time at temperature.

## Outputs

Schema 2 case files in `data/s9/`, one per condition, each carrying the
mechanism hash, the whole-mechanism carbon audit, the element loss scale and
the temperatures actually reached. Then a fit report from
`run_s9_orders.py fit --report`.

## Acceptance gates

1. Every case converges to a periodic state and closes C, H and O against the
   reactor inventory change.
2. Exponents are compared, intercepts are not. The rate constant `a` is quoted
   in g/h, which needs a void volume that neither the paper nor the SI gives.
   A constant scale shifts `a` and leaves `n` alone, so the exponents survive
   the missing volume and the intercepts cannot be compared at all.
3. Four of the fifteen published exponents were fitted with an R squared below
   0.62, one at 0.1242. There the experiment resolved no dependence, so those
   rows are reported and excluded from the gate. Eleven are gated.
4. A gated exponent passes within 0.35 absolute. That is loose on purpose:
   these are single-reactor idealisations of a flow past a strip, and the
   published fits themselves scatter.
5. Sign agreement on every gated exponent is a separate and harder requirement
   than magnitude. A sign flip means the model moves the wrong way, which no
   tolerance excuses.

Failing gate 1 stops the campaign. Failing gates 4 or 5 does not stop it: the
run completes and the result is reported as a failed validation, because
knowing which species the mechanism gets wrong is the useful output either way.

## Estimated cost

13 cases. The premise campaign measured 413 s per Aramco pulsed case at 6
substeps per phase point; ladder rung 3 is running the exact settings of this
campaign and will replace that figure before the run starts. At 413 s the
campaign is about 90 minutes wall clock, single process.

## Cache policy

`run_s9_orders.py run` skips any condition whose output file already exists and
prints it as cached. `--force` recomputes. A failure preserves everything
already finished and stops rather than leaving a partial campaign that later
reads as a whole one. The thirteen conditions are keyed by their two partial
pressures, so the shared corner is computed once and read by all three series.

## What this invalidates

Nothing. The campaign writes only to `data/s9/`, a directory that does not yet
exist. The twelve premise cases in `data/premise/` are left in place; they were
run on a trapezoid at 1400 to 1500 C and are not comparable with these, and the
premise document already says so.

## Risks and what is assumed rather than known

- **Residence time.** 0.2 s is chosen, not measured. `VOID_CM3 = 11.03` in
  `pulse_common.py` has no source in either document, and no residence time is
  published. The exponents are the ratio of a response to a change in feed at
  fixed tau, which is less sensitive to that choice than any absolute yield,
  but it is not insensitive. If the campaign fails, repeating one series at a
  different tau is the first diagnostic, not the last.
- **CSTR against a flow past a strip.** At matched conversion the plug-flow
  limit produced markedly less benzene in the premise check. The idealisation
  is not neutral for the benzene rows in particular.
- **One-way coupling.** The element trajectory is prescribed and receives no
  reaction heat. At the richest feeds, 40 kPa of hydrocarbon, the endothermic
  load is far larger than at 5 kPa, and the real element would sag where this
  model does not. This biases the high-pressure end of the CH4 and proportional
  series, which is exactly where their exponents are set.
- **No condensed phase.** Results carry `solid_carbon_modeled: false`. The C4
  and C6 numbers are gas hydrocarbons and are not soot. The experimental carbon
  balance itself declines above 1150 to 1200 C where solid carbon appears, and
  this element runs to 1729 C.
- **Benzene is quantified semi-quantitatively.** The SI says so: the FID uses
  Effective Carbon Number response factors for species lacking a standard. The
  C6H6 exponents carry that on the measured side.
