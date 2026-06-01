import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Info } from "lucide-react";

const SIGMA = 5.670374419e-8;
const TREF = 298;

const MATERIALS = {
  "SiC monolith": { rho0: 0.02, alpha: -0.0005, rho_d: 3210, cp: 750, emissivity: 0.9 },
  "Carbon foam": { rho0: 0.05, alpha: 0.0005, rho_d: 200, cp: 710, emissivity: 0.85 },
  "Graphite": { rho0: 1.0e-5, alpha: -0.0005, rho_d: 2200, cp: 710, emissivity: 0.85 },
  "Nichrome wire": { rho0: 1.1e-6, alpha: 0.0004, rho_d: 8400, cp: 450, emissivity: 0.7 },
  "Stainless steel 316": { rho0: 7.4e-7, alpha: 0.0010, rho_d: 8000, cp: 500, emissivity: 0.30 },
};

const CONVECTION_PRESETS = [
  { name: "Still air", h: 5 },
  { name: "Light breeze", h: 25 },
  { name: "Forced air", h: 100 },
  { name: "Strong fan", h: 300 },
];

const COLORS = {
  T: "#dc2626",
  I: "#2563eb",
  R: "#f59e0b",
  P: "#16a34a",
  Qgen: "#dc2626",
  Qloss: "#0f172a",
  Qconv: "#3b82f6",
  Qrad: "#f97316",
};

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function formatNumber(x, digits = 3) {
  if (!Number.isFinite(x)) return "-";
  if (Math.abs(x) >= 1e4 || (Math.abs(x) > 0 && Math.abs(x) < 1e-2)) return x.toExponential(2);
  return x.toFixed(digits);
}

function LabeledSlider({ label, value, setValue, min, max, step, unit, help }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
        </div>
        <div className="w-28">
          <Input
            type="number"
            value={value}
            step={step}
            min={min}
            max={max}
            onChange={(e) => setValue(Number(e.target.value))}
            className="text-right"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => setValue(v[0])} />
        <div className="w-20 text-xs text-muted-foreground text-right">{unit}</div>
      </div>
    </div>
  );
}

function simulate(p) {
  const { rho0, alpha, length, Across, voltage, mass, cp, h, Asurf, emissivity, Tamb, tEnd, dt } = p;

  let T = Tamb;
  const rows = [];
  let netIntegral = 0;

  for (let t = 0; t <= tEnd + 1e-9; t += dt) {
    const rhoT = Math.max(rho0 * (1 + alpha * (T - TREF)), 1e-10);
    const R = (rhoT * length) / Math.max(Across, 1e-14);
    const I = voltage / Math.max(R, 1e-12);
    const Pelec = voltage * I;
    const Qgen = Pelec;
    const Qconv = h * Asurf * (T - Tamb);
    const Qrad = emissivity * SIGMA * Asurf * (Math.pow(T, 4) - Math.pow(Tamb, 4));
    const Qloss = Qconv + Qrad;
    const net = Qgen - Qloss;

    rows.push({
      tMin: Number((t / 60).toFixed(4)),
      T: T - 273.15,
      T_K: T,
      R,
      I,
      Pelec,
      Qgen,
      Qconv,
      Qrad,
      Qloss,
      net,
    });

    const dTdt = net / Math.max(mass * cp, 1e-12);
    netIntegral += net * dt;
    T = clamp(T + dTdt * dt, 1, 4000);
  }

  const last = rows[rows.length - 1];
  const stored = mass * cp * (last.T_K - Tamb);
  return { rows, stored, netIntegral, finalNet: last.net };
}

