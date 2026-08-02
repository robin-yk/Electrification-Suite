# Electrified Reactor Models

Interactive, browser-based models of chemical process electrification, by Yeonsu Kwak (Vlachos Lab, University of Delaware).

The site is a single self-contained `index.html` — all styling and logic are inline, and calculations run entirely client-side (no backend, no build step required to view it).

## Projects

- **Microwave Heating 2D Model** — steady-state powder-bed temperature fields with dielectric response, penetration depth, heat transfer, and experimental calibration.
- **Joule Heating 2D Optimizer** — electrical and thermal screening across materials, geometry, hardware limits, heat losses, and an axisymmetric temperature field.

Each project opens in place from the home screen and is also reachable directly via URL hash (`#microwave`, `#joule`).

## Development

```bash
npm install
npm run dev      # local dev server (Vite)
npm run build    # production build to dist/
npm run preview  # preview the production build
```

Vite is used only as a static dev server / bundler for `index.html` — there is no framework or external runtime dependency.
