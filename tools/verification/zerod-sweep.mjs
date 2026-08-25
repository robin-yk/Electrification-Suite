// Stage 3 of the 0D validity study: the sweep the criterion is read off.
//
// What Stage 1 forces on this design. Driving Bi_R to 2e-6 left the 2D mean
// 28.7 K above the 0D steady temperature with a spread of 0.05 K, so the gap
// between the two models has a floor that lumping cannot explain. Every response
// here is therefore reported split:
//
//   offsetK  = T_avg(2D) - T_ss(0D)     loss-model difference, Bi-independent
//   spreadK  = T_max(2D) - T_avg(2D)    what the lumped model cannot see
//   peakErrK = offsetK + spreadK        what an engineer actually eats
//
// A criterion fitted to peakErrK alone would inherit the floor and declare 0D
// unsafe at Bi_R = 0. The criterion belongs on spreadK; the floor is a separate
// finding that has to be quoted beside it.
//
// What the old sweep got wrong. Walking four materials against five aspect
// ratios moves k, rho(T), emissivity and j_max together, so a slope away from 1
// could be any of them. Bi_R = h R / k is scanned here one factor at a time:
//
//   3a  k scaled at fixed geometry and supply   -> k alone
//       emissivity                              -> h alone
//       drive current                           -> operating point alone
//   3b  real materials at matched geometry      -> is the law material-free?
//   3c  aspect ratio                            -> do the ends enter (2nd group)?
//
// Bi_R is computed from the 2D solve's own side loss and surface temperature,
// not from the 0D estimate at the target, so both sides of the ratio refer to
// the same operating point.
//
// Run: node tools/verification/zerod-sweep.mjs [--quick] [--grid]
"use strict";
import { MATERIALS, kelvin, celsius, calculate, solveThermal2D } from "../../apps/joule/solver.js";
import { DEFAULT_ENCLOSURE } from "../../apps/joule/crosscheck.js";
import { markdownTable, fix, sci } from "./common.mjs";

const SIC = MATERIALS.find((m) => m.name === "SiC");
const LONG = 30;   // ends suppressed for 3a/3b; 3c is where they are the variable

function input(overrides = {}, enclosureOverrides = {}) {
  return {
    material: SIC,
    imax: 20, vmax: 100, pmax: 2000,
    volumeCm3: 1.18, aspectRatio: LONG, solidFraction: 1,
    emissivity: 0.8, convection: false, h: 0,
    ambientK: kelvin(20), gasK: kelvin(20), targetK: kelvin(1000), biLimit: 0.01,
    supplyMode: "cc", iset: 12, vset: 100,
    enclosure: { ...DEFAULT_ENCLOSURE, tolerance: 1e-5, maxIter: 400, ...enclosureOverrides },
    ...overrides,
  };
}

const scaledK = (material, multiplier) => ({
  ...material, name: `${material.name}x${multiplier}`,
  kTable: null, k: (material.kTable ? material.kTable[0][1] : material.k) * multiplier,
});

function measure(x, label) {
  const zeroD = calculate(x);
  if (zeroD.errors.length) return { label, failed: zeroD.errors.join("; ") };
  const s = solveThermal2D(x, zeroD, x.enclosure, x.material);
  if (s.errors.length) return { label, failed: s.errors.join("; ") };
  if (!s.converged) return { label, failed: `residual ${s.residual.toExponential(2)}` };
  if (!(s.closure < 1e-6)) return { label, failed: `closure ${s.closure.toExponential(2)}` };

  const mesh = s.mesh, mid = mesh.activeStart + Math.floor(mesh.nActiveZ / 2);
  const centre = s.T[mid][0], surface = s.T[mid][mesh.nElement - 1];
  const radius = s.g.D / 2, k = s.op.props.k;
  const external = surface - x.ambientK;
  const sideArea = Math.PI * s.g.D * s.g.L;
  const hEff = s.boundaryLoss / Math.max(sideArea * external, 1e-30);
  const rise = s.avgK - x.ambientK;
  return {
    label, aspectRatio: x.aspectRatio, k, radius,
    biRadius: hEff * radius / k,
    zeroDC: celsius(zeroD.tss), avgC: celsius(s.avgK), maxC: celsius(s.tMax),
    offsetK: s.avgK - zeroD.tss,
    spreadK: s.tMax - s.avgK,
    peakErrK: s.tMax - zeroD.tss,
    // The dimensionless response the derivation speaks to: centre-to-surface
    // over surface-to-ambient, both read at mid height.
    measured: (centre - surface) / Math.max(external, 1e-9),
    spreadFraction: (s.tMax - s.avgK) / Math.max(rise, 1e-9),
    grid: `${x.enclosure.nr ?? 30}x${x.enclosure.nz ?? 60}`,
  };
}

export function stage3a({ quick = false } = {}) {
  const rows = [];
  const emissivities = quick ? [0.3, 0.9] : [0.2, 0.45, 0.7, 0.95];
  const multipliers = quick ? [0.25, 4] : [0.125, 0.5, 2, 8];
  const currents = quick ? [12] : [8, 12, 16];
  for (const multiplier of multipliers)
    for (const emissivity of emissivities)
      for (const iset of currents)
        rows.push(measure(input({
          material: scaledK(SIC, multiplier), emissivity, iset, imax: iset,
        }), `k×${multiplier} ε${emissivity} ${iset}A`));
  return rows;
}

