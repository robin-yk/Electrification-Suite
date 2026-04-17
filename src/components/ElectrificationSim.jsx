import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Info } from "lucide-react";

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
        <div className="w-16 text-xs text-muted-foreground text-right">{unit}</div>
      </div>
    </div>
  );
}

function simulate(params) {
  const {
    rho0,
    alpha,
    Tref,
    length,
    area,
    porosityFactor,
    voltage,
    thermalEfficiency,
    mass,
    cp,
    hA,
    emissivityA,
    kCond,
    Tamb,
    tEnd,
    dt,
  } = params;

  const sigma = 5.670374419e-8;
  const Aeff = Math.max(area * porosityFactor, 1e-12);

  let T = Tamb;
  const rows = [];

  for (let t = 0; t <= tEnd + 1e-12; t += dt) {
    const rhoT = Math.max(rho0 * (1 + alpha * (T - Tref)), 1e-10);
    const R = rhoT * length / Aeff;
    const I = voltage / Math.max(R, 1e-12);
    const Pelec = voltage * I;
    const Qgen = Pelec * thermalEfficiency;

    const Qconv = hA * (T - Tamb);
    const Qrad = emissivityA * sigma * (Math.pow(T, 4) - Math.pow(Tamb, 4));
    const Qcond = kCond * (T - Tamb);
    const Qloss = Qconv + Qrad + Qcond;

    rows.push({
      t: Number(t.toFixed(3)),
      T: T - 273.15,
      T_K: T,
      rho: rhoT,
      R,
      I,
      Pelec,
      Qgen,
      Qconv,
      Qrad,
      Qcond,
      Qloss,
      net: Qgen - Qloss,
    });

    const dTdt = (Qgen - Qloss) / Math.max(mass * cp, 1e-9);
    T = T + dTdt * dt;
    T = clamp(T, 1, 4000);
  }

  return { rows };
}

