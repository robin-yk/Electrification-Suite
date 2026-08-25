// Why does the physical grid-convergence study (tools/verification/joule.mjs,
// study 4) report a poor observed order for the element average temperature?
//
// Two candidate explanations, tested here in order of cost:
//
//   0. The grid sequence is not a refinement sequence. Richardson assumes each
//      region's cell size halves exactly. build2DMesh does not take per-region
//      counts; it splits nr - nAir across element / gap / wall with
//      allocateSegmentCells, whose per-region minima (8 / 1 / 2) dominate on
//      coarse grids. The legacy sequence (nr = 30 << level, nAir = 8 << level)
//      therefore refines the wall by 1.75x on one step and 2.0x on the next,
//      which alone can produce a meaningless or negative observed order.
//      Study 0 audits both sequences. No solve required.
//
//   1. A material corner singularity. Element (k ~ 120), gas gap (k = 0.03)
//      and the outside-air cap meet at one mesh corner, r = R and z = +-L/2.
//      assemble2DSystem builds radial and axial face conductances independently
//      with no corner correction, so the discrete solution can inherit a local
//      T ~ r^alpha (alpha < 1) behaviour that never reaches second order, and a
//      volume average taken over those cells inherits the same defect.
//      Studies 1 to 3 test this on a sequence that passes study 0.
//
// Run: node tools/verification/corner.mjs
"use strict";
import { kelvin, geometry, calculate, solveThermal2D, build2DMesh, MATERIALS } from "../../apps/joule/solver.js";
import { richardson, markdownTable, sci, fix } from "./common.mjs";
import { defaultInput } from "./joule.mjs";

// Legacy sequence used by joule.mjs study 4.
const legacyLevels = (n) => Array.from({ length: n }, (_, l) => ({
  nr: 30 << l, nz: 60 << l, nAir: 8 << l, nAirZ: 8 << l,
}));

// Self-similar sequence. The default geometry has element : gap : wall radial
// lengths of 10 : 1 : 2, so allocateSegmentCells splits any active radial count
// that is a multiple of 13 into exactly (10n, n, 2n). Taking nr - nAir = 13 << l
// with nAir = 4 << l makes every region, and the outer air padding, double on
// every level while domainRadius and domainHeight stay fixed.
const cleanLevels = (n) => Array.from({ length: n }, (_, l) => ({
  nr: 17 << l, nz: 60 << l, nAir: 4 << l, nAirZ: 8 << l,
}));

function meshFor(x, grid) {
  return build2DMesh(geometry(x), { ...x.enclosure, ...grid });
}

function solveCase(x, grid) {
  const cfg = { ...x.enclosure, ...grid };
  const sol = solveThermal2D(x, calculate({ ...x, enclosure: cfg }), cfg, x.material);
  if (sol.errors.length) throw new Error("solveThermal2D: " + sol.errors.join("; "));
  if (!sol.converged) throw new Error(`solveThermal2D did not converge (residual ${sol.residual})`);
  return sol;
}

// ---------------------------------------------------------------- study 0
// Per-region refinement ratios. Anything other than 2.000 breaks the premise
// of richardson() in common.mjs.
export function sequenceAudit(x, levels) {
  const rows = [];
  let prev = null;
  for (const grid of levels) {
    const m = meshFor(x, grid);
    const ratio = (now, before) => (prev ? fix(now / before, 3) : "-");
    rows.push([
      `${grid.nr}×${grid.nz}`,
      `${m.nElement} / ${m.nGap} / ${m.nWall} / ${m.nAir}`,
      String(m.nActiveZ),
      prev ? [ratio(m.nElement, prev.nElement), ratio(m.nGap, prev.nGap), ratio(m.nWall, prev.nWall), ratio(m.nAir, prev.nAir)].join(" / ") : "-",
      prev ? ratio(m.nActiveZ, prev.nActiveZ) : "-",
      sci(m.domainRadius, 6),
    ]);
    prev = m;
  }
  return rows;
}

// ---------------------------------------------------------------- functionals
// Scalars whose definition does not depend on the grid, so their Richardson
// orders are comparable across levels.
//
//   avgC              element volume average, the quantity the app reports
//   maxC              element peak
//   centerC           fixed physical probe at (r = 0, z = 0), far from any corner
//   coreAvgC          element volume average excluding a fixed physical
//                     neighbourhood of the two triple points (r = R, z = +-L/2)
const CORNER_SKIP = 0.2; // fraction of the element radius masked around each corner

export function functionals(sol) {
  const { mesh, T } = sol;
  const R = mesh.radius, halfL = mesh.zEdges[mesh.activeEnd] , zLo = mesh.zEdges[mesh.activeStart];
  const skip = CORNER_SKIP * R;
  let vol = 0, sum = 0, coreVol = 0, coreSum = 0, max = -Infinity;
  for (let j = mesh.activeStart; j < mesh.activeEnd; j++) {
    for (let i = 0; i < mesh.nElement; i++) {
      const v = mesh.cellVolume(i, j), t = T[j][i];
      vol += v; sum += t * v; max = Math.max(max, t);
      const dr = R - mesh.centers[i];
      const dz = Math.min(mesh.zCenters[j] - zLo, halfL - mesh.zCenters[j]);
      if (Math.hypot(dr, dz) >= skip) { coreVol += v; coreSum += t * v; }
    }
  }
  // Probe the axis at mid height. The axis column is the i = 0 cell (zero
  // radial gradient there), and mid height falls on a cell centre whenever
  // nActiveZ is even, so take the mean of the two cells straddling z = 0.
  const jMid = mesh.activeStart + mesh.nActiveZ / 2;
  const center = (T[jMid - 1][0] + T[jMid][0]) / 2;
  return {
    avgC: sum / vol - 273.15,
    maxC: max - 273.15,
    centerC: center - 273.15,
    coreAvgC: coreSum / coreVol - 273.15,
  };
}

