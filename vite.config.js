import { defineConfig } from "vite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// apps/*/index.html are loaded at runtime via iframe.src rather than referenced
// in index.html markup, so Vite's default crawler won't bundle them.
// Yeonsu-Kwak-CV.pdf is a plain <a href> download link, which Vite's HTML plugin
// doesn't treat as an asset reference either. Each apps/*/solver.js is only
// reached through its page's own <script type="module" src>, and since that
// page is copied raw (never parsed as an HTML entry), Vite never sees that
// reference either — it needs the same explicit copy.
const projectPages = [
  "apps/microwave/index.html", "apps/microwave/solver.js", "apps/microwave/citation.ris",
  "apps/joule/index.html", "apps/joule/solver.js", "apps/joule/citation.ris",
  "apps/rphcjh/index.html", "apps/rphcjh/solver.js", "apps/rphcjh/citation.ris",
  "Yeonsu-Kwak-CV.pdf",
];

export default defineConfig({
  plugins: [
    {
      name: "copy-project-pages",
      writeBundle(options) {
        const outDir = options.dir || resolve(__dirname, "dist");
        for (const page of projectPages) {
          const src = resolve(__dirname, page);
          if (!existsSync(src)) throw new Error(`projectPages lists "${page}" but the file doesn't exist at ${src}`);
          const dest = resolve(outDir, page);
          mkdirSync(dirname(dest), { recursive: true });
          copyFileSync(src, dest);
        }
      },
    },
  ],
});
