/* Render every plate and measure it. getBoundingClientRect, not getBBox:
   the first is after the transform, and a rotated axis label always reports
   an out-of-bounds untransformed box.

   Two checks. The plate boundary catches artwork running off the sheet. The
   panel frames catch what the boundary cannot: a marker or a tick label that
   straddles the frame it belongs to, which is how panel e of Fig. 3 put its
   first and last data point outside the axes. */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || "file://" + join(here, "index.html");
/* set PLATE_CHECK_OUT to a directory to also write report.json and one PNG per plate */
const OUT = process.env.PLATE_CHECK_OUT || "";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
await page.goto(src, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const out = [];
  for (const fig of document.querySelectorAll("figure[id]")) {
    const svg = fig.querySelector(".plate svg");
    if (!svg) { out.push({ id: fig.id, fatal: "no svg rendered" }); continue; }
    const vb = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    const box = svg.getBoundingClientRect(), s = box.width / vb[2];
    const pt = (px) => px / s;
    const P = (el) => { const r = el.getBoundingClientRect();
      return { l: (r.left - box.left) / s, r: (r.right - box.left) / s,
               t: (r.top - box.top) / s, b: (r.bottom - box.top) / s, w: r.width / s, h: r.height / s }; };

    const clipped = [], texts = [];
    const all = [...svg.querySelectorAll("text, rect, line, path, circle, polyline, polygon, image")];
    for (const el of all) {
      const p = P(el);
      if (p.w === 0 && p.h === 0) continue;
      const over = { left: -p.l, right: p.r - vb[2], top: -p.t, bottom: p.b - vb[3] };
      const worst = Math.max(over.left, over.right, over.top, over.bottom);
      if (worst > 0.5) clipped.push({ tag: el.tagName, text: (el.textContent || "").slice(0, 40),
        over: Object.fromEntries(Object.entries(over).filter(([, v]) => v > 0.5).map(([k, v]) => [k, +v.toFixed(2)])) });
      if (el.tagName === "text") { const t = (el.textContent || "").trim();
        if (t) texts.push({ s: t, ...p, fs: parseFloat(getComputedStyle(el).fontSize) }); }
    }

    /* a panel frame is a white-filled rect big enough to hold a plot */
    const frames = all.filter(e => e.tagName === "rect" && ["#FFFFFF", "none"].includes(e.getAttribute("fill")))
      .map(e => ({ el: e, ...P(e) })).filter(f => f.w > 60 && f.h > 35 && f.w < vb[2] - 4);   /* an inset counts too */
    /* a data marker belongs inside a panel. Straddling is not enough of a test:
       panel e of Fig. 3 put its first and last point wholly outside the axes,
       which crosses no boundary and so crosses nothing to detect. */
    const stray = [];
    if (frames.length) {
      for (const el of all) {
        const p = P(el);
        const isMarker = el.tagName === "circle" || (el.tagName === "rect" && p.w < 6 && p.h < 6 && p.w > 0);
        if (!isMarker) continue;
        const home = frames.some(f => p.l >= f.l - 0.75 && p.r <= f.r + 0.75 && p.t >= f.t - 0.75 && p.b <= f.b + 0.75);
        if (!home) stray.push({ tag: el.tagName, x: +p.l.toFixed(2), y: +p.t.toFixed(2) });
      }
    }

    /* two markers on top of each other: a legend key sitting on the data it
       keys. Neither is text, so the text-on-text rule never sees it. */
    const marks = all.filter(e => e.tagName === "circle" ||
      (e.tagName === "rect" && P(e).w < 6 && P(e).h < 6 && P(e).w > 0)).map(e => ({ el: e, ...P(e) }));
    const collide = [];
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
      const a = marks[i], c = marks[j];
      const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l);
      const oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (ox > 0.5 && oy > 0.5) collide.push({ x: +a.l.toFixed(1), y: +a.t.toFixed(1), by: +Math.min(ox, oy).toFixed(2) });
    }

    /* a rule is drawn to separate, so type must not sit on one. Gridlines are
       thin and are excluded by the stroke-width test. */
    const onRule = [];
    const rules = all.filter(e => e.tagName === "line" && parseFloat(e.getAttribute("stroke-width") || "0") >= 0.8)
      .map(e => P(e));
    for (const t of texts) {
      for (const r of rules) {
        const ox = Math.min(t.r, r.r) - Math.max(t.l, r.l);
        const oy = Math.min(t.b, r.b + 0.6) - Math.max(t.t, r.t - 0.6);
        if (ox > 1 && oy > 0.8) { onRule.push({ t: t.s.slice(0, 34), by: +oy.toFixed(2) }); break; }
      }
    }

    const straddle = [];
    for (const f of frames) {
      const TOL = 0.75;                       /* stroke width and antialiasing */
      for (const el of all) {
        if (el === f.el || el.tagName === "line" || el.tagName === "path") continue;
        const p = P(el);
        if (p.w === 0 && p.h === 0) continue;
        const hits = p.r > f.l + TOL && p.l < f.r - TOL && p.b > f.t + TOL && p.t < f.b - TOL;
        if (!hits) continue;                  /* wholly outside this frame: not its business */
        const wraps = p.l <= f.l + TOL && p.r >= f.r - TOL && p.t <= f.t + TOL && p.b >= f.b - TOL;
        if (wraps) continue;                  /* a background the frame sits on */
        const outBy = Math.max(f.l - p.l, p.r - f.r, f.t - p.t, p.b - f.b);
        if (outBy > TOL) straddle.push({ tag: el.tagName, text: (el.textContent || "").slice(0, 34), by: +outBy.toFixed(2) });
      }
    }

    const overlaps = [];
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], c = texts[j];
      const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l);
      const oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
      if (ox > 1 && oy > a.h * 0.45) overlaps.push({ a: a.s.slice(0, 30), b: c.s.slice(0, 30), ox: +ox.toFixed(2) });
    }
    out.push({ id: fig.id, w: vb[2], h: vb[3], nText: texts.length, nFrames: frames.length,
      clipped, straddle, stray, collide, overlaps,
      nan: texts.filter(t => /NaN|undefined|Infinity/.test(t.s)).map(t => t.s),
      small: texts.filter(t => t.fs < 7.95).map(t => ({ t: t.s.slice(0, 26), fs: +t.fs.toFixed(2) })) });
  }
  return out;
});

