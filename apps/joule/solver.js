// Joule heating numeric core: material properties, 0D lumped model, and the
// 2D axisymmetric FVM thermal solver behind joule.html. Pure functions of
// plain input objects, with no DOM access, so this module can be imported
// directly by joule.html (as an ES module) or by a Node test runner.
"use strict";

export const SIGMA_SB = 5.670374419e-8;
export const HE_FLOW_SCCM = 50;
export const HE_CP_MOLAR = 20.786;
export const MOLAR_VOLUME_STP = 0.022414;
export const HE_CAPACITY_RATE = HE_FLOW_SCCM * 1e-6 / 60 / MOLAR_VOLUME_STP * HE_CP_MOLAR;
export const OUTSIDE_AIR_K = 0.026;

// density and cp are unused by the steady solve and exist only for the
// transient one, where the wall's thermal mass is comparable to the
// element's and therefore sets much of the warm-up time.
export const T2D_WALLS = {
  quartz: { name:"Quartz", k:1.4, emissivity:0.93, density:2200, cp:740 },
  alumina: { name:"Alumina", k:22, emissivity:0.75, density:3900, cp:880 },
  stainless: { name:"Stainless steel", k:16, emissivity:0.70, density:8000, cp:500 },
  custom: { name:"Custom wall", k:1.4, emissivity:0.80, density:2200, cp:740 }
};

// Volumetric heat capacity of the gas regions, J/m^3/K. Two orders of
// magnitude below any solid here (He at 1 atm is ~1e3 against SiC's 2.4e6),
// so these carry no weight in the answer; they are present so that every
// cell has a finite time constant and the transient operator stays
// nonsingular. Evaluated at the cell temperature through the ideal-gas
// density, which is the only part that matters at all.
export const GAS_RHOCP_REF = 1.0e3;    // He, ~300 K
export const AIR_RHOCP_REF = 1.2e3;    // air, ~300 K
export const RHOCP_REF_K = 300;

export const MATERIALS = [
  { name:"CFP", rhoOhmCm:0.05, density:452, cp:990, k:400, jmax:1e7, source:"Mittal et al. (2025), Table 1", model:"constant; anisotropy not represented",
    meltC:3600, meltKind:"sublimation", meltNote:"carbon sublimes rather than melting at 1 atm; CRC Handbook graphite value" },
  { name:"SiC", rhoOhmCm:0.0555556, density:3210, cp:750, k:120, jmax:5e6, source:"Mittal et al. (2025), Table 1", model:"constant grade proxy",
    meltC:2700, meltKind:"decomposition", meltNote:"SiC decomposes rather than melting at 1 atm; commonly cited onset" },
  { name:"SiSiC (Si-infiltrated SiC)", rhoOhmCm:0.08, density:3050, cp:680, k:140, jmax:5e6, emissivity:0.9,
    rhoTable:[[20,0.08],[300,0.028],[550,0.0179],[650,0.0174],[750,0.0165],[1000,0.0155],[1350,0.015]],
    kTable:[[20,140],[600,60],[1000,45],[1350,40]],
    source:"550-750 °C bulk ρ back-calculated from Zheng et al., AIChE J. 69, e17620 (2022), Table 2; RT branch is a commercial SiC-element proxy",
    model:"ρ(T) table; RT resistivity varies widely between SiSiC grades, so prefer a datasheet; free Si melts at 1414 °C",
    meltC:1414, meltKind:"melting", meltNote:"free-Si matrix constituent melts here, well below the SiC skeleton" },
  { name:"MoSi₂", rhoOhmCm:2.5e-5, density:6500, cp:420, k:30, jmax:3e6, emissivity:0.78, rhoTable:[[20,2.5e-5],[200,7e-5],[600,1.5e-4],[1000,2.3e-4],[1400,3.0e-4],[1800,3.5e-4]], kTable:[[20,30],[600,30],[1200,15],[1800,15]], source:"Kanthal Super handbook", model:"digitized handbook curve",
    meltC:2030, meltKind:"melting", meltNote:"MoSi₂ melting point" },
  { name:"Kanthal A-1 (FeCrAl)", rhoOhmCm:1.45e-4, density:7100, cp:460, k:11, jmax:1e7, emissivity:0.70, rhoFactor:[[20,1],[500,1.01],[800,1.03],[1000,1.04],[1400,1.05]], source:"Kanthal resistance materials handbook", model:"manufacturer Ct interpolation",
    meltC:1500, meltKind:"melting", meltNote:"FeCrAl solidus, Kanthal handbook" },
  { name:"Nikrothal 80 (NiCr)", rhoOhmCm:1.09e-4, density:8300, cp:450, k:15, jmax:1e7, emissivity:0.88, rhoFactor:[[20,1],[400,1.03],[800,1.05],[1200,1.07]], source:"Kanthal resistance materials handbook", model:"manufacturer Ct interpolation",
    meltC:1400, meltKind:"melting", meltNote:"NiCr 80/20 melting range, Kanthal handbook" },
  { name:"Inconel 601", rhoOhmCm:1.18e-4, density:8110, cp:448, k:11.2, jmax:1e7, rhoTable:[[20,1.18e-4],[100,1.192e-4],[200,1.207e-4],[300,1.220e-4],[400,1.229e-4],[500,1.239e-4],[600,1.247e-4],[700,1.249e-4],[800,1.249e-4],[900,1.259e-4],[1000,1.262e-4]], cpTable:[[20,448],[100,469],[200,498],[300,523],[400,548],[500,578],[600,603],[700,632],[800,657],[900,686],[1000,712]], kTable:[[20,11.2],[100,12.7],[200,14.3],[300,16.0],[400,17.7],[500,19.5],[600,21.0],[700,22.8],[800,24.4],[900,26.1],[1000,27.8]], source:"Special Metals Inconel 601 bulletin, Table 3", model:"manufacturer table interpolation",
    meltC:1350, meltKind:"melting", meltNote:"Inconel 601 melting range, Special Metals bulletin" },
  { name:"304 stainless steel", rhoOhmCm:7.2e-5, density:8000, cp:500, k:16.2, jmax:5e6, rhoAlpha:0.00094, source:"Mittal Table 1; standardized RT correction", model:"linear ρ(T); Cp,k constant",
    meltC:1400, meltKind:"melting", meltNote:"304 stainless solidus, ASM Metals Handbook" },
  { name:"Molybdenum", rhoOhmCm:5.34e-6, density:10220, cp:251, k:138, jmax:3e5, rhoAlpha:0.0046, source:"NIST resistivity compilation; Mittal Table 1", model:"linear ρ(T); Cp,k constant",
    meltC:2623, meltKind:"melting", meltNote:"molybdenum melting point" },
  { name:"Tungsten", rhoOhmCm:5.60e-6, density:19300, cp:134, k:164, jmax:3e7, rhoAlpha:0.0045, source:"NIST resistivity compilation; Mittal Table 1", model:"linear ρ(T); Cp,k constant",
    meltC:3422, meltKind:"melting", meltNote:"tungsten melting point" },
  { name:"Copper", rhoOhmCm:1.68e-6, density:8960, cp:385, k:400, jmax:1e7, rhoAlpha:0.00393, source:"NIST recommended data", model:"linear ρ(T); Cp,k constant",
    meltC:1085, meltKind:"melting", meltNote:"copper melting point" },
  { name:"Aluminum", rhoOhmCm:2.65e-6, density:2700, cp:897, k:237, jmax:5e9, rhoAlpha:0.00429, source:"NIST recommended data", model:"linear ρ(T); Cp,k constant",
    meltC:660, meltKind:"melting", meltNote:"aluminum melting point" },
  { name:"Titanium", rhoOhmCm:4.2e-5, density:4500, cp:523, k:17, jmax:4.5e6, rhoAlpha:0.0038, source:"Mittal Table 1; RT correction", model:"linear ρ(T); Cp,k constant",
    meltC:1668, meltKind:"melting", meltNote:"titanium melting point" }
];

export const kelvin = (c) => c + 273.15;
export const celsius = (k) => k - 273.15;
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const finite = (x) => Number.isFinite(x);

export function interpolate(table, tempC) {
  if (!table || !table.length) return NaN;
  if (tempC <= table[0][0]) return table[0][1];
  if (tempC >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    if (tempC <= table[i][0]) {
      const [t0,v0] = table[i-1], [t1,v1] = table[i];
      return v0 + (v1-v0) * (tempC-t0) / (t1-t0);
    }
  }
  return table[table.length - 1][1];
}

export function propertiesAt(material, tempK) {
  const tempC = celsius(tempK);
  let rhoOhmCm = material.rhoOhmCm;
  if (material.rhoTable) rhoOhmCm = interpolate(material.rhoTable, tempC);
  else if (material.rhoFactor) rhoOhmCm *= interpolate(material.rhoFactor, tempC);
  else if (material.rhoAlpha) rhoOhmCm *= Math.max(0.05, 1 + material.rhoAlpha * (tempC - 20));
  return {
    rhoOhmCm,
    cp: material.cpTable ? interpolate(material.cpTable, tempC) : material.cp,
    k: material.kTable ? interpolate(material.kTable, tempC) : material.k
  };
}

// Maxwell-Eucken effective conductivity for a continuous solid skeleton holding
// dispersed gas-filled pores. Exact at both limits (phi = 0 returns the solid,
// phi = 1 returns the gas), and the same closure the microwave solver uses for
// its packed bed, so the two apps homogenize by one method rather than two.
export function maxwellEucken(kSolid, kGas, voidFraction) {
  const phi = clamp(voidFraction, 0, 1);
  return kSolid * (2*kSolid + kGas - 2*phi*(kSolid - kGas)) / (2*kSolid + kGas + phi*(kSolid - kGas));
}

