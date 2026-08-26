// Shared drawing kit for the figure sets. Authored in points, so a viewBox
// unit is a printed point and font-size 9 is 9 pt on the page. Nothing here
// knows a number of its own; the plate functions pass everything in.
//
// Used twice over: imported by each note's draw.mjs to write the SVGs, and
// inlined into each published figure page with the export keywords stripped.

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
export const C = { scalar:"#0072B2", field:"#E69F00", thermal:"#D55E00", gas:"#009E73",
            grey:"#6E6E6E", ink:"#111111", rule:"#BBBBBB", faint:"#8A8A8A",
            hair:"#AEB6BD", edge:"#C9CFD5" };
export const TINT = { scalar:"#DBEBF4", field:"#FCF2DB", thermal:"#F9E9DB", gas:"#DBF1EB",
               grey:"#EDEFF1", wall:"#E8E8E8", air:"#F7F7F7", panel:"#FBFBFB" };
export const SHADE = { scalar:"#005B8F", field:"#9A6C00", thermal:"#A84A00", gas:"#00785A",
                grey:"#4A5058", ink:"#111111" };
export const shadeOf = (hue) => SHADE[Object.keys(C).find((k) => C[k] === hue)] || hue;
export const tintOf = (hue) => TINT[Object.keys(C).find((k) => C[k] === hue)] || "#FFFFFF";
export const ZWS = "​";

export const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

/* _{..} and ^{..} become tspans one point smaller, so nothing on any
   figure falls below the 8 pt floor as long as the base size is 9. */
export function rich(x, y, s, o) {
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
export const T = rich;

export function rect(x, y, w, h, o) {
  o = o || {};
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
    '" rx="' + (o.rx === undefined ? 2 : o.rx) + '" fill="' + (o.fill || "#FFFFFF") +
    '" stroke="' + (o.stroke || C.grey) + '" stroke-width="' + (o.sw || 0.8) + '"' +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") + '/>';
}
export function line(x1, y1, x2, y2, o) {
  o = o || {};
  return '<path d="M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2 + '" fill="none" stroke="' +
    (o.stroke || C.rule) + '" stroke-width="' + (o.sw || 0.5) + '"' +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") + '/>';
}
export function defs(ns) {
  return '<defs>' + Object.keys(C).map(function (k) {
    return '<marker id="' + ns + '-' + k + '" viewBox="0 0 10 8" refX="9.4" refY="4" ' +
      'markerWidth="5" markerHeight="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="' +
      C[k] + '"/></marker>';
  }).join("") + '</defs>';
}
export function arrow(ns, d, o) {
  o = o || {};
  const c = o.color || "grey";
  return '<path d="' + d + '" fill="none" stroke="' + C[c] + '" stroke-width="' + (o.sw || 0.9) +
    '"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") +
    ' marker-end="url(#' + ns + '-' + c + ')"' + (o.start ? ' marker-start="url(#' + ns + '-' + c + ')"' : "") + '/>';
}
export function svgDoc(w, h, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + 'pt" height="' + h + 'pt" ' +
    'viewBox="0 0 ' + w + ' ' + h + '" font-family="Arial, Helvetica, sans-serif">' +
    '<rect width="' + w + '" height="' + h + '" fill="#FFFFFF"/>' + body + '</svg>';
}
/* A titled stage box with an explanatory second line. */
export function stage(x, y, w, h, title, sub, color, fill) {
  return rect(x, y, w, h, { stroke: C.edge, fill: fill || tintOf(color), sw: 0.8 }) +
    T(x + w / 2, y + (sub ? 13 : h / 2 + 3.2), title, { size: 9.5, weight: "bold", anchor: "middle", fill: shadeOf(color) }) +
    (sub ? T(x + w / 2, y + 24, sub, { size: 8.5, anchor: "middle", fill: C.grey }) : "");
}

