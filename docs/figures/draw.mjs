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
const C = { scalar:"#0072B2", field:"#E69F00", thermal:"#D55E00", gas:"#009E73",
            grey:"#6E6E6E", ink:"#111111", rule:"#BBBBBB", faint:"#8A8A8A" };
const TINT = { field:"#FCF0DC", gas:"#E4F5EF", wall:"#E8E8E8", air:"#F7F7F7",
               scalar:"#E6F1F8", thermal:"#FBE9DF", panel:"#FBFBFB" };
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
  return rect(x, y, w, h, { stroke: color, fill: fill || "#FFFFFF", sw: 1 }) +
    T(x + w / 2, y + (sub ? 13 : h / 2 + 3.2), title, { size: 9.5, weight: "bold", anchor: "middle", fill: color }) +
    (sub ? T(x + w / 2, y + 24, sub, { size: 8.5, anchor: "middle", fill: C.grey }) : "");
}

/* ------------------------------------------------------------------ */
/* Figure 1. Order of computation.                                     */
/* ------------------------------------------------------------------ */
export function fig1(DATA) {
  const ns = "f1", W = 505, H = 636;
  const sx = 127.5, sw = 250, cx = sx + sw / 2;
  let b = defs(ns);

  b += stage(sx, 12, sw, 28, "Inputs", "geometry, material, drive setting, enclosure", C.grey);
  b += arrow(ns, "M" + cx + ",40 L" + cx + ",53");
  b += stage(sx, 54, sw, 28, "Zero-dimensional steady state", "one temperature, used as the seed", C.scalar, TINT.scalar);
  b += arrow(ns, "M" + cx + ",82 L" + cx + ",95");
  b += stage(sx, 96, sw, 28, "Build the axisymmetric mesh", "built once and held fixed", C.grey);
  b += arrow(ns, "M" + cx + ",124 L" + cx + ",137");

  /* the Picard frame */
  b += rect(26, 138, 453, 254, { stroke: C.ink, fill: TINT.panel, sw: 1.1, dash: "3 2" });
  b += T(36, 153, "Outer Picard iteration", { size: 10, weight: "bold" });
  b += T(163, 153, "coefficients re-evaluated from the current temperature field", { size: 8.5, fill: C.grey });

  const cols = [
    { x: 34, c: C.scalar, tint: TINT.scalar, key: "scalar", head: "Scalar electrical", role: "returns one number",
      items: [{ t: "T_{avg}   volume average" },
              { t: "ρ(T_{avg})   resistivity" },
              { t: "R_{bulk} = ρ L / A" },
              { t: "R_{total} = R_{bulk} + 2R_{c}" },
              { t: "I   set by R_{total}" },
              { t: "P_{bulk} = I² R_{bulk}" },
              { t: "P_{contact} = I² · 2R_{c}", off: true }] },
    { x: 186, c: C.field, tint: TINT.field, key: "field", head: "Local electrical field", role: "returns a shape only",
      items: [{ t: "T(r,z)   temperature field" },
              { t: "σ(T) = 1 / ρ(T)" },
              { t: "∇·(σ ∇V) = 0" },
              { t: "q‴_{unit}(r,z)" }] },
    { x: 338, c: C.thermal, tint: TINT.thermal, key: "thermal", head: "Thermal properties", role: "returns matrix coefficients",
      items: [{ t: "k(T)   conduction" },
              { t: "c_{p}(T)   transient only" },
              { t: "h_{rad}   radiation" }] }
  ];
  cols.forEach(function (col) {
    b += T(col.x, 171, col.head, { size: 9.5, weight: "bold", fill: col.c });
    b += T(col.x, 181, col.role, { size: 8, fill: C.grey });
    col.items.forEach(function (it, i) {
      const y = 186 + i * 25;
      if (it.off) {
        b += rect(col.x, y, 137, 17, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, dash: "2.5 2" });
        b += T(col.x + 6, y + 11.6, it.t, { size: 9, fill: C.grey });
        b += T(col.x, y + 27, "reported, and not deposited", { size: 8, fill: C.grey });
        b += T(col.x, y + 37, "anywhere in the thermal domain", { size: 8, fill: C.grey });
        return;
      }
      b += rect(col.x, y, 137, 17, { stroke: col.c, fill: col.tint, sw: 0.8 });
      b += T(col.x + 6, y + 11.6, it.t, { size: 9 });
      const next = col.items[i + 1];
      if (next && !next.off) b += arrow(ns, "M" + (col.x + 68.5) + "," + (y + 17) + " L" + (col.x + 68.5) + "," + (y + 25), { color: col.key, sw: 0.8 });
      if (next && next.off) b += line(col.x + 68.5, y + 17, col.x + 68.5, y + 25, { stroke: C.grey, sw: 0.8, dash: "2 2" });
    });
  });
  b += T(36, 384, "Each sweep re-evaluates all three branches from the temperature field the previous sweep produced.", { size: 8.5, fill: C.grey });

  b += arrow(ns, "M" + cx + ",392 L" + cx + ",407");
  b += stage(sx, 408, sw, 28, "Assemble the thermal matrix", "one row per finite-volume cell", C.thermal, TINT.thermal);
  b += arrow(ns, "M" + cx + ",436 L" + cx + ",449");
  b += rect(sx, 450, sw, 40, { stroke: C.thermal, fill: TINT.thermal, sw: 1 });
  b += T(cx, 463, "Preconditioned linear solve", { size: 9.5, weight: "bold", anchor: "middle", fill: C.thermal });
  b += T(cx, 474, "PCG while the matrix is symmetric,", { size: 8.5, anchor: "middle", fill: C.grey });
  b += T(cx, 484, "BiCGSTAB once gas transport makes it not", { size: 8.5, anchor: "middle", fill: C.grey });
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
export function fig2(DATA) {
  const ns = "f2", W = 505, H = 406, s = 4.474;   /* pt per mm, both drawings */
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
  b += T(32, 116, "edge view, drawn to the same scale", { size: 8.5, fill: C.grey });
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
  b += T(300, 116, "the diameter follows from the surface, not the volume", { size: 8.5, fill: C.grey });

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
    { g: "Derived to hold the four above", c: C.grey },
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

  b += line(32, y + 4, 480, y + 4, { stroke: C.ink, sw: 0.9 });
  b += T(32, y + 18, "Surface is 2(LW + LH + WH) = " + S.surface.toFixed(3) + " cm². The two-face convention 2LW gives " + S.surface2f.toFixed(3) + " cm² and omits the edges,", { size: 8.5, fill: C.grey });
  b += T(32, y + 29, "which are " + S.edgePct.toFixed(2) + " % of the total. The solver uses the first convention everywhere.", { size: 8.5, fill: C.grey });
  b += T(32, y + 43, "The zero-dimensional solve uses the three rectangular dimensions as they are. This substitution applies only to", { size: 8.5 });
  b += T(32, y + 54, "the axisymmetric solves, which cannot mesh a box.", { size: 8.5 });

  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Figure 3. The real half-domain, drawn from the cell edges the mesh  */
/* builder returns. Nothing here is mirrored.                          */
/* ------------------------------------------------------------------ */
export function fig3(DATA) {
  const ns = "f3", W = 505, H = 386;
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
  b += arrow(ns, "M" + xg + "," + (ybot - 6) + " L" + xg + "," + (ytop + 8), { color: "gas", sw: 1.4 });

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
  ay += 4;
  b += T(ax + 13, ay, "A gas pad is the gas-filled band of rows above and", { size: 8.5, fill: C.grey });
  b += T(ax + 13, ay + 10, "below the element. Graded means the air cells widen", { size: 8.5, fill: C.grey });
  b += T(ax + 13, ay + 20, "outward, the last being ×" + M.stretch.toFixed(0) + " the first.", { size: 8.5, fill: C.grey });
  ay += 32;
  ay += 10;
  b += '<rect x="' + ax + '" y="' + (ay - 7) + '" width="8" height="8" fill="none" stroke="' + C.gas + '" stroke-width="1.2"/>';
  b += T(ax + 13, ay, "process gas, in the flow direction", { size: 9, fill: C.gas });
  ay += 13;
  b += T(ax, ay, "The solved region is the half-plane shown. No mirrored", { size: 8.5, fill: C.grey });
  b += T(ax, ay + 11, "counterpart is stored or solved.", { size: 8.5, fill: C.grey });

  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Figure 4. What the assembly writes into the matrix.                 */
/* ------------------------------------------------------------------ */
export function fig4(DATA) {
  const ns = "f4", W = 505, H = 396;
  let b = defs(ns);
  const rows = [34, 116, 198, 280];
  const SX = 30, MX = 168, TX = 268;

  b += T(SX, 22, "Cells coupled", { size: 8.5, weight: "bold", fill: C.grey });
  b += T(MX, 22, "Matrix position", { size: 8.5, weight: "bold", fill: C.grey });
  b += T(MX, 32, "schematic; the 30 × 60 mesh has 1800 unknowns", { size: 8, fill: C.faint });
  b += T(TX, 22, "Term", { size: 8.5, weight: "bold", fill: C.grey });
  b += line(SX, 26, 495, 26, { stroke: C.ink, sw: 0.9 });

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
  b += T(TX, y + 23, "Two-point flux across the shared face, with the two", { size: 8.5 });
  b += T(TX, y + 34, "half-cell resistances in series. Fills the bands next", { size: 8.5 });
  b += T(TX, y + 45, "to the diagonal, and is symmetric.", { size: 8.5 });
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
  b += T(TX, y + 23, "Adds to the diagonal and to the right-hand side only.", { size: 8.5 });
  b += T(TX, y + 34, "The radiation coefficient is linearized about the", { size: 8.5 });
  b += T(TX, y + 45, "current temperature, and is symmetric.", { size: 8.5 });
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
  b += T(TX, y + 23, "Couples two cells that share no face, across the gas", { size: 8.5 });
  b += T(TX, y + 34, "gap. The entries sit far from the diagonal, and appear", { size: 8.5 });
  b += T(TX, y + 45, "in matching pairs, so the operator stays symmetric.", { size: 8.5 });
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
  b += T(TX, y + 23, "The cell upstream in the flow direction contributes; the", { size: 8.5 });
  b += T(TX, y + 34, "cell downstream does not. The matching entry is absent,", { size: 8.5 });
  b += T(TX, y + 45, "shown dashed, so the operator is not symmetric.", { size: 8.5 });

  b += line(SX, 356, 495, 356, { stroke: C.ink, sw: 0.9 });
  b += T(SX, 370, "The first three terms preserve matrix symmetry. Directed gas enthalpy transport produces a nonsymmetric", { size: 9 });
  b += T(SX, 382, "operator and activates BiCGSTAB.", { size: 9 });
  return svgDoc(W, H, b);
}

/* ------------------------------------------------------------------ */
/* Figure 5. One total power, one spatial shape, and where they meet.  */
/* ------------------------------------------------------------------ */
export function fig5(DATA) {
  const ns = "f5", W = 505, H = 318;
  let b = defs(ns);
  const xs = [20, 142, 264, 386], bw = 108;

  const chain = function (y, color, tint, items) {
    items.forEach(function (it, i) {
      const x = xs[i];
      b += rect(x, y, bw, 28, { stroke: color, fill: tint, sw: 1 });
      b += T(x + bw / 2, y + 12, it[0], { size: 9.5, weight: "bold", anchor: "middle", fill: color });
      b += T(x + bw / 2, y + 23, it[1], { size: 8.5, anchor: "middle", fill: C.grey });
      if (i < 3) b += arrow(ns, "M" + (x + bw) + "," + (y + 14) + " L" + (xs[i + 1] - 2) + "," + (y + 14),
        { color: Object.keys(C).find(function (k) { return C[k] === color; }), sw: 1 });
    });
  };

  b += T(20, 18, "Scalar branch", { size: 10, weight: "bold", fill: C.scalar });
  b += T(96, 18, "sets how much power the element dissipates, from the volume-average temperature", { size: 8.5, fill: C.grey });
  chain(26, C.scalar, TINT.scalar, [
    ["T_{avg}", "volume average"],
    ["ρ(T_{avg}),  R_{bulk}", "R_{total} = R_{bulk} + 2R_{c}"],
    ["I", "set by R_{total}"],
    ["P_{bulk} = I² R_{bulk}", "one number, in watts"]
  ]);
  /* the contact term is computed on the same current and then leaves */
  b += line(440, 54, 440, 62, { stroke: C.grey, sw: 0.8, dash: "2 2" });
  b += rect(236, 62, 258, 18, { stroke: C.grey, fill: "#FFFFFF", sw: 0.8, dash: "2.5 2" });
  b += T(365, 74, "P_{contact} = I² · 2R_{c},  reported and not deposited", { size: 8.5, anchor: "middle", fill: C.grey });

  b += T(20, 106, "Field branch", { size: 10, weight: "bold", fill: C.field });
  b += T(90, 106, "sets only where that power lands, from the local temperature field", { size: 8.5, fill: C.grey });
  chain(114, C.field, TINT.field, [
    ["T(r,z)", "temperature field"],
    ["σ(T) = 1 / ρ(T)", "local conductivity"],
    ["∇·(σ ∇V) = 0", "unit potential"],
    ["q‴_{unit}(r,z)", "a shape, not a magnitude"]
  ]);

  /* the join */
  b += rect(110, 176, 360, 46, { stroke: C.ink, fill: "#FFFFFF", sw: 1.2 });
  b += T(290, 194, "q‴(r,z)  =  P_{bulk} · q‴_{unit}(r,z) / ∫ q‴_{unit} dV", { size: 10.5, weight: "bold", anchor: "middle" });
  b += T(290, 210, "the shape is scaled so that its volume integral equals the scalar total", { size: 8.5, anchor: "middle", fill: C.grey });
  b += arrow(ns, "M494,54 L500,54 L500,199 L472,199", { color: "scalar", sw: 1 });
  b += arrow(ns, "M440,142 L440,174", { color: "field", sw: 1 });

  b += arrow(ns, "M290,222 L290,238", { color: "ink", sw: 1 });
  b += rect(170, 240, 240, 30, { stroke: C.thermal, fill: TINT.thermal, sw: 1 });
  b += T(290, 253, "Assemble and solve the thermal system", { size: 9.5, weight: "bold", anchor: "middle", fill: C.thermal });
  b += T(290, 264, "q‴ is the source term in every element cell", { size: 8.5, anchor: "middle", fill: C.grey });

  /* the temperature field returns to both branches */
  b += arrow(ns, "M170,255 L10,255 L10,40 L18,40", { color: "thermal", sw: 1 });
  b += arrow(ns, "M10,128 L18,128", { color: "thermal", sw: 1 });
  b += '<text x="6" y="180" font-size="8.5" fill="' + C.thermal + '" text-anchor="middle" transform="rotate(-90 6 180)">T(r,z)</text>';

  b += line(20, 288, 495, 288, { stroke: C.ink, sw: 0.9 });
  b += T(20, 302, "The field solve redistributes a fixed total power. It does not allow a local hot spot to increase the total", { size: 9 });
  b += T(20, 314, "electrical power drawn.", { size: 9 });
  return svgDoc(W, H, b);
}

