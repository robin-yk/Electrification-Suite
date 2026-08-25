// Regression tests for the Joule 2D current-density field (apps/joule/solver.js:
// assembleElectrical2D / solveElectrical2D). Pure Node: run with `node --test`.
//
// The field solve replaces the uniform Joule source with the dissipation of a
// solved potential. Two things have to hold before it can be trusted on a
// material with rho(T): with a uniform conductivity it must reproduce the
// uniform source it replaces, and the current it carries has to be conserved
// from one electrode to the other.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MATERIALS, geometry, calculate, build2DMesh, solveThermal2D,
  cellSigma2D, assembleElectrical2D, solveElectrical2D, propertiesAt
} from "../apps/joule/solver.js";

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

function makeInput(materialName, overrides = {}, enclosureOverrides = {}) {
  const material = materialByName(materialName);
  return {
    material, solidFraction: 1, volumeCm3: 10, aspectRatio: 6,
    imax: 20, vmax: 100, pmax: 2000,
    ambientK: 293.15, targetK: 1273.15,
    emissivity: material.emissivity ?? 0.8, convection: false, h: 0,
    gasK: 293.15, biLimit: 0.01,
    enclosure: { ...DEFAULT_ENCLOSURE, ...enclosureOverrides },
    ...overrides
  };
}

// A uniform temperature field, so sigma is uniform whatever the material does
// with temperature. Useful for the analytic checks below.
function uniformField(mesh, tempK) {
  return Array.from({ length: mesh.nz }, () => Array.from({ length: mesh.nr }, () => tempK));
}

test("cellSigma2D inverts the material resistivity in SI units", () => {
  const sisic = materialByName("SiSiC (Si-infiltrated SiC)");
  for (const tempK of [293.15, 873.15, 1473.15]) {
    const rhoOhmM = propertiesAt(sisic, tempK).rhoOhmCm * 0.01;
    assert.ok(Math.abs(cellSigma2D(tempK, sisic) - 1 / rhoOhmM) < 1e-9 * (1 / rhoOhmM));
  }
});

test("uniform conductivity reproduces the uniform source it replaces", () => {
  // Axial current through a uniform cylinder: V is linear in z, the field is
  // one-dimensional, and q''' = sigma E^2 is the same in every cell. A
  // conservative two-point-flux scheme is exact for a linear potential, so the
  // agreement with pBulk/volume is a machine-precision identity, not a
  // discretization tolerance.
  const x = makeInput("SiC"); // constant rhoOhmCm, so sigma cannot vary
  const g = geometry(x);
  const mesh = build2DMesh(g, x.enclosure);
  const T = uniformField(mesh, 1200);
  const targetCurrent = 15, targetPower = 900;
  const field = solveElectrical2D(T, x.material, mesh, targetCurrent, targetPower);

  let elementVolume = 0, worst = 0, total = 0;
  for (let j = mesh.activeStart; j < mesh.activeEnd; j++) {
    for (let i = 0; i < mesh.nElement; i++) elementVolume += mesh.cellVolume(i, j);
  }
  const expected = targetPower / elementVolume;
  for (let j = mesh.activeStart; j < mesh.activeEnd; j++) {
    for (let i = 0; i < mesh.nElement; i++) {
      const p = j * mesh.nr + i;
      total += field.qCell[p];
      worst = Math.max(worst, Math.abs(field.qCell[p] / mesh.cellVolume(i, j) - expected) / expected);
    }
  }
  assert.ok(worst < 1e-10, `uniform-sigma source is not uniform: worst relative deviation ${worst}`);
  assert.ok(Math.abs(total - targetPower) < 1e-9 * targetPower, `dissipation ${total} != target ${targetPower}`);
});

test("no dissipation is deposited outside the element", () => {
  const x = makeInput("SiC");
  const mesh = build2DMesh(geometry(x), x.enclosure);
  const field = solveElectrical2D(uniformField(mesh, 1200), x.material, mesh, 15, 900);
  for (let j = 0; j < mesh.nz; j++) {
    for (let i = 0; i < mesh.nr; i++) {
      if (mesh.materialAt(i, j) === 0) continue;
      assert.equal(field.qCell[j * mesh.nr + i], 0, `dissipation leaked into material code ${mesh.materialAt(i, j)}`);
    }
  }
});

