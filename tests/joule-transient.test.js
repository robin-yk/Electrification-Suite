// Transient (backward-Euler) Joule 2D solver tests.
//
// The three checks below are chosen so that each one can fail on its own:
// the ramp isolates the storage term and the source, the steady limit
// isolates the operator's reduction to the case already verified, and the
// refinement isolates the time integration. Run with `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MATERIALS, calculate, geometry, propertiesAt,
  solveTransient2D, solveThermal2D, elementTimeConstant,
} from "../apps/joule/solver.js";

const sic = MATERIALS.find((m) => m.name === "SiC");

// Coarser than the shipped default on purpose: these run in the unit suite,
// and none of the three claims depends on spatial resolution.
const GRID = { nr: 20, nz: 40 };

function makeInput(enclosure) {
  return {
    material: sic, solidFraction: 1, volumeCm3: 10, aspectRatio: 4,
    imax: 20, vmax: 200, pmax: 5000,
    ambientK: 293.15, targetK: 1273.15,
    emissivity: enclosure.wallEmissivity === 0 ? 0 : 0.8,
    convection: false, h: 0, gasK: 293.15, biLimit: 0.1,
    supplyMode: "cc", iset: 20, enclosure,
  };
}

// Every loss path switched off: no emission from either surface, no film, no
// axial conduction into the process gas, and a gap that conducts essentially
// nothing. What remains is a closed lump absorbing a constant power.
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

test("solveTransient2D() reproduces the analytic adiabatic ramp P/(m·cp)", () => {
  const x = makeInput(ADIABATIC);
  const zeroD = calculate(x);
  const g = geometry(x);
  // SiC carries no rho(T) table, so at fixed current the power is constant and
  // the exact solution is a straight line. Backward Euler integrates a constant
  // derivative exactly, which makes this a test of the storage term and the
  // source alone, with no time-discretisation error to hide behind.
  const rate = zeroD.target.power / (sic.density * g.volume * propertiesAt(sic, 300).cp);
  const result = solveTransient2D(x, zeroD, ADIABATIC, sic, { dt: 0.05, steps: 20 });

  assert.equal(result.errors.length, 0);
  assert.ok(result.converged, "adiabatic ramp did not converge");
  for (const h of result.history) {
    const exact = x.ambientK + rate * h.t;
    assert.ok(Math.abs(h.avgK - exact) < 1e-3,
      `t=${h.t}s: got ${h.avgK} K, exact ${exact} K`);
  }
  // With no loss path the element must also stay isothermal.
  assert.ok(result.deltaT < 1e-3, `element spread ${result.deltaT} K should be ~0`);
  assert.ok(result.worstClosure < 1e-8, `closure ${result.worstClosure}`);
});

test("solveTransient2D() relaxes to exactly the steady solveThermal2D answer", () => {
  const x = makeInput(LOSSY);
  const zeroD = calculate(x);
  const steady = solveThermal2D(x, zeroD, LOSSY, sic);
  // Long enough that the storage term has fallen away; what is left is the
  // steady operator, which is the one the analytic and manufactured-solution
  // tests already cover.
  const transient = solveTransient2D(x, zeroD, LOSSY, sic, { dt: 10, steps: 200 });

  assert.equal(transient.errors.length, 0);
  assert.ok(Math.abs(transient.avgK - steady.avgK) < 1e-2,
    `transient ${transient.avgK} K vs steady ${steady.avgK} K`);
  assert.ok(Math.abs(transient.wallOuter - steady.wallOuter) < 1e-2,
    `wall ${transient.wallOuter} K vs steady ${steady.wallOuter} K`);
  const last = transient.history[transient.history.length - 1];
  assert.ok(Math.abs(last.storageRate) < 1e-3,
    `still storing ${last.storageRate} W at t = ${last.t} s`);
});

// The order is measured from consecutive solutions, not from their distance
// to a fine reference. Differencing two solutions cancels the exact answer;
// differencing their errors only cancels it if the reference is exact, and
// this one is a solve of the same march. Measured against a 128-step
// reference, the same runs report 1.014, 1.082 and 1.213, which reads as
// better than first order and is not: it is the reference's own error
// entering every difference. tools/verification/joule-transient.mjs prints
// both columns and the arithmetic behind that claim.
//
// The upper bound of 1.00 is the part of this test that does work. A
// backward-Euler march cannot beat first order, so an estimate above 1 means
// either the scheme is not what it claims or the estimator is measuring
// something other than the march, and both are the failure this test exists
// to catch.
test("solveTransient2D() is first-order in dt, measured without a reference", () => {
  const x = makeInput(LOSSY);
  const zeroD = calculate(x);
  const T_END = 60;   // mid-transient: far from both the start and the plateau

  const avg = [4, 8, 16, 32].map((n) =>
    solveTransient2D(x, zeroD, LOSSY, sic, { dt: T_END / n, steps: n }).avgK);

  const diffs = [];
  for (let i = 1; i < avg.length; i++) diffs.push(Math.abs(avg[i] - avg[i - 1]));

  let previousOrder = 0;
  for (let i = 1; i < diffs.length; i++) {
    const order = Math.log2(diffs[i - 1] / diffs[i]);
    assert.ok(order > 0.90 && order <= 1.00,
      `observed time order ${order.toFixed(3)} is not first order`);
    assert.ok(order > previousOrder,
      `order ${order.toFixed(3)} did not approach 1 from below`);
    previousOrder = order;
  }
});