// Conductivity of the element treated as a continuum.
//
// Homogenizing here is OPT-IN, gated on material.kIsSkeleton, and that gate is
// the whole point. The geometry already dilutes the electrical path by the solid
// fraction (geometry(): area = grossArea * solidFraction) and the 2D source by
// the envelope volume, so it looks as though the conductivity is the one term
// left un-diluted. Applying a porous closure to solidFraction unconditionally is
// wrong twice over on the cases this repo actually ships:
//
//   * solidFraction is overloaded. For the Wismann tube it is the area fraction
//     of a 0.35 mm annulus in a 6 mm envelope, not a porosity -- the metal there
//     is a continuous dense wall and the table value is already correct. Feeding
//     0.2198 to a dispersed-pore model moved that case's 2D peak from 818 to
//     852 C against an 800 C measurement, away from the experiment.
//   * the shipped porous entries already carry homogenized values. "SiSiC foam
//     (effective)" at k = 40 against ~130 for dense SiSiC, and "CFP H23
//     (effective)" at k = 5, are bed-scale numbers. Re-mixing them double counts
//     the porosity.
//
// So this path activates only for a material that declares its k to be a
// skeleton (dense-phase) value AND an input whose solidFraction is a genuine
// porosity. No shipped material sets the flag; it exists so that adding one is a
// deliberate act with a stated basis, the way the microwave solver back-solves a
// skeleton value from a reference measurement before re-mixing.
//
// The pore gas is the process gas, so it shares cfg.gapK with the gap and purge
// regions instead of introducing a second gas model.
export function elementK(material, tempK, x, cfg) {
  const kSolid = Math.max(1e-6, propertiesAt(material, tempK).k);
  if (!material || !material.kIsSkeleton) return kSolid;
  const solidFraction = finite(x && x.solidFraction) ? clamp(x.solidFraction, 1e-6, 1) : 1;
  if (solidFraction >= 1) return kSolid;
  const kGas = Math.max(1e-9, finite(cfg && cfg.gapK) ? cfg.gapK : OUTSIDE_AIR_K);
  return Math.max(1e-6, maxwellEucken(kSolid, kGas, 1 - solidFraction));
}

// Radial variation of the solid fraction about its own mean.
//
// elementK() above explains why this repo refuses to reinterpret solidFraction
// as a porosity by default: the parameter is overloaded, and feeding it to a
// dispersed-pore closure moved the Wismann tube's 2D peak from 818 to 852 C
// against an 800 C measurement. That objection is about the *mean*. It says
// nothing about how the solid is distributed within the envelope, which is a
// separate question and the one a current-density model needs answered: a
// packed or foamed element is denser in some places than others, and current
// crowds into the dense paths.
//
// So this knob is deliberately built to leave the mean alone. The shape
//
//   s(r) = 1 + c (2 (r/R)^2 - 1)
//
// integrates to exactly 1 over a cylinder, and it is divided by its own
// discrete volume average as well, so the volume-averaged solid fraction is
// identical to x.solidFraction on every mesh and the total solid volume, the
// zero-D resistance and the injected power are all untouched. Only the
// distribution changes. c > 0 puts the solid in the skin, c < 0 in the core.
//
// Because the profile is normalized about the mean, the ratio phi(r)/phi_mean
// does not contain x.solidFraction at all: the contrast is an independent
// input, not a reinterpretation of an overloaded one. It defaults to zero,
// where every multiplier below is exactly 1 and the solver reproduces its
// present behaviour bit for bit.
//
// Setting c != 0 is itself the assertion that the element is a genuine porous
// body, so the same factor is applied to the thermal conductivity as to the
// electrical conductivity; letting current redistribute while heat could not
// would be the inconsistent choice. The exponent is Bruggeman's 3/2 for a
// percolating solid phase, overridable through cfg.porosityExponent.
export function porosityFactor2D(mesh, cfg) {
  const count=mesh.nr*mesh.nz,fraction=new Float64Array(count).fill(1),multiplier=new Float64Array(count).fill(1);
  const contrast=finite(cfg&&cfg.porosityContrast)?clamp(cfg.porosityContrast,-0.95,0.95):0;
  const exponent=finite(cfg&&cfg.porosityExponent)?Math.max(0,cfg.porosityExponent):1.5;
  if(contrast===0) return {fraction,multiplier,contrast,exponent,min:1,max:1};
  const shape=(r)=>1+contrast*(2*(r/Math.max(mesh.radius,1e-30))**2-1);
  let weighted=0,volume=0;
  for(let j=mesh.activeStart;j<mesh.activeEnd;j++) for(let i=0;i<mesh.nElement;i++) {
    const v=mesh.cellVolume(i,j);weighted+=shape(mesh.centers[i])*v;volume+=v;
  }
  const mean=weighted/Math.max(volume,1e-30);
  let min=Infinity,max=-Infinity;
  for(let j=mesh.activeStart;j<mesh.activeEnd;j++) for(let i=0;i<mesh.nElement;i++) {
    const p=j*mesh.nr+i,ratio=Math.max(1e-6,shape(mesh.centers[i])/mean);
    fraction[p]=ratio;multiplier[p]=Math.pow(ratio,exponent);
    min=Math.min(min,ratio);max=Math.max(max,ratio);
  }
  return {fraction,multiplier,contrast,exponent,min,max};
}

export function validate2DConfig(cfg) {
  const errors = [];
  [["Wall conductivity",cfg.wallK],["Wall thickness",cfg.wallThickness],["Gap conductivity",cfg.gapK],["Maximum iterations",cfg.maxIter],["Temperature tolerance",cfg.tolerance]].forEach(([label,value]) => {
    if (!finite(value) || value <= 0) errors.push(`${label} must be greater than zero.`);
  });
  if (!finite(cfg.gap) || cfg.gap < 0) errors.push("Element–wall gap must be zero or greater.");
  if (!finite(cfg.wallEmissivity) || cfg.wallEmissivity < 0 || cfg.wallEmissivity > 1) errors.push("Outer-wall emissivity must be between zero and one.");
  if (!finite(cfg.contactRho) || cfg.contactRho < 0) errors.push("Electrical contact resistivity must be zero or greater.");
  if (!finite(cfg.endK) || cfg.endK <= 0) errors.push("Electrode temperature must remain above absolute zero.");
  if (!finite(cfg.endH) || cfg.endH < 0) errors.push("End heat-transfer coefficient must be zero or greater.");
  return errors;
}

export function validateInput(x) {
  const errors = [];
  const positive = [
    ["Electrical resistivity", x.material.rhoOhmCm],
    ["Density", x.material.density],
    ["Heat capacity", x.material.cp],
    ["Thermal conductivity", x.material.k],
    ["Maximum current density", x.material.jmax],
    ["Maximum current", x.imax],
    ["Maximum voltage", x.vmax],
    ["Maximum power", x.pmax],
    ["Biot limit", x.biLimit]
  ];
  positive.push(["Solid volume", x.volumeCm3], ["Aspect ratio", x.aspectRatio]);
  positive.forEach(([label, value]) => {
    if (!finite(value) || value <= 0) errors.push(`${label} must be greater than zero.`);
  });
  if (!finite(x.emissivity) || x.emissivity < 0 || x.emissivity > 1) errors.push("Emissivity must be between 0 and 1.");
  if (!finite(x.solidFraction) || x.solidFraction <= 0 || x.solidFraction > 1) errors.push("Solid fraction must be greater than 0 and no greater than 1.");
  if (x.convection && (!finite(x.h) || x.h < 0)) errors.push("Convection coefficient must be zero or greater.");
  if (x.ambientK <= 0 || x.targetK <= 0 || x.gasK <= 0) errors.push("Temperatures must remain above absolute zero.");
  if(x.enclosure)errors.push(...validate2DConfig(x.enclosure));
  return errors;
}

export function geometry(x) {
  const solidVolume = x.volumeCm3 * 1e-6;
  const envelopeVolume = solidVolume / x.solidFraction;
  const D = Math.cbrt((4 * envelopeVolume) / (Math.PI * x.aspectRatio));
  const L = x.aspectRatio * D;
  const grossArea = Math.PI * D * D / 4;
  const area = grossArea * x.solidFraction;
  const surface = Math.PI * D * L + Math.PI * D * D / 2;
  return { L, D, area, grossArea, surface, volume:solidVolume, solidVolume, envelopeVolume, lc:envelopeVolume / surface, aspectRatio:L / D, solidFraction:x.solidFraction, porosity:1-x.solidFraction };
}

export function directSurfaceHeatLoss(T, x, g) {
  const radiation=x.emissivity*SIGMA_SB*g.surface*(Math.pow(T,4)-Math.pow(x.ambientK,4));
  const convection=x.convection?x.h*g.surface*(T-x.gasK):0;
  return {total:radiation+convection,side:radiation+convection,end:0,wallK:x.ambientK,heAdvective:0,heOutletK:x.gasK,model:"direct surface"};
}

export function radiationCoefficient(tempK, sinkK, emissivity) {
  return emissivity*SIGMA_SB*(tempK+sinkK)*(tempK*tempK+sinkK*sinkK);
}

export function gapRadiationCoefficient(elementK, wallK, elementEmissivity, wallEmissivity, elementRadius, wallRadius) {
  const areaRatio=elementRadius/Math.max(wallRadius,1e-30);
  const denominator=1/Math.max(elementEmissivity,1e-6)+areaRatio*(1/Math.max(wallEmissivity,1e-6)-1);
  return SIGMA_SB*(elementK+wallK)*(elementK*elementK+wallK*wallK)/Math.max(denominator,1e-30);
}

