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

    /* selectivity is only drawn where there is enough conversion for it to
       mean anything; below that it is a ratio of vanishing mole fractions */
    const useful = cs.filter((c) => c.meaningful);
    const cut = useful[0].TC;
    o += '<rect x="' + X(cs[0].TC) + '" y="' + (ptop + 1) + '" width="' + (X(cut) - X(cs[0].TC)) +
      '" height="' + (ph - 2) + '" fill="#F4F4F4"/>';
    o += T(x0 + 16, pbot - 32, "below 0.1 % conversion,", { size: 8, fill: C.grey });
    o += T(x0 + 16, pbot - 22, "selectivity not drawn", { size: 8, fill: C.grey });
    [[cs, "X", C.thermal], [useful, "S", C.scalar], [cs, "CO", C.gas]].forEach(function (spec) {
      let d = "";
      spec[0].forEach(function (c, j) { d += (j ? " L" : "M") + X(c.TC) + "," + Y(c[spec[1]]); });
      o += '<path d="' + d + '" fill="none" stroke="' + spec[2] + '" stroke-width="1.6"/>';
    });
    const last = cs[cs.length - 1];
    o += T(x0 + pw - 8, Y(last.S) - 7, "C₂ selectivity", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.scalar });
    o += T(x0 + pw - 8, Y(last.X) + 12, "CH₄ conversion", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.thermal });
    o += T(x0 + pw - 8, Y(last.CO) + 12, "CO out", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.gas });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 1. The two model layers the application carries, and what each  */
