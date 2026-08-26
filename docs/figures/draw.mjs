// Artwork for the Application Note figures. Authored in points, so a viewBox
// unit is a printed point and font-size 9 is 9 pt on the page. Every function
// takes the data object make-figures.mjs builds from apps/joule/solver.js;
// nothing here knows a number of its own.
//
// This file is used twice: imported by make-figures.mjs to write the SVGs, and
// inlined into the published figure page with the `export ` keywords stripped.

/* ------------------------------------------------------------------ */
/* Drawing helpers. Every figure is authored in points, so a viewBox   */
/* unit is a printed point and a font-size of 9 is 9 pt on the page.   */
/* ------------------------------------------------------------------ */
/* Five role hues, unchanged, plus two derivations of each so a diagram can
   be built out of one family instead of five saturated outlines: TINT is the
   hue mixed 14 % into white and is the only fill a box gets, SHADE is the hue
   darkened for type, which amber and green need to hold contrast at 8 pt.
   Structure, meaning borders and connectors, is neutral: colour is reserved
   for the thing being named. */
const C = { scalar:"#0072B2", field:"#E69F00", thermal:"#D55E00", gas:"#009E73",
            grey:"#6E6E6E", ink:"#111111", rule:"#BBBBBB", faint:"#8A8A8A",
            hair:"#AEB6BD", edge:"#C9CFD5" };
const TINT = { scalar:"#DBEBF4", field:"#FCF2DB", thermal:"#F9E9DB", gas:"#DBF1EB",
               grey:"#EDEFF1", wall:"#E8E8E8", air:"#F7F7F7", panel:"#FBFBFB" };
const SHADE = { scalar:"#005B8F", field:"#9A6C00", thermal:"#A84A00", gas:"#00785A",
                grey:"#4A5058", ink:"#111111" };
const shadeOf = (hue) => SHADE[Object.keys(C).find((k) => C[k] === hue)] || hue;
const tintOf = (hue) => TINT[Object.keys(C).find((k) => C[k] === hue)] || "#FFFFFF";
const ZWS = "​";

const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

/* _{..} and ^{..} become tspans one point smaller, so nothing on any
   figure falls below the 8 pt floor as long as the base size is 9. */
function rich(x, y, s, o) {
  o = o || {};
  const size = o.size || 9, sub = Math.max(8, size - 1);
  const fill = o.fill || C.ink, anchor = o.anchor || "start", weight = o.weight || "normal";
  let out = "", last = 0, m;
  const re = /([_^])\{([^}]*)\}/g;
  while ((m = re.exec(s))) {
    out += esc(s.slice(last, m.index));
    const dy = m[1] === "_" ? 1.9 : -3.1;
    out += '<tspan font-size="' + sub + '" dy="' + dy + '">' + esc(m[2]) +
           '</tspan><tspan dy="' + (-dy) + '">' + ZWS + '</tspan>';
    last = re.lastIndex;
  }
  out += esc(s.slice(last));
  return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill +
         '" text-anchor="' + anchor + '" font-weight="' + weight + '">' + out + '</text>';
}
const T = rich;

function rect(x, y, w, h, o) {
  o = o || {};
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
    '" rx="' + (o.rx === undefined ? 2 : o.rx) + '" fill="' + (o.fill || "#FFFFFF") +
    '" stroke="' + (o.stroke || C.grey) + '" stroke-width="' + (o.sw || 0.8) + '"' +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") + '/>';
}
function line(x1, y1, x2, y2, o) {
  o = o || {};
  return '<path d="M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2 + '" fill="none" stroke="' +
    (o.stroke || C.rule) + '" stroke-width="' + (o.sw || 0.5) + '"' +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") + '/>';
}
function defs(ns) {
  return '<defs>' + Object.keys(C).map(function (k) {
    return '<marker id="' + ns + '-' + k + '" viewBox="0 0 10 8" refX="9.4" refY="4" ' +
      'markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="' +
      C[k] + '"/></marker>';
  }).join("") + '</defs>';
}
function arrow(ns, d, o) {
  o = o || {};
  const c = o.color || "grey";
  return '<path d="' + d + '" fill="none" stroke="' + C[c] + '" stroke-width="' + (o.sw || 0.9) +
    '"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") +
    ' marker-end="url(#' + ns + '-' + c + ')"' + (o.start ? ' marker-start="url(#' + ns + '-' + c + ')"' : "") + '/>';
}
function svgDoc(w, h, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + 'pt" height="' + h + 'pt" ' +
    'viewBox="0 0 ' + w + ' ' + h + '" font-family="Arial, Helvetica, sans-serif">' +
    '<rect width="' + w + '" height="' + h + '" fill="#FFFFFF"/>' + body + '</svg>';
}
/* A titled stage box with an explanatory second line. */
function stage(x, y, w, h, title, sub, color, fill) {
  return rect(x, y, w, h, { stroke: C.edge, fill: fill || tintOf(color), sw: 0.8 }) +
    T(x + w / 2, y + (sub ? 13 : h / 2 + 3.2), title, { size: 9.5, weight: "bold", anchor: "middle", fill: shadeOf(color) }) +
    (sub ? T(x + w / 2, y + 24, sub, { size: 8.5, anchor: "middle", fill: C.grey }) : "");
}

