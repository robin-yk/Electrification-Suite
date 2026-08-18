// Regression tests for the Joule-heating numeric core (joule-solver.js).
// Pure Node, no browser: run with `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MATERIALS, geometry, calculate, build2DMesh, solveThermal2D
} from "../apps/joule/solver.js";

const DEFAULT_ENCLOSURE = {
  wallMaterial: "quartz", wallK: 1.4, wallThickness: 0.003, wallEmissivity: 0.93,
  gap: 0.001, gapK: 0.03, endMode: "ambient", endK: 1273.15, endH: 200,
  contactRho: 0, maxIter: 160, tolerance: 1e-4
};

function materialByName(name) {
  const material = MATERIALS.find((m) => m.name === name);
  assert.ok(material, `unknown test material: ${name}`);
  return material;
}

// Mirrors joule.html's own default control values (solid rod, 1000 °C target,
// 20 A / 100 V / 2000 W hardware limits) so solves land near the target
// temperature instead of the runaway high-power regime an arbitrary guess
// at imax/vmax/pmax would produce.
function makeInput(materialName, aspectRatio, overrides = {}) {
  const material = materialByName(materialName);
  return {
    material,
    solidFraction: 1,
    volumeCm3: 10,
    aspectRatio,
    imax: 20,
    vmax: 100,
    pmax: 2000,
    ambientK: 293.15,
    targetK: 1273.15,
    emissivity: material.emissivity ?? 0.8,
    convection: false,
    h: 0,
    gasK: 293.15,
    biLimit: 0.01,
    enclosure: { ...DEFAULT_ENCLOSURE },
    ...overrides
  };
}

test("calculate() returns a feasible 0D result for a plain SiC rod", () => {
  const x = makeInput("SiC", 6);
  const zeroD = calculate(x);
  assert.deepEqual(zeroD.errors, []);
  assert.ok(Number.isFinite(zeroD.tss));
  assert.ok(zeroD.tss > x.ambientK);
});

test("calculate() reports validation errors instead of throwing on bad input", () => {
  const x = makeInput("SiC", 6, { pmax: -1 });
  const result = calculate(x);
  assert.ok(result.errors.length > 0);
});

test("supplyMode cc drives exactly at the set current and flags exceeded limits instead of clamping", () => {
  const auto = calculate(makeInput("SiC", 6));
  const half = calculate(makeInput("SiC", 6, { supplyMode: "cc", iset: 10 }));
  assert.deepEqual(half.errors, []);
  assert.equal(half.constraint, "A limited");
  assert.ok(Math.abs(half.operatingCurrent - 10) < 1e-12);
  assert.ok(Math.abs(half.voltage - 10 * half.resistance) < 1e-9);
  assert.ok(half.power < auto.power, "half the current must give less power than the auto drive point");
  assert.deepEqual(half.violations, [], "10 A inside a 20 A / 100 V / 2000 W supply violates nothing");

  const hot = calculate(makeInput("SiC", 6, { supplyMode: "cc", iset: 20, vmax: 0.1 }));
  assert.ok(hot.violations.some((v) => v.includes("Vmax")), "20 A across this rod needs more than 0.1 V");
  assert.ok(Math.abs(hot.operatingCurrent - 20) < 1e-12, "violations must not clamp the drive point");
});