test("solveTransient2D() honours sourceScale, so a pulse train and a shutdown both work", () => {
  const x = makeInput(LOSSY);
  const zeroD = calculate(x);
  const hot = solveTransient2D(x, zeroD, LOSSY, sic, { dt: 5, steps: 40 });
  // Restart from the hot field's average with the supply off: the element must
  // cool, and every step must report a negative storage rate.
  const cooling = solveTransient2D(x, zeroD, LOSSY, sic, {
    dt: 5, steps: 20, startK: hot.avgK, sourceScale: () => 0,
  });
  assert.ok(cooling.avgK < hot.avgK, "element did not cool with the source off");
  for (const h of cooling.history) {
    assert.ok(h.pBulk === 0, "source was not switched off");
    assert.ok(h.storageRate < 0, `storage rate ${h.storageRate} W should be negative`);
  }
});

test("solveTransient2D() rejects an unusable time plan instead of looping forever", () => {
  const x = makeInput(LOSSY);
  const zeroD = calculate(x);
  for (const plan of [{ dt: 0, steps: 10 }, { dt: -1, steps: 10 }, { dt: 1, steps: 0 }, { dt: 1, steps: 2.5 }]) {
    const r = solveTransient2D(x, zeroD, LOSSY, sic, plan);
    assert.ok(r.errors.length > 0, `plan ${JSON.stringify(plan)} should have been rejected`);
  }
});

// Both of the following were found by driving the solver with carbon paper
// rather than SiC, and neither was caught by the tests above: SiC has a
// constant heat capacity and the earlier cases never switched the supply off
// mid-march.

test("solveTransient2D() keeps energy closure with a strongly temperature-dependent cp", () => {
  // Graphitic carbon roughly triples its heat capacity over this range. A
  // storage term evaluated at the end-of-step temperature rather than the
  // midpoint stores the wrong amount of energy, which shows up here as a
  // closure of order 0.1 rather than order 1e-8.
  const steep = {
    name: "steep-cp probe", rhoOhmCm: 0.05, density: 452, k: 400, jmax: 1e9, cp: 710,
    cpTable: [[25, 710], [400, 1390], [800, 1730], [1200, 1900], [1800, 2040]],
  };
  const x = { ...makeInput(LOSSY), material: steep };
  const zeroD = calculate(x);
  const r = solveTransient2D(x, zeroD, LOSSY, steep, { dt: 0.05, steps: 120 });
  assert.equal(r.errors.length, 0);
  assert.ok(r.worstClosure < 1e-5,
    `closure ${r.worstClosure} — storage term is inconsistent with the enthalpy change`);
});

test("solveTransient2D() reports a meaningful closure while the drive is off", () => {
  const x = makeInput(LOSSY);
  const zeroD = calculate(x);
  // A 20% duty square wave: most steps have P_bulk exactly zero, so a closure
  // normalised by P_bulk alone would divide the residual by ~0 and report a
  // meaningless number for steps that balance loss against storage perfectly.
  const r = solveTransient2D(x, zeroD, LOSSY, sic, {
    dt: 0.5, steps: 80, sourceScale: (t) => (Math.floor(t / 0.5) % 5 === 0 ? 1 : 0),
  });
  assert.equal(r.errors.length, 0);
  // The bug this guards against reported a closure of order 1e+6, so the
  // threshold is loose on purpose. What remains at 1e-5 is the per-step Picard
  // residual on the switching steps, which is a real and acceptable cost of a
  // hard on/off edge, not a balance error.
  assert.ok(r.worstClosure < 1e-3, `closure ${r.worstClosure} under a duty-cycled drive`);
  assert.ok(r.history.some((h) => h.pBulk === 0), "test did not actually exercise an off step");
});

test("solveTransient2D() carries the solved current-density field, not just the uniform source", () => {
  // cfg.currentField replaces the uniform Joule source with the dissipation of
  // a solved potential field. The transient goes through the same hook as the
  // steady solve, so its long-time limit has to land on the steady answer with
  // the field switched on just as it does with it off.
  const enclosure = { ...LOSSY, currentField: true };
  const x = makeInput(enclosure);
  const zeroD = calculate(x);
  const steady = solveThermal2D(x, zeroD, enclosure, sic);
  const transient = solveTransient2D(x, zeroD, enclosure, sic, { dt: 10, steps: 200 });

  assert.equal(transient.errors.length, 0);
  assert.ok(transient.op.qCell, "transient did not pick up the per-cell source");
  assert.ok(Math.abs(transient.avgK - steady.avgK) < 1e-2,
    `transient ${transient.avgK} K vs steady ${steady.avgK} K with currentField on`);
  assert.ok(transient.worstClosure < 1e-5, `closure ${transient.worstClosure}`);
});

