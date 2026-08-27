#!/usr/bin/env node
// Evaluate the frozen browser model on a Cantera set that was never used to
// choose training points. This imports the same inference code as the page.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  cfpResistance, integratePulsedElement, steadyElementTemperature,
} from "../../apps/rphcjh/solver.js";
import { predictRphFromDrive } from "../../apps/rphcjh/surrogate.js";

const here = new URL("./", import.meta.url);
const defaultData = new URL("data/final-validation.jsonl", here);
const defaultSpec = new URL("data/targets-final-validation.json", here);
const defaultBundle = new URL("../../apps/rphcjh/data/rph-surrogate.json", here);
const defaultOutput = new URL("data/final-validation-report.json", here);

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function floatHex(value) {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeDoubleBE(value);
  return bytes.toString("hex");
}

function targetSealMaterial(targets) {
  const keys = ["voltage", "period_s", "duty", "tau_s"];
  return targets.map(target =>
    `${target.design_index}|${keys.map(key => floatHex(target[key])).join("|")}`).join("\n");
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

const dataPath = arg("--data", defaultData);
const specPath = arg("--spec", defaultSpec);
const bundlePath = arg("--bundle", defaultBundle);
const outputPath = arg("--output", defaultOutput);
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
const rows = readFileSync(dataPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);

const targetHash = createHash("sha256").update(targetSealMaterial(spec.targets)).digest("hex");
if (targetHash !== spec.targets_sha256) {
  throw new Error(`target seal mismatch: ${targetHash} != ${spec.targets_sha256}`);
}
if (bundle.model.canonical_design_sha256 !== spec.model_canonical_design_sha256) {
  throw new Error("the evaluated model is not the model frozen when targets were selected");
}
const forbidden = new Set([...bundle.model.train_indices, ...bundle.model.holdout_indices]);
const targets = new Map(spec.targets.map(target => [target.design_index, target]));
if (rows.length !== spec.count || targets.size !== spec.count) {
  throw new Error(`expected ${spec.count} final cases, received ${rows.length}`);
}

const cases = [];
for (const row of rows) {
  const target = targets.get(row.design_index);
  if (!target) throw new Error(`unexpected design_index ${row.design_index}`);
  if (forbidden.has(row.design_index)) {
    throw new Error(`final design_index ${row.design_index} overlaps development data`);
  }
  const input = row.inputs;
  const pairs = [
    [input.voltage_V, target.voltage, "voltage"],
    [input.period_s, target.period_s, "period"],
    [input.duty, target.duty, "duty"],
    [input.tau_s, target.tau_s, "tau"],
  ];
  for (const [actual, expected, name] of pairs) {
    if (Math.abs(actual - expected) > 1e-11 * (1 + Math.abs(expected))) {
      throw new Error(`${row.design_index} ${name} does not match the sealed target`);
    }
  }
  if (!row.converged) throw new Error(`Cantera case ${row.design_index} did not converge`);
  const startC = steadyElementTemperature({
    power: input.duty * input.voltage_V ** 2 / cfpResistance(600),
  });
  const drive = integratePulsedElement({
    voltage: input.voltage_V, period: input.period_s, duty: input.duty, startC,
  });
  const prediction = predictRphFromDrive(bundle, {
    drive, periodS: input.period_s, tauS: input.tau_s, duty: input.duty,
  });
  if (!prediction.valid) {
    throw new Error(`browser model refused sealed case ${row.design_index}: ${prediction.reason}`);
  }
  const truth = row.outputs.ch4_conversion;
  cases.push({
    design_index: row.design_index,
    cantera_conversion: truth,
    cjh_conversion: prediction.quasiSteadyConversion,
    predicted_rph_conversion: prediction.conversion,
    abs_error: Math.abs(prediction.conversion - truth),
    cjh_abs_error: Math.abs(prediction.quasiSteadyConversion - truth),
  });
}

const errors = cases.map(row => row.abs_error);
const cjhErrors = cases.map(row => row.cjh_abs_error);
const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
const cjhMean = cjhErrors.reduce((a, b) => a + b, 0) / cjhErrors.length;
const summary = {
  points: cases.length,
  mean_abs_error: mean,
  p95_abs_error: percentile(errors, 0.95),
  max_abs_error: Math.max(...errors),
  cjh_mean_abs_error: cjhMean,
};
const gates = {
  "mean<=0.02": summary.mean_abs_error <= 0.02,
  "p95<=0.05": summary.p95_abs_error <= 0.05,
  "max<=0.10": summary.max_abs_error <= 0.10,
  ">=30% better than CJH": summary.mean_abs_error <= 0.7 * cjhMean,
};
const verdict = Object.values(gates).every(Boolean) ? "PASS" : "FAIL";
const report = {
  verdict,
  target_sha256: targetHash,
  model_design_sha256: bundle.model.canonical_design_sha256,
  summary,
  gates,
  cases,
};
writeFileSync(outputPath, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ verdict, summary, gates }, null, 1));
if (verdict !== "PASS") process.exitCode = 1;
