# Build Plan: DClinPsy Equal-Opportunities Interactive Explorer

This is the plan of action for building the interactive explorer. Read
`STATS_AND_TOOL_GOVERNANCE.md` and `STATS_RULES.md` first; this plan assumes
their rules and does not restate the statistics in full.

House style: no em dashes, use colons; "pp" for percentage points.

------------------------------------------------------------------
## 1. Goal and scope

Build a static, hostable web explorer (in the spirit of Our World in Data) where
a user can reproduce the project's charts: per-year acceptance rates with error
bars and broken trend lines, and group-versus-reference comparisons with
significance, while switching timepoints and effect-size scales. All statistics
are precomputed; the browser only displays vetted numbers.

In scope: the multi-year equal-opportunities characteristics (age, gender,
marital, sexual orientation, dependants, resident, socio-economic background,
disability, religion, ethnicity).

Out of scope for the first build, but noted as a possible later add: the
2024-only Contextual Admissions deprivation indicators (free school meals,
first-generation, care experience, estrangement, young-carer status, refugee
status, contextual offers, disadvantage bursaries). These are single-year and
cannot support trend or era analysis, so if ever shown they must be a clearly
separated "2024 snapshot" panel, never on a trend line.

## 2. Architecture

Three layers, strictly separated:

1. Data + statistics (R, offline): reads `equalopps_2015-2024_merged.csv`,
   applies all rules, computes every number, emits one vetted JSON file and
   prints a verification table.
2. Transport: a single static JSON file (`explorer_data.json`) committed to the
   repo. It is the only thing the front-end loads.
3. Front-end (static HTML/JS): loads the JSON and renders charts and controls.
   Contains zero statistics code.

This separation is the safety guarantee. Do not collapse it (no API that
recomputes on the fly, no client-side aggregation).

## 3. Statistics / precompute layer (R)

Responsibilities, in order:

1. Load and clean: read the CSV, keep `Year, Section, Category, applicants_n,
   accepted_n`. Apply coherence filtering (drop PNTS/not-specified/not-
   applicable/not-stated and roll-up "Total" rows; build transparent aggregates
   such as "Mixed (all)" from named sub-groups). Attach reference-group flags.
2. Suppression: at the point of any sum, drop rows missing `accepted_n`
   entirely. Never zero-fill. Carry a per-year `suppressed` flag through to the
   JSON.
3. Eras: tag 2020 as excluded; define pre-DEI (2015-19) and DEI (2021-24) pools.
4. Per-group per-year series: rate, Wilson interval (lo, hi), applicants,
   accepted, suppressed flag, and an `exclude_from_trend` flag for 2020.
5. Effects vs reference, precomputed PER SCALE:
   - pp: difference, with BH-widened Newcombe interval inside a significance
     family, or plain 95% Newcombe for a single pre-specified test.
   - rate ratio: with its own interval.
   - odds ratio: with its own interval.
   The null is 0 for pp, 1 for the ratios.
6. Significance: for each frozen family, compute raw p, BH-adjusted p, the
   per-comparison `z_star`, and emit `significant_after_bh` and
   `bar_excludes_null`. Assert they are equal on every row.
7. Special precomputed elements:
   - age era-change: per-year gaps, pre-DEI and DEI means, t-interval, raw p.
   - SES era-change: same approach, raw p (now that SES is complete 2021-24).
   - age-versus-dependants E-value: point and interval, with its note. This is
     the only causal-style element.
8. Emit JSON and print the verification table. The run fails loudly if any
   assertion (reconciliation, verdict equality) does not hold.

Helper functions to implement or reuse: `wilson_ci()` (named lo/hi),
`newcombe_ci(acc1, n1, acc2, n2, z)` (unnamed, index by position), the
BH-widening routine, the per-year t-interval, and the E-value.

## 4. JSON schema (sketch, refine during build)

```
{
  "meta": {
    "generated_at": "...",
    "source_file": "equalopps_2015-2024_merged.csv",
    "z_95": 1.959964,
    "eras": { "pre_dei": [2015,2016,2017,2018,2019],
              "dei": [2021,2022,2023,2024],
              "excluded": [2020] }
  },
  "characteristics": [
    {
      "id": "ethnicity",
      "label": "Ethnicity",
      "reference_group": "British English",
      "family_size_m": 7,
      "groups": [
        {
          "id": "indian", "label": "Indian",
          "below_threshold": false, "small_n_flag": false,
          "by_year": [
            { "year": 2015, "applicants": 0, "accepted": null,
              "rate": null, "ci_lo": null, "ci_hi": null,
              "suppressed": true, "exclude_from_trend": false },
            ...
            { "year": 2020, ..., "exclude_from_trend": true }
          ],
          "effects_vs_reference": {
            "pp": { "value": -3.1, "ci_lo": -5.0, "ci_hi": -1.2,
                    "ci_type": "newcombe_bh", "null": 0 },
            "rr": { "value": 0.82, "ci_lo": 0.71, "ci_hi": 0.95, "null": 1 },
            "or": { "value": 0.79, "ci_lo": 0.66, "ci_hi": 0.94, "null": 1 }
          },
          "significant_after_bh": true,
          "bar_excludes_null": true
        }
      ]
    }
  ],
  "special": {
    "age_era_change": { "pre_dei_gap": -7.1, "dei_gap": -13.7,
                        "t_ci_lo": ..., "t_ci_hi": ..., "p_raw": 0.003 },
    "ses_era_change": { ... "p_raw": ... },
    "age_dependants_evalue": { "evalue": ..., "evalue_ci": ..., "note": "..." }
  }
}
```