test("solveTransient2D() scales the per-cell source with the duty cycle", () => {
  // Duty cycling changes how long the current flows, not where, so the scale
  // must multiply qCell rather than being dropped when the current field is on.
  const enclosure = { ...LOSSY, currentField: true };
  const x = makeInput(enclosure);
  const zeroD = calculate(x);
  const off = solveTransient2D(x, zeroD, enclosure, sic, { dt: 1, steps: 3, sourceScale: () => 0 });
  assert.ok(off.op.qCell.every((q) => q === 0), "qCell was not scaled to zero with the drive off");
  assert.ok(off.history.every((h) => h.pBulk === 0));
});

// ---------------------------------------------------------------- pulse drive
// A duty cycle narrower than the time step is the case that used to fail
// silently. Sampling the drive at the step's end point steps straight over the
// on-window, so the source is exactly zero for the whole march and the element
// sits at ambient: a flat line that reads as "this material does not heat"
// rather than "this step missed the pulse". Integrating the drive across the
// step instead delivers the right cycle-averaged energy however coarse it is.
const PULSE = { period: 1, duty: 0.05 };

function pulsePlan(dt, duration) {
  const { period, duty } = PULSE;
  const onBefore = (t) => {
    const cycles = Math.floor(t / period), into = t - cycles * period;
    return cycles * duty * period + Math.min(Math.max(into, 0), duty * period);
  };
  return {
    dt, steps: Math.round(duration / dt),
    sourceScale: (t) => (((t - 1e-9) % period) / period < duty ? 1 : 0),
    sourceIntegral: (a, b) => (b > a ? (onBefore(b) - onBefore(a)) / (b - a) : 0),
  };
}

test("a step wider than the on-window still heats the element", () => {
  const x = makeInput(ADIABATIC);
  const zeroD = calculate(x);
  // dt = 0.25 s against a 0.05 s on-window: every step endpoint lands outside it.
  const plan = pulsePlan(0.25, 20);
  const sampled = solveTransient2D(x, zeroD, ADIABATIC, sic,
    { ...plan, sourceIntegral: undefined });
  const integrated = solveTransient2D(x, zeroD, ADIABATIC, sic, plan);
  assert.ok(sampled.avgK - x.ambientK < 1e-6,
    "the end-point sample is expected to miss the pulse entirely; if it no longer does, this test has stopped testing anything");
  assert.ok(integrated.avgK - x.ambientK > 1,
    `integrating the drive must still heat the element, got ${integrated.avgK - x.ambientK} K`);
});

test("the cycle-averaged energy does not depend on how the pulse is stepped", () => {
  // Adiabatic, so the temperature rise is exactly the delivered energy over the
  // heat capacity and any difference between the two marches is the source
  // treatment alone.
  const x = makeInput(ADIABATIC);
  const zeroD = calculate(x);
  const coarse = solveTransient2D(x, zeroD, ADIABATIC, sic, pulsePlan(0.25, 20));
  const fine = solveTransient2D(x, zeroD, ADIABATIC, sic, pulsePlan(0.005, 20));
  const coarseRise = coarse.avgK - x.ambientK, fineRise = fine.avgK - x.ambientK;
  assert.ok(fineRise > 1, `the fine march should heat the element, got ${fineRise} K`);
  const relative = Math.abs(coarseRise - fineRise) / fineRise;
  assert.ok(relative < 0.02,
    `cycle-averaged rise moved by ${(relative * 100).toFixed(2)}% between a 4-step and a 200-step cycle`);
});

test("elementTimeConstant separates a chunk from a foil", () => {
  // The number the Dynamic tab sizes a pulse period from. It only has to be
  // right to an order of magnitude, but it has to move with the geometry:
  // thinning the same material at fixed volume raises surface area and drops
  // the time constant.
  const chunky = calculate({ ...makeInput(LOSSY), aspectRatio: 1.5 });
  const slender = calculate({ ...makeInput(LOSSY), aspectRatio: 60 });
  const tauChunky = elementTimeConstant(chunky), tauSlender = elementTimeConstant(slender);
  assert.ok(Number.isFinite(tauChunky) && tauChunky > 0, `bad tau ${tauChunky}`);
  assert.ok(Number.isFinite(tauSlender) && tauSlender > 0, `bad tau ${tauSlender}`);
  assert.ok(tauSlender < tauChunky,
    `a slenderer element has more surface per unit mass and must relax faster: ${tauSlender} vs ${tauChunky}`);
  assert.ok(Number.isNaN(elementTimeConstant({ errors: ["bad input"] })));
});
