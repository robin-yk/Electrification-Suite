// Stage 1 and 2 of the 0D validity study: is there anything to measure, and does
// the code reach the closed form where one exists?
//
// The headline gap the cross-check reports mixes two unrelated quantities:
//
//   (1) T_avg(2D) - T_ss(0D)   the two models disagree about the MEAN
//   (2) T_max(2D) - T_avg(2D)  the spread a lumped model structurally cannot see
//
// Only (2) is a Biot-number effect. (1) is a disagreement between the 0D
// enclosure network and the resolved field about how much heat leaves at a given
// temperature, and it does not vanish as Bi -> 0. Wismann shows 0D 761.9 C
// against a 2D mean of 811.7 C -- a 50 K offset sitting beside a 52 K spread. A
// criterion fitted to their sum would report the lumped model as unsafe even at
// Bi_R = 0, which is not a statement about lumping at all.
//
// Stage 1 drives Bi_R toward zero by scaling the conductivity. An element with
// infinite k is isothermal, so the ONLY surviving difference is the loss model.
// Whatever offset remains there is quantity (1), isolated. The loss columns pin
// it down further: both models are asked for the heat leaving at the SAME
// temperature and the same geometry, so any gap between them is pure model
// difference with the operating point divided out.
//
// Stage 2 is the control. With radiation linearised to a constant coefficient,
// a long cylinder, constant properties and the uniform volumetric source the
// solver actually applies (qVol = pBulk / envelopeVolume; there is no local
// rho(T) coupling yet), the hand derivation is exact:
//
//   dT_internal / dT_external = h R / (2k) = Bi_R / 2
//
// If the code does not land on that, the Stage 3 sweep is fitting noise.
//
// Run: node tools/verification/zerod-limit.mjs
"use strict";
import { MATERIALS, kelvin, celsius, calculate, solveThermal2D, geometry, enclosureHeatLoss } from "../../apps/joule/solver.js";
import { DEFAULT_ENCLOSURE } from "../../apps/joule/crosscheck.js";
import { markdownTable, fix, sci } from "./common.mjs";

const BASE = MATERIALS.find((m) => m.name === "SiC");

function input(overrides = {}, enclosureOverrides = {}) {
  return {
    material: BASE,
    imax: 20, vmax: 100, pmax: 2000,
    volumeCm3: 1.18, aspectRatio: 10, solidFraction: 1,
    emissivity: 0.8, convection: false, h: 0,
    ambientK: kelvin(20), gasK: kelvin(20), targetK: kelvin(1000), biLimit: 0.01,
    supplyMode: "auto", iset: 20, vset: 100,
    enclosure: { ...DEFAULT_ENCLOSURE, tolerance: 1e-5, maxIter: 400, ...enclosureOverrides },
    ...overrides,
  };
}

// k is scaled rather than swapped between materials so that rho(T), emissivity
// and j_max stay fixed: the only thing moving across a row is Bi_R.
function scaledK(multiplier) {
  const k = (BASE.kTable ? null : BASE.k) ?? 120;
  return { ...BASE, name: `${BASE.name} x${multiplier}k`, kTable: null, k: k * multiplier };
}

function solve(x) {
  const zeroD = calculate(x);
  if (zeroD.errors.length) return { failed: zeroD.errors.join("; ") };
  const solved = solveThermal2D(x, zeroD, x.enclosure, x.material);
  if (solved.errors.length) return { failed: solved.errors.join("; ") };
  const g = geometry(x), radius = g.D / 2;
  const biRadius = zeroD.hEffective * radius / zeroD.target.props.k;
  // Both loss models interrogated at the SAME temperature, so the operating
  // point cancels and only the modelling difference is left.
  const atAvg = enclosureHeatLoss(solved.avgK, x, g, x.enclosure);
  return {
    zeroD, solved, biRadius, atAvg,
    // Channel by channel, both at the 2D mean temperature. The 0D network
    // splits its loss into a side path (gap -> wall -> ambient), an end path and
    // the He advective term; the 2D reports a static boundary sum and its own
    // advective term. Comparing the totals says there is a difference;
    // comparing these says which path carries it.
    side0D: atAvg.side, end0D: atAvg.end, adv0D: atAvg.heAdvective,
    static2D: solved.staticBoundaryLoss, adv2D: solved.heCooling,
    zeroDC: celsius(zeroD.tss),
    avgC: celsius(solved.avgK),
    maxC: celsius(solved.tMax),
    offsetK: solved.avgK - zeroD.tss,
    spreadK: solved.tMax - solved.avgK,
    loss0D: atAvg.total,
    loss2D: solved.boundaryLoss,
    lossGap: (atAvg.total - solved.boundaryLoss) / Math.max(solved.boundaryLoss, 1e-30),
    closure: solved.closure,
    converged: solved.converged,
  };
}

export function stage1() {
  const rows = [];
  for (const multiplier of [1, 3, 10, 30, 100, 300, 1000]) {
    const x = input({ material: scaledK(multiplier) });
    const r = solve(x);
    rows.push({ multiplier, ...r });
  }
  return rows;
}

