import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  cfpResistance, integratePulsedElement, steadyElementTemperature,
} from "../apps/rphcjh/solver.js";
import { predictRphFromDrive } from "../apps/rphcjh/surrogate.js";

const spec = JSON.parse(readFileSync(new URL(
  "../tools/openmkm_dynamic/data/targets-final-validation.json", import.meta.url), "utf8"));
const bundle = JSON.parse(readFileSync(new URL(
  "../apps/rphcjh/data/rph-surrogate.json", import.meta.url), "utf8"));

function floatHex(value) {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeDoubleBE(value);
  return bytes.toString("hex");
}

function seal(targets) {
  const keys = ["voltage", "period_s", "duty", "tau_s"];
  const material = targets.map(target =>
    `${target.design_index}|${keys.map(key => floatHex(target[key])).join("|")}`).join("\n");
  return createHash("sha256").update(material).digest("hex");
}

test("the 64 final Cantera targets are sealed and disjoint from development data", () => {
  assert.equal(spec.count, 64);
  assert.equal(spec.targets.length, 64);
  assert.equal(seal(spec.targets), spec.targets_sha256);
  assert.equal(spec.model_canonical_design_sha256, bundle.model.canonical_design_sha256);
  const development = new Set([...bundle.model.train_indices, ...bundle.model.holdout_indices]);
  const ids = spec.targets.map(target => target.design_index);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => !development.has(id)));
});

test("every final target is inside the exact browser predictor's claimed domain", () => {
  for (const target of spec.targets) {
    const startC = steadyElementTemperature({
      power: target.duty * target.voltage ** 2 / cfpResistance(600),
    });
    const drive = integratePulsedElement({
      voltage: target.voltage, period: target.period_s, duty: target.duty, startC,
    });
    assert.ok(drive.converged, `drive ${target.design_index} did not converge`);
    assert.ok(Math.abs(drive.tPeak - target.expected_peak_c) < 0.1,
      `drive ${target.design_index} peak changed after sealing`);
    const result = predictRphFromDrive(bundle, {
      drive, periodS: target.period_s, tauS: target.tau_s, duty: target.duty,
    });
    assert.ok(result.valid, `${target.design_index}: ${result.reason}`);
  }
});
