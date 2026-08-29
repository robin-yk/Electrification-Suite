"""Per-species mass enthalpy table from GRI-Mech 3.0 NASA polynomials.

h_i(T) in J per g, absolute convention (formation enthalpy included), so
w_out . h(T_out) minus w_in . h(T_in) is the full process duty per gram of
gas: sensible heating plus reaction enthalpy in one difference. Written to
data/enthalpy-gri30.json for the pulse-space energy accounting; regenerate
with this script if the species list changes.
"""
import json
import os
HERE = os.path.dirname(os.path.abspath(__file__))
import cantera as ct
import sys
sys.path.insert(0, HERE)
from run_cstr_case import MW, RECORD_SPECIES

gas = ct.Solution('gri30.yaml')
TS = list(range(250, 2301, 10))
table = {}
for sp in RECORD_SPECIES:
    th = gas.species(sp).thermo
    table[sp] = [th.h(t)/(MW[sp]*1000.0) for t in TS]   # J/kmol -> J/g
json.dump({"T_K": TS, "h_J_per_g": table,
           "source": "gri30.yaml NASA-7 polynomials via Cantera, absolute enthalpy"},
          open(HERE + '/data/enthalpy-gri30.json', 'w'))
print(f"wrote {len(RECORD_SPECIES)} species x {len(TS)} temperatures")
