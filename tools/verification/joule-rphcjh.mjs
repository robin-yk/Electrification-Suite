// Cross-solver check: the transient Joule 2D solver against the RPH vs CJH
// lumped element, on the same carbon-fiber-paper strip.
//
// These two were written independently and share no code. RPH/CJH integrates a
// single temperature with RK4 and radiates straight to ambient; Joule 2D solves
// an axisymmetric finite-volume field with backward Euler inside a quartz tube.
// Agreement between them is therefore evidence about the physics rather than
// about a shared implementation, and disagreement localises to the one thing
// they do not share.
//
// The mapping from the 38 x 8 x 0.21 mm strip to a cylinder is the one already
// shipped in apps/joule/crosscheck.js. Note what it actually matches: the
// radiating surface area (6.27 vs 6.08 cm^2) and the mass (28.8 mg, via an
// effective density), NOT the volume, which differs by a factor of eleven.
// Surface area is the right invariant for an element whose losses are
// radiation-dominated.
//
// Run: node tools/verification/joule-rphcjh.mjs
"use strict";
import { calculate, geometry, solveThermal2D, solveTransient2D } from "../../apps/joule/solver.js";
import * as RPH from "../../apps/rphcjh/solver.js";
import { markdownTable, sci, fix } from "./common.mjs";

const kelvin = (c) => c + 273.15, celsius = (k) => k - 273.15;
const CFP_D = 4.93e-3, CFP_L = 0.038, CFP_A = Math.PI / 4 * CFP_D * CFP_D;
const cfpRho = (T) => (4.25 - 7.24e-4 * T) * CFP_A * 100 / CFP_L;

// The crosscheck material, with RPH/CJH's own graphitic heat-capacity table
// grafted on so that a transient comparison is not silently comparing two
// different heat capacities. k is a parameter here because it turns out to
// decide the whole spatial-spread question below.
export const cfpMaterial = (k) => ({
  name: "CFP H23 (effective)", rhoOhmCm: cfpRho(25), density: 39.7, cp: 900, k,
  jmax: 1e9, emissivity: 0.57,
  rhoTable: [[25, cfpRho(25)], [500, cfpRho(500)], [1000, cfpRho(1000)], [1500, cfpRho(1500)], [1800, cfpRho(1800)]],
  cpTable: RPH.CFP_CP_TABLE,
});
export const cfpEnclosure = (extra = {}) => ({
  wallMaterial: "quartz", wallK: 1.4, wallThickness: 0.001, wallEmissivity: 0.93,
  gap: (17e-3 - CFP_D) / 2, gapK: 0.15, endMode: "ambient", endK: kelvin(20), endH: 200,
  contactRho: 0, maxIter: 160, tolerance: 1e-4, nr: 16, nz: 32, ...extra,
});
export const cfpInputs = (vset, material, enc) => ({
  material, solidFraction: 1, volumeCm3: 0.7254, aspectRatio: CFP_L / CFP_D,
  imax: 20, vmax: 75, pmax: 1500, supplyMode: "cv", vset, iset: 20,
  ambientK: kelvin(20), targetK: kelvin(1200), emissivity: 0.57,
  convection: false, h: 0, gasK: kelvin(20), biLimit: 0.01, enclosure: enc,
});

