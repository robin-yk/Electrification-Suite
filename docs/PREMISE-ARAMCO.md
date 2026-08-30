# The benzene premise, tested on a mechanism that has benzene

## Why this exists

The RPH-versus-CJH result in Kwak et al., *ACS Energy Lett.* **2025**, 10,
6188-6196 rests on one measured quantity: benzene selectivity against methane
conversion, Figure 2d and Figure 3a. The reported behaviour is that pulsed and
continuous Joule heating both hold `S_C6H6` under 5 percent while conventional
heating does not, and that CJH begins climbing near 20 percent conversion in a
way that tracks a fall in `S_C2H2`, which is read as a C2H2 to C6H6 route.

The kinetic modelling in that paper used GRI-Mech 3.0 (Figure 4 caption).
GRI-Mech 3.0 has 53 species, no C4, no aromatics, and no C6H6 at all. It cannot
express the route the central claim is about, so the premise had never been put
to a mechanism able to represent it. Everything downstream in this repository,
the 1959-case transient corpus and every surrogate trained on it, inherited
that blind spot.

AramcoMech 2.0 (`tools/cantera/mechanisms/aramco20.yaml`, 493 species, 2716
reactions) carries C4H2, C4H4, C6H6, C6H5, FULVENE and the rest of the
aromatic pool. This note records what it says.

## Conditions

Taken from the paper's own captions, not from this repository's design box.

| | value | source |
|---|---|---|
| feed, Figure 2 | 5 percent CH4 in He | Figure 2 caption |
| feed, Figure 3 | 5 percent CH4 and 5 percent CO2 in He | Figure 3 caption |
| flow | Q = 50 sccm | Figure 2, Figure 3 captions |
| pressure | 1 bar | Figure 2 caption |
| flow detail | 2.5 sccm CH4 and 2.5 sccm CO2, partial pressure 5.06 kPa each, 50 sccm referenced at 0 C and 1 atm | SI, Flow Control |
| pulse | 1 Hz at 5 percent duty, so 50 ms on and 950 ms off | SI, Scheme S1e |
| RPH operating point | 70 V, T_peak about 1800 C, T_avg about 880 C | SI, Fig. S9 and Table S1 captions |
| element T(t) | sawtooth, peak about 1050 C and floor about 477 C at a lower-power point | SI, Scheme S1e, digitized |
| IR camera | Optris PI 1M, 500 to 1800 C, 80 Hz, emissivity 0.57 | SI, Experimental Setup |
| supply | Volteq 75 V, 20 A, 1500 W, Tektronix waveform generator | SI, Experimental Setup |
| element | Freudenberg H23 CFP, 38 x 8 x 0.21 mm, 28.8 mg | SI, Experimental Setup |
| element resistance | R(T) = -aT + b, a = 7.24e-4 ohm/C, b = 4.22 ohm | SI, Fig. S11a |
| RPH power | P = V^2 t_heating / (R(T_avg) t_cycle) | SI, Experimental Setup |
| reactor | quartz, 19 mm OD, 17 mm ID | SI, Experimental Setup |
| biogas band | 40 to 75 percent CH4, 25 to 60 percent CO2 | paper, ref 11 |

The CFP geometry and the resistance fit are the six constants already frozen
in `element_drive.py`, and they match the SI exactly. The supply reaches 75 V,
which is worth noting against the 55 V ceiling of `DESIGN_BOX`.

Two numbers the SI does not give: the reactor void volume and any residence
time. `VOID_CM3 = 11.03` in `pulse_common.py` has no source in the paper.

Two of these contradict what the transient campaign in this repository
actually ran. The design box used a CH4/CO2 binary at `feed_x` between 0.40 and
0.80 with **no helium**, so its hydrocarbon concentration is roughly ten times
the experiment's. Benzene formation is high order in hydrocarbon
concentration, which is exactly the pathway under test. The 50 sccm helium in
`element_drive.py:HE_CAPACITY_RATE` was the carrier gas all along.

The pulse itself is not the problem: period 1.0 s and duty 0.05 sit inside the
existing box. The abstract's phrase "microsecond pulses" disagrees with the
body text's "millisecond-scale", and the SI settles it at 1 Hz and 5 percent
duty.

## The quench floor, and how not to infer it

`T_min = 400 C` in the twelve committed cases was assumed before the SI was
read. Correcting it took two attempts and the first one was worse than the
assumption.

