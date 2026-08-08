import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Sandboxed dev containers in this project pre-install Chromium outside
// node_modules (see CLAUDE.md / environment notes) and skip Playwright's own
// browser download. When that path exists, point launches at it directly;
// otherwise (e.g. CI) fall back to Playwright's normal managed browser,
// which `playwright install --with-deps chromium` fetches beforehand.
const localChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(localChromium) ? localChromium : undefined;

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
