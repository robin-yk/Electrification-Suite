
/* ------------------------------------------------------------------ */
/* Rendering and export.                                               */
/* ------------------------------------------------------------------ */
const SRC = {};   /* FIGS is defined by make-figures.mjs, in manuscript order */

Object.keys(FIGS).forEach(function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  let svg;
  try { svg = FIGS[id](DATA); } catch (e) {
    el.querySelector(".plate").textContent = "Could not draw this figure: " + e.message;
    return;
  }
  SRC[id] = svg;
  el.querySelector(".plate").innerHTML = svg;
  el.querySelector("textarea").value = svg;
});

function hint(id, msg) {
  const h = document.getElementById(id).querySelector(".hint");
  h.textContent = msg;
}

document.addEventListener("click", function (ev) {
  const btn = ev.target.closest("button");
  if (!btn) return;

  const srcId = btn.getAttribute("data-src");
  if (srcId) {
    const ta = document.getElementById(srcId).querySelector("textarea");
    const on = ta.classList.toggle("on");
    btn.textContent = on ? "Hide SVG source" : "Show SVG source";
    if (on) { ta.focus(); ta.select(); hint(srcId, "Selected. Copy, then save as a file ending in .svg."); }
    else hint(srcId, "");
    return;
  }

  const copyId = btn.getAttribute("data-copy");
  if (copyId) {
    const text = SRC[copyId];
    if (!text) return;
    const done = function () { hint(copyId, "Copied. Paste into a file ending in .svg."); };
    const fail = function () {
      const ta = document.getElementById(copyId).querySelector("textarea");
      ta.classList.add("on"); ta.focus(); ta.select();
      hint(copyId, "The clipboard is not available here. The source is selected below; copy it by hand.");
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
      else fail();
    } catch (e) { fail(); }
    return;
  }

  const pngId = btn.getAttribute("data-png");
  if (pngId) {
    const fig = document.getElementById(pngId);
    const cv = fig.querySelector("canvas");
    const svg = SRC[pngId];
    const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const w = parseFloat(m[1]), h = parseFloat(m[2]), k = 600 / 72;
    const img = new Image();
    img.onload = function () {
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.classList.add("on");
      hint(pngId, cv.width + " × " + cv.height + " px, which is 600 dpi at " +
        (w / 72 * 25.4).toFixed(0) + " mm wide. Right-click the image and choose Save image as.");
    };
    img.onerror = function () {
      hint(pngId, "This browser would not rasterize the figure. Use the SVG source instead; it prints better anyway.");
    };
    try {
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (e) {
      hint(pngId, "This browser would not rasterize the figure. Use the SVG source instead.");
    }
  }
});
