import { defineConfig } from "vite";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

// microwave.html / joule.html are loaded at runtime via iframe.src rather than
// referenced in index.html markup, so Vite's default crawler won't bundle them.
// Yeonsu-Kwak-CV.pdf is a plain <a href> download link, which Vite's HTML plugin
// doesn't treat as an asset reference either.
const projectPages = ["microwave.html", "joule.html", "rphcjh.html", "Yeonsu-Kwak-CV.pdf"];

export default defineConfig({
  plugins: [
    {
      name: "copy-project-pages",
      writeBundle(options) {
        const outDir = options.dir || resolve(__dirname, "dist");
        for (const page of projectPages) {
          copyFileSync(resolve(__dirname, page), resolve(outDir, page));
        }
      },
    },
  ],
});