Notes: a suppressed or excluded year has `null` numeric fields so the front-end
draws a gap. `bar_excludes_null` must equal `significant_after_bh`.

## 5. Front-end

Recommended starting library: Plotly.js. It gives native error bars, hover
tooltips, multi-series overlay, and an OWID-like feel with little code, so effort
goes into the controls. D3 can come later if a closer house style is wanted.

Views:

1. Trend view: per-year rate with Wilson error bars, connected with a broken
   line across 2020 and across any suppressed year. Multiple groups may be
   overlaid (each series is independent and pre-vetted). No live differencing
   between overlaid series.
2. Comparison / forest view: each group's effect versus its reference with its
   interval, coloured by significance. The effect-size switch changes the scale,
   the interval, and the null line (0 for pp, 1 for ratios). Order by effect or
   by name.
3. Era view: pre-DEI versus DEI summary with the precomputed era-change result
   shown honestly (per-year points behind the summary where useful).

Controls:

- Characteristic picker.
- Group multi-select. All groups are selectable and shown, with no minimum n on
  descriptive views; sub-threshold groups appear in the distinct "descriptive
  only" tier on significance views and never enter the correction family `m`
  (governance rule 9). Never silently mixed with qualifying groups.
- Timepoint toggle: DEI cross-section, full trend, or pre-DEI vs DEI.
- Effect-size switch: pp (default), rate ratio, odds ratio. The E-value is NOT
  in this control; it is its own labelled element on the age view only.
- Confidence-interval on/off.
- Significance highlight on/off.

Every tooltip shows n (and accepted/total where available) and, for small-n
groups, leans on the wide interval rather than over-precise text.

## 6. Missing-data UX

- 2020: omitted from connected lines, optionally shown as a faint isolated
  marker labelled "transition year, excluded".
- Suppressed group-years: gaps, never interpolated; optional faint marker.
- Socio-economic background: complete 2015-2024 now, with 2023 and 2024 sourced
  from the Contextual Admissions page (recorded in the data `source` column).
  No user-facing caveat is needed about a gap, but the provenance note can be
  surfaced on hover.

## 7. Hosting and reproducibility

- Fully static: deploy on GitHub Pages, Netlify, or Cloudflare Pages, free tier.
  No backend, which is also what keeps the suppression bug from ever returning.
- Version control from the start. The repo holds the CSV, the R pipeline, the
  emitted JSON, and the front-end. Every published number traces back to a
  re-runnable script (rule 14).
- The verification table is part of the build: a JSON that fails its assertions
  must not ship.

## 8. Phased plan

Phase 1: Data layer. Confirm the merged CSV loads, implement load + clean +
coherence + reference flags + suppression handling + era tagging. Print a basic
reconciliation.

Phase 2: Statistics + JSON. Implement the CI/effect/significance functions,
precompute per-year series and per-scale effects, the frozen families with BH
widening, and the special elements. Emit `explorer_data.json`. Print the full
verification table with assertions.

Phase 3: Front-end scaffold. Static site that loads the JSON and renders the
trend view (error bars, broken lines, overlay).

Phase 4: Comparison / forest view plus the effect-size switch (per-scale
intervals and null lines).

Phase 5: Era view plus the special elements (age and SES era-change, the
age-versus-dependants E-value as its own labelled element).

Phase 6: Missing-data UX, tooltips with n, threshold marking, accessibility,
visual polish.

Phase 7: Deploy as a static site; document how to rebuild the JSON from the CSV.

## 9. Resolved decisions

- Significance and multiple-comparison correction: frozen families with
  Benjamini-Hochberg, decided. No Bonferroni/single-step switch in the main
  build. A single-step (Šidák) "advanced" mode for user-defined families is
  explicitly out of the first build but the door is left open; see
  `STATS_AND_TOOL_GOVERNANCE.md` section 7 for the rationale and the conditions
  it must meet if ever built.
- Cross-characteristic overlay: disabled (no live differencing).

## 10. Open decisions for the user

1. Effect-size scales to offer: pp only, pp plus rate ratio, or pp plus rate
   ratio plus odds ratio. Default assumption in this plan: all three, with pp as
   default.
2. The 2024-only deprivation snapshot: include as a separate panel later, or
   leave out entirely. Default assumption: out of the first build.
3. Exact family membership per characteristic: confirm which comparisons belong
   to each frozen family, since `m` drives which results are called significant.
