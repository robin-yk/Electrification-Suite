// The Dynamic tab drives the transient solver from animation frames, so the
// things worth testing in a browser are the ones a unit test cannot see: that
// the panel wires up without errors, that the run finishes and reports real
// numbers, that the chart is actually painted, and that Stop stops.
// Run with `npm run test:e2e`.
import { test, expect } from "@playwright/test";

async function openDynamic(page, errors) {
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.location().url.includes("favicon")) errors.push(msg.text());
  });
  await page.goto("/apps/joule/");
  await page.click('[data-tab="dynamic"]');
  await expect(page.locator("#dynamic")).toBeVisible();
}

test("Dynamic tab runs a continuous transient and reports real numbers", async ({ page }) => {
  const errors = [];
  await openDynamic(page, errors);

  // Short and coarse: this is a wiring test, not a physics test.
  await page.selectOption("#dynDrive", "on");
  await page.fill("#dynDt", "0.5");
  await page.fill("#dynDuration", "5");
  await page.click("#runDynamic");
  await page.waitForFunction(() => !document.getElementById("runDynamic").disabled, null, { timeout: 60000 });

  const avg = await page.locator("#dynAvg").innerText();
  const closure = await page.locator("#dynClosure").innerText();
  const steps = await page.locator("#dynSteps").innerText();
  expect(avg).not.toMatch(/NaN|—/);
  expect(closure).not.toMatch(/NaN|—/);
  expect(steps).toContain("10");   // 5 s at 0.5 s per step

  // The march has to have actually warmed the element, not just returned ambient.
  expect(Number(avg.replace(/[^\d.-]/g, ""))).toBeGreaterThan(25);

  // And the chart has to have been painted, not left blank.
  const painted = await page.evaluate(() => {
    const c = document.getElementById("dynChart");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(2000);
  expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
});

test("Dynamic tab exposes pulse controls only for a pulse train", async ({ page }) => {
  const errors = [];
  await openDynamic(page, errors);

  await page.selectOption("#dynDrive", "on");
  await expect(page.locator("#dynPeriodField")).toBeHidden();
  await page.selectOption("#dynDrive", "pulse");
  await expect(page.locator("#dynPeriodField")).toBeVisible();
  await expect(page.locator("#dynDutyField")).toBeVisible();

  // Selecting a pulse train sizes the period from the element rather than
  // leaving a number that suits some other geometry.
  const suggested = Number(await page.inputValue("#dynPeriod"));
  expect(suggested).toBeGreaterThan(0);
  await expect(page.locator("#dynStepNote")).toContainText("relaxation time");

  // Two warnings, and the regime one has to come first: a period well inside
  // the element's relaxation time is answered by the physics, not by a smaller
  // step, so the tab has to say so rather than only asking for more steps.
  await page.fill("#dynPeriod", "0.2");
  await page.fill("#dynDt", "0.5");
  await expect(page.locator("#dynStepNote")).toContainText("cannot follow a pulse this fast");
  await expect(page.locator("#dynStepNote")).toContainText("Too few steps per cycle");

  // A period several relaxation times long is a pulse train the element can
  // follow, and a fine enough step then resolves its shape.
  await page.fill("#dynPeriod", String(suggested));
  await page.fill("#dynDt", "0.5");
  await expect(page.locator("#dynStepNote")).not.toContainText("cannot follow a pulse this fast");
  await page.fill("#dynDt", "0.005");
  await expect(page.locator("#dynStepNote")).not.toContainText("Too few steps per cycle");
  expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
});

test("Dynamic tab stops a running transient on request", async ({ page }) => {
  const errors = [];
  await openDynamic(page, errors);

  // Long enough that it cannot possibly finish before the click lands.
  await page.selectOption("#dynDrive", "on");
  await page.fill("#dynDt", "0.05");
  await page.fill("#dynDuration", "400");
  await page.click("#runDynamic");
  await expect(page.locator("#cancelDynamic")).toBeEnabled();
  await page.waitForTimeout(1200);
  await page.click("#cancelDynamic");
  await page.waitForFunction(() => !document.getElementById("runDynamic").disabled, null, { timeout: 60000 });

  await expect(page.locator("#dynProgress")).toContainText("Stopped at");
  // A stopped run still reports what it did rather than nothing.
  expect(await page.locator("#dynAvg").innerText()).not.toMatch(/NaN|—/);
  expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
});
