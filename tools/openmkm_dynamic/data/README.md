# Dynamic-chemistry datasets

```
runs/<commit>/   every collect lands here, one directory per generating commit,
                 immutable once written; its manifest.json says what and how
canonical/       what downstream code and training may read; promoted from a
                 run by promote.py only after validation, with the evidence
                 recorded in canonical/manifest.json
cstr-period-pilot.jsonl   the original five-period pilot, predates the layout
```

Shared filenames at this level used to be overwritten by every collect run,
which left the folder describing whichever run finished last -- a mid-state,
not a dataset. If a file is not under canonical/, do not train on it.
