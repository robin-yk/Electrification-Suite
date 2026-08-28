// Run the repository's verification studies and freeze the result, so the
// verification figure is drawn from a measurement rather than transcribed.
//
//   node docs/figures/make-verification-data.mjs [--levels 4]
//
// Four levels runs the 240 x 480 grid and takes tens of minutes; three levels
// stops at 120 x 240 and takes about two minutes. The output records which
// was used, and the commit the solver was at, so a figure can never quote a
// number that no longer reproduces.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { radialParabola, annulusDrops, mmsStudy, physicalConvergence } from "../../tools/verification/joule.mjs";
import { axialSigma } from "../../tools/verification/electrical.mjs";
import { stepRefinement } from "../../tools/verification/joule-transient.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argLevels = process.argv.indexOf("--levels");
const levels = argLevels > -1 ? Number(process.argv[argLevels + 1]) : 3;

function solverCommit() {
  try {
    return execFileSync("git", ["log", "-1", "--format=%h", "--", "apps/joule/solver.js", "tools/verification/joule.mjs"],
      { cwd: join(here, "..", ".."), encoding: "utf8" }).trim() || "unknown";
  } catch { return "unknown"; }
}

const t0 = process.hrtime.bigint();
const parabola = [20, 40, 80].map((ld) => {
  const r = radialParabola(ld);
  return { ld, worstRelative: r.worstRelative, centerToSurfaceK: r.centerToSurfaceK };
});
const annulus = [20, 50, 100].map((ld) => ({
  ld, worst: Math.max(...annulusDrops(ld).map((c) => c.relative))
}));
const mms = mmsStudy(3);
const physical = physicalConvergence(levels);
const electrical = axialSigma(3);   // the potential solve, series conductors along z
const transient = stepRefinement(60);

const out = {
  solverCommit: solverCommit(),
  levels,
  seconds: Number(process.hrtime.bigint() - t0) / 1e9,
  parabola,
  annulus,
  mms,
  electrical,
  transient,
  physical: {
    rows: physical.rows,
    order: { avg: physical.rich.avg.p, max: physical.rich.max.p },
    extrapolated: { avg: physical.rich.avg.qExtrap, max: physical.rich.max.qExtrap },
    coarseVsFinest: {
      grid: physical.rows[physical.rows.length - 1].grid,
      avgK: physical.rows[0].avgC - physical.rows[physical.rows.length - 1].avgC,
      maxK: physical.rows[0].maxC - physical.rows[physical.rows.length - 1].maxC
    }
  }
};
writeFileSync(join(here, "verification-data.json"), JSON.stringify(out, null, 1) + "\n");
console.log("levels", levels, "| solver", out.solverCommit, "|", out.seconds.toFixed(0), "s");
console.log("parabola", parabola.map((p) => p.ld + ":" + p.worstRelative.toExponential(2)).join("  "));
console.log("annulus ", annulus.map((a) => a.ld + ":" + (100 * a.worst).toFixed(2) + "%").join("  "));
console.log("mms L2  ", mms.map((r) => r.l2.toExponential(3)).join("  "), "| orders",
  mms.slice(1).map((r) => r.orderL2.toFixed(2)).join(", "), "/ Linf", mms.slice(1).map((r) => r.orderLinf.toFixed(2)).join(", "));
console.log("physical", physical.rows.map((r) => r.grid + ":" + r.avgC.toFixed(2)).join("  "),
  "| order", out.physical.order.avg.toFixed(2), "| extrap", out.physical.extrapolated.avg.toFixed(2));
console.log("electric", electrical.map((r) => r.grid + ":" + r.error.toExponential(2)).join("  "), "| orders",
  electrical.slice(1).map((r) => r.order.toFixed(2)).join(", "));
console.log("transient", transient.rows.map((r) => "dt" + r.dt.toFixed(2) + ":" + r.error.toPrecision(3)).join("  "), "| orders",
  transient.rows.filter((r) => r.order !== null).map((r) => r.order.toFixed(3)).join(", "));
