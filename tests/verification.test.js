// Fast numerical-verification guards. The full study (finer grids, Richardson
// extrapolation, the physical-case sweeps) lives in tools/verification/ and is
// documented in docs/VERIFICATION.md; these tests keep its headline results
// true as the solvers evolve, using only the cheap grid levels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { radialParabola as jouleParabola, annulusDrops, mmsStudy } from "../tools/verification/joule.mjs";
import { radialParabola as microwaveParabola } from "../tools/verification/microwave.mjs";

test("joule 2D: mid-plane radial profile matches the exact parabola, converging with L/D", () => {
  const near = jouleParabola(40), far = jouleParabola(80);
  assert.ok(near.worstRelative < 2e-3, `L/D=40 mismatch ${near.worstRelative}`);
  assert.ok(far.worstRelative < near.worstRelative / 4, `axial-leakage residual did not collapse: ${near.worstRelative} -> ${far.worstRelative}`);
});

test("joule 2D: multi-layer annulus drops approach ln-resistance theory as L/D grows", () => {
  const worst = (cases) => Math.max(...cases.map((c) => c.relative));
  const near = worst(annulusDrops(50)), far = worst(annulusDrops(100));
  assert.ok(near < 0.08, `L/D=50 worst layer error ${near}`);
  assert.ok(far < 0.03, `L/D=100 worst layer error ${far}`);
});

test("joule 2D: manufactured solution converges at second order", () => {
  const rows = mmsStudy(2); // 30×60 and 60×120 only, to keep CI fast
  assert.ok(rows[1].orderL2 > 1.7, `observed L2 order ${rows[1].orderL2}`);
  assert.ok(rows[1].orderLinf > 1.6, `observed Linf order ${rows[1].orderLinf}`);
  assert.ok(rows[1].l2 < rows[0].l2, "L2 error must shrink under refinement");
});

test("microwave 2D: pure-conduction reduction matches the exact parabola, converging with H/D", () => {
  const near = microwaveParabola(8), far = microwaveParabola(16);
  assert.ok(near.worstRelative < 0.05, `H/D=8 mismatch ${near.worstRelative}`);
  assert.ok(far.worstRelative < 0.01, `H/D=16 mismatch ${far.worstRelative}`);
});
