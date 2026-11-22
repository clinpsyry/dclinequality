# DClinPsy equal-opportunities: analysis and chart rules

This is the rulebook for every post and for the explorer. Compiled 21 November 2026 from the source documents, which are kept in `docs\` and `archive\`:

- `docs\STATS_RULES.md` (26 May 2026, the authoritative statistical reference; recovered from the claude.ai Project "DClin Equality 2")
- `docs\STATS_AND_TOOL_GOVERNANCE.md` (9 to 10 June 2026, adds the frozen families and the explorer rules)
- `docs\chart_style_guide.md` and `R\dclinpsy_style.R` (25 May 2026)
- `docs\chart_style_guide_visual.md` (31 May 2026, a generic version of the style guide; recovered from the claude.ai Project "Neuropsychology of ASD")
- `archive\may-2026-analysis\dclinpsy_analysis_summary_v2.md` (22 May 2026, early and partly superseded)

On a purely statistical point `STATS_RULES.md` wins (the governance doc says so). Otherwise the later source wins.

---

## Part A: statistical rules (blog)

### Data
- Source of truth: `data/equalopps_merged.csv` (2015 to 2025, built from the raw files by `pipeline/00_merge_raw.R`) (tidy long: `Year, Section, Category, applicants_n, accepted_n, note, source`).
- `accepted_n` blank means **suppressed**, not zero.
- Source workbooks have a known misalignment: a "Prefer not to say" row can hold the acceptance count belonging to the row below. Move it down and set the PNTS acceptance to 0. (The 2025 file has this in Marital status.)
- From 2023 the socio-economic (POLAR) quintiles come from the Clearing House **Contextual admissions** page, not the equal-opportunities workbook.

### Eras
- DEI era = 2021 to 2025 (2025 joined on 22 Nov 2026, C5; the posts before that used 2021 to 2024). Pre-DEI = 2015 to 2019.
- **2020 excluded** from both eras and never drawn as a connected line segment.
- Present-day figures use the DEI era unless the chart is about change.
- Write "DEI", never "EDI".

### Suppressed cells
- Drop the **whole row** before summing: `filter(!is.na(accepted_n), !is.na(applicants_n))`, then `group_by()` and `summarise(sum())`.
- Never use per-column `na.rm = TRUE` (it keeps the applicants but drops the acceptances, so it biases the rate).
- **Never count a suppressed cell as zero acceptances.** A suppressed band-year contributes neither numerator nor denominator.
- On trend lines a suppressed year is a gap. Never interpolate.

### Inclusion (coherence)
- Exclude: Prefer not to say, not specified, not applicable, not stated.
- Exclude roll-up "Total ..." rows (disability, ethnicity and religion are not clean partitions).
- Build aggregates from their components rather than using published totals: **Mixed (all)** = the four named Mixed groups; **Christian** = Protestant + Roman Catholic + Other Christian.
- Comma-containing merged rows: exclude or treat with care. The Baha'i / Jain micro-buckets are excluded (their composition changes year to year). Marital "Divorced/Separated, Widowed" is **kept** and reported as provided, with a note that it is a combined category.
- Thresholds: single-characteristic charts need at least 100 applicants; master forest at least 300. A pooled aggregate (for example 40+) keeps its small component bands.

### Reference groups
| Characteristic | Reference |
|---|---|
| Ethnicity | British English |
| Age | 25 to 29 (bands view); under 40 (binary split) |
| Gender | Female |
| Religion | No religion |
| Sexual orientation | Heterosexual/straight |
| Marital status | Single |
| Resident | UK |
| Socio-economic | Q3, the middle quintile (ordered gradient) |

### Effect measure and intervals
- **Percentage points (pp)** only in blog prose and charts. No rate ratios on the blog (the explorer may offer RR/OR toggles). Only exception: the E-value, which is on the risk-ratio scale by nature.
- Single proportion: **Wilson** 95% interval (`wilson_ci()` returns named `lo`, `hi`). Difference: **Newcombe** 95% interval (`newcombe_ci()`; index the result by position `[1]`, `[2]`). z = 1.959964.

### Multiple comparisons
- **Benjamini-Hochberg** within each frozen family. Plotted intervals are widened to the BH critical level so that "interval clears zero" means "BH-significant":
  1. raw p per comparison; 2. `p_bh = p.adjust(p_raw, "BH")`; 3. `rank = rank(p_raw)`; 4. `alpha_star = 0.05 * k / m` for a significant comparison (k = the number of significant comparisons in the family), `0.05 * rank / m` for a non-significant one (C9); 5. `z_star = qnorm(1 - alpha_star/2)`; 6. Newcombe interval at that `z_star`.
- Assert `bar_excludes_null == significant_after_bh` on every row.

Frozen families (locked):
| Family | m | Members |
|---|---|---|
| Ethnicity vs British English | 12 | British Scottish, British Welsh, Irish, Other White, Indian, Pakistani, Bangladeshi, Chinese, African, Caribbean, Mixed (all), Middle Eastern/North African |
| Religion vs No religion | 6 | Jewish, Buddhist, Hindu, Christian (built), Sikh, Muslim |
| Sexual orientation vs Heterosexual | 4 | Gay woman/lesbian, Gay man, Bisexual, Other |
| Marital vs Single | 2 | Married/civil partnership/co-habiting; Divorced/Separated, Widowed (combined row, say so in the text) |
| Socio-economic | 10 | All ten pairwise quintile comparisons |
| Master forest | derived | Every group with at least 300 applicants vs its own reference, **one** pooled BH across all of them (DEI era) |

Not corrected (single pre-specified tests, plain 95%):
- Women vs men.
- Age era change and SES era change: raw p (age was p = 0.003). Whether a test is pre-specified or one of a screen is a decision to state in the text.
- Don't present an underpowered breakdown (for example a year-by-year p-value grid) as if each cell were a finding. Report the aggregate test.
- Age bands are **not** a BH family; no age forest.

A group can be significant in the master forest and not in its own family because m differs (British Welsh: p_BH about 0.052 in the ethnicity family). That is expected; say so in a note.

### Change over time
- Compute the quantity per year, treat years as observations, compare eras with a t-test on per-year values. Age era test uses a 95% t-interval across years, not Newcombe on pooled counts. (For the age gap, per-year and pooled both give about −7.1 pp pre-DEI and −13.7 pp DEI, but the per-year p is the one quoted.)

### Causation boundary
- Describe, don't explain. "Disparities" and "gaps", never "discrimination".
- No untested confounding claims ("this just reflects age").
- The only licensed causal-style statement is the **E-value** bound for age vs dependants.
- All data are marginal (one characteristic at a time), so no adjustment between characteristics is possible.

### Reporting
- Give n (and accepted / total where useful).
- Be modest about small-n results even when significant (example: the divorced/separated/widowed deficit rests on 35 acceptances out of 327).
- Every number must reproduce from the data through a printed verification table.

---

## Part B: chart style

### Palette
| Use | Value |
|---|---|
| Background (plot and panel) | `#EADDCA` warm beige |
| Bars, above reference, significant | `#990F3D` FT red |
| Below reference (forests) | `#2D6CA2` blue |
| Not significant | `grey60` |
| Overall / total rows | `grey20` |
| Gridlines | `grey80`, 0.3 |
| Subtitle and axis text | `grey30`; caption `grey45` |

