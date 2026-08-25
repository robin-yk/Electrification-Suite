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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { geometry, equivalentCylinder, build2DMesh } from "../../apps/joule/solver.js";
import { defaultInput } from "../../tools/verification/joule.mjs";
import { fig1, fig2, fig3, fig4, fig5 } from "./draw.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const p = (x, n = 4) => Number(x.toPrecision(n));

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
  commit: "abd2509",
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

const plates = { f1: fig1, f2: fig2, f3: fig3, f4: fig4, f5: fig5 };
for (const [name, fn] of Object.entries(plates)) {
  const svg = fn(DATA);
  if (/NaN|undefined/.test(svg)) throw new Error(name + " drew a NaN or an undefined value");
  writeFileSync(join(here, name.replace("f", "fig") + ".svg"), svg);
}
writeFileSync(join(here, "figure-data.json"), JSON.stringify(DATA, null, 1) + "\n");

// ---- assemble the page that publishes them
const read = (f) => readFileSync(join(here, f), "utf8");
const draw = read("draw.mjs").replace(/^export function /gm, "function ");
const page = read("templates/head.html") + read("templates/body.html") +
  "<script>\nconst DATA = Object.freeze(" + JSON.stringify(DATA) + ");\n" +
  draw + read("templates/wiring.js") + "</" + "script>\n";
writeFileSync(join(here, "index.html"), page);

console.log("wrote fig1-fig5.svg, figure-data.json and index.html");
console.log("  strip surface  " + DATA.strip.surface + " cm2 full box, " + DATA.strip.surface2f + " cm2 two faces");
console.log("  equivalent D   " + DATA.cyl.D + " mm, resistance " + DATA.strip.R + " = " + DATA.cyl.R + " ohm");
console.log("  default mesh   " + DATA.mesh.nr + " x " + DATA.mesh.nz +
  " (" + [DATA.mesh.nElement, DATA.mesh.nGap, DATA.mesh.nWall, DATA.mesh.nAir].join("/") + " radial)");
