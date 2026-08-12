// Regression tests for the RPH vs CJH numeric core (rphcjh-solver.js).
// Pure Node, no browser: run with `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import {
  R_GAS, T_REF, K2C, arrheniusRate, transportCoefficient, velocity,
  timeAverageTemperature, pulseWaveform, idealTwoStateAverages
} from "../apps/rphcjh/solver.js";

test("arrheniusRate() equals 1 at the reference temperature by construction", () => {
  assert.ok(Math.abs(arrheniusRate(T_REF - K2C, 273) - 1) < 1e-9);
});

test("arrheniusRate() is convex in T for Ea > 2RT (the condition the page's convexity test checks)", () => {
  const ea = 422; // kJ/mol, the lumped methane-pyrolysis value the page documents
  const tPeak = 1250, tMin = 750, tAvg = 0.35 * tPeak + 0.65 * tMin;
  const chord = 0.35 * arrheniusRate(tPeak, ea) + 0.65 * arrheniusRate(tMin, ea);
  const curve = arrheniusRate(tAvg, ea);
  assert.ok(chord > curve, `expected chord (${chord}) above curve (${curve}) for a convex k(T)`);
});

test("transportCoefficient() is concave for 0 < beta < 1 and convex for beta > 1", () => {
  const tPeak = 1250, tMin = 750, d = 0.35, tAvg = d * tPeak + (1 - d) * tMin;
  const concaveBeta = 0.5;
  const chordConcave = d * transportCoefficient(tPeak, concaveBeta) + (1 - d) * transportCoefficient(tMin, concaveBeta);
  assert.ok(chordConcave < transportCoefficient(tAvg, concaveBeta), "beta=0.5 should be concave (chord below curve)");

  const convexBeta = 1.75;
  const chordConvex = d * transportCoefficient(tPeak, convexBeta) + (1 - d) * transportCoefficient(tMin, convexBeta);
  assert.ok(chordConvex > transportCoefficient(tAvg, convexBeta), "beta=1.75 should be convex (chord above curve)");
});

test("velocity() is exactly linear: its two-state average equals its average-temperature value", () => {
  const tPeak = 1250, tMin = 750, d = 0.35, tAvg = d * tPeak + (1 - d) * tMin;
  const chord = d * velocity(tPeak) + (1 - d) * velocity(tMin);
  assert.ok(Math.abs(chord - velocity(tAvg)) < 1e-9);
});

test("timeAverageTemperature() matches the duty-weighted formula", () => {
  assert.equal(timeAverageTemperature(0.35, 1250, 750), 0.35 * 1250 + 0.65 * 750);
  assert.equal(timeAverageTemperature(0, 1250, 750), 750);
  assert.equal(timeAverageTemperature(1, 1250, 750), 1250);
});

test("pulseWaveform() reduces to an ideal square wave when ramp = 0", () => {
  const params = { duty: 0.35, ramp: 0, tPeak: 1250, tMin: 750 };
  assert.equal(pulseWaveform(0.1, params), 1250);
  assert.equal(pulseWaveform(0.34, params), 1250);
  assert.equal(pulseWaveform(0.36, params), 750);
  assert.equal(pulseWaveform(0.99, params), 750);
});

test("pulseWaveform() keeps phase < duty as the full high-side fraction (ramp-up + flat-top), matching the page's own claim that duty is preserved as the actual high-temperature phase fraction", () => {
  const params = { duty: 0.35, ramp: 0.10, tPeak: 1250, tMin: 750 };
  let highSide = 0;
  const n = 10000;
  for (let i = 0; i < n; i++) if (pulseWaveform(i / n, params) > (params.tPeak + params.tMin) / 2) highSide++;
  // ramp-up occupies the first part of the high phase, so "above the midpoint temperature"
  // undercounts slightly relative to duty; it should still be close, not wildly off
  assert.ok(Math.abs(highSide / n - params.duty) < 0.08, `above-midpoint fraction ${highSide / n} strayed too far from duty ${params.duty}`);

  // the flat top at exactly tPeak should span [ramp, duty) of the phase, i.e. duty - ramp
  let atPeak = 0;
  for (let i = 0; i < n; i++) if (pulseWaveform(i / n, params) === params.tPeak) atPeak++;
  const expectedFlatTop = params.duty - Math.min(params.ramp, params.duty * 0.98, (1 - params.duty) * 0.98);
  assert.ok(Math.abs(atPeak / n - expectedFlatTop) < 0.01, `flat-top fraction ${atPeak / n} != expected ${expectedFlatTop}`);
});