Not-significant points are hollow: `shape = 21, fill = "#EADDCA"`, coloured outline, `stroke = 1`.

### Type and layout
- Inter via showtext; offline fallback to `R/fonts/` (commented lines in the style file).
- `theme_minimal(base_size = 13)`; title bold 15, left-aligned to the plot; subtitle 10; caption 9; margins 20, 20, 15, 20; no legend (label directly).
- Gridlines: vertical bars drop `panel.grid.major.x`; horizontal forests drop `panel.grid.major.y`.
- Save PNG at 300 dpi, default 9 x 6 in, with `bg = "#EADDCA"`.
- Use `source("R/dclinpsy_style.R")` (from the project root) then `+ theme_dclinpsy()` and `save_chart()`.

### The look
Clean and minimal, FT / John Burn-Murdoch style: generous whitespace, no chart junk, label points and bars directly instead of a legend, faint gridlines only where they help reading.

### Text
- **Title (changed 21 Nov 2026):** a plain title that says what the chart shows (measure, groups, years, units), for example "Acceptance-rate gap by religion vs no religion, 2025 (percentage points)". No headline, no subtitle: the interpretation goes in the post text. This replaces the older "assertive title + subtitle" convention below, which the May posts used.
- **Footnote only:** the key (what dots, ticks and colours mean), the reference group and its rate, the method and the source. No findings or editorial statements.
- **Mobile first:** charts are 5.5 in wide at 300 dpi with larger text (title 19 pt, footnote 11 pt, labels about 12 pt), and forest charts put each group's name above its row. Code: `posts/next/code/03_charts_2025.R`.
- *(Superseded)* Title: an assertive sentence stating the finding, descriptive not causal.
- **Axis labels:** signed around a zero line where it helps (`+5`, `-10`).
- **n on or near each row** (ideally accepted / total).
- *(Superseded)* Subtitle: lead with the hard number, then explain the colours.
- **Caption:** source line, method note (interval type and BH), caveat. Standard source: `Source: DClinPsy Clearing House, DEI era 2021–25`. Standard caveat: "not adjusted for confounding between characteristics."
- Units in pp, labelled as such.
- No em dashes; use colons. "pp" for percentage points.

### Explorer only (not the blog)
- 2020 is included and shaded grey as a marker.
- Display has no minimum n; sub-threshold groups are shown in a separate "descriptive only" tier without significance colour and never enter m.
- RR / OR toggles allowed, each with its own interval.
- PNG export carries a noncogito.substack.com watermark.

---

## Part C: conflicts and open questions

**Settled (later source wins):**
- C1. Background was `#FFF1E5` in the 22 May summary; changed to `#EADDCA` on 25 May.
- C3. The 22 May summary used rate ratios with Wald / log intervals. Superseded by pp with Wilson / Newcombe. (The quick 2025 table in `docs/project_history.md` used RRs and so does not follow the blog rules.)