export function enclosureHeatLoss(T, x, g, cfg=x.enclosure) {
  if(!cfg)return directSurfaceHeatLoss(T,x,g);
  const elementRadius=g.D/2,wallInnerRadius=elementRadius+cfg.gap,wallOuterRadius=wallInnerRadius+cfg.wallThickness;
  const domainHeight=g.L*60/44,domainRadius=wallOuterRadius*30/22,axialMargin=Math.max((domainHeight-g.L)/2,1e-12);
  const elementSideArea=2*Math.PI*elementRadius*g.L,elementEndArea=Math.PI*elementRadius*elementRadius,wallOutsideArea=2*Math.PI*wallOuterRadius*domainHeight;
  const wallAnnulusArea=Math.PI*(wallOuterRadius*wallOuterRadius-wallInnerRadius*wallInnerRadius);
  const wallRadialResistance=Math.log(wallOuterRadius/Math.max(wallInnerRadius,1e-30))/(2*Math.PI*Math.max(cfg.wallK,1e-30)*g.L);
  const gapResistance=cfg.gap>1e-12?Math.log(wallInnerRadius/elementRadius)/(2*Math.PI*Math.max(cfg.gapK,1e-30)*g.L):0;
  const airResistance=Math.log(domainRadius/wallOuterRadius)/(2*Math.PI*OUTSIDE_AIR_K*domainHeight);
  const filmResistance=x.convection&&x.h>0?1/(x.h*wallOutsideArea):0;
  const outsideConduction=1/Math.max(airResistance+filmResistance,1e-30);
  const wallSpreadingLength=axialMargin+g.L/6;
  const wallEndConductance=2*cfg.wallK*wallAnnulusArea/Math.max(wallSpreadingLength,1e-30);
  const gapRadiationDenominator=1/Math.max(x.emissivity,1e-6)+(elementRadius/Math.max(wallInnerRadius,1e-30))*(1/Math.max(cfg.wallEmissivity,1e-6)-1);
  const gapConductance=(wallK)=>{
    if(cfg.gap<=1e-12)return 1/Math.max(wallRadialResistance,1e-30);
    const radiation=SIGMA_SB*elementSideArea*(T+wallK)*(T*T+wallK*wallK)/Math.max(gapRadiationDenominator,1e-30);
    const conduction=1/Math.max(gapResistance+wallRadialResistance,1e-30);
    const radiationThroughWall=1/(1/Math.max(radiation,1e-30)+wallRadialResistance);
    return conduction+radiationThroughWall;
  };
  // The wall does not sit at one temperature over the whole domain height. It is
  // heated across the element's length and cools away from it, so charging the
  // full 2*pi*r*domainHeight to the near-element temperature over-counts hot
  // radiating area. Channel-resolved 2D loss puts the size of that error at 20.5
  // of the 22 W by which this network used to over-predict the total, all of it
  // on the side path (2D: wall radiation 440.29 + outer radial 39.77 + axial
  // 4.43 = 484.49 W against 505.03 W here), while the end paths agreed to 0.3 W.
  //
  // Treat the overhang as a radiating fin instead: a strip of wall of section
  // wallAnnulusArea and perimeter 2*pi*r_out, losing heat at the local radiation
  // coefficient, contributes tanh(m*margin)/m of effective length per side with
  // m = sqrt(h P / (k A)). The fin parameter is evaluated at the current wall
  // temperature inside the bisection, so the two stay consistent. Radiation
  // dominates the outer loss by an order of magnitude, so it alone sets m.
  const wallPerimeter=2*Math.PI*wallOuterRadius;
  const wallRadiatingArea=(wallK)=>{
    const hRad=radiationCoefficient(wallK,x.ambientK,cfg.wallEmissivity);
    const m=Math.sqrt(Math.max(hRad,1e-30)*wallPerimeter/Math.max(cfg.wallK*wallAnnulusArea,1e-30));
    const finLength=m>1e-30?Math.tanh(m*axialMargin)/m:axialMargin;
    return wallPerimeter*Math.min(g.L+2*finLength,domainHeight);
  };
  const wallLossConductance=(wallK)=>outsideConduction+radiationCoefficient(wallK,x.ambientK,cfg.wallEmissivity)*wallRadiatingArea(wallK)+wallEndConductance;
  let lo=Math.min(T,x.ambientK),hi=Math.max(T,x.ambientK);
  for(let iteration=0;iteration<70;iteration++) {
    const wallK=(lo+hi)/2,qFromElement=gapConductance(wallK)*(T-wallK),qFromWall=wallLossConductance(wallK)*(wallK-x.ambientK);
    if(qFromElement-qFromWall>0)lo=wallK;else hi=wallK;
  }
  const wallK=(lo+hi)/2,side=gapConductance(wallK)*(T-wallK);
  let end=0;
  if(cfg.endMode==="ambient") {
    const gasEndConductance=2*cfg.gapK*elementEndArea/axialMargin;
    end=gasEndConductance*(T-x.ambientK)+2*x.emissivity*SIGMA_SB*elementEndArea*(Math.pow(T,4)-Math.pow(x.ambientK,4));
  } else if(cfg.endMode==="electrode") end=2*cfg.endH*elementEndArea*(T-cfg.endK);
  let heOutletK=x.gasK,heAdvective=0;
  if(cfg.gap>1e-12&&HE_CAPACITY_RATE>0) {
    const activeUa=1/Math.max(gapResistance,1e-30),activeEffectiveness=1-Math.exp(-activeUa/HE_CAPACITY_RATE);
    const afterActive=x.gasK+activeEffectiveness*(T-x.gasK);
    const downstreamUa=cfg.gapK*elementEndArea/axialMargin;
    heOutletK=x.ambientK+(afterActive-x.ambientK)*Math.exp(-downstreamUa/HE_CAPACITY_RATE);
    heAdvective=HE_CAPACITY_RATE*(heOutletK-x.gasK);
  }
  return {total:side+end+heAdvective,side,end,wallK,heAdvective,heOutletK,model:"enclosure network"};
}

export function heatLoss(T, x, g) {
  return enclosureHeatLoss(T,x,g).total;
}

// Setpoint modes ("cc"/"cv") drive the supply exactly at the user's set current
// or voltage; other limits are reported as violations, never clamped, so the
// numbers answer "what would this drive point require".
export function supplyViolations(mode, x, current, voltage, power, jmax, area) {
  const over = (v, lim) => lim > 0 && v > lim * (1 + 1e-9);
  const violations = [];
  if (mode === "cv" && over(current, x.imax)) violations.push(`I ${">"} Imax`);
  if (mode === "cc" && over(voltage, x.vmax)) violations.push(`V ${">"} Vmax`);
  if (over(current, jmax * area)) violations.push(`J ${">"} Jmax`);
  if (over(power, x.pmax)) violations.push(`P ${">"} Pmax`);
  return violations;
}

export function operatingAt(tempK, x, g) {
  const props = propertiesAt(x.material, tempK);
  const rhoE = props.rhoOhmCm * 0.01;
  const resistance = rhoE * g.L / g.area;
  const candidates = {
    Current: x.imax,
    Voltage: x.vmax / resistance,
    "Current density": x.material.jmax * g.area,
    Power: Math.sqrt(x.pmax / resistance)
  };
  const mode = x.supplyMode === "cc" || x.supplyMode === "cv" ? x.supplyMode : "auto";
  if (mode !== "auto") {
    const current = Math.max(0, mode === "cc" ? (x.iset ?? x.imax) : (x.vset ?? x.vmax) / resistance);
    const voltage = current * resistance, power = current * current * resistance;
    const violations = supplyViolations(mode, x, current, voltage, power, x.material.jmax, g.area);
    const constraint = mode === "cc" ? "A limited" : "V limited";
    return { props, rhoE, resistance, candidates, constraint, mode, violations, current, voltage, power };
  }
  const current = Math.min(...Object.values(candidates));
  const tolerance = Math.max(1e-10, current * 1e-8);
  const constraint = Object.entries(candidates).filter(([,v]) => Math.abs(v-current) <= tolerance).map(([n]) => n).join(" + ");
  return { props, rhoE, resistance, candidates, constraint, mode, violations: [], current, voltage:current*resistance, power:current*current*resistance };
}

