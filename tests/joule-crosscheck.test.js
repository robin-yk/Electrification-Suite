// The published-reactor cases moved out of index.html into crosscheck.js so
// they could be regenerated headlessly. These tests pin the extraction: the
// numbers the page shows are now numbers CI can see.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCrossChecks, thermalComparison, DEFAULT_ENCLOSURE, sig4 } from "../apps/joule/crosscheck.js";

const byId = (list, id) => list.find((item) => item.id === id);

test("every cross-check case evaluates without solver errors", () => {
  for (const item of evaluateCrossChecks(DEFAULT_ENCLOSURE)) {
    assert.equal(item.error, undefined, `${item.id}: ${item.error}`);
    assert.ok(item.rows.length > 0, `${item.id} produced no rows`);
    for (const row of item.rows) assert.equal(row.length, 3);
  }
});

test("cross-check cases reproduce the published operating points", () => {
  const cases = evaluateCrossChecks(DEFAULT_ENCLOSURE);

  // Wismann: 500 x 6.0 mm FeCrAl tube, 0.117 ohm, ~495 W at 65 A.
  const wismann = byId(cases, "wismann").results.main;
  assert.ok(Math.abs(wismann.g.L * 1000 - 500) < 1, `L = ${wismann.g.L * 1000} mm`);
  assert.ok(Math.abs(wismann.g.D * 1000 - 6.0) < 0.05, `D = ${wismann.g.D * 1000} mm`);
  assert.ok(Math.abs(wismann.resistance - 0.117) / 0.117 < 0.05, `R = ${wismann.resistance}`);

  // Zheng: 30.26 A measured at 13.04 V across the 0.41-0.45 ohm foam.
  const zheng = byId(cases, "zheng").results;
  assert.ok(zheng.v1304.resistance > 0.41 && zheng.v1304.resistance < 0.45, `R = ${zheng.v1304.resistance}`);
  assert.ok(Math.abs(zheng.v1304.operatingCurrent - 30.26) / 30.26 < 0.06, `I = ${zheng.v1304.operatingCurrent}`);

  // Kwak: cold resistance 4.23 ohm from the measured R(T) fit.
  const kwak = byId(cases, "kwak").results.v20;
  assert.ok(Math.abs(kwak.initial.resistance - 4.23) < 0.02, `R25 = ${kwak.initial.resistance}`);
});

test("thermalComparison reports 0D alone when no 2D solve is supplied", () => {
  const cases = evaluateCrossChecks(DEFAULT_ENCLOSURE);
  const c = thermalComparison(byId(cases, "wismann"), null);
  assert.equal(c.twoDAvgC, null);
  assert.equal(c.twoDMaxC, null);
  assert.equal(c.referenceC, 800);
  assert.ok(c.zeroDC > 500 && c.zeroDC < 900, `0D Tss = ${c.zeroDC}`);
});

test("the Kwak case derives its reference from the paper's measured T-P fit", () => {
  const cases = evaluateCrossChecks(DEFAULT_ENCLOSURE);
  const c = thermalComparison(byId(cases, "kwak"), null);
  // 202.24 * P^0.3525 at the ~120 W operating point of the 20 V drive.
  assert.ok(c.referenceC > 900 && c.referenceC < 1300, `reference = ${c.referenceC}`);
});

test("sig4 renders the same strings the page and the CLI report", () => {
  assert.equal(sig4(0), "0");
  assert.equal(sig4(Number.NaN), "—");
  assert.equal(sig4(0.1201234), "0.1201");
  assert.equal(sig4(1234.5678), "1,235");
});