// Radiation linearised: emissivity -> 0 removes the T^4 surface term and the
// convective coefficient supplies a constant h instead, which is the boundary
// condition the closed form assumes. A long element keeps the ends out of it.
// Control. The runaway version of this swept the surface coefficient with
// radiation switched off, which removed the only loss path strong enough to hold
// the element down: every case pinned to the 6000 K clamp and read back a
// perfectly isothermal 0 K spread. Drive the current instead, so the power is
// bounded by the supply rather than by a feedback loop, and scan Bi_R by scaling
// k at fixed q -- which moves the internal drop without touching the source.
//
// Two tests, the first stricter than the second:
//
//   parabola   centre - surface  ==  q R^2 / (4k)   (interior only, exact)
//   ratio      (centre-surface)/(surface-ambient) == Bi_R / 2
//
// with h_eff taken from the 2D solve's own loss and surface temperature rather
// than from the 0D estimate at the target, so the two sides of the ratio refer
// to the same operating point.
export function stage2() {
  const rows = [];
  for (const multiplier of [0.25, 0.5, 1, 2, 4, 8]) {
    const x = input({
      material: scaledK(multiplier), aspectRatio: 60,
      supplyMode: "cc", iset: 12, imax: 12,
    });
    const r = solve(x);
    if (r.failed) { rows.push({ multiplier, failed: r.failed }); continue; }
    const s = r.solved, mesh = s.mesh, mid = mesh.activeStart + Math.floor(mesh.nActiveZ / 2);
    const centre = s.T[mid][0], surface = s.T[mid][mesh.nElement - 1];
    const radius = s.g.D / 2, k = s.op.props.k, q = s.qVol;
    const internal = centre - surface, external = surface - x.ambientK;
    // Side area only: the ratio derivation is the radial problem, and at L/D 60
    // the ends carry a negligible share.
    const sideArea = Math.PI * s.g.D * s.g.L;
    const hEff = s.boundaryLoss / Math.max(sideArea * external, 1e-30);
    // Cell-centred unknowns are not sampled at the axis and the surface but at
    // the first and last cell centres, h/2 inside each. For the exact parabola
    // that shortens the measured drop by exactly a factor (1 - 1/N):
    //   T(h/2) - T(R-h/2) = (qR^2/4k)(1 - h/R),  h = R/N
    // so a constant deficit of that size is the sampling location, not a solver
    // error. Reporting both leaves nothing to be taken on trust.
    const nElement = mesh.nElement, sampling = 1 - 1 / nElement;
    rows.push({
      multiplier, ...r, internal, external, nElement, sampling,
      parabola: q * radius * radius / (4 * k),
      biRadiusSelf: hEff * radius / k,
      measured: internal / Math.max(external, 1e-9),
      maxC: celsius(s.tMax),
    });
  }
  return rows;
}

function main() {
  console.log("## Stage 1 - what survives as Bi_R goes to zero\n");
  const s1 = stage1();
  console.log(markdownTable(
    ["k x", "Bi_R", "offset (K)", "spread (K)", "0D loss", "2D loss", "gap",
      "0D side", "0D end", "0D adv", "2D static", "2D adv"],
    s1.map((r) => r.failed ? [r.multiplier, r.failed, "", "", "", "", "", "", "", "", "", ""] : [
      r.multiplier, sci(r.biRadius, 2), fix(r.offsetK, 2), fix(r.spreadK, 2),
      fix(r.loss0D, 2), fix(r.loss2D, 2), sci(r.lossGap, 2),
      fix(r.side0D, 2), fix(r.end0D, 2), fix(r.adv0D, 3),
      fix(r.static2D, 2), fix(r.adv2D, 3),
    ]),
  ) + "\n");
  const ok1 = s1.filter((r) => !r.failed);
  if (ok1.length) {
    const last = ok1[ok1.length - 1];
    console.log(`As Bi_R -> ${sci(last.biRadius, 2)} the spread falls to ${fix(last.spreadK, 2)} K`
      + ` while the mean offset holds at ${fix(last.offsetK, 2)} K.`);
    console.log(`An offset that survives the isothermal limit is a loss-model difference, not a lumping error.\n`);
  }

  console.log("## Stage 2 - control: linearised radiation against Bi_R / 2\n");
  const s2 = stage2();
  console.log(markdownTable(
    ["k x", "N_elem", "Bi_R (self)", "centre−surface (K)", "qR²/4k (K)", "parabola ratio", "1−1/N", "sampling-corrected", "measured ratio", "Bi_R/2", "ratio corrected"],
    s2.map((r) => r.failed ? [r.multiplier, r.failed, "", "", "", "", "", "", "", "", ""] : [
      r.multiplier, r.nElement, sci(r.biRadiusSelf, 3),
      fix(r.internal, 3), fix(r.parabola, 3), fix(r.internal / Math.max(r.parabola, 1e-30), 5),
      fix(r.sampling, 5), fix(r.internal / Math.max(r.parabola * r.sampling, 1e-30), 5),
      sci(r.measured, 3), sci(r.biRadiusSelf / 2, 3),
      fix(r.measured / Math.max(r.biRadiusSelf * r.sampling / 2, 1e-30), 5),
    ]),
  ) + "\n");
  const ok2 = s2.filter((r) => !r.failed && Number.isFinite(r.measured));
  if (ok2.length >= 2) {
    const fitSlope = (predict) => {
      let num = 0, den = 0;
      for (const r of ok2) { num += predict(r) * r.measured; den += predict(r) * predict(r); }
      return num / Math.max(den, 1e-30);
    };
    const raw = ok2.reduce((s, r) => s + r.internal / r.parabola, 0) / ok2.length;
    const corrected = ok2.reduce((s, r) => s + r.internal / (r.parabola * r.sampling), 0) / ok2.length;
    console.log(`Parabola test: raw ${fix(raw, 5)}, sampling-corrected ${fix(corrected, 5)} over ${ok2.length} points.`);
    console.log(`Ratio test:    raw slope ${fix(fitSlope((r) => r.biRadiusSelf / 2), 5)},`
      + ` corrected ${fix(fitSlope((r) => r.biRadiusSelf * r.sampling / 2), 5)}.`);
    console.log(`H-control: the corrected figures must be 1.00 +/- 0.15 or Stage 3 has no anchor.`);
    console.log(`A raw deficit that matches 1-1/N to the digit is where the unknowns sit, not solver error.\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