export function solveSteadyTemperature(x, g) {
  let lo = 1;
  let hi = Math.max(x.targetK, x.ambientK, x.gasK, 500);
  let guard = 0;
  while (heatLoss(hi, x, g) < operatingAt(hi, x, g).power && hi < 12000 && guard < 40) {
    hi *= 1.35;
    guard += 1;
  }
  if (heatLoss(hi, x, g) < operatingAt(hi, x, g).power) return Infinity;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (heatLoss(mid, x, g) < operatingAt(mid, x, g).power) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// If the steady-state temperature clears the material's melting (or
// decomposition/sublimation) point, report the single-parameter Vmax or
// Imax ceiling that would hold Tss at that point instead, with everything
// else unchanged. Either ceiling alone is sufficient; a user does not need
// to lower both.
export function meltWarning(x, g, m, tss) {
  if (!finite(m.meltC) || !finite(tss) || tss <= 0) return null;
  const meltK = kelvin(m.meltC);
  if (tss <= meltK) return null;
  const loss = enclosureHeatLoss(meltK, x, g).total;
  const props = propertiesAt(m, meltK);
  const resistance = props.rhoOhmCm * 0.01 * g.L / g.area;
  return {
    meltC: m.meltC,
    meltKind: m.meltKind || "melting",
    safeVoltage: Math.sqrt(Math.max(0, loss * resistance)),
    safeCurrent: Math.sqrt(Math.max(0, loss / resistance))
  };
}

export function calculate(x) {
  const errors = validateInput(x);
  if (errors.length) return { errors };

  const g = geometry(x);
  const m = x.material;
  const initial = operatingAt(x.ambientK, x, g);
  const target = operatingAt(x.targetK, x, g);
  const rhoE = target.rhoE;
  const sigma = 1 / rhoE;
  const mass = m.density * g.volume;
  const resistance = target.resistance;
  const candidates = target.candidates;
  const operatingCurrent = target.current;
  const constraint = target.constraint;
  const voltage = target.voltage;
  const power = target.power;
  const specificPower = power / mass;
  const currentDensity = operatingCurrent / g.area;
  const volumetricPowerMW = power / g.volume * 1e-6;
  const rampRate = initial.power / (mass * initial.props.cp);
  const tss = solveSteadyTemperature(x, g);
  const targetLoss=enclosureHeatLoss(x.targetK,x,g),steadyLoss=finite(tss)?enclosureHeatLoss(tss,x,g):null;
  const requiredPower = Math.max(0,targetLoss.total);
  const requiredVoltage = Math.sqrt(requiredPower * resistance);
  const requiredCurrent = requiredPower > 0 ? Math.sqrt(requiredPower / resistance) : 0;
  const feasible = power + Math.max(1e-9, requiredPower * 1e-9) >= requiredPower;
  const deltaT = Math.max(0, x.targetK - x.ambientK);
  const adiabaticTime = deltaT / rampRate;
  const hEffective = deltaT>0?requiredPower/Math.max(g.surface*deltaT,1e-30):0;
  const bi = hEffective * g.lc / elementK(m, x.targetK, x, x.enclosure);
  const kcrit = hEffective * g.lc / x.biLimit;
  const uniform = bi <= x.biLimit;
  const maxMaterialRamp = m.jmax * m.jmax * rhoE / (m.density * target.props.cp);
  const maxField = m.jmax * rhoE;
  const voltageAtJmax = maxField * g.L;
  const melt = meltWarning(x, g, m, tss);

  return {
    errors: [], g, rhoE, sigma, mass, resistance, candidates, constraint,
    supplyMode: target.mode, violations: target.violations,
    operatingCurrent, voltage, power, specificPower, currentDensity,
    volumetricPowerMW, rampRate, tss, requiredPower, requiredVoltage,
    requiredCurrent, feasible, adiabaticTime, hEffective, bi, kcrit,
    uniform, maxMaterialRamp, maxField, voltageAtJmax,targetLoss,steadyLoss,
    powerUse: power / x.pmax, material: m, input: x, initial, target, melt
  };
}

export function allocateSegmentCells(segments, total) {
  const counts=segments.map(segment=>segment.min),minimum=counts.reduce((sum,value)=>sum+value,0);
  let remaining=total-minimum;
  if(remaining<0) throw new Error("Fixed mesh cannot satisfy the minimum region resolution.");
  const lengthSum=segments.reduce((sum,segment)=>sum+segment.length,0);
  const raw=segments.map(segment=>remaining*segment.length/Math.max(lengthSum,1e-30));
  raw.forEach((value,index)=>{const add=Math.floor(value);counts[index]+=add;remaining-=add;});
  const order=raw.map((value,index)=>({index,fraction:value-Math.floor(value)})).sort((a,b)=>b.fraction-a.fraction);
  for(let n=0;n<remaining;n++) counts[order[n%order.length].index]++;
  return counts;
}

export function build2DMesh(g, cfg) {
  const nr=cfg.nr||30,nz=cfg.nz||60,radius=g.D/2,hasGap=cfg.gap>1e-12,outerRadius=radius+cfg.gap+cfg.wallThickness;
  // The surrounding-air blanket reaches domainRatio x the outer radius. It used
  // to be written as nr/(nr-nAir), which tied the *physical* domain to the cell
  // count: refining the grid with a fixed nAir walked the far-field boundary
  // inward (1.364 -> 1.071 from 30x60 to 120x240), so a refinement study moved
  // the boundary condition instead of holding the problem fixed. State the reach
  // directly instead. The 30/22 default is the historical value to the digit.
  const domainRatio=cfg.domainRatio??30/22;
  // Air resolution no longer changes the physics, only how well the log profile
  // out to that boundary is resolved, so it can be cut back and graded. What is
  // freed goes to the element, which carries both the source and the steep
  // near-surface gradient the radiation boundary reads.
  const nAir=cfg.nAir??Math.max(4,Math.round(nr*5/30)),activeRadialCells=nr-nAir;
  // Left length-proportional deliberately. Down-weighting the wall to hand its
  // cells to the element looks attractive on the shipped enclosure, where a 1 mm
  // quartz shell is nearly isothermal — but quartz at k = 1.4 is the *highest*
  // resistance per unit thickness in the stack, and starving it broke the
  // multi-layer ln-resistance benchmark (0.8% -> 3.5% at L/D 100). The element
  // gains its cells from the smaller air blanket instead, which costs nothing.
  const segments=[{key:"element",length:radius,min:8}];
  if(hasGap) segments.push({key:"gap",length:cfg.gap,min:1});
  segments.push({key:"wall",length:cfg.wallThickness,min:2});
  const counts=allocateSegmentCells(segments,activeRadialCells),byKey=Object.fromEntries(segments.map((segment,index)=>[segment.key,counts[index]]));
  const nElement=byKey.element,nGap=byKey.gap||0,nWall=byKey.wall,nAirZ=cfg.nAirZ??Math.max(4,Math.round(nz*8/60)),nActiveZ=nz-2*nAirZ;
  const domainRadius=outerRadius*domainRatio,domainHeight=g.L*nz/nActiveZ,dz=domainHeight/nz;
  const edges=[0];
  const addSegment=(start,end,count)=>{for(let i=1;i<=count;i++)edges.push(start+(end-start)*i/count);};
  // Geometric grading for the air: the radial profile out there is logarithmic,
  // so cells near the wall carry the gradient and cells far out carry almost
  // none. Grading lets a smaller nAir cover the same reach at lower error.
  //
  // The *total* stretch (last cell / first cell) is what is held fixed, not the
  // cell-to-cell growth factor. A fixed growth factor compounds: at nAir = 20 a
  // 1.35 ratio spans 600:1 across the blanket, which is both inaccurate and
  // badly conditioned. Fixing the total instead keeps neighbouring cells close
  // in size and makes refinement scale every air cell by the same factor, so the
  // grid sequence stays a genuine refinement.
  const addGradedSegment=(start,end,count,stretch)=>{
    const growth=count>1?Math.pow(stretch,1/(count-1)):1;
    const widths=[];let w=1,total=0;
    for(let n=0;n<count;n++){widths.push(w);total+=w;w*=growth;}
    let acc=start;
    for(let n=0;n<count;n++){acc+=(end-start)*widths[n]/total;edges.push(n===count-1?end:acc);}
  };
  addSegment(0,radius,nElement);
  if(hasGap) addSegment(radius,radius+cfg.gap,nGap);
  addSegment(radius+cfg.gap,outerRadius,nWall);
  addGradedSegment(outerRadius,domainRadius,nAir,8);
  const centers=Array.from({length:nr},(_,i)=>(edges[i]+edges[i+1])/2);
  const zEdges=Array.from({length:nz+1},(_,j)=>-domainHeight/2+j*dz),zCenters=Array.from({length:nz},(_,j)=>(zEdges[j]+zEdges[j+1])/2);
  const activeStart=nAirZ,activeEnd=nAirZ+nActiveZ;
  const materialAt=(i,j)=>{
    const wallStart=nElement+nGap,wallEnd=wallStart+nWall;
    if(i>=wallEnd)return 3;
    if(i>=wallStart)return 2;
    if(j<activeStart||j>=activeEnd)return 4;
    if(i<nElement)return 0;
    return 1;
  };
  const cellVolume=(i,j)=>Math.PI*(edges[i+1]*edges[i+1]-edges[i]*edges[i])*(zEdges[j+1]-zEdges[j]);
  let elementVolume=0;
  for(let j=activeStart;j<activeEnd;j++)for(let i=0;i<nElement;i++)elementVolume+=cellVolume(i,j);
  return{radius,outerRadius,domainRadius,domainHeight,edges,centers,zEdges,zCenters,dz,nr,nz,nElement,nGap,nWall,nAir,nAirZ,nActiveZ,activeStart,activeEnd,materialAt,cellVolume,elementVolume};
}

export function material2DName(code, result) {
  if (code === 0) return result.material.name;
  if (code === 1) return "Gas gap";
  if (code === 2) return T2D_WALLS[result.cfg.wallMaterial]?.name || "Wall";
  if (code === 4) return "He process gas · 50 sccm";
  return "Surrounding air";
}

export function cellK2D(code, tempK, material, cfg, x) {
  if (code === 0) return elementK(material, tempK, x, cfg);
  if (code === 1 || code === 4) return Math.max(1e-6, cfg.gapK);
  if (code === 2) return Math.max(1e-6, cfg.wallK);
  return OUTSIDE_AIR_K;
}

// Volumetric heat capacity per material code, the transient counterpart of
// cellK2D. Only the element and the wall carry meaningful thermal mass; the
// gas codes fall back to an ideal-gas scaling so that a hot cell stores less
// than a cold one rather than being pinned at its reference value.
export function rhoCp2D(code, tempK, material, cfg) {
  if (code === 0) return Math.max(1, material.density * propertiesAt(material, tempK).cp);
  if (code === 2) {
    const wall = T2D_WALLS[cfg.wallMaterial] || T2D_WALLS.custom;
    const density = finite(cfg.wallDensity) ? cfg.wallDensity : wall.density;
    const cp = finite(cfg.wallCp) ? cfg.wallCp : wall.cp;
    return Math.max(1, density * cp);
  }
  const ref = code === 3 ? AIR_RHOCP_REF : GAS_RHOCP_REF;
  return Math.max(1, ref * RHOCP_REF_K / Math.max(tempK, 1));
}

export function operating2DAt(tempK, x, g, cfg, material) {
  const props = propertiesAt(material,tempK);
  const rhoE = props.rhoOhmCm * 0.01;
  const rBulk = rhoE * g.L / g.area;
  const rContact = cfg.contactRho / g.area;
  const rTotal = rBulk + 2*rContact;
  const candidates = {
    Current: x.imax,
    Voltage: x.vmax / rTotal,
    "Current density": material.jmax * g.area,
    Power: Math.sqrt(x.pmax / rTotal)
  };
  const mode = x.supplyMode === "cc" || x.supplyMode === "cv" ? x.supplyMode : "auto";
  let current, constraint, violations = [];
  if (mode !== "auto") {
    current = Math.max(0, mode === "cc" ? (x.iset ?? x.imax) : (x.vset ?? x.vmax) / rTotal);
    violations = supplyViolations(mode, x, current, current*rTotal, current*current*rTotal, material.jmax, g.area);
    constraint = mode === "cc" ? "A limited" : "V limited";
  } else {
    current = Math.max(0, Math.min(...Object.values(candidates)));
    const tolerance = Math.max(1e-10,current*1e-8);
    constraint = Object.entries(candidates).filter(([,v]) => Math.abs(v-current)<=tolerance).map(([name])=>name).join(" + ");
  }
  return {
    props, rhoE, rBulk, rContact, rTotal, candidates, current, constraint, mode, violations,
    voltage:current*rTotal,
    pBulk:current*current*rBulk,
    pContact:current*current*2*rContact,
    pTotal:current*current*rTotal
  };
}

export function gasFlowCells2D(mesh, j) {
  const cells=[];
  for(let i=0;i<mesh.nr;i++) {
    const code=mesh.materialAt(i,j);
    if(code===1||code===4)cells.push(i);
  }
  return cells;
}

export function gasBulkRowTemperature2D(T, mesh, j) {
  const cells=gasFlowCells2D(mesh,j);
  if(!cells.length)return NaN;
  let weighted=0,areaTotal=0;
  for(const i of cells){
    const area=Math.PI*(mesh.edges[i+1]*mesh.edges[i+1]-mesh.edges[i]*mesh.edges[i]);
    weighted+=area*T[j][i];areaTotal+=area;
  }
  return weighted/Math.max(areaTotal,1e-30);
}

// ------------------------------------------------------------- electrical field
// The thermal assembly treats the Joule source as uniform over the element:
// every element cell gets op.pBulk/envelopeVolume. That is exact only when the
// electrical conductivity is uniform. For a material with rho(T) it is not: the
// hot core conducts differently from the cooler skin, current redistributes, and
// the dissipation follows it. Solving del.(sigma grad V) = 0 on the element and
// deriving the source from the resulting field is what turns "uniform heating"
// into a current-density model.
//
// No new discretization is needed. A two-point-flux conductance is the same
// operator whether the coefficient is k or sigma, and pcg2D/multiply2DSystem
// only read {diag, rhs, edges}, so the existing machinery is reused as is.

export function cellSigma2D(tempK, material) {
  // propertiesAt returns resistivity in ohm.cm; 0.01 converts to ohm.m.
  return 1 / Math.max(propertiesAt(material, tempK).rhoOhmCm * 0.01, 1e-30);
}

// Potential problem on the element only. The gap, wall and surrounding air are
// insulators, so no face is built into them and the element's curved surface
// becomes a natural zero-current boundary. The two axial ends are the
// electrodes, held at 0 and 1 V here; the physical drive level is applied
// afterwards by scaling, since the system is linear in V at fixed sigma.
//
// Cells outside the element still occupy a slot in the flat index space so the
// shared solver can run unchanged; they are given an identity row (V = 0).
export function assembleElectrical2D(T, material, mesh, porosity) {
  const count=mesh.nr*mesh.nz,diag=new Float64Array(count),rhs=new Float64Array(count),edges=[],faces=[],electrodes=[];
  const idx=(i,j)=>j*mesh.nr+i;
  const axialArea=(i)=>Math.PI*(mesh.edges[i+1]*mesh.edges[i+1]-mesh.edges[i]*mesh.edges[i]);
  // The porosity multiplier is 1 everywhere unless cfg.porosityContrast is set.
  const multiplier=porosity?porosity.multiplier:null;
  const sigmaAt=(i,j)=>cellSigma2D(T[j][i],material)*(multiplier?multiplier[j*mesh.nr+i]:1);
  const pairG=(area,d1,s1,d2,s2)=>area/Math.max(d1/s1+d2/s2,1e-30);
  for(let j=mesh.activeStart;j<mesh.activeEnd;j++) for(let i=0;i<mesh.nElement;i++) {
    const p=idx(i,j),sp=sigmaAt(i,j);
    if(i+1<mesh.nElement) {
      const q=idx(i+1,j),face=mesh.edges[i+1],area=2*Math.PI*face*(mesh.zEdges[j+1]-mesh.zEdges[j]);
      const G=pairG(area,face-mesh.centers[i],sp,mesh.centers[i+1]-face,sigmaAt(i+1,j));
      diag[p]+=G;diag[q]+=G;edges.push([p,q,G]);faces.push([p,q,G,"r"]);
    }
    if(j+1<mesh.activeEnd) {
      const q=idx(i,j+1),face=mesh.zEdges[j+1],area=axialArea(i);
      const G=pairG(area,face-mesh.zCenters[j],sp,mesh.zCenters[j+1]-face,sigmaAt(i,j+1));
      diag[p]+=G;diag[q]+=G;edges.push([p,q,G]);faces.push([p,q,G,"z"]);
    }
    // Electrode half-cell conductances. Only the driven end contributes to rhs.
    if(j===mesh.activeStart) {
      const G=sp*axialArea(i)/Math.max(mesh.zCenters[j]-mesh.zEdges[j],1e-30);
      diag[p]+=G;electrodes.push([p,G,0,i]);
    }
    if(j===mesh.activeEnd-1) {
      const G=sp*axialArea(i)/Math.max(mesh.zEdges[j+1]-mesh.zCenters[j],1e-30);
      diag[p]+=G;rhs[p]+=G;electrodes.push([p,G,1,i]);
    }
  }
  for(let n=0;n<count;n++) if(diag[n]===0) diag[n]=1;
  return {diag,rhs,edges,faces,electrodes};
}

// Solve the unit-potential problem, rescale to the operating current, and turn
// the face currents into a per-cell dissipation.
//
// The returned qCell is renormalized so that it sums to targetPower (op.pBulk).
// The 2D element spans the *envelope* radius while the zero-D bulk resistance
// uses the solid cross-section g.area = grossArea x solidFraction, so the two
// resistances differ whenever solidFraction < 1. Renormalizing keeps the total
// injected power identical to what the rest of the solver already accounts for
// (energy closure, supply limits, contact losses), so this change redistributes
// heat without moving the energy budget: only the *shape* of the source is new.
export function solveElectrical2D(T, material, mesh, targetCurrent, targetPower, porosity) {
  const system=assembleElectrical2D(T,material,mesh,porosity),count=mesh.nr*mesh.nz;
  const zLo=mesh.zEdges[mesh.activeStart],zSpan=Math.max(mesh.zEdges[mesh.activeEnd]-zLo,1e-30);
  const guess=new Float64Array(count);
  for(let j=mesh.activeStart;j<mesh.activeEnd;j++) for(let i=0;i<mesh.nElement;i++) guess[j*mesh.nr+i]=(mesh.zCenters[j]-zLo)/zSpan;
  const solved=pcg2D(system,guess),V=solved.x;
  // Current drawn at the driven electrode when 1 V is applied across the element.
  let unitCurrent=0;
  for(const [p,G,end] of system.electrodes) if(end===1) unitCurrent+=G*(1-V[p]);
  const resistance=unitCurrent>1e-30?1/unitCurrent:Infinity;
  const scale=unitCurrent>1e-30?targetCurrent/unitCurrent:0;

  const qCell=new Float64Array(count),jr=new Float64Array(count),jz=new Float64Array(count);
  const axialArea=(i)=>Math.PI*(mesh.edges[i+1]*mesh.edges[i+1]-mesh.edges[i]*mesh.edges[i]);
  const nr2=new Float64Array(count),nz2=new Float64Array(count);
  for(const [p,q,G,axis] of system.faces) {
    const drop=V[p]-V[q],dissipation=G*drop*drop/2;
    qCell[p]+=dissipation;qCell[q]+=dissipation;
    // Face current density [A/m2] at the drive level, averaged onto the two
    // cells the face separates. Each cell keeps a separate count per axis, so a
    // cell on the element edge is not diluted by the faces it does not have.
    const i=p%mesh.nr,j=(p-i)/mesh.nr;
    const area=axis==="z"?axialArea(i):2*Math.PI*mesh.edges[i+1]*(mesh.zEdges[j+1]-mesh.zEdges[j]);
    const density=scale*G*drop/Math.max(area,1e-30);
    if(axis==="z"){jz[p]+=density;jz[q]+=density;nz2[p]++;nz2[q]++;}
    else{jr[p]+=density;jr[q]+=density;nr2[p]++;nr2[q]++;}
  }
  // The electrode half-face carries the same current as the cell it feeds, so
  // it counts toward that cell's axial average like any other face. Signs
  // follow the interior convention: the face current is G times the potential
  // drop taken from the -z side to the +z side, so the driven end at the top
  // reads (V_cell - V_applied) and the grounded end at the bottom reads
  // (V_applied - V_cell). Both are negative when current flows downward.
  for(const [p,G,end] of system.electrodes) {
    const applied=end===1?1:0,drop=applied-V[p];
    qCell[p]+=G*drop*drop;
    const i=p%mesh.nr,signed=end===1?V[p]-applied:applied-V[p];
    jz[p]+=scale*G*signed/Math.max(axialArea(i),1e-30);
    nz2[p]++;
  }
  let total=0;for(let n=0;n<count;n++) total+=qCell[n];
  const norm=total>1e-30?targetPower/total:0;
  const jMag=new Float64Array(count);
  for(let n=0;n<count;n++) {
    qCell[n]*=norm;
    if(nr2[n]>0) jr[n]/=nr2[n];
    if(nz2[n]>0) jz[n]/=nz2[n];
    jMag[n]=Math.hypot(jr[n],jz[n]);
  }
  for(let n=0;n<count;n++) V[n]*=scale;
  return {V,qCell,jr,jz,jMag,resistance,unitCurrent,current:targetCurrent,
    iterations:solved.iterations,relativeResidual:solved.relativeResidual};
}

// `transient`, when present, is {dt, Tprev}: a backward-Euler storage term.
// Its shape is exactly the Robin boundary term already used throughout --
// rho*cp*V/dt onto the diagonal and the same coefficient times the previous
// temperature onto the right-hand side -- so it needs no new machinery and
// leaves the operator symmetric. It is kept out of `boundaryTerms` on purpose:
// that list is what boundaryLoss2D sums as heat leaving the domain, and stored
// energy is not a loss.
export function assemble2DSystem(T, x, g, cfg, material, mesh, op, transient = null) {
  const count=mesh.nr*mesh.nz,diag=new Float64Array(count),rhs=new Float64Array(count),edges=[],directed=[],boundaryTerms=[];
  const idx=(i,j)=>j*mesh.nr+i;
  const axialArea=(i)=>Math.PI*(mesh.edges[i+1]*mesh.edges[i+1]-mesh.edges[i]*mesh.edges[i]);
  const qVol=op.pBulk/g.envelopeVolume;
  // Same radial solid-fraction multiplier the electrical solve uses; all ones
  // unless cfg.porosityContrast is set, so this is a no-op by default.
  const porosity=porosityFactor2D(mesh,cfg),kAt=(i,j,code)=>cellK2D(code,T[j][i],material,cfg,x)*porosity.multiplier[j*mesh.nr+i];
  const addFace=(p,q,G)=>{diag[p]+=G;diag[q]+=G;edges.push([p,q,G]);};
  // Every boundary term carries the path it belongs to. Without it the 2D
  // reports one lumped static loss while the 0D network reports side/end/He
  // separately, so a disagreement between the two totals cannot be traced to a
  // path -- which is exactly where the lumped-limit study stalled.
  const addBoundary=(p,G,Tb,channel)=>{if(G<=0)return;diag[p]+=G;rhs[p]+=G*Tb;boundaryTerms.push([p,G,Tb,channel||"other"]);};
  const addStorage=(p,G,Tb)=>{if(G<=0)return;diag[p]+=G;rhs[p]+=G*Tb;};
  const pairConductance=(area,d1,k1,d2,k2,code1,code2)=>{
    let resistance=d1/k1+d2/k2;
    const solidAir=(code1===3&&code2===2)||(code1===2&&code2===3);
    if(solidAir&&x.convection&&x.h>0)resistance+=1/x.h;
    return area/Math.max(resistance,1e-30);
  };
  // Surface radiation leaves from the *face*, but the unknown lives at the cell
  // center, so the heat must first conduct through the half cell in between.
  // Charging the cell-center temperature directly to the radiation law drops
  // that half-cell resistance, which is a first-order error of size q̇·d/(2k) —
  // the term that keeps the full nonlinear case out of the asymptotic range
  // (docs/VERIFICATION.md §4). Put the two resistances in series instead, the
  // same way pairConductance already treats interior faces, and evaluate the
  // radiation coefficient at the resulting face temperature rather than at the
  // cell center. Two fixed-point passes are enough: h_rad varies as T³ while
  // the face correction itself is small, so the second pass moves the answer by
  // well under the outer-loop tolerance.
  const seriesRadiationConductance=(tempK,area,halfDistance,kCell,emissivity)=>{
    const rCond=Math.max(halfDistance,0)/Math.max(kCell,1e-30);
    let faceK=tempK;
    for(let pass=0;pass<2;pass++){
      const rRad=1/Math.max(radiationCoefficient(faceK,x.ambientK,emissivity),1e-30);
      faceK=x.ambientK+(tempK-x.ambientK)*rRad/(rCond+rRad);
    }
    const rRad=1/Math.max(radiationCoefficient(faceK,x.ambientK,emissivity),1e-30);
    return area/Math.max(rCond+rRad,1e-30);
  };
  const addInterfaceRadiation=(p,code,tempK,area,halfDistance,kCell,channel)=>{
    if(code!==0&&code!==2)return;
    const emissivity=code===0?x.emissivity:cfg.wallEmissivity;
    addBoundary(p,seriesRadiationConductance(tempK,area,halfDistance,kCell,emissivity),x.ambientK,channel||(code===0?"elementRadiation":"wallRadiation"));
  };
  // Needed inside the assembly loop: the axial end boundaries are skipped on
  // cells the purge stream flows through, so the flow map has to exist first.
  const flowRows=Array.from({length:mesh.nz},(_,j)=>gasFlowCells2D(mesh,j));
  // cfg.purge === false removes the 50 sccm He stream while leaving the
  // geometry alone. Needed to separate the gap's conduction path from the
  // advection that runs through it; without it the only way to switch the
  // stream off is to delete the gap, which changes the mesh at the same time.
  const flowConnected=cfg.purge!==false&&flowRows.every(cells=>cells.length>0);
  for(let j=0;j<mesh.nz;j++) for(let i=0;i<mesh.nr;i++) {
    const p=idx(i,j),code=mesh.materialAt(i,j),kp=kAt(i,j,code);
    // cfg.verificationSource(r, z) [W/m³] replaces the Joule source over the whole
    // domain. Only for code verification (manufactured solutions); the page never
    // sets it, and energy-closure reporting assumes the ordinary Joule source.
    if(cfg.verificationSource) rhs[p]+=cfg.verificationSource(mesh.centers[i],mesh.zCenters[j])*mesh.cellVolume(i,j);
    // op.qCell, when present, is the per-cell dissipation [W] from the
    // electrical field solve; it already sums to op.pBulk.
    else if(code===0) rhs[p]+=op.qCell?op.qCell[p]:qVol*mesh.cellVolume(i,j);
    // rho*cp is evaluated at the mean of the old and current temperatures, not
    // at the current one. For a material whose cp is strongly temperature
    // dependent -- carbon paper triples over this range -- the two differ
    // enough to break the energy balance: the assembled term would store
    // rho*cp(T_new)*(T_new-T_old) while the actual enthalpy change is the
    // integral of rho*cp dT across the step. The midpoint value makes the
    // discrete term a second-order approximation to that integral, and lets
    // storageRate2D reproduce it exactly rather than approximately.
    if(transient) addStorage(p,rhoCp2D(code,0.5*(T[j][i]+transient.Tprev[j][i]),material,cfg)*mesh.cellVolume(i,j)/transient.dt,transient.Tprev[j][i]);
    if(i<mesh.nr-1) {
      const q=idx(i+1,j),face=mesh.edges[i+1],area=2*Math.PI*face*(mesh.zEdges[j+1]-mesh.zEdges[j]),nextCode=mesh.materialAt(i+1,j),kn=kAt(i+1,j,nextCode);
      const G=pairConductance(area,face-mesh.centers[i],kp,mesh.centers[i+1]-face,kn,code,nextCode);
      addFace(p,q,G);
      if(code===3&&nextCode===2)addInterfaceRadiation(q,nextCode,T[j][i+1],area,mesh.centers[i+1]-face,kn);
      if(code===2&&nextCode===3)addInterfaceRadiation(p,code,T[j][i],area,face-mesh.centers[i],kp);
    } else {
      const area=2*Math.PI*mesh.edges[mesh.nr]*(mesh.zEdges[j+1]-mesh.zEdges[j]);
      addBoundary(p,kp*area/Math.max(mesh.edges[mesh.nr]-mesh.centers[i],1e-30),x.ambientK,"outerRadial");
    }
    if(j<mesh.nz-1) {
      const q=idx(i,j+1),area=axialArea(i),face=mesh.zEdges[j+1],nextCode=mesh.materialAt(i,j+1),kn=kAt(i,j+1,nextCode),elementGas=(code===0&&nextCode===4)||(code===4&&nextCode===0);
      if(elementGas&&cfg.endMode==="electrode") {
        const elementP=code===0?p:q;
        addBoundary(elementP,cfg.endH*area,cfg.endK,"electrode");
      } else if(!(elementGas&&cfg.endMode==="adiabatic")) {
        const G=pairConductance(area,face-mesh.zCenters[j],kp,mesh.zCenters[j+1]-face,kn,code,nextCode);
        addFace(p,q,G);
        if(elementGas&&cfg.endMode==="ambient") {
          const elementP=code===0?p:q,elementTemp=code===0?T[j][i]:T[j+1][i];
          const elementHalf=code===0?face-mesh.zCenters[j]:mesh.zCenters[j+1]-face,elementK=code===0?kp:kn;
          addInterfaceRadiation(elementP,0,elementTemp,area,elementHalf,elementK,"elementEndRadiation");
        }
        if(code===3&&(nextCode===0||nextCode===2))addInterfaceRadiation(q,nextCode,T[j+1][i],area,mesh.zCenters[j+1]-face,kn);
        if((code===0||code===2)&&nextCode===3)addInterfaceRadiation(p,code,T[j][i],area,face-mesh.zCenters[j],kp);
      }
    }
    // The two axial end rows sit on an ambient Dirichlet boundary, with a
    // conductance that scales as 1/(dz/2) and therefore *diverges* under mesh
    // refinement. On the purge stream's own cells that is wrong twice over. The
    // inlet row already has its temperature imposed through the advection term
    // (rhs += capacity * gasK), and the outlet row does not need one at all --
    // the enthalpy leaves with the flow. Clamping them as well short-circuits
    // the stream to ambient, ever harder as the grid is refined: the reported
    // advective cooling halved on every refinement, 0.0377 -> 0.0182 -> 0.0086 W,
    // heading for zero instead of a physical value. A term of the model that
    // vanishes as h -> 0 cannot converge, and this one drove the observed order
    // negative. Leave the flowing cells to the advection scheme.
    const flowing=flowConnected&&(code===1||code===4);
    if(j===0&&!flowing) addBoundary(p,kp*axialArea(i)/Math.max(mesh.zCenters[j]-mesh.zEdges[j],1e-30),x.ambientK,"axialAmbient");
    if(j===mesh.nz-1&&!flowing) addBoundary(p,kp*axialArea(i)/Math.max(mesh.zEdges[j+1]-mesh.zCenters[j],1e-30),x.ambientK,"axialAmbient");
  }

  if(mesh.nGap>0) {
    const iElement=mesh.nElement-1,iWall=mesh.nElement+mesh.nGap,elementRadius=mesh.radius,wallRadius=mesh.edges[iWall],areaPerRow=2*Math.PI*elementRadius*mesh.dz;
    // Same half-cell correction as seriesRadiationConductance, applied to the
    // element→wall gap exchange: the radiating surfaces sit on the cell faces,
    // not at the two cell centers this face couples. On the shipped enclosure
    // this is the element's dominant loss path (gapK = 0.03 W/m·K conducts
    // almost nothing), so it carries most of the grid sensitivity. The half-cell
    // resistances also appear on the parallel conduction branch through the gap
    // cells; treating each branch as its own series chain slightly overcounts
    // them, which is far smaller than dropping them from the radiation branch.
    const elementHalf=Math.max(elementRadius-mesh.centers[iElement],0),wallHalf=Math.max(mesh.centers[iWall]-wallRadius,0);
    for(let j=mesh.activeStart;j<mesh.activeEnd;j++) {
      const p=idx(iElement,j),q=idx(iWall,j),hGapRad=gapRadiationCoefficient(T[j][iElement],T[j][iWall],x.emissivity,cfg.wallEmissivity,elementRadius,wallRadius);
      const kElement=kAt(iElement,j,0),kWall=kAt(iWall,j,2);
      const resistance=elementHalf/Math.max(kElement,1e-30)+1/Math.max(hGapRad,1e-30)+wallHalf/Math.max(kWall,1e-30);
      addFace(p,q,areaPerRow/Math.max(resistance,1e-30));
    }
  }

  if(flowConnected&&HE_CAPACITY_RATE>0) {
    for(let j=mesh.nz-1;j>=0;j--) {
      const cells=flowRows[j],areas=cells.map(axialArea),areaTotal=areas.reduce((sum,value)=>sum+value,0);
      const weights=areas.map(value=>value/Math.max(areaTotal,1e-30));
      // Where the flow cross-section does not change from one row to the next,
      // each cell draws its inflow from the cell directly upstream of it. Taking
      // the area-weighted mean of the whole upstream row instead — as this did
      // for every row — homogenizes the stream radially once per cell, so the
      // mixing length is the mesh spacing and the mixing rate per unit length
      // diverges under refinement. That is not a discretization of anything, and
      // because the purge cells are also conduction cells the artifact lands in
      // the element-to-wall gap resistance: measured across 30x60 / 60x120 /
      // 120x240 it moved the gap drop by 906 -> 803 -> 672 K and drove the
      // observed order of the default case negative.
      //
      // The mean is still the right inflow where the stream actually contracts
      // or expands (entering and leaving the element annulus), so it is kept for
      // exactly those rows. Both branches conserve enthalpy: matched rows share
      // the same cell set and therefore the same area weights, so the capacity
      // leaving a cell equals the capacity arriving at its neighbour.
      const upstream=j<mesh.nz-1?flowRows[j+1]:null;
      const matched=upstream&&upstream.length===cells.length&&cells.every((cell,n)=>upstream[n]===cell);
      const upstreamAreas=upstream?upstream.map(axialArea):[],upstreamTotal=upstreamAreas.reduce((sum,value)=>sum+value,0);
      for(let n=0;n<cells.length;n++) {
        const p=idx(cells[n],j),capacity=HE_CAPACITY_RATE*weights[n];
        diag[p]+=capacity;
        if(j===mesh.nz-1) rhs[p]+=capacity*x.gasK;
        else if(matched) directed.push([p,idx(cells[n],j+1),capacity]);
        else for(let m=0;m<upstream.length;m++)directed.push([p,idx(upstream[m],j+1),capacity*upstreamAreas[m]/Math.max(upstreamTotal,1e-30)]);
      }
    }
  }
  return {diag,rhs,edges,directed,boundaryTerms,qVol,gasFlow:{connected:flowConnected,capacityRate:flowConnected?HE_CAPACITY_RATE:0}};
}

export function multiply2DSystem(system, input, output) {
  for(let i=0;i<system.diag.length;i++)output[i]=system.diag[i]*input[i];
  for(const [a,b,G] of system.edges){output[a]-=G*input[b];output[b]-=G*input[a];}
  for(const [row,column,G] of system.directed||[])output[row]-=G*input[column];
}

export function pcg2D(system, initial, maxIterations=1200, tolerance=1e-11) {
  const n=system.diag.length,x=Float64Array.from(initial),r=new Float64Array(n),z=new Float64Array(n),p=new Float64Array(n),ap=new Float64Array(n);
  multiply2DSystem(system,x,ap);
  let bNorm2=0,rz=0;
  for(let i=0;i<n;i++) {r[i]=system.rhs[i]-ap[i];z[i]=r[i]/Math.max(system.diag[i],1e-18);p[i]=z[i];rz+=r[i]*z[i];bNorm2+=system.rhs[i]*system.rhs[i];}
  const bNorm=Math.sqrt(Math.max(bNorm2,1e-30));
  let relative=Math.sqrt(r.reduce((s,v)=>s+v*v,0))/bNorm,iteration=0;
  for(iteration=0;iteration<maxIterations&&relative>tolerance;iteration++) {
    multiply2DSystem(system,p,ap);
    let pAp=0;for(let i=0;i<n;i++)pAp+=p[i]*ap[i];
    if(Math.abs(pAp)<1e-30)break;
    const alpha=rz/pAp;
    let rNorm2=0;for(let i=0;i<n;i++){x[i]+=alpha*p[i];r[i]-=alpha*ap[i];rNorm2+=r[i]*r[i];}
    relative=Math.sqrt(rNorm2)/bNorm;
    if(relative<=tolerance)break;
    let rzNew=0;for(let i=0;i<n;i++){z[i]=r[i]/Math.max(system.diag[i],1e-18);rzNew+=r[i]*z[i];}
    const beta=rzNew/Math.max(rz,1e-30);for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rz=rzNew;
  }
  return {x,iterations:iteration+1,relativeResidual:relative};
}

export function bicgstab2D(system, initial, maxIterations=1800, tolerance=1e-11) {
  if(!(system.directed||[]).length)return pcg2D(system,initial,maxIterations,tolerance);
  const n=system.diag.length,x=Float64Array.from(initial),r=new Float64Array(n),rHat=new Float64Array(n),p=new Float64Array(n),v=new Float64Array(n),s=new Float64Array(n),t=new Float64Array(n),pHat=new Float64Array(n),sHat=new Float64Array(n),ax=new Float64Array(n);
  const dot=(a,b)=>{let sum=0;for(let i=0;i<n;i++)sum+=a[i]*b[i];return sum;};
  multiply2DSystem(system,x,ax);
  let bNorm2=0,rNorm2=0;
  for(let i=0;i<n;i++){r[i]=system.rhs[i]-ax[i];rHat[i]=r[i];bNorm2+=system.rhs[i]*system.rhs[i];rNorm2+=r[i]*r[i];}
  const bNorm=Math.sqrt(Math.max(bNorm2,1e-30));
  let relative=Math.sqrt(rNorm2)/bNorm,rhoOld=1,alpha=1,omega=1,iteration=0;
  for(iteration=0;iteration<maxIterations&&relative>tolerance;iteration++) {
    const rho=dot(rHat,r);
    if(Math.abs(rho)<1e-30)break;
    const beta=(rho/rhoOld)*(alpha/Math.max(Math.abs(omega),1e-30)*Math.sign(omega||1));
    for(let i=0;i<n;i++)p[i]=r[i]+beta*(p[i]-omega*v[i]);
    for(let i=0;i<n;i++)pHat[i]=p[i]/Math.max(system.diag[i],1e-18);
    multiply2DSystem(system,pHat,v);
    const denominator=dot(rHat,v);
    if(Math.abs(denominator)<1e-30)break;
    alpha=rho/denominator;
    let sNorm2=0;
    for(let i=0;i<n;i++){s[i]=r[i]-alpha*v[i];sNorm2+=s[i]*s[i];}
    if(Math.sqrt(sNorm2)/bNorm<=tolerance){for(let i=0;i<n;i++)x[i]+=alpha*pHat[i];relative=Math.sqrt(sNorm2)/bNorm;iteration++;break;}
    for(let i=0;i<n;i++)sHat[i]=s[i]/Math.max(system.diag[i],1e-18);
    multiply2DSystem(system,sHat,t);
    const tt=dot(t,t);
    if(Math.abs(tt)<1e-30)break;
    omega=dot(t,s)/tt;
    let nextNorm2=0;
    for(let i=0;i<n;i++){x[i]+=alpha*pHat[i]+omega*sHat[i];r[i]=s[i]-omega*t[i];nextNorm2+=r[i]*r[i];}
    relative=Math.sqrt(nextNorm2)/bNorm;
    if(Math.abs(omega)<1e-30)break;
    rhoOld=rho;
  }
  return {x,iterations:Math.max(1,iteration),relativeResidual:relative};
}

export function boundaryLoss2D(T,x,g,cfg,material,mesh,op) {
  const system=assemble2DSystem(T,x,g,cfg,material,mesh,op),flat=T.flat();
  const byChannel={};
  const staticLoss=system.boundaryTerms.reduce((loss,[p,G,Tb,channel])=>{
    const q=G*(flat[p]-Tb);
    byChannel[channel]=(byChannel[channel]||0)+q;
    return loss+q;
  },0);
  const gasOutletK=system.gasFlow.connected?gasBulkRowTemperature2D(T,mesh,0):x.gasK;
  const gasAdvective=system.gasFlow.capacityRate*(gasOutletK-x.gasK);
  return {total:staticLoss+gasAdvective,staticLoss,gasAdvective,gasOutletK,byChannel,flowConnected:system.gasFlow.connected};
}

// Total internal energy of the domain above a reference temperature, J.
export function internalEnergy2D(T, cfg, material, mesh, refK) {
  let sum=0;
  for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++){
    const code=mesh.materialAt(i,j);
    sum+=rhoCp2D(code,T[j][i],material,cfg)*mesh.cellVolume(i,j)*(T[j][i]-refK);
  }
  return sum;
}

