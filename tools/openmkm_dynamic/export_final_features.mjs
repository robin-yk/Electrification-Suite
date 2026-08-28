#!/usr/bin/env node
// Export, for each sealed final-test case, exactly what the deployed
// inference path computed on it: the quasi-steady baseline, the five raw
// features, and the predicted conversion. This is the browser path of
// evaluate_final_validation.mjs re-run for diagnosis; nothing here selects
// cases or refits anything. The output feeds diagnose_final_test.py, which
// adds what the JS bundle cannot: the GP predictive variance.
import { readFileSync, writeFileSync } from "node:fs";
import {
  cfpResistance, integratePulsedElement, steadyElementTemperature,
} from "../../apps/rphcjh/solver.js";
import { predictRphFromDrive } from "../../apps/rphcjh/surrogate.js";

const here = new URL("./", import.meta.url);
const bundle = JSON.parse(readFileSync(new URL("../../apps/rphcjh/data/rph-surrogate.json", here), "utf8"));
const rows = readFileSync(new URL("data/canonical/final-validation.jsonl", here), "utf8")
  .trim().split("\n").filter(Boolean).map(JSON.parse);

const cases = rows.map(function (row) {
  const input = row.inputs;
  const startC = steadyElementTemperature({
    power: input.duty * input.voltage_V ** 2 / cfpResistance(600),
  });
  const drive = integratePulsedElement({
    voltage: input.voltage_V, period: input.period_s, duty: input.duty, startC,
  });
  const prediction = predictRphFromDrive(bundle, {
    drive, periodS: input.period_s, tauS: input.tau_s, duty: input.duty,
  });
  if (!prediction.valid) throw new Error(`refused sealed case ${row.design_index}`);
  return {
    design_index: row.design_index,
    x_dyn: row.outputs.ch4_conversion,
    x_qs: prediction.quasiSteadyConversion,
    x_pred: prediction.conversion,
    delta_pred: prediction.correctionLogOdds,
    period_s: input.period_s, tau_s: input.tau_s, duty: input.duty,
    t_peak_c: drive.tPeak, t_min_c: drive.tMin,
  };
});

const out = new URL("data/canonical/final-features.json", here);
writeFileSync(out, JSON.stringify({
  generated_by: "tools/openmkm_dynamic/export_final_features.mjs",
  model_canonical_design_sha256: bundle.model.canonical_design_sha256,
  cases,
}, null, 1) + "\n");
console.log(`wrote ${cases.length} cases`);
