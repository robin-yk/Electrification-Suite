// Numerical verification of the transient Joule 2D solver
// (apps/joule/solver.js: solveTransient2D). Three studies, printed as markdown.
//
//   1. Adiabatic ramp: with every loss path switched off and a material whose
//      resistivity does not vary, the exact solution is a straight line of
//      slope P_bulk/(m c_p). Backward Euler integrates a constant derivative
//      exactly, so the residual here is the storage term and the source, with
//      no time-discretisation error mixed in.
//   2. Steady limit: run long enough and the storage term vanishes, leaving
//      the steady operator. The transient answer must therefore land on
//      solveThermal2D's — the case the analytic, multilayer, and manufactured
//      solutions already verify.
//   3. Time-step refinement: halving dt at a fixed mid-transient time must
//      halve the error, and no better. Backward Euler is first order by
//      construction; the point of measuring it is to confirm the claim rather
//      than to discover a higher one.
//
// Run: node tools/verification/joule-transient.mjs
"use strict";
import {
  MATERIALS, calculate, geometry, propertiesAt,
  solveTransient2D, solveThermal2D,
} from "../../apps/joule/solver.js";
import { markdownTable, sci, fix } from "./common.mjs";

const sic = MATERIALS.find((m) => m.name === "SiC");
const GRID = { nr: 30, nz: 60 };

const ADIABATIC = {
  wallMaterial: "quartz", wallK: 1.4, wallThickness: 0.002, wallEmissivity: 0,
  gap: 0.002, gapK: 1e-9, endMode: "adiabatic", endK: 293.15, endH: 0,
  contactRho: 0, maxIter: 200, tolerance: 1e-6, ...GRID,
};
const LOSSY = {
  wallMaterial: "quartz", wallK: 1.4, wallThickness: 0.002, wallEmissivity: 0.93,
  gap: 0.001, gapK: 0.03, endMode: "ambient", endK: 293.15, endH: 200,
  contactRho: 0, maxIter: 200, tolerance: 1e-5, ...GRID,
};

function makeInput(enclosure) {
  return {
    material: sic, solidFraction: 1, volumeCm3: 10, aspectRatio: 4,
    imax: 20, vmax: 200, pmax: 5000, ambientK: 293.15, targetK: 1273.15,
    emissivity: enclosure.wallEmissivity === 0 ? 0 : 0.8,
    convection: false, h: 0, gasK: 293.15, biLimit: 0.1,
    supplyMode: "cc", iset: 20, enclosure,
  };
}

function main() {
  console.log("## Joule 2D transient solver: numerical verification\n");

  // ------------------------------------------------------------- study 1
  console.log("### 1. Adiabatic ramp against P/(m·c_p)\n");
  const xa = makeInput(ADIABATIC), za = calculate(xa), ga = geometry(xa);
  const rate = za.target.power / (sic.density * ga.volume * propertiesAt(sic, 300).cp);
  const ra = solveTransient2D(xa, za, ADIABATIC, sic, { dt: 0.05, steps: 40, record: 8 });
  console.log(markdownTable(
    ["t (s)", "T_avg (K)", "exact (K)", "error (K)", "element spread (K)"],
    ra.history.map((h) => {
      const exact = xa.ambientK + rate * h.t;
      return [fix(h.t, 2), fix(h.avgK, 5), fix(exact, 5), sci(Math.abs(h.avgK - exact), 2), sci(h.tMax - h.tMin, 2)];
    }),
  ));
  console.log(`\nAnalytic slope ${fix(rate, 5)} K/s from P_bulk = ${fix(za.target.power, 3)} W over ${fix(sic.density * ga.volume * 1000, 3)} g of SiC.`);
  console.log(`Worst energy closure over the march: ${sci(ra.worstClosure, 2)}\n`);

  // ------------------------------------------------------------- study 2
  console.log("### 2. Long-time limit against the steady solve\n");
  const xl = makeInput(LOSSY), zl = calculate(xl);
  const steady = solveThermal2D(xl, zl, LOSSY, sic);
  const rows = [];
  for (const steps of [50, 100, 200, 400]) {
    const r = solveTransient2D(xl, zl, LOSSY, sic, { dt: 5, steps, record: steps });
    const last = r.history[r.history.length - 1];
    rows.push([fix(steps * 5, 0), fix(r.avgK, 4), sci(Math.abs(r.avgK - steady.avgK), 2),
               sci(Math.abs(last.storageRate), 2), sci(r.worstClosure, 2)]);
  }
  console.log(markdownTable(
    ["t_end (s)", "T_avg (K)", "|Δ| vs steady (K)", "storage rate (W)", "worst closure"], rows));
  console.log(`\nSteady reference: T_avg = ${fix(steady.avgK, 4)} K, closure ${sci(steady.closure, 2)}\n`);

  // ------------------------------------------------------------- study 3
  console.log("### 3. Time-step refinement at t = 60 s\n");
  const T_END = 60;
  const reference = solveTransient2D(xl, zl, LOSSY, sic, { dt: T_END / 512, steps: 512 });
  const orders = [];
  let previous = null;
  for (const n of [8, 16, 32, 64]) {
    const r = solveTransient2D(xl, zl, LOSSY, sic, { dt: T_END / n, steps: n });
    const err = Math.abs(r.avgK - reference.avgK);
    orders.push([fix(T_END / n, 4), fix(r.avgK, 5), sci(err, 2),
                 previous === null ? "—" : fix(Math.log2(previous / err), 2)]);
    previous = err;
  }
  console.log(markdownTable(["dt (s)", "T_avg (K)", "error vs dt/512 (K)", "observed order"], orders));
  console.log(`\nFirst order is the expected and intended result: backward Euler is A-stable,`);
  console.log(`which is what a browser-affordable step size needs on this stiff radiation`);
  console.log(`boundary, and the price is one order in time.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