test("uniform conductivity gives a uniform axial current density, electrodes included", () => {
  // Regression: the electrode half-faces sit at the ends of the element, so
  // their face current has to carry the same sign convention as the interior
  // faces. Averaging a +z electrode term into a -z interior field cancels to
  // near zero at the end rows, which shows up here and nowhere else.
  const x = makeInput("SiC");
  const mesh = build2DMesh(geometry(x), x.enclosure);
  const current = 15;
  const field = solveElectrical2D(uniformField(mesh, 1200), x.material, mesh, current, 900);
  const expected = current / (Math.PI * mesh.radius * mesh.radius);
  let worst = 0;
  for (let j = mesh.activeStart; j < mesh.activeEnd; j++) {
    for (let i = 0; i < mesh.nElement; i++) {
      worst = Math.max(worst, Math.abs(field.jMag[j * mesh.nr + i] - expected) / expected);
    }
  }
  assert.ok(worst < 1e-10, `axial current density is not uniform: worst relative deviation ${worst}`);
});

test("current is conserved between the two electrodes", () => {
  // Deliberately non-uniform temperature, so sigma varies and the current has
  // to redistribute; whatever it does, both electrodes must pass the same total.
  const x = makeInput("SiSiC (Si-infiltrated SiC)");
  const mesh = build2DMesh(geometry(x), x.enclosure);
  const T = Array.from({ length: mesh.nz }, (_, j) =>
    Array.from({ length: mesh.nr }, (_, i) => 600 + 900 * Math.exp(-((mesh.centers[i] / mesh.radius) ** 2))));
  const system = assembleElectrical2D(T, x.material, mesh);
  const field = solveElectrical2D(T, x.material, mesh, 12, 500);
  const scale = field.current / field.unitCurrent;

  let driven = 0, grounded = 0;
  for (const [p, G, end] of system.electrodes) {
    const potential = field.V[p] / scale; // back to the unit-potential solution
    if (end === 1) driven += G * (1 - potential);
    else grounded += G * (potential - 0);
  }
  assert.ok(Math.abs(driven - grounded) < 1e-8 * Math.abs(driven),
    `electrode currents disagree: ${driven} vs ${grounded}`);
  assert.ok(Math.abs(driven - field.unitCurrent) < 1e-8 * field.unitCurrent);
});

test("a temperature-dependent resistivity makes the source non-uniform", () => {
  const x = makeInput("SiSiC (Si-infiltrated SiC)");
  const mesh = build2DMesh(geometry(x), x.enclosure);
  // Hot core, cool skin: SiSiC resistivity falls with temperature, so the core
  // is the better conductor and should draw more than its share of the current.
  const T = Array.from({ length: mesh.nz }, () =>
    Array.from({ length: mesh.nr }, (_, i) => 1500 - 700 * (mesh.centers[i] / mesh.radius) ** 2));
  const field = solveElectrical2D(T, x.material, mesh, 12, 500);
  const jMid = mesh.activeStart + Math.floor(mesh.nActiveZ / 2);
  const core = field.qCell[jMid * mesh.nr] / mesh.cellVolume(0, jMid);
  const skin = field.qCell[jMid * mesh.nr + mesh.nElement - 1] / mesh.cellVolume(mesh.nElement - 1, jMid);
  assert.ok(core > skin * 1.05, `expected core-heavy dissipation, got core ${core} vs skin ${skin}`);
});

test("cfg.currentField is off by default and does not move the answer when sigma is uniform", () => {
  const x = makeInput("SiC");
  const plainCfg = { ...x.enclosure };
  const fieldCfg = { ...x.enclosure, currentField: true };
  const plain = solveThermal2D(x, calculate(x), plainCfg, x.material);
  const withField = solveThermal2D(x, calculate({ ...x, enclosure: fieldCfg }), fieldCfg, x.material);
  assert.deepEqual(plain.errors, []);
  assert.deepEqual(withField.errors, []);
  assert.equal(plain.electrical, null, "the uniform-source path must not run an electrical solve");
  assert.ok(withField.electrical, "cfg.currentField must attach the electrical solution");
  // Constant-resistivity material: the field solve reproduces the uniform
  // source exactly, so the converged temperature must not move.
  assert.ok(Math.abs(withField.avgK - plain.avgK) < 1e-6,
    `uniform sigma changed the answer: ${plain.avgK} -> ${withField.avgK}`);
});
