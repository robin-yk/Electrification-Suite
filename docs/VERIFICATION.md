# Numerical verification of the 2D solvers

This document verifies that the two 2D finite-volume solvers solve their
discretized equations correctly, separately from the *physical* validation
against published reactors (the cross-check panels in the Joule tool and the
experimental calibration in the microwave tool). Code verification asks a
narrower question: given the model equations, does the discrete solution
converge to the exact one at the expected rate?

Everything below is reproducible:

```bash
npm run verify:joule       # ~20 min (the finest physical-case grid dominates)
npm run verify:microwave   # ~12 min
npm test                   # includes fast guard tests on the coarse grid pairs
```

The only solver change made for verification is a test-only hook,
`cfg.verificationSource(r, z)`, which replaces the Joule source term with a
prescribed volumetric source for manufactured-solution runs. The pages never
set it.

## Methods

Four standard techniques are used:

1. **Discrete exactness**: a uniform volumetric source with constant
   conductivity has an exactly parabolic radial temperature profile, and a
   conservative two-point-flux FV scheme reproduces quadratics exactly at cell
   centers. Any mismatch is therefore *physics left in the setup* (finite-rod
   axial leakage), not discretization error, and must vanish as the element is
   made longer.
2. **Analytic multi-layer benchmark**: mid-plane temperature drops across the
   element / wall / surrounding-air layers versus the ln-resistance solution
   of an infinite cylinder.
3. **Manufactured solution (MMS)**: a smooth exact solution
   T\*(r,z) = T_a + A·(1−(r/R_d)²)²·(1−(2z/H_d)²)² is imposed by injecting the
   analytically derived source q = −k∇²T\* on a uniform-conductivity domain
   (element k = wall k = gap k = outside-air k) with radiation and convection
   off. The quartic bump vanishes with zero slope on every outer boundary, so
   the solver's ambient boundary handling is exactly consistent with T\*. L2
   and L∞ errors against T\* measure the observed convergence order.
4. **Grid sensitivity of the shipped default cases**: the full nonlinear
   models (radiation, He purge flow, temperature-dependent properties) on a
   doubling grid sequence.

## Joule solver (`apps/joule/solver.js`, `solveThermal2D`)

### 1. Radial parabola: discrete exactness

Constant-k SiC, uniform Joule source, gap 0. The analytic center-to-surface
rise is q·R²/(4k); the worst relative mismatch of the mid-plane radial profile
against the exact parabola:

| case | worst relative mismatch |
| --- | --- |
| L/D = 20 | 5.8e-3 |
| L/D = 40 | 3.2e-4 |
| L/D = 80 | 2.5e-5 |

The mismatch collapses by more than an order of magnitude per doubling of L/D. It is the physical axial
curvature of a finite rod, not discretization error. At L/D = 80 the discrete
radial operator reproduces the exact solution to 2.5e-5.

### 2. Multi-layer annulus vs ln-resistance theory

Radiation and convection off, 2 W fixed power, layers element (k = 120) /
quartz wall (k = 1.4) / air (k = 0.026), drops measured at the mid-plane
against the piecewise analytic solution:

| L/D | worst layer error |
| --- | --- |
| 20 | 16% |
| 50 | 4.7% |
| 100 | 0.8% |

The error is a uniform flux deficit across all layers (axial leakage carrying
part of the power to the ends), shrinking toward zero as the cylinder
approaches the infinite-length limit; the multi-region conduction assembly
(material interfaces, harmonic series resistances, cylindrical metrics) is
consistent with theory.

### 3. Manufactured solution: observed order

| grid | L2 error (K) | L∞ error (K) | order (L2) | order (L∞) |
| --- | --- | --- | --- | --- |
| 30×60 | 1.55e-1 | 4.19e-1 | — | — |
| 60×120 | 3.88e-2 | 1.08e-1 | 2.00 | 1.96 |
| 120×240 | 9.66e-3 | 2.74e-2 | 2.01 | 1.98 |

**Observed order 2.0 in L2, ≈2.0 in L∞**. The discretization (including the
non-uniform radial mesh, the cylindrical metrics, and the ambient boundary
treatment) is second-order accurate, as designed.

### 4. Default SiC case: grid sensitivity

