# Run card: the C2 pulse study on AramcoMech 2.0

Required by `CLAUDE.md`: four sawtooth cases at about 45 minutes each is
three CPU-hours. Generator `run_pulse_c2.py`, committed before the run.

## Purpose

Which drive protects C2 best, on the full mechanism, at matched feed,
residence time and conversion. One anchor (the SI operating point: the
voltage at which the calibrated element peaks at 1800 C, 1 Hz, 5 percent
duty) and three single-knob moves: peak down (60 V), cycle shorter (0.2 s),
hot fraction longer (20 percent duty). Feed is the paper's methane feed, 5
percent CH4 in helium, 1 bar; residence time 0.2 s.

## Claim boundary

Passing licenses: in a uniform-temperature CSTR on the calibrated element
trajectory, this mechanism ranks these four drives in the stated order for
C2 protection at their own conversions. Nothing about the device's absolute
conversion (the reactor picture is open, `RUNCARD-BL.md`), nothing about
other residence times or feeds.

## Inputs

| | value | source |
|---|---|---|
| mechanism | AramcoMech 2.0 | `tools/cantera/mechanisms/aramco20.yaml` |
| element | S1f calibration: loss scale, clamp conduction, heat-capacity scale | `calibrate_element_si.py` |
| drives | see `run_pulse_c2.py plan` | anchor from the SI; moves chosen by hand |
| feed, pressure, tau | CH4 0.05 He 0.95, 1 bar, 0.2 s | SI flow control; tau as in `RUNCARD-S9.md` |
| steady comparison | `data/premise/cjh-inversion/cjh-cstr.json`, tau 0.2 s, 1000 to 1470 C | `premise_probe.py sweep` |

## Acceptance gates

1. Each case converges to a periodic state and closes carbon (schema 2 audit).
2. Its conversion lies inside the steady sweep's range at tau 0.2 s, so the
   matched steady point exists by interpolation and not extrapolation.
3. Output: the four product slates beside their matched steady slates
   (`run_pulse_c2.py compare`). The ranking on benzene at matched conversion
   is the result, whichever way it comes out.

## Round 1 result, and round 2

Round 1 (45 wall minutes, four cores): the anchor converts 22.0 percent
with 18.8 percent benzene against 52.0 for the steady element at 1207 C.
The three moves left the chemistry's window: 60 V peaks at 1233 C and
converts 0.29 percent, a 0.2 s period peaks at 1131 C and converts 0.13,
and 20 percent duty peaks at 3063 C, which no carbon paper survives, so
its 38.7 percent conversion and 13.1 percent benzene are outside the
element's domain and are reported, not used. The knob steps were too
coarse for an element whose peak is set by the energy per pulse against a
T^4 loss. Round 2 steps inside the window: 70 V at 5 percent duty, 2 s
period at the SI voltage, 10 percent duty at 78 and at 70 V. Same gates,
same cost.

## Round 2 result, and round 3

Round 2: 70 V at 5 percent peaks at 1534 C and protects less than the
anchor (benzene 0.51 of the matched steady value against 0.36); the three
cases that overshoot the peak (2340 to 2707 C) protect more (0.25 to
0.41). One trend, higher peak less benzene, with the element's ceiling as
the binding constraint. Round 3 therefore holds the peak at 1800 C and
varies only the waveform shape: `operating_point` solves the voltage for
each period and duty. Cases: 1 s at 10 and 20 percent duty, 0.5 s and 2 s
at 5 percent. Their solved voltages are 57.7, 44.8, 97.1 and 61.4 V
(`calibrate_element_si.operating_point`); the 0.5 s case exceeds the SI's
75 V supply and is kept because the element, not the supply, is the model
under test. The element's floor and mean differ widely across these:
mean temperature 635 to 1128 C at the same peak.

## Round 3 result

All four cases converged (cycle boundary residual below 1e-12) with carbon
closed to round-off. At a fixed 1800 C peak the pulse selectivity is flat:
benzene 16.5 to 18.8 percent, acetylene 66 to 68 percent, while conversion
runs from 8.5 percent (2 s, 5 percent duty) to 47.2 percent (0.5 s, 5
percent). The pulse-over-steady benzene ratio (0.27 to 0.52) tracks the
steady comparator, not the pulse. Conclusion for the claim boundary: the
peak fixes the product split, the shape fixes throughput. No round 4 on
shape is warranted; the next question, if any, is the peak itself, which
the element cannot raise. Numbers: `run_pulse_c2.py compare`.

## Cost

4 cases per round, about 45 min each measured on the si-op sawtooth
locally, four in parallel on four cores: about one wall hour per round.
Cache: a finished case file is not recomputed.

## What this invalidates

Nothing. Writes only to `data/c2pulse/`.

## Screen

`series_pulse.py` on the lumped constants of `data/lump/aramco-ch4-he.json`
was run over the same knobs first. Its two activation energies are equal
(368 and 362 kJ/mol above 1300 C), so it cannot express the low-temperature
benzene the steady element makes and its ranking is not used to choose or
exclude cases here.
