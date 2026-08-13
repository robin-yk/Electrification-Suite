// RPH vs CJH numeric core: the Arrhenius rate, transport, and velocity
// property functions, the pulsed-element waveform, and the ideal two-state
// (ramp = 0) analytical averages behind rphcjh.html. Pure functions of
// explicit parameters, with no reference to the page's mutable `state` object
// and no DOM access, so this module can be imported directly by
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

/* ------------------------------------------------------------------ */
/* Physical CFP drive: lumped electro-thermal model of the paper's     */
/* carbon-fiber-paper heating element (SI, "Experimental Setup" and    */
/* Fig. S11). One ODE, m cp(T) dT/dt = V^2/R(T) - losses(T), justified */
/* as 0D by the element's measured spatial uniformity (Scheme S2) and  */
/* its 210 um thickness.                                               */
/* ------------------------------------------------------------------ */
export const SIGMA_SB = 5.670374419e-8;   // W/m^2/K^4

export const CFP_ELEMENT = {
  // Freudenberg H23 strip, 38 x 8 x 0.21 mm, 28.8 mg
  length: 0.038, width: 0.008, thickness: 210e-6,   // m
  mass: 28.8e-6,                                    // kg
  emissivity: 0.57,        // IR-calibrated carbon-surface value
  resistA: 7.24e-4,        // ohm per degC, R(T) = b - a T (Fig. S11a)
  resistB: 4.22            // ohm at 0 degC
};

// He carrier at 50 sccm passes through the permeable element; with the
// fiber-scale exchange area the gas leaves at element temperature, so the
// convective loss is the full capacity rate times (T - T_inlet).
export const HE_CAPACITY_RATE = 50e-6 / 60 / 0.022414 * 20.786;  // W/K

// Graphitic carbon specific heat, J/kg/K, capped near the Dulong-Petit
// limit 3R/M = 2078 J/kg/K.
export const CFP_CP_TABLE = [
  [25, 710], [200, 1050], [400, 1390], [600, 1590], [800, 1730],
  [1000, 1830], [1200, 1900], [1400, 1950], [1600, 2000], [1800, 2040]
];

export function interpolateTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return last[1];
}

export function cfpResistance(TC, el = CFP_ELEMENT) {
  // carbon's resistance falls with temperature; clamp well above zero so a
  // runaway extrapolation of the linear fit can never divide by ~0
  return Math.max(0.2, el.resistB - el.resistA * TC);
}

export function cfpHeatCapacity(TC) {
  return interpolateTable(CFP_CP_TABLE, TC);
}

export function lumpedLossPower(TC, p) {
  const el = p.element, TK = TC + K2C, TaK = p.ambientC + K2C;
  const area = 2 * el.length * el.width;   // both strip faces; edges negligible
  const rad = SIGMA_SB * el.emissivity * area * (TK ** 4 - TaK ** 4);
  const gas = p.gasCapacityRate * Math.max(0, TC - p.gasInletC);
  const contact = p.contactConductance * (TC - p.ambientC);
  return rad + gas + contact;
}

export function physicalDriveDefaults(overrides = {}) {
  return Object.assign({
    voltage: 40, period: 1, duty: 0.05,
    ambientC: 25, gasInletC: 25,
    element: CFP_ELEMENT,
    gasCapacityRate: HE_CAPACITY_RATE,
    contactConductance: 0
  }, overrides);
}

