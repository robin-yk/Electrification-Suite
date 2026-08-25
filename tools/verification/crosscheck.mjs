// Regenerates the published-reactor cross-check numbers headlessly, so the
// tables in the Joule tool's Calculations tab (and any write-up quoting them)
// can be reproduced without opening a browser and reading values off a screen.
//
// Two things are produced:
//
//   1. A markdown report on stdout: each case's 0D table, plus the 0D / 2D /
//      experiment comparison on the one quantity where the model dimension
//      actually matters -- the element temperature.
//   2. apps/joule/data/crosscheck-2d.json, the precomputed 2D field solves.
//      The page loads this rather than solving 2D live, because a single 2D
//      solve takes seconds and the reader is on a documentation tab.
//
// Run: node tools/verification/crosscheck.mjs [--write]
"use strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { solveThermal2D, celsius } from "../../apps/joule/solver.js";
import { evaluateCrossChecks, thermalComparison, DEFAULT_ENCLOSURE, sig4 } from "../../apps/joule/crosscheck.js";
import { markdownTable, fix } from "./common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = resolve(HERE, "../../apps/joule/data/crosscheck-2d.json");

const HEADINGS = {
  wismann: "Wismann et al., Science 2019 — FeCrAl reformer tube",
  zheng: "Zheng et al., AIChE J. 2022 — SiSiC foam reformer",
  kwak: "Kwak et al., ACS Energy Lett. 2025 — CFP element",
};

export function run() {
  const evaluated = evaluateCrossChecks(DEFAULT_ENCLOSURE);
  const twoD = {}, comparisons = [];

  for (const item of evaluated) {
    if (item.error) { comparisons.push({ id: item.id, error: item.error }); continue; }
    const key = item.thermal.input, x = item.inputs[key], zeroD = item.results[key];
    const solved = solveThermal2D(x, zeroD, x.enclosure, x.material);
    if (solved.errors.length) { comparisons.push({ id: item.id, error: solved.errors.join("; ") }); continue; }
    twoD[item.id] = {
      point: key,
      avgC: celsius(solved.avgK), maxC: celsius(solved.tMax), minC: celsius(solved.tMin),
      deltaT: solved.deltaT, closure: solved.closure, converged: solved.converged,
      grid: `${solved.mesh.nr}x${solved.mesh.nz}`,
    };
    comparisons.push(thermalComparison(item, solved));
  }

  return { evaluated, twoD, comparisons };
}

function main() {
  const { evaluated, twoD, comparisons } = run();
  console.log("## Joule tool: published-reactor cross-checks\n");

  for (const item of evaluated) {
    console.log(`### ${HEADINGS[item.id] ?? item.id}\n`);
    if (item.error) { console.log(`> failed to evaluate: ${item.error}\n`); continue; }
    console.log(markdownTable(["quantity", "this tool (0D)", "reference"], item.rows) + "\n");
  }

  console.log("### 0D vs 2D vs experiment\n");
  console.log(markdownTable(
    ["case", "0D Tss (°C)", "2D avg (°C)", "2D max (°C)", "2D ΔT (K)", "experiment (°C)"],
    comparisons.map((c) => c?.error
      ? [c.id, "—", "—", "—", "—", c.error]
      : [
        c.id,
        fix(c.zeroDC, 1),
        c.twoDAvgC == null ? "—" : fix(c.twoDAvgC, 1),
        c.twoDMaxC == null ? "—" : fix(c.twoDMaxC, 1),
        twoD[c.id] ? fix(twoD[c.id].deltaT, 1) : "—",
        c.referenceC == null ? c.referenceLabel : fix(c.referenceC, 1),
      ]),
  ) + "\n");

  console.log("The 0D column is a single lumped temperature; the 2D columns are the");
  console.log("volume average and the peak of the resolved field on the shipped default");
  console.log("grid. Where 2D max and 0D Tss differ by more than the experimental");
  console.log("uncertainty, 0D screening is reading a temperature the element does not");
  console.log("actually hold anywhere.\n");

  if (process.argv.includes("--write")) {
    mkdirSync(dirname(JSON_PATH), { recursive: true });
    const payload = {
      generatedBy: "tools/verification/crosscheck.mjs",
      enclosure: DEFAULT_ENCLOSURE,
      cases: twoD,
    };
    writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2) + "\n");
    console.log(`wrote ${JSON_PATH}`);
  } else {
    console.log("(re-run with --write to refresh apps/joule/data/crosscheck-2d.json)");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