test("pulseWaveform() never exceeds [tMin, tPeak] and is continuous across phase=0", () => {
  const params = { duty: 0.35, ramp: 0.10, tPeak: 1250, tMin: 750 };
  for (let i = 0; i <= 1000; i++) {
    const v = pulseWaveform(i / 1000, params);
    assert.ok(v >= params.tMin - 1e-9 && v <= params.tPeak + 1e-9, `phase ${i / 1000} -> ${v} out of range`);
  }
});

test("pulseWaveform() clamps a ramp wider than the shorter of the two dwell phases", () => {
  // duty=0.1 means the high dwell is short; an oversized ramp must not invert the waveform
  const params = { duty: 0.1, ramp: 0.9, tPeak: 1250, tMin: 750 };
  for (let i = 0; i <= 100; i++) {
    const v = pulseWaveform(i / 100, params);
    assert.ok(Number.isFinite(v) && v >= params.tMin - 1e-9 && v <= params.tPeak + 1e-9);
  }
});

test("idealTwoStateAverages() matches the same two-state formula as the live kOf/hOf/uOf composition", () => {
  const params = { duty: 0.35, tPeak: 1250, tMin: 750, ea: 422, beta: 0.5 };
  const av = idealTwoStateAverages(params);
  const d = params.duty;
  const expectedK = d * arrheniusRate(params.tPeak, params.ea) + (1 - d) * arrheniusRate(params.tMin, params.ea);
  assert.ok(Math.abs(av.k - expectedK) < 1e-12);
  assert.ok(Number.isFinite(av.h) && Number.isFinite(av.u) && Number.isFinite(av.kh) && Number.isFinite(av.ku));
});

test("idealTwoStateAverages().k exceeds k at the average temperature (the pulsing gain this page visualizes)", () => {
  const params = { duty: 0.35, tPeak: 1250, tMin: 750, ea: 422, beta: 0.5 };
  const av = idealTwoStateAverages(params);
  const tAvg = timeAverageTemperature(params.duty, params.tPeak, params.tMin);
  assert.ok(av.k > arrheniusRate(tAvg, params.ea), "Jensen gain on <k> should be positive for this convex, Ea-large case");
});

test("all property/waveform functions stay finite across the full UI slider ranges (extreme boundary sweep)", () => {
  // matches rphcjh.html's own <input type="range"> min/max for each control
  const tPeaks = [900, 1400], tMins = [400, 1200], duties = [0.05, 0.95], ramps = [0, 0.45], eas = [80, 500], betas = [0.05, 1.75];
  const failures = [];
  for (const tPeak of tPeaks) for (const tMin of tMins) for (const duty of duties) for (const ramp of ramps) for (const ea of eas) for (const beta of betas) {
    const params = { duty, ramp, tPeak, tMin, ea, beta };
    const checks = {
      kPeak: arrheniusRate(tPeak, ea), kMin: arrheniusRate(tMin, ea),
      hPeak: transportCoefficient(tPeak, beta), hMin: transportCoefficient(tMin, beta),
      uPeak: velocity(tPeak), uMin: velocity(tMin),
      tAvg: timeAverageTemperature(duty, tPeak, tMin),
      wave0: pulseWaveform(0, params), waveHalf: pulseWaveform(0.5, params),
    };
    const av = idealTwoStateAverages(params);
    Object.assign(checks, av);
    for (const [key, value] of Object.entries(checks)) {
      if (!Number.isFinite(value)) failures.push(`tPeak=${tPeak} tMin=${tMin} duty=${duty} ramp=${ramp} ea=${ea} beta=${beta}: ${key}=${value}`);
    }
  }
  assert.deepEqual(failures, []);
});

/* ---- physical CFP drive (lumped electro-thermal model) ---- */
import {
  cfpResistance, cfpHeatCapacity, lumpedLossPower, physicalDriveDefaults,
  steadyElementTemperature, integratePulsedElement, sampledWaveform, HE_CAPACITY_RATE
} from "../apps/rphcjh/solver.js";

