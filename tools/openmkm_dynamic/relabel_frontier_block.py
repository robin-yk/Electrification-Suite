"""Move the first frontier campaign off block 6000001, which it collided on.

The first (v1-model) frontier round trip and the second (v2-model, canonical)
one both wrote design_index 6000001 to 6000018 with different conditions;
targets-frontier.json matches frontier2 on 18 of 18, so frontier2 owns the
block. Any index-keyed join (the atlas quasi-steady sidecar, the trainer)
would silently take whichever file it read first. This relabels the OLD
design-wide-frontier-w*.jsonl records to 6300001 to 6300018, inputs and
outputs untouched. Idempotent: records already at or above 6300001 pass
through unchanged.
"""
import json, glob, os
HERE = os.path.dirname(os.path.abspath(__file__))
OFFSET = 300000
moved = kept = 0
for fn in sorted(glob.glob(HERE + '/data/wide/design-wide-frontier-w*.jsonl')):
    rows = []
    for l in open(fn):
        r = json.loads(l)
        if 6000000 < r['design_index'] <= 6000018:
            r['design_index'] += OFFSET
            moved += 1
        else:
            kept += 1
        rows.append(r)
    with open(fn, 'w') as f:
        for r in rows:
            f.write(json.dumps(r, separators=(',', ':')) + '\n')
print(f"moved {moved}, already fine {kept}")