export function stage3b({ quick = false } = {}) {
  const names = ["SiC", "Molybdenum", "Kanthal A-1", "Tungsten"];
  const emissivities = quick ? [0.8] : [0.3, 0.6, 0.9];
  const rows = [];
  for (const name of names) {
    const material = MATERIALS.find((m) => m.name === name);
    if (!material) continue;
    for (const emissivity of emissivities)
      rows.push(measure(input({ material, emissivity }), `${name} ε${emissivity}`));
  }
  return rows;
}

export function stage3c({ quick = false } = {}) {
  const ratios = quick ? [1.5, 10, 60] : [1.5, 4, 10, 30, 60];
  const rows = [];
  for (const aspectRatio of ratios)
    for (const multiplier of (quick ? [1] : [0.5, 2]))
      rows.push(measure(input({
        material: scaledK(SIC, multiplier), aspectRatio,
      }), `L/D ${aspectRatio} k×${multiplier}`));
  return rows;
}

// Through-origin least squares of the measured ratio on Bi_R/2, plus R^2.
export function fitAgainstHalfBi(rows) {
  const ok = rows.filter((r) => !r.failed && Number.isFinite(r.measured));
  if (ok.length < 2) return null;
  let num = 0, den = 0;
  for (const r of ok) { const p = r.biRadius / 2; num += p * r.measured; den += p * p; }
  const slope = num / Math.max(den, 1e-30);
  const mean = ok.reduce((s, r) => s + r.measured, 0) / ok.length;
  let ssRes = 0, ssTot = 0;
  for (const r of ok) {
    ssRes += (r.measured - slope * r.biRadius / 2) ** 2;
    ssTot += (r.measured - mean) ** 2;
  }
  return { slope, r2: 1 - ssRes / Math.max(ssTot, 1e-30), n: ok.length,
    biMin: Math.min(...ok.map((r) => r.biRadius)), biMax: Math.max(...ok.map((r) => r.biRadius)) };
}

function report(title, rows) {
  console.log(`### ${title}\n`);
  console.log(markdownTable(
    ["case", "Bi_R", "0D Tss (°C)", "2D avg (°C)", "2D peak (°C)", "offset (K)", "spread (K)", "peak−0D (K)", "measured ratio", "Bi_R/2", "ratio/pred"],
    rows.map((r) => r.failed
      ? [r.label, r.failed, "", "", "", "", "", "", "", "", ""]
      : [r.label, sci(r.biRadius, 3), fix(r.zeroDC, 1), fix(r.avgC, 1), fix(r.maxC, 1),
        fix(r.offsetK, 1), fix(r.spreadK, 1), fix(r.peakErrK, 1),
        sci(r.measured, 3), sci(r.biRadius / 2, 3), fix(r.measured / Math.max(r.biRadius / 2, 1e-30), 3)]),
  ) + "\n");
  const dropped = rows.filter((r) => r.failed);
  if (dropped.length) console.log(`${dropped.length} of ${rows.length} points dropped (listed above, not silently).\n`);
  const fit = fitAgainstHalfBi(rows);
  if (fit) console.log(`slope ${fix(fit.slope, 4)}, R² ${fix(fit.r2, 4)}, n ${fit.n}, Bi_R ${sci(fit.biMin, 2)} … ${sci(fit.biMax, 2)}\n`);
  return fit;
}

function main() {
  const quick = process.argv.includes("--quick");
  console.log("## Stage 3 — the sweep\n");
  console.log("H1 slope = 1.00 ± 0.15 with R² > 0.9. H3: 3c must not move the slope.\n");
  const a = report("3a — Bi_R scanned one factor at a time (SiC, L/D 30)", stage3a({ quick }));
  const b = report("3b — material independence (L/D 30)", stage3b({ quick }));
  const c = report("3c — aspect ratio: does a second group enter?", stage3c({ quick }));

  console.log("### Verdict against the pre-registered hypotheses\n");
  const verdict = (name, fit) => {
    if (!fit) { console.log(`- ${name}: no usable points.`); return; }
    const pass = Math.abs(fit.slope - 1) <= 0.15 && fit.r2 > 0.9;
    console.log(`- ${name}: slope ${fix(fit.slope, 3)}, R² ${fix(fit.r2, 3)} → ${pass ? "consistent with Bi_R/2" : "REJECTED"}`);
  };
  verdict("H1 (3a)", a);
  verdict("H1 across materials (3b)", b);
  verdict("H3 (3c, aspect ratio)", c);
  if (a && c) {
    console.log(`\nSlope shift from the long-element scan to the aspect-ratio scan: `
      + `${fix(a.slope, 3)} → ${fix(c.slope, 3)} (${fix(100 * (c.slope - a.slope) / Math.max(Math.abs(a.slope), 1e-30), 1)}%).`);
    console.log(`A shift beyond the H1 band is the signature of a second dimensionless group.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