The app's default inputs (1.18 cm³ SiC, L/D 1.5, quartz enclosure, He purge,
radiation on, 20 A current-limited drive):

| grid | avg T (°C) | max T (°C) | energy closure | linear residual |
| --- | --- | --- | --- | --- |
| 30×60 (default) | 846.75 | 848.41 | 8.7e-8 | 9.0e-12 |
| 60×120 | 846.35 | 848.02 | 8.3e-8 | 8.0e-12 |
| 120×240 | 846.20 | 847.88 | 8.8e-8 | 7.0e-12 |
| 240×480 | 846.15 | 847.82 | 6.5e-9 | 9.9e-12 |

Richardson on the first three grids gives an observed order of **1.45** for
average temperature (1.46 for peak), an extrapolated 846.12 °C, and a
finest-grid relative error of 9.9e-5. Repeating it on grids 2–4 gives 1.46 and
846.12 °C: the two overlapping triplets agree on both the order and the
extrapolated value, which is the check that the sequence is genuinely in the
asymptotic range rather than accidentally well-behaved on one triplet.

The order sits between first and second because the case mixes both. Conduction
and surface radiation are second-order (studies 1–3); the He purge enthalpy
balance is first-order upwind. A mixture converging at 1.45 is the expected
result, not a defect.

**Sensitivity bound: the default 30×60 grid differs from the 240×480 grid by
0.60 K in average temperature and 0.59 K in peak, i.e. 0.07% of the ~827 K
temperature rise.**

#### Why this section used to report a negative order

Until the purge advection was corrected, this study reported an observed order
of **−0.588**: the answer moved further on each refinement instead of settling
(837.40 → 833.68 → 827.12 °C on the three grids, and the advected purge power
collapsing 0.75 → 0.63 → 0.50 W). A complexity ladder on the same grid sequence
localized it to a single term:

| configuration | observed order |
| --- | --- |
| pure conduction; no gap, no purge, no radiation | +1.22 |
| radiation on; no gap, no purge | +1.16 |
| gap present, purge **off**, no radiation | +1.33 |
| gap present, purge **on**, no radiation | −0.32 |
| full default | −0.588 |

Conduction, radiation and the gap geometry all converged. Only the purge did
not, and it is the sole difference between the third and fourth rows.

The advection had given every flow cell an inflow equal to the area-weighted
mean of the whole upstream row. That homogenizes the stream radially once per
cell, so the mixing length is the mesh spacing and the mixing rate per unit
length diverges under refinement; it is not a discretization of anything. The
artifact did not stay in the gas, because the purge cells are also conduction
cells: it landed in the element-to-wall gap resistance, whose temperature drop
moved 906 → 803 → 672 K across the three grids while the heat through it barely
changed. That is what carried the element temperature down and inverted the
order. The advected power itself was never the mechanism, changing by only
0.26 W against a 57 K/W case sensitivity, worth 15 K of the observed 264 K.

Where the flow cross-section is unchanged from row to row, each cell now draws
its inflow from the cell directly upstream of it; the area-weighted mean is kept
for exactly the rows where the stream contracts or expands at the ends of the
element annulus. Both branches conserve enthalpy. `cfg.purge` was added at the
same time so the stream can be switched off without deleting the gap, which is
what makes the ladder above separable at all.

## Microwave solver (`apps/microwave/solver.js`, `solve2D`)

### Scope note

A full-domain manufactured solution is deliberately out of scope for this
solver: the tube-gas and outside-air conductivities are temperature-dependent
by design and not overridable through public parameters, so a
uniform-conductivity domain cannot be produced without modifying shipped
code. The microwave implementation is instead verified against analytic
conduction (below) and grid-refinement behavior; the shared FV pattern
(two-point flux, harmonic interface resistance) is MMS-verified in the Joule
solver.

### 1. Radial parabola: pure-conduction reduction

Public knobs alone reduce solve2D to pure conduction with a uniform bed
source: manual constant bed conductivity, radiation off, gas exchange off,
flat field shape, and a near-infinite penetration depth (the source
normalization keeps total power exact). Mid-plane bed profile vs the exact
parabola:

| case | worst relative mismatch |
| --- | --- |
| H/D = 4 | 8.7e-2 |
| H/D = 8 | 2.4e-2 |
| H/D = 16 | 2.3e-3 |

