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
import { predictRphConversion } from "../../apps/rphcjh/surrogate.js";
import { workflow, drive, comparison, window_, detailed, verification, boundaries, architecture,
         cjhmap, memory, finalparity } from "./draw.mjs";

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

// The files the plates actually open, named one by one rather than by their
// directories: a stamp that moves when a neighbouring file changes claims a
// revision the artwork never read, and this page's whole argument is that a
// number and its provenance travel together.
const DATA_FILES = [
  "tools/openmkm_dynamic/data/canonical/cjh-grid.jsonl",
  "tools/openmkm_dynamic/data/canonical/cjh-grid-validation.json",
  "tools/openmkm_dynamic/data/canonical/design-physical.jsonl",
  "tools/openmkm_dynamic/data/canonical/final-validation-report.json",
  "apps/rphcjh/data/rph-surrogate.json",
  "apps/rphcjh/data/cantera.json",
  "apps/rphcjh/data/openmkm-pfr.json"
];

function dataCommit() {
  try {
    const paths = DATA_FILES;
    const sha = execFileSync("git", ["log", "-1", "--format=%h", "--"].concat(paths),
      { cwd: join(here, "..", ".."), encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--"].concat(paths),
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

// ---- verification: what each part of the solver is checked against, and how
// closely. The split that matters is between the parts integrated with a
// finite step and the parts that are exact by construction.
const dutyOne = [20, 30, 40, 60].map(function (V) {
  const p = integratePulsedElement({ voltage: V, period: 1, duty: 1 });
  return Math.abs(p.tAvg - steadyElementTemperature({ voltage: V }));
});
const closure = [[30, 0.5, 0.02], [40, 1, 0.05], [40, 2, 0.1], [60, 5, 0.2], [40, 10, 0.5]]
  .map(function (d) {
    return Math.abs(integratePulsedElement({ voltage: d[0], period: d[1], duty: d[2] }).energyResidual);
  });
const cstr = [900, 1100, 1300].map(function (TC) {
  const num = integrateSeriesCSTR({ period: 1, tempFn: () => TC });
  const ana = steadySeriesCSTR(TC);
  return Math.max(Math.abs(num.avgA - ana.xA), Math.abs(num.avgB - ana.xB));
});
const invert = [0.01, 0.1, 0.5, 0.9].map(function (X) {
  return Math.abs(1 - steadySeriesCSTR(cjhTempForConversion(X)).xA - X);
});
// The mole balance is not a check here: the solver defines xC as 1 - xA - xB,
// so it closes by construction and could never fail. What can fail is the
// periodicity the two-pass construction claims, so that is what is measured:
// start from the computed fixed point, walk one cycle, and see how far the
// state returns.
const stiff = [40, 80, 120].map(function (V) {
  const el = integratePulsedElement({ voltage: V, period: 1, duty: 0.05 });
  const r = integrateSeriesCSTR({ period: 1, tempFn: (ph) => sampledWaveform(el.samples, ph) });
  const a = r.samples[0], z = r.samples[r.samples.length - 1];
  return { volts: V, tPeak: p(el.tPeak), k1: p(seriesRateConstants(el.tPeak, SERIES_DEFAULTS).k1, 3),
           drift: Math.max(Math.abs(z[1] - a[1]), Math.abs(z[2] - a[2])),
           bounded: r.minB >= 0 && r.peakB <= 1 };
});
const worst = (a) => Math.max.apply(null, a);

// The detailed-mechanism panels read the committed outputs of the offline
// pipelines rather than recomputing them: Cantera for the effective activation
// energy and OpenMKM for the steady PFR sweep. Both files carry their own
// provenance, which is reproduced on the plate.
const readJSON = (f) => JSON.parse(readFileSync(join(here, "..", "..", f), "utf8"));
const cantera = readJSON("apps/rphcjh/data/cantera.json");
const pfr = readJSON("apps/rphcjh/data/openmkm-pfr.json");

// ---- the Cantera side: the CJH map, its off-node check, the design campaign
// with the shipped correction run over it, and the sealed final test. All of
// it reads canonical/ datasets, each promoted with the evidence named in
// tools/openmkm_dynamic/data/canonical/manifest.json, and the correction is
// computed through the identical inference module the browser imports.
const readJSONL = (f) => readFileSync(join(here, "..", "..", f), "utf8")
  .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

const gridRows = readJSONL("tools/openmkm_dynamic/data/canonical/cjh-grid.jsonl");
const gridVal = readJSON("tools/openmkm_dynamic/data/canonical/cjh-grid-validation.json");
const taus = [...new Set(gridRows.map((r) => r.tau_s))].sort((a, b) => a - b);
const columns = taus.map(function (tau) {
  const pts = gridRows.filter((r) => r.tau_s === tau)
    .sort((a, b) => a.T_C - b.T_C)
    .map((r) => [r.T_C, p(Math.min(Math.max(r.ch4_conversion, 0), 1), 4)]);
  return { tau, pts };
});
const locus = columns.map(function (c) {
  for (let i = 1; i < c.pts.length; i++) {
    const [t0, x0] = c.pts[i - 1], [t1, x1] = c.pts[i];
    if (x0 < 0.5 && x1 >= 0.5) return { tau: c.tau, T: p(t0 + (0.5 - x0) / (x1 - x0) * (t1 - t0), 5) };
  }
  return null;
}).filter(Boolean);

const design = readJSONL("tools/openmkm_dynamic/data/canonical/design-physical.jsonl");
const bundle = readJSON("apps/rphcjh/data/rph-surrogate.json");
const holdoutSet = new Set(bundle.model.holdout_indices);
const memCases = [];
let deadZero = 0, refused = 0;
for (const r of design) {
  const o = r.outputs, i = r.inputs;
  const xd = o.ch4_conversion, xq = o.quasi_steady_ch4_conversion;
  if (xd < 1e-6 && xq < 1e-6) { deadZero++; continue; }
  const pred = predictRphConversion(bundle.model, {
    xQs: xq, periodS: i.period_s, tauS: i.tau_s, duty: i.duty,
    tPeakC: i.t_peak_K - 273.15, tMinC: i.t_min_K - 273.15
  });
  if (!pred.valid) refused++;
  memCases.push({
    pt: p(i.period_s / i.tau_s, 4), gain: p(xd / xq, 4),
    e0: p(Math.abs(xq - xd), 3),
    e1: pred.valid ? p(Math.abs(pred.conversion - xd), 3) : null,
    holdout: holdoutSet.has(r.design_index)
  });
}
const gainBandCases = memCases.filter((c) => c.gain >= 2);
const gpReport = bundle.model.holdout_report.find((m) => m.model.includes("GP"));
const cjhReport = bundle.model.holdout_report.find((m) => m.model.includes("as-is"));

const finalVal = readJSON("tools/openmkm_dynamic/data/canonical/final-validation-report.json");

const DATA = {
  commit: solverCommit(),
  dataCommit: dataCommit(),
  map: {
    tLo: gridRows.reduce((a, r) => Math.min(a, r.T_C), Infinity),
    tHi: gridRows.reduce((a, r) => Math.max(a, r.T_C), -Infinity),
    nodes: gridRows.length,
    mechanism: gridRows[0].mechanism, feed: gridRows[0].feed,
    taus: taus.map((t) => p(t, 4)),
    columns, locus,
    val: {
      points: gridVal.summary.points, gate: 0.02,
      median: p(gridVal.summary.median_abs_error, 3),
      p95: p(gridVal.summary.p95_abs_error, 3),
      max: p(gridVal.summary.max_abs_error, 3),
      rows: gridVal.rows.map((r) => [p(r.T_C, 5), p(r.abs_error, 3)])
    }
  },
  mem: {
    cases: memCases, deadZero, refused,
    live: memCases.length,
    holdoutN: bundle.model.holdout_indices.length,
    gainMax: memCases.reduce((a, c) => Math.max(a, c.gain), 0),
    band: gainBandCases.length ? {
      lo: p(gainBandCases.reduce((a, c) => Math.min(a, c.pt), Infinity), 3),
      hi: p(gainBandCases.reduce((a, c) => Math.max(a, c.pt), 0), 3)
    } : null,
    hold: { mean: p(gpReport.mean, 3), p95: p(gpReport.p95, 3), max: p(gpReport.max, 3) },
    holdCjh: { mean: p(cjhReport.mean, 3), p95: p(cjhReport.p95, 3), max: p(cjhReport.max, 3) }
  },
  final: {
    n: finalVal.summary.points, verdict: finalVal.verdict,
    mean: p(finalVal.summary.mean_abs_error, 3),
    p95: p(finalVal.summary.p95_abs_error, 3),
    max: p(finalVal.summary.max_abs_error, 3),
    cjhMean: p(finalVal.summary.cjh_mean_abs_error, 3),
    gates: finalVal.gates,
    cases: finalVal.cases.map((c) => [p(c.cantera_conversion, 4), p(c.cjh_conversion, 4),
                                      p(c.predicted_rph_conversion, 4)])
  },
  verify: {
    integrated: [
      { q: "Full duty recovers the steady drive", against: "steady voltage-drive solve, 20 to 60 V",
        unit: "K", worst: worst(dutyOne), n: dutyOne.length },
      { q: "Energy closes over one cycle", against: "electrical in against losses out",
        unit: "relative", worst: worst(closure), n: closure.length }
    ],
    exact: [
      { q: "Constant temperature recovers the analytic CSTR", against: "closed-form steady state, 900 to 1300 °C",
        unit: "mole fraction", worst: worst(cstr), n: cstr.length },
      { q: "The conversion inversion round trips", against: "its own steady conversion, X 0.01 to 0.9",
        unit: "conversion", worst: worst(invert), n: invert.length }
    ],
    stiff: stiff,
    stiffWorst: worst(stiff.map((r) => r.drift)),
    stiffBounded: stiff.every((r) => r.bounded)
  },
  detailed: {
    tGrid: cantera.T_grid_C,
    eaWindow: cantera.ea_fit_window_C,
    mechanisms: Object.values(cantera.mechanisms).map((m) => ({
      name: m.name, species: m.n_species, reactions: m.n_reactions,
      ea: p(m.Ea_eff_kJ_mol, 4), k: m.keff_1_s.map((v) => p(v, 4))
    })),
    pfr: {
      engine: pfr.engine, mechanism: pfr.mechanism, feed: pfr.feed,
      note: pfr.quasi_steady_note,
      // Below a tenth of a per cent conversion the selectivity is a ratio of
      // mole fractions at the 1e-9 level and one of them can come back
      // negative, so it is carried but flagged rather than plotted.
      floorX: 1e-3,
      cases: pfr.cases.map((c) => ({ TC: c.element_T_C, X: p(c.ch4_conversion, 4),
                                     S: p(c.c2_selectivity_carbon, 4),
                                     CO: p(c.outlet_molefrac.CO, 4),
                                     meaningful: c.ch4_conversion >= 1e-3 }))
    }
  },
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
  { id: "rphFig1", label: "Fig. 1", draw: workflow },
  { id: "rphFig2", label: "Fig. 2", draw: drive },
  { id: "rphFig3", label: "Fig. 3", draw: comparison },
  { id: "rphFig4", label: "Fig. 4", draw: window_ },
  { id: "rphFig5", label: "Fig. 5", draw: detailed },
  { id: "rphFig6", label: "Fig. 6", draw: cjhmap },
  { id: "rphFig7", label: "Fig. 7", draw: memory },
  { id: "rphFig8", label: "Fig. 8", draw: finalparity },
  { id: "rphFigS1", label: "Fig. S1", draw: verification },
  { id: "rphFigS2", label: "Fig. S2", draw: boundaries },
  { id: "rphFigS3", label: "Fig. S3", draw: architecture }
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

// ---- assemble the page that publishes them
const read = (f) => readFileSync(join(here, f), "utf8");
const shared = (f) => readFileSync(join(here, "..", "figures", f), "utf8");
const inlined = (src) => src
  .replace(/^import [^;]+;\n/gm, "")
  .replace(/^export (function|const) /gm, "$1 ");
// Caption numbers are tokens filled from the same frozen data object the
// artwork reads, so a caption cannot drift from its plate.
const sci = (v) => {
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 0) return String(p(v, 2));
  return (v / Math.pow(10, e)).toFixed(1) + " × 10<sup>" + String(e).replace("-", "&#8722;") + "</sup>";
};
const TOKENS = {
  COMMIT: DATA.commit, DATACOMMIT: DATA.dataCommit, TITLE: "RPH vs CJH Figure Plates",
  MAP_NODES: String(DATA.map.nodes).replace(/(\d)(\d{3})$/, "$1,$2"),
  MAP_TAUS: String(DATA.map.taus.length),
  VAL_N: String(DATA.map.val.points),
  VAL_MED: sci(DATA.map.val.median), VAL_P95: sci(DATA.map.val.p95), VAL_MAX: sci(DATA.map.val.max),
  MEM_N: String(DATA.mem.live), MEM_DEAD: String(DATA.mem.deadZero),
  GAIN_MAX: DATA.mem.gainMax.toFixed(1),
  HOLD_N: String(DATA.mem.holdoutN),
  HOLD_MEAN: sci(DATA.mem.hold.mean), HOLD_P95: sci(DATA.mem.hold.p95), HOLD_MAX: sci(DATA.mem.hold.max),
  HOLD_CJH_MEAN: sci(DATA.mem.holdCjh.mean),
  FV_N: String(DATA.final.n), FV_VERDICT: DATA.final.verdict,
  FV_MEAN: sci(DATA.final.mean), FV_P95: sci(DATA.final.p95), FV_MAX: sci(DATA.final.max),
  FV_CJH: sci(DATA.final.cjhMean)
};
let body = shared("templates/head.html") + read("templates/body.html");
for (const [k, v] of Object.entries(TOKENS)) body = body.replaceAll("{{" + k + "}}", v);
const unresolved = body.match(/\{\{[^}]+\}\}/g);
if (unresolved) throw new Error("caption token not resolved: " + [...new Set(unresolved)].join(", "));
const figMap = "const FIGS = {" + PLATES.map((x) => x.id + ": " + x.draw.name).join(", ") + "};\n";
const page = body +
  "<script>\nconst DATA = Object.freeze(" + JSON.stringify(DATA) + ");\n" +
  inlined(shared("kit.mjs")) + inlined(read("draw.mjs")) + figMap +
  shared("templates/wiring.js") + "</" + "script>\n";
writeFileSync(join(here, "index.html"), page);
console.log("  and index.html");
