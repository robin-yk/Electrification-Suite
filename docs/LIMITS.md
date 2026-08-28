# Limits

What these models do not do, and when not to use them.

Every model is wrong somewhere. The useful distinction is whether its author
knows where. This file is the single place that says so; the per-tool notes and
`VERIFICATION.md` expand on individual entries. Each item states the modelling
choice, what it therefore cannot answer, and the case where trusting it would
be a mistake.

Numbers quoted here are measured, not estimated. Where a claim comes from a
convergence study or a published measurement, it says so.

## The largest uncertainty is not numerical

For every tool here, the material data dominates the discretization error, and
usually by more than an order of magnitude.

The Joule 2D field, on its shipped default case, sits **0.60 K** from a grid
four times finer in each direction, which is 0.07% of the temperature rise
(`VERIFICATION.md` §4). The resistivity that case is computed from is labelled
in the source as a **"constant grade proxy"**. Commercial SiC elements vary
between grades by far more than 0.07%.

Several presets say the same thing about themselves:

| preset | what its data actually is |
| --- | --- |
| SiC | constant grade proxy, no ρ(T) |
| SiSiC | 550 to 750 °C from Zheng et al. (2022); the room-temperature branch is a commercial-element proxy |
| CFP, 304 stainless, Mo, W, Ti | Mittal et al. (2025) Table 1, room temperature, constant |

**Do not** quote an absolute temperature from any of these against a
measurement without substituting a datasheet or measured property first. The
tools are built to compare designs, where a shared property error largely
cancels, not to predict one design in isolation.

## Joule 2D field

### Grid convergence is bounded, not eliminated

Observed order 1.45 on the shipped grid sequence, stable across two overlapping
grid triplets, extrapolating to 846.12 °C. The shipped 30×60 grid is 0.60 K
from a 240×480 solve.

The order is between first and second because the case mixes both: conduction
and surface radiation are second order, the He purge enthalpy balance is
first-order upwind.

**Do not** read more than about 0.6 K of significance into a Joule 2D
temperature on the default grid, or compare two cases whose difference is
smaller than that without refining both.

### The purge stream is a mixing cup, not a flow field

The 50 sccm helium is carried as a one-dimensional upwind enthalpy balance at
fixed total capacity rate. There is no velocity profile, no boundary layer, and
no buoyancy. Where the flow cross-section changes, at the ends of the element
annulus, the stream is treated as fully mixed across the row.

**Do not** use it to answer anything about the gas itself: local gas
temperature, residence time distribution, or any convective coefficient. It is
there so the element's heat balance has somewhere to lose heat, and it is
first-order accurate at that.

### Porosity is a mean, not a structure

The mean solid fraction is deliberately **not** treated as a porosity in the
conductivity closure. That gate is `material.kIsSkeleton`, and no shipped
material sets it. The reason is recorded at `elementK()`: `solidFraction` is
overloaded across the shipped cases, and feeding it to a dispersed-pore model
moved the Wismann tube's 2D peak from 818 to 852 °C against an **800 °C
measurement**, away from the experiment.

`cfg.porosityContrast` adds a radial variation about that mean, normalized so
the volume-averaged solid fraction is unchanged. It defaults to zero.

**Do not** expect pore-scale current or heat concentration. The contrast knob
is a reactor-scale caricature of a dense skin or dense core; it is not
homogenization from a pore geometry, and setting it is itself an assertion that
the element really is a porous body.

### A rectangular element is solved as an equivalent cylinder

`equivalentCylinder()` substitutes a cylinder that preserves the box's surface
area, mass, length, and electrical resistance, by scaling density and
resistivity. The mesh is axisymmetric, so the box itself is never meshed.

What that preserves is every lumped quantity: heat loss area, thermal mass,
total resistance, and therefore the operating point and the steady mean
temperature. What it does not preserve is the conduction path to the surface. A
slab loses heat across its half-thickness; the equivalent cylinder loses it
across a radius. For a thin strip those differ by a lot.

**Do not** read the internal temperature spread, the peak-to-mean difference,
or anything about a thin foil's through-thickness gradient from a box case. The
mean is meaningful; the spread is not.

### The transient is first order in time

Backward Euler, observed order 0.97 and 0.99 on the two overlapping step
triplets, approaching first order from below
(`node tools/verification/joule-transient.mjs`). First order is the intended
trade: A-stability is what makes a browser-affordable step possible against a
stiff radiation boundary.

The order is measured from consecutive solutions. Measured instead against the
study's own fine reference it reads 1.01 to 1.09, which looks better than first
order and is not: that reference is only eight times finer than the coarsest
step compared to it, so its error inflates the slope by about the whole
apparent excess. The reported figure is the one with no reference in it.

The step-integrated drive means a coarse step carries the right cycle-averaged
energy, but not the waveform.

**Do not** read a pulse's peak or its shape from a march with fewer than about
twenty steps per cycle; the tab warns when there are fewer. The cycle average
is still right.

### A pulse train needs a period the element can follow

The element's lumped relaxation time is `elementTimeConstant()`. It depends on
the material as much as the envelope: the shipped default relaxes in about
41 s as dense SiC and in 7.6 s as CFP in the same envelope, because CFP is a
seventh of the mass. A drive whose period is well under that is integrated by
the element, which then responds to the mean: at 0.13 τ the swing was 2.9 K on
a 42 K rise. No time step changes this, and the tab now says so before it asks
for more steps.

**Do not** expect this tab to reproduce rapid pulsed heating on a thin foil.
The RPH element in the companion paper is a 38 × 8 × 0.21 mm strip relaxing in
0.135 s, eighteen times more surface per unit volume than the bodies this mesh
is built for. For that regime the RPH vs CJH tool's lumped integration is the
right instrument.

### Contact resistance is lumped, and its heat leaves the field

`cfg.contactRho` contributes to the operating point and is reported as
`pContact`, but it is deposited outside the 2D element rather than at the
electrode faces.

**Do not** use this tool to study electrode contact heating or its local
thermal effect.

## RPH vs CJH visualizer

### It is dimensionless and lumped

Rates, transport, and velocity are normalized ratios; the element has no
internal spatial structure. The physical CFP drive adds a real element's
resistance, heat capacity, and losses, but still as a single lump.

**Do not** ask it about temperature gradients inside the element, or about
anything where the element is not thermally thin.

### The series network is a caricature

A → B → C with Arrhenius rates in an ideal CSTR. It is there to isolate the
Jensen's-inequality effect of pulsing on a selectivity, not to predict a real
mechanism's yield.

**Do not** read an absolute yield or selectivity from it.

## What none of these models do

- Chemistry coupled to the thermal field. No reaction heat, no conversion
  feeding back on temperature.
- Mechanical stress, thermal expansion, or failure.
- Buoyancy or forced convection inside the element.
- Electrode, lead, or bus-bar thermal and electrical behaviour.
- Any claim about a specific commercial product.

## Tooling marked under development

`tools/openmkm/` and `tools/openmkm_dynamic/` are an unfinished study of
whether pulsed heating needs a learned surrogate. They are not wired to any
page, their reactor closure and memory tests are open, and each directory's
README states what is blocked before its numbers mean anything. **Do not
cite them.**
