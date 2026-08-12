# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