The first attempt inverted `T_avg = duty * T_peak + (1 - duty) * T_min` for
`T_min`, which with T_peak 1800 C and T_avg 880 C at 5 percent duty gives about
830 C. That formula describes a square wave: it asserts the element sits flat
at its floor for the whole 950 ms. Scheme S1e shows what it actually does. The
trace is a sawtooth, rising in less time than the plot resolves and then
decaying continuously for the rest of the period, with no dwell at either end
and no asymptote. The decay is still falling when the next pulse interrupts it,
so the floor is set by the period rather than by any equilibrium, and the time
average of that shape sits far above its minimum. The 830 C figure is withdrawn.

Scheme S1e is the only published temperature history in either document. Read
off the panel at 1 Hz and 5 percent duty it peaks near 1050 C and floors near
477 C, against its own red dashed steady-state line which the caption places at
700 C and which reads back as 695 C. That panel is not the operating point: it
is a lower-power case, and the operating point has no published trace.

`calibrate_element_si.py` fits the lumped element model to those two numbers
with two free parameters, the unstated drive voltage for that panel and a scale
on the radiating area, the latter because the model uses the bare strip
footprint and the real CFP is porous with the feed passing through it. The fit
is then asked for two numbers it never saw, the voltage that reaches T_peak
1800 C and the T_avg that comes with it, and both land within a few percent of
the 70 V and 880 C the SI states. On that calibration the operating-point floor
is near 530 C, not 830 C and not 400 C, over a swing of roughly 1270 C.

The floor is not published, and there is a reason it could not be. The Optris
PI 1M covers 500 to 1800 C, so both ends of the operating pulse sit on the
instrument's limits and the quench floor is at or below the bottom of its
range. Any floor quoted for this device is inferred, including this one.

The twelve committed cases are therefore wrong at both ends, with peaks 300 to
400 C low and a floor about 130 C cold. Rerunning them on the calibrated
operating point has not been done.

## How selectivity is defined, and why it decided a conclusion

SI page S6:

    S_CxHy = ([CxHy] * x) / (sum_i [CiHj] * i) * 100
    X_CH4  = ([CH4,in]/[He,in] - [CH4,out]/[He,out]) / ([CH4,in]/[He,in]) * 100

The selectivity denominator sums carbon over hydrocarbons. **CO is not in it**,
and helium is the internal standard for conversion. An earlier version of this
note used carbon converted from CH4 as the denominator, which does include CO,
and on that basis adding CO2 appears to destroy about a quarter of the
acetylene selectivity. On the paper's denominator the same twelve results move
by about two points and one moves up. The quarter was an artefact of the
denominator, not a statement about the mechanism. `premise_probe.py` now
reports both, and the CH4-converted columns are labelled `conv:`.

## Reproducing

Steady baselines, both reactor idealisations:

```bash
python3 tools/openmkm_dynamic/premise_probe.py sweep --kind cstr \
    --temperature 1200 1300 1400 1500 --tau 0.05 0.2 1.0
python3 tools/openmkm_dynamic/premise_probe.py sweep --kind pfr \
    --temperature 1200 1300 1400 1500 --tau 0.05 0.2 1.0
```

The pulsed cases, one per line, about 7 minutes each:

```bash
M=tools/cantera/mechanisms/aramco20.yaml
for tp in 1400 1500; do for tau in 0.05 0.2 1.0; do
  python3 tools/openmkm_dynamic/run_cstr_case.py \
    --t-peak-c $tp --t-min-c 400 --duty 0.05 --period-s 1.0 \
    --residence-time-s $tau --feed "CH4:0.05, HE:0.95" \
    --waveform trapezoid --mechanism $M \
    --output tools/openmkm_dynamic/data/premise/rph-ch4/rph-$tp-$tau.json
done; done
```

with `--feed "CH4:0.05, CO2:0.05, HE:0.90"` and `rph-ch4co2/` for the second
set. Those 12 results are committed. Tabulate them:

```bash
python3 tools/openmkm_dynamic/premise_probe.py summarize \
    tools/openmkm_dynamic/data/premise/rph-ch4/*.json \
    tools/openmkm_dynamic/data/premise/rph-ch4co2/*.json
```

The element calibration and its held-out test:

```bash
python3 tools/openmkm_dynamic/calibrate_element_si.py
```

Audit checks on the schema-2 carbon accounting:

```bash
python3 tools/openmkm_dynamic/test_carbon_audit.py            # GRI, seconds
python3 tools/openmkm_dynamic/test_carbon_audit.py --aramco   # adds ~7 min
```

## What it says

