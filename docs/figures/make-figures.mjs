// Build the Application Note figures from the solver, not from a drawing.
//
//   node docs/figures/make-figures.mjs
//
// Writes, into this directory:
//   figure-data.json   every number the figures display, and where it came from
//   fig1..fig5.svg     the five plates at print size, ready to place in Word
//   index.html         the published figure page, with the same data frozen in
//
// The point of the arrangement is that no value is typed twice. A change to
// apps/joule/solver.js is picked up by re-running this one command, and a
// figure cannot drift away from the manuscript text that quotes it.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { geometry, equivalentCylinder, build2DMesh, calculate, solveThermal2D, solveTransient2D,
         elementTimeConstant, MATERIALS } from "../../apps/joule/solver.js";
import { defaultInput } from "../../tools/verification/joule.mjs";
import { cfpMaterial, cfpEnclosure, cfpInputs } from "../../tools/verification/joule-rphcjh.mjs";
import { workflow, coupling, verification, defaultCase, transient, screening,
         meshDomain, matrixClasses, solverLoop, cylinderMapping } from "./draw.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const p = (x, n = 4) => Number(x.toPrecision(n));

// The stamp is the commit that last touched the solver, read from git rather
// than typed, so the page cannot claim a revision it was not built from.
function solverCommit() {
  try {
    const sha = execFileSync("git", ["log", "-1", "--format=%h", "--", "apps/joule/solver.js"],
      { cwd: join(here, "..", ".."), encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--", "apps/joule/solver.js"],
      { cwd: join(here, "..", ".."), encoding: "utf8" }).trim();
    return sha ? sha + (dirty ? " + uncommitted changes" : "") : "unknown revision";
  } catch { return "unknown revision"; }
}
const COMMIT = solverCommit();

// ---- the rectangular element the pulsed cross-check uses, and the cylinder
// the axisymmetric solver meshes in its place. The resistivity is the one that
// reproduces the measured R(T) of the strip.
const Lm = 0.038, Wm = 0.008, Hm = 0.21e-3, massMg = 28.8;
const rhoAt = (T) => (4.25 - 7.24e-4 * T) * (Wm * Hm) * 100 / Lm;
const CFP = { name: "CFP", rhoOhmCm: rhoAt(25), density: massMg * 1e-6 / (Lm * Wm * Hm),
              cp: 900, k: 400, jmax: 1e9, emissivity: 0.57 };
const boxInput = { shape: "box", lengthMm: 38, widthMm: 8, heightMm: 0.21, solidFraction: 1, material: CFP };
const gb = geometry(boxInput);
const eq = equivalentCylinder(boxInput, CFP);
const gc = geometry(eq.x);
const resistance = (g, m) => m.rhoOhmCm * 0.01 * g.L / g.area;

// ---- the default axisymmetric case at the resolution the app ships with
const x = defaultInput();
const g = geometry(x);
const mesh = build2DMesh(g, { ...x.enclosure, nr: 30, nz: 60 });
const airStart = mesh.nElement + mesh.nGap + mesh.nWall;
const airWidths = [];
for (let i = airStart; i < mesh.nr; i++) airWidths.push(mesh.edges[i + 1] - mesh.edges[i]);

const DATA = {
  commit: COMMIT,
  strip: {
    L: p(gb.L * 1e3), W: p(gb.W * 1e3), H: p(gb.H * 1e3),
    area: p(gb.area * 1e6),
    surface: p(gb.surface * 1e4),                 // 2(LW + LH + WH), what geometry() uses
    surface2f: p(2 * Lm * Wm * 1e4),              // 2LW, the two-face convention
    edgePct: p(100 * (Lm * Hm + Wm * Hm) / (Lm * Wm + Lm * Hm + Wm * Hm), 3),
    volume: p(gb.volume * 1e6), mass: p(CFP.density * gb.volume * 1e6),
    rho: p(CFP.rhoOhmCm), density: p(CFP.density), R: p(resistance(gb, CFP))
  },
  cyl: {
    D: p(eq.D * 1e3), L: p(gc.L * 1e3), area: p(gc.area * 1e6), surface: p(gc.surface * 1e4),
    volume: p(gc.volume * 1e6), mass: p(eq.material.density * gc.volume * 1e6),
    rho: p(eq.material.rhoOhmCm), density: p(eq.material.density), R: p(resistance(gc, eq.material)),
    areaRatio: p(eq.areaRatio), densityScale: p(eq.densityScale), volumeRatio: p(gc.volume / gb.volume)
  },
  mesh: {
    nr: mesh.nr, nz: mesh.nz,
    nElement: mesh.nElement, nGap: mesh.nGap, nWall: mesh.nWall, nAir: mesh.nAir,
    nAirZ: mesh.nAirZ, nActiveZ: mesh.nActiveZ,
    radius: p(mesh.radius * 1e3), outerRadius: p(mesh.outerRadius * 1e3),
    domainRadius: p(mesh.domainRadius * 1e3), ratio: p(mesh.domainRadius / mesh.outerRadius),
    L: p(g.L * 1e3), domainHeight: p(mesh.domainHeight * 1e3),
    stretch: p(airWidths[airWidths.length - 1] / airWidths[0], 3),
    redges: mesh.edges.map((v) => Number((v * 1e3).toFixed(4))),
    zedges: mesh.zEdges.map((v) => Number((v * 1e3).toFixed(4)))
  }
};

// The illustrative case the manuscript describes in prose, solved here so the
// plate shows a field the reader can check rather than a sketch. About 2 s.
const dc = solveThermal2D(x, calculate(x), { ...x.enclosure, nr: 30, nz: 60 }, x.material);
if (dc.errors.length) throw new Error("default case: " + dc.errors.join("; "));
DATA.defaultCase = {
  avgC: p(dc.avgK - 273.15, 6), minC: p(dc.tMin - 273.15, 6), maxC: p(dc.tMax - 273.15, 6),
  spreadK: p(dc.tMax - dc.tMin, 3),
  wallInnerC: p(dc.wallInner - 273.15, 5), wallOuterC: p(dc.wallOuter - 273.15, 5),
  heOutletC: p(dc.heOutletK - 273.15, 5),
  pBulk: p(dc.op.pBulk, 4), current: p(dc.op.current, 4), voltage: p(dc.op.voltage, 4),
  boundaryLoss: p(dc.boundaryLoss, 4), closure: dc.closure,
  outer: dc.iterations, linear: dc.linearIterations,
  channels: { ...Object.fromEntries(Object.entries(dc.lossByChannel).map(([k, v]) => [k, p(v, 4)])),
              gasEnthalpy: p(dc.heCooling, 3) },
  Tc: dc.T.map((row) => row.map((v) => Number((v - 273.15).toFixed(1))))
};

// Transient operation. The pulse is shown on the element that can follow one:
// the carbon-fibre strip of the published pulsed cross-check, whose time
// constant is about half a second against a one-second period. It is compared
// against the same strip driven continuously at the same average power, which
// is the only comparison that isolates what pulsing buys. The SiC rod of the
// default case is kept alongside to show the other regime, where the time
// constant is tens of seconds and no pulse at this rate survives.
const dcCfg = { ...x.enclosure, nr: 30, nz: 60 };
const zeroD = calculate(x);
const sicStart = solveTransient2D(x, zeroD, dcCfg, x.material,
  { dt: 2, steps: 400, record: 4, steadyTol: 1e-4 });

const PERIOD = 1, DUTY = 0.05, PDT = PERIOD / 200, PCYCLES = 8, PULSE_V = 31;
const cfpM = cfpMaterial(400), cfpEnc = cfpEnclosure();
const cfpPulseX = cfpInputs(PULSE_V, cfpM, cfpEnc), cfpPulseZ = calculate(cfpPulseX);

// Match the continuous drive to the pulsed one on average power. The pulsed
// element's resistance depends on how hot it is, which depends on the enclosure
// it is sitting in, so the match has to be taken with both already settled:
// solve the continuous steady state, start the pulse train from that field,
// measure what it actually draws, and correct the voltage until the two agree.
const pulsePlan = (steps, startField) => ({
  dt: PDT, steps, record: 2, startField,
  sourceScale: (t) => (((t - 1e-9) % PERIOD) / PERIOD < DUTY ? 1 : 0)
});
const cycleMeanPower = (run, cycles) => {
  const last = run.history.filter((h) => h.t > PERIOD * (cycles - 1));
  return last.reduce((a, h) => a + h.pBulk, 0) / last.length;
};
let volts = PULSE_V * Math.sqrt(DUTY), steady = null, drawn = null;
for (let it = 0; it < 4; it++) {
  const xc = cfpInputs(volts, cfpM, cfpEnc);
  steady = solveThermal2D(xc, calculate(xc), cfpEnc, cfpM);
  const trial = solveTransient2D(cfpPulseX, cfpPulseZ, cfpEnc, cfpM, pulsePlan(200 * 3, steady.T));
  drawn = cycleMeanPower(trial, 3);
  if (Math.abs(steady.op.pBulk - drawn) / drawn < 5e-3) break;
  volts *= Math.sqrt(drawn / steady.op.pBulk);
}
const cfpContX = cfpInputs(volts, cfpM, cfpEnc), cfpContZ = calculate(cfpContX);

// The element settles in under a second; the quartz tube around it takes
// minutes. The continuous approach is therefore shown in full, and the pulse
// train starts from its settled field so the two are compared in the same
// enclosure state rather than at two different points of a warm-up.
const cont = solveTransient2D(cfpContX, cfpContZ, cfpEnc, cfpM,
  { dt: 0.5, steps: 1200, record: 4 });
const pulse = solveTransient2D(cfpPulseX, cfpPulseZ, cfpEnc, cfpM, pulsePlan(200 * PCYCLES, steady.T));
const lastCycle = pulse.history.filter((h) => h.t > PERIOD * (PCYCLES - 1));
const meanPower = lastCycle.reduce((a, h) => a + h.pBulk, 0) / lastCycle.length;

DATA.transient = {
  period: PERIOD, duty: DUTY, pulseVolts: PULSE_V, pulseEnd: PERIOD * PCYCLES,
  meanPower: p(meanPower, 4),
  cfpTau: p(elementTimeConstant(cfpPulseZ), 3),
  contVolts: p(volts, 3),
  contPower: p(steady.op.pBulk, 4),
  contSteadyC: p(steady.avgK - 273.15, 5),
  cont: cont.history.map((h) => [Number(h.t.toFixed(2)), Number((h.avgK - 273.15).toFixed(2))]),
  pulse: pulse.history.map((h) => [Number(h.t.toFixed(3)), Number((h.avgK - 273.15).toFixed(2))]),
  peakC: p(Math.max.apply(null, lastCycle.map((h) => h.avgK)) - 273.15, 5),
  troughC: p(Math.min.apply(null, lastCycle.map((h) => h.avgK)) - 273.15, 5),
  cycleMeanC: p(lastCycle.reduce((a, h) => a + h.avgK, 0) / lastCycle.length - 273.15, 5),
  swingK: p(Math.max.apply(null, lastCycle.map((h) => h.avgK)) - Math.min.apply(null, lastCycle.map((h) => h.avgK)), 4),
  closure: pulse.worstClosure,
  sic: sicStart.history.map((h) => [Number(h.t.toFixed(2)), Number((h.avgK - 273.15).toFixed(2))]),
  sicTau: p(elementTimeConstant(zeroD), 4),
  sicSteadyC: p(sicStart.avgK - 273.15, 6),
  sicLabel: x.material.name + " rod"
};

// The range has to reach past the optimum, or the sweep reports its own edge
// as an answer. A low-resistivity metal never turns over inside it at all.
const LD_LO = 0.5, LD_HI = 512, LD_N = 60;
const LDS = [];
for (let k = 0; k <= LD_N; k++) LDS.push(Math.pow(10, Math.log10(LD_LO) + k * (Math.log10(LD_HI) - Math.log10(LD_LO)) / LD_N));
const sweep = LDS.map((ld) => {
  const r = calculate({ ...x, aspectRatio: ld });
  return { ld: Number(ld.toFixed(3)), R: p(r.resistance, 5), tssC: p(r.tss - 273.15, 5),
           power: p(r.target.power, 5), constraint: r.constraint };
}).filter((r) => Number.isFinite(r.tssC));
const best = sweep.reduce((a, c) => (c.tssC > a.tssC ? c : a), sweep[0]);
const PICKS = ["CFP", "SiC", "SiSiC (Si-infiltrated SiC)", "MoSi₂", "Kanthal A-1 (FeCrAl)", "Molybdenum"];
// The design question is not "how hot can this get" -- that answer sits above
// the material's own limit at an absurd aspect ratio. It is "what does it take
// to reach the temperature I need", so the sweep is read against a target.
const TARGET_C = 1200;

// Cross a monotonic sweep at the target and interpolate the crossing.
function crossing(values, evaluate) {
  let prev = null;
  for (const v of values) {
    const r = evaluate(v);
    if (!Number.isFinite(r.tssC)) continue;
    if (prev && ((prev.tssC - TARGET_C) * (r.tssC - TARGET_C) <= 0)) {
      const f = (TARGET_C - prev.tssC) / (r.tssC - prev.tssC);
      const at = prev.v + f * (v - prev.v);
      return { at, ...evaluate(at) };
    }
    prev = { v, ...r };
  }
  return null;
}
const span = (lo, hi, n) => Array.from({ length: n + 1 }, (_, k) => lo + k * (hi - lo) / n);
const readout = (r) => ({
  tssC: r.tss - 273.15, R: r.resistance, current: r.target.current,
  voltage: r.target.voltage, power: r.target.power, constraint: r.constraint,
  D: r.g.D * 1e3, L: r.g.L * 1e3
});

// Three shapes that reach the target, with the dimensions each one needs.
const rod = crossing(LDS, (ld) => readout(calculate({ ...x, aspectRatio: ld })));
const tube = crossing(LDS, (ld) => readout(calculate({ ...x, aspectRatio: ld, solidFraction: 0.22 })));
const strip = crossing(span(80, 4, 80), (w) =>
  readout(calculate({ ...x, shape: "box", lengthMm: 38, widthMm: w, heightMm: 1, solidFraction: 1 })));
const wall = tube ? tube.D / 2 * (1 - Math.sqrt(1 - 0.22)) : 0;
DATA.forms = [
  { form: "solid rod", vary: "L/D " + rod.at.toFixed(2),
    dims: "D " + rod.D.toFixed(1) + " mm, L " + rod.L.toFixed(1) + " mm",
    R: p(rod.R, 3), current: p(rod.current, 3), voltage: p(rod.voltage, 3),
    power: p(rod.power, 4), constraint: rod.constraint },
  { form: "tube, 22 % solid", vary: "L/D " + tube.at.toFixed(2),
    dims: "OD " + tube.D.toFixed(1) + " mm, L " + tube.L.toFixed(1) + " mm, wall " + wall.toFixed(2) + " mm",
    R: p(tube.R, 3), current: p(tube.current, 3), voltage: p(tube.voltage, 3),
    power: p(tube.power, 4), constraint: tube.constraint },
  { form: "flat strip", vary: "width " + strip.at.toFixed(1) + " mm",
    dims: "38 × " + strip.at.toFixed(1) + " × 1.0 mm",
    R: p(strip.R, 3), current: p(strip.current, 3), voltage: p(strip.voltage, 3),
    power: p(strip.power, 4), constraint: strip.constraint }
];

function reachTarget(material) {
  const curve = LDS.map((ld) => {
    const r = calculate({ ...x, material, aspectRatio: ld });
    return Number.isFinite(r.tss)
      ? { ld, tssC: r.tss - 273.15, R: r.resistance, constraint: r.constraint }
      : null;
  }).filter(Boolean);
  const peak = curve.reduce((a, c) => (c.tssC > a.tssC ? c : a), curve[0]);
  const hit = curve.find((c) => c.tssC >= TARGET_C) || null;
  return { peak, hit };
}
// A material that misses the target on the shipped supply is not out of reach.
// Ask instead what supply it wants: bisect the current at each aspect ratio and
// keep the cheapest. This is the useful answer, and unlike a reported ceiling
// it does not rest on that material's current-density preset.
const COARSE = LDS.filter((_, k) => k % 3 === 0);
function supplyFor(material) {
  let best = null;
  for (const ld of COARSE) {
    let lo = 1, hi = 5000;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2;
      const r = calculate({ ...x, material, aspectRatio: ld, imax: mid, iset: mid,
                            supplyMode: "cc", vmax: 1e6, pmax: 1e9 });
      if (!Number.isFinite(r.tss) || r.tss - 273.15 < TARGET_C) lo = mid; else hi = mid;
    }
    const r = calculate({ ...x, material, aspectRatio: ld, imax: hi, iset: hi,
                          supplyMode: "cc", vmax: 1e6, pmax: 1e9 });
    if (!Number.isFinite(r.tss)) continue;
    const jNeeded = hi / geometry({ ...x, aspectRatio: ld }).area;
    if (!best || hi < best.current) best = { current: hi, ld, voltage: r.target.voltage, power: r.target.power, jNeeded };
  }
  return best;
}
const byMaterial = PICKS.map((name) => {
  const m = MATERIALS.find((q) => q.name === name);
  const { peak, hit } = reachTarget(m);
  const want = hit ? null : supplyFor(m);
  return { name: name.replace(" (Si-infiltrated SiC)", "").replace(" (FeCrAl)", ""),
           rho: p(m.rhoOhmCm, 3), reaches: Boolean(hit),
           ld: hit ? p(hit.ld, 3) : null, R: hit ? p(hit.R, 3) : null,
           constraint: hit ? hit.constraint : peak.constraint,
           peakC: p(peak.tssC, 5), limitC: m.meltC,
           needs: want ? { current: p(want.current, 3), voltage: p(want.voltage, 3),
                           ld: p(want.ld, 3), overJmax: want.jNeeded > m.jmax } : null };
}).sort((a, c) => (Number(c.reaches) - Number(a.reaches)) ||
                  ((a.ld ?? a.needs.current) - (c.ld ?? c.needs.current)));

