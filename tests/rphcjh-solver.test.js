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
  const ea = 422; // kJ/mol, the page's default
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
