# Electrified Reactor Models

Interactive, browser-based models of chemical process electrification, by Yeonsu Kwak (Vlachos Lab, University of Delaware). Email: ask.yeonsu@gmail.com

The site is static and self-contained, split into `index.html` (landing page + router) and one file per project (`microwave.html`, `joule.html`, `rphcjh.html`), each loaded into an iframe on demand. All styling and logic are inline within each file, and calculations run entirely client-side (no backend, no build step required to view it).

Please check https://robin-yk.github.io/Electrification/

## Projects

- **Microwave Heating 2D Model** — steady-state powder-bed temperature fields with dielectric response, penetration depth, heat transfer, and experimental calibration.
- **Joule Heating 2D Optimizer** — electrical and thermal screening across materials, geometry, hardware limits, heat losses, and an axisymmetric temperature field.
- **RPH vs CJH Dimensionless Visualizer** — Jensen's-inequality effects of ramped vs. continuous heating on temperature-dependent kinetics and transport, and the resulting exposure and Damköhler ratios for ethane cracking.

Each project opens in place from the home screen and is also reachable directly via URL hash (`#microwave`, `#joule`, `#rphcjh`).

## Development

```bash
npm install
npm run dev      # local dev server (Vite)
npm run build    # production build to dist/
npm run preview  # preview the production build
```

Vite is used only as a static dev server for these files — there is no framework, build step, or external runtime dependency.

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

The RPH vs CJH visualizer accompanies the experimental study:

> Mittal, A., Kwak, Y., Zheng, W., Ierapetritou, M., & Vlachos, D. G. (2025). Short contact time, high temperature, internally-heated ethane crackers. *Chemical Engineering Journal*, 168251.

## License

[MIT](LICENSE) © Yeonsu Kwak