const meets = sweep.filter((q) => q.tssC >= TARGET_C);
DATA.screening = { sweep, best, byMaterial, targetC: TARGET_C, ldHi: LD_HI,
                   window: meets.length ? { lo: p(meets[0].ld, 3), hi: p(meets[meets.length - 1].ld, 3) } : null,
                   imax: x.imax, vmax: x.vmax, volumeCm3: x.volumeCm3,
                   limitC: x.material.meltC, limitKind: x.material.meltKind, materialName: x.material.name };

// The verification study is expensive, so it is measured by
// make-verification-data.mjs and read back here. Its absence is fatal rather
// than silently skipped: a missing measurement must not become a missing plate.
try {
  DATA.verification = JSON.parse(readFileSync(join(here, "verification-data.json"), "utf8"));
} catch {
  throw new Error("verification-data.json is missing. Run: node docs/figures/make-verification-data.mjs --levels 4");
}

// The plates, in manuscript order. The id is the file name and the anchor the
// page uses; the label is what the manuscript calls it.
const PLATES = [
  { id: "fig1",  label: "Fig. 1",  draw: workflow },
  { id: "fig2",  label: "Fig. 2",  draw: coupling },
  { id: "fig3",  label: "Fig. 3",  draw: verification },
  { id: "fig4",  label: "Fig. 4",  draw: defaultCase },
  { id: "figS5", label: "Fig. S5", draw: transient },
  { id: "figS6", label: "Fig. S6", draw: screening },
  { id: "figS1", label: "Fig. S1", draw: meshDomain },
  { id: "figS2", label: "Fig. S2", draw: matrixClasses },
  { id: "figS3", label: "Fig. S3", draw: solverLoop },
  { id: "figS4", label: "Fig. S4", draw: cylinderMapping }
];
for (const plate of PLATES) {
  const svg = plate.draw(DATA);
  if (/NaN|undefined/.test(svg)) throw new Error(plate.label + " drew a NaN or an undefined value");
  writeFileSync(join(here, plate.id + ".svg"), svg);
}
writeFileSync(join(here, "figure-data.json"), JSON.stringify(DATA, null, 1) + "\n");