Same signature as the Joule study: the residual is finite-bed axial leakage
and collapses as the bed is made longer; the bed conduction discretization
matches the analytic profile.

### 2. Default calibrated case: grid sensitivity

The app's default reduced-rutile TiO₂ calibration case (26 W absorbed, He
flow, Looyenga dielectric mixing, wall radiation, Darcy flow on):

| grid | center T (°C) | wall T (°C) | avg bed T (°C) | energy closure | Darcy mass imbalance |
| --- | --- | --- | --- | --- | --- |
| 30×60 (default) | 811.20 | 495.71 | 622.79 | 2.4e-4 | 1.8e-13 |
| 60×120 | 804.65 | 495.74 | 621.85 | 5.0e-4 | 2.1e-13 |
| 120×240 | 788.98 | 496.13 | 618.23 | 1.0e-3 | 2.1e-13 |

Energy closure holds to ≤1e-3 of the absorbed power and the Darcy flow field
conserves mass to machine precision (~1e-13 relative) on every grid. As in
the Joule case, the sequence is not yet asymptotic (the near-wall exponential
source deposition and T⁴ wall radiation are resolved progressively), so a
sensitivity bound is reported instead of an order: **the default 30×60 grid
differs from the 120×240 grid by 22.2 K at the bed center (2.9% of the rise),
4.6 K in average bed temperature (0.8%), and 0.4 K at the wall**. The wall
temperature, which is what the experimental calibration constrains, is
grid-insensitive.

## When the 0D screening model can be trusted (`tools/verification/zerod-*.mjs`)

A model-reduction study, not verification and not validation: it measures when
the lumped 0D temperature agrees with the resolved field, so it inherits the 2D
solver's credibility and has to establish an anchor before it sweeps. Run with
`npm run verify:zerod-limit` and `npm run verify:zerod-sweep`.

### The gap is two quantities, not one

Driving Bi_R to 2.3e-6 by scaling conductivity 1000x leaves the element
isothermal — spread 0.05 K — while the 2D mean still sat **28.72 K above** the
0D steady temperature. An offset that outlives the isothermal limit is not a
lumping error, so the difference between the models separates:

| component | definition | scales with Bi_R |
| --- | --- | --- |
| offset | `T_avg(2D) − T_ss(0D)` | no |
| spread | `T_max(2D) − T_avg(2D)` | yes |

Interrogating both loss models at the *same* temperature divides out the
operating point and names the channel. At the isothermal limit the 0D network
claims 554.28 W where the resolved field carries 532.23 W (4.14%):

| path | 0D | 2D |
| --- | --- | --- |
| side | 505.03 W | — |
| end | 47.90 W | — |
| static total | 552.93 W | 532.12 W |
| He advective | 1.352 W | 0.114 W |

94% of the discrepancy is the static path. Splitting the 2D boundary terms by
channel — the instrumentation this study added — located it precisely, and it was
not the end path at all:

| path | 0D | 2D |
| --- | --- | --- |
| wall radiation + outer radial + axial | 505.03 W (`side`) | 484.49 W |
| element end radiation | 47.90 W (`end`) | 47.63 W |

The end paths agree to 0.3 W. All 20.5 W sits on the side, and the cause is that
the 0D network charged `2 pi r_out * domainHeight` of radiating area to the
near-element wall temperature. The wall is not isothermal over the domain: it is
heated across the element's length and cools away from it, so the overhang was
being counted as hot radiating area.

**Fixed** by treating the overhang as a radiating fin, contributing
`tanh(m*margin)/m` of effective length per side with `m = sqrt(hP/kA)` evaluated
at the current wall temperature inside the existing bisection. The isothermal
limit then reads:

| | before | after |
| --- | --- | --- |
| offset at Bi_R = 2e-6 | +28.72 K | **−8.90 K** |
| loss agreement | +4.14% | **−1.23%** |

The correction slightly overshoots, leaving the 0D 1.2% *under* the resolved
field. Two residuals remain and are named rather than tuned away: the side path
is now 8.1 W low, and the He advective terms still differ twelvefold (1.352 W
against 0.114 W) because the 0D carries downstream cooling on the element end
area alone, where the resolved exit region loses heat radially over the full
annulus.