if (OUT) writeFileSync(join(OUT, "report.json"), JSON.stringify({ errs, report }, null, 1));
if (errs.length) console.log("page errors:", errs);
for (const r of report) {
  const bits = [];
  if (r.fatal) bits.push("FATAL " + r.fatal);
  if (r.nan?.length) bits.push("NaN: " + r.nan.join(" | "));
  if (r.small?.length) bits.push("under 8 pt: " + JSON.stringify(r.small));
  if (r.clipped?.length) bits.push("off the sheet " + r.clipped.length + ": " + JSON.stringify(r.clipped.slice(0, 5)));
  if (r.collide?.length) bits.push("marker on marker " + r.collide.length + ": " + JSON.stringify(r.collide.slice(0, 5)));
  if (r.stray?.length) bits.push("marker outside every panel " + r.stray.length + ": " + JSON.stringify(r.stray.slice(0, 6)));
  if (r.onRule?.length) bits.push("type sitting on a rule " + r.onRule.length + ": " + JSON.stringify(r.onRule.slice(0, 6)));
  if (r.straddle?.length) bits.push("across a panel frame " + r.straddle.length + ": " + JSON.stringify(r.straddle.slice(0, 6)));
  if (r.overlaps?.length) bits.push("text on text " + r.overlaps.length + ": " + JSON.stringify(r.overlaps.slice(0, 6)));
  console.log(`${r.id.padEnd(6)} ${r.w}x${r.h} texts=${r.nText} frames=${r.nFrames}  ${bits.length ? bits.join("\n        ") : "ok"}`);
}
if (OUT) for (const r of report) {
  const el = await page.$(`figure#${r.id} .plate`);
  if (el) await el.screenshot({ path: join(OUT, r.id + ".png") });
}
await browser.close();

/* a nonzero exit so this can gate a build the way the figure pipeline does */
process.exitCode = report.some(r => r.fatal || r.nan?.length || r.small?.length ||
  r.clipped?.length || r.straddle?.length || r.stray?.length || r.collide?.length || r.overlaps?.length) ? 1 : 0;