/* ------------------------------------------------------------------ */
/* Figure 1. Order of computation.                                     */
/* ------------------------------------------------------------------ */
export function solverLoop(DATA) {
  const ns = "s3", W = 505, H = 636;
  const sx = 127.5, sw = 250, cx = sx + sw / 2;
  let b = defs(ns);

  b += stage(sx, 12, sw, 28, "Inputs", "geometry, material, drive setting, enclosure", C.grey);
  b += arrow(ns, "M" + cx + ",40 L" + cx + ",53");
  b += stage(sx, 54, sw, 28, "Zero-dimensional steady state", "single temperature, used as the seed", C.scalar, TINT.scalar);
  b += arrow(ns, "M" + cx + ",82 L" + cx + ",95");
  b += stage(sx, 96, sw, 28, "Build the axisymmetric mesh", "built once and held fixed", C.grey);
  b += arrow(ns, "M" + cx + ",124 L" + cx + ",137");

  /* the Picard frame */
  b += rect(26, 138, 453, 254, { stroke: C.hair, fill: TINT.panel, sw: 1, dash: "3 2" });
  b += T(36, 153, "Outer Picard iteration", { size: 10, weight: "bold" });
  b += T(163, 153, "coefficients re-evaluated from the current temperature field", { size: 8.5, fill: C.grey });

  const cols = [
    { x: 34, c: C.scalar, tint: TINT.scalar, key: "scalar", head: "Scalar electrical", role: "one scalar power",
      items: [{ t: "T_{avg}   volume average" },
              { t: "ρ(T_{avg})   resistivity" },
              { t: "R_{bulk} = ρ L / A" },
              { t: "R_{total} = R_{bulk} + 2R_{c}" },
              { t: "I   set by R_{total}" },
              { t: "P_{bulk} = I² R_{bulk}" },
              { t: "P_{contact} = I² · 2R_{c}", off: true }] },
    { x: 186, c: C.field, tint: TINT.field, key: "field", head: "Local electrical field", role: "spatial distribution only",
      items: [{ t: "T(r,z)   temperature field" },
              { t: "σ(T) = 1 / ρ(T)" },
              { t: "∇·(σ ∇V) = 0" },
              { t: "q‴_{unit}(r,z)" }] },
    { x: 338, c: C.thermal, tint: TINT.thermal, key: "thermal", head: "Thermal properties", role: "matrix coefficients",
      items: [{ t: "k(T)   conduction" },
              { t: "c_{p}(T)   transient only" },
              { t: "h_{rad}   radiation" }] }
  ];
  cols.forEach(function (col) {
    b += T(col.x, 171, col.head, { size: 9.5, weight: "bold", fill: shadeOf(col.c) });
    b += T(col.x, 181, col.role, { size: 8, fill: C.grey });
    col.items.forEach(function (it, i) {
      const y = 186 + i * 25;
      if (it.off) {
        b += rect(col.x, y, 137, 17, { stroke: C.hair, fill: "#FFFFFF", sw: 0.7, dash: "2.5 2" });
        b += T(col.x + 6, y + 11.6, it.t, { size: 9, fill: C.grey });
        b += T(col.x, y + 27, "reported; not deposited in", { size: 8, fill: C.grey });
        b += T(col.x, y + 37, "the thermal domain", { size: 8, fill: C.grey });
        return;
      }
      b += rect(col.x, y, 137, 17, { stroke: C.edge, fill: col.tint, sw: 0.7 });
      b += T(col.x + 6, y + 11.6, it.t, { size: 9 });
      const next = col.items[i + 1];
      if (next && !next.off) b += arrow(ns, "M" + (col.x + 68.5) + "," + (y + 17) + " L" + (col.x + 68.5) + "," + (y + 25), { color: col.key, sw: 0.8 });
      if (next && next.off) b += line(col.x + 68.5, y + 17, col.x + 68.5, y + 25, { stroke: C.grey, sw: 0.8, dash: "2 2" });
    });
  });

  b += arrow(ns, "M" + cx + ",392 L" + cx + ",407");
  b += stage(sx, 408, sw, 28, "Assemble the thermal matrix", "one row per finite-volume cell", C.thermal, TINT.thermal);
  b += arrow(ns, "M" + cx + ",436 L" + cx + ",449");
  b += rect(sx, 450, sw, 40, { stroke: C.thermal, fill: TINT.thermal, sw: 1 });
  b += T(cx, 463, "Preconditioned linear solve", { size: 9.5, weight: "bold", anchor: "middle", fill: C.thermal });
  b += T(cx, 474, "PCG for a symmetric matrix,", { size: 8.5, anchor: "middle", fill: C.grey });
  b += T(cx, 484, "BiCGSTAB when gas transport breaks symmetry", { size: 8.5, anchor: "middle", fill: C.grey });
  b += arrow(ns, "M" + cx + ",490 L" + cx + ",505");
  b += stage(sx, 506, sw, 28, "Relax the temperature field", "under-relaxed update", C.thermal, TINT.thermal);
  b += arrow(ns, "M" + cx + ",534 L" + cx + ",547");
  b += stage(sx, 548, sw, 30, "Convergence and energy closure", "field change, and the residual power balance", C.ink);
  b += arrow(ns, "M" + cx + ",578 L" + cx + ",593");
  b += stage(sx, 594, sw, 28, "Converged fields", "T(r,z), power distribution, loss channels", C.grey);

  /* the return path */
  b += arrow(ns, "M" + sx + ",563 L14,563 L14,232 L25,232", { color: "ink", sw: 1 });
  b += '<text x="10" y="410" font-size="8.5" fill="' + C.ink + '" text-anchor="middle" transform="rotate(-90 10 410)">not converged</text>';
  b += T(sx + 6, 590, "converged", { size: 8.5, fill: C.grey });

  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Figure 2. Rectangular element to equivalent cylinder.               */
/* ------------------------------------------------------------------ */
export function cylinderMapping(DATA) {
  const ns = "s4", W = 505, H = 358, s = 4.474;   /* pt per mm, both drawings */
  const S = DATA.strip, Q = DATA.cyl;
  let b = defs(ns);

  b += T(32, 20, "Rectangular element, as specified", { size: 9.5, weight: "bold" });
  b += T(300, 20, "Cylinder the axisymmetric solver meshes", { size: 9.5, weight: "bold" });

  /* strip, plan and edge view at the same scale as the cylinder */
  const sl = S.L * s, sw2 = S.W * s, sh = S.H * s;
  b += rect(32, 30, sl, sw2, { stroke: C.field, fill: TINT.field, sw: 1, rx: 0 });
  b += T(32 + sl / 2, 30 + sw2 / 2 + 3.2, "plan", { size: 8.5, anchor: "middle", fill: C.grey });
  b += line(32, 78, 32 + sl, 78, { stroke: C.grey, sw: 0.6 });
  b += T(32 + sl / 2, 88, S.L.toFixed(2) + " mm", { size: 8.5, anchor: "middle" });
  b += line(24, 30, 24, 30 + sw2, { stroke: C.grey, sw: 0.6 });
  b += '<text x="16" y="' + (30 + sw2 / 2) + '" font-size="8.5" fill="' + C.ink + '" text-anchor="middle" transform="rotate(-90 16 ' + (30 + sw2 / 2) + ')">' + S.W.toFixed(2) + ' mm</text>';
  b += rect(32, 100, sl, sh, { stroke: C.field, fill: C.field, sw: 0.6, rx: 0 });
  b += T(32, 116, "edge view, same scale", { size: 8.5, fill: C.grey });
  b += arrow(ns, "M" + (32 + sl + 30) + ",101 L" + (32 + sl + 4) + "," + (100 + sh / 2), { color: "grey", sw: 0.6 });
  b += T(32 + sl + 33, 104, S.H.toFixed(2) + " mm", { size: 8.5 });

  /* the mapping */
  b += arrow(ns, "M216,52 L288,52", { color: "ink", sw: 1.1 });
  b += T(252, 44, "surface-equivalent", { size: 8.5, anchor: "middle", fill: C.grey });
  b += T(252, 64, "mapping", { size: 8.5, anchor: "middle", fill: C.grey });

  /* cylinder, side view */
  const cd = Q.D * s, cy = 40;
  b += rect(300, cy, sl, cd, { stroke: C.field, fill: TINT.field, sw: 1, rx: 0 });
  b += '<ellipse cx="300" cy="' + (cy + cd / 2) + '" rx="3.2" ry="' + (cd / 2) + '" fill="' + TINT.field + '" stroke="' + C.field + '" stroke-width="1"/>';
  b += '<ellipse cx="' + (300 + sl) + '" cy="' + (cy + cd / 2) + '" rx="3.2" ry="' + (cd / 2) + '" fill="none" stroke="' + C.field + '" stroke-width="1"/>';
  b += line(300, 78, 300 + sl, 78, { stroke: C.grey, sw: 0.6 });
  b += T(300 + sl / 2, 88, Q.L.toFixed(2) + " mm", { size: 8.5, anchor: "middle" });
  b += line(292, cy, 292, cy + cd, { stroke: C.grey, sw: 0.6 });
  b += T(300 + sl, cy - 6, "D = " + Q.D.toFixed(3) + " mm", { size: 8.5, anchor: "end" });
  b += T(300, 116, "diameter set by surface, not by volume", { size: 8.5, fill: C.grey });

  /* the ledger */
  const col = [32, 214, 316, 404], y0 = 146;
  b += line(32, y0 - 12, 480, y0 - 12, { stroke: C.ink, sw: 0.9 });
  b += T(col[0], y0, "Quantity", { size: 8.5, weight: "bold", fill: C.grey });
  b += T(col[1], y0, "Rectangular", { size: 8.5, weight: "bold", fill: C.grey });
  b += T(col[2], y0, "Cylinder", { size: 8.5, weight: "bold", fill: C.grey });
  b += T(col[3], y0, "Relation", { size: 8.5, weight: "bold", fill: C.grey });
  b += line(32, y0 + 5, 480, y0 + 5, { stroke: C.ink, sw: 0.9 });

  const rows = [
    { g: "Preserved by construction", c: C.scalar },
    ["Length", S.L.toFixed(2) + " mm", Q.L.toFixed(2) + " mm", "identical"],
    ["Radiating surface", S.surface.toFixed(3) + " cm²", Q.surface.toFixed(3) + " cm²", "identical"],
    ["Mass", S.mass.toFixed(1) + " mg", Q.mass.toFixed(1) + " mg", "identical"],
    ["Electrical resistance", S.R.toFixed(3) + " Ω", Q.R.toFixed(3) + " Ω", "identical"],
    { g: "Not preserved", c: C.thermal },
    ["Geometric volume", S.volume.toFixed(5) + " cm³", Q.volume.toFixed(4) + " cm³", "larger by ×" + Q.volumeRatio.toFixed(2), "bad"],
    { g: "Derived", c: C.grey },
    ["Diameter", "—", Q.D.toFixed(3) + " mm", "set by the surface"],
    ["Effective density", S.density.toFixed(1) + " kg/m³", Q.density.toFixed(2) + " kg/m³", "×" + Q.densityScale.toFixed(5)],
    ["Effective resistivity", S.rho.toFixed(5) + " Ω·cm", Q.rho.toFixed(4) + " Ω·cm", "×" + Q.areaRatio.toFixed(2)]
  ];
  let y = y0 + 20;
  rows.forEach(function (r) {
    if (r.g) {
      b += T(col[0], y, r.g.toUpperCase(), { size: 8, weight: "bold", fill: r.c });
      b += line(32, y + 3.5, 480, y + 3.5, { stroke: r.c, sw: 0.5 });
      y += 16;
      return;
    }
    const bad = r[4] === "bad";
    const f = bad ? C.thermal : C.ink;
    b += T(col[0], y, r[0], { size: 9, fill: f });
    b += T(col[1], y, r[1], { size: 9, fill: f });
    b += T(col[2], y, r[2], { size: 9, fill: f });
    b += T(col[3], y, r[3], { size: 9, fill: bad ? C.thermal : C.grey, weight: bad ? "bold" : "normal" });
    b += line(32, y + 4.5, 480, y + 4.5, { stroke: "#E4E4E4", sw: 0.4 });
    y += 17;
  });


  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Figure 3. The real half-domain, drawn from the cell edges the mesh  */
/* builder returns. Nothing here is mirrored.                          */
/* ------------------------------------------------------------------ */
export function meshDomain(DATA) {
  const ns = "s1", W = 505, H = 386;
  const M = DATA.mesh, re = M.redges, ze = M.zedges;
  const s = 15.0, x0 = 66, ytop = 34;
  const zmax = ze[ze.length - 1], zmin = ze[0];
  const X = function (r) { return x0 + r * s; };
  const Y = function (z) { return ytop + (zmax - z) * s; };
  const ybot = Y(zmin);
  let b = defs(ns);

  const rEl = re[M.nElement], rGap = re[M.nElement + M.nGap], rWall = re[M.nElement + M.nGap + M.nWall], rOut = re[re.length - 1];
  const zEl0 = ze[M.nAirZ], zEl1 = ze[M.nAirZ + M.nActiveZ];

  /* region tints, flat fills only */
  const band = function (r1, r2, z1, z2, fill) {
    return '<rect x="' + X(r1) + '" y="' + Y(z2) + '" width="' + ((r2 - r1) * s) + '" height="' + ((z2 - z1) * s) + '" fill="' + fill + '"/>';
  };
  b += band(0, rEl, zEl0, zEl1, TINT.field);
  b += band(0, rEl, zmin, zEl0, TINT.gas);
  b += band(0, rEl, zEl1, zmax, TINT.gas);
  b += band(rEl, rGap, zmin, zmax, TINT.gas);
  b += band(rGap, rWall, zmin, zmax, TINT.wall);
  b += band(rWall, rOut, zmin, zmax, TINT.air);

  /* the mesh itself */
  let g = "";
  re.forEach(function (r) { g += "M" + X(r) + "," + ytop + " L" + X(r) + "," + ybot + " "; });
  ze.forEach(function (z) { g += "M" + x0 + "," + Y(z) + " L" + X(rOut) + "," + Y(z) + " "; });
  b += '<path d="' + g + '" fill="none" stroke="#C6C6C6" stroke-width="0.25"/>';

  /* region outlines */
  b += '<rect x="' + X(0) + '" y="' + Y(zEl1) + '" width="' + (rEl * s) + '" height="' + ((zEl1 - zEl0) * s) + '" fill="none" stroke="' + C.field + '" stroke-width="1.1"/>';
  b += '<rect x="' + X(rGap) + '" y="' + ytop + '" width="' + ((rWall - rGap) * s) + '" height="' + (ybot - ytop) + '" fill="none" stroke="' + C.grey + '" stroke-width="1"/>';
  b += line(X(rOut), ytop, X(rOut), ybot, { stroke: C.ink, sw: 1.6 });
  b += line(x0, ytop, X(rOut), ytop, { stroke: C.grey, sw: 1 });
  b += line(x0, ybot, X(rOut), ybot, { stroke: C.grey, sw: 1 });
  b += line(x0, ytop, x0, ybot, { stroke: C.ink, sw: 1.4, dash: "5 3" });

  /* axes and boundary labels */
  b += '<text x="' + (x0 - 12) + '" y="' + ((ytop + ybot) / 2) + '" font-size="9" fill="' + C.ink + '" text-anchor="middle" transform="rotate(-90 ' + (x0 - 12) + ' ' + ((ytop + ybot) / 2) + ')">symmetry axis, r = 0</text>';
  b += T(x0, ytop - 8, "r", { size: 9, weight: "bold" });
  b += arrow(ns, "M" + (x0 - 32) + "," + (ytop + 44) + " L" + (x0 - 32) + "," + (ytop + 8), { color: "grey", sw: 0.7 });
  b += T(x0 - 32, ytop - 2, "z", { size: 9, weight: "bold", anchor: "middle" });
  b += arrow(ns, "M" + (x0 + 6) + "," + (ytop - 11) + " L" + (x0 + 34) + "," + (ytop - 11), { color: "grey", sw: 0.7 });
  b += T(X(rOut), ytop - 8, "domain radius " + M.domainRadius.toFixed(3) + " mm", { size: 8.5, anchor: "end", fill: C.grey });

  /* flow through the gas gap */
  const xg = X((rEl + rGap) / 2);
  b += arrow(ns, "M" + xg + "," + (ytop + 6) + " L" + xg + "," + (ybot - 8), { color: "gas", sw: 1.4 });

  /* radial allocation brackets */
  const brk = function (r1, r2, label, color) {
    const a = X(r1), c = X(r2), yb = ybot + 8;
    return line(a, yb, c, yb, { stroke: color, sw: 1 }) + line(a, yb - 3, a, yb, { stroke: color, sw: 1 }) +
      line(c, yb - 3, c, yb, { stroke: color, sw: 1 }) +
      T((a + c) / 2, yb + 10, label, { size: 8, anchor: "middle", fill: color });
  };
  b += brk(0, rEl, String(M.nElement), C.field);
  b += brk(rEl, rGap, String(M.nGap), C.gas);
  b += brk(rGap, rWall, String(M.nWall), C.grey);
  b += brk(rWall, rOut, String(M.nAir), C.grey);
  b += T(x0, ybot + 32, "radial cells", { size: 8, fill: C.grey });

  /* annotation panel */
  const ax = 236;
  let ay = 46;
  const head = function (t) { b += T(ax, ay, t, { size: 9.5, weight: "bold" }); ay += 13; };
  const row = function (a, v, color) {
    b += '<rect x="' + ax + '" y="' + (ay - 7) + '" width="8" height="8" fill="' + (color || "none") + '" stroke="' + (color ? C.grey : "none") + '" stroke-width="0.5"/>';
    b += T(ax + 13, ay, a, { size: 9 });
    b += T(495, ay, v, { size: 9, anchor: "end", fill: C.grey });
    ay += 13;
  };
  b += T(ax, ay, M.nr + " × " + M.nz + " = " + (M.nr * M.nz) + " finite-volume cells", { size: 9.5, weight: "bold" });
  ay += 18;
  head("Radial division, " + M.nr + " cells");
  row("element", M.nElement + " cells,  0 to " + M.radius.toFixed(3) + " mm", TINT.field);
  row("gas gap", M.nGap + " cells,  to " + re[M.nElement + M.nGap].toFixed(3) + " mm", TINT.gas);
  row("wall", M.nWall + " cells,  to " + M.outerRadius.toFixed(3) + " mm", TINT.wall);
  row("outside air", M.nAir + " cells, graded ×" + M.stretch.toFixed(0) + ",  to " + M.domainRadius.toFixed(3) + " mm", TINT.air);
  ay += 10;
  head("Axial division, " + M.nz + " cells, uniform " + (ze[1] - ze[0]).toFixed(3) + " mm");
  row("upper gas pad", M.nAirZ + " cells");
  row("element", M.nActiveZ + " cells,  " + M.L.toFixed(2) + " mm");
  row("lower gas pad", M.nAirZ + " cells");
  row("domain height", M.domainHeight.toFixed(2) + " mm");
  ay += 10;
  head("Boundaries");
  row("r = 0", "symmetry, no flux");
  row("r = R_{domain}", "far field,  R_{domain} / R_{wall} = " + M.ratio.toFixed(3));
  row("z at both ends", "gas pads close the domain");
  ay += 2;
  row("gas inlet, outlet", "top row in, row 0 out");

  ay += 10;
  b += '<rect x="' + ax + '" y="' + (ay - 7) + '" width="8" height="8" fill="none" stroke="' + C.gas + '" stroke-width="1.2"/>';
  b += T(ax + 13, ay, "process gas, top to bottom", { size: 9, fill: C.gas });


  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Figure 4. What the assembly writes into the matrix.                 */
/* ------------------------------------------------------------------ */
export function matrixClasses(DATA) {
  const ns = "s2", W = 505, H = 366;
  let b = defs(ns);
  const rows = [48, 130, 212, 294];
  const SX = 30, MX = 168, TX = 268;

  b += T(SX, 22, "Cells coupled", { size: 8.5, weight: "bold", fill: C.grey });
  b += T(MX, 22, "Matrix position", { size: 8.5, weight: "bold", fill: C.grey });
  b += T(MX, 33, "schematic; the 30 × 60 mesh has 1800 unknowns", { size: 8, fill: C.faint });
  b += T(TX, 22, "Term", { size: 8.5, weight: "bold", fill: C.grey });
  b += line(SX, 38, 495, 38, { stroke: C.ink, sw: 0.9 });

  /* a small 8 x 8 matrix schematic; k lists the entries to fill */
  const matrix = function (x, y, filled, hollow, color) {
    const c = 7, n = 8;
    let o = rect(x, y, c * n, c * n, { stroke: C.grey, fill: "#FFFFFF", sw: 0.7, rx: 0 });
    for (let i = 1; i < n; i++) {
      o += line(x, y + i * c, x + n * c, y + i * c, { stroke: "#E6E6E6", sw: 0.3 });
      o += line(x + i * c, y, x + i * c, y + n * c, { stroke: "#E6E6E6", sw: 0.3 });
    }
    filled.forEach(function (p) {
      o += '<rect x="' + (x + p[1] * c) + '" y="' + (y + p[0] * c) + '" width="' + c + '" height="' + c + '" fill="' + color + '"/>';
    });
    (hollow || []).forEach(function (p) {
      o += '<rect x="' + (x + p[1] * c + 0.6) + '" y="' + (y + p[0] * c + 0.6) + '" width="' + (c - 1.2) + '" height="' + (c - 1.2) + '" fill="none" stroke="' + color + '" stroke-width="0.7" stroke-dasharray="1.5 1.2"/>';
    });
    return o;
  };
  const cell = function (x, y, w, h, fill, stroke) { return rect(x, y, w, h, { fill: fill, stroke: stroke || C.grey, sw: 0.7, rx: 0 }); };

  /* row 1: adjacent-cell conduction */
  let y = rows[0];
  (function () {
    const x = SX + 20, u = 20;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const on = (i === 1) !== (j === 1);
      if (i === 1 && j === 1) b += cell(x + j * u, y + i * u, u, u, TINT.thermal, C.thermal);
      else if (on) b += cell(x + j * u, y + i * u, u, u, "#FFFFFF", C.grey);
    }
    b += T(x + u * 1.5, y + u * 1.5 + 3.2, "P", { size: 9, weight: "bold", anchor: "middle", fill: C.thermal });
    b += arrow(ns, "M" + (x + u * 1.5) + "," + (y + u - 3) + " L" + (x + u * 1.5) + "," + (y + 3), { color: "thermal", sw: 0.9, start: true });
    b += arrow(ns, "M" + (x + u * 1.5) + "," + (y + 2 * u + 3) + " L" + (x + u * 1.5) + "," + (y + 3 * u - 3), { color: "thermal", sw: 0.9, start: true });
    b += arrow(ns, "M" + (x + u - 3) + "," + (y + u * 1.5) + " L" + (x + 3) + "," + (y + u * 1.5), { color: "thermal", sw: 0.9, start: true });
    b += arrow(ns, "M" + (x + 2 * u + 3) + "," + (y + u * 1.5) + " L" + (x + 3 * u - 3) + "," + (y + u * 1.5), { color: "thermal", sw: 0.9, start: true });
  })();
  const bandE = [];
  for (let i = 0; i < 8; i++) { bandE.push([i, i]); if (i > 0) bandE.push([i, i - 1]); if (i < 7) bandE.push([i, i + 1]); if (i > 2) bandE.push([i, i - 3]); if (i < 5) bandE.push([i, i + 3]); }
  b += matrix(MX, y + 2, bandE, [], C.thermal);
  b += T(TX, y + 10, "Adjacent-cell conduction", { size: 9.5, weight: "bold", fill: C.thermal });
  b += T(TX, y + 23, "bands next to the diagonal · symmetric", { size: 8.5, fill: C.grey });
  b += line(SX, y + 68, 495, y + 68, { stroke: "#E4E4E4", sw: 0.5 });

  /* row 2: boundary convection and radiation */
  y = rows[1];
  (function () {
    const x = SX + 30, u = 20;
    b += cell(x, y + 20, u, u, TINT.thermal, C.thermal);
    b += line(x + u + 8, y + 8, x + u + 8, y + 60, { stroke: C.ink, sw: 1.6 });
    b += arrow(ns, "M" + (x + u + 2) + "," + (y + 30) + " L" + (x + u + 24) + "," + (y + 30), { color: "thermal", sw: 0.9 });
    b += T(x + u + 12, y + 22, "to ambient", { size: 8, fill: C.grey });
    b += T(x + u, y + 56, "boundary cell", { size: 8, fill: C.grey, anchor: "end" });
  })();
  b += matrix(MX, y + 2, [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7]], [], C.thermal);
  b += T(TX, y + 10, "Boundary convection and radiation", { size: 9.5, weight: "bold", fill: C.thermal });
  b += T(TX, y + 23, "diagonal and right-hand side · symmetric", { size: 8.5, fill: C.grey });
  b += line(SX, y + 68, 495, y + 68, { stroke: "#E4E4E4", sw: 0.5 });

  /* row 3: element to wall radiation across the gap */
  y = rows[2];
  (function () {
    const x = SX + 6, u = 20;
    b += cell(x, y + 20, u, u, TINT.field, C.field);
    b += '<rect x="' + (x + u) + '" y="' + (y + 20) + '" width="34" height="' + u + '" fill="' + TINT.gas + '" stroke="none"/>';
    b += cell(x + u + 34, y + 20, u, u, TINT.wall, C.grey);
    b += arrow(ns, "M" + (x + u + 3) + "," + (y + 30) + " L" + (x + u + 31) + "," + (y + 30), { color: "thermal", sw: 0.9, start: true });
    b += T(x + u + 17, y + 14, "gap", { size: 8, anchor: "middle", fill: C.gas });
    b += T(x, y + 56, "element", { size: 8, fill: C.field });
    b += T(x + u + 34, y + 56, "wall", { size: 8, fill: C.grey });
  })();
  b += matrix(MX, y + 2, [[1, 6], [6, 1], [2, 7], [7, 2]], [], C.thermal);
  b += T(TX, y + 10, "Element-to-wall radiation", { size: 9.5, weight: "bold", fill: C.thermal });
  b += T(TX, y + 23, "off-diagonal, in matching pairs · symmetric", { size: 8.5, fill: C.grey });
  b += line(SX, y + 68, 495, y + 68, { stroke: "#E4E4E4", sw: 0.5 });

  /* row 4: directed gas enthalpy transport */
  y = rows[3];
  (function () {
    const x = SX + 30, u = 20;
    b += cell(x, y + 34, u, u, TINT.gas, C.gas);
    b += cell(x, y + 14, u, u, TINT.gas, C.gas);
    b += arrow(ns, "M" + (x + u + 8) + "," + (y + 54) + " L" + (x + u + 8) + "," + (y + 14), { color: "gas", sw: 1.4 });
    b += T(x + u + 14, y + 37, "flow", { size: 8, fill: C.gas });
    b += T(x, y + 66, "upstream cell only", { size: 8, fill: C.grey });
  })();
  b += matrix(MX, y + 2, [[3, 2], [4, 3], [5, 4]], [[2, 3], [3, 4], [4, 5]], C.gas);
  b += T(TX, y + 10, "Directed process-gas enthalpy transport", { size: 9.5, weight: "bold", fill: C.gas });
  b += T(TX, y + 23, "upstream entry only · nonsymmetric, selects BiCGSTAB", { size: 8.5, fill: C.grey });

  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Figure 5. One total power, one spatial shape, and where they meet.  */
/* ------------------------------------------------------------------ */
export function coupling(DATA) {
  const ns = "m2", W = 505, H = 282;
  let b = defs(ns);
  const xs = [20, 142, 264, 386], bw = 108;

  const chain = function (y, color, tint, items) {
    items.forEach(function (it, i) {
      const x = xs[i];
      b += rect(x, y, bw, 28, { stroke: C.edge, fill: tint, sw: 0.8 });
      b += T(x + bw / 2, y + 12, it[0], { size: 9.5, weight: "bold", anchor: "middle", fill: shadeOf(color) });
      b += T(x + bw / 2, y + 23, it[1], { size: 8.5, anchor: "middle", fill: C.grey });
      if (i < 3) b += arrow(ns, "M" + (x + bw) + "," + (y + 14) + " L" + (xs[i + 1] - 2) + "," + (y + 14),
        { color: Object.keys(C).find(function (k) { return C[k] === color; }), sw: 1 });
    });
  };

  b += T(20, 18, "Scalar branch", { size: 10, weight: "bold", fill: SHADE.scalar });
  b += T(96, 18, "total power dissipated, from the volume-average temperature", { size: 8.5, fill: C.grey });
  chain(26, C.scalar, TINT.scalar, [
    ["T_{avg}", "volume average"],
    ["ρ(T_{avg}),  R_{bulk}", "R_{total} = R_{bulk} + 2R_{c}"],
    ["I", "set by R_{total}"],
    ["P_{bulk} = I² R_{bulk}", "scalar, in watts"]
  ]);
  /* the contact term is computed on the same current and then leaves */
  b += line(440, 54, 440, 62, { stroke: C.grey, sw: 0.8, dash: "2 2" });
  b += rect(236, 62, 258, 18, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, dash: "2.5 2" });
  b += T(365, 74, "P_{contact} = I² · 2R_{c},  reported; not deposited", { size: 8.5, anchor: "middle", fill: C.grey });

  b += T(20, 106, "Field branch", { size: 10, weight: "bold", fill: SHADE.field });
  b += T(90, 106, "spatial distribution only, from the local temperature field", { size: 8.5, fill: C.grey });
  chain(114, C.field, TINT.field, [
    ["T(r,z)", "temperature field"],
    ["σ(T) = 1 / ρ(T)", "local conductivity"],
    ["∇·(σ ∇V) = 0", "unit potential"],
    ["q‴_{unit}(r,z)", "distribution only"]
  ]);

  /* the join */
  b += rect(110, 176, 360, 46, { stroke: C.ink, fill: "#FFFFFF", sw: 1.2 });
  b += T(290, 194, "q‴(r,z)  =  P_{bulk} · q‴_{unit}(r,z) / ∫ q‴_{unit} dV", { size: 10.5, weight: "bold", anchor: "middle" });
  b += T(290, 210, "scaled so the volume integral equals the scalar total", { size: 8.5, anchor: "middle", fill: C.grey });
  b += arrow(ns, "M494,54 L500,54 L500,199 L472,199", { color: "scalar", sw: 1 });
  b += arrow(ns, "M440,142 L440,174", { color: "field", sw: 1 });

  b += arrow(ns, "M290,222 L290,238", { color: "ink", sw: 1 });
  b += rect(170, 240, 240, 30, { stroke: C.edge, fill: TINT.thermal, sw: 0.8 });
  b += T(290, 253, "Assemble and solve the thermal system", { size: 9.5, weight: "bold", anchor: "middle", fill: SHADE.thermal });
  b += T(290, 264, "q‴ is the source term in every element cell", { size: 8.5, anchor: "middle", fill: C.grey });

  /* the temperature field returns to both branches */
  b += arrow(ns, "M170,255 L10,255 L10,40 L18,40", { color: "thermal", sw: 1 });
  b += arrow(ns, "M10,128 L18,128", { color: "thermal", sw: 1 });
  b += '<text x="9" y="180" font-size="8.5" fill="' + C.thermal + '" text-anchor="middle" transform="rotate(-90 9 180)">T(r,z)</text>';

  return svgDoc(W, H, b);
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 1. What each tab takes in, and what it hands on.               */
/* ------------------------------------------------------------------ */
export function workflow(DATA) {
  const ns = "m1", W = 505, H = 280;
  let b = defs(ns);
  const xs = [18, 189, 360], pw = 127, py = 26, ph = 186;

  const stages = [
    { c: C.scalar, tint: TINT.scalar, key: "scalar", tab: "Single Design",
      set: ["material properties", "geometry, void fraction", "limits on I, V, P, J", "target and ambient", "contact resistance"],
      out: ["the binding limit", "R_{bulk}, R_{c}, R_{total}", "I, V, P_{bulk}, P_{contact}", "initial heating rate", "0D steady state"],
      hand: ["operating", "point"] },
    { c: C.thermal, tint: TINT.thermal, key: "thermal", tab: "2D Thermal Field",
      set: ["wall and its thickness", "gap conductivity", "emissivity, convection", "electrode ends", "mesh resolution"],
      out: ["T(r,z), half-domain", "element avg, min, max", "wall and gas-outlet T", "loss split by channel", "residual and closure"],
      hand: ["converged", "field"] },
    { c: C.thermal, tint: TINT.thermal, key: "thermal", tab: "Dynamic",
      set: ["start-up or shutdown", "a step or a pulse train", "time step and duration", "the starting field", ""],
      out: ["T(t) at every step", "the field per step", "closure at every step", "element time constant", "swing and cycle average"],
      hand: null }
  ];

  stages.forEach(function (st, i) {
    const x = xs[i];
    b += rect(x, py, pw, ph, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
    b += '<rect x="' + x + '" y="' + py + '" width="' + pw + '" height="22" fill="' + st.tint + '"/>';
    b += line(x, py + 22, x + pw, py + 22, { stroke: st.c, sw: 1 });
    b += T(x + pw / 2, py + 15, st.tab, { size: 10, weight: "bold", anchor: "middle", fill: shadeOf(st.c) });
    b += T(x + 8, py + 38, "INPUTS", { size: 8, weight: "bold", fill: C.grey });
    st.set.forEach(function (t, k) { if (t) b += T(x + 8, py + 50 + k * 11, t, { size: 8.5 }); });
    b += line(x + 8, py + 111, x + pw - 8, py + 111, { stroke: C.rule, sw: 0.5 });
    b += T(x + 8, py + 125, "RETURNS", { size: 8, weight: "bold", fill: C.grey });
    st.out.forEach(function (t, k) { b += T(x + 8, py + 137 + k * 11, t, { size: 8.5 }); });
    if (st.hand) {
      const mid = (x + pw + xs[i + 1]) / 2;
      b += T(mid, py + 84, st.hand[0], { size: 8, anchor: "middle", fill: C.grey });
      b += T(mid, py + 94, st.hand[1], { size: 8, anchor: "middle", fill: C.grey });
      b += arrow(ns, "M" + (x + pw + 2) + "," + (py + 104) + " L" + (xs[i + 1] - 2) + "," + (py + 104), { color: st.key, sw: 1.3 });
    }
  });

  /* the tabs that support the three calculation stages rather than extend them */
  b += rect(18, 226, 469, 46, { stroke: C.hair, fill: TINT.panel, sw: 0.8, dash: "3 2" });
  b += T(28, 240, "SUPPORTING TABS", { size: 8, weight: "bold", fill: C.grey });
  [["How to Use", "orientation and a worked path"],
   ["Screening", "material and geometry sweeps"],
   ["Reference", "equations, properties, code"]].forEach(function (s2, i) {
    const x = 28 + i * 155;
    b += T(x, 255, s2[0], { size: 9, weight: "bold", fill: C.grey });
    b += T(x, 266, s2[1], { size: 8, fill: C.grey });
  });

  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 3. Six verification studies. No panel titles: the axes carry    */
/* the panel and the caption carries the rest.                          */
/* ------------------------------------------------------------------ */
export function verification(DATA) {
  const ns = "m3", W = 505, H = 388;
  const V = DATA.verification;
  let b = defs(ns);
  const pw = 118, ph = 138;
  const COL = [52, 215, 378], ROW = [30, 212];
  const lin = (v, lo, hi, a, c) => a + (v - lo) / (hi - lo) * (c - a);
  const lg = (v) => Math.log10(v);
  const marker = (kind, x, y, c) => kind === "circle"
    ? '<circle cx="' + x + '" cy="' + y + '" r="2.6" fill="#FFFFFF" stroke="' + c + '" stroke-width="1.2"/>'
    : '<rect x="' + (x - 2.4) + '" y="' + (y - 2.4) + '" width="4.8" height="4.8" fill="#FFFFFF" stroke="' + c + '" stroke-width="1.2"/>';

  /* One panel: log x, log or linear y, up to two series, an optional guide
     slope and reference line, and two annotation lines under the axis. */
  function plot(cfg) {
    const x0 = COL[cfg.col], ptop = ROW[cfg.row], pbot = ptop + ph;
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 34, ptop - 6, "abcdef"[cfg.row * 3 + cfg.col], { size: 11, weight: "bold" });
    /* xs may run either way: panel e counts the time step down. Pad outward
       from the smallest and largest value, then map in the order given, so a
       descending axis does not push its end points outside the frame. */
    const xLo = lg(Math.min.apply(null, cfg.xs) / cfg.xPad);
    const xHi = lg(Math.max.apply(null, cfg.xs) * cfg.xPad);
    const up = cfg.xs[0] <= cfg.xs[cfg.xs.length - 1];
    const X = (v) => lin(lg(v), up ? xLo : xHi, up ? xHi : xLo, x0 + 12, x0 + pw - 12);
    let Y;
    if (cfg.decades) {
      Y = (v) => lin(lg(v), cfg.decades[1], cfg.decades[0], ptop + 10, pbot - 10);
      for (let d = cfg.decades[0]; d <= cfg.decades[1]; d++) {
        o += line(x0, Y(Math.pow(10, d)), x0 + pw, Y(Math.pow(10, d)), { stroke: "#EAEAEA", sw: 0.4 });
        o += T(x0 - 4, Y(Math.pow(10, d)) + 3, "10^{" + String(d).replace("-", "\u2212") + "}", { size: 8, anchor: "end", fill: C.grey });
      }
    } else {
      Y = (v) => lin(v, cfg.range[0], cfg.range[1], pbot - 10, ptop + 10);
      for (let t = Math.ceil(cfg.range[0]); t <= cfg.range[1]; t++) {
        o += line(x0, Y(t), x0 + pw, Y(t), { stroke: "#EAEAEA", sw: 0.4 });
        o += T(x0 - 4, Y(t) + 3, String(t), { size: 8, anchor: "end", fill: C.grey });
      }
    }
    if (cfg.guide) {
      const ga = cfg.guide[0], gb = cfg.guide[1], gv = cfg.guide[2], gp = cfg.guide[3];
      o += '<path d="M' + X(ga) + ',' + Y(gv) + ' L' + X(gb) + ',' + Y(gv * Math.pow(ga / gb, gp)) +
        '" fill="none" stroke="' + C.grey + '" stroke-width="0.8" stroke-dasharray="3 2"/>';
      const gmx = (X(ga) + X(gb)) / 2, gmy = (Y(gv) + Y(gv * Math.pow(ga / gb, gp))) / 2;
      o += T(gmx + 4, gmy - 4, cfg.guide[4] || ("slope \u2212" + gp), { size: 8, fill: C.grey });
    }
    if (cfg.rule) {
      o += line(x0, Y(cfg.rule[0]), x0 + pw, Y(cfg.rule[0]), { stroke: C.grey, sw: 0.9, dash: "3 2" });
      o += T(x0 + 4, Y(cfg.rule[0]) + 10, cfg.rule[1], { size: 8, fill: C.grey });
    }
    cfg.series.forEach(function (ser) {
      let d = "";
      cfg.xs.forEach(function (v, k) { d += (k ? " L" : "M") + X(v) + "," + Y(ser.vals[k]); });
      o += '<path d="' + d + '" fill="none" stroke="' + ser.color + '" stroke-width="1.3"/>';
      cfg.xs.forEach(function (v, k) { o += marker(ser.marker, X(v), Y(ser.vals[k]), ser.color); });
    });
    cfg.xs.forEach(function (v, k) { o += T(X(v), pbot + 12, cfg.xLabels ? cfg.xLabels[k] : String(v), { size: 8, anchor: "middle" }); });
    o += T(x0 + pw / 2, pbot + 24, cfg.xLabel, { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 30) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 30) + ' ' + ((ptop + pbot) / 2) + ')">' + cfg.yLabel + '</text>';
    (cfg.legend || []).forEach(function (l, k) {
      const ly = cfg.legendBottom ? pbot - 22 + k * 11 : ptop + 14 + k * 11;
      if (l.marker) {
        const mx = x0 + (l.right ? pw - 10 : 10);
        o += marker(l.marker, mx, ly - 3, l.color);
        o += T(mx + (l.right ? -8 : 8), ly, l.label,
          { size: 8.5, weight: "bold", fill: l.color, anchor: l.right ? "end" : "start" });
      } else {
        o += T(x0 + (l.right ? pw - 6 : 6), ly, l.label,
          { size: 8.5, weight: "bold", fill: l.color, anchor: l.right ? "end" : "start" });
      }
    });
    b += o;
  }
  plot({ col: 0, row: 0, xs: V.parabola.map((q) => q.ld), xPad: 1.18, xLabel: "cylinder L/D",
    yLabel: "mismatch vs analytic profile", decades: [-5, -2],
    series: [{ vals: V.parabola.map((q) => q.worstRelative), color: C.thermal, marker: "circle" }] });

  plot({ col: 1, row: 0, xs: V.annulus.map((a) => a.ld), xPad: 1.18, xLabel: "cylinder L/D",
    yLabel: "worst layer error vs theory", decades: [-2, 0],
    series: [{ vals: V.annulus.map((a) => a.worst), color: C.thermal, marker: "circle" }] });

  plot({ col: 2, row: 0, xs: V.mms.map((r) => Number(r.grid.split("\u00d7")[0])), xPad: 1.22,
    xLabel: "radial cells", yLabel: "error vs manufactured solution (K)",
    decades: [-2, 1], guide: [32, 78, 8.0, 2],
    series: [{ vals: V.mms.map((r) => r.linf), color: C.thermal, marker: "square" },
             { vals: V.mms.map((r) => r.l2), color: C.thermal, marker: "circle" }],
    legendBottom: true,
    legend: [{ label: "L\u221e", color: C.thermal, marker: "square" },
             { label: "L2", color: C.thermal, marker: "circle" }] });

  plot({ col: 0, row: 1, xs: V.electrical.map((r) => Number(r.grid.split("\u00d7")[0])), xPad: 1.22,
    xLabel: "radial cells", yLabel: "resistance error vs exact",
    decades: [-7, -4], guide: [34, 84, 2.4e-5, 2],
    series: [{ vals: V.electrical.map((r) => r.error), color: C.field, marker: "square" }] });

  plot({ col: 1, row: 1, xs: V.transient.rows.map((r) => r.dt), xPad: 1.35,
    xLabels: V.transient.rows.map((r) => r.dt.toFixed(2)),
    xLabel: "time step (s)", yLabel: "error vs reference step (K)",
    decades: [-1, 1], guide: [6.0, 1.3, 3.4, -1, "first order"],
    series: [{ vals: V.transient.rows.map((r) => r.error), color: C.thermal, marker: "circle" }] });

  (function () {
    const rows = V.physical.rows, ex = V.physical.extrapolated.avg;
    const all = rows.map((r) => r.avgC).concat(rows.map((r) => r.maxC), [ex]);
    plot({ col: 2, row: 1, xs: rows.map((r) => Number(r.grid.split("\u00d7")[0])), xPad: 1.22,
      xLabel: "radial cells", yLabel: "element temperature (\u00b0C)",
      range: [Math.min.apply(null, all) - 0.45, Math.max.apply(null, all) + 0.35],
      rule: [ex, "extrapolated " + ex.toFixed(2)],
      series: [{ vals: rows.map((r) => r.maxC), color: C.thermal, marker: "square" },
               { vals: rows.map((r) => r.avgC), color: C.thermal, marker: "circle" }],
      legend: [{ label: "maximum", color: C.thermal, marker: "square", right: true },
               { label: "average", color: C.thermal, marker: "circle", right: true }] });
  })();

  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. 4. The illustrative case, solved rather than sketched.         */
/* ------------------------------------------------------------------ */
export function defaultCase(DATA) {
  const ns = "m4", W = 505, H = 268;
  const M = DATA.mesh, K = DATA.defaultCase;
  const re = M.redges, ze = M.zedges, Tc = K.Tc;
  let b = defs(ns);

  /* a single-hue ramp: the thermal role keeps its colour, magnitude is
     carried by lightness, so the plate also reads in grayscale */
  const STOPS = [[0, [255, 248, 242]], [0.5, [240, 168, 104]], [1, [155, 60, 0]]];
  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        const a = STOPS[i - 1], c = STOPS[i], f = (t - a[0]) / (c[0] - a[0]);
        const v = a[1].map((q, k) => Math.round(q + f * (c[1][k] - q)));
        return "rgb(" + v.join(",") + ")";
      }
    }
    return "rgb(155,60,0)";
  }

  const s = 9.3, x0 = 54, ytop = 46;
  const zmax = ze[ze.length - 1], zmin = ze[0];
  const X = (r) => x0 + r * s, Y = (z) => ytop + (zmax - z) * s;
  const ybot = Y(zmin), rOut = re[re.length - 1];
  const lo = 20, hi = Math.ceil(K.maxC / 50) * 50;

  b += T(32, 32, "a", { size: 11, weight: "bold" });

  for (let j = 0; j < M.nz; j++) for (let i = 0; i < M.nr; i++) {
    const x1 = X(re[i]), x2 = X(re[i + 1]), y1 = Y(ze[j + 1]), y2 = Y(ze[j]);
    b += '<rect x="' + x1 + '" y="' + y1 + '" width="' + (x2 - x1 + 0.12) + '" height="' + (y2 - y1 + 0.12) +
      '" fill="' + ramp((Tc[j][i] - lo) / (hi - lo)) + '"/>';
  }
  const rEl = re[M.nElement], rGap = re[M.nElement + M.nGap], rWall = re[M.nElement + M.nGap + M.nWall];
  const zEl0 = ze[M.nAirZ], zEl1 = ze[M.nAirZ + M.nActiveZ];
  b += '<rect x="' + X(0) + '" y="' + Y(zEl1) + '" width="' + (rEl * s) + '" height="' + ((zEl1 - zEl0) * s) + '" fill="none" stroke="' + C.field + '" stroke-width="1"/>';
  b += '<rect x="' + X(rGap) + '" y="' + ytop + '" width="' + ((rWall - rGap) * s) + '" height="' + (ybot - ytop) + '" fill="none" stroke="' + C.grey + '" stroke-width="0.9"/>';
  b += line(x0, ytop, x0, ybot, { stroke: C.ink, sw: 1.2, dash: "4 3" });
  b += rect(x0, ytop, rOut * s, ybot - ytop, { stroke: C.ink, fill: "none", sw: 1, rx: 0 });
  b += '<text x="' + (x0 - 10) + '" y="' + ((ytop + ybot) / 2) + '" font-size="8" fill="' + C.ink + '" text-anchor="middle" transform="rotate(-90 ' + (x0 - 10) + ' ' + ((ytop + ybot) / 2) + ')">symmetry axis</text>';
  b += arrow(ns, "M" + X((rEl + rGap) / 2) + "," + (ytop + 5) + " L" + X((rEl + rGap) / 2) + "," + (ybot - 6), { color: "gas", sw: 1.1 });
  b += T(X(0), ytop - 5, "element", { size: 8, fill: C.field, weight: "bold" });
  b += T(X(rWall) + 2, ytop - 5, "wall", { size: 8, fill: C.grey, weight: "bold" });

  /* the scale */
  const cbx = X(rOut) + 16, cbw = 11, cbTop = ytop, cbBot = ybot;
  for (let k = 0; k < 60; k++) {
    const y1 = cbBot - (k + 1) * (cbBot - cbTop) / 60;
    b += '<rect x="' + cbx + '" y="' + y1 + '" width="' + cbw + '" height="' + ((cbBot - cbTop) / 60 + 0.12) + '" fill="' + ramp(k / 59) + '"/>';
  }
  b += rect(cbx, cbTop, cbw, cbBot - cbTop, { stroke: C.grey, fill: "none", sw: 0.7, rx: 0 });
  for (let t = 0; t <= 4; t++) {
    const v = lo + t * (hi - lo) / 4, y = cbBot - t * (cbBot - cbTop) / 4;
    b += T(cbx + cbw + 4, y + 3, Math.round(v) + " °C", { size: 8, fill: C.grey });
  }

  /* b. where the power goes */
  const px = 232;
  b += T(px - 18, 32, "b", { size: 11, weight: "bold" });
  b += T(px - 4, 32, "P_{bulk} = " + K.pBulk.toFixed(2) + " W in, " + K.boundaryLoss.toFixed(2) + " W out", { size: 8.5, fill: C.grey });

  const NAMES = { wallRadiation: "element to wall, radiation", axialAmbient: "axial ends to ambient",
                  elementEndRadiation: "element ends, radiation", outerRadial: "outer boundary, radial",
                  gasEnthalpy: "process gas, enthalpy" };
  const chans = Object.entries(K.channels).filter(function (e) { return e[1] > 1e-6; })
    .sort(function (a, c) { return c[1] - a[1]; });
  const total = chans.reduce(function (a, c) { return a + c[1]; }, 0);
  const barX = px - 4, barW = 250, barY = 52, barH = 22;
  let acc = 0;
  /* Colour by what the channel is, not by how large it happens to be. The two
     radiation terms take the thermal hue and the two boundary terms the grey,
     separated within the hue by lightness, so the bar survives greyscale and
     the assignment does not move when the ranking does. */
  const HUE = { wallRadiation: C.thermal, elementEndRadiation: "#E8A673",
                axialAmbient: C.grey, outerRadial: "#A9A9A9", gasEnthalpy: C.gas };
  chans.forEach(function (c, i) {
    const w = barW * c[1] / total;
    b += '<rect x="' + (barX + acc) + '" y="' + barY + '" width="' + w + '" height="' + barH + '" fill="' + HUE[c[0]] + '" fill-opacity="0.85"/>';
    acc += w;
  });
  b += rect(barX, barY, barW, barH, { stroke: C.ink, fill: "none", sw: 0.8, rx: 0 });
  chans.forEach(function (c, i) {
    const y = barY + barH + 16 + i * 12;
    b += '<rect x="' + barX + '" y="' + (y - 7) + '" width="9" height="9" fill="' + HUE[c[0]] + '" fill-opacity="0.85"/>';
    b += T(barX + 14, y, NAMES[c[0]] || c[0], { size: 8.5 });
    b += T(barX + barW, y, c[1].toFixed(2) + " W", { size: 8.5, anchor: "end", fill: C.grey });
    b += T(barX + barW - 46, y, (100 * c[1] / total).toFixed(1) + " %", { size: 8.5, anchor: "end", fill: C.grey });
  });

  /* c. the numbers the manuscript quotes */
  const cy = barY + barH + 16 + chans.length * 12 + 18;
  b += line(barX, cy - 12, barX + barW, cy - 12, { stroke: C.rule, sw: 0.6 });
  b += T(barX, cy, "RESULTS", { size: 8, weight: "bold", fill: C.grey });
  const readout = [
    ["element average", K.avgC.toFixed(2) + " °C"],
    ["element range", K.minC.toFixed(1) + " to " + K.maxC.toFixed(1) + " °C"],
    ["internal spread", K.spreadK.toFixed(1) + " K"],
    ["wall, inner and outer", K.wallInnerC.toFixed(1) + " and " + K.wallOuterC.toFixed(1) + " °C"],
    ["process-gas outlet", K.heOutletC.toFixed(1) + " °C"],
    ["energy closure", K.closure.toExponential(1).replace("e-", " × 10^{−") + "}"]
  ];
  readout.forEach(function (r, i) {
    const y = cy + 13 + i * 12;
    b += T(barX, y, r[0], { size: 8.5 });
    b += T(barX + barW, y, r[1], { size: 8.5, anchor: "end", fill: C.grey });
  });

  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Panels e and f of the demonstration plate: whether the element the   */
/* design gave you can follow a pulse. Returns a body, placed under the */
/* design panels by demonstration(). dy shifts the whole block down.    */
/* ------------------------------------------------------------------ */
function dynamicsPanels(ns, DATA, dy) {
  const K = DATA.transient;
  let b = "";
  const pw = 128, ph = 140, ptop = dy + 30, pbot = dy + 30 + 140;
  const COL = [50, 213, 376];
  const lin = (v, lo, hi, a, c) => a + (v - lo) / (hi - lo) * (c - a);

  function frame(col, series, xLabel, letter, yHiHint) {
    const x0 = COL[col];
    const xHi = Math.max.apply(null, series.map((q) => q[0]));
    const yHi = yHiHint || Math.ceil(Math.max.apply(null, series.map((q) => q[1])) / 100) * 100;
    const X = (v) => lin(v, 0, xHi, x0 + 10, x0 + pw - 10);
    const Y = (v) => lin(v, 0, yHi, pbot - 10, ptop + 10);
    let o = rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, rx: 0 });
    o += T(x0 - 36, ptop - 8, letter, { size: 11, weight: "bold" });
    for (let t = 0; t <= yHi; t += yHi / 4) {
      o += line(x0, Y(t), x0 + pw, Y(t), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(x0 - 4, Y(t) + 3, String(Math.round(t)), { size: 8, anchor: "end", fill: C.grey });
    }
    for (let k = 0; k <= 3; k++) {
      const v = k * xHi / 3;
      o += T(X(v), pbot + 12, v.toFixed(xHi < 20 ? 1 : 0), { size: 8, anchor: "middle" });
    }
    o += T(x0 + pw / 2, pbot + 24, xLabel, { size: 8.5, anchor: "middle" });
    /* the anchor is the baseline: rotated -90 the ascender runs 7.8 pt to the
       left of it, and at a 35 pt panel gap that lands inside the frame of the
       panel before. Offset 25, not 30, keeps the whole box in the gap. */
    o += '<text x="' + (x0 - 25) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 25) + ' ' + ((ptop + pbot) / 2) + ')">element average (°C)</text>';
    return { o, X, Y, x0, yHi };
  }
  const trace = (F, series, colour, wdt) => {
    let d = "";
    series.forEach(function (q, k) { d += (k ? " L" : "M") + F.X(q[0]) + "," + F.Y(q[1]); });
    return '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + (wdt || 1.4) + '"/>';
  };

  const yTop = Math.ceil(Math.max(
    Math.max.apply(null, K.pulse.map((q) => q[1])),
    Math.max.apply(null, K.cont.map((q) => q[1]))) / 100) * 100;

  /* e. continuous drive, matched on average power */
  (function () {
    const F = frame(0, K.cont, "time (s)", "e", yTop);
    let o = F.o;
    o += line(F.x0, F.Y(K.contSteadyC), F.x0 + pw, F.Y(K.contSteadyC), { stroke: C.grey, sw: 0.9, dash: "3 2" });
    o += T(F.x0 + 6, F.Y(K.contSteadyC) - 5, "steady " + K.contSteadyC.toFixed(0) + " °C", { size: 8, fill: C.grey });
    o += trace(F, K.cont, C.thermal, 1.5);
    b += o;
  })();

  /* f. the same element and the same average power, delivered in pulses */
  (function () {
    const F = frame(1, K.pulse, "time (s)", "f", yTop);
    let o = F.o;
    const strip = pbot - 13;
    for (let t = 0; t < K.pulseEnd; t += K.period) {
      o += '<rect x="' + F.X(t) + '" y="' + strip + '" width="' + Math.max(0.8, F.X(K.period * K.duty) - F.X(0)) +
        '" height="7" fill="' + C.scalar + '" fill-opacity="0.8"/>';
    }
    o += line(F.x0, strip + 7, F.x0 + pw, strip + 7, { stroke: C.scalar, sw: 0.6 });
    o += line(F.x0, F.Y(K.contSteadyC), F.x0 + pw, F.Y(K.contSteadyC), { stroke: C.grey, sw: 0.9, dash: "3 2" });
    o += trace(F, K.pulse, C.thermal, 1.2);
    o += T(F.x0 + pw - 6, pbot - 52, "peak " + K.peakC.toFixed(0) + " °C", { size: 8.5, weight: "bold", anchor: "end", fill: SHADE.thermal });
    o += T(F.x0 + pw - 6, pbot - 41, "mean " + K.cycleMeanC.toFixed(0) + " °C, swing " + K.swingK.toFixed(0) + " K", { size: 8.5, anchor: "end", fill: C.grey });
    o += T(F.x0 + 6, pbot - 26, "dashed, continuous " + K.contSteadyC.toFixed(0) + " °C", { size: 8, fill: C.grey });
    b += o;
  })();

  /* g. the other regime: a rod whose time constant is far above the period */
  (function () {
    const F = frame(2, K.sic, "time (s)", "g");
    let o = F.o;
    o += line(F.x0, F.Y(K.sicSteadyC), F.x0 + pw, F.Y(K.sicSteadyC), { stroke: C.grey, sw: 0.9, dash: "3 2" });
    o += T(F.x0 + 6, F.Y(K.sicSteadyC) - 5, "steady " + K.sicSteadyC.toFixed(0) + " °C", { size: 8, fill: C.grey });
    const tx = F.X(K.sicTau);
    o += line(tx, ptop + 10, tx, pbot - 10, { stroke: C.scalar, sw: 0.8, dash: "2 2" });
    o += T(tx + 5, ptop + 86, "τ = " + K.sicTau.toFixed(0) + " s", { size: 8, fill: SHADE.scalar });
    o += trace(F, K.sic, C.thermal, 1.5);
    b += o;
  })();

  /* the drive conditions, under each panel rather than over its data */
  b += T(COL[0], pbot + 38, "continuous, " + K.contVolts.toFixed(2) + " V, " + K.contPower.toFixed(1) + " W", { size: 8.5, weight: "bold", fill: SHADE.thermal });
  b += T(COL[0], pbot + 48, "settling set by the enclosure", { size: 8, fill: C.grey });
  b += T(COL[1], pbot + 38, (K.duty * 100).toFixed(0) + " % duty, " + K.period + " s period, " + K.pulseVolts + " V", { size: 8.5, weight: "bold", fill: SHADE.scalar });
  b += T(COL[1], pbot + 48, "τ = " + K.cfpTau.toFixed(2) + " s, " + K.meanPower.toFixed(1) + " W average", { size: 8, fill: C.grey });
  b += T(COL[2], pbot + 38, K.sicLabel + ", switched on", { size: 8.5, weight: "bold", fill: SHADE.thermal });
  b += T(COL[2], pbot + 48, "τ is " + (K.sicTau / K.period).toFixed(0) + "× the pulse period", { size: 8, fill: C.grey });
  return b;
}

