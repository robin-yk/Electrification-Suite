// Automated smoke test: loads each solver page in a real browser and checks
// it solves without console/page errors and reports a real (non-placeholder,
// non-NaN) result. Run with `npm run test:e2e` (needs Playwright browsers;
// see playwright.config.js).
import { test, expect } from "@playwright/test";

const pages = [
  { path: "/apps/joule/", valueSelector: "#tssValue", label: "Joule steady-state temperature" },
  { path: "/apps/rphcjh/", valueSelector: "#valKratio", label: "RPH/CJH ideal k ratio" },
];

for (const { path, valueSelector, label } of pages) {
  test(`${path} loads, solves, and reports no console errors (${label})`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      // ignore the favicon 404; the site has no favicon yet, unrelated to solver correctness
      if (msg.type() === "error" && !msg.location().url.includes("favicon")) errors.push(msg.text());
    });

    await page.goto(path);
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        const text = el && el.textContent.trim();
        return !!text && text !== "—"; // em dash placeholder
      },
      valueSelector,
      { timeout: 15000 }
    );

    const value = await page.locator(valueSelector).first().innerText();
    expect(errors, `console/page errors on ${path}: ${errors.join("; ")}`).toEqual([]);
    expect(value).not.toMatch(/NaN/i);
  });
}
