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
  solveTransient2D, solveThermal2D,
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

test("solveTransient2D() is first-order in dt, as backward Euler should be", () => {
  const x = makeInput(LOSSY);
  const zeroD = calculate(x);
  const T_END = 60;   // mid-transient: far from both the start and the plateau
  const reference = solveTransient2D(x, zeroD, LOSSY, sic, { dt: T_END / 128, steps: 128 });

  const errors = [4, 8, 16].map((n) => {
    const r = solveTransient2D(x, zeroD, LOSSY, sic, { dt: T_END / n, steps: n });
    return Math.abs(r.avgK - reference.avgK);
  });
  for (let i = 1; i < errors.length; i++) {
    const order = Math.log2(errors[i - 1] / errors[i]);
    assert.ok(order > 0.8 && order < 1.4,
      `observed time order ${order.toFixed(2)} is not first order`);
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
