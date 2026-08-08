# Electrification Suite

Interactive, browser-based models of chemical process electrification, by Yeonsu Kwak (Vlachos Lab, University of Delaware). Email: ask.yeonsu@gmail.com

Live site: https://robin-yk.github.io/Electrification/

## Statement of need

Electrified reactor design (resistive/Joule heating, microwave/dielectric heating, pulsed heating) involves coupled electrical, thermal, and kinetic calculations that are usually done ad hoc in spreadsheets or one-off scripts, making them slow to explore interactively and hard for other researchers to reproduce or reuse. Electrification Suite provides three focused, browser-based tools — no install, no account, no backend — that expose the underlying numeric solvers as standalone, testable JavaScript modules a researcher can also import directly (in Node or another web page) rather than treating the page as a black box.

## Projects

- **Microwave Heating 2D Model** ([`microwave.html`](microwave.html), core: [`microwave-solver.js`](microwave-solver.js)) — steady-state powder-bed temperature fields with dielectric response, penetration depth, heat transfer, and experimental calibration.
- **Joule Heating 2D Optimizer** ([`joule.html`](joule.html), core: [`joule-solver.js`](joule-solver.js)) — electrical and thermal screening across materials, geometry, hardware limits, heat losses, and an axisymmetric temperature field.
- **RPH vs CJH Dimensionless Visualizer** ([`rphcjh.html`](rphcjh.html), core: [`rphcjh-solver.js`](rphcjh-solver.js)) — Jensen's-inequality effects of ramped vs. continuous heating on temperature-dependent kinetics and transport, and the resulting exposure and Damköhler ratios for ethane cracking.

Each project opens in place from the home screen and is also reachable directly via URL hash (`#microwave`, `#joule`, `#rphcjh`).

## Installation

```bash
git clone https://github.com/robin-yk/Electrification.git
cd Electrification
npm install
```

No other runtime dependency is required — the pages are plain HTML/CSS/JS and run in any modern browser. Vite is used only as a static dev server and production copy step.

## Usage

```bash
npm run dev      # local dev server (Vite), prints a URL to open
npm run build    # production build to dist/
npm run preview  # preview the production build
```

Or just open any of `index.html`, `microwave.html`, `joule.html`, `rphcjh.html` directly in a browser — nothing needs to be compiled first.

## Solver API

Each tool's numeric core is a dependency-free ES module that can be imported on its own, in Node or in a browser, independent of the page's UI:

```js
import { calculate, solveThermal2D, MATERIALS } from "./joule-solver.js";
import { solve2D, transportNumbers, materialProfiles } from "./microwave-solver.js";
import { arrheniusRate, pulseWaveform, idealTwoStateAverages } from "./rphcjh-solver.js";
```

- **`joule-solver.js`** — `calculate(input)` (0D electrical/thermal screening), `solveThermal2D(config)` (axisymmetric finite-volume steady-state field), `propertiesAt(material, T)`, `MATERIALS` (built-in material property table).
- **`microwave-solver.js`** — `solve2D(params)` (steady-state powder-bed temperature field), `transportNumbers(params)` (Biot/penetration-depth diagnostics), `dielectric(material, T)`, `materialProfiles` (built-in material + calibration data).
- **`rphcjh-solver.js`** — `arrheniusRate(TC, ea)`, `transportCoefficient(TC, beta)`, `velocity(TC)`, `pulseWaveform(phase, params)`, `idealTwoStateAverages(params)` (the ramp→0 analytical limit).

Each HTML page imports its module and layers DOM/UI code on top — the module itself never touches `document` or `window`, so it runs the same way in a test runner as it does in the page.

## Examples

Run a solve directly from Node, no browser involved:

```bash
node -e '
import("./joule-solver.js").then(({ calculate, MATERIALS }) => {
  const material = MATERIALS.find(m => m.name === "SiC");
  console.log(calculate({ material, imax: 20, vmax: 100, pmax: 2000,
    volumeCm3: 10, solidFraction: 1, ambientK: 293.15, targetK: 1273.15 }));
});
'
```

See `tests/*.test.js` for further worked examples of each module's inputs and outputs.

## Testing

```bash
npm test
```

Runs the Node-native regression suite (`node --test`) against all three solver modules — representative cases, parameter sweeps, energy-balance closure, convergence checks, and extreme/boundary inputs — with no browser required.

```bash
npm run test:e2e
```

Runs a Playwright smoke test that loads each page in a real headless browser, drives it through its default calculation, and checks for console/page errors and NaN in the reported result. Needs Chromium (`npx playwright install chromium` if you don't already have one).

Both suites run in CI on every push (see [`.github/workflows/tests.yml`](.github/workflows/tests.yml)), together with a production build that verifies every page's required files are packaged.

## Contributing

Bug reports, questions, and pull requests are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Support

Please use [GitHub Issues](https://github.com/robin-yk/Electrification/issues) for bug reports and questions, or email ask.yeonsu@gmail.com.

## Citation

If this tool is useful in your own work, please cite it:

```bibtex
@software{kwak_electrification_2026,
  author  = {Kwak, Yeonsu},
  title   = {{Electrification Suite: Interactive Models of Chemical Process Electrification}},
  year    = {2026},
  url     = {https://github.com/robin-yk/Electrification},
  version = {0.1.0}
}
```

A machine-readable citation is also available in [`CITATION.cff`](CITATION.cff).

The RPH vs CJH visualizer is a companion to:

> Kwak, Y., Railkar, R., Zheng, W., & Vlachos, D. G. (2025). Tandem Nonoxidative Coupling of Methane and Carbon Dioxide Reduction via Pulsed Joule Thermochemistry. *ACS Energy Letters*, 10(12), 6188–6196. https://doi.org/10.1021/acsenergylett.5c02853

Its "CFP Experiments" tab uses continuous-heating (CJH) ethane-cracking data from:

> Mittal, A., Kwak, Y., Zheng, W., Ierapetritou, M., & Vlachos, D. G. (2025). Short contact time, high temperature, internally-heated ethane crackers. *Chemical Engineering Journal*, 168251.

## License

[MIT](LICENSE) © Yeonsu Kwak
