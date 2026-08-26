// Artwork for the RPH vs CJH Application Note. Shares the drawing kit and the
// role palette with the Joule note, so the two sets read as one system.
import { C, TINT, SHADE, shadeOf, rich as T, rect, line, defs, arrow, svgDoc } from "../figures/kit.mjs";

const lin = (v, lo, hi, a, c) => a + (v - lo) / (hi - lo) * (c - a);
const lg = (v) => Math.log10(v);

/* ------------------------------------------------------------------ */
/* Fig. 2. The drive the element actually delivers, and the two rate   */
/* constants it swings between.                                        */
/* ------------------------------------------------------------------ */
export function drive(DATA) {
  const ns = "r2", W = 505, H = 250;
  const D = DATA.drive, K = DATA.kinetics;
  let b = defs(ns);
  const pw = 190, ph = 160, ptop = 30, pbot = 190;
  const COL = [58, 300];

  /* a. one cycle of the element temperature */
  (function () {
    const x0 = COL[0];
    const yHi = Math.ceil(D.tPeak / 250) * 250;
    const X = (v) => lin(v, 0, 1, x0 + 10, x0 + pw - 10);
    const Y = (v) => lin(v, 0, yHi, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "a", { size: 11, weight: "bold" });
    for (let t = 0; t <= yHi; t += yHi / 4) {
      o += line(x0, Y(t), x0 + pw, Y(t), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(t) + 3, String(Math.round(t)), { size: 8, anchor: "end", fill: C.grey });
    }
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      o += T(X(v), pbot + 12, v.toFixed(2), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "cycle phase", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 25) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 25) + ' ' + ((ptop + pbot) / 2) + ')">element temperature (°C)</text>';

    /* the on-phase, which is where all the electrical energy goes in */
    o += '<rect x="' + X(0) + '" y="' + (ptop + 1) + '" width="' + (X(D.duty) - X(0)) +
      '" height="' + (ph - 2) + '" fill="' + TINT.scalar + '"/>';
    o += T(X(D.duty) + 4, pbot - 8, "on, " + (D.duty * 100).toFixed(0) + " %", { size: 8, fill: SHADE.scalar });

    o += line(x0, Y(D.tAvg), x0 + pw, Y(D.tAvg), { stroke: C.grey, sw: 0.9, dash: "3 2" });
    o += T(x0 + pw - 6, Y(D.tAvg) - 5, "time average " + D.tAvg.toFixed(0) + " °C", { size: 8, anchor: "end", fill: C.grey });
    let d = "";
    D.samples.forEach(function (s, i) { d += (i ? " L" : "M") + X(s[0]) + "," + Y(s[1]); });
    o += '<path d="' + d + '" fill="none" stroke="' + C.thermal + '" stroke-width="1.5"/>';
    o += T(x0 + 6, Y(D.tPeak) - 5, "peak " + D.tPeak.toFixed(0) + " °C", { size: 8.5, weight: "bold", fill: SHADE.thermal });
    o += T(x0 + pw - 6, Y(D.tMin) + 11, "min " + D.tMin.toFixed(0) + " °C", { size: 8, anchor: "end", fill: C.grey });
    b += o;
  })();

  /* b. the two rate constants over the swing the drive produces */
  (function () {
    const x0 = COL[1];
    const all = K.grid.flatMap((g) => [g.k1, g.k2]).filter((v) => v > 0);
    const dLo = Math.floor(lg(Math.min.apply(null, all))), dHi = Math.ceil(lg(Math.max.apply(null, all)));
    const tLo = K.grid[0].TC, tHi = K.grid[K.grid.length - 1].TC;
    const X = (v) => lin(v, tLo, tHi, x0 + 10, x0 + pw - 10);
    const Y = (v) => lin(lg(v), dHi, dLo, ptop + 10, pbot - 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "b", { size: 11, weight: "bold" });
    for (let d = dLo; d <= dHi; d += 4) {
      o += line(x0, Y(Math.pow(10, d)), x0 + pw, Y(Math.pow(10, d)), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(Math.pow(10, d)) + 3, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "end", fill: C.grey });
    }
    [600, 900, 1200, 1500].forEach(function (v) {
      o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "temperature (°C)", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 25) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 25) + ' ' + ((ptop + pbot) / 2) + ')">rate constant (s⁻¹)</text>';

    /* the band the pulse actually visits */
    o += '<rect x="' + X(D.tMin) + '" y="' + (ptop + 1) + '" width="' + (X(D.tPeak) - X(D.tMin)) +
      '" height="' + (ph - 2) + '" fill="#F0F0F0"/>';
    o += T((X(D.tMin) + X(D.tPeak)) / 2, pbot - 6, "the swing", { size: 8, anchor: "middle", fill: C.grey });

    ["k1", "k2"].forEach(function (key, i) {
      let d = "";
      K.grid.forEach(function (g, j) { d += (j ? " L" : "M") + X(g.TC) + "," + Y(g[key]); });
      o += '<path d="' + d + '" fill="none" stroke="' + (i ? C.scalar : C.thermal) + '" stroke-width="1.5"/>';
    });
    o += T(x0 + 14, ptop + 16, "k₁  A → B,  E_{a} " + K.ea1 + " kJ/mol", { size: 8.5, weight: "bold", fill: SHADE.thermal });
    o += T(x0 + 14, ptop + 28, "k₂  B → C,  E_{a} " + K.ea2 + " kJ/mol", { size: 8.5, weight: "bold", fill: SHADE.scalar });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 3. What the pulsed run is compared against, and why the basis  */
/* decides the answer.                                                 */
/* ------------------------------------------------------------------ */
export function comparison(DATA) {
  const ns = "r3", W = 505, H = 216;
  const R = DATA.compare.rph, CJ = DATA.compare.cjh;
  let b = defs(ns);
  const LX = 22, TX = 252, XX = 312, BX = 374, SX = 448, EX = 488;

  b += T(LX, 22, "COMPARED AGAINST", { size: 8, weight: "bold", fill: C.grey });
  b += T(TX, 22, "CJH T", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
  b += T(XX, 22, "CONVERSION", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
  b += T(BX, 22, "B YIELD", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
  b += T(SX, 22, "SELECTIVITY", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
  b += line(LX, 27, EX, 27, { stroke: C.ink, sw: 0.9 });

  const pct = (v) => (100 * v).toFixed(2) + " %";
  let y = 44;
  b += T(LX, y, "Pulsed, " + DATA.drive.voltage + " V, " + DATA.drive.period + " s, " +
    (DATA.drive.duty * 100).toFixed(0) + " % duty", { size: 9, weight: "bold", fill: SHADE.thermal });
  b += T(TX, y, DATA.drive.tMin.toFixed(0) + " to " + DATA.drive.tPeak.toFixed(0), { size: 8.5, anchor: "end", fill: C.grey });
  b += T(XX, y, pct(R.X), { size: 8.5, anchor: "end" });
  b += T(BX, y, pct(R.B), { size: 8.5, anchor: "end", weight: "bold", fill: SHADE.thermal });
  b += T(SX, y, pct(R.S), { size: 8.5, anchor: "end", weight: "bold", fill: SHADE.thermal });
  y += 18;

  CJ.forEach(function (r, i) {
    const fair = i === CJ.length - 1;
    b += line(LX, y - 11, EX, y - 11, { stroke: "#EAEAEA", sw: 0.5 });
    b += T(LX, y, "Continuous, " + r.basis, { size: 9, fill: fair ? C.ink : C.faint });
    b += T(TX, y, r.TC.toFixed(0), { size: 8.5, anchor: "end", fill: fair ? C.grey : C.faint });
    b += T(XX, y, pct(r.X), { size: 8.5, anchor: "end", fill: fair ? C.ink : C.faint });
    b += T(BX, y, pct(r.B), { size: 8.5, anchor: "end", fill: fair ? C.ink : C.faint });
    b += T(SX, y, pct(r.S), { size: 8.5, anchor: "end", fill: fair ? C.ink : C.faint });
    y += 18;
  });

  b += line(LX, y - 11, EX, y - 11, { stroke: C.ink, sw: 0.9 });
  const isoB = CJ[CJ.length - 1].B, isoS = CJ[CJ.length - 1].S;
  b += T(LX, y + 4, "At equal conversion the pulsed run keeps " +
    (100 * (R.B / isoB - 1)).toFixed(0) + " % more B", { size: 8.5, weight: "bold" });
  b += T(EX, y + 4, "+" + (100 * (R.S - isoS)).toFixed(1) + " points of selectivity",
    { size: 8.5, weight: "bold", anchor: "end" });
  return svgDoc(W, H, b);
}
