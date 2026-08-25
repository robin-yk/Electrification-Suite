// Numerical verification of the Joule 2D current-density field
// (apps/joule/solver.js: assembleElectrical2D / solveElectrical2D).
//
// The two-point-flux operator itself is already verified to second order by the
// thermal manufactured solution (joule.mjs study 3); the electrical assembly
// reuses the identical formula with sigma in place of k. What is new here, and
// what these studies cover, is everything built around it:
//
//   1. Uniform sigma: the solved resistance must equal rho L / A, and the
//      potential must be linear in z. Both are machine-precision identities for
//      a conservative scheme, so this pins the electrode half-cell boundary
//      condition and the element-only masking at once.
//   2. Radial sigma(r): current stays axial, so V is still linear and the
//      element is a bundle of parallel conductors. J(r)/J(0) must equal
//      sigma(r)/sigma(0) exactly, cell by cell: that is the check that the
//      insulating boundary at the element surface really is insulating and that
//      no current leaks into the gap. The resistance itself converges at second
//      order rather than exactly, because the parallel conductance sums
//      cell-centered sigma over annuli instead of integrating it.
//   3. Axial sigma(z): the resistance is the series integral
//      R = (1/A) integral dz / sigma(z). Cell-centered sigma makes this one
//      second-order rather than exact, so it gives an observed order.
//   4. Bookkeeping: electrode currents agree, and the dissipation sums to I^2 R.
//
// Run: node tools/verification/electrical.mjs
"use strict";
import { geometry, build2DMesh, propertiesAt, assembleElectrical2D, solveElectrical2D, kelvin, celsius } from "../../apps/joule/solver.js";
import { observedOrder, markdownTable, sci, fix } from "./common.mjs";

// Synthetic material with an analytic rho(T): propertiesAt applies
// rhoOhmCm * max(0.05, 1 + rhoAlpha * (Tc - 20)). Staying well above the 0.05
// floor keeps the closed form valid.
const RHO_REF = 0.05, RHO_ALPHA = 4e-4;
const PROBE = {
  name: "linear-rho probe", rhoOhmCm: RHO_REF, rhoAlpha: RHO_ALPHA,
  density: 3000, cp: 700, k: 50, jmax: 1e9,
};
const sigmaExact = (tempK) => 1 / (RHO_REF * (1 + RHO_ALPHA * (celsius(tempK) - 20)) * 0.01);

const baseInput = {
  material: PROBE, solidFraction: 1, volumeCm3: 10, aspectRatio: 6,
  imax: 20, vmax: 100, pmax: 2000, ambientK: kelvin(20), targetK: kelvin(1000),
  emissivity: 0.8, convection: false, h: 0, gasK: kelvin(20), biLimit: 0.01,
  enclosure: {
    wallMaterial: "quartz", wallK: 1.4, wallThickness: 3e-3, wallEmissivity: 0.93,
    gap: 1e-3, gapK: 0.03, endMode: "ambient", endK: kelvin(1000), endH: 200,
    contactRho: 0, maxIter: 160, tolerance: 1e-4,
  },
};

const meshAt = (grid) => build2DMesh(geometry(baseInput), { ...baseInput.enclosure, ...grid });
const gridLevels = (n) => Array.from({ length: n }, (_, l) => ({ nr: 30 << l, nz: 60 << l }));

// Temperature field built from a profile, so sigma follows a known analytic law.
const fieldFrom = (mesh, profile) => Array.from({ length: mesh.nz }, (_, j) =>
  Array.from({ length: mesh.nr }, (_, i) => profile(mesh.centers[i], mesh.zCenters[j])));

// Composite Simpson on [a, b].
function integrate(f, a, b, panels = 20000) {
  const h = (b - a) / panels;
  let total = f(a) + f(b);
  for (let n = 1; n < panels; n++) total += f(a + n * h) * (n % 2 ? 4 : 2);
  return total * h / 3;
}

const CURRENT = 12; // A, the drive level used throughout