/* ------------------------------------------------------------------ */
/* Fig. 5. What the tool is for: the geometry and the material that     */
/* reach a target on a given supply, and whether the element that       */
/* results can be driven in pulses.                                     */
/* ------------------------------------------------------------------ */
export function demonstration(DATA) {
  const ns = "m5", W = 505, H = 634;
  return svgDoc(W, H, defs(ns) + designPanels(ns, DATA) + dynamicsPanels(ns, DATA, 396));
}

/* ------------------------------------------------------------------ */
/* Fig. S6. What it takes to reach a target temperature: the geometry   */
/* the supply allows, the shape that carries it, and the material.      */
/* ------------------------------------------------------------------ */
/* Panels a to d of the demonstration plate: what geometry and what material
   reach a target temperature on a given supply. Returns a body, not a
   document, so the dynamics panels can sit under it in one figure. */
function designPanels(ns, DATA) {
  const S = DATA.screening, F = DATA.forms;
  let b = "";
  const pw = 175, ph = 150, ptop = 34, pbot = 34 + 150;
  const lin = (v, lo, hi, a, c) => a + (v - lo) / (hi - lo) * (c - a);
  const lg = (v) => Math.log10(v);
  const lds = S.sweep.map((q) => q.ld);
  const xLo = lg(lds[0] / 1.1), xHi = lg(lds[lds.length - 1] * 1.1);
  const firstV = S.sweep.findIndex((q) => q.constraint !== S.sweep[0].constraint);

  function frame(x0, letter, yLabel) {
    const X = (v) => lin(lg(v), xLo, xHi, x0 + 12, x0 + pw - 12);
    let o = "";
    if (firstV > 0) o += '<rect x="' + X(S.sweep[firstV].ld) + '" y="' + ptop + '" width="' +
      (x0 + pw - X(S.sweep[firstV].ld)) + '" height="' + ph + '" fill="#F0F0F0"/>';
    o += rect(x0, ptop, pw, ph, { stroke: C.grey, fill: "none", sw: 0.8, rx: 0 });
    o += T(x0 - 36, ptop - 8, letter, { size: 11, weight: "bold" });
    [0.5, 4, 32, 256].forEach(function (v) { o += T(X(v), pbot + 12, String(v), { size: 8, anchor: "middle" }); });
    o += T(x0 + pw / 2, pbot + 24, "aspect ratio L/D", { size: 8.5, anchor: "middle" });
    o += '<text x="' + (x0 - 32) + '" y="' + ((ptop + pbot) / 2) + '" font-size="8.5" text-anchor="middle" transform="rotate(-90 ' + (x0 - 32) + ' ' + ((ptop + pbot) / 2) + ')">' + yLabel + '</text>';
    return { o, X };
  }

  /* a. stretching the element at a fixed envelope volume raises its resistance */
  (function () {
    const Rs = S.sweep.map((q) => q.R);
    const dLo = Math.floor(lg(Math.min.apply(null, Rs))), dHi = Math.ceil(lg(Math.max.apply(null, Rs)));
    const Y = (v) => lin(lg(v), dHi, dLo, ptop + 10, pbot - 10);
    const P = frame(52, "a", "resistance (Ω)");
    let o = P.o;
    for (let d = dLo; d <= dHi; d += 1) {
      o += line(52, Y(Math.pow(10, d)), 52 + pw, Y(Math.pow(10, d)), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(48, Y(Math.pow(10, d)) + 3, "10^{" + String(d).replace("-", "\u2212") + "}", { size: 8, anchor: "end", fill: C.grey });
    }
    let d2 = "";
    S.sweep.forEach(function (q, k) { d2 += (k ? " L" : "M") + P.X(q.ld) + "," + Y(q.R); });
    o += '<path d="' + d2 + '" fill="none" stroke="' + C.scalar + '" stroke-width="1.5"/>';
    b += o;
  })();

  /* b. the temperature that follows, read against a target */
  (function () {
    const Ts = S.sweep.map((q) => q.tssC);
    const hi = Math.ceil(Math.max.apply(null, Ts.concat([S.limitC])) / 500) * 500;
    const Y = (v) => lin(v, 0, hi, pbot - 10, ptop + 10);
    const P = frame(287, "b", "steady temperature (°C)");
    let o = P.o;
    for (let t = 0; t <= hi; t += hi / 4) {
      o += line(287, Y(t), 287 + pw, Y(t), { stroke: "#EAEAEA", sw: 0.4 });
      o += T(283, Y(t) + 3, String(Math.round(t)), { size: 8, anchor: "end", fill: C.grey });
    }
    if (S.window) {
      o += '<rect x="' + P.X(S.window.lo) + '" y="' + Y(S.targetC) + '" width="' + (P.X(S.window.hi) - P.X(S.window.lo)) +
        '" height="' + (pbot - 10 - Y(S.targetC)) + '" fill="' + TINT.thermal + '" fill-opacity="0.7"/>';
    }
    o += line(287, Y(S.limitC), 287 + pw, Y(S.limitC), { stroke: C.ink, sw: 1, dash: "4 2" });
    o += T(291, Y(S.limitC) + 10, S.materialName + " " + S.limitKind, { size: 8 });
    o += line(287, Y(S.targetC), 287 + pw, Y(S.targetC), { stroke: C.thermal, sw: 1, dash: "4 2" });
    o += T(291, Y(S.targetC) - 4, "target " + S.targetC + " °C", { size: 8, weight: "bold", fill: C.thermal });
    let d2 = "";
    S.sweep.forEach(function (q, k) { d2 += (k ? " L" : "M") + P.X(q.ld) + "," + Y(q.tssC); });
    o += '<path d="' + d2 + '" fill="none" stroke="' + C.thermal + '" stroke-width="1.5"/>';
    if (S.window) o += T(291, pbot - 3, "met between L/D " + S.window.lo.toFixed(1) + " and " + S.window.hi.toFixed(0), { size: 8, fill: C.thermal });
    o += T(287 + pw - 4, ptop + 12, "voltage limited", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
    o += T(291, ptop + 12, "current limited", { size: 8, weight: "bold", fill: C.scalar });
    b += o;
  })();

  /* c. the same target, asked of three shapes */
  (function () {
    const x0 = 52, y0 = 254;
    b += T(x0 - 36, y0 - 12, "c", { size: 11, weight: "bold" });
    b += T(x0, y0 - 12, ("shapes that reach " + S.targetC + " °C, in " + S.materialName).toUpperCase(), { size: 8, weight: "bold", fill: C.grey });
    b += line(x0, y0 - 6, x0 + 200, y0 - 6, { stroke: C.ink, sw: 0.8 });
    F.forEach(function (f, i) {
      const y = y0 + 12 + i * 34;
      b += T(x0, y, f.form, { size: 9, weight: "bold", fill: C.thermal });
      b += T(x0 + 200, y, f.constraint.toLowerCase() + " limited", { size: 8, anchor: "end", fill: C.faint });
      b += T(x0, y + 11, f.dims, { size: 8.5 });
      b += T(x0, y + 22, f.R.toFixed(2) + " Ω · " + f.current.toFixed(1) + " A · " +
        f.voltage.toFixed(1) + " V · " + f.power.toFixed(0) + " W", { size: 8, fill: C.grey });
      if (i < F.length - 1) b += line(x0, y + 27, x0 + 200, y + 27, { stroke: "#E8E8E8", sw: 0.5 });
    });
  })();

  /* d. and of six materials */
  (function () {
    const x0 = 287, y0 = 254, rows = S.byMaterial;
    b += T(x0 - 36, y0 - 12, "d", { size: 11, weight: "bold" });
    b += T(x0, y0 - 12, ("materials that reach " + S.targetC + " °C").toUpperCase(), { size: 8, weight: "bold", fill: C.grey });
    b += line(x0, y0 - 6, x0 + 200, y0 - 6, { stroke: C.ink, sw: 0.8 });
    rows.forEach(function (r, i) {
      const y = y0 + 11 + i * 16;
      const on = r.reaches;
      b += '<rect x="' + x0 + '" y="' + (y - 6.5) + '" width="7" height="7" fill="' +
        (on ? C.thermal : "#FFFFFF") + '" stroke="' + (on ? C.thermal : C.faint) + '" stroke-width="0.8"/>';
      b += T(x0 + 12, y, r.name, { size: 8.5, fill: on ? C.ink : C.faint });
      b += T(x0 + 200, y, on ? "L/D " + r.ld.toFixed(1) + ",  " + r.R.toFixed(2) + " Ω"
                             : "requires " + r.needs.current.toFixed(0) + " A at " + r.needs.voltage.toFixed(1) + " V" +
                               (r.needs.overJmax ? " †" : ""),
        { size: 8, anchor: "end", fill: on ? C.grey : C.faint });
    });
    b += T(x0, y0 + 11 + rows.length * 16 + 9, "resistivity spans " +
      rows[0].rho.toExponential(1).replace("e-", "×10^{−") + "} to " +
      rows[rows.length - 1].rho.toExponential(1).replace("e-", "×10^{−") + "} Ω·cm", { size: 8, fill: C.grey });
  })();
  return b;
}

/* ------------------------------------------------------------------ */
/* Fig. S7. The three published reactors, as signed differences.        */
/* ------------------------------------------------------------------ */
export function crosscheck(DATA) {
  const ns = "s7", W = 505, H = 236;
  const G = DATA.crosscheck;
  let b = defs(ns);
  const LX = 22, RX = 222, MX = 282, BX = 316, BW = 172, CX = BX + BW / 2;
  const SPAN = 10;                     /* the bar axis runs to ±10 % */
  const X = (pct) => CX + (pct / SPAN) * (BW / 2);

  b += T(LX, 22, "QUANTITY", { size: 8, weight: "bold", fill: C.grey });
  b += T(RX, 22, "REPORTED", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
  b += T(MX, 22, "MODEL", { size: 8, weight: "bold", anchor: "end", fill: C.grey });
  b += T(CX, 22, "SIGNED DIFFERENCE", { size: 8, weight: "bold", anchor: "middle", fill: C.grey });
  b += line(LX, 27, 488, 27, { stroke: C.ink, sw: 0.9 });

  let y = 42;
  G.forEach(function (grp, gi) {
    b += T(LX, y, grp.source, { size: 9, weight: "bold" });
    b += T(MX, y, grp.detail, { size: 8, anchor: "end", fill: C.faint });
    y += 13;
    grp.rows.forEach(function (r) {
      const diff = 100 * (r.model - r.reported) / r.reported;
      const w = Math.abs(X(diff) - CX);
      b += T(LX + 8, y, r.q, { size: 8.5 });
      b += T(RX, y, r.reported + (r.unit ? " " + r.unit : ""), { size: 8.5, anchor: "end", fill: C.grey });
      b += T(MX, y, r.model + (r.unit ? " " + r.unit : ""), { size: 8.5, anchor: "end" });
      b += '<rect x="' + (diff < 0 ? CX - w : CX) + '" y="' + (y - 6.5) + '" width="' + Math.max(w, 0.6) +
        '" height="8" fill="' + (Math.abs(diff) > 5 ? C.thermal : C.grey) + '" fill-opacity="0.85"/>';
      b += T(diff < 0 ? CX - w - 4 : CX + w + 4, y, (diff > 0 ? "+" : "−") + Math.abs(diff).toFixed(2) + " %",
        { size: 8, anchor: diff < 0 ? "end" : "start", fill: C.grey });
      y += 15;
    });
    if (gi < G.length - 1) { b += line(LX, y - 6, 488, y - 6, { stroke: "#EAEAEA", sw: 0.5 }); y += 6; }
  });

  /* the difference axis, drawn under the bars it scales */
  const ay = y + 2;
  [-10, -5, 0, 5, 10].forEach(function (t) {
    b += line(X(t), 34, X(t), ay, { stroke: t === 0 ? C.ink : "#DDDDDD", sw: t === 0 ? 0.9 : 0.5, dash: t === 0 ? "" : "2 2" });
    b += T(X(t), ay + 11, (t > 0 ? "+" : t < 0 ? "−" : "") + Math.abs(t) + " %", { size: 8, anchor: "middle", fill: C.grey });
  });
  b += line(X(-SPAN), ay, X(SPAN), ay, { stroke: C.grey, sw: 0.7 });
  b += T(LX, ay + 11, "orange beyond ±5 %, grey within", { size: 8, fill: C.grey });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Fig. S8. How a change gets in, and what has to be touched to make    */
/* one. No tool or model is named: they date, the structure does not.   */
/* ------------------------------------------------------------------ */
export function architecture(DATA) {
  const ns = "s8", W = 505, H = 274;
  let b = defs(ns);

  /* ---- a. the gate a revision has to pass ---- */
  b += T(18, 22, "a", { size: 11, weight: "bold" });
  const boxA = (x, y, w, h, label, sub, colour, tint) =>
    rect(x, y, w, h, { stroke: C.edge, fill: tint || TINT.grey, sw: 0.8 }) +
    T(x + w / 2, y + (sub ? 14 : h / 2 + 3.2), label, { size: 9, weight: "bold", anchor: "middle", fill: colour || SHADE.grey }) +
    (sub ? T(x + w / 2, y + 25, sub, { size: 8, anchor: "middle", fill: C.grey }) : "");

  const ay = 34, ah = 34;
  b += boxA(18, ay, 104, ah, "Physical specification", "and its assumptions", SHADE.ink);
  b += arrow(ns, "M122," + (ay + ah / 2) + " L136," + (ay + ah / 2), { color: "hair" });
  b += boxA(137, ay, 82, ah, "Implementation", "assisted", SHADE.grey);
  b += arrow(ns, "M219," + (ay + ah / 2) + " L233," + (ay + ah / 2), { color: "hair" });
  b += boxA(234, ay, 96, ah, "Independent review", "a second model", SHADE.grey);
  b += arrow(ns, "M330," + (ay + ah / 2) + " L344," + (ay + ah / 2), { color: "hair" });
  b += rect(345, ay, 82, ah, { stroke: C.ink, fill: "#FFFFFF", sw: 1.1 });
  b += T(386, ay + 14, "Verification", { size: 9, weight: "bold", anchor: "middle" });
  b += T(386, ay + 25, "gates", { size: 9, weight: "bold", anchor: "middle" });
  b += arrow(ns, "M427," + (ay + ah / 2) + " L441," + (ay + ah / 2), { color: "hair" });
  b += rect(442, ay, 45, ah, { stroke: C.edge, fill: TINT.grey, sw: 0.8 });
  b += T(464.5, ay + 14, "Release", { size: 9, weight: "bold", anchor: "middle", fill: SHADE.ink });
  b += T(464.5, ay + 25, "versioned", { size: 8, anchor: "middle", fill: C.grey });
  b += T(434, ay - 8, "pass", { size: 8, fill: C.grey });

  /* the failure path returns to implementation, which is the whole point */
  b += arrow(ns, "M386," + (ay + ah + 2) + " L386,96 L178,96 L178," + (ay + ah + 1), { color: "hair", sw: 1, dash: "3 2" });
  b += T(282, 93, "fail", { size: 8, anchor: "middle", fill: C.grey });
  /* ---- b. what attaches to the core, and what the core does not know ---- */
  b += T(18, 128, "b", { size: 11, weight: "bold" });
  const cx = 232, cy = 172, cw = 118, ch = 40;
  b += rect(cx, cy, cw, ch, { stroke: C.ink, fill: "#FFFFFF", sw: 1.1 });
  b += T(cx + cw / 2, cy + 17, "solver.js", { size: 10, weight: "bold", anchor: "middle", fill: SHADE.ink });
  b += T(cx + cw / 2, cy + 29, "DOM-free numerical core", { size: 8, anchor: "middle", fill: C.grey });

  const feeds = [
    { y: 140, label: "Material presets", note: "temperature-dependent properties", c: SHADE.grey },
    { y: 172, label: "Geometry, wall, gas", note: "the boundary-condition configuration", c: SHADE.grey },
    { y: 204, label: "Browser interface", note: "inputs and outputs only", c: SHADE.grey }
  ];
  feeds.forEach(function (f) {
    b += rect(18, f.y, 168, 24, { stroke: C.edge, fill: TINT.grey, sw: 0.8 });
    b += T(26, f.y + 10, f.label, { size: 8.5, weight: "bold", fill: f.c });
    b += T(26, f.y + 20, f.note, { size: 8, fill: C.grey });
    b += arrow(ns, "M186," + (f.y + 12) + " L" + (cx - 2) + "," + (cy + ch / 2), { color: "hair", sw: 0.8 });
  });
  b += rect(18, 236, 168, 24, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8, dash: "3 2" });
  b += T(26, 246, "Verification suite", { size: 8.5, weight: "bold", fill: SHADE.grey });
  b += T(26, 256, "regression, conservation, benchmarks", { size: 8, fill: C.grey });
  b += arrow(ns, "M186,248 L" + (cx - 2) + "," + (cy + ch - 4), { color: "hair", sw: 0.8, dash: "3 2" });

  b += arrow(ns, "M" + (cx + cw) + "," + (cy + ch / 2) + " L" + (cx + cw + 14) + "," + (cy + ch / 2), { color: "hair" });
  b += rect(cx + cw + 15, cy - 6, 108, ch + 12, { stroke: C.edge, fill: "#FFFFFF", sw: 0.8 });
  ["2D field and diagnostics", "loss partition, closure", "CSV export", "these figures"].forEach(function (t, i) {
    b += T(cx + cw + 23, cy + 6 + i * 11, t, { size: 8, fill: i === 0 ? C.ink : C.grey });
  });

  return svgDoc(W, H, b);
}
