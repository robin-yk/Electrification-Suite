# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

### Changed
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

### Removed
- The "B yield across pulse period" sweep chart.

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
