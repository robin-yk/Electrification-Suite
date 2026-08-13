# Numerical verification of the 2D solvers

This document verifies that the two 2D finite-volume solvers solve their
discretized equations correctly — separately from the *physical* validation
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

1. **Discrete exactness** — a uniform volumetric source with constant
   conductivity has an exactly parabolic radial temperature profile, and a
   conservative two-point-flux FV scheme reproduces quadratics exactly at cell
   centers. Any mismatch is therefore *physics left in the setup* (finite-rod
   axial leakage), not discretization error, and must vanish as the element is
   made longer.
2. **Analytic multi-layer benchmark** — mid-plane temperature drops across the
   element / wall / surrounding-air layers versus the ln-resistance solution
   of an infinite cylinder.
3. **Manufactured solution (MMS)** — a smooth exact solution
   T\*(r,z) = T_a + A·(1−(r/R_d)²)²·(1−(2z/H_d)²)² is imposed by injecting the
   analytically derived source q = −k∇²T\* on a uniform-conductivity domain
   (element k = wall k = gap k = outside-air k) with radiation and convection
   off. The quartic bump vanishes with zero slope on every outer boundary, so
   the solver's ambient boundary handling is exactly consistent with T\*. L2
   and L∞ errors against T\* measure the observed convergence order.
4. **Grid sensitivity of the shipped default cases** — the full nonlinear
   models (radiation, He purge flow, temperature-dependent properties) on a
   doubling grid sequence.

## Joule solver (`apps/joule/solver.js`, `solveThermal2D`)

### 1. Radial parabola — discrete exactness

Constant-k SiC, uniform Joule source, gap 0. The analytic center-to-surface
rise is q·R²/(4k); the worst relative mismatch of the mid-plane radial profile
against the exact parabola:

| case | worst relative mismatch |
| --- | --- |
| L/D = 20 | 5.8e-3 |
| L/D = 40 | 3.2e-4 |
| L/D = 80 | 2.5e-5 |

The mismatch collapses by more than an order of magnitude per doubling of L/D — it is the physical axial
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
approaches the infinite-length limit — the multi-region conduction assembly
(material interfaces, harmonic series resistances, cylindrical metrics) is
consistent with theory.

### 3. Manufactured solution — observed order

| grid | L2 error (K) | L∞ error (K) | order (L2) | order (L∞) |
| --- | --- | --- | --- | --- |
| 30×60 | 1.55e-1 | 4.19e-1 | — | — |
| 60×120 | 3.88e-2 | 1.08e-1 | 2.00 | 1.96 |
| 120×240 | 9.66e-3 | 2.74e-2 | 2.01 | 1.98 |

**Observed order 2.0 in L2, ≈2.0 in L∞** — the discretization (including the
non-uniform radial mesh, the cylindrical metrics, and the ambient boundary
treatment) is second-order accurate, as designed.

### 4. Default SiC case — grid sensitivity

The app's default inputs (1.18 cm³ SiC, L/D 1.5, quartz enclosure, He purge,
radiation on, 20 A current-limited drive):

| grid | avg T (°C) | max T (°C) | energy closure | linear residual |
| --- | --- | --- | --- | --- |
| 30×60 (default) | 837.40 | 839.08 | 9.0e-8 | 2.9e-12 |
| 60×120 | 833.68 | 835.36 | 1.0e-7 | 6.7e-12 |
| 120×240 | 827.12 | 828.81 | 1.0e-7 | 9.4e-12 |

Energy closure (input power vs boundary losses) holds to ~1e-7 on every grid,
and the linear solver converges to ~1e-11 relative residual. The grid-to-grid
differences are **not yet in the asymptotic range** at 4× refinement — the
T⁴ radiation exchange is localized at cell centers, a first-order effect that
dominates before the second-order conduction error does — so no clean order
can be quoted for the full nonlinear case. The honest statement is a
sensitivity bound: **the default 30×60 grid differs from the 120×240 grid by
10.3 K in average temperature, i.e. 1.3% of the ~817 K temperature rise** (and
by the same margin in peak temperature). The second-order correctness of the
underlying conduction discretization is established independently by studies
1–3.

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

### 1. Radial parabola — pure-conduction reduction

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

### 2. Default calibrated case — grid sensitivity

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
4.6 K in average bed temperature (0.8%), and 0.4 K at the wall** — the wall
temperature, which is what the experimental calibration constrains, is
grid-insensitive.

## Continuous guards

`tests/verification.test.js` (run by `npm test` and CI) keeps the headline
results true as the solvers evolve, using the cheap grid levels only:

- Joule parabola mismatch < 2e-3 at L/D = 40 and collapsing ≥4× by L/D = 80;
- Joule annulus worst-layer error < 8% at L/D = 50, < 3% at L/D = 100;
- Joule MMS observed order > 1.7 (L2) / > 1.6 (L∞) on the 30×60→60×120 pair;
- Microwave parabola mismatch < 5% at H/D = 8, < 1% at H/D = 16.
