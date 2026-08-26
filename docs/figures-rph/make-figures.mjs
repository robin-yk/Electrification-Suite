// Builds the figure data for the RPH vs CJH Application Note and writes the
// plates. Every number here comes from apps/rphcjh/solver.js; nothing is
// typed. Run: node docs/figures-rph/make-figures.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SERIES_DEFAULTS, seriesRateConstants, steadySeriesCSTR, integrateSeriesCSTR,
         cjhTempForConversion, integratePulsedElement, steadyElementTemperature,
         sampledWaveform, arrheniusRate, transportCoefficient, velocity,
         idealTwoStateAverages, timeAverageTemperature } from "../../apps/rphcjh/solver.js";
import { drive, comparison } from "./draw.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const p = (x, n = 4) => Number(x.toPrecision(n));

function solverCommit() {
  try {
    const sha = execFileSync("git", ["log", "-1", "--format=%h", "--", "apps/rphcjh/solver.js"],
      { cwd: join(here, "..", ".."), encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--", "apps/rphcjh/solver.js"],
      { cwd: join(here, "..", ".."), encoding: "utf8" }).trim();
    return sha ? sha + (dirty ? " + uncommitted changes" : "") : "unknown revision";
  } catch { return "unknown revision"; }
}

// ---- the shipped default drive, on the real element
const DRIVE = { voltage: 40, period: 1, duty: 0.05 };
const pulsed = integratePulsedElement(DRIVE);
const tempFn = (ph) => sampledWaveform(pulsed.samples, ph);

// ---- the three CJH baselines, and what each one is matching
const tMatchT = pulsed.tAvg;
const tMatchP = steadyElementTemperature({ power: pulsed.avgPower });
const rph = integrateSeriesCSTR({ period: DRIVE.period, tempFn });
const tMatchX = cjhTempForConversion(rph.conversion);
const sel = (X, B) => (X > 0 ? B / X : 0);
const cjhRow = (label, TC, basis) => {
  const s = steadySeriesCSTR(TC);
  const X = 1 - s.xA;
  return { label, basis, TC: p(TC), X: p(X, 3), B: p(s.xB, 3), S: p(sel(X, s.xB), 3) };
};

// ---- how the yield depends on the pulse period, at the same duty and voltage
const periods = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
const sweep = periods.map(function (T) {
  const el = integratePulsedElement(Object.assign({}, DRIVE, { period: T }));
  const r = integrateSeriesCSTR({ period: T, tempFn: (ph) => sampledWaveform(el.samples, ph) });
  const iso = cjhTempForConversion(r.conversion);
  const c = iso === null ? null : steadySeriesCSTR(iso);
  return {
    period: T, tPeak: p(el.tPeak), tMin: p(el.tMin), tAvg: p(el.tAvg),
    X: p(r.conversion, 3), B: p(r.avgB, 3), S: p(sel(r.conversion, r.avgB), 3),
    cjhB: c ? p(c.xB, 3) : null, cjhS: c ? p(sel(1 - c.xA, c.xB), 3) : null
  };
});

// ---- the same sweep with the timescale separation removed, as the control
const flat = Object.assign({}, SERIES_DEFAULTS, { ea2: SERIES_DEFAULTS.ea1, k2Ref: SERIES_DEFAULTS.k1Ref });
const control = periods.map(function (T) {
  const el = integratePulsedElement(Object.assign({}, DRIVE, { period: T }));
  const r = integrateSeriesCSTR(Object.assign({ period: T, tempFn: (ph) => sampledWaveform(el.samples, ph) }, flat));
  const iso = cjhTempForConversion(r.conversion, flat);
  const c = iso === null ? null : steadySeriesCSTR(iso, flat);
  return { period: T, B: p(r.avgB, 3), cjhB: c ? p(c.xB, 3) : null };
});

// ---- the two rate constants across the range the pulse actually visits
const kGrid = [];
for (let T = 500; T <= 1600; T += 25) {
  const { k1, k2 } = seriesRateConstants(T, SERIES_DEFAULTS);
  kGrid.push({ TC: T, k1: p(k1, 4), k2: p(k2, 4) });
}

const DATA = {
  commit: solverCommit(),
  drive: {
    voltage: DRIVE.voltage, period: DRIVE.period, duty: DRIVE.duty,
    tPeak: p(pulsed.tPeak), tMin: p(pulsed.tMin), tAvg: p(pulsed.tAvg),
    avgPower: p(pulsed.avgPower), peakPower: p(pulsed.peakPower),
    energyResidual: pulsed.energyResidual, cycles: pulsed.cycles,
    samples: pulsed.samples.map((s) => [Number(s[0].toFixed(4)), p(s[1], 6)])
  },
  kinetics: { ea1: SERIES_DEFAULTS.ea1, ea2: SERIES_DEFAULTS.ea2,
              k1Ref: SERIES_DEFAULTS.k1Ref, k2Ref: SERIES_DEFAULTS.k2Ref,
              tau: SERIES_DEFAULTS.tau, grid: kGrid },
  compare: {
    rph: { label: "RPH", basis: "pulsed drive", X: p(rph.conversion, 3), B: p(rph.avgB, 3),
           S: p(sel(rph.conversion, rph.avgB), 3), peakB: p(rph.peakB, 3), minB: p(rph.minB, 3) },
    cjh: [cjhRow("CJH", tMatchT, "matched on average temperature"),
          cjhRow("CJH", tMatchP, "matched on electrical power"),
          cjhRow("CJH", tMatchX, "matched on conversion")]
  },
  sweep, control
};

const PLATES = [
  { id: "rphFig2", label: "Fig. 2", draw: drive },
  { id: "rphFig3", label: "Fig. 3", draw: comparison }
];
for (const plate of PLATES) {
  const svg = plate.draw(DATA);
  if (/NaN|undefined/.test(svg)) throw new Error(plate.label + " drew a NaN or an undefined value");
  writeFileSync(join(here, plate.id + ".svg"), svg);
}
writeFileSync(join(here, "figure-data.json"), JSON.stringify(DATA, null, 1) + "\n");
console.log("wrote " + PLATES.map((x) => x.id).join(", ") + " at solver commit " + DATA.commit);
console.log("  drive   peak " + DATA.drive.tPeak + " C, min " + DATA.drive.tMin + " C, avg " + DATA.drive.tAvg + " C");
console.log("  compare RPH B " + DATA.compare.rph.B + " vs iso-X CJH B " + DATA.compare.cjh[2].B);
