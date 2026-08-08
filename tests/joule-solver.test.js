// Regression tests for the Joule-heating numeric core (joule-solver.js).
// Pure Node, no browser: run with `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MATERIALS, geometry, calculate, build2DMesh, solveThermal2D
} from "../joule-solver.js";

const DEFAULT_ENCLOSURE = {
  wallMaterial: "quartz", wallK: 1.4, wallThickness: 0.003, wallEmissivity: 0.93,
  gap: 0.001, gapK: 0.03, endMode: "ambient", endK: 1273.15, endH: 200,
  contactRho: 0, maxIter: 160, tolerance: 1e-4
};

function materialByName(name) {
  const material = MATERIALS.find((m) => m.name === name);
  assert.ok(material, `unknown test material: ${name}`);
  return material;
}

// Mirrors joule.html's own default control values (solid rod, 1000 °C target,
// 20 A / 100 V / 2000 W hardware limits) so solves land near the target
// temperature instead of the runaway high-power regime an arbitrary guess
// at imax/vmax/pmax would produce.
function makeInput(materialName, aspectRatio, overrides = {}) {
  const material = materialByName(materialName);
  return {
    material,
    solidFraction: 1,
    volumeCm3: 10,
    aspectRatio,
    imax: 20,
    vmax: 100,
    pmax: 2000,
    ambientK: 293.15,
    targetK: 1273.15,
    emissivity: material.emissivity ?? 0.8,
    convection: false,
    h: 0,
    gasK: 293.15,
    biLimit: 0.01,
    enclosure: { ...DEFAULT_ENCLOSURE },
    ...overrides
  };
}

test("calculate() returns a feasible 0D result for a plain SiC rod", () => {
  const x = makeInput("SiC", 6);
  const zeroD = calculate(x);
  assert.deepEqual(zeroD.errors, []);
  assert.ok(Number.isFinite(zeroD.tss));
  assert.ok(zeroD.tss > x.ambientK);
});

test("calculate() reports validation errors instead of throwing on bad input", () => {
  const x = makeInput("SiC", 6, { pmax: -1 });
  const result = calculate(x);
  assert.ok(result.errors.length > 0);
});

test("build2DMesh() partitions the exact radial cell count for every L/D in the sweep", () => {
  for (const aspectRatio of [1, 2, 4, 8, 12, 20, 30]) {
    const x = makeInput("SiC", aspectRatio);
    const g = geometry(x);
    const mesh = build2DMesh(g, x.enclosure);
    assert.equal(mesh.nElement + mesh.nGap + mesh.nWall + mesh.nAir, mesh.nr);
  }
});

test("solveThermal2D() previously oscillated on SiC L/D=12; now converges cleanly", () => {
  const x = makeInput("SiC", 12);
  const zeroD = calculate(x);
  const result = solveThermal2D(x, zeroD, x.enclosure, x.material);
  assert.deepEqual(result.errors, []);
  assert.ok(result.converged, `did not converge: residual=${result.residual}, iterations=${result.iterations}`);
  assert.ok(result.iterations < x.enclosure.maxIter, "hit the iteration cap instead of converging");
  assert.ok(result.closure < 0.01, `energy closure too large: ${result.closure}`);
  assert.ok(Number.isFinite(result.avgK) && result.avgK > x.ambientK);
});

test("solveThermal2D() is deterministic for identical inputs", () => {
  const x = makeInput("MoSi₂", 8);
  const zeroD = calculate(x);
  const a = solveThermal2D(x, zeroD, x.enclosure, x.material);
  const b = solveThermal2D(x, zeroD, x.enclosure, x.material);
  assert.equal(a.avgK, b.avgK);
  assert.equal(a.iterations, b.iterations);
  assert.equal(a.closure, b.closure);
});

test("solveThermal2D() converges with low energy closure across an L/D x material sweep", () => {
  const aspectRatios = [1, 2, 4, 8, 12, 20, 30];
  const materialNames = ["CFP", "SiC", "MoSi₂", "Kanthal A-1 (FeCrAl)", "304 stainless steel", "Tungsten"];
  const failures = [];

  for (const materialName of materialNames) {
    for (const aspectRatio of aspectRatios) {
      const x = makeInput(materialName, aspectRatio);
      const zeroD = calculate(x);
      const result = solveThermal2D(x, zeroD, x.enclosure, x.material);

      const problems = [];
      if (result.errors.length) problems.push(`config errors: ${result.errors.join("; ")}`);
      if (!Number.isFinite(result.avgK)) problems.push("avgK is not finite");
      if (!result.converged) problems.push(`did not converge (residual=${result.residual})`);
      if (Number.isFinite(result.closure) && result.closure > 0.02) problems.push(`closure=${result.closure}`);
      if (!Number.isFinite(result.closure)) problems.push("closure is not finite");

      if (problems.length) failures.push(`${materialName} L/D=${aspectRatio}: ${problems.join(", ")}`);
    }
  }

  assert.deepEqual(failures, [], `${failures.length}/${aspectRatios.length * materialNames.length} cases failed:\n${failures.join("\n")}`);
});

test("calculate() rejects non-finite and out-of-range input instead of producing NaN results", () => {
  const badCases = [
    { label: "zero volume", overrides: { volumeCm3: 0 } },
    { label: "negative aspect ratio", overrides: { aspectRatio: -6 } },
    { label: "NaN aspect ratio", overrides: { aspectRatio: NaN } },
    { label: "zero ambient temperature", overrides: { ambientK: 0 } },
    { label: "negative target temperature", overrides: { targetK: -1 } },
    { label: "zero max current", overrides: { imax: 0 } },
    { label: "solid fraction above 1", overrides: { solidFraction: 1.5 } },
    { label: "emissivity above 1", overrides: { emissivity: 1.2 } }
  ];
  for (const { label, overrides } of badCases) {
    const x = makeInput("SiC", 6, overrides);
    const result = calculate(x);
    assert.ok(result.errors.length > 0, `expected "${label}" to be rejected with a validation error`);
    assert.equal(result.tss, undefined, `"${label}" should not produce a partial numeric result`);
  }
});

test("solveThermal2D() stays finite (no NaN/Infinity) at the extreme ends of the L/D range", () => {
  for (const aspectRatio of [0.2, 50]) {
    const x = makeInput("SiC", aspectRatio);
    const zeroD = calculate(x);
    assert.deepEqual(zeroD.errors, [], `L/D=${aspectRatio} unexpectedly failed validation`);
    const result = solveThermal2D(x, zeroD, x.enclosure, x.material);
    assert.deepEqual(result.errors, []);
    assert.ok(Number.isFinite(result.avgK), `L/D=${aspectRatio}: avgK=${result.avgK}`);
    assert.ok(Number.isFinite(result.closure), `L/D=${aspectRatio}: closure=${result.closure}`);
  }
});
