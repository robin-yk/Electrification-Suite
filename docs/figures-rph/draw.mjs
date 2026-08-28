// Artwork for the RPH vs CJH Application Note. Shares the drawing kit and the
// role palette with the Joule note, so the two sets read as one system.
import { C, TINT, SHADE, shadeOf, tintOf, rich as T, rect, line, defs, arrow, svgDoc } from "../figures/kit.mjs";

const lin = (v, lo, hi, a, c) => a + (v - lo) / (hi - lo) * (c - a);
const lg = (v) => Math.log10(v);

/* ------------------------------------------------------------------ */
/* drive(). The drive the element actually delivers, and the two rate  */
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
/* comparison(). What the pulsed run is compared against, and why the basis  */
/* decides the answer.                                                 */
/* ------------------------------------------------------------------ */
export function comparison(DATA, L) {
  L = L || [""];
  const ns = "r3", W = 505, H = 216;
  const R = DATA.compare.rph, CJ = DATA.compare.cjh;
  let b = defs(ns);
  const LX = 22, TX = 252, XX = 312, BX = 374, SX = 448, EX = 488;

  if (L[0]) b += T(LX - 22, 22, L[0], { size: 11, weight: "bold" });
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
/* window_(). The window: what closes it from below, and what closes it  */
/* from above, with the control that removes the effect entirely.      */
/* ------------------------------------------------------------------ */
export function window_(DATA, L) {
  L = L || ["a", "b"];
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
    const P = frame(COL[0], L[0], "B yield, pulsed / continuous");
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
    const P = frame(COL[1], L[1], "element temperature (°C)");
    const Y = (v) => lin(v, 0, hi, pbot - 10, ptop + 10);
    let o = P.o;
    /* the element ODE carries no melting, sublimation or oxidation limit, so it
       will report a peak of any size. Shade the band above the cap the campaign
       screens against, so the long-period decline is not read as a design
       window. Drawn before the grid so the rules stay visible through it. */
    const cap = DATA.space.cap;
    if (cap < hi) {
      o += rect(COL[1], Y(hi), pw, Y(cap) - Y(hi), { fill: TINT.thermal, stroke: "none", sw: 0, rx: 0 });
      o += line(COL[1], Y(cap), COL[1] + pw, Y(cap), { stroke: C.thermal, sw: 0.8, dash: "3 2" });
      o += T(COL[1] + 6, Y(cap) - 5, "outside material-property range", { size: 8, fill: SHADE.thermal });
    }
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
/* detailed(). Where the two-step network comes from: the effective    */
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

    /* selectivity is only drawn where there is enough conversion for it to
       mean anything; below that it is a ratio of vanishing mole fractions */
    const useful = cs.filter((c) => c.meaningful);
    const cut = useful[0].TC;
    o += '<rect x="' + X(cs[0].TC) + '" y="' + (ptop + 1) + '" width="' + (X(cut) - X(cs[0].TC)) +
      '" height="' + (ph - 2) + '" fill="#F4F4F4"/>';
    o += T(x0 + 16, pbot - 32, "below 0.1 % conversion,", { size: 8, fill: C.grey });
    o += T(x0 + 16, pbot - 22, "selectivity not drawn", { size: 8, fill: C.grey });
    [[cs, "X", C.thermal], [useful, "S", C.scalar], [cs, "XCO2", C.gas]].forEach(function (spec) {
      let d = "";
      spec[0].forEach(function (c, j) { d += (j ? " L" : "M") + X(c.TC) + "," + Y(c[spec[1]]); });
      o += '<path d="' + d + '" fill="none" stroke="' + spec[2] + '" stroke-width="1.6"/>';
    });
    const last = cs[cs.length - 1];
    /* at the right edge the selectivity and the conversion curves nearly meet,
       so the selectivity names itself at the left of its drawn segment, where
       it is flat and alone */
    o += T(X(cut) + 4, Y(useful[0].S) + 12, "C₂ selectivity", { size: 8.5, weight: "bold", fill: SHADE.scalar });
    o += T(x0 + pw - 8, Y(last.X) + 12, "CH₄ conversion", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.thermal });
    o += T(x0 + pw - 8, Y(last.XCO2) + 12, "CO₂ conversion", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.gas });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* workflow(). The two model layers the application carries, and what each  */
