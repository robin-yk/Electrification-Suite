# Working in this repository

Three browser tools for chemical process electrification, each a static page
plus a dependency-free, DOM-free ES module that does the arithmetic. The
modules are the product; the pages are one caller and the tests are another.

```
apps/joule/       Joule heating: 0D screening, axisymmetric 2D field, transient
apps/microwave/   Microwave heating: powder bed, dielectric response, field solve
apps/rphcjh/      Rapid pulsed vs continuous Joule heating
tests/            Node regression suite; also the worked examples
tools/verification/  Numerical verification studies, run by hand
docs/figures/     The Application Note plates, generated from the solver
```

## Commands

```bash
npm test                              # the whole Node suite
npm run test:e2e                      # Playwright, needs Chromium
npm run verify:joule                  # numerical verification report
node docs/figures/make-verification-data.mjs --levels 4   # slow, tens of minutes
node docs/figures/make-figures.mjs                        # fast, redraws the plates
```

Run `npm test` before pushing. It is fast enough that there is no reason not to.

## The rules that matter here

**A number is written once.** If a value can be computed, compute it; do not
type it into prose, into a figure, or into a second file. The figure pipeline
exists because the manuscript and the artwork had drifted apart, and it fails
the build rather than emit a plate containing `NaN`. Apply the same standard to
documentation: quote a value only where you can also say which command
reproduces it.

**Regenerate what a change invalidates.** `docs/VERIFICATION.md` is currently
wrong in studies 1 to 3 because `build2DMesh` changed how it states its domain
reach and nobody re-ran the report. That mistake reached a manuscript. If you
touch `build2DMesh`, `gridLevels`, or anything either one feeds, re-run
`npm run verify:joule` and update the document in the same commit.

**Solver modules stay pure.** No DOM, no globals, no I/O. Inputs are plain
objects, outputs are plain objects. This is what lets the tests and the browser
call identical code, and it is not negotiable.

**Every solver change needs a test that fails without it.** A test that passes
before and after documents nothing.

**Physical claims need a citable source.** Material presets carry a `source`
and a `model` field saying what kind of fit they are. Keep filling them in.

**No em dashes in prose.** Anywhere: comments, commit messages, documentation,
page copy. Use a comma, a colon, a semicolon, or two sentences.

**Do not hand-edit generated files.** `docs/figures/*.svg`, `index.html`,
`figure-data.json` and `verification-data.json` are outputs. Edit
`docs/figures/draw.mjs` or the templates and re-run the build.

## Commit messages

The log is the design record for this project, and it is the most complete one
that exists. Write the body as an explanation, not a summary: what was wrong,
how you know, what the fix does, and what you checked afterwards. Include the
numbers that decided it. A reader six months later should be able to reconstruct
the reasoning without rerunning anything.

Subject line: imperative, specific, no ticket numbers. "Charge the 0D wall
radiation to a fin length, not the whole domain height" rather than "fix 0D
bug".

AI-assisted commits carry a `Co-Authored-By` trailer. The physics, the
validation targets and the acceptance decisions belong to the human author; see
`CONTRIBUTING.md`.

## Branching

Work lands on `main`. Rebase onto `origin/main` before pushing; the tree moves
during long sessions.

## Traps that have cost time

- **A passing test suite is not a checked model.** The transient march passed
  every test and still had two bugs, both found by running a different material
  through it. When you add a capability, run it on a case whose properties move
  sharply, not only on the shipped default.
- **Verify before diagnosing.** Two of this project's real findings came from
  simply running the existing verification script rather than reasoning about
  what it would say.
- **`pgrep -f <name>` matches its own shell.** A wait loop written that way
  never exits. Match the interpreter and script path, or check for the output
  file instead.
- **Do not `pkill` by name in this environment.** It kills the agent's own
  shell.
- **Shell working directory does not persist between commands.** Use absolute
  paths.