It was derived purely from 0D-versus-2D consistency, with no reference to
measurement — and it moved the 0D **toward** the experiment, which is
independent support for it:

| case | 0D before | 0D after | measured |
| --- | --- | --- | --- |
| Wismann | 761.9 °C (−4.8%) | **787.4 °C (−1.6%)** | 800 °C |
| Zheng | 736.0 °C | 757.3 °C | not tabulated |
| Kwak | 1270.7 °C | 1276.5 °C | 1094 °C |

**Consequence for the earlier cross-check claim.** The 0D-to-2D gap on Wismann
was 49.8 K and is now 24.3 K. Roughly half of what had been reported as the 2D
resolving something the lumped model could not was this network's own
over-prediction of wall radiating area.

### Control: the closed form is reproduced exactly

For a cylinder of radius R with uniform volumetric generation — which is what the
solver applies, since `qVol = pBulk / envelopeVolume` carries no local ρ(T)
coupling — the hand derivation gives

    centre-to-surface / surface-to-ambient  =  h R / (2k)  =  Bi_R / 2

Scanning k over 32× returns a measured ratio that is a **constant 0.93333** of
that. The constancy is the tell: cell-centred unknowns are sampled h/2 inside
each boundary, which shortens the drop by exactly `1 − 1/N`, and N = 15 here.

| test | raw | corrected for `1 − 1/N` |
| --- | --- | --- |
| parabola, `(centre−surface) / (qR²/4k)` | 0.93260 | **0.99921** |
| ratio, through-origin slope on Bi_R/2 | 0.93333 | **0.99999** |

The apparent 7% deficit is where the unknowns sit, not solver error.

### The sweep

Bi_R is scanned one factor at a time — k, emissivity and drive current
separately — with Bi_R computed from the 2D solve's own side loss and surface
temperature so both sides of the ratio refer to the same operating point.

| stage | what varies | slope on Bi_R/2 | R² | n | Bi_R range |
| --- | --- | --- | --- | --- | --- |
| 3a | k, ε, current (SiC, L/D 30) | 0.9374 | 1.0000 | 48 | 2.9e-4 … 5.8e-2 |
| 3b | 4 materials, power-matched | 0.9374 | 1.0000 | 12 | 2.6e-3 … 3.5e-2 |

Both land on the same 0.937 the control explained, across a 200× range of Bi_R
and materials whose conductivity spans 11 to 174 W/m·K. **Corrected for
sampling, `spread / rise = Bi_R / 2` holds exactly and is material-free.**

### Aspect ratio is a second group

The hypothesis that Bi_R alone predicts is **rejected**. Holding Bi_R by
construction and sweeping L/D:

| L/D | 1.5 | 4 | 10 | 30 | 60 |
| --- | --- | --- | --- | --- | --- |
| f(L/D) | 0.649 | 0.799 | 0.939 | 1.000 | 0.9995 |

f rises monotonically and saturates near L/D ≈ 20 — a factor of 1.54 across the
range. Short elements shed heat axially, which relieves the radial gradient the
lumped model cannot see. So the law carries a correction:

    spread / rise  =  (Bi_R / 2) · f(L/D)

Because f ≤ 1 everywhere swept, **Bi_R/2 remains a conservative upper bound**,
which is the form worth applying:

    Bi_R  ≤  2 ΔT_allowed / (T_avg − T_ambient)

At a 2000 K rise, holding the unseen spread under 25 K needs Bi_R < 0.025. The
textbook Bi < 0.1 rule — derived for transient cooling of an initially uniform
body, not for steady internal generation — admits 5% of the rise, i.e. 100 K at
that same operating point, and is **four times too permissive here**.

### What this does not license

The sweep figures quoted here predate the fin correction: with the old network
the offset was frequently *larger* than the spread (39.9 K against 5.2 K at
Bi_R = 3.9e-4) and changed sign at low emissivity with a high drive. The
correction cuts the isothermal-limit offset by 3.2x, so the offset is no longer
the dominant term in most of the sweep — but it does not reach zero, and it still
does not scale with Bi_R. **A Biot criterion remains necessary and not
sufficient**, and must be quoted with the residual offset. The spread-side
results above are unaffected: the fix touches only the 0D network, so every 2D
quantity, and therefore every slope, R² and f(L/D) in this section, is
unchanged.

