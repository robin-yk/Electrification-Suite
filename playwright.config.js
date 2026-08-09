import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Some sandboxed dev containers pre-install Chromium outside node_modules and
// skip (or block) Playwright's own browser download. Check the common
// locations for that before falling back to Playwright's normal managed
// browser, which `npx playwright install --with-deps chromium` fetches. If
// neither is present and there's no network to fetch one (see AGENTS.md),
// `npm run test:e2e` will fail to launch - that's expected in that case; run
// `npm test` (no browser needed) instead and skip the e2e suite.
const candidateChromiumPaths = [
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
];
const executablePath = candidateChromiumPaths.find((path) => existsSync(path));

const PORT = 4319;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  fullyParallel: true,
  reporter: "list",
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
