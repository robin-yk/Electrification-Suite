---
title: 'Electrification Suite: browser-based reduced-order models for electrified chemical reactor design'
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
    orcid: 0000-0000-0000-0000 # TODO: replace with the author's actual ORCID before submission
    affiliation: 1
affiliations:
  - name: Catalysis Center for Energy Innovation, Department of Chemical and Biomolecular Engineering, University of Delaware, Newark, DE, USA
    index: 1
date: 8 August 2026
bibliography: paper.bib
---

# Summary

`Electrification Suite` is a collection of three browser-based, interactive reduced-order models
for the design and screening of electrically heated chemical reactors: a Joule (resistive)
heating tool that couples electrical and axisymmetric two-dimensional thermal screening across
materials, geometry, and power-supply limits; a microwave (dielectric) heating tool that solves
a two-dimensional steady-state powder-bed temperature field from a calibrated dielectric-loss and
penetration-depth model; and a dimensionless visualizer that contrasts ramped-pulsed Joule heating
(RPH) against continuous Joule heating (CJH) for temperature-sensitive reaction kinetics and
transport. Each tool runs entirely in the browser as a static page, with no server, account, or
installation step. Each tool's numerical core — the governing equations, material models, and
iterative solvers — is implemented as a small, dependency-free JavaScript module with no reference
to the page's DOM, so it can be imported and exercised directly in Node.js, exactly as it runs in
the browser, and is covered by an automated regression test suite that runs in continuous
integration on every change.

# Statement of need

Electrifying chemical process heat — replacing fuel combustion with resistive (Joule), inductive,
or microwave/dielectric heating — is a central strategy for decarbonizing energy-intensive
chemical processes. Screening candidate reactor materials, geometries, and heating regimes for
such processes requires coupled electrical, thermal, and (for pulsed operation) kinetic
calculations. In practice these calculations are frequently implemented ad hoc — in spreadsheets
or single-use scripts tied to one study — which makes them slow to explore interactively and
difficult for other researchers to inspect, reproduce, or reuse. `Electrification Suite` packages
three such models, covering the three heating modalities most common in electrified-reactor
research and development, as interactive tools usable directly in a browser, while keeping each
tool's governing equations in a standalone, independently tested module that a researcher can also
import and call directly rather than treating the web page as an opaque calculator.

# State of the field

Research groups working on electrified reactors commonly build internal, one-off web or spreadsheet
calculators for exactly this kind of screening; most are never published or shared, and those that
are rarely separate their numerical core from their user interface in a way that supports
independent testing or reuse. Software that the author's own research group has published follows a
different, non-web pattern: `pMuTT`, a Python toolbox for thermochemical and kinetic parameter
estimation [@lym2020pmutt], and `openMKM`, a C++ microkinetic reaction simulator built on Cantera
[@medasani2023openmkm], are both distributed as installable libraries with conventional research-software
journal articles rather than browser tools. More broadly, JOSS itself treats most web-based research
software as out of scope for review unless it is built around and exposes a "core library" through
the web interface, or the web application itself demonstrates a high level of rigor in domain
modeling and testing (for example, an MVC framework). `Electrification Suite` follows the former
path: rather than adopting a server-side framework, each tool's numerical core is separated into a
plain ES module with no UI or DOM dependency, tested independently of the interface it is presented
through, so the "core library" is the actual unit under test rather than the page around it.

# Software design

Each tool is split into two files: an HTML page that owns the user interface — reading form inputs,
rendering charts and tables, and running any live/animated state — and a paired `<tool>-solver.js`
module that owns the governing equations and takes only plain-object parameters, never touching
`document` or `window`. The HTML page imports its module as a native ES module (`<script
type="module" src="...">`), so no bundler is required to run the site; a Vite build step is used
only to produce a minified production copy for deployment.

- **Joule solver** — an axisymmetric two-dimensional finite-volume steady-state thermal solver
  (preconditioned conjugate-gradient / BiCGSTAB linear solves under an adaptively damped nonlinear
  relaxation loop), plus a lumped 0D electrical/thermal screening pass across a 13-material
  property table, used to size current, voltage, and power requirements against hardware limits.
- **Microwave solver** — a two-dimensional finite-volume steady-state solver for a packed-bed
  reactor, using a Looyenga effective-medium mixing rule for the bed dielectric response, a
  Maxwell–Eucken model for bed thermal conductivity inferred from calibration data, and coupled gas
  and natural-convection boundary transport.
- **RPH/CJH solver** — closed-form Arrhenius rate, transport-coefficient, and velocity functions of
  temperature, a parameterized trapezoidal pulse waveform, and the ideal (zero-ramp) two-state
  averages that quantify the Jensen's-inequality gain from pulsing relative to continuous heating
  at the same time-averaged temperature.

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
tool for @kwak2025tandem, which derives and uses the same ratios and closed-form limits to
quantify the kinetic and transport exposure gains of pulsed Joule heating relative to continuous
heating for tandem non-oxidative methane coupling and CO2 reduction over ethane cracking chemistry;
its "CFP Experiments" tab reproduces the continuous-heating dataset from @mittal2025short. The
Joule and microwave heating tools were developed to support the author's ongoing experimental and
computational work on electrified reactor design within the Vlachos Lab, screening candidate
materials, geometries, and operating envelopes ahead of more detailed simulation or experimental
campaigns.

# AI usage disclosure

Portions of this repository's non-scientific engineering work — extracting the existing numerical
routines into standalone modules without changing their behavior, authoring the accompanying
Node.js regression and Playwright browser test suites, and drafting supporting documentation
(README, CONTRIBUTING, and this paper) — were produced with the assistance of an AI coding
assistant (Claude Code, Anthropic). All physical models, governing equations, and numerical methods
were authored and verified by the author independently of the AI assistant. AI-assisted changes
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