test("supplyMode cv drives exactly at the set voltage and mirrors the violation logic", () => {
  const r = calculate(makeInput("SiC", 6, { supplyMode: "cv", vset: 0.3 }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.constraint, "V limited");
  assert.ok(Math.abs(r.voltage - 0.3) < 1e-9);
  assert.ok(Math.abs(r.operatingCurrent - 0.3 / r.resistance) < 1e-9);

  const surge = calculate(makeInput("SiC", 6, { supplyMode: "cv", vset: 100, imax: 1 }));
  assert.ok(surge.violations.some((v) => v.includes("Imax")), "100 V across this rod pushes far more than 1 A");
});

test("supplyMode auto (or absent) preserves the original min-of-limits behavior", () => {
  const implicit = calculate(makeInput("SiC", 6));
  const explicit = calculate(makeInput("SiC", 6, { supplyMode: "auto" }));
  assert.equal(implicit.operatingCurrent, explicit.operatingCurrent);
  assert.equal(implicit.constraint, explicit.constraint);
  assert.deepEqual(implicit.violations, []);
});

test("build2DMesh() partitions the exact radial cell count for every L/D in the sweep", () => {
  for (const aspectRatio of [1, 2, 4, 8, 12, 20, 30]) {
    const x = makeInput("SiC", aspectRatio);
    const g = geometry(x);
    const mesh = build2DMesh(g, x.enclosure);
    assert.equal(mesh.nElement + mesh.nGap + mesh.nWall + mesh.nAir, mesh.nr);
  }
});

test("solveThermal2D() previously oscillated on SiC L/D=12; now converges cleanly", () => {
  const x = makeInput("SiC", 12);
  const zeroD = calculate(x);
  const result = solveThermal2D(x, zeroD, x.enclosure, x.material);
  assert.deepEqual(result.errors, []);
  assert.ok(result.converged, `did not converge: residual=${result.residual}, iterations=${result.iterations}`);
  assert.ok(result.iterations < x.enclosure.maxIter, "hit the iteration cap instead of converging");
  assert.ok(result.closure < 0.01, `energy closure too large: ${result.closure}`);
  assert.ok(Number.isFinite(result.avgK) && result.avgK > x.ambientK);
});

test("solveThermal2D() is deterministic for identical inputs", () => {
  const x = makeInput("MoSi₂", 8);
  const zeroD = calculate(x);
  const a = solveThermal2D(x, zeroD, x.enclosure, x.material);
  const b = solveThermal2D(x, zeroD, x.enclosure, x.material);
  assert.equal(a.avgK, b.avgK);
  assert.equal(a.iterations, b.iterations);
  assert.equal(a.closure, b.closure);
});

test("solveThermal2D() converges with low energy closure across an L/D x material sweep", () => {
  const aspectRatios = [1, 2, 4, 8, 12, 20, 30];
  const materialNames = ["CFP", "SiC", "MoSi₂", "Kanthal A-1 (FeCrAl)", "304 stainless steel", "Tungsten"];
  const failures = [];

  for (const materialName of materialNames) {
    for (const aspectRatio of aspectRatios) {
      const x = makeInput(materialName, aspectRatio);
      const zeroD = calculate(x);
      const result = solveThermal2D(x, zeroD, x.enclosure, x.material);

      const problems = [];
      if (result.errors.length) problems.push(`config errors: ${result.errors.join("; ")}`);
      if (!Number.isFinite(result.avgK)) problems.push("avgK is not finite");
      if (!result.converged) problems.push(`did not converge (residual=${result.residual})`);
      if (Number.isFinite(result.closure) && result.closure > 0.02) problems.push(`closure=${result.closure}`);
      if (!Number.isFinite(result.closure)) problems.push("closure is not finite");

      if (problems.length) failures.push(`${materialName} L/D=${aspectRatio}: ${problems.join(", ")}`);
    }
  }

  assert.deepEqual(failures, [], `${failures.length}/${aspectRatios.length * materialNames.length} cases failed:\n${failures.join("\n")}`);
});

test("calculate() rejects non-finite and out-of-range input instead of producing NaN results", () => {
  const badCases = [
    { label: "zero volume", overrides: { volumeCm3: 0 } },
    { label: "negative aspect ratio", overrides: { aspectRatio: -6 } },
    { label: "NaN aspect ratio", overrides: { aspectRatio: NaN } },
    { label: "zero ambient temperature", overrides: { ambientK: 0 } },
    { label: "negative target temperature", overrides: { targetK: -1 } },
    { label: "zero max current", overrides: { imax: 0 } },
    { label: "solid fraction above 1", overrides: { solidFraction: 1.5 } },
    { label: "emissivity above 1", overrides: { emissivity: 1.2 } }
  ];
  for (const { label, overrides } of badCases) {
    const x = makeInput("SiC", 6, overrides);
    const result = calculate(x);
    assert.ok(result.errors.length > 0, `expected "${label}" to be rejected with a validation error`);
    assert.equal(result.tss, undefined, `"${label}" should not produce a partial numeric result`);
  }
});

test("solveThermal2D() stays finite (no NaN/Infinity) at the extreme ends of the L/D range", () => {
  for (const aspectRatio of [0.2, 50]) {
    const x = makeInput("SiC", aspectRatio);
    const zeroD = calculate(x);
    assert.deepEqual(zeroD.errors, [], `L/D=${aspectRatio} unexpectedly failed validation`);
    const result = solveThermal2D(x, zeroD, x.enclosure, x.material);
    assert.deepEqual(result.errors, []);
    assert.ok(Number.isFinite(result.avgK), `L/D=${aspectRatio}: avgK=${result.avgK}`);
    assert.ok(Number.isFinite(result.closure), `L/D=${aspectRatio}: closure=${result.closure}`);
  }
});

// Physical-limit validation: the Biot number (Bi = h*Lc/k) is the ratio of internal
// conduction resistance to external (surface) resistance. As Bi -> 0 the element's own
// interior should become nearly isothermal, since internal conduction is no longer the
// bottleneck; as Bi grows, the interior temperature spread should grow with it. This is
// the actual physical content of the "lumped-element" limit the 0D Biot check (`bi`)
// exists to warn about, verified here against the independent 2D field solver's own
// resolved temperature spread rather than merely asserting the 0D and 2D models agree
// (they use two independently-implemented enclosure heat-loss formulations - a closed-form
// lumped resistance network vs. an explicit FVM mesh - that are not expected to match
// exactly even when the element itself is near-isothermal).
test("solveThermal2D()'s internal temperature spread grows monotonically with the 0D Biot number (Bi->0 lumped-element limit)", () => {
  const conductivities = [400, 120, 40, 12, 4, 1.5]; // W/m/K, high -> low
  const points = conductivities.map((k) => {
    const material = { name: "synthetic", rhoOhmCm: 0.02, density: 5000, cp: 600, k, jmax: 1e7, emissivity: 0.8 };
    const x = makeInput("SiC", 10, { material, emissivity: 0.8 });
    const zeroD = calculate(x);
    assert.deepEqual(zeroD.errors, [], `k=${k} unexpectedly failed validation`);
    const result = solveThermal2D(x, zeroD, x.enclosure, x.material);
    assert.deepEqual(result.errors, []);
    const rise = result.avgK - x.ambientK;
    return { k, bi: zeroD.bi, ratio: result.deltaT / rise };
  });

  // higher k -> lower Bi -> smaller internal spread; strictly increasing as k decreases
  for (let i = 1; i < points.length; i++) {
    assert.ok(
      points[i].ratio > points[i - 1].ratio,
      `deltaT/rise should grow as k drops (Bi rises): k=${points[i - 1].k} (Bi=${points[i - 1].bi.toExponential(2)}, ratio=${points[i - 1].ratio.toFixed(4)}) -> k=${points[i].k} (Bi=${points[i].bi.toExponential(2)}, ratio=${points[i].ratio.toFixed(4)})`
    );
  }
  // the highest-conductivity (lowest-Bi, Bi ~ 5e-4) case should be nearly isothermal
  assert.ok(points[0].ratio < 0.01, `lowest-Bi case should be nearly isothermal, got ratio=${points[0].ratio}`);
  // the lowest-conductivity (highest-Bi, Bi ~ 0.15) case should show a clear internal gradient
  assert.ok(points[points.length - 1].ratio > 0.2, `highest-Bi case should show a clear internal gradient, got ratio=${points[points.length - 1].ratio}`);
});

test("calculate() flags no melt warning when Tss stays below the material's melting point", () => {
  const x = makeInput("SiC", 6);
  const r = calculate(x);
  assert.ok(r.tss < r.material.meltC + 273.15);
  assert.equal(r.melt, null);
});

test("calculate() attaches a melt warning, and its suggested Vmax/Imax each independently cap Tss at the melting point", () => {
  const material = { ...materialByName("SiC"), jmax: 1e12 };
  const x = makeInput("SiC", 30, { material, imax: 1e6, vmax: 200, pmax: 1e12 });
  const overheated = calculate(x);
  assert.ok(overheated.melt, "expected this overdriven design to trigger a melt warning");
  assert.equal(overheated.melt.meltC, 2700);
  assert.equal(overheated.melt.meltKind, "decomposition");

  // Setting Vmax/Imax to exactly the suggested ceiling lands Tss right at the
  // melting point, up to solver tolerance, so it may sit a hair above or
  // below; a small margin below the ceiling should clear the warning cleanly.
  const meltK = overheated.melt.meltC + 273.15;
  const cappedByVoltage = calculate({ ...x, vmax: overheated.melt.safeVoltage });
  assert.ok(Math.abs(cappedByVoltage.tss - meltK) < 1e-4);

  const cappedByCurrent = calculate({ ...x, vmax: 1e9, imax: overheated.melt.safeCurrent });
  assert.ok(Math.abs(cappedByCurrent.tss - meltK) < 1e-4);

  const safelyCappedByVoltage = calculate({ ...x, vmax: overheated.melt.safeVoltage * 0.999 });
  assert.equal(safelyCappedByVoltage.melt, null);
  assert.ok(safelyCappedByVoltage.tss < meltK);

  const safelyCappedByCurrent = calculate({ ...x, vmax: 1e9, imax: overheated.melt.safeCurrent * 0.999 });
  assert.equal(safelyCappedByCurrent.melt, null);
  assert.ok(safelyCappedByCurrent.tss < meltK);
});
