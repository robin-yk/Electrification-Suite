#!/usr/bin/env node
// Benchmark the complete browser calculation path on the sealed final cases.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import {
  cfpResistance, integratePulsedElement, steadyElementTemperature,
} from "../../apps/rphcjh/solver.js";
import { predictRphFromDrive } from "../../apps/rphcjh/surrogate.js";

const here = new URL("./", import.meta.url);
const dataUrl = new URL("data/canonical/final-validation.jsonl", here);
const dataText = readFileSync(dataUrl, "utf8");
const rows = dataText.trim().split("\n").filter(Boolean).map(JSON.parse);
const bundle = JSON.parse(readFileSync(
  new URL("../../apps/rphcjh/data/rph-surrogate.json", here), "utf8",
));

const output = process.argv[2];
const repeats = Number(process.argv[3] ?? 30);
if (!output || !Number.isInteger(repeats) || repeats < 1) {
  throw new Error("usage: benchmark_runtime_browser.mjs OUTPUT.json [REPEATS]");
}

function evaluate(row) {
  const input = row.inputs;
  const startC = steadyElementTemperature({
    power: input.duty * input.voltage_V ** 2 / cfpResistance(600),
  });
  const drive = integratePulsedElement({
    voltage: input.voltage_V,
    period: input.period_s,
    duty: input.duty,
    startC,
  });
  const prediction = predictRphFromDrive(bundle, {
    drive,
    periodS: input.period_s,
    tauS: input.tau_s,
    duty: input.duty,
  });
  if (!prediction.valid) {
    throw new Error(`${row.design_index}: ${prediction.reason}`);
  }
  return prediction.conversion;
}

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

// Warm the JIT and verify deterministic output before timing.
const expected = rows.map(evaluate);
for (let pass = 0; pass < 5; pass += 1) rows.forEach(evaluate);

const elapsed = [];
for (let pass = 0; pass < repeats; pass += 1) {
  for (let j = 0; j < rows.length; j += 1) {
    const t0 = performance.now();
    const value = evaluate(rows[j]);
    const wallTimeMs = performance.now() - t0;
    if (Math.abs(value - expected[j]) > 1e-14) {
      throw new Error(`${rows[j].design_index}: nondeterministic result`);
    }
    elapsed.push({ design_index: rows[j].design_index, wall_time_ms: wallTimeMs });
  }
}

const values = elapsed.map(x => x.wall_time_ms).sort((a, b) => a - b);
const processor = cpus()[0]?.model ?? "unknown";
const report = {
  generated_utc: new Date().toISOString(),
  node_version: process.version,
  v8_version: process.versions.v8,
  platform: process.platform,
  architecture: process.arch,
  processor,
  dataset: "tools/openmkm_dynamic/data/canonical/final-validation.jsonl",
  dataset_sha256: createHash("sha256").update(dataText).digest("hex"),
  definition: (
    "Complete deterministic browser path: element ODE, quasi-steady grid "
    + "lookup, and Gaussian-process correction. The timing excludes file "
    + "loading, JSON parsing, warm-up, and process startup."
  ),
  cases: rows.length,
  repeats,
  evaluations: elapsed.length,
  summary_ms: {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.at(-1),
  },
  by_case_ms: rows.map(row => {
    const caseValues = elapsed
      .filter(x => x.design_index === row.design_index)
      .map(x => x.wall_time_ms)
      .sort((a, b) => a - b);
    return {
      design_index: row.design_index,
      median: percentile(caseValues, 0.5),
      min: caseValues[0],
      max: caseValues.at(-1),
    };
  }),
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary_ms, null, 2));
