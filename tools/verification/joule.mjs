// Numerical verification of the Joule 2D axisymmetric FV solver
// (apps/joule/solver.js: solveThermal2D). Four studies, printed as markdown:
//
//   1. Radial-parabola exactness: uniform Joule source, constant k: the exact
//      solution is quadratic in r, which a conservative 2-point-flux FV scheme
//      reproduces exactly at cell centers. Checks the cylindrical radial
//      operator + source integration at machine precision.
//   2. Multi-layer annulus: mid-plane temperature drops across gap and wall
//      vs the ln-resistance solution of an infinite cylinder; the residual
//      shrinks as the element is made longer (axial leakage -> 0).
//   3. Manufactured solution (MMS): uniform-k domain (element k = wall k =
//      gap k = outside-air k = 0.026 W/m·K), radiation and convection off, a
//      known smooth T*(r,z) imposed through cfg.verificationSource; L2/Linf
//      errors vs grid give the observed convergence order.
//   4. Physical-case grid convergence: the app's default SiC case on a
//      doubling grid sequence; Richardson extrapolation for the observed
//      order and the default grid's distance from the extrapolated answer,
//      plus energy-balance closure and linear-solver residuals per grid.
//
// Run: node tools/verification/joule.mjs
"use strict";
import { kelvin, geometry, calculate, solveThermal2D, build2DMesh, MATERIALS, OUTSIDE_AIR_K } from "../../apps/joule/solver.js";
import { errorNorms, observedOrder, richardson, markdownTable, sci, fix } from "./common.mjs";

const SIC = MATERIALS.find((m) => m.name === "SiC");

// The web page's default inputs (apps/joule/index.html field defaults).
export function defaultInput(overrides = {}, enclosureOverrides = {}) {
  return {
    material: SIC,
    imax: 20, vmax: 100, pmax: 2000,
    volumeCm3: 1.18, aspectRatio: 1.5, solidFraction: 1,
    emissivity: 0.8, convection: true, h: 12,
    ambientK: kelvin(20), gasK: kelvin(20), targetK: kelvin(1000), biLimit: 0.01,
    enclosure: {
      wallMaterial: "quartz", wallK: 1.4, wallThickness: 1e-3, wallEmissivity: 0.93,
      gap: 0.5e-3, gapK: 0.03, endMode: "ambient", endK: kelvin(20), endH: 250,
      contactRho: 0, maxIter: 160, tolerance: 1e-4,
      ...enclosureOverrides,
    },
    ...overrides,
  };
}

// Grid sequence that doubles resolution while keeping the physical domain
// identical. This used to pin nAir and nAirZ explicitly, because domainRadius
// and domainHeight were derived from nAir/nr and nAirZ/nz and a fixed nAir would
// have walked the far-field boundary inward on every refinement. build2DMesh
// states the domain reach directly now and scales those counts itself, so
// pinning them here only overrode the shipped mesh -- which meant this study was
// measuring an allocation the page does not use.
const gridLevels = (n) => Array.from({ length: n }, (_, level) => ({
  nr: 30 << level, nz: 60 << level,
}));

function solveCase(x, gridOverrides) {
  const cfg = { ...x.enclosure, ...gridOverrides };
  const zeroD = calculate({ ...x, enclosure: cfg });
  const sol = solveThermal2D(x, zeroD, cfg, x.material);
  if (sol.errors.length) throw new Error("solveThermal2D: " + sol.errors.join("; "));
  if (!sol.converged) throw new Error(`solveThermal2D did not converge (residual ${sol.residual})`);
  return sol;
}

// ---------------------------------------------------------------- study 1
// Uniform source + constant k: at a mid-plane far from the ends the exact
// solution is T(r) - T(0) = -q r^2 / (4 k), and a conservative 2-point-flux FV
// scheme reproduces quadratics exactly at cell centers. The only mismatch left
// is the *physical* axial curvature of a finite rod, so the error must fall
// rapidly as L/D grows; that trend separates discretization error (absent)
// from finite-length physics (present, vanishing).
export function radialParabola(aspectRatio, { nr = 30, nz = 60, nAir = 8, nAirZ = 8 } = {}) {
  const x = defaultInput(
    { aspectRatio, emissivity: 0.5, convection: true, h: 12 },
    { gap: 0, tolerance: 1e-9, maxIter: 400 },
  );
  const sol = solveCase(x, { nr, nz, nAir, nAirZ });
  const { mesh, T, qVol } = sol;
  const k = SIC.k; // constant-k material
  const j = mesh.activeStart + Math.floor(mesh.nActiveZ / 2);
  let worst = 0;
  for (let i = 1; i < mesh.nElement; i++) {
    const r = mesh.centers[i], r0 = mesh.centers[0];
    const exact = -qVol * (r * r - r0 * r0) / (4 * k);
    const got = T[j][i] - T[j][0];
    worst = Math.max(worst, Math.abs(got - exact) / Math.abs(exact));
  }
  const dTexact = qVol * mesh.radius * mesh.radius / (4 * k);
  return { worstRelative: worst, centerToSurfaceK: dTexact, qVol };
}

