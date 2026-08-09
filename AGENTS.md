# Agent notes

Static, framework-free site: three interactive tools (`joule.html`, `microwave.html`,
`rphcjh.html`) plus `index.html`, each paired with a dependency-free `<tool>-solver.js`
ES module that holds the actual physics/math and never touches `document`/`window`.
No backend, no bundler required to *run* the site — Vite is only used for local dev
serving and producing a minified `dist/` build.

## Setup

```bash
npm install
```

## Testing

```bash
npm test        # Node's built-in test runner, no browser required, ~2 min
npm run test:e2e # Playwright browser smoke test, needs Chromium
```

`npm test` is the primary gate and covers solver correctness (convergence, energy
balance, physical limits, extreme/boundary inputs) — run this for any change to a
`*-solver.js` file. It needs nothing but Node.

`npm run test:e2e` needs a Chromium binary. `playwright.config.js` checks a few common
pre-installed paths (see the file) before falling back to Playwright's own managed
browser via `npx playwright install chromium`. **If that install fails because the
sandbox has no outbound network access, don't retry it** — skip the e2e suite and rely
on `npm test` plus a manual read of the diff. The e2e suite only catches
browser-integration issues (console errors, NaN rendering); it is not required to
validate solver/physics changes.

## Build

```bash
npm run build
```

Copies each page and its paired `-solver.js` file into `dist/`. If you add a new page
or a new solver module, add it to the `projectPages` array in `vite.config.js` — the
build asserts every listed file exists, but won't catch a file you *forgot* to list.

## Where things live

- `<tool>-solver.js` — pure functions, the actual physics/numerics. Edit here for
  anything about correctness.
- `<tool>.html` — DOM/UI layer, imports its solver module. Edit here for anything about
  presentation.
- `tests/<tool>-solver.test.js` — matching regression suite for each solver module.
- `tests/e2e/smoke.spec.js` — the one Playwright test file.

## Committing / PRs

This environment has no repo-specific PR-creation tooling assumptions — use whatever
git/PR mechanism your harness provides. There is no other MCP server or PR-helper
script expected to exist in this repo; don't try to install one.