function solveOn(mesh, profile) {
  const T = fieldFrom(mesh, profile);
  return { T, system: assembleElectrical2D(T, PROBE, mesh), field: solveElectrical2D(T, PROBE, mesh, CURRENT, 1) };
}

// ---------------------------------------------------------------- study 1
export function uniformSigma(grid) {
  const mesh = meshAt(grid), tempK = kelvin(800);
  const { field } = solveOn(mesh, () => tempK);
  const area = Math.PI * mesh.radius * mesh.radius, length = mesh.zEdges[mesh.activeEnd] - mesh.zEdges[mesh.activeStart];
  const exact = length / (sigmaExact(tempK) * area);
  // Linearity of V: compare the unit-potential solution against (z - z0) / L.
  const scale = field.current / field.unitCurrent, zLo = mesh.zEdges[mesh.activeStart];
  let worstLinear = 0;
  for (let j = mesh.activeStart; j < mesh.activeEnd; j++) {
    for (let i = 0; i < mesh.nElement; i++) {
      const unit = field.V[j * mesh.nr + i] / scale;
      worstLinear = Math.max(worstLinear, Math.abs(unit - (mesh.zCenters[j] - zLo) / length));
    }
  }
  return { got: field.resistance, exact, relative: Math.abs(field.resistance - exact) / exact, worstLinear };
}

// ---------------------------------------------------------------- study 2
export function radialSigma(levels) {
  const rows = [];
  for (const grid of gridLevels(levels)) {
    const mesh = meshAt(grid), R = mesh.radius;
    // Hot core, cool skin. Current stays axial, so V is still linear in z and
    // the element behaves as a bundle of parallel conductors.
    const profile = (r) => kelvin(1400) - 700 * (r / R) ** 2;
    const { field } = solveOn(mesh, profile);
    const length = mesh.zEdges[mesh.activeEnd] - mesh.zEdges[mesh.activeStart];
    const exact = length / integrate((r) => sigmaExact(profile(r)) * 2 * Math.PI * r, 0, R);
    // J(r) / J(0) must track sigma(r) / sigma(0) cell by cell, on every grid.
    const jMid = mesh.activeStart + Math.floor(mesh.nActiveZ / 2);
    const j0 = field.jz[jMid * mesh.nr], s0 = sigmaExact(profile(mesh.centers[0]));
    let worstRatio = 0;
    for (let i = 0; i < mesh.nElement; i++) {
      const ratio = field.jz[jMid * mesh.nr + i] / j0, expected = sigmaExact(profile(mesh.centers[i])) / s0;
      worstRatio = Math.max(worstRatio, Math.abs(ratio - expected) / expected);
    }
    rows.push({ grid: `${grid.nr}×${grid.nz}`, got: field.resistance, exact, error: Math.abs(field.resistance - exact) / exact, worstRatio });
  }
  for (let n = 1; n < rows.length; n++) rows[n].order = observedOrder(rows[n - 1].error, rows[n].error);
  return rows;
}

// ---------------------------------------------------------------- study 3
export function axialSigma(levels) {
  const rows = [];
  for (const grid of gridLevels(levels)) {
    const mesh = meshAt(grid);
    const zLo = mesh.zEdges[mesh.activeStart], zHi = mesh.zEdges[mesh.activeEnd];
    // Cool ends, hot middle: the conductors are now in series along z.
    const profile = (r, z) => kelvin(1400) - 700 * ((2 * z - zLo - zHi) / (zHi - zLo)) ** 2;
    const { field } = solveOn(mesh, profile);
    const area = Math.PI * mesh.radius * mesh.radius;
    const exact = integrate((z) => 1 / sigmaExact(profile(0, z)), zLo, zHi) / area;
    rows.push({ grid: `${grid.nr}×${grid.nz}`, got: field.resistance, exact, error: Math.abs(field.resistance - exact) / exact });
  }
  for (let n = 1; n < rows.length; n++) rows[n].order = observedOrder(rows[n - 1].error, rows[n].error);
  return rows;
}

