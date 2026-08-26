// Artwork for the RPH vs CJH Application Note. Shares the drawing kit and the
// role palette with the Joule note, so the two sets read as one system.
import { C, TINT, SHADE, shadeOf, tintOf, rich as T, rect, line, defs, arrow, svgDoc } from "../figures/kit.mjs";

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

/* ------------------------------------------------------------------ */
/* Fig. 4. The window: what closes it from below, and what closes it   */
/* from above, with the control that removes the effect entirely.      */
/* ------------------------------------------------------------------ */
export function window_(DATA) {
  const ns = "r4", W = 505, H = 250;
  const S = DATA.sweep, K = DATA.control;
  let b = defs(ns);
  const pw = 190, ph = 160, ptop = 30, pbot = 190;
  const COL = [58, 300];
  const pLo = lg(S[0].period / 1.4), pHi = lg(S[S.length - 1].period * 1.4);

  function frame(x0, letter, yLabel) {
    const X = (v) => lin(lg(v), pLo, pHi, x0 + 12, x0 + pw - 12);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, letter, { size: 11, weight: "bold" });
    [0.02, 0.2, 2, 20].forEach(function (v) {
      o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "pulse period (s)", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 25) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 25) + ' ' + ((ptop + pbot) / 2) + ')">' + yLabel + '</text>';
    return { o, X };
  }
  const path = (X, Y, rows, key, colour, wdt, dash) => {
    let d = "";
    rows.forEach(function (r, i) { d += (i ? " L" : "M") + X(r.period) + "," + Y(r[key]); });
    return '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + (wdt || 1.5) +
      '"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") + '/>';
  };

  /* a. the yield gain against a continuous run at the same conversion */
  (function () {
    const gains = S.map((r) => r.B / r.cjhB).concat(K.map((r) => r.B / r.cjhB));
    const hi = Math.ceil(Math.max.apply(null, gains) * 10) / 10;
    const P = frame(COL[0], "a", "B yield, pulsed / continuous");
    const Y = (v) => lin(v, 0, hi, pbot - 10, ptop + 10);
    let o = P.o;
    for (let t = 0; t <= hi + 1e-9; t += hi / 4) {
      o += line(COL[0], Y(t), COL[0] + pw, Y(t), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(COL[0] - 4, Y(t) + 3, t.toFixed(1), { size: 8, anchor: "end", fill: C.grey });
    }
    o += line(COL[0], Y(1), COL[0] + pw, Y(1), { stroke: C.ink, sw: 0.9, dash: "3 2" });
    o += T(COL[0] + 6, Y(1) - 5, "no benefit", { size: 8, fill: C.grey });
    o += path(P.X, Y, K.map((r) => ({ period: r.period, g: r.B / r.cjhB })), "g", C.grey, 1.2, "3 2");
    o += path(P.X, Y, S.map((r) => ({ period: r.period, g: r.B / r.cjhB })), "g", C.thermal, 1.6);
    /* the control has to name itself, or it is an unexplained grey curve */
    o += line(COL[0] + 8, pbot - 30, COL[0] + 24, pbot - 30, { stroke: C.thermal, sw: 1.6 });
    o += T(COL[0] + 28, pbot - 27, "network as modelled", { size: 8, fill: SHADE.thermal });
    o += line(COL[0] + 8, pbot - 18, COL[0] + 24, pbot - 18, { stroke: C.grey, sw: 1.2, dash: "3 2" });
    o += T(COL[0] + 28, pbot - 15, "control, E_{a1} = E_{a2}", { size: 8, fill: C.grey });
    const best = S.reduce((a, r) => (r.B / r.cjhB > a.B / a.cjhB ? r : a));
    o += line(P.X(best.period), Y(best.B / best.cjhB), P.X(best.period), pbot - 10, { stroke: C.thermal, sw: 0.7, dash: "2 2" });
    o += T(P.X(best.period) + 4, Y(best.B / best.cjhB) - 6, "best at " + best.period + " s", { size: 8.5, weight: "bold", fill: SHADE.thermal });
    b += o;
  })();

  /* b. why it closes: the swing the element can produce at that period */
  (function () {
    const hi = Math.ceil(Math.max.apply(null, S.map((r) => r.tPeak)) / 500) * 500;
    const P = frame(COL[1], "b", "element temperature (°C)");
    const Y = (v) => lin(v, 0, hi, pbot - 10, ptop + 10);
    let o = P.o;
    for (let t = 0; t <= hi; t += hi / 4) {
      o += line(COL[1], Y(t), COL[1] + pw, Y(t), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(COL[1] - 4, Y(t) + 3, String(Math.round(t)), { size: 8, anchor: "end", fill: C.grey });
    }
    o += path(P.X, Y, S, "tPeak", C.thermal, 1.6);
    o += path(P.X, Y, S, "tMin", C.scalar, 1.6);
    o += path(P.X, Y, S, "tAvg", C.grey, 1, "3 2");
    o += T(COL[1] + pw - 6, Y(S[S.length - 1].tPeak) - 6, "peak", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.thermal });
    o += T(COL[1] + pw - 6, Y(S[S.length - 1].tMin) + 11, "minimum", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.scalar });
    o += T(COL[1] + 8, Y(S[0].tAvg) - 6, "time average", { size: 8, fill: C.grey });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 5. Where the two-step network comes from: the effective        */
/* activation energy two detailed mechanisms report, and the steady    */
/* PFR states a pulse blends between.                                  */
/* ------------------------------------------------------------------ */
export function detailed(DATA) {
  const ns = "r5", W = 505, H = 250;
  const D = DATA.detailed, K = DATA.kinetics;
  let b = defs(ns);
  const pw = 190, ph = 160, ptop = 30, pbot = 190;
  const COL = [66, 300];
  const tLo = D.tGrid[0], tHi = D.tGrid[D.tGrid.length - 1];

  /* a. the lumped activation energy the detailed chemistry actually has */
  (function () {
    const x0 = COL[0];
    const all = D.mechanisms.flatMap((m) => m.k).filter((v) => v > 0);
    const dLo = Math.floor(lg(Math.min.apply(null, all))), dHi = Math.ceil(lg(Math.max.apply(null, all)));
    const X = (v) => lin(v, tLo, tHi, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(lg(v), dHi, dLo, ptop + 10, pbot - 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "a", { size: 11, weight: "bold" });
    for (let d = dLo; d <= dHi; d += 6) {
      o += line(x0, Y(Math.pow(10, d)), x0 + pw, Y(Math.pow(10, d)), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(Math.pow(10, d)) + 3, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "end", fill: C.grey });
    }
    [400, 700, 1000, 1400].forEach(function (v) {
      o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "temperature (°C)", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 33) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 33) + ' ' + ((ptop + pbot) / 2) + ')">effective rate constant (s⁻¹)</text>';

    /* the window the slope is fitted over */
    o += '<rect x="' + X(D.eaWindow[0]) + '" y="' + (ptop + 1) + '" width="' + (X(D.eaWindow[1]) - X(D.eaWindow[0])) +
      '" height="' + (ph - 2) + '" fill="#F0F0F0"/>';
    o += T((X(D.eaWindow[0]) + X(D.eaWindow[1])) / 2, ptop + 12, "fit window", { size: 8, anchor: "middle", fill: C.grey });

    D.mechanisms.forEach(function (m, i) {
      let d = "";
      D.tGrid.forEach(function (t, j) { d += (j ? " L" : "M") + X(t) + "," + Y(m.k[j]); });
      o += '<path d="' + d + '" fill="none" stroke="' + (i ? C.scalar : C.thermal) + '" stroke-width="' + (i ? 1.2 : 1.6) +
        '"' + (i ? ' stroke-dasharray="3 2"' : "") + '/>';
      o += line(x0 + 10, pbot - 40 + i * 12, x0 + 26, pbot - 40 + i * 12,
        { stroke: i ? C.scalar : C.thermal, sw: i ? 1.2 : 1.6, dash: i ? "3 2" : "" });
      o += T(x0 + 30, pbot - 37 + i * 12, m.name + ",  E_{a} " + m.ea.toFixed(0) + " kJ/mol",
        { size: 8, fill: i ? SHADE.scalar : SHADE.thermal });
    });
    o += T(x0 + 10, pbot - 14, "the two-step model uses E_{a1} " + K.ea1 + " kJ/mol", { size: 8, weight: "bold" });
    b += o;
  })();

  /* b. the steady states a slow pulse blends between */
  (function () {
    const x0 = COL[1], P = D.pfr;
    const cs = P.cases.filter((c) => c.TC >= 800);
    const X = (v) => lin(v, cs[0].TC, cs[cs.length - 1].TC, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(v, 0, 1, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "b", { size: 11, weight: "bold" });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      o += line(x0, Y(t), x0 + pw, Y(t), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(t) + 3, (100 * t).toFixed(0), { size: 8, anchor: "end", fill: C.grey });
    });
    [800, 1000, 1200, 1400].forEach(function (v) {
      o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "element temperature (°C)", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 25) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 25) + ' ' + ((ptop + pbot) / 2) + ')">per cent</text>';

    [["S", C.scalar, "C₂ selectivity"], ["X", C.thermal, "CH₄ conversion"]].forEach(function (spec) {
      let d = "";
      cs.forEach(function (c, j) { d += (j ? " L" : "M") + X(c.TC) + "," + Y(c[spec[0]]); });
      o += '<path d="' + d + '" fill="none" stroke="' + spec[1] + '" stroke-width="1.6"/>';
    });
    o += T(x0 + 14, Y(0.93) + 12, "C₂ selectivity", { size: 8.5, weight: "bold", fill: SHADE.scalar });
    o += T(x0 + pw - 8, Y(0.62) - 6, "CH₄ conversion", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.thermal });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 1. What the browser tool computes, and what passes between the */
/* stages. Tab names are those of the application at the stamped       */
/* revision.                                                           */
/* ------------------------------------------------------------------ */
export function workflow(DATA) {
  const ns = "r1", W = 505, H = 274;
  let b = defs(ns);
  const stages = [
    { c: C.scalar, tab: "When Pulsing Helps",
      set: ["activation energy", "transport exponent β", "duty and the two states", "ramp fraction"],
      out: ["⟨k⟩ against k(⟨T⟩)", "⟨h⟩, ⟨u⟩ the same way", "the ratios ⟨k/h⟩, ⟨k/u⟩", "is the gain real"],
      hand: ["duty and swing", "worth trying"] },
    { c: C.thermal, tab: "Kinetic Effect",
      set: ["voltage, period, duty", "element and enclosure", "ambient and purge gas"],
      out: ["the cycle it runs", "peak, minimum, average", "average electrical power", "per-cycle closure"],
      hand: ["T(t) at periodic", "steady state"] },
    { c: C.gas, tab: "A → B → C",
      set: ["two activation energies", "two rate constants", "residence time", "the CJH matching basis"],
      out: ["periodic x_{A}, x_{B}", "conversion and B yield", "selectivity", "the continuous baseline"] }
  ];
  /* the hand-off labels live between the panels, so the gaps have to be
     wide enough to hold them; 64 pt of gap leaves 113 pt of panel */
  const pw = 113, px = [18, 195, 372], py = 34, ph = 180;
  stages.forEach(function (st, i) {
    const x = px[i];
    b += rect(x, py, pw, ph, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
    b += '<rect x="' + x + '" y="' + py + '" width="' + pw + '" height="22" fill="' + tintOf(st.c) + '"/>';
    b += line(x, py + 22, x + pw, py + 22, { stroke: st.c, sw: 1 });
    b += T(x + pw / 2, py + 15, st.tab, { size: 10, weight: "bold", anchor: "middle", fill: shadeOf(st.c) });
    b += T(x + 8, py + 38, "SETTING", { size: 8, weight: "bold", fill: C.grey });
    st.set.forEach(function (t, k) { b += T(x + 8, py + 50 + k * 11, t, { size: 8.5 }); });
    b += line(x + 8, py + 98, x + pw - 8, py + 98, { stroke: "#E8E8E8", sw: 0.6 });
    b += T(x + 8, py + 112, "RETURNS", { size: 8, weight: "bold", fill: C.grey });
    st.out.forEach(function (t, k) { b += T(x + 8, py + 124 + k * 11, t, { size: 8.5 }); });
    if (st.hand) {
      const mid = (x + pw + px[i + 1]) / 2;
      b += arrow(ns, "M" + (x + pw + 2) + "," + (py + ph / 2) + " L" + (px[i + 1] - 2) + "," + (py + ph / 2),
        { color: Object.keys(C).find((k) => C[k] === st.c), sw: 1 });
      b += T(mid, py + ph / 2 - 14, st.hand[0], { size: 8, anchor: "middle", fill: C.grey });
      b += T(mid, py + ph / 2 - 4, st.hand[1], { size: 8, anchor: "middle", fill: C.grey });
    }
  });
  b += rect(18, 226, 469, 40, { stroke: C.hair, fill: TINT.panel, sw: 0.8, dash: "3 2" });
  b += T(28, 240, "SUPPORTING TABS", { size: 8, weight: "bold", fill: C.grey });
  [["OpenMKM PFR", "a detailed mechanism, same states"],
   ["Calculations", "every equation the page evaluates"],
   ["How to Cite", "the paper this tool accompanies"]].forEach(function (t, i) {
    const x = 28 + i * 155;
    b += T(x, 254, t[0], { size: 8.5, weight: "bold", fill: SHADE.grey });
    b += T(x, 264, t[1], { size: 8, fill: C.grey });
  });
  return svgDoc(W, H, b);
}
