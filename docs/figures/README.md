# Application Note figures

Five plates and one scope table for the Joule heating solver Application Note,
drawn at print size from the solver itself.

```
node docs/figures/make-figures.mjs
```

writes `fig1.svg` … `fig5.svg`, `figure-data.json`, and `index.html`, the page
published at the figure-source artifact.

| Plate | Subject | Manuscript position | Width |
|---|---|---|---|
| `fig1.svg` | Order of computation in the coupled solver | SI, Solver section (near S3–S4) | 178 mm |
| `fig2.svg` | Rectangular element to equivalent cylinder | SI, cross-check (near S4, S7.3) | 178 mm |
| `fig3.svg` | Axisymmetric domain and material regions | SI, model section (near S1, S3) | 178 mm |
| `fig4.svg` | Matrix contribution classes | SI, between S3 and S4 | 178 mm |
| `fig5.svg` | Scalar total power and spatial distribution | Main text, Figure 2 | 178 mm |

## Why it is generated

Every dimension, cell count, region allocation, equivalent-cylinder property
and resistance shown in the plates comes from `apps/joule/solver.js` by way of
`make-figures.mjs`. Nothing is typed into the artwork. A change to the solver
is picked up by re-running the command, so a figure cannot drift away from the
manuscript text that quotes it. The build fails rather than emits if any drawn
value comes out as `NaN` or `undefined`.

The revision stamped on the page is read from git — the commit that last
touched `apps/joule/solver.js` — rather than typed, so the page cannot claim a
revision it was not built from. It carries a `+ uncommitted changes` marker
when the working tree is dirty.

## Conventions

Artwork is authored in points, so a viewBox unit is a printed point and
`font-size="9"` is 9 pt on the page. Subscripts drop to 8 pt, which is the
floor. Type is Arial, the ground is white, and fills are flat: no shadow, no
gradient, no transparency.

One hue carries one physical role in all five plates. The set is the
Okabe-Ito colourblind-safe palette.

| Role | Hue |
|---|---|
| scalar electrical | `#0072B2` |
| local electrical field | `#E69F00` |
| thermal solve | `#D55E00` |
| process gas | `#009E73` |
| boundaries and inactive regions | `#6E6E6E` |

Captions live in `templates/body.html` as page text rather than inside the
artwork, so they can be pasted into Word as ordinary captions and picked up by
cross-references and the list of figures.

## Surface convention

`geometry()` takes the surface of a rectangular element as the full box,
2(LW + LH + WH). For the 38 × 8 × 0.21 mm strip that is 6.273 cm². The
two-face convention 2LW gives 6.080 cm² and omits the edges, which are 3.08 %
of the total. Figure 2 states which one is in use; the two must not be
compared with each other.
