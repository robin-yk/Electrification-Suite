---
title: 'Electrification Suite: Browser-based reduced-order models for electrified chemical reactor design'
tags:
  - JavaScript
  - chemical engineering
  - catalysis
  - reactor design
  - heat transfer
  - process electrification
  - web application

authors:
  - name: Yeonsu Kwak
    orcid: 0000-0002-4437-0025
    affiliation: "1"

affiliations:
  - name: Catalysis Center for Energy Innovation, Department of Chemical and Biomolecular Engineering, University of Delaware, Newark, DE, USA
    index: 1

date: 8 August 2026
bibliography: paper.bib
---

# Summary

`Electrification Suite` is a collection of three interactive browser tools for rapidly screening
electrically heated chemical reactors. The tools estimate the electrical requirements and
temperature distribution of Joule-heated reactors, the temperature distribution of
microwave-heated packed beds, and the kinetic and transport consequences of pulsed versus
continuous Joule heating. They are intended for early-stage reactor design, where researchers need
to compare materials, geometries, and operating conditions before committing to higher-fidelity
simulation or experiments.

Each tool runs entirely in the browser as a static page, with no server, account, or installation
step. Each tool's numerical core — the governing equations, material models, and iterative
solvers — is implemented as a small, dependency-free JavaScript module with no reference to the
page's DOM, so it can be imported and exercised directly in Node.js, exactly as it runs in the
browser, and is covered by an automated regression test suite that runs in continuous integration
on every change.

# Statement of need

Electrifying chemical process heat — replacing fuel combustion with resistive (Joule), inductive,
or microwave/dielectric heating — is a central strategy for decarbonizing energy-intensive
chemical processes. Screening candidate reactor materials, geometries, and heating regimes for
such processes requires coupled electrical, thermal, and (for pulsed operation) kinetic
calculations. In practice these calculations are frequently implemented ad hoc — in spreadsheets or
single-use scripts tied to one study — which makes them slow to explore interactively and difficult
for other researchers to inspect, reproduce, or reuse. The intended users are experimental
catalysis and reaction-engineering researchers who need rapid estimates of temperature fields,
electrical requirements, and operating envelopes before performing detailed multiphysics
simulations or building experiments.

`Electrification Suite` packages three such models, covering resistive and microwave heating
together with a pulsed-versus-continuous resistive-heating analysis, as interactive tools usable
directly in a browser, while keeping each tool's governing equations in a standalone, independently
tested module that a researcher can also import and call directly rather than treating the web page
as an opaque calculator.

# State of the field

Existing tools for this kind of reactor-design screening occupy two ends of the modeling spectrum.
General-purpose multiphysics packages can resolve coupled electromagnetic, fluid-flow, and
heat-transfer fields at high fidelity, but require geometry construction, meshing, solver
configuration, and a specialized software environment for each case. Thermochemical and kinetic
packages such as `pMuTT` [@lym2020pmutt] and `openMKM` [@medasani2023openmkm] — both previously
published by the author's research group — address complementary molecular and reaction-network
calculations rather than electrical power delivery and reactor-scale temperature fields; both are
distributed as installable libraries accompanied by conventional research-software journal articles
rather than as browser tools. `Electrification Suite` targets the intermediate screening step
between these two ends: reduced-order reactor calculations that retain explicit governing equations
and spatial heat transfer while remaining fast enough for interactive parameter exploration
directly in a browser.

More broadly, JOSS itself treats most web-based research software as out of scope for review unless
it is built around and exposes a "core library" through the web interface, or the web application
itself demonstrates a high level of rigor in domain modeling and testing (for example, an MVC
framework). `Electrification Suite` follows the former path: rather than adopting a server-side
framework, each tool's numerical core is separated into a plain ES module with no UI or DOM
dependency, tested independently of the interface it is presented through, so the "core library" is
the actual unit under test rather than the page around it.

# Software design

Each tool is split into two files: an HTML page that owns the user interface — reading form inputs,
rendering charts and tables, and running any live/animated state — and a paired `<tool>-solver.js`
module that owns the governing equations and takes only plain-object parameters, never touching
`document` or `window`. The HTML page imports its module as a native ES module (`<script
type="module" src="...">`), so no bundler is required to run the site; a Vite build step is used
only to produce a minified production copy for deployment.

- **Joule solver** — an axisymmetric two-dimensional finite-volume steady-state thermal solver,
  plus a lumped 0D electrical/thermal screening pass across a 13-material property table used to
  size current, voltage, and power requirements against hardware limits. The nonlinear temperature
  update uses an adaptive relaxation schedule (starting at a factor of 0.62, moving to 0.86 once
  early iterations show no stagnation, and damping back down when the step size stops shrinking for
  two consecutive checks); the inner linear system at each nonlinear step is solved with BiCGSTAB,
  which falls back to preconditioned conjugate gradient for the symmetric case (no advective
  coupling terms).