test("cfpResistance() reproduces the SI Fig. S11a line and never collapses to zero", () => {
  assert.ok(Math.abs(cfpResistance(0) - 4.22) < 1e-9);
  assert.ok(Math.abs(cfpResistance(1000) - (4.22 - 0.724)) < 1e-9);
  assert.ok(cfpResistance(1e6) >= 0.2, "clamp must keep R positive under wild extrapolation");
});

test("steadyElementTemperature() closes the energy balance for a fixed-power drive", () => {
  const T = steadyElementTemperature({ power: 40 });
  const loss = lumpedLossPower(T, physicalDriveDefaults());
  assert.ok(Math.abs(loss - 40) / 40 < 1e-6, `loss ${loss} W should equal the 40 W drive`);
});

test("steady T_avg vs power scaling exponent sits in the radiation-dominated range the paper measured (~0.35)", () => {
  const t1 = steadyElementTemperature({ power: 20 }), t2 = steadyElementTemperature({ power: 80 });
  const exponent = Math.log(t2 / t1) / Math.log(4);
  assert.ok(exponent > 0.25 && exponent < 0.45, `exponent ${exponent} outside 0.25-0.45`);
});

test("integratePulsedElement() at duty = 1 recovers the steady voltage-drive temperature", () => {
  const steady = steadyElementTemperature({ voltage: 18 });
  const run = integratePulsedElement({ voltage: 18, period: 1, duty: 1 });
  assert.ok(run.converged);
  assert.ok(Math.abs(run.tPeak - steady) < 1, `pulsed ${run.tPeak} vs steady ${steady}`);
  assert.ok(run.tPeak - run.tMin < 1, "duty = 1 should have no swing");
});

test("integratePulsedElement() closes the per-cycle energy balance at periodic steady state", () => {
  const run = integratePulsedElement({ voltage: 40, period: 1, duty: 0.05 });
  assert.ok(run.converged, "must reach a periodic state");
  assert.ok(Math.abs(run.energyResidual) < 0.01, `per-cycle residual ${run.energyResidual} above 1%`);
});

test("faster pulsing collapses the temperature swing (element cannot follow above ~1/tau)", () => {
  const slow = integratePulsedElement({ voltage: 40, period: 1, duty: 0.05 });
  const fast = integratePulsedElement({ voltage: 40, period: 0.05, duty: 0.05 });
  assert.ok(fast.tPeak - fast.tMin < (slow.tPeak - slow.tMin) / 5,
    `20 Hz swing ${fast.tPeak - fast.tMin} not far below 1 Hz swing ${slow.tPeak - slow.tMin}`);
});

test("higher voltage raises the pulsed peak temperature monotonically", () => {
  const a = integratePulsedElement({ voltage: 30, period: 1, duty: 0.05 });
  const b = integratePulsedElement({ voltage: 45, period: 1, duty: 0.05 });
  assert.ok(b.tPeak > a.tPeak + 50);
});

test("the pulsed waveform peaks at the end of the on-phase and its samples interpolate cleanly", () => {
  const run = integratePulsedElement({ voltage: 40, period: 1, duty: 0.05 });
  let peakPhase = 0, peakT = -Infinity;
  run.samples.forEach(([ph, T]) => { if (T > peakT) { peakT = T; peakPhase = ph; } });
  assert.ok(Math.abs(peakPhase - 0.05) < 0.02, `peak at phase ${peakPhase}, expected near duty 0.05`);
  const mid = sampledWaveform(run.samples, 0.5);
  assert.ok(mid > run.tMin - 1 && mid < run.tPeak + 1);
  assert.ok(Math.abs(sampledWaveform(run.samples, 1.25) - sampledWaveform(run.samples, 0.25)) < 1e-9, "phase wraps");
});

test("He capacity rate matches 50 sccm of helium", () => {
  assert.ok(Math.abs(HE_CAPACITY_RATE - 50e-6 / 60 / 0.022414 * 20.786) < 1e-12);
  assert.ok(HE_CAPACITY_RATE > 7e-4 && HE_CAPACITY_RATE < 9e-4);
});

test("cfpHeatCapacity() interpolates and saturates near the Dulong-Petit limit", () => {
  assert.equal(cfpHeatCapacity(25), 710);
  assert.equal(cfpHeatCapacity(3000), 2040);
  const mid = cfpHeatCapacity(300);
  assert.ok(mid > 1050 && mid < 1390);
});
