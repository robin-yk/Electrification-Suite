// RPH vs CJH numeric core: the Arrhenius rate, transport, and velocity
// property functions, the pulsed-element waveform, and the ideal two-state
// (ramp = 0) analytical averages behind rphcjh.html. Pure functions of
// explicit parameters — no reference to the page's mutable `state` object
// and no DOM access — so this module can be imported directly by
// rphcjh.html (as an ES module) or by a Node test runner.
"use strict";

export const R_GAS = 8.314;        // J/mol/K
export const T_REF = 1373.15;      // 1100 C, the normalization anchor
export const K2C = 273.15;

// normalised property functions: prefactors cancel in every ratio
export function arrheniusRate(TC, eaKJmol) {
  return Math.exp(-(eaKJmol * 1000 / R_GAS) * (1 / (TC + K2C) - 1 / T_REF));
}
export function transportCoefficient(TC, beta) {
  return Math.pow((TC + K2C) / T_REF, beta);
}
export function velocity(TC) {
  return (TC + K2C) / T_REF;
}

export function timeAverageTemperature(duty, tPeak, tMin) {
  return duty * tPeak + (1 - duty) * tMin;
}

// trapezoidal element waveform, phase in [0,1)
export function pulseWaveform(phase, { duty, ramp, tPeak, tMin }) {
  const hi = duty, lo = 1 - duty;
  const r = Math.min(ramp, hi * 0.98, lo * 0.98);
  if (r <= 1e-6) return phase < hi ? tPeak : tMin;
  const rUp = Math.min(r, hi * 0.98), rDn = Math.min(r, lo * 0.98);
  const span = tPeak - tMin;
  if (phase < rUp) return tMin + span * (phase / rUp);
  if (phase < hi) return tPeak;
  if (phase < hi + rDn) return tPeak - span * ((phase - hi) / rDn);
  return tMin;
}

// ideal two-state averages, the form the companion paper proves (ramp = 0 limit)
export function idealTwoStateAverages({ duty, tPeak, tMin, ea, beta }) {
  const d = duty;
  const kPeak = arrheniusRate(tPeak, ea), kMin = arrheniusRate(tMin, ea);
  const hPeak = transportCoefficient(tPeak, beta), hMin = transportCoefficient(tMin, beta);
  const uPeak = velocity(tPeak), uMin = velocity(tMin);
  return {
    k: d * kPeak + (1 - d) * kMin,
    h: d * hPeak + (1 - d) * hMin,
    u: d * uPeak + (1 - d) * uMin,
    kh: d * kPeak / hPeak + (1 - d) * kMin / hMin,
    ku: d * kPeak / uPeak + (1 - d) * kMin / uMin
  };
}