export default function JouleHeatingMockingProgram() {
  const [rho0, setRho0] = useState(0.02);
  const [alpha, setAlpha] = useState(0.001);
  const [Tref, setTref] = useState(298);
  const [length, setLength] = useState(0.05);
  const [area, setArea] = useState(1.0e-4);
  const [porosityFactor, setPorosityFactor] = useState(0.4);
  const [voltage, setVoltage] = useState(10);
  const [thermalEfficiency, setThermalEfficiency] = useState(0.85);
  const [mass, setMass] = useState(0.02);
  const [cp, setCp] = useState(800);
  const [hA, setHA] = useState(0.12);
  const [emissivityA, setEmissivityA] = useState(2.0e-9);
  const [kCond, setKCond] = useState(0.05);
  const [Tamb, setTamb] = useState(298);
  const [tEnd, setTEnd] = useState(120);
  const [dt, setDt] = useState(0.2);

  const params = useMemo(() => ({
    rho0,
    alpha,
    Tref,
    length,
    area,
    porosityFactor,
    voltage,
    thermalEfficiency,
    mass,
    cp,
    hA,
    emissivityA,
    kCond,
    Tamb,
    tEnd,
    dt,
  }), [
    rho0,
    alpha,
    Tref,
    length,
    area,
    porosityFactor,
    voltage,
    thermalEfficiency,
    mass,
    cp,
    hA,
    emissivityA,
    kCond,
    Tamb,
    tEnd,
    dt,
  ]);

  const geometry = useMemo(() => {
    const Aeff = Math.max(area * porosityFactor, 1e-12);
    return { Aeff, volume: length * Aeff };
  }, [length, area, porosityFactor]);

  const stability = useMemo(() => {
    const tau = (mass * cp) / Math.max(hA + kCond, 1e-12);
    return { tau, dtRecommendedMax: 0.5 * tau };
  }, [mass, cp, hA, kCond]);

  const result = useMemo(() => simulate(params), [params]);

  const data = result.rows;
  const last = data[data.length - 1] || {};

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Joule Heating Interactive Mocking Program</h1>
          <p className="text-sm text-muted-foreground max-w-4xl">
            Simple lumped model for structured materials or monoliths. Electrical input is converted to heat, then balanced against convective, radiative, and conductive losses. Temperature-dependent resistivity is included through a linear coefficient.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-1 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs defaultValue="electrical" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="electrical">Electrical</TabsTrigger>
                  <TabsTrigger value="thermal">Thermal</TabsTrigger>
                  <TabsTrigger value="geometry">Geometry</TabsTrigger>
                </TabsList>

                <TabsContent value="electrical" className="mt-4 space-y-4">
                  <LabeledSlider label="Resistivity at Tref" value={rho0} setValue={setRho0} min={1e-4} max={0.2} step={1e-4} unit="ohm m" help="Base resistivity at the reference temperature." />
                  <LabeledSlider label="Temperature coefficient alpha" value={alpha} setValue={setAlpha} min={-0.005} max={0.01} step={0.0001} unit="1/K" help="Linear temperature dependence: rho(T)=rho0[1+alpha(T-Tref)]." />
                  <LabeledSlider label="Reference temperature" value={Tref} setValue={setTref} min={250} max={1000} step={1} unit="K" />
                  <LabeledSlider label="Applied voltage" value={voltage} setValue={setVoltage} min={0} max={200} step={0.5} unit="V" />
                  <LabeledSlider label="Thermal efficiency" value={thermalEfficiency} setValue={setThermalEfficiency} min={0} max={1} step={0.01} unit="fraction" help="Fraction of electrical power that becomes useful heating in the solid." />
                </TabsContent>

                <TabsContent value="thermal" className="mt-4 space-y-4">
                  <LabeledSlider label="Mass" value={mass} setValue={setMass} min={0.001} max={1} step={0.001} unit="kg" />
                  <LabeledSlider label="Heat capacity" value={cp} setValue={setCp} min={50} max={2000} step={10} unit="J/kg/K" />
                  <LabeledSlider label="Convective lump hA" value={hA} setValue={setHA} min={0} max={5} step={0.01} unit="W/K" help="Combined convection coefficient times surface area." />
                  <LabeledSlider label="Radiative lump epsilon*sigma*A" value={emissivityA} setValue={setEmissivityA} min={0} max={5e-8} step={1e-10} unit="W/K^4" help="Use epsilon*sigma*A as a single fitted term." />
                  <LabeledSlider label="Conductive lump" value={kCond} setValue={setKCond} min={0} max={5} step={0.01} unit="W/K" help="Simple linear conduction loss to surroundings." />
                  <LabeledSlider label="Ambient temperature" value={Tamb} setValue={setTamb} min={200} max={1200} step={1} unit="K" />
                </TabsContent>

                <TabsContent value="geometry" className="mt-4 space-y-4">
                  <LabeledSlider label="Length" value={length} setValue={setLength} min={0.001} max={0.5} step={0.001} unit="m" />
                  <LabeledSlider label="Nominal cross-sectional area" value={area} setValue={setArea} min={1e-6} max={5e-3} step={1e-6} unit="m^2" help="For porous monoliths, this can be corrected with the factor below." />
                  <LabeledSlider label="Effective area factor" value={porosityFactor} setValue={setPorosityFactor} min={0.01} max={1.5} step={0.01} unit="fraction" help="Represents conductive fraction, tortuosity correction, or effective solid area." />
                  <LabeledSlider label="Final time" value={tEnd} setValue={setTEnd} min={1} max={1000} step={1} unit="s" />
                  <LabeledSlider label="Time step" value={dt} setValue={setDt} min={0.01} max={2} step={0.01} unit="s" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="xl:col-span-2 space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card className="rounded-2xl shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Final temperature</p><p className="text-2xl font-semibold">{formatNumber(last.T, 1)} °C</p></CardContent></Card>
              {dt > stability.dtRecommendedMax ? (
              <Card className="rounded-2xl border-amber-300 bg-amber-50 shadow-sm">
                <CardContent className="p-4 text-sm text-amber-900">
                  <p className="font-medium">Numerical stability warning</p>
                  <p>
                    The current time step may be too large for a forward Euler update. A rough guideline is dt &lt; 0.5τ, where τ ≈ {formatNumber(stability.tau, 2)} s for the present thermal parameters.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-2xl shadow-sm border-dashed"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Estimated thermal time constant</p><p className="text-2xl font-semibold">{formatNumber(stability.tau, 2)} s</p></CardContent></Card>
              <Card className="rounded-2xl shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Final current</p><p className="text-2xl font-semibold">{formatNumber(last.I, 2)} A</p></CardContent></Card>
              <Card className="rounded-2xl shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Final resistance</p><p className="text-2xl font-semibold">{formatNumber(last.R, 3)} Ω</p></CardContent></Card>
              <Card className="rounded-2xl shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Effective volume</p><p className="text-2xl font-semibold">{formatNumber(geometry.volume * 1e6, 2)} cm³</p></CardContent></Card>
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>Temperature rise</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="t" label={{ value: "Time (s)", position: "insideBottom", offset: -5 }} />
                    <YAxis label={{ value: "Temperature (°C)", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="T" dot={false} name="Temperature" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>Electrical response</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="I" dot={false} name="Current (A)" strokeWidth={2} />
                      <Line type="monotone" dataKey="R" dot={false} name="Resistance (Ω)" strokeWidth={2} />
                      <Line type="monotone" dataKey="Pelec" dot={false} name="Electrical Power (W)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>Heat balance</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Qgen" dot={false} name="Generated heat (W)" strokeWidth={2} />
                      <Line type="monotone" dataKey="Qloss" dot={false} name="Total loss (W)" strokeWidth={2} />
                      <Line type="monotone" dataKey="Qconv" dot={false} name="Convective loss (W)" strokeWidth={2} />
                      <Line type="monotone" dataKey="Qrad" dot={false} name="Radiative loss (W)" strokeWidth={2} />
                      <Line type="monotone" dataKey="Qcond" dot={false} name="Conductive loss (W)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl shadow-sm border-dashed">
              <CardContent className="p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-2">
                    <p>
                      This is a first-pass lumped model. It is good for seeing parameter sensitivity, but it does not yet resolve axial or radial temperature gradients, internal gas-solid heat transfer, changing porosity, contact resistance, or reaction enthalpy terms.
                    </p>
                    <p>
                      For porous monoliths, the most important calibration terms are usually effective conductive area, fitted hA, fitted radiative term, and temperature-dependent resistivity from experiment.
                    </p>
                    <p>
                      Heat-loss terms are intentionally signed. If the solid is colder than the surroundings, the model allows net heat flow from ambient back into the material.
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
