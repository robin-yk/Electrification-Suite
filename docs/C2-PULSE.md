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
is the temperature and time at which benzene forms; the pulse converts at
1500 to 1800 C for tens of milliseconds and spends the rest of the cycle
too cold to make benzene.

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

Results: 실행 중, this section is filled from `compare` when the four
cases finish.

## Standing caveats

- Uniform-temperature CSTR at the element temperature. The device is not
  that (`PREMISE-ARAMCO.md`); these are rankings of drives on a prescribed
  history.
- The element trajectory is one-way coupled; at 5 percent hydrocarbon the
  reaction load is small against the element power.
- No condensed phase. C3+ here is gas-phase hydrocarbon carbon; the
  experimental carbon balance declines where solid carbon forms.
- Figure 2 numbers quoted anywhere are read by eye, one unit each axis.