Read the numbers off `summarize` and the two `sweep` runs; they are not
transcribed here, for the reason the repository does not transcribe numbers.
The findings that survived them:

**The methane-only premise reproduces.** At a matched methane conversion near
20 percent, the pulsed case reaches the published combination of `S_C2H2`
above roughly 80 percent with `S_C6H6` under 5 percent, and the steady CJH
baseline at the same conversion does not come close on either. This is the
first time any model in this project has produced that comparison, because
GRI-Mech's benzene column is structurally zero.

**The pulse, not the CO2, is what moves C2H4 to C2H2.** At matched conversion
the pulsed C2H2/C2H4 ratio is nearly two orders of magnitude above the steady
CSTR ratio.

**CO2 does not push C2H4 to C2H2 by draining hydrogen.** The drain is real:
`x_H2` falls with CO2 co-feed in every row and H2O appears. But if the pair
were equilibrated through C2H4 = C2H2 + H2, the ratio would go as `1/p_H2` and
should rise by the same factor the hydrogen falls. It does not. In the steady
CSTR it falls hard, and in the pulsed cases it is roughly flat, drifting down
at short residence time and up only at the longest. The pair is kinetically
controlled, not H2-equilibrated. What CO2 actually does is oxidise
hydrocarbons to CO, and since acetylene is the dominant hydrocarbon there, it
absorbs most of the loss. `S_CO` passing 100 percent on a CH4-converted basis
is CO2's own carbon arriving as CO.

**The CH4/CO2 case reproduces too, on the paper's basis.** The paper reports
C2+ hydrocarbon selectivity as unaffected by CO2. On the hydrocarbon
denominator every one of the six pairs moves by about two points or less, and
the longest-residence pair moves up. The acetylene share of the C2 pool, the
Figure S5a metric, is flat to within a tenth of a point. Benzene rises with
CO2 rather than falling, which agrees in sign with the measured reaction order
in Figure S9: the CO2 order is +0.37 for C6H6, +0.18 for C2H2 and -0.12 for
C2H4.

That last table is the sharpest validation target in the paper and has not
been run. It fits `r = a [CO2]^n` over [CO2] from 5.06 to 40.24 kPa at fixed
[CH4] = 5.06 kPa, and separately over [CH4] at fixed [CO2], and reports five
exponents each with an R squared. Matching five exponents is a much stronger
test than matching one selectivity, and the comparison here spans only the
step from zero to 5.06 kPa, which is not on that power law at all.

**The reactor idealisation is not neutral.** At matched conversion the
plug-flow limit produces markedly less benzene than the CSTR, because a CSTR
holds the whole charge at the outlet conversion, which is the state that makes
benzene. Every one of the 1959 transient cases in this repository is a CSTR,
and the physical device is a flow past a small carbon-fibre strip. Any
benzene claim has to state which idealisation it came from.

## Standing caveats

- `T_min = 400 C` and T_peak 1400 to 1500 C in the twelve committed cases are
  both wrong, as above. The calibrated operating point is T_peak 1800 C over a
  floor near 530 C. No claim about mean temperature is made from these runs.
- The element calibration is fitted to two digitized points and tested on two
  stated ones. It is not a measurement, and the digitized pair carries the
  thickness of a printed trace.
- Benzene is quantified on an Agilent 7890 FID covering C1 to C10+, with
  Effective Carbon Number response factors for species lacking a standard,
  which the SI itself calls semi-quantitative. The MicroGC TCD sees only
  permanent gases and hydrocarbons below C4, so it is not the benzene
  instrument.
- The SI states the limitation this note tests, in its Computational Setup:
  predictions align with observed C1 to C2 distributions, but heavier species
  such as aromatics "exceed the mechanism's validation scope and require
  cautious interpretation". The paper was explicit. What had not happened was
  running a mechanism whose scope covers them.
- Twelve pulsed cases, two feeds, one waveform. This is a premise check, not a
  validated model.
- No mechanism used here has a condensed phase. Results carry
  `solid_carbon_modeled: false`, and the C4 and C6 numbers are gas
  hydrocarbons. They are not soot, and the experimental carbon balance itself
  declines above 1150 to 1200 C where solid carbon appears.
- The twelve committed results predate the fix that made
  `residual_fraction_of_in` report null for an element absent from the feed,
  so their oxygen entry in the methane-only files holds the ratio of two
  rounding-level numbers. `residual_kmol` and `in_kmol` are correct, and
  `premise_probe.py summarize` recomputes from those rather than trusting the
  stored ratio.
