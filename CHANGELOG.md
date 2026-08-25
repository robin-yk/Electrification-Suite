# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Thirty-three commits since 0.2.0. The Joule tool gained a transient march and
a browser tab to drive it, rectangular elements are now solved as rectangles,
the microwave solver gained a field solve and a Krylov linear solver and was
recalibrated against both, and the Application Note figures are now generated
from the solver rather than drawn.

### Added

- `npm run verify:plates`: renders every plate in Chromium and measures each
  element with `getBoundingClientRect`, which is after the transform, unlike
  `getBBox`. It checks four things a build cannot see for itself: artwork off
  the sheet, a data marker outside every panel frame, an element straddling a
  frame, and type under the 8 pt floor. Exits nonzero, so it can gate a build.
  Both defects fixed in this entry were invisible to the earlier boundary-only
  check and are caught by this one.

- Backward-Euler transient march for the Joule 2D solver. `createTransientRun()`
  hands control back after each batch of steps so a page can drive it from an
  animation frame and stop when the user says so; `solveTransient2D()` is that
  loop run to completion. Storage uses the midpoint of the step for rho*cp, so
  energy closure holds for a material whose heat capacity moves sharply with
  temperature. `internalEnergy2D()` and `storageRate2D()` reproduce the
  assembly exactly, which is what makes the closure check meaningful.
- Dynamic tab: 0D seed to 2D steady field to a transient march, in the browser.
  It marches to steady state rather than to a duration the user has to guess,
  since nobody knows the right duration before running; the shipped SiC case
  reaches half its rise at 34 s and stops storing energy near 336 s, so the old
  60 s default cut the curve at two thirds of the way up. `plan.steadyTol`,
  `plan.duration` and `plan.tolerance` are all optional, so a plan carrying
  only `dt` and `steps` takes the original path.
- Rectangular elements as a first-class shape. `geometry()` takes a shape; a
  box carries its three real dimensions, so the conducting area is W*H, the
  surface is the full 2(LW + LH + WH), and the volume is LWH. Nothing is
  approximated and the 0D balance runs on the geometry that exists.
- `equivalentCylinder()` for the axisymmetric solvers, which cannot mesh a box.
  It preserves length, radiating surface, mass and electrical resistance, and
  deliberately does not preserve volume; the interface states all four rather
  than substituting silently. `surfaceEquivalentDiameter()` solves
  pi*D*L + pi*D^2/2 = S for D.
- `elementTimeConstant()`: the lumped C/G of the 0D result, which decides
  whether a pulse train is a pulse train at all. An element driven well below
  this cannot follow the pulse and responds to the mean, however finely the
  march is stepped.
- Frequency-domain field solve for the microwave tool, opt-in through
  `p.fieldMode = "helmholtz"`. At 2.404 GHz a 10 mm SiC bed spans D/lambda =
  0.23, so the load supports no internal cavity mode and the existing 0.5 mm
  cells already give 88 per wavelength. Checked against the infinite lossy
  cylinder in a uniform axial field, J0 of a complex argument: 5.67e-5 on the
  default grid, falling 3.6x then 3.9x per halving.
- Preconditioned conjugate gradients for the microwave solver, replacing
  Gauss-Seidel relaxation. It reproduces the relaxation answer to 0.2 K and
  turns the outer loop into a Picard iteration of tens of steps rather than
  thousands of sweeps: 30x60 now costs about a second, 120x240 about twenty.
- `homogenizationValidity()` is now computed on every microwave solve and
  reported beside the transport numbers. It had been in the solver since the
  porous-continuum closures were added, with tests, and nothing ever called it.
  It also carries a third ratio the original did not, the mesh cell against the
  particle, because refinement has a floor as well as a ceiling.
- Loss channels on Joule boundary terms, so a disagreement in totals can be
  attributed to a path rather than guessed at.
- Supplementary note for the microwave dielectric-redox manuscript
  (`docs/si/microwave-thermal-note.md`), with a reproduction script that
  regenerates every table from the shipped solver.
- Generated figure set for the Joule Application Note (`docs/figures/`). Eight
  plates in manuscript order, drawn at print size in points from values the
  solver produces. `make-verification-data.mjs` runs the repository's own
  verification studies and freezes the result; `make-figures.mjs` reads that,
  computes the geometric and electrical values itself, and refuses to build if
  the measurement is missing or if any drawn value comes out NaN.

### Changed

- The Joule tool's eight tabs became six. Material Compare and Resistivity &
  Geometry Sweep became Screening; Calculations and How to Cite became
  Reference. Each half keeps its own kicker, title and lede.
- How to Use and Reference now document the model that ships: rectangular
  geometry, the transient term, and the Dynamic step.
- Microwave `fieldMode` travels on the material profile rather than as a global
  default, because a source model and the conductivities fitted against it are
  one calibration and must not be mixed.
- SiC microwave profile recalibrated against the solved field: k200 4.000 to
  2.879, k500 18.00 to 11.569, k800 18.00 to 13.929, radArea 6.000 to 5.802.
  Combined RMSE on the report mesh falls from 8.85 to 5.50 C.
- The Dynamic tab sizes its default pulse to the element it is pulsing, and
  integrates the drive across each step rather than sampling its end point, so
  a coarse step delivers the correct cycle-averaged energy instead of stepping
  over the on-window entirely.

### Fixed

