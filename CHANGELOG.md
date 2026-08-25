# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-08-25

### Added
- Equal-conversion basis for the A → B → C comparison, alongside equal average
  temperature and equal electrical power. Selectivity to an intermediate always
  falls as conversion rises, so comparing two runs at different conversions
  reads partly as a slide along the S(X) curve; matching X first removes that
  confound. `cjhTempForConversion()` inverts the steady conversion in closed
  form.
- Outlet-composition chart on the A → B → C tab: two stacked A/B/C bars with
  conversion, selectivity, and yield printed under each, and a guide joining
  the two A boundaries that stands vertical only when the conversions match.
- "Where pulsing actually wins": the equal-conversion yield ratio swept across
  pulse period, with a break-even line. Holding conversion fixed at every
  period leaves only the selectivity question, so the crossing is the period
  below which pulsing is worth doing.
- Numerical verification of both 2D solvers (`docs/VERIFICATION.md`,
  `tools/verification/`): manufactured-solution convergence (observed order
  2.0 for the Joule FV discretization), analytic radial-parabola and
  multi-layer-annulus benchmarks, grid-sensitivity studies of the shipped
  default cases, and fast guard tests wired into `npm test`.

- Current-density field for the Joule 2D solver (`cfg.currentField`). The
  thermal assembly had given every element cell the same volumetric source,
  which is exact only for a uniform electrical conductivity; with rho(T) the
  hot core conducts differently from the skin and the dissipation follows the
  current. `assembleElectrical2D` / `solveElectrical2D` solve
  del.(sigma grad V) = 0 on the element and derive the source from the result,
  reusing the existing two-point-flux operator and linear solver. Verified in
  `tools/verification/electrical.mjs`: exact resistance and linear potential
  under uniform sigma, order 2.00 for a series sigma(z), electrode currents
  agreeing to 3e-13, dissipation equal to I^2 R to 7e-16.
- Radial solid-fraction contrast (`cfg.porosityContrast`), which redistributes
  the solid within the envelope without moving its mean, so the total solid
  volume, the zero-D resistance and the injected power are unchanged and a
  contrast of zero reproduces the previous solve bit for bit. At 0.6 on a SiSiC
  element the current density spans a factor of 7.5 while the element average
  moves 0.1 K: current crowds into the dense skin, and a solid that conductive
  carries the heat away before it becomes a thermal hotspot.
- Field selector on the Joule 2D map: temperature, current-density magnitude,
  or volumetric heating, switched as a redraw rather than a re-solve.
- `cfg.purge`, so the He stream can be switched off without deleting the gap.
- Porous-continuum closures for the microwave solver: a solved Darcy pressure
  and velocity field on the packed bed, Ergun permeability, axisymmetric
  anisotropy, and an explicit homogenization-validity check.
- Cantera precompute pipeline (GRI-3.0, AramcoMech 2.0) and an OpenMKM PFR tab
  driven by a steady element-temperature sweep.
- Published-reactor cross-checks recomputed live by the solver: the Wismann
  et al. (2019) FeCrAl reformer tube, Zheng et al. (2022) SiSiC foam reformer,
  and the companion paper's CFP element, now with a 2D column.
- Supply drive mode (Auto / A limited / V limited) with setpoint sliders capped
  at what the other limits allow.
- A warning when the Joule steady-state temperature clears the material's
  melting, decomposition or sublimation point, with the single-parameter Vmax
  or Imax ceiling that would hold it there instead.
- 0D validity study (`tools/verification/zerod-validity.mjs`): the lumped-limit
  criterion, its second dimensionless group, and where it stops holding.
- "How to Cite" tab with a downloadable `.ris` on each tool, and DOIs on every
  citation.
- Under-development links on the home page to the solid-gas thermosolver and
  ethane-cracker techno-economics projects.
- Configurable Joule 2D mesh resolution (`cfg.nr` / `nz` / `nAir` / `nAirZ`).
- OpenMKM design generator and pulsed-CSTR transient pipeline under
  `tools/openmkm*`, marked under development and not wired to any page.

### Changed
- **The default Joule case's numbers moved.** Average element temperature for
  the shipped default is 846.75 °C, against 837.40 °C in 0.1.0; see Fixed
  below. Anything quoting 0.1.0 output should be recomputed.
- Repository restructured into `apps/<tool>/{index.html,solver.js}`, with each
  solver a dependency-free ES module importable on its own.
- Renamed to Electrification Suite; all URLs updated.
- Joule geometry inputs are now nominal volume and void fraction rather than
  length and diameter.
- Porous conductivity homogenization is gated behind an explicit
  `material.kIsSkeleton` flag. `solidFraction` is overloaded across the shipped
  cases, and feeding it to a dispersed-pore closure moved the Wismann tube's 2D
  peak from 818 to 852 °C against an 800 °C measurement, away from the
  experiment.
