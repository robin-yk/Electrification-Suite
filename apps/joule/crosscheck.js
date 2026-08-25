// Published electrified reactors reproduced by this engine.
//
// These three cases used to live inline inside renderCrossCheck() in
// index.html, which meant the only way to obtain the numbers was to open the
// page in a browser and read them off the screen. Nothing headless could
// regenerate them, so they could not be checked in CI and could not be
// reproduced for a write-up. The case definitions live here now, and both the
// page and tools/verification/crosscheck.mjs build their tables from them.
//
// Only the 0D engine (calculate) runs here: it is fast enough to evaluate live
// while the reader is on the Calculations tab. The 2D field solve takes seconds
// per case, so its results are precomputed into data/crosscheck-2d.json by the
// CLI and shipped, in the same spirit as tools/cantera -> apps/rphcjh/data.

import { MATERIALS, kelvin, celsius, calculate, operatingAt } from "./solver.js";

export function sig4(x) {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  const ax = Math.abs(x);
  if (ax >= 1e5 || ax < 1e-3) return x.toExponential(3);
  return Number(x.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 8 });
}

// The enclosure the page ships as its field defaults. Headless runs use this so
// their numbers match what a reader sees on an untouched page.
export const DEFAULT_ENCLOSURE = {
  wallMaterial: "quartz", wallK: 1.4, wallThickness: 0.001, wallEmissivity: 0.93,
  gap: 0.0005, gapK: 0.03, endMode: "ambient", endK: kelvin(20), endH: 250,
  contactRho: 0, maxIter: 160, tolerance: 1e-4,
};

// k = 40 is a bed-scale value for the phi = 0.88 foam, not the SiSiC skeleton
// (~130 W/m-K dense), which is why kIsSkeleton is absent: solver.elementK() must
// not re-homogenize a number that already carries the porosity. Swapping in a
// skeleton value here means setting kIsSkeleton: true at the same time.
const FOAM = { name: "SiSiC foam (effective)", rhoOhmCm: 0.0419, density: 3050, cp: 680, k: 40, jmax: 1e7, emissivity: 0.9 };

const CFP_D = 4.93e-3, CFP_L = 0.038, CFP_A = Math.PI / 4 * CFP_D * CFP_D;
const cfpRho = (T) => (4.25 - 7.24e-4 * T) * CFP_A * 100 / CFP_L;
const CFP = {
  name: "CFP H23 (effective)", rhoOhmCm: cfpRho(25), density: 39.7, cp: 900, k: 5, jmax: 1e9, emissivity: 0.57,
  rhoTable: [[25, cfpRho(25)], [500, cfpRho(500)], [1000, cfpRho(1000)], [1500, cfpRho(1500)], [1800, cfpRho(1800)]],
};
// The CFP strip sits in the paper's own 17 mm quartz tube, so this case carries
// its own enclosure rather than the page's.
const CFP_ENCLOSURE = {
  wallMaterial: "quartz", wallK: 1.4, wallThickness: 0.001, wallEmissivity: 0.93,
  gap: (17e-3 - CFP_D) / 2, gapK: 0.15, endMode: "ambient", endK: kelvin(20), endH: 200,
  contactRho: 0, maxIter: 160, tolerance: 1e-4,
};
// The paper's measured fit, T[°C] = 202.24 * P^0.3525 (SI Fig. S11b, R² = 0.997).
const cfpFitC = (P) => 202.24 * Math.pow(P, 0.3525);