/* one is for. Tab names are those of the application at the stamped    */
/* revision.                                                            */
/* ------------------------------------------------------------------ */
export function workflow(DATA) {
  const ns = "r1", W = 505, H = 332;
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
      o += T(x + 8, y + 44, t.tab, { size: 9, weight: "bold", fill: shadeOf(hue) });
      t.does.forEach(function (d, k) {
        o += T(x + 8, y + 57 + k * 10, d, { size: 8, fill: C.grey });
      });
    });
    o += T(28, y + h - 10, note, { size: 8, fill: C.grey });
    return o;
  };

  /* the toy: arbitrary units, but it is the layer that explains anything */
  b += lane(20, 118, C.gas, "THE TWO-STEP TOY",
    "why does pulsing help at all", [
    { tab: "When Pulsing Helps", does: ["one activation energy and a duty",
        "compares ⟨k⟩ against k(⟨T⟩)", "answers before anything is integrated"] },
    { tab: "A → B → C", does: ["periodic CSTR on the drive's own T(t)",
        "conversion, intermediate yield, selectivity", "against a continuous run at equal conversion"] }
  ], "Arbitrary kinetics, so the yields are not a claim about any real chemistry. This layer isolates the averaging effect.");

  /* the predictor: real chemistry, and the only layer that gives a number */
  b += lane(154, 118, C.thermal, "THE DETAILED-CHEMISTRY PREDICTOR",
    "how much methane actually converts", [
    { tab: "Kinetic Effect", does: ["voltage, period, duty, residence time",
        "CJH conversion from the steady map", "RPH conversion from map plus correction"] },
    { tab: "How RPH Is Predicted", does: ["the map, the transients, the frozen model",
        "the sealed test and its verdict", "the boundary outside which it refuses"] }
  ], "GRI-Mech 3.0 on a fixed feed. Conversion only: no selectivity is predicted here, because none was validated.");

  b += line(252, 138, 252, 154, { stroke: C.hair, sw: 0.8, dash: "2 2" });
  b += T(258, 150, "both layers drive off the same element T(t)", { size: 8, fill: C.grey });

  b += rect(18, 282, 469, 28, { stroke: C.hair, fill: TINT.grey, sw: 0.8, dash: "3 2" });
  b += T(28, 299, "SUPPORTING", { size: 8, weight: "bold", fill: C.grey });
  [["Calculations", "every equation the page evaluates"],
   ["How to Cite", "the paper this tool accompanies"]].forEach(function (t, i) {
    const x = 120 + i * 190;
    b += T(x, 294, t[0], { size: 8.5, weight: "bold", fill: SHADE.grey });
    b += T(x, 304, t[1], { size: 8, fill: C.grey });
  });
  b += T(18, 326, "Every tab calls apps/rphcjh/solver.js, and the predictor adds apps/rphcjh/surrogate.js, so the browser and the tests run identical code.",
    { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. S1. What each part of the solver is checked against. The split */
/* is between what is integrated and what is exact by construction.    */
/* ------------------------------------------------------------------ */
export function verification(DATA) {
  const ns = "rs1", W = 505, H = 300;
  const V = DATA.verify;
  let b = defs(ns);
  const LX = 22, NX = 372, WX = 488;
  const sci = (v) => {
    if (v === 0) return "0";
    const e = Math.floor(lg(Math.abs(v)));
    return (v / Math.pow(10, e)).toFixed(1) + " × 10^{" + String(e).replace("-", "−") + "}";
  };

  b += T(LX, 22, "CHECK, AND WHAT IT IS CHECKED AGAINST", { size: 8, weight: "bold", fill: C.grey });
  b += T(NX, 22, "CASES", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
  b += T(WX, 22, "WORST RESIDUAL", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
  b += line(LX, 27, WX, 27, { stroke: C.ink, sw: 0.9 });

  /* the reference sits under the check rather than in a column of its own:
     at this width a second column would run into the first */
  let y = 44;
  const section = (title, note, rows) => {
    b += T(LX, y, title.toUpperCase(), { size: 8, weight: "bold", fill: SHADE.grey });
    b += T(WX, y, note, { size: 8, anchor: "end", fill: C.grey });
    b += line(LX, y + 5, WX, y + 5, { stroke: C.rule, sw: 0.6 });
    y += 18;
    rows.forEach(function (r) {
      b += T(LX + 8, y, r.q, { size: 8.5 });
      b += T(NX, y, String(r.n), { size: 8.5, anchor: "end", fill: C.grey });
      b += T(WX, y, r.worstText, { size: 8.5, anchor: "end" });
      b += T(LX + 8, y + 10, r.against, { size: 8, fill: C.grey });
      y += 26;
    });
    y += 6;
  };
  section("Integrated with a finite step", "limited by the step",
    V.integrated.map((r) => Object.assign({ worstText: sci(r.worst) + " " + r.unit }, r)));
  section("Exact by construction", "limited by the arithmetic",
    V.exact.map((r) => Object.assign({ worstText: sci(r.worst) + " " + r.unit }, r)));
  section("Periodic under stress", "the fixed point returns to itself however fast the hot step runs",
    V.stiff.map((r) => ({
      q: r.volts + " V drive, peak " + r.tPeak.toFixed(0) + " °C",
      against: "k₁ at the peak reaches " + sci(r.k1) + " s⁻¹, and x_{B} stays inside [0, 1]",
      n: 1, worstText: sci(r.drift) + " drift over a cycle"
    })));
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. S2. Where each layer of the model stops. Read left to right:   */
/* what is solved, on what assumption, and what that forbids.          */
/* ------------------------------------------------------------------ */
export function boundaries(DATA) {
  const ns = "rs2", W = 505, H = 314;
  let b = defs(ns);
  const LX = 22, EX = 488;
  const rows = [
    { layer: "The element", hue: C.thermal,
      solved: "One temperature, integrated as m c_{p}(T) dT/dt = V²/R(T) − losses(T).",
      because: "Measured spatial uniformity and a 210 µm thickness make it thermally thin.",
      forbids: "Any question about gradients inside the element, or any element that is not thin." },
    { layer: "The reactor", hue: C.gas,
      solved: "An ideal CSTR at the element's temperature, with A → B → C first order in both steps.",
      because: "The network is the smallest one that carries a selectivity to an intermediate.",
      forbids: "Absolute yields. It isolates the averaging effect; it does not predict a mechanism." },
    { layer: "The coupling", hue: C.scalar,
      solved: "Temperature drives chemistry, one way.",
      because: "Reaction heat is small against the electrical power at these conversions.",
      forbids: "Anything where conversion feeds back on temperature, or a runaway." },
    { layer: "The detailed check", hue: C.grey,
      solved: "Steady one-dimensional plug flow, gas phase only, from committed offline runs.",
      because: "Hot-zone residence is milliseconds against pulse periods of order a second.",
      forbids: "Surface chemistry, and any transient the plug-flow states cannot be blended into." }
  ];

  b += T(LX, 22, "LAYER", { size: 8, weight: "bold", fill: C.grey });
  b += T(LX + 104, 22, "WHAT IS SOLVED", { size: 8, weight: "bold", fill: C.grey });
  b += line(LX, 27, EX, 27, { stroke: C.ink, sw: 0.9 });

  let y = 44;
  rows.forEach(function (r, i) {
    if (i) b += line(LX, y - 13, EX, y - 13, { stroke: "#EAEAEA", sw: 0.5 });
    b += '<rect x="' + LX + '" y="' + (y - 7) + '" width="4" height="46" fill="' + r.hue + '"/>';
    b += T(LX + 10, y, r.layer, { size: 9, weight: "bold", fill: shadeOf(r.hue) });
    b += T(LX + 104, y, r.solved, { size: 8.5 });
    b += T(LX + 104, y + 13, "why that is allowed:  " + r.because, { size: 8, fill: C.grey });
    b += T(LX + 104, y + 26, "so do not ask it:  " + r.forbids, { size: 8, fill: SHADE.thermal });
    y += 62;
  });
  b += line(LX, y - 13, EX, y - 13, { stroke: C.ink, sw: 0.9 });
  b += T(LX, y, "No layer carries oxidation, sublimation or a lifetime model, so a temperature", { size: 8.5, fill: C.grey });
  b += T(LX, y + 11, "the element reaches here is not a temperature it survives.", { size: 8.5, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. S3. The module the page and the tests both call, and the gates */
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
/* Fig. 6. The steady CJH map the predictor reads, and the map checked */
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
    o += T(cbx - 3, cby + 6, "0", { size: 7.5, anchor: "end", fill: C.grey });
    o += T(cbx + cbw + 3, cby + 6, "1", { size: 7.5, fill: C.grey });
    o += T(cbx + cbw / 2, cby - 4, "CH₄ conversion", { size: 7.5, anchor: "middle", fill: C.grey });
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
    o += T(x0 + pw - 6, Y(V.gate) - 4, "promotion gate " + V.gate, { size: 8, anchor: "end", fill: SHADE.thermal });
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
/* Fig. 7. The memory effect in the transient campaign, and what the  */
/* learned correction does to the quasi-steady shortfall.              */
/* ------------------------------------------------------------------ */
export function memory(DATA) {
  const ns = "r7", W = 505, H = 250;
  const M = DATA.mem;
  let b = defs(ns);
  const pw = 190, ph = 160, ptop = 30, pbot = 190;
  const COL = [58, 300];

  /* a. how far the transient leaves its quasi-steady baseline */
  (function () {
    const x0 = COL[0];
    const X = (v) => lin(lg(v), -2, 3, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(lg(Math.min(Math.max(v, 0.1), 10)), -1, 1, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "a", { size: 11, weight: "bold" });
    if (M.band) {
      o += '<rect x="' + X(M.band.lo).toFixed(1) + '" y="' + (ptop + 1) + '" width="' +
        (X(M.band.hi) - X(M.band.lo)).toFixed(1) + '" height="' + (ph - 2) + '" fill="#F4F4F4"/>';
    }
    [0.1, 0.3, 1, 3, 10].forEach(function (g) {
      o += line(x0, Y(g), x0 + pw, Y(g), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(g) + 3, String(g), { size: 8, anchor: "end", fill: C.grey });
    });
    [0.01, 0.1, 1, 10, 100].forEach(function (v) {
      o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" });
    });
    o += T(x0 + pw / 2, pbot + 24, "pulse period / residence time", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 28) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 28) + ' ' + ((ptop + pbot) / 2) + ')">transient / quasi-steady conversion</text>';
    o += line(x0, Y(1), x0 + pw, Y(1), { stroke: C.ink, sw: 0.9, dash: "3 2" });
    o += T(x0 + pw - 6, Y(0.52), "quasi-steady, ratio 1", { size: 8, anchor: "end", fill: C.grey });
    M.cases.forEach(function (c) {
      o += '<circle cx="' + X(c.pt).toFixed(1) + '" cy="' + Y(c.gain).toFixed(1) + '" r="2" fill="' + C.thermal + '" fill-opacity="0.55"/>';
    });
    const top = M.cases.reduce((a, c) => (c.gain > a.gain ? c : a));
    o += T(Math.min(X(top.pt) + 5, x0 + pw - 46), Y(top.gain) + 2, "up to " + M.gainMax.toFixed(1) + "x",
      { size: 8.5, weight: "bold", fill: SHADE.thermal });
    if (M.band) o += T((X(M.band.lo) + X(M.band.hi)) / 2, ptop + 12, "gain ≥ 2", { size: 8, anchor: "middle", fill: C.grey });
    b += o;
  })();

  /* b. the correction against the shortfall it corrects */
  (function () {
    const x0 = COL[1];
    const A = (v) => lg(Math.min(Math.max(v, 1e-7), 1));
    const X = (v) => lin(A(v), -7, 0, x0 + 12, x0 + pw - 12);
    const Y = (v) => lin(A(v), -7, 0, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 40, ptop - 8, "b", { size: 11, weight: "bold" });
    for (let d = -7; d <= 0; d += 2) {
      o += line(x0, Y(Math.pow(10, d)), x0 + pw, Y(Math.pow(10, d)), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(Math.pow(10, d)) + 3, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "end", fill: C.grey });
      o += T(X(Math.pow(10, d)), pbot + 12, "10^{" + String(d).replace("-", "−") + "}", { size: 8, anchor: "middle" });
    }
    o += T(x0 + pw / 2, pbot + 24, "|X_{qs} − X_{dyn}|, the shortcut's error", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 30) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 30) + ' ' + ((ptop + pbot) / 2) + ')">corrected prediction error</text>';
    o += line(X(1e-7), Y(1e-7), X(1), Y(1), { stroke: C.ink, sw: 0.9, dash: "3 2" });
    o += T(X(2e-2), Y(4e-2), "no improvement", { size: 8, anchor: "end", fill: C.grey });
    M.cases.forEach(function (c) {
      if (c.e1 === null || c.holdout) return;
      o += '<circle cx="' + X(c.e0).toFixed(1) + '" cy="' + Y(c.e1).toFixed(1) + '" r="1.5" fill="' + C.grey + '" fill-opacity="0.45"/>';
    });
    M.cases.forEach(function (c) {
      if (c.e1 === null || !c.holdout) return;
      o += '<circle cx="' + X(c.e0).toFixed(1) + '" cy="' + Y(c.e1).toFixed(1) + '" r="2.2" fill="' + C.thermal + '" fill-opacity="0.85"/>';
    });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (ptop + 14) + '" r="2.2" fill="' + C.thermal + '"/>';
    o += T(x0 + 20, ptop + 17, "held out, " + M.holdoutN + " cases", { size: 8, fill: SHADE.thermal });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (ptop + 26) + '" r="1.5" fill="' + C.grey + '"/>';
    o += T(x0 + 20, ptop + 29, "seen in fitting", { size: 8, fill: C.grey });
    o += T(x0 + pw - 8, pbot - 24, "held-out mean " + sciT(M.hold.mean), { size: 8, anchor: "end", weight: "bold" });
    o += T(x0 + pw - 8, pbot - 14, "p95 " + sciT(M.hold.p95) + ",  max " + sciT(M.hold.max), { size: 8, anchor: "end" });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 8. The sealed test: 64 cases frozen before any prediction      */
/* existed, integrated once in Cantera, compared once.                 */
/* ------------------------------------------------------------------ */
export function finalparity(DATA) {
  const ns = "r8", W = 505, H = 250;
  const F = DATA.final;
  let b = defs(ns);
  const pw = 190, ph = 160, ptop = 30, pbot = 190;
  const COL = [58, 300];

  /* a. parity, the shortcut and the corrected prediction side by side */
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
    o += T(x0 + pw - 8, Y(0.95) + 9, "p95", { size: 7.5, anchor: "end", fill: C.grey });
    o += line(X(0.05), ptop, X(0.05), pbot, { stroke: C.ink, sw: 0.7, dash: "2 2" });
    o += T(X(0.05) - 3, ptop + 10, "p95 gate 0.05", { size: 7.5, anchor: "end", fill: C.grey });
    o += line(x0 + 8, ptop + 14, x0 + 24, ptop + 14, { stroke: C.thermal, sw: 1.6 });
    o += T(x0 + 28, ptop + 17, "with correction", { size: 8, fill: SHADE.thermal });
    o += line(x0 + 8, ptop + 26, x0 + 24, ptop + 26, { stroke: C.grey, sw: 1.2, dash: "3 2" });
    o += T(x0 + 28, ptop + 29, "CJH shortcut only", { size: 8, fill: C.grey });
    o += T(x0 + pw - 8, pbot - 24, "mean " + sciT(F.mean) + " against " + sciT(F.cjhMean), { size: 8, anchor: "end", weight: "bold" });
    o += T(x0 + pw - 8, pbot - 14, "verdict " + F.verdict + ", all four gates", { size: 8, anchor: "end" });
    b += o;
  })();
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 9. How one training label is made, and how the correction is   */
/* learned from it. The worked case is the strongest memory effect in  */
/* the campaign, selected by rule so it cannot be a flattering pick.   */
/* ------------------------------------------------------------------ */
export function method(DATA) {
  const ns = "r9", W = 505, H = 316;
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
  b += T(34, 22, "MAKING ONE TRAINING LABEL", { size: 8, weight: "bold", fill: C.grey });
  b += T(487, 22, "worked on the campaign's strongest memory case", { size: 8, anchor: "end", fill: C.grey });

  const ay = 32;
  b += box(18, ay, 108, 46, "Drive", [E.voltage + " V,  " + E.period + " s",
                                      (100 * E.duty).toFixed(1) + " % duty"], C.scalar, TINT.scalar);
  b += arrow(ns, "M126," + (ay + 23) + " L140," + (ay + 23), { color: "hair" });
  b += box(141, ay, 112, 46, "Element ODE", ["peak " + E.tPeak.toFixed(0) + " °C",
                                             "minimum " + E.tMin.toFixed(0) + " °C"], C.thermal, TINT.thermal);
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
  b += rect(18, cy, 368, 30, { stroke: C.ink, fill: "#FFFFFF", sw: 1.1 });
  b += T(202, cy + 13, "label  δ  =  logit X_{dyn}  −  logit X_{qs}  =  " + E.delta.toFixed(2),
    { size: 9, weight: "bold", anchor: "middle" });
  b += T(202, cy + 24, "a ratio of odds, so a rare event and a common one are corrected on one scale",
    { size: 8, anchor: "middle", fill: C.grey });

  /* the numbers on the right, so the diagram carries its own arithmetic */
  b += rect(396, ay, 91, cy + 30 - ay, { stroke: C.hair, fill: TINT.panel, sw: 0.8, dash: "3 2" });
  b += T(404, ay + 14, "THIS CASE", { size: 8, weight: "bold", fill: C.grey });
  [["period / τ", (E.period / E.tau).toFixed(1)], ["residence τ", E.tau + " s"],
   ["X_{qs}", String(E.xQs)], ["X_{dyn}", String(E.xDyn)],
   ["ratio", E.gain.toFixed(2) + "x"], ["δ observed", E.delta.toFixed(2)],
   ["δ predicted", E.deltaHat === null ? "n/a" : E.deltaHat.toFixed(2)],
   ["X predicted", E.xPred === null ? "n/a" : String(E.xPred)]].forEach(function (r, i) {
    b += T(404, ay + 28 + i * 12, r[0], { size: 8, fill: C.grey });
    b += T(479, ay + 28 + i * 12, r[1], { size: 8, anchor: "end", weight: i >= 6 ? "bold" : "normal",
                                          fill: i >= 6 ? SHADE.thermal : C.ink });
  });

  /* b. the model that turns five numbers into that correction */
  const dy = 218;
  b += T(18, dy, "b", { size: 11, weight: "bold" });
  b += T(34, dy, "LEARNING AND APPLYING THE CORRECTION", { size: 8, weight: "bold", fill: C.grey });
  const ey = dy + 10;
  b += rect(18, ey, 128, 62, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
  b += T(82, ey + 13, "Five inputs", { size: 8.5, weight: "bold", anchor: "middle", fill: SHADE.ink });
  G.features.forEach(function (f, i) {
    b += T(26, ey + 25 + i * 9, "· " + f.label, { size: 7.5, fill: C.grey });
  });
  b += arrow(ns, "M146," + (ey + 31) + " L160," + (ey + 31), { color: "hair" });
  b += rect(161, ey, 132, 62, { stroke: C.ink, fill: "#FFFFFF", sw: 1.1 });
  b += T(227, ey + 14, "Gaussian process", { size: 9, weight: "bold", anchor: "middle" });
  b += T(227, ey + 25, G.kernel, { size: 7.5, anchor: "middle", fill: C.grey });
  b += T(227, ey + 35, G.nTrain + " cases fitted, " + G.nHold + " held out", { size: 7.5, anchor: "middle", fill: C.grey });
  b += T(227, ey + 45, "noise σ_{n} = " + G.sigmaN + " in log-odds", { size: 7.5, anchor: "middle", fill: C.grey });
  b += T(227, ey + 56, "returns the correction δ", { size: 8, anchor: "middle", weight: "bold", fill: SHADE.thermal });
  b += arrow(ns, "M293," + (ey + 31) + " L307," + (ey + 31), { color: "hair" });
  b += rect(308, ey, 179, 62, { stroke: C.edge, fill: TINT.thermal, sw: 0.8 });
  b += T(397, ey + 14, "X_{pred} = σ( logit X_{qs} + δ )", { size: 9, weight: "bold", anchor: "middle", fill: SHADE.thermal });
  b += T(316, ey + 28, "The sigmoid cannot leave (0, 1), so no", { size: 7.5, fill: C.grey });
  b += T(316, ey + 37, "correction can return an impossible conversion.", { size: 7.5, fill: C.grey });
  b += T(316, ey + 49, "A zero-mean prior sends δ to 0 away from the", { size: 7.5, fill: C.grey });
  b += T(316, ey + 58, "data, which is also the long-period limit.", { size: 7.5, fill: C.grey });

  b += T(18, 308, "Scope of every number above: " + G.scope.feed + " at " + G.scope.pressure_atm +
    " atm, " + G.scope.mechanism + ", " + G.scope.closure + ", element peak below " +
    G.scope.peak_cap_c + " °C.", { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. S4. What the fitted kernel says each input is worth, and what  */
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
    o += T(34, 22, "WHAT THE FITTED KERNEL USES", { size: 8, weight: "bold", fill: C.grey });
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
    o += T(34, ytop - 18, "MEASURED ON THE HELD-OUT CASES", { size: 8, weight: "bold", fill: C.grey });
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
    o += T(LX, y + 2, "Gates, all fixed before the model was fitted:", { size: 8, fill: C.grey });
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
/* Fig. S5. Where the campaign spent its Cantera runs, and where the   */
/* sealed test sits relative to them.                                  */
/* ------------------------------------------------------------------ */
export function designspace(DATA) {
  const ns = "rs5", W = 505, H = 250;
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
    let o = frame(x0, "a", "what the model was fitted on");
    o += dots(x0, S.train, C.grey, 1.8, 0.45);
    o += dots(x0, S.hold, C.scalar, 2.1, 0.85);
    o += dots(x0, S.aimed, C.thermal, 2.4, 0.9);
    [[C.grey, "Halton scan", S.train.length, 1.8, 0.45],
     [C.scalar, "held out", S.hold.length, 2.1, 0.85],
     [C.thermal, "round two, aimed", S.aimed.length, 2.4, 0.9]].forEach(function (l, i) {
      const y = pbot - 34 + i * 11;
      o += '<circle cx="' + (x0 + 14) + '" cy="' + (y - 3) + '" r="' + l[3] + '" fill="' + l[0] + '" fill-opacity="' + l[4] + '"/>';
      o += T(x0 + 22, y, l[1] + ", " + l[2], { size: 8, fill: C.grey });
    });
    b += o;
  })();

  /* b. the sealed set, frozen by hash before any prediction existed */
  (function () {
    const x0 = COL[1];
    let o = frame(x0, "b", "what it was finally tested on");
    o += dots(x0, S.train.concat(S.hold, S.aimed), C.grey, 1.5, 0.18);
    o += dots(x0, S.sealed, C.thermal, 2.2, 0.9);
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (pbot - 37) + '" r="2.2" fill="' + C.thermal + '"/>';
    o += T(x0 + 22, pbot - 34, "sealed test, " + S.sealed.length, { size: 8, fill: SHADE.thermal });
    o += '<circle cx="' + (x0 + 14) + '" cy="' + (pbot - 26) + '" r="1.5" fill="' + C.grey + '" fill-opacity="0.35"/>';
    o += T(x0 + 22, pbot - 23, "training campaign, for reference", { size: 8, fill: C.grey });
    b += o;
  })();
  return svgDoc(W, H, b);
}