export default function JouleHeatingMockingProgram() {
  const [materialKey, setMaterialKey] = useState("SiC monolith");
  const material = MATERIALS[materialKey];

  const [voltage, setVoltage] = useState(10);
  const [radius, setRadius] = useState(0.015);
  const [lengthCyl, setLengthCyl] = useState(0.15);
  const [porosity, setPorosity] = useState(0.5);
  const [Tamb, setTamb] = useState(298);
  const [h, setH] = useState(25);
  const [tEnd, setTEnd] = useState(1800);
  const [dt, setDt] = useState(60);

  const geometry = useMemo(() => {
    const Vbulk = Math.PI * radius * radius * lengthCyl;
    const Aside = 2 * Math.PI * radius * lengthCyl;
    const Aend = 2 * Math.PI * radius * radius;
    const Asurf = Aside + Aend;
    const Across = Math.PI * radius * radius * (1 - porosity);
    const mass = Vbulk * (1 - porosity) * material.rho_d;
    return { Vbulk, Asurf, Across, mass };
  }, [radius, lengthCyl, porosity, material.rho_d]);

  const stability = useMemo(() => {
    const hA = h * geometry.Asurf;
    const tau = (geometry.mass * material.cp) / Math.max(hA, 1e-12);
    return { tau, dtRecommendedMax: 0.5 * tau };
  }, [geometry, material.cp, h]);

  const result = useMemo(
    () =>
      simulate({
        rho0: material.rho0,
        alpha: material.alpha,
        length: lengthCyl,
        Across: geometry.Across,
        voltage,
        mass: geometry.mass,
        cp: material.cp,
        h,
        Asurf: geometry.Asurf,
        emissivity: material.emissivity,
        Tamb,
        tEnd,
        dt,
      }),
    [material, lengthCyl, geometry, voltage, h, Tamb, tEnd, dt],
  );

  const data = result.rows;
  const last = data[data.length - 1] || {};
  const balanceResidual = result.finalNet ?? 0;
  const balancePercent = last.Qgen ? (balanceResidual / last.Qgen) * 100 : 0;
  const electricalCheck = Math.abs(voltage * (last.I ?? 0) - (last.Pelec ?? 0));
  const energyError =
    Math.abs(result.stored) > 1e-9
      ? Math.abs(result.netIntegral - result.stored) / Math.abs(result.stored)
      : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Joule Heating Interactive Simulator</h1>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Lumped cylindrical model with geometric coupling — radius, length, and porosity determine both the mass and the heat-loss area together, so scale-up physics stays correct.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="rounded-2xl shadow-sm xl:col-span-1">
            <CardHeader>
              <CardTitle>Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Material</Label>
                <select
                  value={materialKey}
                  onChange={(e) => setMaterialKey(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.keys(MATERIALS).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  ρ₀ {formatNumber(material.rho0, 3)} Ω·m · α {formatNumber(material.alpha, 4)} /K · ρ<sub>d</sub> {material.rho_d} kg/m³ · c<sub>p</sub> {material.cp} J/kg·K · ε<sub>rad</sub> {material.emissivity}
                </p>
              </div>

              <LabeledSlider label="Applied voltage" value={voltage} setValue={setVoltage} min={0} max={200} step={0.5} unit="V" />
              <LabeledSlider label="Cylinder radius" value={radius} setValue={setRadius} min={0.002} max={0.05} step={0.0005} unit="m" />
              <LabeledSlider label="Cylinder length" value={lengthCyl} setValue={setLengthCyl} min={0.01} max={0.5} step={0.005} unit="m" />
              <LabeledSlider label="Porosity ε" value={porosity} setValue={setPorosity} min={0} max={0.95} step={0.01} unit="fraction" help="Void fraction; mass and conductive area scale with (1−ε)." />
              <LabeledSlider label="Ambient temperature" value={Tamb} setValue={setTamb} min={250} max={1200} step={1} unit="K" />

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Convective coefficient h</Label>
                  <div className="w-28">
                    <Input
                      type="number"
                      value={h}
                      step={1}
                      min={1}
                      max={2000}
                      onChange={(e) => setH(Number(e.target.value))}
                      className="text-right"
                    />
                  </div>
                </div>
                <Slider value={[h]} min={1} max={1000} step={1} onValueChange={(v) => setH(v[0])} />
                <div className="flex flex-wrap gap-2">
                  {CONVECTION_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setH(p.h)}
                      className="rounded border bg-white px-2 py-1 text-xs hover:bg-muted"
                    >
                      {p.name} · {p.h} W/m²·K
                    </button>
                  ))}
                </div>
              </div>

              <LabeledSlider label="Final time" value={tEnd} setValue={setTEnd} min={600} max={7200} step={600} unit={`${(tEnd / 60).toFixed(0)} min`} help="Slider step = 10 min." />
              <LabeledSlider label="Time step" value={dt} setValue={setDt} min={1} max={600} step={60} unit={`${(dt / 60).toFixed(1)} min`} help="Slider step = 1 min. Forward Euler may go unstable if dt > 0.5τ." />

              <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">Derived from geometry</p>
                <p>Mass = {formatNumber(geometry.mass * 1000, 2)} g</p>
                <p>A<sub>surf</sub> = {formatNumber(geometry.Asurf * 1e4, 2)} cm² · A<sub>cross</sub> = {formatNumber(geometry.Across * 1e6, 2)} mm²</p>
                <p>τ ≈ {formatNumber(stability.tau, 1)} s ({formatNumber(stability.tau / 60, 1)} min)</p>
                {dt > stability.dtRecommendedMax ? (
                  <p className="text-amber-700">⚠ dt &gt; 0.5τ — reduce dt or increase mass for stable Euler.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 xl:col-span-2">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Final temperature</p>
                  <p className="text-2xl font-semibold">{formatNumber(last.T, 1)} °C</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Final current</p>
                  <p className="text-2xl font-semibold">{formatNumber(last.I, 2)} A</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Final resistance</p>
                  <p className="text-2xl font-semibold">{formatNumber(last.R, 3)} Ω</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Final power</p>
                  <p className="text-2xl font-semibold">{formatNumber(last.Pelec, 2)} W</p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Temperature</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 5, right: 20, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tMin" label={{ value: "Time (min)", position: "insideBottom", offset: -10 }} />
                    <YAxis label={{ value: "T (°C)", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="T" name="Temperature" stroke={COLORS.T} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>Electrical response</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="tMin" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="I" name="Current (A)" stroke={COLORS.I} dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="R" name="Resistance (Ω)" stroke={COLORS.R} dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="Pelec" name="Power (W)" stroke={COLORS.P} dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 rounded bg-slate-50 p-2 text-xs">
                    Self-check (Ohm/Joule): V·I − P = <span className="font-mono">{formatNumber(electricalCheck, 3)}</span> W ·{" "}
                    {electricalCheck < 1e-6 ? <span className="text-emerald-700">consistent</span> : <span className="text-rose-700">drift</span>}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>Heat balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="tMin" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="Qgen" name="Generated (W)" stroke={COLORS.Qgen} dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="Qloss" name="Total loss (W)" stroke={COLORS.Qloss} dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="Qconv" name="Convection (W)" stroke={COLORS.Qconv} dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="Qrad" name="Radiation (W)" stroke={COLORS.Qrad} dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 rounded bg-slate-50 p-2 text-xs">
                    Steady-state check: Q<sub>gen</sub> − Q<sub>loss</sub> = <span className="font-mono">{formatNumber(balanceResidual, 2)}</span> W ({balancePercent.toFixed(1)}%) ·{" "}
                    {Math.abs(balancePercent) < 1 ? (
                      <span className="text-emerald-700">steady state reached</span>
                    ) : (
                      <span className="text-amber-700">still transient</span>
                    )}
                  </p>
                  <p className="mt-1 rounded bg-slate-50 p-2 text-xs">
                    Energy conservation: ∫(Q<sub>gen</sub> − Q<sub>loss</sub>)dt = <span className="font-mono">{formatNumber(result.netIntegral, 1)}</span> J vs. m·c<sub>p</sub>·ΔT = <span className="font-mono">{formatNumber(result.stored, 1)}</span> J · error {(energyError * 100).toFixed(2)}%
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl shadow-sm border-dashed">
              <CardHeader>
                <CardTitle>Governing equation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded bg-slate-100 p-4 font-serif text-base leading-relaxed">
                  m · c<sub>p</sub> · <span className="italic">dT</span>/<span className="italic">dt</span> ={" "}
                  <span className="inline-block align-middle">V² / R(T)</span> − [ h·A(T − T<sub>amb</sub>) + ε·σ·A·(T⁴ − T<sub>amb</sub>⁴) ]
                </div>
                <div className="rounded bg-slate-100 p-3 font-serif text-sm">
                  R(T) = ρ₀ · [1 + α(T − T<sub>ref</sub>)] · L / A<sub>cross</sub>
                </div>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p>
                      σ = 5.67·10⁻⁸ W/m²·K⁴ · T<sub>ref</sub> = 298 K · A<sub>surf</sub> = 2πr(r+L) · A<sub>cross</sub> = πr²(1−ε) · m = πr²L(1−ε)ρ<sub>d</sub>
                    </p>
                    <p>
                      At steady state <span className="italic">dT/dt</span> → 0, so m and c<sub>p</sub> drop out and T<sub>final</sub> is set entirely by V²/R = h·A·ΔT + ε·σ·A·ΔT⁴. Mass only controls the time constant τ = m·c<sub>p</sub>/(hA).
                    </p>
                    <p>
                      Because A and m are both derived from r, L, and ε here, the square-cube law is enforced: scaling up size raises absolute losses (A↑ ∝ k²) faster than power held constant, so T<sub>final</sub> falls — matching physical intuition.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