// Steady CJH element temperature under either a voltage or a fixed-power
// drive: bisection on P_in(T) = P_loss(T). Losses grow as T^4 while the
// voltage-drive input grows only through the falling R(T), so the crossing
// is unique.
export function steadyElementTemperature(cfg = {}) {
  const p = physicalDriveDefaults(cfg);
  const pin = TC => (cfg.power !== undefined ? cfg.power : p.voltage * p.voltage / cfpResistance(TC, p.element));
  const f = TC => pin(TC) - lumpedLossPower(TC, p);
  let lo = p.ambientC, hi = 3500;
  if (f(lo) <= 0) return lo;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// RK4 over whole pulse cycles until the cycle-start temperature repeats
// (periodic steady state). The step grid is aligned so the on->off switch
// falls exactly on a step boundary for duty at 0.01 resolution.
export function integratePulsedElement(cfg = {}) {
  const p = physicalDriveDefaults(cfg);
  const steps = 2400, dt = p.period / steps, onSteps = Math.round(p.duty * steps);
  const maxCycles = cfg.maxCycles ?? 400, tolC = cfg.tolC ?? 0.02;
  const deriv = (TC, on) => {
    const pin = on ? p.voltage * p.voltage / cfpResistance(TC, p.element) : 0;
    return (pin - lumpedLossPower(TC, p)) / (p.element.mass * cfpHeatCapacity(TC));
  };
  let T = cfg.startC ?? p.ambientC, cycles = 0, converged = false;
  let samples = [], tPeak = 0, tMin = 0, tAvg = 0, electricalEnergy = 0, lossEnergy = 0;
  for (let c = 0; c < maxCycles; c++) {
    const startT = T;
    const record = [];
    tPeak = -Infinity; tMin = Infinity; tAvg = 0; electricalEnergy = 0; lossEnergy = 0;
    for (let i = 0; i < steps; i++) {
      const on = i < onSteps;
      if (i % 6 === 0) record.push([i / steps, T]);
      tPeak = Math.max(tPeak, T); tMin = Math.min(tMin, T);
      tAvg += T * dt;
      if (on) electricalEnergy += p.voltage * p.voltage / cfpResistance(T, p.element) * dt;
      lossEnergy += lumpedLossPower(T, p) * dt;
      const k1 = deriv(T, on);
      const k2 = deriv(T + dt / 2 * k1, on);
      const k3 = deriv(T + dt / 2 * k2, on);
      const k4 = deriv(T + dt * k3, on);
      T += dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    cycles = c + 1;
    samples = record;
    if (Math.abs(T - startT) < tolC) { converged = true; break; }
  }
  tPeak = Math.max(tPeak, T); tMin = Math.min(tMin, T);
  samples.push([1, T]);
  return {
    samples, tPeak, tMin, tAvg: tAvg / p.period,
    avgPower: electricalEnergy / p.period,
    peakPower: p.voltage * p.voltage / cfpResistance(tPeak, p.element),
    energyResidual: (electricalEnergy - lossEnergy) / Math.max(electricalEnergy, 1e-12),
    cycles, converged
  };
}

/* ------------------------------------------------------------------ */
/* Series network A -> B -> C in a CSTR with an imposed temperature    */
/* program T(t): the minimal model that rationalizes why short hot     */
/* pulses protect the intermediate B (Railkar & Vlachos 2024,          */
/* IECR, 10.1021/acs.iecr.3c03198; the experimental case is Dong et    */
/* al. 2022, Nature, 10.1038/s41586-022-04568-6). Both steps are       */
/* first-order and homogeneous; rate constants are anchored at T_REF.  */
/* ------------------------------------------------------------------ */
export const SERIES_DEFAULTS = {
  ea1: 400,   // kJ/mol, A -> B: steep, near the lumped methane-pyrolysis 422
  ea2: 80,    // kJ/mol, B -> C: flat, so the destruction step never freezes
  k1Ref: 30,  // 1/s at 1100 C
  k2Ref: 1,   // 1/s at 1100 C
  tau: 1.0    // CSTR residence time, s
};

export function seriesRateConstants(TC, p) {
  return {
    k1: p.k1Ref * arrheniusRate(TC, p.ea1),
    k2: p.k2Ref * arrheniusRate(TC, p.ea2)
  };
}

// analytic steady CSTR at constant temperature, pure-A feed:
// (1 - xA)/tau = k1 xA  and  k1 xA = xB/tau + k2 xB
export function steadySeriesCSTR(TC, cfg = {}) {
  const p = Object.assign({}, SERIES_DEFAULTS, cfg);
  const { k1, k2 } = seriesRateConstants(TC, p);
  const xA = 1 / (1 + k1 * p.tau);
  const xB = k1 * p.tau * xA / (1 + k2 * p.tau);
  return { xA, xB, xC: Math.max(0, 1 - xA - xB), k1, k2 };
}

// Exact update coefficients for one time step of length dt with the
// temperature frozen at TC. The balances are linear, so the step solves
// in closed form:
//   xA' = alphaA + betaA xA
//   xB' = betaB xB + srcConst + srcA xA
// Exported so the page can advance a live simulation with the same
// arithmetic the periodic solver uses, unconditionally stable no matter
// how large k(T_peak) becomes.
export function seriesStepCoeffs(TC, dt, p) {
  const { k1, k2 } = seriesRateConstants(TC, p);
  const invTau = 1 / p.tau;
  const lamA = invTau + k1, lamB = invTau + k2;
  const betaA = Math.exp(-lamA * dt), betaB = Math.exp(-lamB * dt);
  const xAss = invTau / lamA;
  const G = Math.abs(lamB - lamA) < 1e-9 * (lamA + lamB)
    ? dt * betaA
    : (betaA - betaB) / (lamB - lamA);
  return {
    alphaA: xAss * (1 - betaA), betaA, betaB,
    srcConst: k1 * xAss * ((1 - betaB) / lamB - G),
    srcA: k1 * G
  };
}

// Periodic state of the same CSTR under a temperature program tempFn(phase).
// The ODEs are linear, so each step (temperature frozen over dt) has an
// exact exponential update, and one full cycle composes to an affine map
// x_end = M x_start + c whose fixed point is the periodic state. Two passes
// over the cycle therefore give the exact answer regardless of how stiff
// k(T_peak) becomes, with no RK stability limit.
export function integrateSeriesCSTR(cfg = {}) {
  const p = Object.assign({}, SERIES_DEFAULTS, { period: 1, steps: 2000 }, cfg);
  const dt = p.period / p.steps;
  const stepCoeffs = TC => seriesStepCoeffs(TC, dt, p);

  // pass 1: compose the cycle's affine map
  // xA = a0 + aA xA0,  xB = b0 + bA xA0 + bB xB0
  let a0 = 0, aA = 1, b0 = 0, bA = 0, bB = 1;
  const coeffs = [];
  for (let i = 0; i < p.steps; i++) {
    const s = stepCoeffs(p.tempFn((i + 0.5) / p.steps));
    coeffs.push(s);
    const na0 = s.alphaA + s.betaA * a0, naA = s.betaA * aA;
    b0 = s.betaB * b0 + s.srcConst + s.srcA * a0;
    bA = s.betaB * bA + s.srcA * aA;
    bB = s.betaB * bB;
    a0 = na0; aA = naA;
  }
  const xA0 = a0 / (1 - aA);
  const xB0 = (b0 + bA * xA0) / (1 - bB);

  // pass 2: walk one cycle from the fixed point, recording and averaging
  let xA = xA0, xB = xB0, avgA = 0, avgB = 0, peakB = -Infinity, minB = Infinity;
  const every = Math.max(1, Math.round(p.steps / 300));
  const samples = [[0, xA, xB]];
  for (let i = 0; i < p.steps; i++) {
    const s = coeffs[i];
    const pA = xA, pB = xB;
    xA = s.alphaA + s.betaA * xA;
    xB = s.betaB * xB + s.srcConst + s.srcA * pA;
    avgA += (pA + xA) / 2 / p.steps;
    avgB += (pB + xB) / 2 / p.steps;
    peakB = Math.max(peakB, xB); minB = Math.min(minB, xB);
    if ((i + 1) % every === 0 || i === p.steps - 1) samples.push([(i + 1) / p.steps, xA, xB]);
  }
  return {
    samples, avgA, avgB, avgC: Math.max(0, 1 - avgA - avgB),
    peakB, minB, conversion: 1 - avgA
  };
}

// linear phase lookup into an integratePulsedElement() sample list
export function sampledWaveform(samples, phase) {
  const ph = phase - Math.floor(phase);
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= ph) lo = mid; else hi = mid;
  }
  const [p0, t0] = samples[lo], [p1, t1] = samples[hi];
  return p1 === p0 ? t0 : t0 + (t1 - t0) * (ph - p0) / (p1 - p0);
}
