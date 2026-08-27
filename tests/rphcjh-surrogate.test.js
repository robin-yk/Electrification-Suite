import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  interpolateCjhConversion, predictCorrection, predictRphConversion,
  predictRphFromDrive
} from "../apps/rphcjh/surrogate.js";
import { integratePulsedElement } from "../apps/rphcjh/solver.js";

const bundle = JSON.parse(readFileSync(
  new URL("../apps/rphcjh/data/rph-surrogate.json", import.meta.url), "utf8"));

test("the web bundle carries the independent Cantera validation result", () => {
  const report = JSON.parse(readFileSync(new URL(
    "../tools/openmkm_dynamic/data/canonical/final-validation-report.json", import.meta.url), "utf8"));
  assert.equal(bundle.validation.verdict, "PASS");
  assert.deepEqual(bundle.validation.summary, report.summary);
  assert.deepEqual(bundle.validation.gates, report.gates);
  assert.equal(bundle.validation.target_sha256, report.target_sha256);
  assert.equal(report.model_design_sha256, bundle.model.canonical_design_sha256);
});

test("the shipped GP reproduces the Python parity cases", () => {
  assert.equal(bundle.model.verdict, "SHIP");
  for (const row of bundle.model.parity_cases) {
    const delta = predictCorrection(bundle.model, row.features);
    assert.ok(Math.abs(delta - row.predicted_delta) < 1e-12,
      `case ${row.design_index}: JS delta ${delta} vs Python ${row.predicted_delta}`);
    const predicted = predictRphConversion(bundle.model, {
      xQs: row.x_qs,
      periodS: 10 ** row.features[1],
      tauS: 1,
      duty: row.features[2],
      tPeakC: row.features[3],
      tMinC: row.features[4],
    });
    assert.ok(predicted.valid);
    assert.ok(Math.abs(predicted.conversion - row.predicted_conversion) < 1e-12,
      `case ${row.design_index}: JS conversion ${predicted.conversion} vs Python ${row.predicted_conversion}`);
  }
});

test("the CJH lookup is exact at every stored node and refuses extrapolation", () => {
  for (const column of bundle.grid.columns) {
    for (const [temperatureC, expected] of column.points) {
      const actual = interpolateCjhConversion(bundle.grid, temperatureC, column.tau_s);
      assert.ok(Math.abs(actual - expected) < 1e-13,
        `T=${temperatureC}, tau=${column.tau_s}: ${actual} vs ${expected}`);
    }
  }
  assert.equal(interpolateCjhConversion(bundle.grid, 300, 0.1), 0);
  assert.equal(interpolateCjhConversion(bundle.grid, 1900, 0.1), null);
  assert.equal(interpolateCjhConversion(bundle.grid, 1000, 20), null);
});

test("the full browser path predicts a Cantera development holdout inside its gate", () => {
  const rows = readFileSync(new URL(
    "../tools/openmkm_dynamic/data/canonical/design-physical.jsonl", import.meta.url), "utf8")
    .trim().split("\n").map(JSON.parse);
  const sealed = new Set(bundle.model.holdout_indices);
  const row = rows.find(r => sealed.has(r.design_index) && r.outputs.ch4_conversion > 1e-3);
  assert.ok(row, "a reactive development holdout must exist");
  const i = row.inputs;
  const drive = integratePulsedElement({
    voltage: i.voltage_V, period: i.period_s, duty: i.duty,
  });
  const predicted = predictRphFromDrive(bundle, {
    drive, periodS: i.period_s, tauS: i.tau_s, duty: i.duty,
  });
  assert.ok(predicted.valid, predicted.reason);
  assert.ok(predicted.conversion > 0 && predicted.conversion < 1);
  assert.ok(Math.abs(predicted.conversion - row.outputs.ch4_conversion) <= 0.10,
    `prediction ${predicted.conversion} vs Cantera ${row.outputs.ch4_conversion}`);
});

test("the surrogate refuses a physical state outside its trained feature box", () => {
  const row = bundle.model.parity_cases[0];
  const result = predictRphConversion(bundle.model, {
    xQs: row.x_qs, periodS: 1e9, tauS: 1, duty: row.features[2],
    tPeakC: row.features[3], tMinC: row.features[4],
  });
  assert.equal(result.valid, false);
  assert.match(result.reason, /outside training range/);
});
