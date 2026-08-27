// Dependency-free inference for the Cantera-trained RPH correction model.
// The caller supplies the generated JSON bundle, so this numeric module stays
// pure and works identically in the browser and the Node regression suite.
"use strict";

const LOGIT_EPS = 1e-7;
const GRID_EPS = 1e-9;

export function logitClamped(x) {
  const v = Math.min(Math.max(x, LOGIT_EPS), 1 - LOGIT_EPS);
  return Math.log(v / (1 - v));
}

export function sigmoidStable(v) {
  if (v >= 0) return 1 / (1 + Math.exp(-v));
  const e = Math.exp(v);
  return e / (1 + e);
}

function gridLogit(x) {
  const v = Math.min(Math.max(x, GRID_EPS), 1 - GRID_EPS);
  return Math.log(v / (1 - v));
}

export function matern52(a, b, lengthscales) {
  let r2 = 0;
  for (let j = 0; j < a.length; j++) {
    const q = (a[j] - b[j]) / lengthscales[j];
    r2 += q * q;
  }
  const r = Math.sqrt(5 * r2);
  return (1 + r + r * r / 3) * Math.exp(-r);
}

function bracket(sorted, value, getValue = x => x) {
  let lo = 0, hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (getValue(sorted[mid]) <= value) lo = mid;
    else hi = mid;
  }
  return [lo, hi];
}

function interpolateColumn(points, temperatureC) {
  if (temperatureC < points[0][0]) return 0;
  if (temperatureC === points[0][0]) return points[0][1];
  if (temperatureC > points[points.length - 1][0]) return null;
  if (temperatureC === points[points.length - 1][0]) return points[points.length - 1][1];
  const [i0, i1] = bracket(points, temperatureC, p => p[0]);
  const [t0, x0] = points[i0], [t1, x1] = points[i1];
  if (temperatureC === t0) return x0;
  if (temperatureC === t1) return x1;
  const f = (temperatureC - t0) / (t1 - t0);
  if (x0 <= GRID_EPS || x1 <= GRID_EPS) return x0 + (x1 - x0) * f;
  return sigmoidStable(gridLogit(x0) + (gridLogit(x1) - gridLogit(x0)) * f);
}

export function interpolateCjhConversion(grid, temperatureC, tauS) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(tauS) || tauS <= 0) return null;
  if (temperatureC > grid.temperature_max_c || tauS < grid.tau_min_s || tauS > grid.tau_max_s) return null;
  if (temperatureC < grid.temperature_min_c) return 0;
  const columns = grid.columns;
  if (tauS === columns[0].tau_s) return interpolateColumn(columns[0].points, temperatureC);
  if (tauS === columns[columns.length - 1].tau_s) {
    return interpolateColumn(columns[columns.length - 1].points, temperatureC);
  }
  const [i0, i1] = bracket(columns, tauS, c => c.tau_s);
  const c0 = columns[i0], c1 = columns[i1];
  const x0 = interpolateColumn(c0.points, temperatureC);
  const x1 = interpolateColumn(c1.points, temperatureC);
  if (x0 === null || x1 === null) return null;
  const f = (Math.log(tauS) - Math.log(c0.tau_s)) /
    (Math.log(c1.tau_s) - Math.log(c0.tau_s));
  if (x0 <= GRID_EPS || x1 <= GRID_EPS) return x0 + (x1 - x0) * f;
  return sigmoidStable(gridLogit(x0) + (gridLogit(x1) - gridLogit(x0)) * f);
}

function sampleProfile(samples, phase) {
  const p = phase - Math.floor(phase);
  if (p <= samples[0][0]) return samples[0][1];
  const [i0, i1] = bracket(samples, p, s => s[0]);
  const [p0, t0] = samples[i0], [p1, t1] = samples[i1];
  const f = (p - p0) / (p1 - p0);
  return t0 + (t1 - t0) * f;
}

export function quasiSteadyConversion(grid, samples, tauS, phasePoints = 400) {
  if (!Array.isArray(samples) || samples.length < 2 || phasePoints < 1) return null;
  let weighted = 0, weightSum = 0;
  for (let k = 0; k < phasePoints; k++) {
    const temperatureC = sampleProfile(samples, (k + 0.5) / phasePoints);
    const conversion = interpolateCjhConversion(grid, temperatureC, tauS);
    if (conversion === null) return null;
    const weight = 1 / (temperatureC + 273.15);
    weighted += weight * conversion;
    weightSum += weight;
  }
  return weighted / weightSum;
}

function rawFeatures({ xQs, periodS, tauS, duty, tPeakC, tMinC }) {
  return [logitClamped(xQs), Math.log10(periodS / tauS), duty, tPeakC, tMinC];
}

export function predictCorrection(model, features) {
  const z = features.map((value, j) =>
    (value - model.feature_mean[j]) / model.feature_std[j]);
  let correction = 0;
  const scale = model.sigma_f * model.sigma_f;
  for (let i = 0; i < model.train_z.length; i++) {
    correction += scale * matern52(z, model.train_z[i], model.lengthscales) * model.alpha[i];
  }
  return correction;
}

export function predictRphConversion(model, input) {
  if (model.verdict !== "SHIP") {
    return { valid: false, conversion: null, reason: "model did not pass its validation gates" };
  }
  const values = [input.xQs, input.periodS, input.tauS, input.duty, input.tPeakC, input.tMinC];
  if (!values.every(Number.isFinite) || input.xQs < 0 || input.xQs > 1 ||
      input.periodS <= 0 || input.tauS <= 0 || input.duty <= 0 || input.duty > 1 ||
      input.tPeakC < input.tMinC) {
    return { valid: false, conversion: null, reason: "invalid surrogate input" };
  }
  const features = rawFeatures(input);
  for (let j = 0; j < features.length; j++) {
    const tolerance = 1e-10 * (1 + Math.max(Math.abs(model.feature_min[j]), Math.abs(model.feature_max[j])));
    if (features[j] < model.feature_min[j] - tolerance || features[j] > model.feature_max[j] + tolerance) {
      return { valid: false, conversion: null, reason: `feature outside training range: ${model.feature_names[j]}` };
    }
  }
  const correctionLogOdds = predictCorrection(model, features);
  const conversion = sigmoidStable(logitClamped(input.xQs) + correctionLogOdds);
  return {
    valid: true,
    conversion,
    quasiSteadyConversion: input.xQs,
    correctionLogOdds,
    memoryGain: input.xQs > 1e-12 ? conversion / input.xQs : null,
  };
}

export function predictRphFromDrive(bundle, { drive, periodS, tauS, duty }) {
  if (!drive || !drive.converged) {
    return { valid: false, conversion: null, reason: "element drive did not converge" };
  }
  if (drive.tPeak > bundle.scope.peak_cap_c) {
    return { valid: false, conversion: null, reason: "element peak exceeds the materials limit" };
  }
  const xQs = quasiSteadyConversion(bundle.grid, drive.samples, tauS);
  if (xQs === null) {
    return { valid: false, conversion: null, reason: "CJH lookup is outside its validated map" };
  }
  return predictRphConversion(bundle.model, {
    xQs, periodS, tauS, duty, tPeakC: drive.tPeak, tMinC: drive.tMin,
  });
}
