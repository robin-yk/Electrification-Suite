# Run card: the boundary-layer picture against the steady CJH points

Required by `CLAUDE.md` because the study exceeds ten CPU-minutes. Generator:
`tools/openmkm_dynamic/boundary_layer_probe.py`; comparison:
`tools/openmkm_dynamic/bl_compare.py`. The first scan (cold inlet, four plate
temperatures, four velocities) was launched as the pilot named in
`RUNCARD-S9.md` before this card was written; this card records it and gates
everything after it.

## Purpose

`cjh_inversion.py` showed that no reactor at a single temperature reproduces
the paper's continuous Joule heating points: at the residence time that gives
the measured conversion the model carries acetylene without the measured
ethylene, or ethylene without the acetylene. The two coexist in the data, so
the gas reacts over a range of temperatures at once. The cheapest verified
model of that class is Cantera's stagnation-flow boundary layer: feed flows
toward a plate at the strip temperature, heats through a conduction layer,
reacts where it is hot, and leaves. This study asks whether that picture
reproduces the four CJH points of Figure 2 (5 percent CH4 in He, 50 sccm) with
one effective velocity, or a smooth trend of velocities, on AramcoMech 2.0.

## Claim boundary

Passing licenses one statement: a reacting layer with a conduction-set
temperature profile between the element temperature and a far boundary
reproduces the measured conversion, acetylene, ethylene and benzene of the
steady CJH series together, with the contact time as the one fitted number.
It licenses nothing about the pulsed series, whose element temperature moves
faster than the layer can follow, and nothing about the furnace series, where
solid carbon the mechanism does not carry takes a large share of the carbon.

## What is known, assumed and unknown

| | value | status |
|---|---|---|
| plate temperature | 1150, 1230, 1400, 1470 C | measured, IR camera, Figure 2 |
| gap | 4.5 mm, (17 mm ID - 8 mm strip) / 2 | SI, Experimental Setup; the face-to-wall distance is 8.5 mm and is not run |
| feed | CH4 0.05 in He, 1 bar | SI |
| sccm velocity | 0.37 cm/s over the 17 mm tube | computed from 50 sccm; the velocity axis is an effective contact-time parameter and is scanned, not set |
| inlet temperature | 27 C in the first scan | assumption: the cold-tube limit. The quartz wall the strip faces is radiatively heated; its temperature is nowhere in the paper or SI (미확인) |
| transport | mixture-averaged from the mechanism's own data | Aramco carries transport data for all 494 species |
| measured targets | Figure 2 read by eye, about one unit each axis | `fig2_by_eye.json`, scoping data; a proper digitisation replaces it only if the picture holds |

The measured conversion rises eight times from 1150 to 1470 C, an apparent
activation energy of about 134 kJ/mol (`bl_compare.py`, last table). The
mechanism's own conversion at fixed residence time rises with 400 to 470
kJ/mol (`cjh_inversion.py` sweeps). That gap is the transport limitation the
picture has to supply, and it is the first number checked.

## Acceptance gates

1. Every case converges on the refined grid. A case that does not is reported
   and not filled by extrapolation.
2. Temperature slope: at some fixed velocity, the model's apparent activation
   energy from 1150 to 1470 C lies within 60 kJ/mol of the measured 134. This
   is checked before any velocity is fitted, because a velocity fit can hide a
   wrong slope only by changing tenfold between neighbouring temperatures.
3. Matched on conversion at each temperature, the model's acetylene and
   ethylene are both within 12 percentage points of the measured values and
   benzene within a factor of two. All three, at the same velocity.
4. The fitted velocities across the four temperatures vary by less than a
   factor of three. A picture, not a fit.

Failing gate 2 with the cold inlet does not stop the study: the far boundary
is then raised to a plausible wall temperature and the scan repeated once, at
the lower velocities the axial residence time (3 to 10 s along a 38 mm strip)
calls for. Failing gate 2 after that stops it, and the report says which
physics is missing rather than fitting further.

## Cost

| scan | cases | wall per case | status |
|---|---|---|---|
| cold inlet, 1150 C, u 0.4 to 5 | 4 | 170 to 280 s | done |
| cold inlet, 1230 C | 4 | 200 to 570 s | running |
| cold inlet, 1400 and 1470 C | 8 | over 22 min for the first case, 미확인 | running |
| hot inlet, low velocity, four temperatures | 12 | 미확인 | not started; gated on the above |

Four processes on four cores. Total for the first scan is a few CPU-hours; the
hot cases dominate because the refined grid carries the whole mechanism at
every point.

## Cache policy

Each scan writes one JSON per plate temperature; a finished file is not
recomputed. Failed cases leave no file and the log says why.

## What this invalidates

Nothing already committed. `RUNCARD-S9.md` is HELD pending this study, and
`docs/PREMISE-ARAMCO.md` already says the element-temperature closure is
falsified. If the picture passes, every CSTR-based selectivity in
`data/premise/` and `data/s9/` is reinterpreted as the mechanism's response to
a prescribed uniform temperature, not as a prediction of the device.
