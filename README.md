# Electrification Suite

Interactive, browser-based models of chemical process electrification — Joule heating, microwave heating, and rapid pulsed heating — by Yeonsu Kwak (Vlachos Lab, University of Delaware).

**Live site: https://robin-yk.github.io/Electrification-Suite/** — no install, no account, everything runs in your browser.

## Projects

- **Microwave Heating 2D Model** (`apps/microwave/`) — steady powder-bed temperature field with dielectric response, calibrated against experiments.
- **Joule Heating 2D Model** (`apps/joule/`) — material, geometry, and power-supply screening with an axisymmetric 2D thermal field, cross-checked against three published reactors.
- **RPH vs CJH Visualizer** (`apps/rphcjh/`) — when rapid pulsed heating beats a continuous heater held at the same average temperature, for pulsed CH₄ + CO₂ coupling.

## Quick start

```bash
git clone https://github.com/robin-yk/Electrification-Suite.git
cd Electrification-Suite
npm install
npm run dev
```

The pages are plain HTML/CSS/JS — you can also just open `index.html` directly in a browser, no build step needed.

## Solver API

Each tool's numeric core is a dependency-free, DOM-free ES module you can import on its own, in Node or in another page:

```js
import { calculate, solveThermal2D, MATERIALS } from "./apps/joule/solver.js";
import { solve2D, transportNumbers, materialProfiles } from "./apps/microwave/solver.js";
import { arrheniusRate, pulseWaveform, idealTwoStateAverages } from "./apps/rphcjh/solver.js";
```

`tests/*.test.js` doubles as worked examples of each module's inputs and outputs.

## Testing

```bash
npm test          # Node regression suite for all three solvers
npm run test:e2e  # Playwright browser smoke test (needs Chromium)
```

Both run in CI on every push, together with a build that verifies every page's files are packaged.

Numerical verification of the 2D solvers — manufactured solutions, analytic benchmarks, and grid-convergence studies — is documented in [`docs/VERIFICATION.md`](docs/VERIFICATION.md) and reproducible via `npm run verify:joule` / `npm run verify:microwave`.

## Citation

```bibtex
@software{kwak_electrification_2026,
  author  = {Kwak, Yeonsu},
  title   = {{Electrification Suite: Interactive Models of Chemical Process Electrification}},
  year    = {2026},
  url     = {https://github.com/robin-yk/Electrification-Suite},
  version = {0.1.0}
}
```

The RPH vs CJH visualizer is a companion to:

> Kwak, Y., Railkar, R., Zheng, W., & Vlachos, D. G. (2025). Tandem Nonoxidative Coupling of Methane and Carbon Dioxide Reduction via Pulsed Joule Thermochemistry. *ACS Energy Letters*, 10(12), 6188–6196. https://doi.org/10.1021/acsenergylett.5c02853

## License

[MIT](LICENSE) © Yeonsu Kwak · Bug reports and pull requests welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) · ask.yeonsu@gmail.com