- **Microwave solver** — a two-dimensional finite-volume steady-state solver for a packed-bed
  reactor, solved with a successive-over-relaxation Gauss–Seidel sweep rather than a matrix-free
  Krylov method, using a Looyenga effective-medium mixing rule for the bed dielectric response, a
  Maxwell–Eucken model for bed thermal conductivity inferred from calibration data, and coupled gas
  and natural-convection boundary transport.
- **RPH/CJH solver** — closed-form Arrhenius rate, transport-coefficient, and velocity functions of
  temperature, a parameterized trapezoidal pulse waveform, and the ideal (zero-ramp) two-state
  averages that quantify the nonlinear kinetic and transport response to pulsed heating relative to
  continuous heating at the same time-averaged temperature.

The models deliberately trade field-level completeness for transparent, interactive screening. The
microwave tool therefore parameterizes dielectric energy deposition rather than solving the full
cavity-scale Maxwell equations, and the thermal solvers use prescribed or correlation-based
gas-side transport rather than a coupled Navier–Stokes solution. These choices keep the numerical
problem small enough to solve directly in the browser while retaining the heat-generation and
heat-loss mechanisms needed to compare reactor materials and operating conditions. Cases in which
electromagnetic resonance, detailed flow structure, or particle-scale hot spots control the result
require higher-fidelity simulation.

Each module has a matching file in `tests/` using Node's built-in test runner (`node --test`),
covering representative physical cases, parameter sweeps for convergence and energy-balance
closure, determinism, and extreme/boundary inputs (for example, non-finite or out-of-range inputs,
and inputs designed to stress the solver's temperature-clamping logic). A separate Playwright-based
browser test loads each page headless, drives it through its default calculation, and checks for
console/page errors and non-finite results, catching integration issues the pure-function unit
tests cannot see. Both suites, together with a production build, run in GitHub Actions on every
push.

# Research impact statement

The RPH vs CJH dimensionless visualizer was developed as a companion analysis and communication
tool for @kwak2025tandem, which derives and uses the same ratios and closed-form limits to quantify
the kinetic and transport response of pulsed Joule heating relative to continuous heating in tandem
non-oxidative methane coupling and CO2 reduction under rapidly varying thermal conditions. Its "CFP
Experiments" tab reproduces the continuous-heating ethane-cracking dataset from @mittal2025short.

The Joule and microwave heating tools were developed to support the author's ongoing experimental
and computational work on electrified reactor design within the Vlachos Lab, screening candidate
materials, geometries, and operating envelopes ahead of more detailed simulation or experimental
campaigns.

<!-- TODO before submission: replace the paragraph above with a specific, verifiable example - e.g.
     which reactor study used which tool for what decision, and whether the corresponding input
     parameters are included in the repository as a reproducible example. JOSS's pre-review gate
     wants demonstrated research use, not just anticipated usefulness; only the author can supply
     that specific evidence. -->

# AI usage disclosure

Portions of this repository's non-scientific engineering work — extracting the existing numerical
routines into standalone modules without changing their behavior, authoring the accompanying
Node.js regression and Playwright browser test suites, and drafting supporting documentation
(README, CONTRIBUTING, and this paper) — were produced with the assistance of an AI coding
assistant, Claude Code (Anthropic).
<!-- TODO before submission: state the specific Claude model/version used for this work, per
     JOSS's AI-usage disclosure requirement. Left as a placeholder here rather than filled in
     automatically, since the model should be recorded once and kept accurate by the author rather
     than baked into this file by the assistant that happens to be running when it is edited. -->
This paper draft was also revised based on suggested edits from a second AI assistant (ChatGPT,
OpenAI) reviewing an earlier version of the text; the author evaluated each suggestion and
incorporated the ones judged accurate before finalizing the paper.

The physical models, governing equations, and numerical-method choices predated the AI-assisted
refactoring described above and were selected and validated by the author. AI-assisted code changes
were reviewed by the author and checked against the project's regression test suite and manual
browser verification before being merged; in two instances, AI-authored extreme-input regression
tests surfaced real numerical robustness bugs — an unclamped over-relaxation step in the microwave
solver that could produce non-physical temperatures under a wildly oversized input power, and an
uninitialized-accumulator division in the pulsed-heating visualizer's first animation frame — which
were then fixed and independently verified by the author.

# Acknowledgements

The author thanks members of the Vlachos Lab at the University of Delaware for feedback on early
versions of these tools.

# References