// ---------------------------------------------------------------- study 1 to 2
export function convergence(x, levels) {
  const rows = levels.map((grid) => {
    const sol = solveCase(x, grid);
    return { grid: `${grid.nr}×${grid.nz}`, ...functionals(sol), closure: sol.closure, sol };
  });
  const orders = {};
  for (const key of ["avgC", "maxC", "centerC", "coreAvgC"]) {
    orders[key] = richardson(rows[0][key], rows[1][key], rows[2][key]);
  }
  return { rows, orders };
}

// ---------------------------------------------------------------- study 3
// The corner cell itself, and its two neighbours across the material jump.
export function cornerCells(x, levels) {
  return levels.map((grid) => {
    const sol = solveCase(x, grid);
    const { mesh, T } = sol;
    const i = mesh.nElement - 1, j = mesh.activeStart;
    return [
      `${grid.nr}×${grid.nz}`,
      fix(T[j][i] - 273.15, 4),
      fix(T[j][i + 1] - 273.15, 4),   // across the radial jump, into the gap
      fix(T[j - 1][i] - 273.15, 4),   // across the axial jump, into the gas cap
      fix(T[j][0] - 273.15, 4),       // same row, on the axis
    ];
  });
}

// ---------------------------------------------------------------- report
function orderRow(label, r) {
  return [label, fix(r.p, 3), fix(r.qExtrap, 4) + " °C", sci(r.fineError, 2)];
}

function main() {
  const x = defaultInput({}, { tolerance: 1e-4, maxIter: 500 });
  const levels = 3;

  console.log("## Joule 2D: grid-sequence audit and corner diagnosis\n");

  console.log("### 0. Is the grid sequence a refinement sequence?\n");
  console.log("Legacy sequence (joule.mjs study 4):\n");
  console.log(markdownTable(
    ["grid", "element / gap / wall / air cells", "active z", "radial ratios", "axial ratio", "domain radius (m)"],
    sequenceAudit(x, legacyLevels(4)),
  ) + "\n");
  console.log("Self-similar sequence:\n");
  console.log(markdownTable(
    ["grid", "element / gap / wall / air cells", "active z", "radial ratios", "axial ratio", "domain radius (m)"],
    sequenceAudit(x, cleanLevels(4)),
  ) + "\n");

  console.log("### 1. Observed order, legacy vs self-similar sequence\n");
  const legacy = convergence(x, legacyLevels(levels));
  const clean = convergence(x, cleanLevels(levels));
  for (const [name, study] of [["legacy", legacy], ["self-similar", clean]]) {
    console.log(`${name}:\n`);
    console.log(markdownTable(
      ["grid", "avg (°C)", "max (°C)", "axis centre (°C)", "core avg (°C)", "energy closure"],
      study.rows.map((r) => [r.grid, fix(r.avgC, 4), fix(r.maxC, 4), fix(r.centerC, 4), fix(r.coreAvgC, 4), sci(r.closure, 2)]),
    ) + "\n");
    console.log(markdownTable(
      ["functional", "observed order", "extrapolated", "finest-grid relative error"],
      [
        orderRow("element average", study.orders.avgC),
        orderRow("element max", study.orders.maxC),
        orderRow("axis centre probe", study.orders.centerC),
        orderRow(`core average (corner ${CORNER_SKIP}·R masked)`, study.orders.coreAvgC),
      ],
    ) + "\n");
  }

  console.log("### 2. Corner heat path cut (endMode = adiabatic), self-similar sequence\n");
  const adiabatic = convergence(defaultInput({}, { tolerance: 1e-4, maxIter: 500, endMode: "adiabatic" }), cleanLevels(levels));
  console.log(markdownTable(
    ["grid", "avg (°C)", "max (°C)", "axis centre (°C)", "core avg (°C)", "energy closure"],
    adiabatic.rows.map((r) => [r.grid, fix(r.avgC, 4), fix(r.maxC, 4), fix(r.centerC, 4), fix(r.coreAvgC, 4), sci(r.closure, 2)]),
  ) + "\n");
  console.log(markdownTable(
    ["functional", "observed order", "extrapolated", "finest-grid relative error"],
    [
      orderRow("element average", adiabatic.orders.avgC),
      orderRow("element max", adiabatic.orders.maxC),
      orderRow("axis centre probe", adiabatic.orders.centerC),
      orderRow(`core average (corner ${CORNER_SKIP}·R masked)`, adiabatic.orders.coreAvgC),
    ],
  ) + "\n");

  console.log("### 3. The corner cell itself (self-similar sequence)\n");
  console.log(markdownTable(
    ["grid", "corner cell (°C)", "+1 radial, into gap (°C)", "-1 axial, into gas cap (°C)", "same row on axis (°C)"],
    cornerCells(x, cleanLevels(levels)),
  ) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