// ---------------------------------------------------------------- study 4
export function bookkeeping(grid) {
  const mesh = meshAt(grid), R = mesh.radius;
  const profile = (r, z) => kelvin(1400) - 500 * (r / R) ** 2 - 300 * (z / (mesh.domainHeight / 2)) ** 2;
  const T = fieldFrom(mesh, profile);
  const system = assembleElectrical2D(T, PROBE, mesh);
  // Ask for the dissipation the field itself produces (targetPower = I^2 R),
  // so the normalization is an identity rather than a rescaling.
  const probe = solveElectrical2D(T, PROBE, mesh, CURRENT, 1);
  const power = CURRENT * CURRENT * probe.resistance;
  const field = solveElectrical2D(T, PROBE, mesh, CURRENT, power);
  const scale = field.current / field.unitCurrent;
  let driven = 0, grounded = 0;
  for (const [p, G, end] of system.electrodes) {
    const unit = field.V[p] / scale;
    if (end === 1) driven += G * (1 - unit); else grounded += G * unit;
  }
  let total = 0, outside = 0;
  for (let j = 0; j < mesh.nz; j++) for (let i = 0; i < mesh.nr; i++) {
    const q = field.qCell[j * mesh.nr + i];
    total += q;
    if (mesh.materialAt(i, j) !== 0) outside += Math.abs(q);
  }
  return {
    driven: driven * scale, grounded: grounded * scale,
    currentMismatch: Math.abs(driven - grounded) / Math.abs(driven),
    power, total, powerMismatch: Math.abs(total - power) / power, outside,
    linearResidual: field.relativeResidual, iterations: field.iterations,
  };
}

// ---------------------------------------------------------------- report
function main() {
  console.log("## Joule 2D current-density field: numerical verification\n");
  const grid = { nr: 60, nz: 120 };

  console.log("### 1. Uniform conductivity (exact identities)\n");
  const one = uniformSigma(grid);
  console.log(markdownTable(
    ["quantity", "solver", "theory", "relative error"],
    [["element resistance", sci(one.got, 6) + " Ω", sci(one.exact, 6) + " Ω", sci(one.relative, 2)]],
  ) + "\n");
  console.log(`Worst departure of the unit potential from a straight line in z: ${sci(one.worstLinear, 2)}\n`);

  console.log("### 2. Radial conductivity profile (parallel conductors)\n");
  console.log(markdownTable(
    ["grid", "solver (Ω)", "theory (Ω)", "relative error", "order", "worst J(r)/J(0) vs σ(r)/σ(0)"],
    radialSigma(3).map((r) => [r.grid, sci(r.got, 6), sci(r.exact, 6), sci(r.error, 2), r.order ? fix(r.order, 2) : "—", sci(r.worstRatio, 2)]),
  ) + "\n");

  console.log("### 3. Axial conductivity profile (series, observed order)\n");
  console.log(markdownTable(
    ["grid", "solver (Ω)", "theory (Ω)", "relative error", "order"],
    axialSigma(3).map((r) => [r.grid, sci(r.got, 6), sci(r.exact, 6), sci(r.error, 2), r.order ? fix(r.order, 2) : "—"]),
  ) + "\n");

  console.log("### 4. Current and energy bookkeeping\n");
  const four = bookkeeping(grid);
  console.log(markdownTable(
    ["check", "value", "mismatch"],
    [
      ["electrode currents (A)", `${fix(four.driven, 8)} vs ${fix(four.grounded, 8)}`, sci(four.currentMismatch, 2)],
      ["dissipation vs I²R (W)", `${fix(four.total, 8)} vs ${fix(four.power, 8)}`, sci(four.powerMismatch, 2)],
      ["dissipation outside the element (W)", sci(four.outside, 2), "—"],
    ],
  ) + "\n");
  console.log(`Linear solve: ${four.iterations} iterations, relative residual ${sci(four.linearResidual, 2)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