/* one is for. Tab names are those of the application at the stamped    */
/* revision.                                                            */
/* ------------------------------------------------------------------ */
export function workflow(DATA) {
  const ns = "r1", W = 505, H = 314;
  const E = DATA.gp;
  let b = defs(ns);

  const lane = (y, h, hue, kicker, question, tabs, note) => {
    let o = rect(18, y, 469, h, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
    o += '<rect x="18" y="' + y + '" width="469" height="20" fill="' + tintOf(hue) + '"/>';
    o += line(18, y + 20, 487, y + 20, { stroke: hue, sw: 1 });
    o += T(28, y + 14, kicker, { size: 9, weight: "bold", fill: shadeOf(hue) });
    o += T(477, y + 14, question, { size: 8.5, anchor: "end", fill: C.grey });
    tabs.forEach(function (t, i) {
      const x = 30 + i * 228;
      o += rect(x, y + 30, 214, h - 58, { stroke: C.hair, fill: TINT.panel, sw: 0.7, dash: "" });
      /* the scientific name leads; the application's tab name is kept because
         a reader reproducing this needs to find the control, but it is set
         small and grey so it does not compete with what the layer computes */
      o += T(x + 8, y + 44, t.title, { size: 9, weight: "bold", fill: shadeOf(hue) });
      o += T(x + 206, y + 44, t.tab, { size: 8, anchor: "end", fill: C.grey });
      t.does.forEach(function (d, k) {
        o += T(x + 8, y + 57 + k * 10, d, { size: 8, fill: C.grey });
      });
    });
    o += T(28, y + h - 10, note, { size: 8, fill: C.grey });
    return o;
  };

  /* The predictor leads. It is the layer the paper's result comes from; the
     two-step network is the interpretation and is drawn shorter, in neutral
     grey, so the plate does not imply the toy carries the contribution. */
  b += lane(20, 118, C.thermal, "THE DETAILED-CHEMISTRY PREDICTOR",
    "how much methane actually converts", [
    { title: "Conversion prediction", tab: "Kinetic Effect",
      does: ["voltage, period, duty, residence time",
        "CJH conversion from the steady map", "RPH conversion from map plus correction"] },
    { title: "Provenance of the model", tab: "How RPH Is Predicted",
      does: ["the map, the transients, the frozen model",
        "the independent test and its criteria", "the domain outside which nothing is reported"] }
  ], "GRI-Mech 3.0 on a fixed feed. Conversion only: no selectivity is predicted here, because none was validated.");

  b += lane(154, 100, C.grey, "THE TWO-STEP NETWORK, INTERPRETIVE ONLY",
    "why pulsing can help at all", [
    { title: "Ideal rate averaging", tab: "When Pulsing Helps",
      does: ["one activation energy and a duty", "compares ⟨k⟩ against k(⟨T⟩)"] },
    { title: "Two-step network", tab: "A → B → C",
      does: ["two steps with different activation energies", "intermediate yield at equal conversion"] }
  ], "Arbitrary kinetics: the yields are not a claim about any real chemistry.");

  b += line(252, 138, 252, 154, { stroke: C.hair, sw: 0.8, dash: "2 2" });
  b += T(258, 150, "both layers drive off the same element T(t)", { size: 8, fill: C.grey });

  b += rect(18, 264, 469, 28, { stroke: C.hair, fill: TINT.grey, sw: 0.8, dash: "3 2" });
  b += T(28, 281, "SUPPORTING", { size: 8, weight: "bold", fill: C.grey });
  [["Calculations", "every equation the page evaluates"],
   ["How to Cite", "the paper this tool accompanies"]].forEach(function (t, i) {
    const x = 120 + i * 190;
    b += T(x, 276, t[0], { size: 8.5, weight: "bold", fill: SHADE.grey });
    b += T(x, 286, t[1], { size: 8, fill: C.grey });
  });
  b += T(18, 308, "Every tab calls apps/rphcjh/solver.js, and the predictor adds apps/rphcjh/surrogate.js, so the browser and the tests run identical code.",
    { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* verification(). What each part of the solver is checked against. The split  */
/* is between what is integrated and what is exact by construction.    */
/* ------------------------------------------------------------------ */
export function verification(DATA) {
  /* One logarithmic axis, not a table. The point of this plate is that the
     residuals fall into two populations twelve decades apart: what a finite
     step limits, and what floating-point arithmetic limits. A column of
     numbers makes a reader compare exponents; an axis shows it. */
  const ns = "rs1", W = 505, H = 258;
  const V = DATA.verify, cap = DATA.space.cap;
  let b = defs(ns);
  const LX = 22, x0 = 200, pw = 285, ptop = 34, pbot = 214;
  const sci = (v) => {
    if (v === 0) return "0";
    const e = Math.floor(lg(Math.abs(v)));
    return (v / Math.pow(10, e)).toFixed(1) + " × 10^{" + String(e).replace("-", "−") + "}";
  };

  const rows = [];
  const push = (group, q, n, worst, unit, note) =>
    rows.push({ group, q, n, worst, unit, note });
  V.integrated.forEach((r) => push("step", r.q, r.n, r.worst, r.unit, r.against));
  V.exact.forEach((r) => push("exact", r.q, r.n, r.worst, r.unit, r.against));
  V.stiff.forEach((r) => push("stiff",
    r.volts + " V drive, peak " + r.tPeak.toFixed(0) + " °C", 1, r.drift, "drift over a cycle",
    "k₁ at the peak reaches " + sci(r.k1) + " s⁻¹", r.tPeak > cap));
  V.stiff.forEach((r, i) => { rows[rows.length - V.stiff.length + i].beyond = r.tPeak > cap; });

  const worsts = rows.map((r) => r.worst).filter((v) => v > 0);
  const dLo = Math.floor(lg(Math.min.apply(null, worsts))) - 1;
  const dHi = Math.ceil(lg(Math.max.apply(null, worsts))) + 1;
  const X = (v) => lin(lg(v), dLo, dHi, x0 + 10, x0 + pw - 10);

  b += rect(x0, ptop, pw, pbot - ptop, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
  for (let d = dLo; d <= dHi; d += 4) {
    b += line(X(Math.pow(10, d)), ptop, X(Math.pow(10, d)), pbot, { stroke: "#EAEAEA", sw: 0.4 });
    b += T(X(Math.pow(10, d)), pbot + 12, "10^{" + String(d).replace("-", "−") + "}",
      { size: 8, anchor: "middle", fill: C.grey });
  }
  b += T(x0 + pw / 2, pbot + 25, "worst residual", { size: 8.5, anchor: "middle" });

  /* the two populations, named where they sit rather than in a legend */
  const GROUPS = [
    { key: "step", title: "Integrated with a finite step", note: "the step sets the floor" },
    { key: "exact", title: "Exact by construction", note: "the arithmetic sets the floor" },
    { key: "stiff", title: "Periodic under stress", note: "the fixed point returns to itself" }
  ];
  let y = ptop + 16;
  GROUPS.forEach(function (g, gi) {
    if (gi) { b += line(LX, y - 12, x0 + pw, y - 12, { stroke: C.rule, sw: 0.5 }); }
    b += T(LX, y, g.title.toUpperCase(), { size: 8, weight: "bold", fill: SHADE.grey });
    b += T(LX, y + 10, g.note, { size: 8, fill: C.grey });
    let ry = y;
    rows.filter((r) => r.group === g.key).forEach(function (r) {
      /* the case count rides on the label; a column of its own left no room
         for the longest check name before the axis begins */
      b += T(LX + 8, ry + 22, r.q + "  (" + r.n + ")", { size: 8.5 });
      const cx = X(r.worst), cy = ry + 19;
      b += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy + '" r="3"' +
        (r.beyond ? ' fill="none" stroke="' + C.thermal + '" stroke-width="1.2"' : ' fill="' + C.thermal + '"') + '/>';
      /* the two step-limited residuals sit near the right edge, so their value
         is set inside the marker rather than off the sheet */
      const right = cx > x0 + pw - 62;
      b += T(cx + (right ? -6 : 6), cy + 3, sci(r.worst),
        { size: 8, fill: C.grey, anchor: right ? "end" : "start" });
      ry += 15;
    });
    y = ry + 20;
  });

  /* the legend sits in the panel's empty upper left, where no residual falls */
  b += '<circle cx="' + (x0 + 16) + '" cy="' + (ptop + 12) + '" r="3" fill="none" stroke="' +
    C.thermal + '" stroke-width="1.2"/>';
  b += T(x0 + 24, ptop + 15, "peak above " + cap + " °C: a numerical test,", { size: 8, fill: C.grey });
  b += T(x0 + 24, ptop + 25, "not an operating condition", { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* boundaries(). Where each layer of the model stops. Read left to right:  */
/* what is solved, on what assumption, and what that forbids.          */
/* ------------------------------------------------------------------ */
export function boundaries(DATA) {
  /* A schematic, not a table of prose. The scope of this model is a statement
     about a physical arrangement: one temperature for the element, an ideal
     stirred volume around it, coupling in one direction only, and a detailed
     calculation that sits beside the loop rather than inside it. Drawing that
     arrangement says in one look what three columns of sentences said in
     twelve lines, and the exclusions become labels on the parts they exclude. */
  const ns = "rs2", W = 505, H = 406;
  let b = defs(ns);
  const LX = 22;

  b += T(LX, 22, "a", { size: 11, weight: "bold" });
  b += T(LX + 16, 22, "THE MODELLED ARRANGEMENT", { size: 8, weight: "bold", fill: C.grey });

  /* ---- a. the reacting volume, with the element inside it ---- */
  const rx = 70, ry = 44, rw = 228, rh = 100;
  b += rect(rx, ry, rw, rh, { stroke: C.gas, fill: tintOf(C.gas), sw: 1, rx: 4 });
  b += T(rx + 10, ry + 16, "IDEAL CSTR, CONSTANT PRESSURE", { size: 8, weight: "bold", fill: shadeOf(C.gas) });
  b += T(rx + 10, ry + 28, "A → B → C, first order in both steps", { size: 8.5, fill: C.ink });

  const ex = rx + 26, ey = ry + 58, ew = rw - 52, eh = 26;
  b += rect(ex, ey, ew, eh, { stroke: C.thermal, fill: tintOf(C.thermal), sw: 1, rx: 2 });
  b += T(ex + ew / 2, ey + 11, "ELEMENT, ONE TEMPERATURE", { size: 8, weight: "bold", anchor: "middle", fill: shadeOf(C.thermal) });
  b += T(ex + ew / 2, ey + 21, "m c_{p}(T) dT/dt = V²/R(T) − losses(T)", { size: 8, anchor: "middle", fill: C.ink });

  /* one-way coupling, and the return path that is not modelled */
  b += arrow(ns, "M" + (ex + ew / 2 - 40) + "," + (ey - 3) + " L" + (ex + ew / 2 - 40) + "," + (ry + 36),
    { color: "thermal" });
  b += T(ex + ew / 2 - 34, ry + 46, "T(t)", { size: 8, fill: SHADE.thermal });
  /* the return path is drawn and then struck out: the omission is a modelling
     choice and is easier to see as a crossed arrow than to read as a sentence */
  b += line(ex + ew / 2 + 30, ry + 36, ex + ew / 2 + 30, ey - 3, { stroke: C.hair, sw: 0.9, dash: "2 2" });
  b += line(ex + ew / 2 + 25, ry + 40, ex + ew / 2 + 35, ry + 50, { stroke: C.grey, sw: 1 });
  b += line(ex + ew / 2 + 35, ry + 40, ex + ew / 2 + 25, ry + 50, { stroke: C.grey, sw: 1 });
  b += T(ex + ew / 2 + 40, ry + 42, "no heat", { size: 8, fill: C.grey });
  b += T(ex + ew / 2 + 40, ry + 52, "feedback", { size: 8, fill: C.grey });

  /* the flow that sets the residence time */
  b += arrow(ns, "M" + (rx - 40) + "," + (ry + rh / 2) + " L" + (rx - 4) + "," + (ry + rh / 2), { color: "hair" });
  b += T(LX, ry + rh / 2 - 14, "1:1 CH₄/CO₂", { size: 8, fill: C.grey });
  b += T(LX, ry + rh / 2 - 4, "at 1 atm", { size: 8, fill: C.grey });
  b += arrow(ns, "M" + (rx + rw + 4) + "," + (ry + rh / 2) + " L" + (rx + rw + 34) + "," + (ry + rh / 2), { color: "hair" });
  b += T(rx + rw + 8, ry + rh / 2 - 6, "τ fixed", { size: 8, fill: C.grey });

  /* the detailed calculation sits beside the loop, not inside it */
  b += rect(rx, ry + rh + 20, rw, 34, { stroke: C.hair, fill: TINT.grey, sw: 0.8, dash: "3 2" });
  b += T(rx + 10, ry + rh + 34, "OFFLINE, FOR COMPARISON ONLY", { size: 8, weight: "bold", fill: C.grey });
  b += T(rx + 10, ry + rh + 46, "steady 1-D plug flow, gas phase only", { size: 8.5, fill: C.ink });

  /* ---- what each part does not resolve ---- */
  const nx = 348;
  b += T(nx, 22, "NOT RESOLVED", { size: 8, weight: "bold", fill: C.grey });
  b += line(nx, 27, 488, 27, { stroke: C.ink, sw: 0.9 });
  [[C.thermal, "Gradients inside the element,", "or any element that is not thin"],
   [C.gas, "Absolute yields: the network", "isolates averaging, not mechanism"],
   [C.scalar, "Conversion feeding back on", "temperature, and thermal runaway"],
   [C.grey, "Surface chemistry, and any", "transient the plug flow cannot blend"]
  ].forEach(function (r, i) {
    const y = 44 + i * 36;
    b += '<rect x="' + nx + '" y="' + (y - 8) + '" width="3" height="26" fill="' + r[0] + '"/>';
    b += T(nx + 9, y, r[1], { size: 8, fill: C.ink });
    b += T(nx + 9, y + 10, r[2], { size: 8, fill: C.ink });
  });

  b += line(LX, 214, 488, 214, { stroke: C.rule, sw: 0.6 });

  /* ---- b. what the omitted temperature lag costs, in the one variable that
       decides the departure. The gas is prescribed to follow the element, so a
       real gas that lags sees a smaller swing and moves left along this ladder.
       Drawing the largest ratio reached in each swing bin turns the headline
       number into a bound a reader can evaluate for their own damping. ---- */
  (function () {
    const L = DATA.mem.swingLadder, x0 = 70, y0 = 264, pw = 300, ph = 92;
    b += T(LX, y0 - 22, "b", { size: 11, weight: "bold" });
    b += T(LX + 16, y0 - 22, "WHAT THE OMITTED LAG COSTS", { size: 8, weight: "bold", fill: C.grey });
    b += T(488, y0 - 22, "a gas that does not follow the element sees a smaller S", { size: 8, anchor: "end", fill: C.grey });
    const hi = Math.ceil(Math.max.apply(null, L.map((r) => r.max))) + 1;
    const Y = (v) => lin(v, 0, hi, y0 + ph, y0 + 6);
    b += rect(x0, y0, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    for (let g = 0; g <= hi; g += 2) {
      b += line(x0, Y(g), x0 + pw, Y(g), { stroke: "#EAEAEA", sw: 0.4 });
      b += T(x0 - 4, Y(g) + 3, String(g), { size: 8, anchor: "end", fill: C.grey });
    }
    b += line(x0, Y(1), x0 + pw, Y(1), { stroke: C.ink, sw: 0.8, dash: "3 2" });
    const bw = pw / L.length;
    L.forEach(function (r, i) {
      const cx = x0 + i * bw;
      b += rect(cx + 6, Y(r.max), bw - 12, Y(0) - Y(r.max), { fill: tintOf(C.thermal), stroke: C.thermal, sw: 0.8, rx: 0 });
      b += line(cx + 6, Y(r.med), cx + bw - 6, Y(r.med), { stroke: SHADE.thermal, sw: 1.2 });
      b += T(cx + bw / 2, Y(r.max) - 4, r.max.toFixed(2), { size: 8, anchor: "middle", weight: "bold", fill: SHADE.thermal });
      b += T(cx + bw / 2, y0 + ph + 12, r.hi === null ? "≥ " + r.lo : r.lo + "–" + r.hi, { size: 8, anchor: "middle" });
      b += T(cx + bw / 2, y0 + ph + 22, "n " + r.n, { size: 8, anchor: "middle", fill: C.grey });
    });
    b += T(x0 + pw / 2, y0 + ph + 35, "Arrhenius swing number  S", { size: 8.5, anchor: "middle" });
    b += '<g transform="rotate(-90 ' + (x0 - 26) + ' ' + (y0 + ph / 2) + ')">' +
      T(x0 - 26, y0 + ph / 2, "X_{dyn} / X_{qs}", { size: 8.5, anchor: "middle" }) + '</g>';
    b += rect(x0 + pw + 14, y0 + 4, 16, 10, { fill: tintOf(C.thermal), stroke: C.thermal, sw: 0.8, rx: 0 });
    b += T(x0 + pw + 34, y0 + 12, "largest in bin", { size: 8, fill: C.grey });
    b += line(x0 + pw + 14, y0 + 26, x0 + pw + 30, y0 + 26, { stroke: SHADE.thermal, sw: 1.2 });
    b += T(x0 + pw + 34, y0 + 29, "median", { size: 8, fill: C.grey });
    b += T(x0 + pw + 14, y0 + 58, "The largest departure", { size: 8, fill: C.ink });
    b += T(x0 + pw + 14, y0 + 68, "rises with S, so the", { size: 8, fill: C.ink });
    b += T(x0 + pw + 14, y0 + 78, "headline ratio is an", { size: 8, fill: C.ink });
    b += T(x0 + pw + 14, y0 + 88, "upper bound.", { size: 8, weight: "bold", fill: SHADE.thermal });
  })();

  /* the caveat belongs to the whole plate, so it sits under both panels */
  b += T(LX, H - 10, "No layer carries oxidation, sublimation or a lifetime model, so a temperature the element reaches here is not one it survives.",
    { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* architecture(). The module the page and the tests both call, and the gates  */
/* a change passes. No tool or model is named: they date, the          */
/* structure does not.                                                 */
/* ------------------------------------------------------------------ */
export function architecture(DATA) {
  const ns = "rs3", W = 505, H = 250;
  let b = defs(ns);
  const boxA = (x, y, w, h, label, sub, colour) =>
    rect(x, y, w, h, { stroke: C.edge, fill: TINT.grey, sw: 0.8 }) +
    T(x + w / 2, y + (sub ? 14 : h / 2 + 3.2), label, { size: 9, weight: "bold", anchor: "middle", fill: colour || SHADE.grey }) +
    (sub ? T(x + w / 2, y + 25, sub, { size: 8, anchor: "middle", fill: C.grey }) : "");

  b += T(18, 22, "a", { size: 11, weight: "bold" });
  const ay = 34, ah = 34;
  b += boxA(18, ay, 104, ah, "Physical specification", "", SHADE.ink);
  b += arrow(ns, "M122," + (ay + ah / 2) + " L136," + (ay + ah / 2), { color: "hair" });
  b += boxA(137, ay, 82, ah, "Implementation", "assisted");
  b += arrow(ns, "M219," + (ay + ah / 2) + " L233," + (ay + ah / 2), { color: "hair" });
  b += boxA(234, ay, 96, ah, "Independent review", "a second model");
  b += arrow(ns, "M330," + (ay + ah / 2) + " L344," + (ay + ah / 2), { color: "hair" });
  b += rect(345, ay, 82, ah, { stroke: C.ink, fill: "#FFFFFF", sw: 1.1 });
  b += T(386, ay + 14, "Verification", { size: 9, weight: "bold", anchor: "middle" });
  b += T(386, ay + 25, "gates", { size: 9, weight: "bold", anchor: "middle" });
  b += arrow(ns, "M427," + (ay + ah / 2) + " L441," + (ay + ah / 2), { color: "hair" });
  b += rect(442, ay, 45, ah, { stroke: C.edge, fill: TINT.grey, sw: 0.8 });
  b += T(464.5, ay + 14, "Release", { size: 9, weight: "bold", anchor: "middle", fill: SHADE.ink });
  b += T(464.5, ay + 25, "versioned", { size: 8, anchor: "middle", fill: C.grey });
  b += T(434, ay - 8, "pass", { size: 8, fill: C.grey });
  b += arrow(ns, "M386," + (ay + ah + 2) + " L386,96 L178,96 L178," + (ay + ah + 1), { color: "hair", sw: 1, dash: "3 2" });
  b += T(282, 93, "fail", { size: 8, anchor: "middle", fill: C.grey });

  b += T(18, 128, "b", { size: 11, weight: "bold" });
  const cx = 232, cy = 172, cw = 118, ch = 40;
  b += rect(cx, cy, cw, ch, { stroke: C.ink, fill: "#FFFFFF", sw: 1.1 });
  b += T(cx + cw / 2, cy + 17, "solver.js", { size: 10, weight: "bold", anchor: "middle", fill: SHADE.ink });
  b += T(cx + cw / 2, cy + 29, "DOM-free numerical core", { size: 8, anchor: "middle", fill: C.grey });
  [{ y: 140, label: "Kinetic parameters", note: "activation energies and rate constants" },
   { y: 172, label: "Element and enclosure", note: "resistance, heat capacity, losses" },
   { y: 204, label: "Browser interface", note: "inputs and outputs only" }].forEach(function (f) {
    b += rect(18, f.y, 168, 24, { stroke: C.edge, fill: TINT.grey, sw: 0.8 });
    b += T(26, f.y + 10, f.label, { size: 8.5, weight: "bold", fill: SHADE.grey });
    b += T(26, f.y + 20, f.note, { size: 8, fill: C.grey });
    b += arrow(ns, "M186," + (f.y + 12) + " L" + (cx - 2) + "," + (cy + ch / 2), { color: "hair", sw: 0.8 });
  });
  b += rect(18, 236, 168, 10, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8, dash: "3 2" });
  b += arrow(ns, "M" + (cx + cw) + "," + (cy + ch / 2) + " L" + (cx + cw + 14) + "," + (cy + ch / 2), { color: "hair" });
  b += rect(cx + cw + 15, cy - 6, 108, ch + 12, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
  ["periodic trajectories", "conversion and yield", "the continuous baseline", "these figures"].forEach(function (t, i) {
    b += T(cx + cw + 23, cy + 6 + i * 11, t, { size: 8, fill: i === 0 ? C.ink : C.grey });
  });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* cjhmap(). The steady CJH map the predictor reads, and the map checked  */
/* between its nodes, where interpolation actually happens.            */
/* ------------------------------------------------------------------ */
const sciT = (v) => {
  if (v === 0) return "0";
  const e = Math.floor(lg(Math.abs(v)));
  if (e >= -2 && e <= 0) return String(Number(v.toPrecision(2)));
  return (v / Math.pow(10, e)).toFixed(1) + " × 10^{" + String(e).replace("-", "−") + "}";
};
const heat = (v) => {
  const r = Math.round(255 + (213 - 255) * v), g = Math.round(255 + (94 - 255) * v),
        bl = Math.round(255 * (1 - v));
  return "#" + [r, g, bl].map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("");
};

export function cjhmap(DATA) {
  const ns = "r6", W = 505, H = 250;
  const M = DATA.map;
  let b = defs(ns);
  const pw = 190, ph = 160, ptop = 30, pbot = 190;
  const COL = [58, 300];

  /* a. the map itself, cells at the grid's own nodes */
  (function () {
    const x0 = COL[0];
    const ts = M.taus, n = ts.length;
    const xe = [ts[0] / Math.sqrt(ts[1] / ts[0])];
    for (let i = 1; i < n; i++) xe.push(Math.sqrt(ts[i - 1] * ts[i]));
    xe.push(ts[n - 1] * Math.sqrt(ts[n - 1] / ts[n - 2]));
    const X = (v) => lin(lg(v), lg(xe[0]), lg(xe[n]), x0, x0 + pw);
    const Y = (v) => lin(v, M.tLo, M.tHi, pbot, ptop);
    let o = "";
    M.columns.forEach(function (c, ci) {
      const xl = X(xe[ci]), xr = X(xe[ci + 1]);
      const pts = c.pts;
      for (let i = 0; i < pts.length; i++) {
        const yTop = Y(i + 1 < pts.length ? (pts[i][0] + pts[i + 1][0]) / 2 : M.tHi);
        const yBot = Y(i > 0 ? (pts[i - 1][0] + pts[i][0]) / 2 : M.tLo);
        o += '<rect x="' + xl.toFixed(1) + '" y="' + yTop.toFixed(1) + '" width="' + (xr - xl).toFixed(1) +
          '" height="' + (yBot - yTop).toFixed(1) + '" fill="' + heat(pts[i][1]) + '"/>';
      }
    });
    /* the half-conversion locus; its 5 degree staircase is the refinement */
    let d = "";
    M.locus.forEach(function (l, i) { d += (i ? " L" : "M") + X(l.tau).toFixed(1) + "," + Y(l.T).toFixed(1); });
    o += '<path d="' + d + '" fill="none" stroke="' + C.ink + '" stroke-width="1.2"/>';
    o += T(X(M.locus[Math.floor(M.locus.length / 2)].tau), Y(M.locus[Math.floor(M.locus.length / 2)].T) - 7,
      "X = 0.5", { size: 8, anchor: "middle", weight: "bold" });
    o += rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "none", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "a", { size: 11, weight: "bold" });
    [400, 800, 1200, 1600].forEach(function (t) {
      o += T(x0 - 4, Y(t) + 3, String(t), { size: 8, anchor: "end", fill: C.grey });
    });
    [0.01, 0.1, 1, 10].forEach(function (v) {
      o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "residence time (s)", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 30) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 30) + ' ' + ((ptop + pbot) / 2) + ')">element temperature (°C)</text>';
    /* colour scale, sitting on the zero-conversion corner of the map */
    const cbx = x0 + pw - 70, cby = pbot - 20, cbw = 56;
    for (let i = 0; i < 14; i++) {
      o += '<rect x="' + (cbx + i * 4) + '" y="' + cby + '" width="4" height="7" fill="' + heat((i + 0.5) / 14) + '"/>';
    }
    o += rect(cbx, cby, cbw, 7, { stroke: C.grey, fill: "none", sw: 0.5, rx: 0 });
    o += T(cbx - 3, cby + 6, "0", { size: 8, anchor: "end", fill: C.grey });
    o += T(cbx + cbw + 3, cby + 6, "1", { size: 8, fill: C.grey });
    o += T(cbx + cbw / 2, cby - 4, "CH₄ conversion", { size: 8, anchor: "middle", fill: C.grey });
    b += o;
  })();

  /* b. the check between the nodes */
  (function () {
    const x0 = COL[1], V = M.val;
    const X = (v) => lin(v, M.tLo, M.tHi, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(lg(Math.max(v, 1e-9)), -9, -1, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "b", { size: 11, weight: "bold" });
    for (let d = -9; d <= -1; d += 2) {
      o += line(x0, Y(Math.pow(10, d)), x0 + pw, Y(Math.pow(10, d)), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(Math.pow(10, d)) + 3, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "end", fill: C.grey });
    }
    [400, 800, 1200, 1600].forEach(function (t) {
      o += T(X(t), pbot + 12, String(t), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "off-node temperature (°C)", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 30) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 30) + ' ' + ((ptop + pbot) / 2) + ')">|interpolated − Cantera|</text>';
    o += line(x0, Y(V.gate), x0 + pw, Y(V.gate), { stroke: C.thermal, sw: 0.9, dash: "3 2" });
    o += T(x0 + pw - 6, Y(V.gate) - 4, "acceptance criterion, " + V.gate, { size: 8, anchor: "end", fill: SHADE.thermal });
    o += line(x0, Y(V.p95), x0 + pw, Y(V.p95), { stroke: C.grey, sw: 0.8, dash: "3 2" });
    o += T(x0 + pw - 6, Y(V.p95) - 4, "p95 of " + V.points + " points, " + sciT(V.p95), { size: 8, anchor: "end", fill: C.grey });
    V.rows.forEach(function (r) {
      o += '<circle cx="' + X(r[0]).toFixed(1) + '" cy="' + Y(r[1]).toFixed(1) + '" r="1.6" fill="' + C.scalar + '" fill-opacity="0.65"/>';
    });
    o += T(x0 + 8, pbot - 26, "floor: points differing by less than 10^{−9}", { size: 8, fill: C.grey });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* memory(). The memory effect in the transient campaign, and what the  */
/* learned correction does to the quasi-steady shortfall.              */
/* ------------------------------------------------------------------ */
export function memory(DATA) {
  /* Three panels, because the departure has two axes and only one of them was
     ever drawn. Panel a is the quasi-steady limit in P/tau, which the model
     must recover and does. Panel b is the variable that actually decides the
     departure: the Arrhenius swing number, the natural logarithm of the rate
     constant ratio across the cycle. Panel c is what the correction does with
     it. The regime rule in b is the portable part of this work: it is stated
     in two dimensionless groups, so a reader can evaluate it for a system that
     shares neither the mechanism nor the element. */
  const ns = "r7", W = 505, H = 268;
  const M = DATA.mem, RG = M.regime;
  let b = defs(ns);
  const pw = 126, ph = 150, ptop = 30, pbot = 180;
  const COL = [46, 206, 366];
  const ratio = (v) => lg(Math.min(Math.max(v, 0.1), 10));
  /* the raw <text> form used elsewhere cannot carry _{...}: route the rotated
     label through the same helper the rest of the plate uses */
  const ylab = (x, s) => '<g transform="rotate(-90 ' + x + ' ' + ((ptop + pbot) / 2) + ')">' +
    T(x, (ptop + pbot) / 2, s, { size: 8.5, anchor: "middle" }) + '</g>';

  /* a. the quasi-steady limit, in the forcing-to-residence ratio */
  (function () {
    const x0 = COL[0];
    const X = (v) => lin(lg(v), -2, 3, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(ratio(v), -1, 1, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 34, ptop - 8, "a", { size: 11, weight: "bold" });
    if (M.band) {
      o += '<rect x="' + X(M.band.lo).toFixed(1) + '" y="' + (ptop + 1) + '" width="' +
        (X(M.band.hi) - X(M.band.lo)).toFixed(1) + '" height="' + (ph - 2) + '" fill="#F4F4F4"/>';
    }
    [0.1, 1, 10].forEach(function (g) {
      o += line(x0, Y(g), x0 + pw, Y(g), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(g) + 3, String(g), { size: 8, anchor: "end", fill: C.grey });
    });
    [0.01, 1, 100].forEach(function (v) {
      o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "P / τ", { size: 8.5, anchor: "middle" });
    o += ylab(x0 - 26, "X_{dyn} / X_{qs}");
    o += line(x0, Y(1), x0 + pw, Y(1), { stroke: C.ink, sw: 0.9, dash: "3 2" });
    M.cases.forEach(function (c) {
      o += '<circle cx="' + X(c.pt).toFixed(1) + '" cy="' + Y(c.gain).toFixed(1) + '" r="1.8" fill="' + C.thermal + '" fill-opacity="0.5"/>';
    });
    o += T(x0 + pw - 6, Y(9.2), "up to " + M.gainMax.toFixed(1) + "x", { size: 8, weight: "bold", anchor: "end", fill: SHADE.thermal });
    o += T(x0 + pw - 6, Y(0.45), "quasi-steady", { size: 8, anchor: "end", fill: C.grey });
    b += o;
  })();

  /* b. the regime map: the swing decides, and P/tau only gates */
  (function () {
    const x0 = COL[1];
    const X = (v) => lin(lg(Math.max(v, 0.2)), -0.7, 2, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(lg(v), -2, 3, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 34, ptop - 8, "b", { size: 11, weight: "bold" });
    /* the rule, drawn as the region it is */
    const bx = X(RG.sMin), by = Y(RG.ptHi), bh = Y(RG.ptLo) - Y(RG.ptHi);
    o += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + (x0 + pw - bx).toFixed(1) +
      '" height="' + bh.toFixed(1) + '" fill="' + tintOf(C.thermal) + '"/>';
    o += line(bx, by, x0 + pw, by, { stroke: C.thermal, sw: 0.8, dash: "3 2" });
    o += line(bx, by + bh, x0 + pw, by + bh, { stroke: C.thermal, sw: 0.8, dash: "3 2" });
    o += line(bx, by, bx, by + bh, { stroke: C.thermal, sw: 0.8, dash: "3 2" });
    [0.01, 1, 100].forEach(function (v) {
      o += line(x0, Y(v), x0 + pw, Y(v), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(v) + 3, String(v), { size: 8, anchor: "end", fill: C.grey });
    });
    [1, 10, 100].forEach(function (v) {
      o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "swing number  S", { size: 8.5, anchor: "middle" });
    o += ylab(x0 - 26, "P / τ");
    M.cases.forEach(function (c) {
      if (c.gain >= 2) return;
      o += '<circle cx="' + X(c.swing).toFixed(1) + '" cy="' + Y(c.pt).toFixed(1) + '" r="1.5" fill="' + C.grey + '" fill-opacity="0.4"/>';
    });
    M.cases.forEach(function (c) {
      if (c.gain < 2) return;
      o += '<circle cx="' + X(c.swing).toFixed(1) + '" cy="' + Y(c.pt).toFixed(1) + '" r="2.4" fill="' + C.thermal + '" fill-opacity="0.9"/>';
    });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (ptop + 12) + '" r="2.4" fill="' + C.thermal + '"/>';
    o += T(x0 + 20, ptop + 15, "X_{dyn}/X_{qs} ≥ 2", { size: 8, fill: SHADE.thermal });
    o += T(x0 + 8, pbot - 32, "S ≥ " + RG.sMin + ",  " + RG.ptLo + " ≤ P/τ ≤ " + RG.ptHi, { size: 8, fill: SHADE.thermal });
    o += T(x0 + 8, pbot - 22, "holds all " + RG.total + ",  admits " + RG.inside + " of " + RG.pool, { size: 8, fill: C.grey });
    b += o;
  })();

  /* c. the correction against the shortfall it corrects */
  (function () {
    const x0 = COL[2];
    const A = (v) => lg(Math.min(Math.max(v, 1e-7), 1));
    const X = (v) => lin(A(v), -7, 0, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(A(v), -7, 0, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 34, ptop - 8, "c", { size: 11, weight: "bold" });
    for (let d = -6; d <= 0; d += 3) {
      o += line(x0, Y(Math.pow(10, d)), x0 + pw, Y(Math.pow(10, d)), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(Math.pow(10, d)) + 3, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "end", fill: C.grey });
      o += T(X(Math.pow(10, d)), pbot + 12, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "middle" });
    }
    o += T(x0 + pw / 2, pbot + 24, "quasi-steady error", { size: 8.5, anchor: "middle" });
    o += ylab(x0 - 26, "corrected error");
    o += line(X(1e-7), Y(1e-7), X(1), Y(1), { stroke: C.ink, sw: 0.9, dash: "3 2" });
    M.cases.forEach(function (c) {
      if (c.e1 === null || c.holdout) return;
      o += '<circle cx="' + X(c.e0).toFixed(1) + '" cy="' + Y(c.e1).toFixed(1) + '" r="1.4" fill="' + C.grey + '" fill-opacity="0.45"/>';
    });
    M.cases.forEach(function (c) {
      if (c.e1 === null || !c.holdout) return;
      o += '<circle cx="' + X(c.e0).toFixed(1) + '" cy="' + Y(c.e1).toFixed(1) + '" r="2.1" fill="' + C.thermal + '" fill-opacity="0.85"/>';
    });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (ptop + 12) + '" r="2.1" fill="' + C.thermal + '"/>';
    o += T(x0 + 20, ptop + 15, "development test", { size: 8, fill: SHADE.thermal });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (ptop + 24) + '" r="1.4" fill="' + C.grey + '"/>';
    o += T(x0 + 20, ptop + 27, "training", { size: 8, fill: C.grey });
    o += T(x0 + pw - 6, pbot - 18, "mean " + sciT(M.hold.mean), { size: 8, anchor: "end", weight: "bold" });
    o += T(x0 + pw - 6, pbot - 8, "max " + sciT(M.hold.max), { size: 8, anchor: "end" });
    b += o;
  })();

  /* the two groups defined once, on the plate that first uses them */
  b += line(46, H - 34, 492, H - 34, { stroke: C.rule, sw: 0.6 });
  b += T(46, H - 21, "S = (E_{a}/R)(1/T_{min} − 1/T_{peak}), the log of the rate-constant ratio over the cycle, E_{a} = " +
    RG.ea.toFixed(0) + " kJ/mol from Fig. S2a.", { size: 8, fill: C.grey });
  b += T(46, H - 10, "ln Da = logit X_{qs}: for a first-order stirred reactor the baseline is itself a Damköhler number, and is one of the model's five inputs.",
    { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* finalparity(). The independent test: cases fixed by hash before any  */
/* prediction existed, integrated once in Cantera, compared once.      */
/* ------------------------------------------------------------------ */
export function finalparity(DATA) {
  const ns = "r8", W = 505, H = 250;
  const F = DATA.final;
  let b = defs(ns);
  const pw = 190, ph = 160, ptop = 30, pbot = 190;
  const COL = [58, 300];

  /* a. parity, the quasi-steady approximation and the correction side by side */
  (function () {
    const x0 = COL[0];
    const A = (v) => lg(Math.min(Math.max(v, 1e-6), 1));
    const X = (v) => lin(A(v), -6, 0, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(A(v), -6, 0, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "a", { size: 11, weight: "bold" });
    for (let d = -6; d <= 0; d += 2) {
      o += line(x0, Y(Math.pow(10, d)), x0 + pw, Y(Math.pow(10, d)), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(Math.pow(10, d)) + 3, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "end", fill: C.grey });
      o += T(X(Math.pow(10, d)), pbot + 12, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "middle" });
    }
    o += T(x0 + pw / 2, pbot + 24, "Cantera CH₄ conversion", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 30) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 30) + ' ' + ((ptop + pbot) / 2) + ')">predicted CH₄ conversion</text>';
    o += line(X(1e-6), Y(1e-6), X(1), Y(1), { stroke: C.ink, sw: 0.9, dash: "3 2" });
    F.cases.forEach(function (c) {
      o += '<circle cx="' + X(c[0]).toFixed(1) + '" cy="' + Y(c[1]).toFixed(1) + '" r="2" fill="none" stroke="' + C.grey + '" stroke-width="0.8" stroke-opacity="0.8"/>';
    });
    F.cases.forEach(function (c) {
      o += '<circle cx="' + X(c[0]).toFixed(1) + '" cy="' + Y(c[2]).toFixed(1) + '" r="2" fill="' + C.thermal + '" fill-opacity="0.8"/>';
    });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (ptop + 14) + '" r="2" fill="' + C.thermal + '"/>';
    o += T(x0 + 20, ptop + 17, "CJH map + learned correction", { size: 8, fill: SHADE.thermal });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (ptop + 26) + '" r="2" fill="none" stroke="' + C.grey + '" stroke-width="0.8"/>';
    o += T(x0 + 20, ptop + 29, "CJH map alone", { size: 8, fill: C.grey });
    b += o;
  })();

  /* b. the same 64 errors as a distribution, against the gates */
  (function () {
    const x0 = COL[1];
    const n = F.cases.length;
    const X = (v) => lin(lg(Math.min(Math.max(v, 1e-8), 1)), -8, 0, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(v, 0, 1, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "b", { size: 11, weight: "bold" });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      o += line(x0, Y(f), x0 + pw, Y(f), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(f) + 3, f.toFixed(2), { size: 8, anchor: "end", fill: C.grey });
    });
    for (let d = -8; d <= 0; d += 2) {
      o += T(X(Math.pow(10, d)), pbot + 12, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "middle" });
    }
    o += T(x0 + pw / 2, pbot + 24, "absolute conversion error", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 30) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 30) + ' ' + ((ptop + pbot) / 2) + ')">fraction of cases at or below</text>';
    const cdf = (errs, colour, wdt, dash) => {
      const s = errs.slice().sort((a, b) => a - b);
      let d = "";
      s.forEach(function (e, i) { d += (i ? " L" : "M") + X(e).toFixed(1) + "," + Y((i + 1) / n).toFixed(1); });
      return '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + wdt + '"' +
        (dash ? ' stroke-dasharray="' + dash + '"' : "") + '/>';
    };
    o += cdf(F.cases.map((c) => Math.abs(c[1] - c[0])), C.grey, 1.2, "3 2");
    o += cdf(F.cases.map((c) => Math.abs(c[2] - c[0])), C.thermal, 1.6, "");
    o += line(x0, Y(0.95), x0 + pw, Y(0.95), { stroke: "#CCCCCC", sw: 0.7, dash: "2 2" });
    o += T(x0 + pw - 8, Y(0.95) + 9, "p95", { size: 8, anchor: "end", fill: C.grey });
    o += line(X(0.05), ptop, X(0.05), pbot, { stroke: C.ink, sw: 0.7, dash: "2 2" });
    o += T(X(0.05) - 3, ptop + 10, "p95 criterion 0.05", { size: 8, anchor: "end", fill: C.grey });
    o += line(x0 + 8, ptop + 14, x0 + 24, ptop + 14, { stroke: C.thermal, sw: 1.6 });
    o += T(x0 + 28, ptop + 17, "with correction", { size: 8, fill: SHADE.thermal });
    o += line(x0 + 8, ptop + 26, x0 + 24, ptop + 26, { stroke: C.grey, sw: 1.2, dash: "3 2" });
    o += T(x0 + 28, ptop + 29, "quasi-steady, uncorrected", { size: 8, fill: C.grey });
    o += T(x0 + pw - 8, pbot - 24, "mean " + sciT(F.mean) + " against " + sciT(F.cjhMean), { size: 8, anchor: "end", weight: "bold" });
    /* four criteria here, five in Fig. S6: the long-period consistency check
       is a development criterion and was never part of the final test, so the
       two counts are stated separately rather than reconciled */
    o += T(x0 + pw - 8, pbot - 14, F.verdict === "PASS"
      ? "all four final-test criteria satisfied"
      : "final-test criteria not satisfied", { size: 8, anchor: "end" });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* method(). How one training label is made, and how the correction is  */
/* learned from it. The worked case is the strongest memory effect in  */
/* the campaign, selected by rule so it cannot be a flattering pick.   */
/* ------------------------------------------------------------------ */
export function method(DATA) {
  const ns = "r9", W = 505, H = 338;
  const E = DATA.example, G = DATA.gp;
  let b = defs(ns);
  const box = (x, y, w, h, title, lines, hue, fill) => {
    let o = rect(x, y, w, h, { stroke: C.edge, fill: fill || "#FFFFFF", sw: 0.8 });
    o += T(x + w / 2, y + 13, title, { size: 8.5, weight: "bold", anchor: "middle",
                                       fill: hue ? shadeOf(hue) : SHADE.ink });
    (lines || []).forEach(function (t, i) {
      o += T(x + w / 2, y + 25 + i * 10, t, { size: 8, anchor: "middle", fill: C.grey });
    });
    return o;
  };

  /* a. the label path: one drive, two conversions, one log-odds difference */
  b += T(18, 22, "a", { size: 11, weight: "bold" });
  b += T(34, 22, "CONSTRUCTION OF ONE TRAINING LABEL", { size: 8, weight: "bold", fill: C.grey });
  b += T(487, 22, "the largest departure in the development campaign", { size: 8, anchor: "end", fill: C.grey });

  const ay = 32;
  /* the shared upstream is neutral: colour is spent only on the two readings
     of the waveform, which is the one contrast this plate exists to show */
  b += box(18, ay, 108, 46, "Drive", [E.voltage + " V,  " + E.period + " s",
                                      (100 * E.duty).toFixed(1) + " % duty"]);
  b += arrow(ns, "M126," + (ay + 23) + " L140," + (ay + 23), { color: "hair" });
  b += box(141, ay, 112, 46, "Element ODE", ["peak " + E.tPeak.toFixed(0) + " °C",
                                             "minimum " + E.tMin.toFixed(0) + " °C"]);
  b += T(203, ay + 54, "T(t), integrated to a periodic state", { size: 8, fill: C.grey });

  /* the same waveform is read twice, which is the whole construction */
  const by = ay + 76, split = ay + 60;
  b += arrow(ns, "M197," + (ay + 46) + " L197," + split + " L84," + split + " L84," + (by - 2), { color: "hair", sw: 0.9 });
  b += arrow(ns, "M197," + (ay + 46) + " L197," + split + " L320," + split + " L320," + (by - 2), { color: "hair", sw: 0.9 });
  b += box(18, by, 132, 50, "Cantera transient CSTR", ["GRI-Mech 3.0, integrated",
                                                       "X_{dyn} = " + E.xDyn], C.gas, TINT.gas);
  b += box(254, by, 132, 50, "CJH map, phase by phase", ["outflow-weighted blend",
                                                         "X_{qs} = " + E.xQs], C.scalar, TINT.scalar);
  b += T(202, by + 22, "the same", { size: 8, anchor: "middle", fill: C.grey });
  b += T(202, by + 32, "waveform", { size: 8, anchor: "middle", fill: C.grey });

  const cy = by + 62;
  b += arrow(ns, "M84," + (by + 52) + " L84," + (cy - 2), { color: "hair", sw: 0.9 });
  b += arrow(ns, "M320," + (by + 52) + " L320," + (cy - 2), { color: "hair", sw: 0.9 });
  b += rect(18, cy, 368, 30, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
  b += T(202, cy + 13, "label  δ  =  logit X_{dyn}  −  logit X_{qs}  =  " + E.delta.toFixed(2),
    { size: 9, weight: "bold", anchor: "middle" });
  b += T(202, cy + 24, "a ratio of odds, so a rare event and a common one are corrected on one scale",
    { size: 8, anchor: "middle", fill: C.grey });

  /* the numbers on the right, so the diagram carries its own arithmetic */
  b += rect(396, ay, 91, 104, { stroke: C.hair, fill: TINT.panel, sw: 0.8, dash: "3 2" });
  b += T(404, ay + 14, "THIS CASE", { size: 8, weight: "bold", fill: C.grey });
  /* X_qs, X_dyn and the observed delta are already in the flow boxes; only
     what the flow does not carry is listed here */
  [["period / τ", (E.period / E.tau).toFixed(1)], ["residence τ", E.tau + " s"],
   ["ratio", E.gain.toFixed(2) + "x"],
   ["δ predicted", E.deltaHat === null ? "n/a" : E.deltaHat.toFixed(2)],
   ["X predicted", E.xPred === null ? "n/a" : String(E.xPred)]].forEach(function (r, i) {
    b += T(404, ay + 30 + i * 13, r[0], { size: 8, fill: C.grey });
    b += T(479, ay + 30 + i * 13, r[1], { size: 8, anchor: "end", weight: i >= 3 ? "bold" : "normal",
                                          fill: i >= 3 ? SHADE.thermal : C.ink });
  });

  /* b. the model that turns five numbers into that correction */
  const dy = 218;
  b += T(18, dy, "b", { size: 11, weight: "bold" });
  b += T(34, dy, "FITTING AND APPLYING THE CORRECTION", { size: 8, weight: "bold", fill: C.grey });
  const ey = dy + 10;
  b += rect(18, ey, 128, 76, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
  b += T(82, ey + 13, "Five inputs", { size: 8.5, weight: "bold", anchor: "middle", fill: SHADE.ink });
  G.features.forEach(function (f, i) {
    b += T(26, ey + 25 + i * 10, "· " + f.label, { size: 8, fill: C.grey });
  });
  b += arrow(ns, "M146," + (ey + 38) + " L160," + (ey + 38), { color: "hair" });
  b += rect(161, ey, 132, 76, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
  b += T(227, ey + 14, "Gaussian process", { size: 9, weight: "bold", anchor: "middle" });
  G.kernel.split(", ").forEach(function (part, i) {
    b += T(227, ey + 25 + i * 10, part, { size: 8, anchor: "middle", fill: C.grey });
  });
  b += T(227, ey + 47, G.nTrain + " fitted, " + G.nHold + " development test", { size: 8, anchor: "middle", fill: C.grey });
  b += T(227, ey + 57, "noise σ_{n} = " + G.sigmaN + " in log-odds", { size: 8, anchor: "middle", fill: C.grey });
  b += T(227, ey + 69, "returns the correction δ", { size: 8, anchor: "middle", weight: "bold", fill: SHADE.thermal });
  b += arrow(ns, "M293," + (ey + 38) + " L307," + (ey + 38), { color: "hair" });
  b += rect(308, ey, 179, 76, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
  b += T(397, ey + 14, "X_{pred} = σ( logit X_{qs} + δ )", { size: 9, weight: "bold", anchor: "middle", fill: SHADE.thermal });
  b += T(316, ey + 28, "The sigmoid cannot leave (0, 1), so no", { size: 8, fill: C.grey });
  b += T(316, ey + 38, "correction can return an impossible conversion.", { size: 8, fill: C.grey });
  b += T(316, ey + 51, "A zero-mean prior regularises unsupported", { size: 8, fill: C.grey });
  b += T(316, ey + 61, "corrections toward zero.", { size: 8, fill: C.grey });

  b += T(18, 320, "Scope of every number above: " + G.scope.feed + " at " + G.scope.pressure_atm +
    " atm, " + G.scope.mechanism + ", " + G.scope.closure + ", element peak below " +
    G.scope.peak_cap_c + " °C.", { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* gpdetail(). What the fitted kernel says each input is worth, and what  */
/* the correction was measured against on data it never saw.           */
/* ------------------------------------------------------------------ */
export function gpdetail(DATA) {
  const ns = "rs4", W = 505, H = 320;
  const G = DATA.gp;
  let b = defs(ns);

  /* a. the length scales, which are the model's own statement of what it uses */
  (function () {
    const x0 = 150, w = 230, ytop = 34, rowh = 22;
    let o = T(18, 22, "a", { size: 11, weight: "bold" });
    o += T(34, 22, "FITTED LENGTH SCALES", { size: 8, weight: "bold", fill: C.grey });
    o += T(487, 22, "shorter bar, stronger dependence", { size: 8, anchor: "end", fill: C.grey });
    const hi = Math.ceil(Math.max.apply(null, G.features.map((f) => f.ell)));
    const X = (v) => lin(v, 0, hi, x0, x0 + w);
    G.features.forEach(function (f, i) {
      const y = ytop + i * rowh;
      const strong = f.ell <= 2.5;
      o += T(x0 - 8, y + 9, f.label, { size: 8.5, anchor: "end" });
      o += '<rect x="' + x0 + '" y="' + y + '" width="' + (X(f.ell) - x0).toFixed(1) +
        '" height="11" fill="' + (strong ? C.thermal : C.grey) + '" fill-opacity="' + (strong ? 0.85 : 0.35) + '"/>';
      o += T(X(f.ell) + 5, y + 9, f.ell.toFixed(2), { size: 8, fill: strong ? SHADE.thermal : C.grey });
    });
    const yb = ytop + G.features.length * rowh;
    o += line(x0, yb, x0 + w, yb, { stroke: C.grey, sw: 0.8 });
    [0, 2, 4, 6, 8].filter((v) => v <= hi).forEach(function (v) {
      o += T(X(v), yb + 11, String(v), { size: 8, anchor: "middle", fill: C.grey });
    });
    o += T(x0 + w / 2, yb + 23, "length scale, in standard deviations of the input", { size: 8.5, anchor: "middle" });
    o += T(18, yb + 38, "Duty is the one input the correction barely reads. That is not a defect: the element ODE has already",
      { size: 8, fill: C.grey });
    o += T(18, yb + 48, "spent duty producing the peak and minimum temperatures, which the model does read.", { size: 8, fill: C.grey });
    b += o;
  })();

  /* b. the ladder, against gates written before any of these numbers existed */
  (function () {
    const LX = 22, MX = 300, PX = 372, WX = 448, GX = 488, ytop = 228;
    let o = T(18, ytop - 18, "b", { size: 11, weight: "bold" });
    o += T(34, ytop - 18, "DEVELOPMENT-SET ERROR", { size: 8, weight: "bold", fill: C.grey });
    o += T(MX, ytop - 4, "MEAN", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
    o += T(PX, ytop - 4, "P95", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
    o += T(WX, ytop - 4, "MAX", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
    o += line(LX, ytop + 1, GX, ytop + 1, { stroke: C.ink, sw: 0.9 });
    let y = ytop + 15;
    G.ladder.forEach(function (r, i) {
      const best = i === G.ladder.length - 1;
      o += T(LX, y, r.model, { size: 8.5, weight: best ? "bold" : "normal", fill: best ? SHADE.thermal : C.ink });
      [[MX, r.mean], [PX, r.p95], [WX, r.max]].forEach(function (c) {
        o += T(c[0], y, c[1].toFixed(4), { size: 8.5, anchor: "end",
          weight: best ? "bold" : "normal", fill: best ? SHADE.thermal : C.grey });
      });
      y += 15;
    });
    o += line(LX, y - 10, GX, y - 10, { stroke: C.rule, sw: 0.6 });
    o += T(LX, y + 2, "Development criteria, all fixed before the model was fitted:", { size: 8, fill: C.grey });
    const names = Object.keys(G.gates);
    names.forEach(function (k, i) {
      const x = LX + (i % 3) * 160, yy = y + 14 + Math.floor(i / 3) * 11;
      const pretty = k.replace(/<=/g, " ≤ ").replace(/>=/g, "≥ ").replace(/\s+/g, " ").trim();
      o += T(x, yy, (G.gates[k] ? "pass" : "fail") + "  " + pretty, { size: 8,
        fill: G.gates[k] ? SHADE.gas : SHADE.thermal, weight: "bold" });
    });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* designspace(). Where the campaign spent its Cantera runs, and where   */
/* the independent test sits relative to them.                         */
/* ------------------------------------------------------------------ */
export function designspace(DATA) {
  const ns = "rs5", W = 505, H = 282;
  const S = DATA.space;
  let b = defs(ns);
  const pw = 190, ph = 160, ptop = 30, pbot = 190;
  const COL = [58, 300];
  const X0 = (x0) => (v) => lin(lg(v), -2, 3, x0 + 12, x0 + pw - 12);
  const Y = (v) => lin(v, 300, 1900, pbot - 10, ptop + 10);

  function frame(x0, letter, label) {
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, letter, { size: 11, weight: "bold" });
    [400, 800, 1200, 1600].forEach(function (t) {
      o += line(x0, Y(t), x0 + pw, Y(t), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(t) + 3, String(t), { size: 8, anchor: "end", fill: C.grey });
    });
    [0.01, 0.1, 1, 10, 100].forEach(function (v) {
      o += T(X0(x0)(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "pulse period / residence time", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 30) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 30) + ' ' + ((ptop + pbot) / 2) + ')">element peak temperature (°C)</text>';
    /* the bound the element ODE screens against, before any chemistry is paid for */
    o += line(x0, Y(S.cap), x0 + pw, Y(S.cap), { stroke: C.thermal, sw: 0.9, dash: "3 2" });
    o += T(x0 + pw - 6, Y(S.cap) - 4, "materials bound " + S.cap + " °C", { size: 8, anchor: "end", fill: SHADE.thermal });
    o += T(x0 + pw / 2, ptop - 8, label, { size: 8, anchor: "middle", fill: C.grey });
    return o;
  }
  const dots = (x0, pts, colour, r, op, open) => {
    const X = X0(x0);
    return pts.map(function (q) {
      return '<circle cx="' + X(q[0]).toFixed(1) + '" cy="' + Y(q[1]).toFixed(1) + '" r="' + r +
        (open ? '" fill="none" stroke="' + colour + '" stroke-width="0.8"' : '" fill="' + colour + '" fill-opacity="' + op)
        + '"/>';
    }).join("");
  };

  /* a. the training campaign, and the round aimed at the band it missed */
  (function () {
    const x0 = COL[0];
    let o = frame(x0, "a", "the development campaign");
    o += dots(x0, S.train, C.grey, 1.8, 0.45);
    o += dots(x0, S.hold, C.scalar, 2.1, 0.85);
    o += dots(x0, S.aimed, C.thermal, 2.4, 0.9);
    /* the three are disjoint, and the legend has to say so: the development
       test was drawn out of the same scan, not sampled separately, and the
       targeted round was added afterwards. Their sum is stated so a reader
       can check it against the counts elsewhere in the set. */
    [[C.grey, "scan, for training", S.train.length, 1.8, 0.45],
     [C.scalar, "scan, set aside for test", S.hold.length, 2.1, 0.85],
     [C.thermal, "targeted addition", S.aimed.length, 2.4, 0.9]].forEach(function (l, i) {
      const y = pbot - 45 + i * 11;
      o += '<circle cx="' + (x0 + 14) + '" cy="' + (y - 3) + '" r="' + l[3] + '" fill="' + l[0] + '" fill-opacity="' + l[4] + '"/>';
      o += T(x0 + 22, y, l[1] + ", " + l[2], { size: 8, fill: C.grey });
    });
    o += T(x0 + 14, pbot - 12, "disjoint sets, " +
      (S.train.length + S.hold.length + S.aimed.length) + " cases integrated",
      { size: 8, fill: SHADE.grey });
    b += o;
  })();

  /* b. the independent set, fixed by hash before any prediction existed */
  (function () {
    const x0 = COL[1];
    let o = frame(x0, "b", "the independent test set");
    o += dots(x0, S.train.concat(S.hold, S.aimed), C.grey, 1.5, 0.18);
    o += dots(x0, S.sealed, C.thermal, 2.2, 0.9);
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (pbot - 37) + '" r="2.2" fill="' + C.thermal + '"/>';
    o += T(x0 + 22, pbot - 34, "independent test, " + S.sealed.length, { size: 8, fill: SHADE.thermal });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (pbot - 26) + '" r="1.5" fill="' + C.grey + '" fill-opacity="0.35"/>';
    o += T(x0 + 22, pbot - 23, "training campaign, for reference", { size: 8, fill: C.grey });
    b += o;
    /* the box the final model accepts, which is what the two clouds define */
    const LABELS = { voltage_V: "voltage (V)", period_s: "period (s)", duty: "duty", tau_s: "residence time (s)" };
    /* the envelope is four intervals, so it is drawn as four intervals: a
       bracket with its ends labelled, rather than a row of bold numbers.
       Nothing here can be plotted against the panels above, because the box
       lives in the raw inputs and the panels are in two derived coordinates. */
    b += T(18, pbot + 44, "APPLICABILITY ENVELOPE OF THE FINAL MODEL", { size: 8, weight: "bold", fill: C.grey });
    b += T(487, pbot + 44, "no prediction is reported outside these four ranges", { size: 8, anchor: "end", fill: C.grey });
    b += line(18, pbot + 49, 487, pbot + 49, { stroke: C.rule, sw: 0.6 });
    S.bounds.forEach(function (r, i) {
      const x = 22 + i * 120, w = 88, y = pbot + 66;
      b += T(x, pbot + 61, LABELS[r.name] || r.name, { size: 8, fill: C.grey });
      b += line(x, y, x + w, y, { stroke: C.grey, sw: 0.9 });
      b += line(x, y - 3.5, x, y + 3.5, { stroke: C.grey, sw: 0.9 });
      b += line(x + w, y - 3.5, x + w, y + 3.5, { stroke: C.grey, sw: 0.9 });
      b += T(x, y + 13, String(r.lo), { size: 8 });
      b += T(x + w, y + 13, String(r.hi), { size: 8, anchor: "end" });
    });
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* What the prediction buys a designer: the window pulsing wins inside, */
/* and the baseline that claim has to be made against.                  */
/* ------------------------------------------------------------------ */
export function consequence(DATA) {
  /* The two sources are 250 and 250 pt tall, but the table stops well short of
     its own frame. Overlap them by 24 pt and cut the sheet where the table's
     last rule sits, rather than shipping a hundred points of white. */
  const ns = "rc", W = 505, OFF = 226, H = 386;
  const strip = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")
    .replace(/<rect width="505" height="\d+" fill="#FFFFFF"\/>/, "");
  let b = '<rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/>';
  b += strip(window_(DATA, ["a", "b"]));
  b += '<g transform="translate(0,' + OFF + ')">' + strip(comparison(DATA, ["c"])) + '</g>';
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* cost(). One condition on each calculation path, on one time axis.  */
/* Every number is measured, from runtime-comparison.json; the plate   */
/* names the machine because the seconds belong to it.                 */
/* ------------------------------------------------------------------ */
export function cost(DATA) {
  const ns = "rs7", W = 505, H = 232;
  const K = DATA.cost;
  let b = defs(ns);
  const x0 = 96, pw = 380, ptop = 34, pbot = 158;
  const LO = -3, HI = 3;
  const X = (v) => lin(lg(v), LO, HI, x0 + 6, x0 + pw - 6);
  const pow = (d) => "10^{" + String(d).replace("-", "−") + "}";

  b += rect(x0, ptop, pw, pbot - ptop, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
  for (let d = LO; d <= HI; d += 1) {
    b += line(X(Math.pow(10, d)), ptop, X(Math.pow(10, d)), pbot, { stroke: "#EFEFEF", sw: 0.4 });
    b += T(X(Math.pow(10, d)), pbot + 12, pow(d), { size: 8, anchor: "middle" });
  }
  b += T(x0 + pw / 2, pbot + 24, "wall-clock seconds for one condition", { size: 8.5, anchor: "middle" });

  /* transient Cantera: each timed case its own mark, so the spread is data,
     not a whisker */
  const yc = ptop + 34;
  b += T(x0 - 6, yc - 14, "transient Cantera", { size: 8.5, anchor: "end", weight: "bold" });
  b += T(x0 - 6, yc - 4, K.cantera.n + " sealed cases", { size: 8, anchor: "end", fill: C.grey });
  b += line(X(K.cantera.min), yc, X(K.cantera.max), yc, { stroke: C.grey, sw: 0.8 });
  K.cantera.cases.forEach(function (s) {
    b += '<circle cx="' + X(s).toFixed(1) + '" cy="' + yc + '" r="2.6" fill="none" stroke="'
      + C.grey + '" stroke-width="1"/>';
  });
  b += T(X(K.cantera.max) + 6, yc + 3, K.cantera.min.toFixed(0) + " to "
    + K.cantera.max.toFixed(0) + " s", { size: 8, fill: C.grey });

  /* the browser evaluation: median and p95 of the whole sealed set */
  const yb = pbot - 34;
  b += T(x0 - 6, yb - 14, "browser model", { size: 8.5, anchor: "end", weight: "bold", fill: SHADE.thermal });
  b += T(x0 - 6, yb - 4, K.browser.cases + " sealed cases", { size: 8, anchor: "end", fill: C.grey });
  b += line(X(K.browser.median / 1e3), yb, X(K.browser.max / 1e3), yb, { stroke: C.thermal, sw: 0.8 });
  b += '<circle cx="' + X(K.browser.median / 1e3).toFixed(1) + '" cy="' + yb + '" r="3" fill="' + C.thermal + '"/>';
  b += '<circle cx="' + X(K.browser.p95 / 1e3).toFixed(1) + '" cy="' + yb + '" r="2.6" fill="none" stroke="'
    + C.thermal + '" stroke-width="1"/>';
  b += T(X(K.browser.max / 1e3) + 6, yb + 3, "median " + K.browser.median.toFixed(1)
    + " ms,  p95 " + K.browser.p95.toFixed(0) + " ms", { size: 8, fill: SHADE.thermal });

  /* the gap between the rows is the result */
  const xm = X(Math.sqrt(K.browser.median / 1e3 * K.cantera.min));
  b += line(xm, yc + 10, xm, yb - 10, { stroke: C.ink, sw: 0.7, dash: "2 2" });
  b += T(xm + 6, (yc + yb) / 2 - 2, Math.round(K.speedup.median).toLocaleString("en-US") + "× faster",
    { size: 11, weight: "bold" });
  b += T(xm + 6, (yc + yb) / 2 + 10, "case-matched, " + Math.round(K.speedup.min).toLocaleString("en-US")
    + "× to " + Math.round(K.speedup.max).toLocaleString("en-US") + "×", { size: 8, fill: C.grey });

  b += T(x0, H - 8, "Measured on " + K.machine + ". The seconds belong to that machine; "
    + "the ratio is the result.", { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}