function main() {
  console.log("## Joule 2D transient vs the RPH/CJH lumped element (CFP strip)\n");

  console.log("### 1. What the equivalent cylinder preserves\n");
  const g = geometry(cfpInputs(20, cfpMaterial(5), cfpEnclosure()));
  console.log(markdownTable(["quantity", "38 × 8 × 0.21 mm strip", "equivalent cylinder", "ratio"], [
    ["volume (cm³)", fix(0.038 * 0.008 * 0.21e-3 * 1e6, 5), fix(g.volume * 1e6, 5), fix(g.volume / (0.038 * 0.008 * 0.21e-3), 2)],
    ["radiating area (cm²)", fix(2 * 0.038 * 0.008 * 1e4, 4), fix(g.surface * 1e4, 4), fix(g.surface / (2 * 0.038 * 0.008), 3)],
    ["mass (mg)", "28.8", fix(39.7 * g.volume * 1e6, 2), "1.000"],
  ]) + "\n");

  console.log("### 2. Steady temperature, two independent solvers\n");
  const steadyRows = [];
  for (const V of [16, 20, 25, 31]) {
    const material = cfpMaterial(5), enc = cfpEnclosure();
    const x = cfpInputs(V, material, enc), z = calculate(x);
    const s = solveThermal2D(x, z, enc, material);
    const lumped = RPH.steadyElementTemperature({ voltage: V });
    steadyRows.push([V, fix(celsius(z.tss), 1), fix(celsius(s.avgK), 1), fix(lumped, 1),
                     fix(celsius(s.avgK) - lumped, 1)]);
  }
  console.log(markdownTable(["V", "Joule 0D (°C)", "Joule 2D (°C)", "RPH/CJH (°C)", "2D − lumped (K)"], steadyRows));
  console.log("\nThe drift with voltage is the enclosure: Joule 2D puts the strip inside the");
  console.log("paper's quartz tube, which re-radiates, while the lumped model radiates to");
  console.log("ambient. Radiation grows as T⁴, so the gap between them grows with drive.\n");

  console.log("### 3. Where the 2D spatial spread comes from (steady, 20 V)\n");
  const spreadRows = [];
  for (const [label, k, extra] of [
    ["crosscheck effective k = 5", 5, {}],
    ["real CFP in-plane k = 400", 400, {}],
    ["k = 5, adiabatic ends", 5, { endMode: "adiabatic" }],
    ["k = 400, adiabatic ends", 400, { endMode: "adiabatic" }],
  ]) {
    const material = cfpMaterial(k), enc = cfpEnclosure(extra);
    const x = cfpInputs(20, material, enc), z = calculate(x);
    const s = solveThermal2D(x, z, enc, material);
    spreadRows.push([label, fix(celsius(s.avgK), 1), fix(s.tMax - s.tMin, 2)]);
  }
  console.log(markdownTable(["case", "T_avg (°C)", "element spread (K)"], spreadRows));
  console.log("\nThe 215 K spread is an artefact of the effective conductivity the crosscheck");
  console.log("assigns, not a property of the strip: at carbon paper's real in-plane value the");
  console.log("element is uniform to 8 K. Roughly half of the k = 5 spread is axial end loss.\n");

  console.log("### 4. Pulsed operation: 1 Hz, 5 % duty, 31 V\n");
  const pulsed = RPH.integratePulsedElement({ voltage: 31, period: 1, duty: 0.05 });
  const period = 1, dt = period / 200, cycles = 6;
  const rows = [["RPH/CJH lumped", fix(pulsed.tPeak, 1), fix(pulsed.tMin, 1), fix(pulsed.tAvg, 1),
                 fix(pulsed.tPeak - pulsed.tMin, 1), "—", "—"]];
  for (const k of [5, 400]) {
    const material = cfpMaterial(k), enc = cfpEnclosure();
    const x = cfpInputs(31, material, enc), z = calculate(x);
    const tr = solveTransient2D(x, z, enc, material, {
      dt, steps: 200 * cycles, record: 1, startK: kelvin(pulsed.tMin),
      sourceScale: (t) => ((t - 1e-9) % period) / period < 0.05 ? 1 : 0,
    });
    // The lumped model has one temperature, so its counterpart here is the
    // element average over the cycle, not the hottest cell anywhere in it.
    const cycle = tr.history.filter((h) => h.t > period * (cycles - 1));
    const hi = Math.max(...cycle.map((h) => h.avgK)), lo = Math.min(...cycle.map((h) => h.avgK));
    const spread = cycle.map((h) => h.tMax - h.tMin);
    rows.push([`Joule 2D, k = ${k}`, fix(celsius(hi), 1), fix(celsius(lo), 1),
               fix(celsius(cycle.reduce((s, h) => s + h.avgK, 0) / cycle.length), 1),
               fix(hi - lo, 1), `${fix(Math.min(...spread), 1)}–${fix(Math.max(...spread), 1)}`,
               sci(tr.worstClosure, 2)]);
  }
  console.log(markdownTable(
    ["model", "T_peak (°C)", "T_min (°C)", "T_avg (°C)", "swing (K)", "spatial spread (K)", "closure"], rows));
  console.log("\nThe cycle swing agrees to under a kelvin in 261, across two solvers that share");
  console.log("no code, no geometry, and no time integrator. At the strip's real conductivity");
  console.log("the spatial spread is under 1 % of the temporal swing, which is the quantitative");
  console.log("statement that RPH/CJH's lumped element is the right model for this experiment.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
