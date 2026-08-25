// When is the 0D screening model safe?
//
// The Joule tool leads with a 0D lumped model: one temperature for the whole
// element. The 2D solver resolves the field. This sweep measures the gap between
// them and tests whether it follows the closed form you can derive by hand, so
// the answer is a criterion a reader can apply rather than a table they have to
// look up.
//
// The derivation, for a cylinder of radius R with uniform volumetric generation
// q, conductivity k, losing heat through an effective coefficient h:
//
//   center-to-surface rise   dT_internal = q R^2 / (4k)
//   surface-to-ambient drop  dT_external = q R  / (2h)
//   ratio                    dT_internal / dT_external = h R / (2k) = Bi_R / 2
//
// So the fractional temperature spread the lumped model cannot see should track
// half the radius-based Biot number. The tool reports Bi on its own length scale
// lc = V/As, so both are recorded and the fit is done against each.
//
// What this answers for the tool itself: the melting-point check on the Single
// Design tab runs on the 0D Tss, and the peak of the resolved field is higher.
// The sweep gives the margin that check is missing.
//
// Run: node tools/verification/zerod-validity.mjs [--quick]
"use strict";
import { MATERIALS, kelvin, celsius, calculate, solveThermal2D } from "../../apps/joule/solver.js";
import { DEFAULT_ENCLOSURE } from "../../apps/joule/crosscheck.js";
import { markdownTable, fix, sci } from "./common.mjs";

const SWEEP_MATERIALS = ["SiC", "Molybdenum", "Kanthal A-1", "Tungsten"];
const ASPECT_RATIOS = [1.5, 4, 10, 26.9, 60];
const QUICK_RATIOS = [1.5, 10, 60];

function baseInput(material, aspectRatio, overrides = {}) {
  return {
    material,
    imax: 20, vmax: 100, pmax: 2000,
    volumeCm3: 1.18, aspectRatio, solidFraction: 1,
    emissivity: material.emissivity ?? 0.8, convection: true, h: 12,
    ambientK: kelvin(20), gasK: kelvin(20), targetK: kelvin(1000), biLimit: 0.01,
    supplyMode: "auto", iset: 20, vset: 100,
    enclosure: { ...DEFAULT_ENCLOSURE },
    ...overrides,
  };
}

export function sweep({ quick = false } = {}) {
  const ratios = quick ? QUICK_RATIOS : ASPECT_RATIOS;
  const rows = [];
  for (const name of SWEEP_MATERIALS) {
    const material = MATERIALS.find((m) => m.name === name);
    if (!material) continue;
    for (const aspectRatio of ratios) {
      const x = baseInput(material, aspectRatio);
      const zeroD = calculate(x);
      if (zeroD.errors.length) continue;
      const solved = solveThermal2D(x, zeroD, x.enclosure, material);
      if (solved.errors.length || !solved.converged) {
        rows.push({ name, aspectRatio, failed: solved.errors.join("; ") || "did not converge" });
        continue;
      }
      const ambient = x.ambientK;
      const radius = zeroD.g.D / 2;
      // Bi on the tool's own length scale, and on the radius the derivation uses.
      const biTool = zeroD.bi;
      const biRadius = zeroD.hEffective * radius / zeroD.target.props.k;
      const riseAvg = solved.avgK - ambient;
      rows.push({
        name, aspectRatio,
        biTool, biRadius,
        zeroDC: celsius(zeroD.tss),
        avgC: celsius(solved.avgK),
        maxC: celsius(solved.tMax),
        deltaT: solved.deltaT,
        // What the lumped model misses, as a fraction of the temperature rise.
        spreadFraction: solved.deltaT / Math.max(riseAvg, 1e-9),
        // How far the single 0D number sits from the peak the element reaches.
        peakErrorK: celsius(solved.tMax) - celsius(zeroD.tss),
        peakErrorFraction: (solved.tMax - zeroD.tss) / Math.max(riseAvg, 1e-9),
        predicted: biRadius / 2,
      });
    }
  }
  return rows;
}

function main() {
  const quick = process.argv.includes("--quick");
  const rows = sweep({ quick });
  const ok = rows.filter((r) => !r.failed);

  console.log("## When is 0D screening safe?\n");
  console.log(markdownTable(
    ["material", "L/D", "Bi (lc)", "Bi (R)", "0D Tss (°C)", "2D avg (°C)", "2D peak (°C)", "2D ΔT (K)", "peak − 0D (K)", "ΔT / rise", "Bi_R / 2"],
    rows.map((r) => r.failed
      ? [r.name, r.aspectRatio, "—", "—", "—", "—", "—", "—", "—", "—", r.failed]
      : [
        r.name, r.aspectRatio, sci(r.biTool, 2), sci(r.biRadius, 2),
        fix(r.zeroDC, 1), fix(r.avgC, 1), fix(r.maxC, 1), fix(r.deltaT, 1),
        fix(r.peakErrorK, 1), sci(r.spreadFraction, 2), sci(r.predicted, 2),
      ]),
  ) + "\n");

  if (ok.length >= 2) {
    // Least-squares slope through the origin of spreadFraction against Bi_R/2.
    // A slope near 1 means the hand derivation predicts the resolved field.
    let num = 0, den = 0;
    for (const r of ok) { num += r.predicted * r.spreadFraction; den += r.predicted * r.predicted; }
    const slope = num / Math.max(den, 1e-30);
    let ssRes = 0, ssTot = 0;
    const mean = ok.reduce((s, r) => s + r.spreadFraction, 0) / ok.length;
    for (const r of ok) {
      ssRes += (r.spreadFraction - slope * r.predicted) ** 2;
      ssTot += (r.spreadFraction - mean) ** 2;
    }
    console.log(`Fit of (2D ΔT / temperature rise) against Bi_R/2, through the origin:`);
    console.log(`  slope ${fix(slope, 3)}, R² ${fix(1 - ssRes / Math.max(ssTot, 1e-30), 4)}, n = ${ok.length}\n`);

    const worst = ok.reduce((a, b) => (Math.abs(b.peakErrorK) > Math.abs(a.peakErrorK) ? b : a));
    console.log(`Largest gap between the 0D temperature and the peak the element actually reaches:`);
    console.log(`  ${worst.name} at L/D ${worst.aspectRatio}: 0D says ${fix(worst.zeroDC, 1)} °C, the field peaks at ${fix(worst.maxC, 1)} °C (${fix(worst.peakErrorK, 1)} K higher).`);
    console.log(`  Any check reading the 0D temperature -- the melting-point warning included -- is short by that much.\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