// ---------------------------------------------------------------- study 2
// Mid-plane drops across the element / wall / air layers vs the ln-resistance
// solution of an infinite cylinder carrying the generated power per unit
// length. Gap = 0 (which also disables the He purge stream), radiation and
// convection off, small fixed power, so pure multi-layer conduction theory
// applies; the residual is axial leakage, which must shrink as L/D grows.
export function annulusDrops(aspectRatio) {
  const x = defaultInput(
    { aspectRatio, emissivity: 0, convection: false, imax: 1000, vmax: 1000, pmax: 2 },
    { gap: 0, wallThickness: 2e-3, wallK: 1.4, wallEmissivity: 0, tolerance: 1e-7, maxIter: 400 },
  );
  const sol = solveCase(x, { nr: 40, nz: 80, nAir: 10, nAirZ: 10 });
  const { mesh, T, qVol } = sol;
  const j = mesh.activeStart + Math.floor(mesh.nActiveZ / 2);
  const qPerLength = qVol * Math.PI * mesh.radius * mesh.radius; // W/m generated inside r<R
  const iElem = mesh.nElement - 1, iWall = mesh.nElement, iAir = mesh.nElement + mesh.nWall;
  // Piecewise radial theory between two radii: inside the element the drop is
  // q(r2^2-r1^2)/(4k); outside it is the ln-resistance of each annulus.
  const kE = SIC.k, kW = x.enclosure.wallK;
  const R = mesh.radius, Rw = R + x.enclosure.wallThickness;
  const path = (r1, r2) => {
    let total = 0;
    const seg = (a, b, k) => qPerLength * Math.log(b / a) / (2 * Math.PI * k);
    const marks = [r1, Math.min(Math.max(r1, R), r2), Math.min(Math.max(r1, Rw), r2), r2];
    for (let n = 0; n < marks.length - 1; n++) {
      const a = marks[n], b = marks[n + 1];
      if (b <= a) continue;
      const mid = (a + b) / 2;
      if (mid < R) total += (qVol / (4 * kE)) * (b * b - a * a);
      else total += seg(a, b, mid < Rw ? kW : OUTSIDE_AIR_K);
    }
    return total;
  };
  const cases = [
    ["element center → element edge", T[j][0] - T[j][iElem], path(mesh.centers[0], mesh.centers[iElem])],
    ["element edge → wall inner", T[j][iElem] - T[j][iWall], path(mesh.centers[iElem], mesh.centers[iWall])],
    ["wall inner → wall outer", T[j][iWall] - T[j][iWall + mesh.nWall - 1], path(mesh.centers[iWall], mesh.centers[iWall + mesh.nWall - 1])],
    ["wall outer → air (2 cells out)", T[j][iWall + mesh.nWall - 1] - T[j][iAir + 1], path(mesh.centers[iWall + mesh.nWall - 1], mesh.centers[iAir + 1])],
  ];
  return cases.map(([label, got, theory]) => ({ label, got, theory, relative: Math.abs(got - theory) / Math.abs(theory) }));
}

// ---------------------------------------------------------------- study 3
// Manufactured solution on a uniform-k domain. T* = Ta + A f(r) g(z) with
// quartic bumps that vanish (value and slope) on every outer boundary, so the
// solver's ambient boundary handling is exactly consistent with T*.
export function mmsStudy(levels = 3) {
  const A = 400; // K amplitude
  const x = defaultInput(
    {
      material: { name: "MMS medium", rhoOhmCm: 1, density: 1000, cp: 500, k: OUTSIDE_AIR_K, jmax: 1e9 },
      emissivity: 0, convection: false,
    },
    { gap: 0, gapK: OUTSIDE_AIR_K, wallK: OUTSIDE_AIR_K, wallEmissivity: 0, tolerance: 1e-7, maxIter: 400 },
  );
  const rows = [];
  for (const grid of gridLevels(levels)) {
    const g = geometry(x);
    const probe = build2DMesh(g, { ...x.enclosure, ...grid });
    const Rd = probe.domainRadius, Hd = probe.domainHeight, Ta = x.ambientK, k = OUTSIDE_AIR_K;
    const f = (r) => { const u = (r / Rd) ** 2; return (1 - u) ** 2; };
    const gz = (z) => { const v = (2 * z / Hd) ** 2; return (1 - v) ** 2; };
    const Tstar = (r, z) => Ta + A * f(r) * gz(z);
    const a = 4 / (Hd * Hd);
    const laplacian = (r, z) => {
      const u = (r / Rd) ** 2;
      const radial = (-8 + 16 * u) / (Rd * Rd) * gz(z);
      const axial = f(r) * (-4 * a + 12 * a * a * z * z);
      return A * (radial + axial);
    };
    const cfg = { ...x.enclosure, ...grid, verificationSource: (r, z) => -k * laplacian(r, z) };
    const zeroD = calculate(x);
    const sol = solveThermal2D(x, zeroD, cfg, x.material);
    if (sol.errors.length) throw new Error(sol.errors.join("; "));
    if (!sol.converged) throw new Error(`MMS grid ${grid.nr}x${grid.nz} did not converge`);
    const norms = errorNorms({
      nr: sol.mesh.nr, nz: sol.mesh.nz, field: sol.T,
      exact: (i, j) => Tstar(sol.mesh.centers[i], sol.mesh.zCenters[j]),
      volume: (i, j) => sol.mesh.cellVolume(i, j),
    });
    rows.push({ grid: `${grid.nr}×${grid.nz}`, ...norms });
  }
  for (let n = 1; n < rows.length; n++) {
    rows[n].orderL2 = observedOrder(rows[n - 1].l2, rows[n].l2);
    rows[n].orderLinf = observedOrder(rows[n - 1].linf, rows[n].linf);
  }
  return rows;
}