// Rate of change of stored energy between two fields, W. Evaluated exactly
// the way assemble2DSystem builds its storage term -- same midpoint rho*cp,
// same cell volumes -- so that the transient closure measures the physics
// rather than a mismatch between two spellings of the same quantity.
export function storageRate2D(T, Tprev, cfg, material, mesh, dt) {
  let sum=0;
  for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++){
    const code=mesh.materialAt(i,j);
    sum+=rhoCp2D(code,0.5*(T[j][i]+Tprev[j][i]),material,cfg)*mesh.cellVolume(i,j)*(T[j][i]-Tprev[j][i]);
  }
  return sum/dt;
}

// Backward-Euler time march of the same operator solveThermal2D solves at
// steady state, and through the same cfg.currentField path, so a transient
// inherits the solved current density rather than being stuck with the
// uniform source. Unconditionally stable, so dt follows the time scale of
// interest rather than a stability limit, and first-order accurate in time --
// a deliberate trade for a screening tool, since Crank-Nicolson rings on the
// stiff radiation boundary at the step sizes a browser can afford.
//
// No under-relaxation here: the storage term puts rho*cp*V/dt on every
// diagonal, which for any dt short enough to be interesting dominates the
// conduction couplings and makes the inner iteration a contraction on its
// own. Each step starts from the previous step's field, so a handful of
// passes is normally enough.
//
// plan: { dt, steps, startK, sourceScale(t), picardMax, picardTol, record }
//   sourceScale(t) multiplies the bulk Joule source, so a pulse train is
//   just a square wave and a shutdown transient is a step to zero.
// A transient run split into advanceable chunks. The browser cannot afford to
// call solveTransient2D directly -- a few thousand implicit steps is tens of
// seconds of solid compute, and a synchronous loop that long freezes the tab
// and cannot be cancelled. createTransientRun does the same march but hands
// back control after each batch, so a page can drive it from an animation
// frame, draw as it goes, and stop when the user says so. solveTransient2D is
// then just this loop run to completion.
export function createTransientRun(x, zeroD, cfg, material, plan = {}) {
  const configErrors=validate2DConfig(cfg);if(configErrors.length)return{errors:configErrors};
  const dt=plan.dt,steps=plan.steps;
  if(!finite(dt)||dt<=0) return {errors:["Time step must be greater than zero."]};
  if(!Number.isInteger(steps)||steps<1) return {errors:["Step count must be a positive integer."]};
  const g=geometry(x),mesh=build2DMesh(g,cfg),ambientK=x.ambientK;
  const startField=plan.startField;
  const startK=finite(plan.startK)?plan.startK:ambientK;
  const T=Array.from({length:mesh.nz},(_,j)=>Array.from({length:mesh.nr},(_,i)=>
    startField?startField[j][i]:startK));
  const Tprev=Array.from({length:mesh.nz},()=>new Array(mesh.nr).fill(0));
  const sourceScale=typeof plan.sourceScale==="function"?plan.sourceScale:()=>1;
  const picardMax=plan.picardMax??20,picardTol=plan.picardTol??(finite(cfg.tolerance)?cfg.tolerance:1e-4);
  const record=Math.max(1,plan.record??1);
  const elementAverage=()=>{let sum=0,vol=0;for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++)if(mesh.materialAt(i,j)===0){const v=mesh.cellVolume(i,j);sum+=T[j][i]*v;vol+=v;}return sum/vol;};
  const elementExtrema=()=>{let lo=Infinity,hi=-Infinity;for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++)if(mesh.materialAt(i,j)===0){lo=Math.min(lo,T[j][i]);hi=Math.max(hi,T[j][i]);}return[lo,hi];};
  let electrical=null;
  const porosity=porosityFactor2D(mesh,cfg);
  const withCurrentField=(point)=>{
    if(!cfg.currentField) return point;
    electrical=solveElectrical2D(T,material,mesh,point.current,point.pBulk,porosity);
    return {...point,qCell:electrical.qCell};
  };
  const scaleSource=(point,scale)=>{
    const scaled={...point,pBulk:point.pBulk*scale,pContact:point.pContact*scale,pTotal:point.pTotal*scale};
    if(point.qCell) scaled.qCell=point.qCell.map((q)=>q*scale);
    return scaled;
  };

  const history=[];
  const mid=mesh.activeStart+Math.floor(mesh.nActiveZ/2);
  let n=0,totalLinear=0,worstClosure=0,converged=true,electricalEnergy=0;
  let op=withCurrentField(operating2DAt(elementAverage(),x,g,cfg,material));

  const advance=(batch=1)=>{
    const limit=Math.min(steps,n+Math.max(1,batch|0));
    for(;n<limit;n++){
      const t=(n+1)*dt;
      for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++)Tprev[j][i]=T[j][i];
      const scale=Math.max(0,sourceScale(t));
      let pass=0,step=Infinity;
      for(pass=0;pass<picardMax&&step>picardTol;pass++){
        op=scaleSource(withCurrentField(operating2DAt(elementAverage(),x,g,cfg,material)),scale);
        const system=assemble2DSystem(T,x,g,cfg,material,mesh,op,{dt,Tprev});
        const linear=bicgstab2D(system,Float64Array.from(T.flat()));
        totalLinear+=linear.iterations;
        step=0;
        for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++){
          const old=T[j][i],solved=clamp(linear.x[j*mesh.nr+i],1,6000);
          T[j][i]=solved;step=Math.max(step,Math.abs(solved-old));
        }
      }
      if(step>picardTol)converged=false;
      const loss=boundaryLoss2D(T,x,g,cfg,material,mesh,op);
      const storageRate=storageRate2D(T,Tprev,cfg,material,mesh,dt);
      // The transient balance carries a term the steady one does not: what the
      // domain absorbed. It is normalised against the largest term present, not
      // against P_bulk: a duty-cycled drive spends most of its period with
      // P_bulk exactly zero, and dividing the residual by that would report an
      // arbitrarily large closure for a step that is in fact balanced to
      // round-off between loss and storage.
      const scaleW=Math.max(op.pBulk,Math.abs(loss.total),Math.abs(storageRate),1e-12);
      const closure=Math.abs(op.pBulk-loss.total-storageRate)/scaleW;
      worstClosure=Math.max(worstClosure,closure);
      electricalEnergy+=op.pBulk*dt;
      if(n%record===0||n===steps-1){
        const[tMin,tMax]=elementExtrema();
        history.push({t,avgK:elementAverage(),tMin,tMax,center:T[mid][0],
          wallOuter:T[mid][mesh.nElement+mesh.nGap+mesh.nWall-1],
          pBulk:op.pBulk,boundaryLoss:loss.total,storageRate,closure,passes:pass});
      }
    }
    return n>=steps;
  };

  const result=()=>{
    const[tMin,tMax]=elementExtrema();
    return{errors:[],x,zeroD,cfg,material,g,mesh,T,op,history,electrical,porosity,
      dt,steps,stepsDone:n,tEnd:n*dt,avgK:elementAverage(),tMin,tMax,deltaT:tMax-tMin,
      center:T[mid][0],wallOuter:T[mid][mesh.nElement+mesh.nGap+mesh.nWall-1],
      storedEnergy:internalEnergy2D(T,cfg,material,mesh,ambientK),
      electricalEnergy,linearIterations:totalLinear,worstClosure,converged};
  };

  return {errors:[],mesh,g,history,advance,result,
    get done(){return n>=steps;},get stepsDone(){return n;},get T(){return T;}};
}

