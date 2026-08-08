import { defineConfig } from "vite";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// microwave.html / joule.html are loaded at runtime via iframe.src rather than
// referenced in index.html markup, so Vite's default crawler won't bundle them.
// Yeonsu-Kwak-CV.pdf is a plain <a href> download link, which Vite's HTML plugin
// doesn't treat as an asset reference either. joule-solver.js / microwave-solver.js
// are only reached through their page's own <script type="module" src>, and since
// that page is copied raw (never parsed as an HTML entry), Vite never sees that
// reference either — it needs the same explicit copy.
const projectPages = ["microwave.html", "microwave-solver.js", "joule.html", "joule-solver.js", "rphcjh.html", "Yeonsu-Kwak-CV.pdf"];

export default defineConfig({
  plugins: [
    {
      name: "copy-project-pages",
      writeBundle(options) {
        const outDir = options.dir || resolve(__dirname, "dist");
        for (const page of projectPages) {
          const src = resolve(__dirname, page);
          if (!existsSync(src)) throw new Error(`projectPages lists "${page}" but the file doesn't exist at ${src}`);
          copyFileSync(src, resolve(outDir, page));
        }
      },
    },
  ],
});
