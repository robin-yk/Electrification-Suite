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
| pulse | 50 ms on, 950 ms off, so period 1.0 s at duty 0.05 | author |
| biogas band | 40 to 75 percent CH4, 25 to 60 percent CO2 | paper, ref 11 |

Two of these contradict what the transient campaign in this repository
actually ran. The design box used a CH4/CO2 binary at `feed_x` between 0.40 and
0.80 with **no helium**, so its hydrocarbon concentration is roughly ten times
the experiment's. Benzene formation is high order in hydrocarbon
concentration, which is exactly the pathway under test. The 50 sccm helium in
`element_drive.py:HE_CAPACITY_RATE` was the carrier gas all along.

The pulse itself is not the problem: period 1.0 s and duty 0.05 sit inside the
existing box. The abstract's phrase "microsecond pulses" disagrees with the
body text's "millisecond-scale", and the author's figure is the millisecond
one.

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

**The CH4/CO2 case does not reproduce cleanly.** The paper reports C2+
selectivity as unaffected by CO2 and describes CO2 scission as kinetically
slow and limited. This model loses roughly a quarter of the acetylene
selectivity to CO2 at matched conversion, with a CO2 conversion of about 16
percent at the reference point. That points at CO2 activation rates in the
mechanism. The decisive comparison is against the measured `X_CO2` in the
paper's Figure S4, which is not in hand.

**The reactor idealisation is not neutral.** At matched conversion the
plug-flow limit produces markedly less benzene than the CSTR, because a CSTR
holds the whole charge at the outlet conversion, which is the state that makes
benzene. Every one of the 1959 transient cases in this repository is a CSTR,
and the physical device is a flow past a small carbon-fibre strip. Any
benzene claim has to state which idealisation it came from.

## Standing caveats

- `T_min = 400 C` in the pulsed cases is an assumption, not a measurement. The
  selectivity results depend on it weakly; any claim about mean temperature
  depends on it strongly and is not made here.
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