- C2. **SES reference.** The chart style guide said "middle quintiles (Q2 to Q3)". `STATS_RULES.md` and the governance doc both say Q3, with the full pairwise family (m = 10). Q3 it is.
- C4. **Divorced/Separated, Widowed.** The chart style guide's filter drops any category containing a comma, which removes this row. `STATS_RULES.md` says report it as provided, and the governance doc keeps it in the marital family (m = 2). Kept; the comma filter should exclude only the Baha'i/Jain rows by name.
- C9. **BH bar level for step-up passes (decided 22 Nov 2026).** BH is step-up: a comparison can be significant only because one ranked after it passes. At its own-rank level (`0.05 * rank / m`) its bar then crosses zero although it is significant (found: explorer, Disability 2021 to 2025, Mental health difficulties). Now every significant comparison uses `0.05 * k / m`, k = the number of significant comparisons; non-significant ones keep `0.05 * rank / m`. No verdict changes; some significant bars get shorter. Code: `bh_widen()` in `pipeline/02_stats_functions.R` and `Stats.bhWiden()` in `site/js/stats.js`. Still possible, and rare: a bar that touches zero by a hair at the edge, because the verdict is a chi-square test and the bar a Newcombe interval (SES 2016 to 2017 Q3 vs Q5, +0.009 pp; full forest 2015 to 2025 Caribbean, +0.0007 pp).
- C7. **Two versions of the theme.** `chart_style_guide_visual.md` (31 May, generic) differs from `dclinpsy_style.R` (25 May, the DClin one): title `base_size * 1.5` (19.5) vs 15, caption `grey35` vs `grey45`, no fixed margins, and an extra faded grey `#BCB3A4`. The published DClin charts use `dclinpsy_style.R`, so keep that for consistency. Use `#BCB3A4` only if you need a faded tier (for example the explorer's "descriptive only" rows).

**Open (your call):**
- C5. **2025 is in the DEI era** (decided 22 Nov 2026, replacing the 21 Nov decision to keep 2021 to 2024). The DEI era is now 2021 to 2025 everywhere: the explorer, the R pipeline (`ERA_DEI` in `pipeline/01_load_clean.R`) and new charts. DEI-era figures therefore differ from the posts published before 2025's data; for example the full forest has 36 members and 26 significant groups (the published May chart, 2021 to 2024: 31 and 22). The draft 2025 post in `posts/next/` still sets 2025 against the published 2021 to 2024 figures; settle that when writing it.
- C6. **SES for 2023 onwards** comes from the Clearing House Contextual admissions files, saved in `data/raw/contextual_admissions/` (2023 to 2025 downloaded 21 Nov 2026). Settled.
- C8. **Pooled cells (open: how to handle in the 2025 post).** When the source hides a small acceptance count it adds it to the row above. That row's success rate covers all the pooled rows, but its applicants column shows only its own, so summing reported rows overstates its rate (example: 2024 White & Black African reads 15 of 30, 50%; the source's own success rate is 15 of 93, 16.1%). Pools can span up to five rows (2021: Blind + Deaf + Wheelchair). `pipeline/00_merge_raw.R` finds all 108 (2015 to 2025) from the arithmetic and records a decision for each in `data/raw/pooled_cells.csv`: 29 hand-corrected PNTS moves, 1 suppress, 1 merge, the rest "keep" (as in the source, which reproduces the published numbers).
  - `FIX_POOLED_UPPER <- TRUE` suppresses every "keep" pool. Measured 21 Nov 2026 on 2021 to 2024: Disability loses both of its significant groups (Wheelchair, Blind: artefacts), Resident loses Other EU/EEA (pooled every year); every other family verdict is unchanged.
  - For an aggregate whose pool stays inside it, the exact figure is recoverable by also counting the pooled rows' applicants (`posts/next/code/02_pooled_cell_check.R`). Age 40+ vs under 40, per-year mean: published −7.1 pre-DEI, −13.7 DEI; exact −9.0, −14.9. 2025: −12.6 published, −13.9 exact.
  - **Decided 21 Nov 2026: the 2025 post uses the published method** (reported rows only, "keep" pools as in the source) so it compares directly with the earlier posts. Optional one-line methods note: where the Clearing House hides small counts, rates for some small groups (for example applicants over 50) are slightly overstated, which makes the age gap, if anything, a little larger than shown. Do not report the Wheelchair or Blind results individually (pooled-cell artefacts).

**Merge decisions already made for 2025 (in `data/raw/pooled_cells.csv`):**
- Resident: Prefer not to say pooled into UK, moved as every year.
- Marital: Prefer not to say (109) pooled with Divorced/Separated, Widowed (96). Over half the pool is PNTS, so the 17 acceptances are not given to Divorced; it is suppressed for 2025.
- Religion: "Baha'i, Jain" and "Other religion" recombined as "Baha'i, Jain, Other religion", the 2024 category.
- Wheelchair into Blind, Other EU/EEA into Other residence: left as in the source, like 2015 to 2024 (C8).
