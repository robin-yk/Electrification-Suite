// The shape selector spans three tabs: a box is solved with its real
// dimensions in 0D, and the axisymmetric tabs mesh an equivalent cylinder.
// What matters in a browser is that the fields swap, that the substitution is
// actually shown rather than applied silently, and that the 2D tab still
// solves. Run with `npm run test:e2e`.
import { test, expect } from "@playwright/test";

async function open(page, errors) {
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.location().url.includes("favicon")) errors.push(msg.text());
  });
  await page.goto("/apps/joule/");
  await expect(page.locator("#shape")).toBeVisible();
}

test("shape selector swaps the geometry fields and the badge", async ({ page }) => {
  const errors = [];
  await open(page, errors);

  await expect(page.locator("#nominalVolume")).toBeVisible();
  await expect(page.locator("#boxLength")).toBeHidden();
  await expect(page.locator("#shapeBadge")).toHaveText("Cylinder");

  await page.selectOption("#shape", "box");
  await expect(page.locator("#boxLength")).toBeVisible();
  await expect(page.locator("#boxWidth")).toBeVisible();
  await expect(page.locator("#boxHeight")).toBeVisible();
  await expect(page.locator("#nominalVolume")).toBeHidden();
  await expect(page.locator("#aspectRatio")).toBeHidden();
  await expect(page.locator("#shapeBadge")).toHaveText("Rectangular");

  // and back, without losing the cylinder inputs
  await page.selectOption("#shape", "cylinder");
  await expect(page.locator("#nominalVolume")).toBeVisible();
  await expect(page.locator("#nominalVolume")).toHaveValue("1.18");
  expect(errors, errors.join("; ")).toEqual([]);
});

test("a box states what the equivalent cylinder preserves, and what it does not", async ({ page }) => {
  const errors = [];
  await open(page, errors);

  await page.selectOption("#shape", "box");
  await page.fill("#boxLength", "38");
  await page.fill("#boxWidth", "8");
  await page.fill("#boxHeight", "0.21");

  await page.click('[data-tab="thermal2d"]');
  const note = page.locator("#t2dEquivNote");
  await expect(note).toBeVisible();
  // The three held invariants and the one that is not have to be named; a
  // silent substitution is the failure mode this whole feature exists to fix.
  await expect(note).toContainText("equivalent cylinder");
  await expect(note).toContainText("Preserved");
  await expect(note).toContainText("Not preserved");
  await expect(note).toContainText("volume");
  // 38 x 8 x 0.21 mm has a 6.273 cm2 surface, so the equivalent is 4.93 mm.
  await expect(note).toContainText("4.93");

  // A cylinder needs no substitution, so the note must disappear entirely.
  // The selector lives on the Single Design panel, so go back there first.
  await page.click('[data-tab="calculator"]');
  await page.selectOption("#shape", "cylinder");
  await page.click('[data-tab="thermal2d"]');
  await expect(note).toBeHidden();
  expect(errors, errors.join("; ")).toEqual([]);
});

test("the 2D tab still solves for a box", async ({ page }) => {
  const errors = [];
  await open(page, errors);

  await page.selectOption("#shape", "box");
  await page.fill("#boxLength", "38");
  await page.fill("#boxWidth", "8");
  await page.fill("#boxHeight", "0.21");
  await page.click('[data-tab="thermal2d"]');
  await page.click("#solve2D");
  await page.waitForFunction(() => !document.getElementById("solve2D").disabled, null, { timeout: 60000 });

  const avg = await page.locator("#t2dAvg").innerText();
  expect(avg).not.toMatch(/NaN|—/);
  await expect(page.locator("#t2dConverged")).not.toHaveText("No solution");
  expect(errors, errors.join("; ")).toEqual([]);
});