- Fig. 3 panel e drew its first and last data point outside the axes. The x
  mapping padded `xs[0]` and `xs[last]` outward, which is only outward when
  the values ascend; panel e counts the time step down from 7.50 to 0.94 s, so
  the padding pulled the ends past the frame by 10 and 9.7 pt and carried the
  tick labels with them, the 0.94 label landing under panel f's axis title.
  The range is now taken from the smallest and largest value and mapped in the
  order given, so either direction stays inside the frame.
- The y-axis titles of Figs. S5 b and c sat inside the frame of the panel
  before. The anchor is the baseline, and rotated -90 the ascender runs 7.8 pt
  to the left of it; at the 35 pt panel gap that reached 2.8 pt into the
  neighbour. The offset is 25 pt rather than 30.
- Fig. S7 coloured its bars by the wrong test. The key read "orange beyond
  +-5 %" while the code filled with `C.field` above 5 % and `C.thermal` below,
  so the three deviations that matter (-6.32, -5.48, -5.48 %) were the amber
  ones and the four inside tolerance were the orange ones: the plate said the
  opposite of its own key. Bars are now grey within +-5 % and orange beyond it,
  and the two roles in the palette are no longer borrowed for a quantity that
  is neither a field nor a thermal solve.
- Type below the 8 pt floor the figure spec sets. Fifteen labels in Figs. S6,
  S7 and S8 were set between 7.2 and 7.8 pt. All are at 8 pt, and the two
  boxes that were sized around 7.6 pt notes were widened to hold them.
- Labels that sat on the data they annotate. In Fig. S5 the two descriptor
  lines per panel ran past their own frame into the neighbouring panel's axis
  label, and the continuous reference was written across the sawtooth; the
  descriptors now sit below each panel and the plate is 12 pt shorter for it.
  In Fig. S6 the decomposition line was labelled where the sweep curve peaks.
- British spellings in a manuscript set in American English: "carbon-fibre" in
  the Fig. S7 data and the Fig. S5 caption, "colour" and "greyscale" in the
  Fig. 4 caption.

### Changed

- Prose moved out of the artwork and into the captions, which is where a
  journal in this family puts it. Fig. S8 carried a two-line paragraph about
  the verification gates and a five-row table of what a change touches, both
  already stated in its caption; the plate is now the two diagrams alone and
  is 114 pt shorter. Fig. S2 carried three lines of description per row, again
  verbatim in the caption, and now carries a property tag per row. Fig. S6
  dropped four explanatory lines under panel d, keeping the one value the
  caption does not give.
- Captions that said the same thing twice, an artefact of revising by addition:
  Figs. 1, S1 and S3 each stated a claim in the opening sentences and again in
  the closing one. Fig. S1 also defined "gas pads" two sentences after first
  using the term.
- Register. "WHAT A CHANGE TOUCHES" as a table header, "wants 129 A at 1.4 V"
  for a material, "solved rather than sketched" and "which is the question the
  tool was built to answer" as caption openers, "pulsing buys a peak", "where
  SiC stops being SiC", and an aside in the Fig. S8 caption about why the
  figure names no tools. Figure text states what a thing is and does.

- 0D wall radiation was charged to the whole domain height rather than to a fin
  length, leaving a 28.72 K gap against the 2D mean at Bi_R = 2e-6, where the
  element is isothermal and lumping cannot be the cause.
- Transient energy closure with a strongly temperature-dependent heat capacity.
  Evaluating rho*cp at the end of the step gave 2.7e-1 closure for carbon fibre
  paper, whose heat capacity triples over the range; the midpoint gives 7.6e-8.
- Transient closure under a duty-cycled drive, which has zero bulk power on
  most steps. Normalising against the largest of bulk power, boundary loss and
  storage rate replaces a division by zero that reported 8.1e6.
- A rectangular element was drawn as its equivalent cylinder under a heading
  that said so, while the panel of equations showed the cylinder's area and the
  solve used W*H.
- `git archive` produced a site whose landing page fails on load, because the
  microwave export-ignore left a dead card and a broken image on the integrated
  root page.
- Runtimes quoted in the microwave note's reproduction script were guessed and
  had the ordering inverted: the grid study is the most expensive mode, not the
  cheapest. They are now measured from the job timestamps.

### Known issues

- Two entries in the material library's `jmax` column look wrong. Molybdenum
  carries 3e5 A/m2, which is 0.3 A/mm2: a hundred times below tungsten and
  thirty times below stainless steel in the same table, and far below what a
  molybdenum element actually runs at. Aluminum carries 5e9 A/m2, or
  5000 A/mm2, which no conductor sustains. Every other entry sits between 3 and
  30 A/mm2. The molybdenum value is load-bearing: it caps that material's
  reachable temperature at 20 C, where a tungsten-like value gives 146 C. Both
  need a source before they are changed.

- `docs/VERIFICATION.md` studies 1 to 3 predate the change that let
  `build2DMesh` state its domain reach directly, and were never regenerated.
  Running `npm run verify:joule` today gives 6.4e-3 rather than 5.8e-3 for the
  radial parabola at L/D = 20, 1.95% rather than 0.8% for the annulus at
  L/D = 100, and manufactured-solution orders of 2.05 and 2.06 in L2 and 1.77
  and 1.90 in Linf. Study 4 was regenerated and is correct. The numbers in
  `docs/figures/verification-data.json` are the measured ones.


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
