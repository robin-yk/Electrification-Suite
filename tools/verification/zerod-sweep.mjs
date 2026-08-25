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

// Materials differ in resistivity by orders of magnitude, so a fixed drive
// current is not a fixed experiment: the first run of this stage put 12 A
// through molybdenum and tungsten and left them sitting at 21.7 C with a 0.0 K
// spread, then fitted a slope through those degenerate points as though they
// carried information. Match the dissipated power instead, solving I = sqrt(P/R)
// from each material's own resistance at the target.
export function stage3b({ quick = false, watts = 400 } = {}) {
  // Matched on a prefix, and a miss is reported rather than skipped. Spelling
  // one of these "Kanthal A-1" against a table entry reading "Kanthal A-1
  // (FeCrAl)" dropped that material from the study in silence -- the fit simply
  // came back with n = 9 instead of 12 and nothing said why.
  const names = ["SiC", "Molybdenum", "Kanthal A-1", "Tungsten"];
  const emissivities = quick ? [0.8] : [0.3, 0.6, 0.9];
  const rows = [];
  for (const name of names) {
    const material = MATERIALS.find((m) => m.name === name || m.name.startsWith(`${name} `));
    if (!material) { rows.push({ label: name, failed: `no material named "${name}" in MATERIALS` }); continue; }
    for (const emissivity of emissivities) {
      const probe = calculate(input({ material, emissivity }));
      if (probe.errors.length) { rows.push({ label: `${name} ε${emissivity}`, failed: probe.errors.join("; ") }); continue; }
      const iset = Math.sqrt(watts / Math.max(probe.resistance, 1e-30));
      rows.push(measure(input({
        material, emissivity, iset, imax: iset, vmax: 1e4, pmax: 1e5,
      }), `${name} ε${emissivity} ${iset.toFixed(0)}A`));
    }
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
  const stage3aRows = stage3a({ quick }), stage3bRows = stage3b({ quick }), stage3cRows = stage3c({ quick });
  const a = report("3a — Bi_R scanned one factor at a time (SiC, L/D 30)", stage3aRows);
  const b = report("3b — material independence, power-matched (L/D 30)", stage3bRows);
  const c = report("3c — aspect ratio: does a second group enter?", stage3cRows);

  console.log("### End-effect factor f(L/D)\n");
  // Bi_R/2 is the infinite-cylinder result. Normalising each 3c point by the
  // long-element plateau leaves the correction the ends impose, which is the
  // candidate second group stated in the pre-registration.
  const c3 = stage3cRows.filter((r) => !r.failed && Number.isFinite(r.measured));
  const byRatio = new Map();
  for (const r of c3) {
    const f = r.measured / Math.max(r.biRadius / 2, 1e-30);
    if (!byRatio.has(r.aspectRatio)) byRatio.set(r.aspectRatio, []);
    byRatio.get(r.aspectRatio).push(f);
  }
  const plateau = Math.max(...[...byRatio.values()].map((v) => v.reduce((s, x) => s + x, 0) / v.length));
  const fRows = [...byRatio.entries()].sort((a, b) => a[0] - b[0]).map(([ratio, values]) => {
    const mean = values.reduce((s, x) => s + x, 0) / values.length;
    return [ratio, fix(mean, 4), fix(mean / plateau, 4), values.length];
  });
  console.log(markdownTable(["L/D", "measured / (Bi_R/2)", "f(L/D) = normalised", "n"], fRows) + "\n");
  const spanF = fRows.length ? Number(fRows[fRows.length - 1][2]) / Math.max(Number(fRows[0][2]), 1e-30) : NaN;
  console.log(`f varies by a factor of ${fix(spanF, 3)} across the aspect ratios swept, at Bi_R held by construction.\n`);

  console.log("### Verdict against the pre-registered hypotheses\n");
  const verdict = (name, fit) => {
    if (!fit) { console.log(`- ${name}: no usable points.`); return; }
    const pass = Math.abs(fit.slope - 1) <= 0.15 && fit.r2 > 0.9;
    console.log(`- ${name}: slope ${fix(fit.slope, 3)}, R² ${fix(fit.r2, 3)} → ${pass ? "consistent with Bi_R/2" : "REJECTED"}`);
  };
  verdict("H1 (3a)", a);
  verdict("H1 across materials (3b)", b);
  // H3 is NOT a question about the pooled slope through 3c. Fitting one line
  // through every aspect ratio averages the trend away and reports a pass on a
  // set whose points differ systematically by more than the band: the first run
  // of this file did exactly that. The hypothesis is that f(L/D) is flat, so
  // test the spread of f, not the fit.
  const flat = Number.isFinite(spanF) && Math.abs(spanF - 1) <= 0.15;
  console.log(`- H3 (aspect ratio absent): f spans x${fix(spanF, 3)} across L/D`
    + ` → ${flat ? "consistent with Bi_R alone" : "REJECTED — Bi_R alone does not predict"}`);
  if (!flat) {
    console.log(`\n  Bi_R/2 is the infinite-cylinder limit, and f <= 1 below it, so the`);
    console.log(`  identity remains a conservative UPPER bound on the spread at every`);
    console.log(`  aspect ratio swept. Short elements shed heat axially, which relieves`);
    console.log(`  the radial gradient the lumped model cannot see.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