// Each case exposes:
//   inputs(enclosure)  -> named 0D solver inputs, so a caller can also feed any
//                         of them to solveThermal2D
//   rows(results)      -> [label, tool value, reference] triples for the tables
//   thermal            -> which input carries the temperature comparison, plus
//                         the measured value to put beside 0D and 2D
export function crossCheckCases(enclosure = DEFAULT_ENCLOSURE) {
  const wismannMaterial = MATERIALS.find((m) => /Kanthal|FeCrAl/i.test(m.name));

  return [
    {
      id: "wismann",
      inputs: () => ({
        main: {
          // solidFraction here is the area fraction of the 0.35 mm annulus in the
          // 6 mm envelope, not a porosity: the wall is continuous dense metal, so
          // the table conductivity applies as-is and no porous closure belongs on
          // this case. The field is named for the foam usage it shares with Zheng.
          material: wismannMaterial, solidFraction: 0.2198, porosity: 0.7802,
          volumeCm3: 14.137 * 0.2198, aspectRatio: 83.3,
          imax: 65, vmax: 100, pmax: 2000, supplyMode: "auto", iset: 65, vset: 100,
          ambientK: kelvin(20), targetK: kelvin(800),
          emissivity: wismannMaterial?.emissivity ?? 0.8, convection: false, h: 0,
          gasK: kelvin(20), biLimit: 0.01, enclosure,
        },
      }),
      rows: ({ main: r }) => [
        ["Element geometry L × D", `${sig4(r.g.L * 1000)} × ${sig4(r.g.D * 1000)} mm`, "500 × 6.0 mm tube (paper Fig. 2)"],
        ["Element resistance", `${sig4(r.resistance)} Ω`, "ρL/A = 0.117 Ω for the 0.35 mm annulus"],
        ["Electrical power at 65 A", `${sig4(r.power)} W`, "I²R ≈ 495 W"],
        ["Steady-state temperature", `${sig4(celsius(r.tss))} °C`, "800 °C maximum measured"],
        ["Biot number", sig4(r.bi), "no measurable wall temperature gradient"],
      ],
      thermal: { input: "main", referenceC: 800, referenceLabel: "800 °C maximum measured" },
    },

    {
      id: "zheng",
      inputs: () => {
        const base = {
          material: FOAM, solidFraction: 0.12, porosity: 0.88,
          volumeCm3: 79.6 * 0.12, aspectRatio: 9.9 / 3.2,
          imax: 50, vmax: 30, pmax: 2000, supplyMode: "cv", iset: 50, vset: 13.04,
          ambientK: kelvin(20), targetK: kelvin(750),
          emissivity: 0.9, convection: false, h: 0,
          gasK: kelvin(20), biLimit: 0.01, enclosure,
        };
        return { v1304: base, v1410: { ...base, vset: 14.10 } };
      },
      rows: ({ v1304: z1, v1410: z2 }) => [
        ["Foam geometry L × D", `${sig4(z1.g.L * 1000)} × ${sig4(z1.g.D * 1000)} mm`, "99 × 32 mm foam (paper §3.1)"],
        ["Foam resistance", `${sig4(z1.resistance)} Ω`, "0.41–0.45 Ω measured"],
        ["Current at 13.04 V", `${sig4(z1.operatingCurrent)} A`, "30.26 A measured"],
        ["Current at 14.10 V", `${sig4(z2.operatingCurrent)} A`, "34.70 A measured"],
        ["Power at 14.10 V", `${sig4(z2.power)} W`, "489.3 W measured"],
      ],
      // The paper's electrical operating points are tabulated; a matching
      // element temperature is not, so this case has no experimental
      // temperature to sit beside 0D and 2D.
      thermal: { input: "v1410", referenceC: null, referenceLabel: "not tabulated in the paper" },
    },

    {
      id: "kwak",
      inputs: () => {
        const base = {
          material: CFP, solidFraction: 1, porosity: 0,
          volumeCm3: 0.7254, aspectRatio: CFP_L / CFP_D,
          imax: 20, vmax: 75, pmax: 1500, supplyMode: "cv", iset: 20, vset: 20,
          ambientK: kelvin(20), targetK: kelvin(1200),
          emissivity: 0.57, convection: false, h: 0, gasK: kelvin(20), biLimit: 0.01,
          enclosure: CFP_ENCLOSURE,
        };
        return { v16: { ...base, vset: 16 }, v20: base, v31: { ...base, vset: 31 } };
      },
      rows: ({ v16: c1, v20: c2, v31: c3 }) => {
        const power = (r, x) => operatingAt(r.tss, x, r.g).power;
        const p1 = power(c1, c1.input), p2 = power(c2, c2.input), p3 = power(c3, c3.input);
        const t1 = celsius(c1.tss), t2 = celsius(c2.tss), t3 = celsius(c3.tss);
        const exponent = Math.log(t3 / t1) / Math.log(p3 / p1);
        return [
          ["Strip as equivalent cylinder", `Ø${sig4(CFP_D * 1000)} × ${sig4(CFP_L * 1000)} mm`, "38 × 8 × 0.21 mm strip, same radiating area"],
          ["Cold resistance R(25 °C)", `${sig4(c2.initial.resistance)} Ω`, "4.23 Ω from the measured R(T) fit"],
          ["T–P scaling exponent", exponent.toFixed(3), "0.3525 measured, R² = 0.997 (Fig. S11b)"],
          [`Steady T at 20 V (${sig4(p2)} W)`, `${sig4(t2)} °C`,
            `${sig4(cfpFitC(p2))} °C from the paper fit; clamp conduction and IR averaging explain the offset`],
        ];
      },
      thermal: {
        input: "v20",
        referenceFrom: (r, x) => cfpFitC(operatingAt(r.tss, x, r.g).power),
        referenceLabel: "measured T–P fit, 202.24·P^0.3525",
      },
    },
  ];
}

// Evaluate every case's 0D inputs. Returns [{ id, inputs, results, rows, thermal }].
// `results[key].input` is attached so row builders that need the input back
// (the CFP power evaluation) do not have to be handed it separately.
export function evaluateCrossChecks(enclosure = DEFAULT_ENCLOSURE) {
  return crossCheckCases(enclosure).map((testCase) => {
    const inputs = testCase.inputs();
    const results = {};
    for (const [key, x] of Object.entries(inputs)) {
      const r = calculate(x);
      if (r.errors.length) return { id: testCase.id, error: r.errors.join("; ") };
      results[key] = Object.assign(r, { input: x });
    }
    return { id: testCase.id, inputs, results, rows: testCase.rows(results), thermal: testCase.thermal };
  });
}

// The 0D / 2D / experiment comparison for one case, given the 2D solve for its
// designated thermal point. Returns null when the case failed to evaluate.
export function thermalComparison(evaluated, twoD) {
  if (!evaluated || evaluated.error) return null;
  const { thermal, results, inputs } = evaluated;
  const r = results[thermal.input], x = inputs[thermal.input];
  const referenceC = thermal.referenceFrom ? thermal.referenceFrom(r, x) : thermal.referenceC;
  return {
    id: evaluated.id,
    zeroDC: celsius(r.tss),
    twoDAvgC: twoD ? celsius(twoD.avgK) : null,
    twoDMaxC: twoD ? celsius(twoD.tMax) : null,
    referenceC,
    referenceLabel: thermal.referenceLabel,
  };
}