// ---------------------------------------------------------------- study 4
// The app's default SiC case on the doubling grid sequence.
export function physicalConvergence(levels = 3) {
  const x = defaultInput({}, { tolerance: 1e-4, maxIter: 500 });
  const rows = [];
  for (const grid of gridLevels(levels)) {
    const sol = solveCase(x, grid);
    rows.push({
      grid: `${grid.nr}×${grid.nz}`, cells: grid.nr * grid.nz,
      avgC: sol.avgK - 273.15, maxC: sol.tMax - 273.15,
      closure: sol.closure, linearResidual: sol.linearResidual, outer: sol.iterations,
    });
  }
  const rich = {
    avg: richardson(rows[0].avgC, rows[1].avgC, rows[2].avgC),
    max: richardson(rows[0].maxC, rows[1].maxC, rows[2].maxC),
  };
  return { rows, rich };
}

// ---------------------------------------------------------------- report
function main() {
  console.log("## Joule 2D solver: numerical verification\n");

  console.log("### 1. Radial parabola (discrete exactness)\n");
  const parabolaRows = [];
  for (const ar of [20, 40, 80]) {
    const p = radialParabola(ar);
    parabolaRows.push([`L/D = ${ar}`, fix(p.centerToSurfaceK, 2) + " K", sci(p.worstRelative, 2)]);
  }
  console.log(markdownTable(["case", "analytic center→surface rise", "worst relative mismatch"], parabolaRows) + "\n");

  console.log("### 2. Multi-layer annulus vs ln-resistance theory\n");
  const annulusRows = [];
  for (const ar of [20, 50, 100]) {
    for (const c of annulusDrops(ar)) annulusRows.push([`L/D = ${ar}`, c.label, fix(c.got, 3) + " K", fix(c.theory, 3) + " K", sci(c.relative, 2)]);
  }
  console.log(markdownTable(["case", "temperature drop", "solver", "theory", "relative error"], annulusRows) + "\n");

  console.log("### 3. Manufactured solution (observed order)\n");
  const mms = mmsStudy();
  console.log(markdownTable(
    ["grid", "L2 error (K)", "Linf error (K)", "order (L2)", "order (Linf)"],
    mms.map((r) => [r.grid, sci(r.l2), sci(r.linf), r.orderL2 ? fix(r.orderL2, 2) : "—", r.orderLinf ? fix(r.orderLinf, 2) : "—"]),
  ) + "\n");

  console.log("### 4. Default SiC case: grid sensitivity\n");
  const { rows, rich } = physicalConvergence();
  console.log(markdownTable(
    ["grid", "avg T (°C)", "max T (°C)", "energy closure", "linear residual", "outer iters"],
    rows.map((r) => [r.grid, fix(r.avgC, 2), fix(r.maxC, 2), sci(r.closure, 2), sci(r.linearResidual, 2), r.outer]),
  ) + "\n");
  const last = rows[rows.length - 1];
  const asymptotic = rich.avg.p > 0.5 && rich.avg.p < 3;
  if (asymptotic) {
    console.log(`Richardson (avg T): order ${fix(rich.avg.p, 2)}, extrapolated ${fix(rich.avg.qExtrap, 2)} °C, finest-grid error ${sci(rich.avg.fineError, 2)}`);
  } else {
    console.log(`Richardson order not meaningful here (grid-to-grid differences are not yet in the asymptotic range: the surface-radiation coupling localizes T^4 exchange at cell centers, a first-order effect that dominates before the second-order conduction error does). Reporting sensitivity against the finest grid instead:`);
  }
  const rise = last.avgC - 20;
  console.log(`Default 30×60 grid vs finest ${last.grid}: avg T differs by ${fix(Math.abs(rows[0].avgC - last.avgC), 2)} K (${fix(100 * Math.abs(rows[0].avgC - last.avgC) / rise, 2)}% of the temperature rise), max T by ${fix(Math.abs(rows[0].maxC - last.maxC), 2)} K.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