- The Joule 2D domain size is held fixed under mesh refinement. It had been
  written as `nr/(nr-nAir)`, which tied the physical domain to the cell count
  and walked the far-field boundary inward as the grid refined, so a refinement
  study moved the boundary condition instead of holding the problem fixed.
- Surface radiation leaves from the cell face rather than the cell centre, with
  the half-cell conduction resistance in series.
- The Picard convergence test measures the un-relaxed step. Folding the
  relaxation factor into it let a damped case stop at many times the stated
  tolerance while reporting convergence, at a different accuracy on each grid.
- The whole site uses self-hosted Roboto and the al-folio design tokens.
- Prose em dashes removed repository-wide, and a research-software disclaimer
  added to the home lede and every How to Cite tab.
- The A → B → C KPIs now report conversion and selectivity alongside the yield
  they multiply to, so the pair shows which factor moved. Yield alone cannot
  separate "converted more" from "destroyed less".
- The instantaneous/running x_B trace is retitled "Inside one cycle" and moved
  below the composition chart: it explains the averages rather than stating the
  result.
- The RPH vs CJH visualizer opens on the A → B → C tab; Kinetic Effect follows
  it. The series network is the question the tool exists to answer, so it now
  leads. The suite card and README no longer describe the comparison as being
  against a heater "held at the same average temperature", which is one of the
  three bases rather than the only one.
- The A → B → C tab now opens at 34 V with a 2 s residence time. The previous
  default ran the element at 1399 °C, where k1(T_peak)·tau_p reached 1570: the
  feed was consumed almost immediately and the rest of the hot window only
  burned B to C, so k2(T_peak)·tau_p climbed to 0.35 and the tab opened on an
  operating point where the effect it describes does not appear. The new
  default satisfies both stated conditions (16.4 and 0.14) and pulsing wins
  1.31x at equal conversion.

### Fixed
- The He purge stream no longer remixes radially once per cell. Every flow cell
  had drawn its inflow from the area-weighted mean of the whole upstream row,
  which homogenizes the stream once per cell, so the mixing length was the mesh
  spacing and the mixing rate per unit length diverged under refinement. The
  purge cells are also conduction cells, so the artifact landed in the
  element-to-wall gap resistance, whose temperature drop moved 906 → 803 →
  672 K across three grids. That took the default case's observed
  grid-convergence order to **−0.588**: the answer moved further on each
  refinement instead of settling. It now converges at order 1.45, stable across
  two overlapping grid triplets, and the shipped 30×60 grid sits 0.60 K from a
  240×480 solve against 10.3 K before. Energy closure improves to ~1e-9 and the
  default grid solves in 2 s rather than 691 s for the three-level study.
  `docs/VERIFICATION.md` §4 records the isolation.
- The He purge is no longer clamped to ambient at the domain ends.
- Microwave gas-flow direction: the solver ran bottom-to-top while the page
  showed top-down.
- Signed-zero Darcy components, and the eps'' anisotropy ratio decoupled.
- The Joule grid study had pinned a mesh allocation the page does not use, so
  it was measuring something other than the shipped solver.

### Removed
- The "B yield across pulse period" sweep chart.
- The CFP Experiments tab and its dataset citation.
- The raw-code dump panel, replaced by the Wismann 2019 cross-check.
- The JOSS paper draft.

## [0.1.0] - 2026-08-12

First tagged release.

### Added
- **Microwave Heating 2D Model** (`apps/microwave/`): steady axisymmetric
  powder-bed temperature field with temperature-dependent dielectric mixing,
  gas–solid exchange, radiation/convection losses, a reported Darcy pressure
  field, and calibration against a measured FBG/quartz-wall power sweep.
- **Joule Heating 2D Model** (`apps/joule/`): 0D electrical–thermal screening
  (material presets with ρ(T), supply limits with Auto / A-limited / V-limited
  drive modes, feasibility and Biot verdicts) plus a nonlinear axisymmetric
  2D temperature solve, material comparison, and resistivity–geometry sweeps.
- **RPH vs CJH Visualizer** (`apps/rphcjh/`): Jensen's-inequality analysis of
  rapid pulsed vs. continuous heating on k(T), h(T), u(T), with live
  time-averaging and exposure/Damköhler ratio maps for pulsed CH₄ + CO₂
  coupling.
- Cross-checks reproducing three published electrified reactors inside the
  Joule tool: the Wismann et al. (*Science* 2019) FeCrAl reformer tube, the
  Zheng et al. (*AIChE J.* 2022) SiSiC foam reformer, and the Kwak et al.
  (*ACS Energy Lett.* 2025) carbon-fiber-paper element, recomputed live by the
  solver on every page load.
- Solver regression suites (`npm test`, Node's built-in runner) covering
  convergence, discrete energy closure, analytic and asymptotic limits, and
  extreme-input sweeps, plus a Playwright browser smoke test (`npm run
  test:e2e`); both run in CI.
- Each solver is a dependency-free ES module importable on its own
  (`electrification/joule`, `electrification/microwave`,
  `electrification/rphcjh`).
