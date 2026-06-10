# DClinPsy Equal-Opportunities Explorer

An interactive, statistically honest explorer for the Clearing House for
Postgraduate Courses in Clinical Psychology equal-opportunities admissions data,
2015 to 2024. Acceptance rates by applicant characteristic, with confidence
intervals and significance, computed live in the browser and verified against an
offline R reference.

House style: no em dashes, use colons; "pp" for percentage points; always "DEI"
never "EDI"; "disparities" and "gaps", never "discrimination".

## Architecture

Two layers, with a verification bridge between them (see
`extracted_docs/STATS_AND_TOOL_GOVERNANCE.md`, rule 2a):

1. R, offline (the oracle): cleans and reconciles `equalopps_2015-2024_merged.csv`,
   builds the aggregate groups (the broad ethnic groups White/Asian/Black/Mixed/Other
   and the detailed Mixed group come from the source's published "Total in the X
   group" rows; Christian is a transparent sum of its denominations), and emits the
   clean per-group-year counts plus a gold-standard reference table.
2. Browser, live: loads the counts and computes rates, Wilson and Newcombe
   intervals, and the frozen-family Benjamini-Hochberg verdicts itself. It only
   ever sums clean counts and skips suppressed (null) cells; it never re-derives
   the suppression rule.

The browser's results are unit-tested against the R reference, so every live
number has an offline gold standard it must reproduce. The multiple-comparison
family size `m` is fixed by the pre-specified frozen families, never by what is
on screen, which keeps the verdicts matching the published analysis and prevents
significance-shopping.

## Layout

```
equalopps_2015-2024_merged.csv   the one dataset (tidy long format)
pipeline/                        R: load, clean, statistics, export
  01_load_clean.R                load + coherence + reference flags + aggregates
  02_stats_functions.R           Wilson, Newcombe, BH widening, rate ratio, E-value (self-tests)
  04_export.R                    regenerate every front-end artefact (run this)
site/                            the static web app
  index.html  js/  data.js       the explorer (open or serve this)
  data/counts.json  reference.json
  test/test_stats.js  test.html  JS-vs-R oracle tests
extracted_docs/                  governance + build plan (binding brief)
```

## Rebuild the data

In R, from the project root:

```r
source("pipeline/04_export.R")
```

This regenerates `site/data/counts.json`, `site/data/reference.json`,
`site/data.js`, and `site/reference.js`, and prints the verification checks
(reconciliation, `bar_excludes_null == significant_after_bh` on every family row,
the British Welsh case). A build whose assertions fail must not ship.

## Run locally

The site is fully static and self-contained (Plotly, fonts, and data are all
vendored). Either:

- Open `site/index.html` directly in a browser (works from `file://`), or
- Serve it: `node site/server.js` then visit `http://localhost:8137`.

## Verify

- Data integrity (counts.json faithful to source, no zero-fills, aggregates
  correct, reconciliation): `Rscript pipeline/verify_all.R`
- Every significance family's R verdicts (the oracle for the browser):
  `Rscript pipeline/verify_families.R`
- Statistics engine vs R oracle: `node site/test/test_stats.js`
- In the browser: open `site/test.html` (green banner = browser reproduces R).
- R statistics self-tests: `Rscript pipeline/02_stats_functions.R`

The full chain is checked: source CSV -> counts.json (every group-year matches
exactly) -> browser live statistics (every family reproduces R, every verdict).

## Deploy

Upload the `site/` folder to any static host (GitHub Pages, Netlify, Cloudflare
Pages, free tier). No backend, no build step. The lack of a server is also what
keeps the suppression handling in one vetted place.

## Views

- Trend over time: per-year acceptance rate (or gap vs the reference group) with
  Wilson / Newcombe intervals. Lines break across suppressed years, never zero.
- Compare to reference: each group vs its reference over a chosen year window, on
  a percentage-point or rate-ratio scale, coloured by Benjamini-Hochberg
  significance for the frozen families. The characteristic dropdown also has an
  "All groups" option (under "Overview"): the master forest, every group across the
  significance families pooled under one correction. A group can be significant
  there but not in its own family because the pooled `m` differs (British Welsh is
  the known case). "All groups" is only valid here; it is disabled on the other
  tabs, which fall back to a default characteristic.
- Pre-DEI vs DEI: per-group arrow from the pre-DEI (2015-2019) value to the DEI
  (2021-2024) value, rate or gap-vs-reference, with the change tested on per-year
  values (Welch t-test) and BH-corrected. 2020 is the changeover year.
- Chart/Table toggle: Compare to reference, All groups, Pre-DEI vs DEI, and
  Representativeness each offer a "View: Chart | Table" switch. The table is a
  sortable view of the same live numbers (effect, 95% CI, p, significance in red),
  which makes the exact values copyable and the views screen-reader accessible. The
  SES pairwise matrix is already tabular, so its toggle is hidden.
- Representativeness: applicant/accepted composition vs the 2021 Census
  (England & Wales), shown as the difference from the population share (a diverging
  bar around a population zero line). Benchmarks in site/census.js, rebased to the
  answered population. Supported: ethnicity (broad and detailed), religion, sexual
  orientation, sex, disability, and socio-economic background. Characteristics with
  no benchmark are greyed out in the picker. Socio-economic background uses POLAR
  HE-participation quintiles, which are equal fifths of the young population by
  construction, so the benchmark is a flat 20% per quintile (no Census file needed);
  it is an area-based proxy assigned from home postcode. Marital status is excluded (most age-confounded; no clean
  Census breakdown to hand). Disability is AGE-ADJUSTED, not compared to the crude
  whole-population rate: because applicants are young and disability rises steeply
  with age, the Census age-specific rates (Equality-Act limited a lot or a little,
  from site/census.js CENSUS_DISABILITY_BY_AGE) are re-weighted by the applicant,
  and separately the accepted, age profile (indirect standardisation), giving an
  expected rate of about 12% rather than 18%. Computed live in explorer.js
  (ageAdjustedDisability). It adjusts for age, not the definition gap (Census
  day-to-day limitation vs self-reported condition types) or sex. Detailed
  ethnicity combines British English/Scottish/Welsh as White British (the Census
  does not split them). Other caveats on chart: all-ages benchmark for the
  non-disability characteristics, England & Wales vs UK-wide applicants.
- About & methods: a static methodology page explaining the data, live-compute plus
  R-oracle verification, suppression, Wilson/Newcombe intervals, Benjamini-Hochberg
  frozen families, the all-red significance convention, eras, the representativeness
  benchmarks (Census rebasing, disability age-adjustment, POLAR 20%), limitations,
  and a glossary. Content lives in index.html (#about); no chart.
- Download PNG: every chart view has a "PNG" button that renders the current chart
  off-screen at 2x with the title, subtitle, a source credit, and a
  noncogito.substack.com watermark baked in (downloadChart in explorer.js).
- Table: the underlying numbers (applicants, accepted, rate, 95% Wilson interval)
  for selected categories and a chosen year range, with suppressed cells marked
  and a CSV download. Significance colour is uniform: red = significant, grey =
  not; direction is shown by position, sign, or arrow.
