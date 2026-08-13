# Contributing

Bug reports, questions, and pull requests are welcome via [GitHub Issues](https://github.com/robin-yk/Electrification-Suite/issues) and [Pull Requests](https://github.com/robin-yk/Electrification-Suite/pulls).

## Reporting a bug

Please include:
- Which page (`apps/microwave/`, `apps/joule/`, or `apps/rphcjh/`)
- The inputs you used (material, geometry, operating conditions)
- What you expected vs. what you observed

## Making a change

```bash
npm install
npm run dev      # local dev server at the printed URL
npm test         # regression tests for all three solvers
npm run test:e2e # browser smoke test (needs Chromium; npx playwright install chromium)
```

Each page's numeric core lives in a standalone, DOM-free ES module (`apps/joule/solver.js`, `apps/microwave/solver.js`, `apps/rphcjh/solver.js`) with its own test file under `tests/`. If you change solver behavior, add or update a test in the matching file. `npm run build` also verifies that `vite.config.js`'s `projectPages` list stays in sync with the files each page needs — if you add a new page or module, add it there too.

Please keep pull requests focused: one change (a bug fix, a new material, a new diagnostic) per PR, with a short description of what changed and why.

## AI-assisted development

Parts of this codebase were implemented with AI coding assistants. The physics
formulations, validation targets (the published reactors reproduced in the
cross-check panels), material property sources, and all design and acceptance
decisions are owned and reviewed by the human author; AI involvement in a
commit is recorded with a `Co-Authored-By` trailer. Contributions are held to
the same standard regardless of how they were drafted: solver changes need a
matching test, and physical claims need a citable source.

## Code style

- No framework, no bundler-required syntax — the pages must keep working when served as plain static files.
- Solver modules stay pure functions of explicit parameters; DOM access stays in the HTML files.
- Match the existing formatting; no linter is enforced.