Two reporting defects were found and fixed inside this study, both of the same
shape — a summary statistic agreeing with the hypothesis while the rows
underneath disagreed. A single fit through every aspect ratio averaged the f
trend away and printed a pass; and `MATERIALS.find(m => m.name === "Kanthal
A-1")` missed an entry reading `"Kanthal A-1 (FeCrAl)"` and dropped a material in
silence, the fit returning n = 9 instead of 12 with nothing said. Both stages now
print every point and name every drop.

## Microwave field solve (`apps/microwave/solver.js`, `solveField2D`)

Opt-in through `p.fieldMode = "helmholtz"`; the shipped default still uses the
fitted source, because switching over changes every number the page reports and
the bed conductivities on the Calibration tab were fitted against the old shape.

### Why a field solve is tractable here

At 2.404 GHz the free-space wavelength is 124.7 mm, and SiC at eps' = 7.96 brings
it to 44.2 mm inside the bed. A 10 mm bed therefore spans **D/lambda = 0.23**, so
the load supports no internal cavity mode and nothing outside it needs meshing,
and the existing 0.5 mm cells already give **88 per wavelength**. What is solved
is the scalar Helmholtz problem for an axial E,

    (1/r) d/dr ( r dE/dr ) + d2E/dz2 + k0^2 eps(T,r,z) E = 0

on the temperature mesh, as a complex system in real 2N block form with an exact
per-cell 2x2 Jacobi preconditioner. Stated limits: the scalar form is exact for
eps varying with r alone and drops a grad(eps) coupling; the incident field is
taken uniform and imposed on the domain boundary; and the absolute coupling
efficiency is still not predicted, so the total is renormalised to the absorbed
power exactly as the fitted shape was.

### Control

An infinite lossy dielectric cylinder in a uniform axial field has a closed form,
`E(r)/E(R) = J0(kr)/J0(kR)` with `k = k0 sqrt(eps)` and J0 of a complex argument.
At |kR| = 0.711 the solved profile reproduces it and converges cleanly:

| grid | axis \|E\|/\|E(R)\| | exact | error |
| --- | --- | --- | --- |
| 15x30 | 1.109556 | 1.109332 | 2.02e-4 |
| 30x60 | 1.124257 | 1.124193 | **5.67e-5** |
| 60x120 | 1.131765 | 1.131749 | 1.47e-5 |

Error falls by 3.6x then 3.9x per halving — second order.

### What it changes, and a correction

Power density on the axis relative to the bed edge:

| | axis / edge |
| --- | --- |
| exact (refraction) | 1.264 |
| shipped fitted source | 1.809 — **43% too peaked** |
| its Beer-Lambert skin alone | 0.969 |

The centre peaking is real physics: refraction into a subwavelength load. An
earlier reading of this comparison quoted the skin factor alone, concluded the
shipped source was edge-peaked and therefore had the sign wrong, and was mistaken
— the fitted Gaussian in front of it dominates and peaks the source hard on the
axis. The skin term does have the sign backwards, but at delta = 140 mm against a
5 mm radius it moves the source by 3.2% and nothing rests on it.

The real finding is that the shipped model obtains a genuine physical effect from
a **fitted width** rather than from the field, and overshoots it by half again.
The temperature consequence is modest — centre 473.8 -> 469.6 C, spread 35.7 ->
29.7 K on the SiC default — but `fieldWr` stops being a free parameter, and the
bed conductivities fitted against a 43%-too-peaked source were absorbing that
error, so refitting them against the solved field is what makes those numbers
mean what they claim.

## Continuous guards

`tests/verification.test.js` (run by `npm test` and CI) keeps the headline
results true as the solvers evolve, using the cheap grid levels only:

- Joule parabola mismatch < 2e-3 at L/D = 40 and collapsing ≥4× by L/D = 80;
- Joule annulus worst-layer error < 8% at L/D = 50, < 3% at L/D = 100;
- Joule MMS observed order > 1.7 (L2) / > 1.6 (L∞) on the 30×60→60×120 pair;
- Microwave parabola mismatch < 5% at H/D = 8, < 1% at H/D = 16.
