# The C2 pulse question, asked of the mechanism

## Why this document exists

`PREMISE-ARAMCO.md` ends with the reactor picture open: no model in this
repository reproduces the paper's absolute conversions, and `RUNCARD-BL.md`
records that the two candidate pictures bracket the data with a gap that
only flow information could close. That is a statement about the device.
The pulse question is a statement about the chemistry, and it can be asked
without settling the device: on a prescribed temperature history, does a
pulse protect the C2 intermediate against the C3+ sink better than a
steady element that reaches the same conversion? Every number below is a
uniform-temperature CSTR on the S1f-calibrated element trajectory, and is
quoted as the mechanism's ranking of drives, not as the device's output.

## Matched comparison: the fair test

Selectivity to an intermediate falls with conversion in any series network,
so a pulse compared with a steady point at a different conversion reads
partly as a slide along that curve. `pulse_vs_steady.py` therefore finds,
for each pulsed case, the steady temperature at the same feed and residence
time that reaches the same methane conversion, and prints both slates.

    python3 tools/openmkm_dynamic/pulse_vs_steady.py \
        --steady tools/openmkm_dynamic/data/lump/steady-cstr-ch4co2.json \
        tools/openmkm_dynamic/data/s9/conditions-siop/*.json

On the CH4/CO2 feed with the SI operating point (peak 1800 C, 1 Hz, 5
percent duty), AramcoMech 2.0:

| tau, s | X, % | steady needs, C | S_C6H6 steady / pulse, % | S_C2H2 steady / pulse, % |
|---|---|---|---|---|
| 0.05 | 8.5 | 1230 | 29.6 / 25.4 | 18.7 / 56.4 |
| 0.2 | 20.3 | 1203 | 55.3 / 17.0 | 18.8 / 70.6 |
| 1.0 | 61.2 | 1227 | 72.5 / 2.4 | 20.8 / 89.5 |

The pulse protects C2 by three to thirty times at matched conversion and
moves the C2 from ethylene to acetylene. The steady element reaches the
same conversion at about 1200 C, held for the whole residence time, which
is the temperature at which benzene forms and survives. The pulse also
forms benzene, on the way through 1200 to 1400 C, and then takes it apart
at the peak; the flux section below has the numbers. An earlier draft of
this paragraph said the pulse was too cold for most of the cycle to make
benzene, which the flux diagram showed to be wrong.

## The lumped series model, and why it is a screen

`lump_fit.py` fits the page's A -> B -> C model (`apps/rphcjh/solver.js`)
to constant-temperature batches of the methane feed: C1 methane, C2 every
two-carbon species, C3+ everything heavier. Above 1300 C the first-order
picture holds to about ten percent in the C2 trajectory; below it the
sink is not first order and the fit is poor, so the Arrhenius lines use
1300 C and above. The result is Ea1 368 and Ea2 362 kJ/mol
(`data/lump/aramco-ch4-he.json`). With equal activation energies k2/k1
does not move with temperature and a linear series model predicts no
selectivity gain from any temperature program. `series_pulse.py`, the
page's exact periodic solver ported and checked against it to 1e-9
(`test_series_pulse.py`), confirms it over 528 element trajectories: gain
0.99 to 1.00 at every residence time (`data/lump/series-pulse-front.json`).

    python3 tools/openmkm_dynamic/lump_fit.py \
        --mechanism tools/cantera/mechanisms/aramco20.yaml --fit-above-c 1300 \
        --output tools/openmkm_dynamic/data/lump/aramco-ch4-he.json
    python3 tools/openmkm_dynamic/series_pulse.py \
        --lump tools/openmkm_dynamic/data/lump/aramco-ch4-he.json \
        --output tools/openmkm_dynamic/data/lump/series-pulse-front.json

The mechanism and the lump disagree because the benzene the steady element
makes forms at 1200 C over tenths of a second, exactly where the lump fits
worst and outside the range its constants come from. The lump is kept as a
screen and the ranking is taken from the mechanism.

## Which pulse protects C2 best

`run_pulse_c2.py` (`RUNCARD-C2.md`) moves one knob at a time from the SI
anchor on the methane feed at tau 0.2 s: peak down to 60 V, period down to
0.2 s, duty up to 20 percent. Each case is compared with the steady
element at its own conversion.

    python3 tools/openmkm_dynamic/run_pulse_c2.py run
    python3 tools/openmkm_dynamic/run_pulse_c2.py compare

Round 1, methane feed, tau 0.2 s, benzene at matched conversion:

| drive | peak, C | X, % | S_C6H6 pulse / steady, % | S_C2H2 pulse / steady, % | element W |
|---|---|---|---|---|---|
| anchor, 78 V, 1 s, 5 % | 1800 | 22.0 | 18.8 / 52.0 | 66.3 / 19.6 | 91 |
| 60 V, 1 s, 5 % | 1233 | 0.29 | 1.4 / 1.5 | 8.9 / 1.0 | 50 |
| 78 V, 0.2 s, 5 % | 1131 | 0.13 | 0.0 / 0.6 | 1.7 / 0.5 | 87 |
| 78 V, 1 s, 20 % | 3063 | 38.7 | 13.1 / 52.8 | 67.6 / 29.4 | 510 |

The element answered before the chemistry did. Dropping the voltage or
shortening the period leaves the peak below 1250 C, where nothing converts
in 0.2 s; raising the duty to 20 percent drives the peak past 3000 C,
which no carbon paper survives, so that row is outside the element's
domain. Between those, the anchor's advantage stands: 18.8 against 52.0
percent benzene at the same 22 percent conversion.

Round 2, smaller steps:

| drive | peak, C | X, % | S_C6H6 pulse / steady, % | S_C2H2 pulse / steady, % | element W |
|---|---|---|---|---|---|
| 70 V, 1 s, 5 % | 1534 | 17.9 | 23.8 / 47.0 | 61.9 / 18.8 | 71 |
| 78 V, 2 s, 5 % | 2595 | 10.4 | 15.5 / 37.7 | 68.5 / 17.3 | 101 |
| 78 V, 1 s, 10 % | 2707 | 30.3 | 15.0 / 59.3 | 68.8 / 22.2 | 213 |
| 70 V, 1 s, 10 % | 2340 | 28.7 | 15.6 / 60.3 | 68.7 / 20.9 | 160 |

Only the 70 V row stays inside the element's domain, and it is worse than
the anchor: benzene at 0.51 of the steady value against the anchor's 0.36.
Every row that overshoots the peak protects more (0.25 to 0.41), so the
trend is one line: the higher the peak, the less benzene at matched
conversion, and the element's material ceiling is the constraint that
binds. Doubling the period or the duty at fixed voltage moves the peak by
800 to 900 C, which is why single-knob steps keep leaving the window. The
right comparison is at fixed peak: for each period and duty, the voltage
that reaches 1800 C, and then the waveform shape is the only thing that
differs. That is round 3.

Round 3, peak held at 1800 C, voltage solved per shape
(`calibrate_element_si.operating_point`), anchor repeated for reference:

| drive | T_min / T_mean, C | X, % | S_C6H6 pulse / steady, % | S_C2H2 pulse / steady, % | element W |
|---|---|---|---|---|---|
| 78 V, 1 s, 5 % (anchor) | 502 / 887 | 22.0 | 18.8 / 52.0 | 66.3 / 19.6 | 91 |
| 57.7 V, 1 s, 10 % | 523 / 924 | 23.8 | 18.1 / 54.2 | 66.7 / 19.9 | 100 |
| 44.8 V, 1 s, 20 % | 570 / 1006 | 28.7 | 16.5 / 60.2 | 67.9 / 20.9 | 123 |
| 97.1 V, 0.5 s, 5 % | 780 / 1128 | 47.2 | 17.7 / 46.3 | 67.5 / 36.6 | 144 |
| 61.4 V, 2 s, 5 % | 235 / 635 | 8.5 | 18.4 / 35.3 | 66.5 / 16.9 | 55 |

The pulse column barely moves: benzene 16.5 to 18.8 percent and acetylene
66 to 68 percent across a shape family whose conversion spans 8.5 to 47
percent and whose mean temperature spans 635 to 1128 C. The peak sets the
product split; the shape sets only how much methane passes through the
hot part of the cycle. Everything that changes in the ratio column (0.27
to 0.52) comes from the steady comparator, which needs a different
temperature to reach each conversion and makes a different amount of
benzene there. So the waveform is a conversion knob, not a selectivity
knob, and the one selectivity knob the element has, the peak, is pinned
by its material ceiling. The 0.5 s case needs 97 V against the SI's 75 V
supply; it is a model point, not an operable one.

## Where the carbon goes: the flux diagram

`pathway_flux.py` charges every reaction's rate to species-to-species carbon
edges and integrates them over one cycle of the anchor case and over unit
time for the steady CSTR at the same conversion; `draw_pathway.py` draws
both as `docs/figures/pathway-anchor.svg`. Numbers below are percent of the
carbon fed and come from `data/c2pulse/pathway-anchor.json`.

The route to benzene is the same in both: acetylene and methyl make C3
(propargyl, C3H3), and C3 pairs into the ring. What differs is what happens
to the ring afterwards.

| carbon flow | steady 1209 C | pulse, peak 1800 C |
|---|---|---|
| into benzene (C3 and C6 to C6H6) | 12.5 | 14.5 |
| out of benzene (to C4H2, C2H2, other C6) | under 0.3 | 10.3 |
| benzene leaving the reactor | 12.1 | 4.1 |
| C4H2 back to C2H2 | under 0.3 | 6.7 |
| acetylene leaving the reactor | 4.2 | 14.6 |

The pulse makes more benzene than the steady element, not less: 14.5
against 12.5 percent of the fed carbon enters the ring, most of it on the
way up and down through 1200 to 1400 C. At the 1800 C peak the ring cracks,
5.9 to diacetylene and 3.1 straight back to acetylene, and the diacetylene
cracks too, 6.7 back to acetylene. So the low benzene of the pulse is not
the ring failing to form, it is the ring being taken apart at the peak and
the fragments frozen as acetylene in the quench. This is why the peak, and
nothing about the shape, sets the split (round 3), and it is also why the
polyyne route matters: the carbon that leaves as C4H2 and C6H2 in the model
is the carbon that would deposit in the device.

## Standing caveats

- Uniform-temperature CSTR at the element temperature. The device is not
  that (`PREMISE-ARAMCO.md`); these are rankings of drives on a prescribed
  history.
- The element trajectory is one-way coupled; at 5 percent hydrocarbon the
  reaction load is small against the element power.
- No condensed phase. C3+ here is gas-phase hydrocarbon carbon; the
  experimental carbon balance declines where solid carbon forms.
- Figure 2 numbers quoted anywhere are read by eye, one unit each axis.