// ---- assemble the page that publishes them
const read = (f) => readFileSync(join(here, f), "utf8");
const draw = read("draw.mjs").replace(/^export function /gm, "function ");
const figMap = "const FIGS = {" + PLATES.map((p) => p.id + ": " + p.draw.name).join(", ") + "};\n";
const page = (read("templates/head.html") + read("templates/body.html")).replaceAll("{{COMMIT}}", COMMIT) +
  "<script>\nconst DATA = Object.freeze(" + JSON.stringify(DATA) + ");\n" +
  draw + figMap + read("templates/wiring.js") + "</" + "script>\n";
writeFileSync(join(here, "index.html"), page);

console.log("wrote " + PLATES.map((p) => p.id).join(", ") + " and index.html at solver commit " + COMMIT);
console.log("  strip surface  " + DATA.strip.surface + " cm2 full box, " + DATA.strip.surface2f + " cm2 two faces");
console.log("  equivalent D   " + DATA.cyl.D + " mm, resistance " + DATA.strip.R + " = " + DATA.cyl.R + " ohm");
console.log("  default mesh   " + DATA.mesh.nr + " x " + DATA.mesh.nz +
  " (" + [DATA.mesh.nElement, DATA.mesh.nGap, DATA.mesh.nWall, DATA.mesh.nAir].join("/") + " radial)");