// Run a transient to completion in one call. Everything of substance is in
// createTransientRun; this is the batch entry point the tests and the
// verification tools use.
export function solveTransient2D(x, zeroD, cfg, material, plan = {}) {
  const run=createTransientRun(x,zeroD,cfg,material,plan);
  if(run.errors&&run.errors.length) return {errors:run.errors};
  while(!run.advance(64));
  return run.result();
}

export function solveThermal2D(x, zeroD, cfg, material) {
  const configErrors=validate2DConfig(cfg);if(configErrors.length)return{errors:configErrors};
  const g=geometry(x),mesh=build2DMesh(g,cfg),ambientK=x.ambientK;
  const seedK=finite(zeroD.tss)?clamp(zeroD.tss,ambientK,3500):clamp(x.targetK,ambientK,2500);
  const T=Array.from({length:mesh.nz},(_,j)=>Array.from({length:mesh.nr},(_,i)=>{const code=mesh.materialAt(i,j);return ambientK+(code===0?0.65:code===1?0.25:code===2?0.10:code===4?0.08:0)*(seedK-ambientK);}));
  const elementAverage=()=>{let sum=0,vol=0;for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++)if(mesh.materialAt(i,j)===0){const v=mesh.cellVolume(i,j);sum+=T[j][i]*v;vol+=v;}return sum/vol;};
  // cfg.currentField replaces the uniform Joule source with the dissipation of
  // a solved potential field. Off by default, so the page's numbers only change
  // once it is switched on.
  let electrical=null;
  const porosity=porosityFactor2D(mesh,cfg);
  const withCurrentField=(point)=>{
    if(!cfg.currentField) return point;
    electrical=solveElectrical2D(T,material,mesh,point.current,point.pBulk,porosity);
    return {...point,qCell:electrical.qCell};
  };
  let maxStep=Infinity,outer=0,totalLinear=0,linearResidual=Infinity,op=withCurrentField(operating2DAt(ambientK,x,g,cfg,material));
  let relaxation=0.62,stallStreak=0;
  for(outer=0;outer<cfg.maxIter&&maxStep>cfg.tolerance;outer++){
    op=withCurrentField(operating2DAt(elementAverage(),x,g,cfg,material));
    const system=assemble2DSystem(T,x,g,cfg,material,mesh,op),initial=Float64Array.from(T.flat()),linear=bicgstab2D(system,initial);
    totalLinear+=linear.iterations;linearResidual=linear.relativeResidual;
    const stepBefore=maxStep;
    maxStep=0;
    for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++){
      const old=T[j][i],solved=clamp(linear.x[j*mesh.nr+i],1,6000),updated=old+relaxation*(solved-old);
      // Measure the *un-relaxed* Picard step. Using |updated - old| instead
      // folds the relaxation factor into the convergence test, so a case the
      // stall detector damps to 0.08 stops with a true step 12.5x the stated
      // tolerance while still reporting converged. Since the damping is path
      // dependent, two grids then stop at two different accuracies, which shows
      // up as a Richardson order that is not merely low but negative.
      T[j][i]=updated;maxStep=Math.max(maxStep,Math.abs(solved-old));
    }
    // A fixed 0.62/0.86 relaxation schedule can settle into a period-2 limit cycle on
    // very stiff cases (extreme element L/D with strongly radiative boundaries): the
    // step size stops shrinking but never falls below tolerance. Detect stagnation and
    // damp harder; well-behaved cases never trigger this, since maxStep keeps shrinking.
    if(outer>=4){
      stallStreak=maxStep>stepBefore*0.9?stallStreak+1:0;
      if(stallStreak>=2){relaxation=Math.max(0.08,relaxation*0.6);stallStreak=0;}
      else if(outer===4)relaxation=0.86;
    }
  }
  const avgK=elementAverage();op=withCurrentField(operating2DAt(avgK,x,g,cfg,material));
  const element=[];for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++)if(mesh.materialAt(i,j)===0)element.push(T[j][i]);
  const tMin=Math.min(...element),tMax=Math.max(...element),mid=mesh.activeStart+Math.floor(mesh.nActiveZ/2),bottomRow=mesh.activeStart,topRow=mesh.activeEnd-1,loss=boundaryLoss2D(T,x,g,cfg,material,mesh,op),boundaryLoss=loss.total;
  const closure=Math.abs(op.pBulk-boundaryLoss)/Math.max(op.pBulk,1e-12),representedVolumeError=Math.abs(mesh.elementVolume-g.envelopeVolume)/g.envelopeVolume;
  const heCoolingUpper=Math.max(0,HE_CAPACITY_RATE*(avgK-x.gasK));
  return{errors:[],x,zeroD,cfg,material,g,mesh,T,op,avgK,tMin,tMax,deltaT:tMax-tMin,center:T[mid][0],side:T[mid][mesh.nElement-1],bottom:T[bottomRow][0],top:T[topRow][0],wallInner:T[mid][mesh.nElement+mesh.nGap],wallOuter:T[mid][mesh.nElement+mesh.nGap+mesh.nWall-1],boundaryLoss,staticBoundaryLoss:loss.staticLoss,lossByChannel:loss.byChannel,closure,representedVolumeError,heCapacityRate:HE_CAPACITY_RATE,heCooling:loss.gasAdvective,heCoolingUpper,heOutletK:loss.gasOutletK,heFlowConnected:loss.flowConnected,iterations:outer,linearIterations:totalLinear,linearResidual,residual:maxStep,converged:maxStep<=cfg.tolerance,targetReached:avgK>=x.targetK,qVol:op.pBulk/g.envelopeVolume,electrical,porosity};
}
