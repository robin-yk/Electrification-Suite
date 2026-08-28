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
//      The order is taken from the successive solutions themselves, not from
//      their distance to the fine reference. The reference is only eight times
//      finer than the coarsest step it is compared against, so its own error
//      is a sizeable part of every difference measured from it, and it biases
//      the apparent order upward by a growing amount. Substituting the exact
//      first-order errors, log2(|h_i - h_ref| / |h_i+1 - h_ref|) with
//      h_ref = tEnd/512, gives 1.02, 1.05 and 1.10 for a scheme that is
//      exactly first order: the drift is the reference, not the march.
//      Differencing consecutive solutions cancels the exact answer instead of
//      approximating it, so no reference enters the slope. The distance to the
//      reference is still reported, and is what Fig. 3(e) plots, because it is
//      the honest magnitude of the error. It is only the slope that must not
//      be read off it.
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

// The two studies the Application Note figure plots. They are exported so the
// figure build and this report cannot describe different runs.
export function longTimeLimit() {
  const xl = makeInput(LOSSY), zl = calculate(xl);
  const steady = solveThermal2D(xl, zl, LOSSY, sic);
  const rows = [];
  for (const steps of [50, 100, 200, 400]) {
    const r = solveTransient2D(xl, zl, LOSSY, sic, { dt: 5, steps, record: steps });
    const last = r.history[r.history.length - 1];
    rows.push({ tEnd: steps * 5, avgK: r.avgK, gap: Math.abs(r.avgK - steady.avgK),
                storageRate: Math.abs(last.storageRate), worstClosure: r.worstClosure });
  }
  return { rows, steadyK: steady.avgK, steadyClosure: steady.closure };
}

export function stepRefinement(tEnd = 60) {
  const xl = makeInput(LOSSY), zl = calculate(xl);
  const reference = solveTransient2D(xl, zl, LOSSY, sic, { dt: tEnd / 512, steps: 512 });
  const rows = [];
  let lastError = null, lastK = null, lastDiff = null;
  for (const n of [8, 16, 32, 64]) {
    const r = solveTransient2D(xl, zl, LOSSY, sic, { dt: tEnd / n, steps: n });
    const error = Math.abs(r.avgK - reference.avgK);
    const diff = lastK === null ? null : Math.abs(r.avgK - lastK);
    rows.push({
      dt: tEnd / n, avgK: r.avgK, error, diff,
      // Richardson on three consecutive solutions: the exact answer cancels,
      // so this is the order of the march and not of the reference.
      order: lastDiff === null || diff === null ? null : Math.log2(lastDiff / diff),
      // Reported so the contamination stays visible rather than merely claimed.
      orderVsReference: lastError === null ? null : Math.log2(lastError / error),
    });
    lastError = error; lastK = r.avgK; lastDiff = diff;
  }
  return { rows, referenceK: reference.avgK, tEnd };
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
  const lt = longTimeLimit();
  console.log(markdownTable(
    ["t_end (s)", "T_avg (K)", "|Δ| vs steady (K)", "storage rate (W)", "worst closure"],
    lt.rows.map((r) => [fix(r.tEnd, 0), fix(r.avgK, 4), sci(r.gap, 2), sci(r.storageRate, 2), sci(r.worstClosure, 2)])));
  console.log(`\nSteady reference: T_avg = ${fix(lt.steadyK, 4)} K, closure ${sci(lt.steadyClosure, 2)}\n`);

  // ------------------------------------------------------------- study 3
  console.log("### 3. Time-step refinement at t = 60 s\n");
  const sr = stepRefinement(60);
  console.log(markdownTable(
    ["dt (s)", "T_avg (K)", "error vs dt/512 (K)", "observed order", "order vs reference"],
    sr.rows.map((r) => [fix(r.dt, 4), fix(r.avgK, 5), sci(r.error, 2),
                        r.order === null ? "—" : fix(r.order, 3),
                        r.orderVsReference === null ? "—" : fix(r.orderVsReference, 3)])));

  console.log(`\nFirst order is the expected and intended result: backward Euler is A-stable,`);
  console.log(`which is what a browser-affordable step size needs on this stiff radiation`);
  console.log(`boundary, and the price is one order in time.`);
  console.log(`\nThe observed order is taken from consecutive solutions, where the exact`);
  console.log(`answer cancels. The last column is the same measurement taken against the`);
  console.log(`dt/512 reference, and is printed only to record why it must not be used:`);
  console.log(`that reference is eight times finer than the coarsest step compared to it,`);
  console.log(`so its own error inflates the slope. A march that were exactly first order`);
  console.log(`would report 1.02, 1.05 and 1.10 in that column from the contamination`);
  console.log(`alone, which is most of the drift seen there.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
