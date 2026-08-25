# Application Note figures

The complete plate set for the Joule heating Application Note and its
Supporting Information, drawn at print size from the solver itself.

```
node docs/figures/make-verification-data.mjs --levels 4   # slow; measures the verification studies
node docs/figures/make-figures.mjs                        # fast; draws the plates and the page
```

The first command runs the repository's verification studies and writes
`verification-data.json`. The second reads that file, computes every geometric
and electrical value it needs directly from `apps/joule/solver.js`, and writes
the ten plates, `figure-data.json`, and `index.html` (the page published as
the figure source).

| Plate | Subject | Manuscript position | Width |
|---|---|---|---|
| `fig1.svg` | Browser workflow, and what passes between the stages | Main text, Fig. 1 | 178 mm |
| `fig2.svg` | Scalar total power and spatial power distribution | Main text, Fig. 2 | 178 mm |
| `fig3.svg` | Numerical verification, three panels | Main text, Fig. 3 | 178 mm |
| `fig4.svg` | Illustrative case: temperature field and power balance | Main text, Fig. 4 | 178 mm |
| `figS1.svg` | Axisymmetric domain and material regions | SI, S1 and S3 | 178 mm |
| `figS2.svg` | Matrix contribution classes | SI, S3.4 | 178 mm |
| `figS3.svg` | Nested solver loop and order of computation | SI, S4 | 178 mm |
| `figS4.svg` | Rectangular element to equivalent cylinder | SI, S7.3 | 178 mm |
| `figS5.svg` | Transient operation: start-up and a pulse train | proposed SI | 178 mm |
| `figS6.svg` | Design screening: geometry and material against the supply | proposed SI | 178 mm |

## Why it is generated

Every dimension, cell count, region allocation, equivalent-cylinder property,
resistance and verification point in the plates comes from the code, by way of
the two commands above. Nothing is typed into the artwork. A change to the
solver is picked up by re-running them, so a figure cannot drift away from the
manuscript text that quotes it. The build fails rather than emits if any drawn
value comes out as `NaN` or `undefined`, and refuses to run at all if the
verification measurement is missing.

The revision stamped on the page is read from git, the commit that last
touched `apps/joule/solver.js`, rather than typed, so the page cannot claim a
revision it was not built from. It carries a `+ uncommitted changes` marker
when the working tree is dirty.

## Conventions

Plates carry no titles and no explanatory paragraphs: panel letters and axis
labels only, with everything else in the caption. Captions live in
`templates/body.html`.

Artwork is authored in points, so a viewBox unit is a printed point and
`font-size="9"` is 9 pt on the page. Subscripts drop to 8 pt, which is the
floor. Type is Arial, the ground is white, and fills are flat: no shadow, no
gradient, no transparency.

One hue carries one physical role in all ten plates. The set is the
Okabe-Ito colorblind-safe palette.

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
of the total. Fig. S4 states which one is in use; the two must not be compared
with each other.
