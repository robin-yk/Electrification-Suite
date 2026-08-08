// Joule heating numeric core: material properties, 0D lumped model, and the
// 2D axisymmetric FVM thermal solver behind joule.html. Pure functions of
// plain input objects — no DOM access — so this module can be imported
// directly by joule.html (as an ES module) or by a Node test runner.
"use strict";

export const SIGMA_SB = 5.670374419e-8;
export const HE_FLOW_SCCM = 50;
export const HE_CP_MOLAR = 20.786;
export const MOLAR_VOLUME_STP = 0.022414;
export const HE_CAPACITY_RATE = HE_FLOW_SCCM * 1e-6 / 60 / MOLAR_VOLUME_STP * HE_CP_MOLAR;
export const OUTSIDE_AIR_K = 0.026;

export const T2D_WALLS = {
  quartz: { name:"Quartz", k:1.4, emissivity:0.93 },
  alumina: { name:"Alumina", k:22, emissivity:0.75 },
  stainless: { name:"Stainless steel", k:16, emissivity:0.70 },
  custom: { name:"Custom wall", k:1.4, emissivity:0.80 }
};

export const MATERIALS = [
  { name:"CFP", rhoOhmCm:0.05, density:452, cp:990, k:400, jmax:1e7, source:"Mittal et al. (2025), Table 1", model:"constant; anisotropy not represented" },
  { name:"SiC", rhoOhmCm:0.0555556, density:3210, cp:750, k:120, jmax:5e6, source:"Mittal et al. (2025), Table 1", model:"constant grade proxy" },
  { name:"MoSi₂", rhoOhmCm:2.5e-5, density:6500, cp:420, k:30, jmax:3e6, emissivity:0.78, rhoTable:[[20,2.5e-5],[200,7e-5],[600,1.5e-4],[1000,2.3e-4],[1400,3.0e-4],[1800,3.5e-4]], kTable:[[20,30],[600,30],[1200,15],[1800,15]], source:"Kanthal Super handbook", model:"digitized handbook curve" },
  { name:"Kanthal A-1 (FeCrAl)", rhoOhmCm:1.45e-4, density:7100, cp:460, k:11, jmax:1e7, emissivity:0.70, rhoFactor:[[20,1],[500,1.01],[800,1.03],[1000,1.04],[1400,1.05]], source:"Kanthal resistance materials handbook", model:"manufacturer Ct interpolation" },
  { name:"Nikrothal 80 (NiCr)", rhoOhmCm:1.09e-4, density:8300, cp:450, k:15, jmax:1e7, emissivity:0.88, rhoFactor:[[20,1],[400,1.03],[800,1.05],[1200,1.07]], source:"Kanthal resistance materials handbook", model:"manufacturer Ct interpolation" },
  { name:"Inconel 601", rhoOhmCm:1.18e-4, density:8110, cp:448, k:11.2, jmax:1e7, rhoTable:[[20,1.18e-4],[100,1.192e-4],[200,1.207e-4],[300,1.220e-4],[400,1.229e-4],[500,1.239e-4],[600,1.247e-4],[700,1.249e-4],[800,1.249e-4],[900,1.259e-4],[1000,1.262e-4]], cpTable:[[20,448],[100,469],[200,498],[300,523],[400,548],[500,578],[600,603],[700,632],[800,657],[900,686],[1000,712]], kTable:[[20,11.2],[100,12.7],[200,14.3],[300,16.0],[400,17.7],[500,19.5],[600,21.0],[700,22.8],[800,24.4],[900,26.1],[1000,27.8]], source:"Special Metals Inconel 601 bulletin, Table 3", model:"manufacturer table interpolation" },
  { name:"304 stainless steel", rhoOhmCm:7.2e-5, density:8000, cp:500, k:16.2, jmax:5e6, rhoAlpha:0.00094, source:"Mittal Table 1; standardized RT correction", model:"linear ρ(T); Cp,k constant" },
  { name:"Molybdenum", rhoOhmCm:5.34e-6, density:10220, cp:251, k:138, jmax:3e5, rhoAlpha:0.0046, source:"NIST resistivity compilation; Mittal Table 1", model:"linear ρ(T); Cp,k constant" },
  { name:"Tungsten", rhoOhmCm:5.60e-6, density:19300, cp:134, k:164, jmax:3e7, rhoAlpha:0.0045, source:"NIST resistivity compilation; Mittal Table 1", model:"linear ρ(T); Cp,k constant" },
  { name:"Copper", rhoOhmCm:1.68e-6, density:8960, cp:385, k:400, jmax:1e7, rhoAlpha:0.00393, source:"NIST recommended data", model:"linear ρ(T); Cp,k constant" },
  { name:"Aluminum", rhoOhmCm:2.65e-6, density:2700, cp:897, k:237, jmax:5e9, rhoAlpha:0.00429, source:"NIST recommended data", model:"linear ρ(T); Cp,k constant" },
  { name:"Titanium", rhoOhmCm:4.2e-5, density:4500, cp:523, k:17, jmax:4.5e6, rhoAlpha:0.0038, source:"Mittal Table 1; RT correction", model:"linear ρ(T); Cp,k constant" }
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
  const wallLossConductance=(wallK)=>outsideConduction+radiationCoefficient(wallK,x.ambientK,cfg.wallEmissivity)*wallOutsideArea+wallEndConductance;
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
  const current = Math.min(...Object.values(candidates));
  const tolerance = Math.max(1e-10, current * 1e-8);
  const constraint = Object.entries(candidates).filter(([,v]) => Math.abs(v-current) <= tolerance).map(([n]) => n).join(" + ");
  return { props, rhoE, resistance, candidates, constraint, current, voltage:current*resistance, power:current*current*resistance };
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
  const bi = hEffective * g.lc / target.props.k;
  const kcrit = hEffective * g.lc / x.biLimit;
  const uniform = bi <= x.biLimit;
  const maxMaterialRamp = m.jmax * m.jmax * rhoE / (m.density * target.props.cp);
  const maxField = m.jmax * rhoE;
  const voltageAtJmax = maxField * g.L;

  return {
    errors: [], g, rhoE, sigma, mass, resistance, candidates, constraint,
    operatingCurrent, voltage, power, specificPower, currentDensity,
    volumetricPowerMW, rampRate, tss, requiredPower, requiredVoltage,
    requiredCurrent, feasible, adiabaticTime, hEffective, bi, kcrit,
    uniform, maxMaterialRamp, maxField, voltageAtJmax,targetLoss,steadyLoss,
    powerUse: power / x.pmax, material: m, input: x, initial, target
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
  const nr=30,nz=60,radius=g.D/2,hasGap=cfg.gap>1e-12,outerRadius=radius+cfg.gap+cfg.wallThickness;
  const nAir=8,activeRadialCells=nr-nAir;
  const segments=[{key:"element",length:radius,min:8}];
  if(hasGap) segments.push({key:"gap",length:cfg.gap,min:1});
  segments.push({key:"wall",length:cfg.wallThickness,min:2});
  const counts=allocateSegmentCells(segments,activeRadialCells),byKey=Object.fromEntries(segments.map((segment,index)=>[segment.key,counts[index]]));
  const nElement=byKey.element,nGap=byKey.gap||0,nWall=byKey.wall,nAirZ=8,nActiveZ=nz-2*nAirZ;
  const domainRadius=outerRadius*nr/activeRadialCells,domainHeight=g.L*nz/nActiveZ,dz=domainHeight/nz;
  const edges=[0];
  const addSegment=(start,end,count)=>{for(let i=1;i<=count;i++)edges.push(start+(end-start)*i/count);};
  addSegment(0,radius,nElement);
  if(hasGap) addSegment(radius,radius+cfg.gap,nGap);
  addSegment(radius+cfg.gap,outerRadius,nWall);
  addSegment(outerRadius,domainRadius,nAir);
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
  if (code === 0) return Math.max(1e-6, propertiesAt(material,tempK).k);
  if (code === 1 || code === 4) return Math.max(1e-6, cfg.gapK);
  if (code === 2) return Math.max(1e-6, cfg.wallK);
  return OUTSIDE_AIR_K;
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
  const current = Math.max(0, Math.min(...Object.values(candidates)));
  const tolerance = Math.max(1e-10,current*1e-8);
  const constraint = Object.entries(candidates).filter(([,v]) => Math.abs(v-current)<=tolerance).map(([name])=>name).join(" + ");
  return {
    props, rhoE, rBulk, rContact, rTotal, candidates, current, constraint,
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

export function assemble2DSystem(T, x, g, cfg, material, mesh, op) {
  const count=mesh.nr*mesh.nz,diag=new Float64Array(count),rhs=new Float64Array(count),edges=[],directed=[],boundaryTerms=[];
  const idx=(i,j)=>j*mesh.nr+i;
  const axialArea=(i)=>Math.PI*(mesh.edges[i+1]*mesh.edges[i+1]-mesh.edges[i]*mesh.edges[i]);
  const qVol=op.pBulk/g.envelopeVolume;
  const addFace=(p,q,G)=>{diag[p]+=G;diag[q]+=G;edges.push([p,q,G]);};
  const addBoundary=(p,G,Tb)=>{if(G<=0)return;diag[p]+=G;rhs[p]+=G*Tb;boundaryTerms.push([p,G,Tb]);};
  const pairConductance=(area,d1,k1,d2,k2,code1,code2)=>{
    let resistance=d1/k1+d2/k2;
    const solidAir=(code1===3&&code2===2)||(code1===2&&code2===3);
    if(solidAir&&x.convection&&x.h>0)resistance+=1/x.h;
    return area/Math.max(resistance,1e-30);
  };
  const addInterfaceRadiation=(p,code,tempK,area)=>{
    if(code!==0&&code!==2)return;
    const emissivity=code===0?x.emissivity:cfg.wallEmissivity;
    addBoundary(p,radiationCoefficient(tempK,x.ambientK,emissivity)*area,x.ambientK);
  };
  for(let j=0;j<mesh.nz;j++) for(let i=0;i<mesh.nr;i++) {
    const p=idx(i,j),code=mesh.materialAt(i,j),kp=cellK2D(code,T[j][i],material,cfg,x);
    if(code===0) rhs[p]+=qVol*mesh.cellVolume(i,j);
    if(i<mesh.nr-1) {
      const q=idx(i+1,j),face=mesh.edges[i+1],area=2*Math.PI*face*(mesh.zEdges[j+1]-mesh.zEdges[j]),nextCode=mesh.materialAt(i+1,j),kn=cellK2D(nextCode,T[j][i+1],material,cfg,x);
      const G=pairConductance(area,face-mesh.centers[i],kp,mesh.centers[i+1]-face,kn,code,nextCode);
      addFace(p,q,G);
      if(code===3&&nextCode===2)addInterfaceRadiation(q,nextCode,T[j][i+1],area);
      if(code===2&&nextCode===3)addInterfaceRadiation(p,code,T[j][i],area);
    } else {
      const area=2*Math.PI*mesh.edges[mesh.nr]*(mesh.zEdges[j+1]-mesh.zEdges[j]);
      addBoundary(p,kp*area/Math.max(mesh.edges[mesh.nr]-mesh.centers[i],1e-30),x.ambientK);
    }
    if(j<mesh.nz-1) {
      const q=idx(i,j+1),area=axialArea(i),face=mesh.zEdges[j+1],nextCode=mesh.materialAt(i,j+1),kn=cellK2D(nextCode,T[j+1][i],material,cfg,x),elementGas=(code===0&&nextCode===4)||(code===4&&nextCode===0);
      if(elementGas&&cfg.endMode==="electrode") {
        const elementP=code===0?p:q;
        addBoundary(elementP,cfg.endH*area,cfg.endK);
      } else if(!(elementGas&&cfg.endMode==="adiabatic")) {
        const G=pairConductance(area,face-mesh.zCenters[j],kp,mesh.zCenters[j+1]-face,kn,code,nextCode);
        addFace(p,q,G);
        if(elementGas&&cfg.endMode==="ambient") {
          const elementP=code===0?p:q,elementTemp=code===0?T[j][i]:T[j+1][i];
          addInterfaceRadiation(elementP,0,elementTemp,area);
        }
        if(code===3&&(nextCode===0||nextCode===2))addInterfaceRadiation(q,nextCode,T[j+1][i],area);
        if((code===0||code===2)&&nextCode===3)addInterfaceRadiation(p,code,T[j][i],area);
      }
    }
    if(j===0) addBoundary(p,kp*axialArea(i)/Math.max(mesh.zCenters[j]-mesh.zEdges[j],1e-30),x.ambientK);
    if(j===mesh.nz-1) addBoundary(p,kp*axialArea(i)/Math.max(mesh.zEdges[j+1]-mesh.zCenters[j],1e-30),x.ambientK);
  }

  if(mesh.nGap>0) {
    const iElement=mesh.nElement-1,iWall=mesh.nElement+mesh.nGap,elementRadius=mesh.radius,wallRadius=mesh.edges[iWall],areaPerRow=2*Math.PI*elementRadius*mesh.dz;
    for(let j=mesh.activeStart;j<mesh.activeEnd;j++) {
      const p=idx(iElement,j),q=idx(iWall,j),hGapRad=gapRadiationCoefficient(T[j][iElement],T[j][iWall],x.emissivity,cfg.wallEmissivity,elementRadius,wallRadius);
      addFace(p,q,hGapRad*areaPerRow);
    }
  }

  const flowRows=Array.from({length:mesh.nz},(_,j)=>gasFlowCells2D(mesh,j));
  const flowConnected=flowRows.every(cells=>cells.length>0);
  if(flowConnected&&HE_CAPACITY_RATE>0) {
    for(let j=mesh.nz-1;j>=0;j--) {
      const cells=flowRows[j],areas=cells.map(axialArea),areaTotal=areas.reduce((sum,value)=>sum+value,0);
      const weights=areas.map(value=>value/Math.max(areaTotal,1e-30));
      for(let n=0;n<cells.length;n++) {
        const p=idx(cells[n],j),capacity=HE_CAPACITY_RATE*weights[n];
        diag[p]+=capacity;
        if(j===mesh.nz-1) rhs[p]+=capacity*x.gasK;
        else {
          const upstream=flowRows[j+1],upstreamAreas=upstream.map(axialArea),upstreamTotal=upstreamAreas.reduce((sum,value)=>sum+value,0);
          for(let m=0;m<upstream.length;m++)directed.push([p,idx(upstream[m],j+1),capacity*upstreamAreas[m]/Math.max(upstreamTotal,1e-30)]);
        }
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
  const staticLoss=system.boundaryTerms.reduce((loss,[p,G,Tb])=>loss+G*(flat[p]-Tb),0);
  const gasOutletK=system.gasFlow.connected?gasBulkRowTemperature2D(T,mesh,0):x.gasK;
  const gasAdvective=system.gasFlow.capacityRate*(gasOutletK-x.gasK);
  return {total:staticLoss+gasAdvective,staticLoss,gasAdvective,gasOutletK,flowConnected:system.gasFlow.connected};
}

export function solveThermal2D(x, zeroD, cfg, material) {
  const configErrors=validate2DConfig(cfg);if(configErrors.length)return{errors:configErrors};
  const g=geometry(x),mesh=build2DMesh(g,cfg),ambientK=x.ambientK;
  const seedK=finite(zeroD.tss)?clamp(zeroD.tss,ambientK,3500):clamp(x.targetK,ambientK,2500);
  const T=Array.from({length:mesh.nz},(_,j)=>Array.from({length:mesh.nr},(_,i)=>{const code=mesh.materialAt(i,j);return ambientK+(code===0?0.65:code===1?0.25:code===2?0.10:code===4?0.08:0)*(seedK-ambientK);}));
  const elementAverage=()=>{let sum=0,vol=0;for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++)if(mesh.materialAt(i,j)===0){const v=mesh.cellVolume(i,j);sum+=T[j][i]*v;vol+=v;}return sum/vol;};
  let maxStep=Infinity,outer=0,totalLinear=0,linearResidual=Infinity,op=operating2DAt(ambientK,x,g,cfg,material);
  let relaxation=0.62,stallStreak=0;
  for(outer=0;outer<cfg.maxIter&&maxStep>cfg.tolerance;outer++){
    op=operating2DAt(elementAverage(),x,g,cfg,material);
    const system=assemble2DSystem(T,x,g,cfg,material,mesh,op),initial=Float64Array.from(T.flat()),linear=bicgstab2D(system,initial);
    totalLinear+=linear.iterations;linearResidual=linear.relativeResidual;
    const stepBefore=maxStep;
    maxStep=0;
    for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++){
      const old=T[j][i],solved=clamp(linear.x[j*mesh.nr+i],1,6000),updated=old+relaxation*(solved-old);
      T[j][i]=updated;maxStep=Math.max(maxStep,Math.abs(updated-old));
    }
    // A fixed 0.62/0.86 relaxation schedule can settle into a period-2 limit cycle on
    // very stiff cases (extreme element L/D with strongly radiative boundaries): the
    // step size stops shrinking but never falls below tolerance. Detect stagnation and
    // damp harder — well-behaved cases never trigger this, since maxStep keeps shrinking.
    if(outer>=4){
      stallStreak=maxStep>stepBefore*0.9?stallStreak+1:0;
      if(stallStreak>=2){relaxation=Math.max(0.08,relaxation*0.6);stallStreak=0;}
      else if(outer===4)relaxation=0.86;
    }
  }
  const avgK=elementAverage();op=operating2DAt(avgK,x,g,cfg,material);
  const element=[];for(let j=0;j<mesh.nz;j++)for(let i=0;i<mesh.nr;i++)if(mesh.materialAt(i,j)===0)element.push(T[j][i]);
  const tMin=Math.min(...element),tMax=Math.max(...element),mid=mesh.activeStart+Math.floor(mesh.nActiveZ/2),bottomRow=mesh.activeStart,topRow=mesh.activeEnd-1,loss=boundaryLoss2D(T,x,g,cfg,material,mesh,op),boundaryLoss=loss.total;
  const closure=Math.abs(op.pBulk-boundaryLoss)/Math.max(op.pBulk,1e-12),representedVolumeError=Math.abs(mesh.elementVolume-g.envelopeVolume)/g.envelopeVolume;
  const heCoolingUpper=Math.max(0,HE_CAPACITY_RATE*(avgK-x.gasK));
  return{errors:[],x,zeroD,cfg,material,g,mesh,T,op,avgK,tMin,tMax,deltaT:tMax-tMin,center:T[mid][0],side:T[mid][mesh.nElement-1],bottom:T[bottomRow][0],top:T[topRow][0],wallInner:T[mid][mesh.nElement+mesh.nGap],wallOuter:T[mid][mesh.nElement+mesh.nGap+mesh.nWall-1],boundaryLoss,staticBoundaryLoss:loss.staticLoss,closure,representedVolumeError,heCapacityRate:HE_CAPACITY_RATE,heCooling:loss.gasAdvective,heCoolingUpper,heOutletK:loss.gasOutletK,heFlowConnected:loss.flowConnected,iterations:outer,linearIterations:totalLinear,linearResidual,residual:maxStep,converged:maxStep<=cfg.tolerance,targetReached:avgK>=x.targetK,qVol:op.pBulk/g.envelopeVolume};
}
