# Statistics and Tool Governance: DClinPsy Equal-Opportunities Explorer

This document is the binding brief for the interactive explorer. It is a
companion to `STATS_RULES.md`, which remains the authoritative statistical
reference. Where this document and `STATS_RULES.md` ever disagree on a purely
statistical point, `STATS_RULES.md` wins; this document adds the rules that are
specific to the data, the build, and the interactive tool, plus the decisions
made while assembling the dataset.

Read this file and `STATS_RULES.md` before writing any code.

House style note for everything produced by this project (code comments,
labels, prose, generated text): no em dashes anywhere, use colons; abbreviate
percentage points as "pp".

------------------------------------------------------------------
## 1. The single source of truth for data

- The one dataset is `equalopps_2015-2024_merged.csv`, tidy long-format, with
  columns: `Year, Section, Category, applicants_n, accepted_n, note, source`.
- `applicants_n` is an integer and is never missing.
- `accepted_n` is a nullable integer. A blank/`NA` means the acceptance count
  was suppressed in the source (a count too small to report). It does NOT mean
  zero acceptances. See rule 4.
- The `source` column records provenance. Rows marked `contextual_admissions`
  are the socio-economic (POLAR) quintiles for 2023 and 2024, which the Clearing
  House moved to a separate Contextual Admissions page from 2023 onwards. These
  were merged in and reconcile exactly to each year's total (applicants and
  acceptances both). All other rows are `equalopps_workbook`.
- The dataset is the CORRECTED version. The source workbooks contained a
  systematic misalignment where a "prefer not to say" row held acceptance
  counts belonging to the row below it. Those were moved down and the original
  PNTS acceptance cell set to 0. The PNTS rows are excluded from analysis anyway
  (rule 7), so this does not affect results, but note that the corrected
  acceptance counts for the reference groups (Female, 25-29, No disability, UK
  resident) carry that adjustment.

## 2. Architecture rule

SUPERSEDED IN ITS STRICT FORM: see rule 2a. The original rule (kept for the
record) was: ALL statistics computed in the R pipeline offline, emit a vetted
JSON, the browser ONLY displays numbers from that JSON and never computes a
count, line, p-value, interval, or effect size. The rationale was that no
forbidden computation can happen client-side if no computation happens
client-side.

## 2a. Architecture rule, revised: live computation with a fixed family (LOCKED)

DECISION: the front-end computes live, and is allowed to. The strict
no-client-computation form of rule 2 is relaxed because it forced either a large
precompute (every year window) or a less honest tool, and because the actual
risks it guarded against can be met more cheaply. The safety is preserved by
three constraints, all binding:

1. R stays the ORACLE, not a dead pipeline. R cleans and reconciles the data
   (rule 14) and emits two artefacts: (a) the clean per-group-year COUNTS
   (applicants, accepted, suppression-aware, with the constructed aggregates
   pre-built), which is the ONLY data the browser loads; and (b) a REFERENCE
   RESULTS TABLE of vetted numbers (rates, intervals, raw and BH-adjusted p,
   verdicts for the canonical windows). The browser's live results are tested
   against that table; a mismatch fails the build. So every client computation
   has an offline gold standard it must reproduce.
2. The browser only ever SUMS clean counts and skips nulls. It never re-derives
   the suppression rule (rule 4): suppressed group-years arrive as null accepted
   and are simply not summed. This is the one rule that bit the project before,
   so it is enforced in the shipped data shape, not in client logic.
3. The multiple-comparison family size `m` is FIXED by the pre-specified frozen
   family (register 8a), NEVER by how many groups the user has on screen. The
   user's selection changes what is DISPLAYED, never what is TESTED. To show any
   member's verdict the browser computes the WHOLE family (all m members) over
   the selected years, ranks them, and applies BH at the fixed m. This keeps the
   blog-matching verdicts (British Welsh: not significant in the m=12 ethnicity
   family) and makes significance-shopping structurally impossible: narrowing
   the on-screen set cannot loosen the threshold, because m does not move.

Correction method stays Benjamini-Hochberg (rules 7, 8): once the browser
computes the whole family for the fixed `m`, BH is no harder than a single-step
method and it agrees with the published analysis. The single-step (Sidak) option
in rule 7 is moot here, since its only advantage was avoiding computing the rest
of the family, which the fixed-`m` design does anyway.

Consequence for windows: year selection is now FREE (any subset, contiguous or
not, computed live), since there is no precompute to enumerate. 2020 stays
excluded from any pooled window (rule 3). The contiguous-window precompute of
rule 8b is therefore obsolete and not built; 8b is retained only for its
canonical-preset definitions (DEI 2021-2024, pre-DEI 2015-2019, full trend).

## 3. Time periods (eras)

TOOL DECISION (overrides this section for the EXPLORER only, decided 2026-06-09):
the data-vis tool does NOT split the data into eras. 2020 is treated as a normal,
fully-included year everywhere: it is a connected point on the trend, it is
selectable in custom year windows, and it pools normally. It is shaded grey on
charts purely as a reference marker (the pandemic year), which is editorial
context, not a data exclusion. The era-based rules below, the pre-DEI/DEI split,
and the era-change special elements (age, SES) apply to the BLOG analysis, not to
the explorer. The 2020-exclusion was an editorial choice for the blog.

The following remain authoritative FOR THE BLOG:

- DEI era = 2021, 2022, 2023, 2024.
- Pre-DEI era = 2015, 2016, 2017, 2018, 2019.
- 2020 is ALWAYS excluded as a transition year: never in either era, and never
  drawn as a connected segment on a trend line. It may be stored in the JSON but
  must carry a flag that keeps it off connected lines and out of era pools.
- Cross-sectional ("present-day") figures use the DEI era unless a view is
  explicitly about change over time.
- Always write "DEI", never "EDI".

## 4. Missing / suppressed data

- Suppressed acceptance (`accepted_n = NA`) means "too small to report", not
  zero.
- Drop the whole row before summing: keep only rows with both `applicants_n`
  and `accepted_n` present. Never use per-column NA handling that would keep the
  applicants while dropping the acceptances.
- A suppressed band-year contributes neither numerator nor denominator; its
  applicants are excluded from that period's rate.
- In the explorer, a suppressed group-year is a GAP: no point is plotted and the
  line is broken across it. Never interpolate across a gap. The same broken-line
  treatment applies to the excluded 2020 and to any year a series does not
  cover. Gaps may be visually flagged (for example a faint marker) but never
  filled.

## 5. Effect measures and the effect-size switch

- Percentage points (pp) are the project's standard and the explorer's DEFAULT
  measure. The blog prose uses pp only.
- The explorer MAY additionally offer a rate-ratio and/or odds-ratio toggle.
  This is a deliberate, intentional relaxation of `STATS_RULES.md` section 3 for
  the interactive tool only. It is NOT an error and must not be "corrected" back
  to pp-only.
- Switching scale is not relabelling an axis. Each scale (pp, rate ratio, odds
  ratio) needs its OWN correctly-computed effect and its OWN interval,
  precomputed per scale and stored in the JSON. The null reference line is 0 for
  pp and 1 for the ratio scales.
- The significance verdict ("does the interval exclude the null") must be
  generated so it AGREES across scales. Computed consistently it will agree;
  the pipeline must assert this.
- The E-value is NOT a general effect-size option. It is a single-purpose
  sensitivity bound for the one age-versus-dependants causal question (rule 9).
  It stays a dedicated, separately-labelled element and never appears in the
  generic effect-size dropdown.

## 6. Confidence intervals

- Single proportion (a group's own acceptance rate): Wilson interval.
- Difference of two proportions: Newcombe interval.
- All intervals 95% by default, z = 1.959964.

### 6a. BH-widened intervals for significance views
On any view where colour encodes "significant vs not" across a FAMILY of
comparisons, the plotted intervals are widened to the Benjamini-Hochberg
critical level, so that "the bar excludes the null" coincides exactly with
"significant after BH correction". Procedure:
  1. Raw p per comparison (uncorrected, e.g. chi-square).
  2. `p_bh = p.adjust(p_raw, "BH")`; `sig = p_bh < 0.05`.
  3. `rank = rank(p_raw)`; `m` = number of comparisons in the family.
  4. `alpha_star = 0.05 * rank / m`.
  5. `z_star = qnorm(1 - alpha_star / 2)`.
  6. Each comparison's Newcombe interval AT ITS OWN `z_star`.
The pipeline MUST emit, for every such row, a `bar_excludes_null` value and a
`significant_after_bh` value, and MUST assert they are equal on every row.
Families using this: ethnicity subgroups, sexuality, marital, SES pairwise
matrix, religion, master forest.

### 6b. Plain 95% intervals for single pre-specified tests
A single pre-specified comparison gets no multiple-comparison correction and a
plain 95% interval. These are: gender (women vs men), and the age era-change
test. For the age era test the unit of analysis is the per-year gap, so the
interval is a 95% t-interval across the years in each era, NOT a Newcombe
interval on pooled counts.

## 7. Significance in the tool (frozen families, BH)

DECISION: the default and the build target is frozen families with
Benjamini-Hochberg, not a single-step correction. Rationale recorded so it is
not revisited by accident:
- This data is small-n and suppression-heavy. Bonferroni's power loss lands
  hardest on the small groups, where it would call genuine disparities "not
  significant" purely for lack of power. For an equal-opportunities analysis,
  under-stating a real gap is the more damaging error, and it cuts against the
  project's small-n humility (rule 14).
- BH controls the false discovery rate, which is the better-matched error
  concept for browsing many comparisons; Bonferroni controls family-wise error,
  which is stricter than warranted here.
- The blog and `STATS_RULES.md` use BH. The tool must agree with the published
  analysis about what is significant; a tool that contradicts the blog is worse
  than no tool.

Design that follows from the decision:
- Significance is precomputed for a small set of EXPLICITLY DEFINED, FROZEN
  families. The family membership and its size `m` are fixed at build time and
  recorded in the JSON (each characteristic's `family_size_m`).
- The user toggles which precomputed verdicts to VIEW. The user cannot define a
  new comparison that triggers a fresh test, because the front-end does no
  computation (rule 2). This also prevents significance-shopping (shrinking a
  family until a result crosses the line), which matters on a sensitive topic.
- A single pre-specified test is not a family and gets no correction (rule 6b).
- Never present an underpowered breakdown (for example a year-by-year p-value
  grid) as if each cell were a finding. Report the aggregate, not the cells.

OPTIONAL LATER (not in the first build, door left open): an "advanced /
exploratory" mode that lets statistically literate users define their own
comparison set. If and only if that is built, it MUST use a single-step
correction (Šidák preferred over plain Bonferroni: same property, slightly
better powered) rather than BH, because a single-step verdict depends only on
the family size `m` and each comparison's own raw p, so it can be served from a
precomputed lookup table indexed by `m` with no in-browser statistics. BH cannot
be served this way because its verdict depends on the whole selected p-value
vector and its ranks. Such a mode must be visually walled off from the main
views, must display `m` prominently, and must carry a plain-language caveat that
the family is user-defined. The main views stay frozen-family BH regardless.

## 8. Multiple comparisons (Benjamini-Hochberg)

- Apply BH across any family of tests asked together (all ethnic groups vs the
  reference; all pairwise SES quintiles; all religions).
- Define the family explicitly and keep it stable; `m` sets the threshold.
- Age era-change is treated as pre-specified (uncorrected, raw p = 0.003). For
  consistency the SES era-change is quoted the same way (raw p).

## 8a. Frozen family register (LOCKED)

This section is the definitive list of the Benjamini-Hochberg families. It is
LOCKED: the membership and the resulting `m` are fixed here so the pipeline reads
them rather than re-deriving them by convention, and so a later edit cannot
silently move a threshold. Each family is "every listed group versus the
characteristic's reference (rule 11), BH-corrected within the family". The
pipeline still derives each integer `m` from the data at build time and asserts
it against the count implied here.

### Per-characteristic families (five)

- Ethnicity, reference British English, m = 12. Members: British Scottish,
  British Welsh, Irish, Other White background, Indian, Pakistani, Bangladeshi,
  Chinese, African, Caribbean, Mixed (all), Middle Eastern/North African.
  "Mixed (all)" is BUILT as the sum of the four named mixed sub-groups, not the
  published "Total in the Mixed group" roll-up. The Asian-other/unspecified and
  Black-other residual buckets are EXCLUDED from the family (locked decision: an
  earlier draft included them; the locked version takes them out, per rule 10).
- Religion, reference No religion, m = 6. Members: Jewish, Buddhist, Hindu,
  Christian, Sikh, Muslim. "Christian" is BUILT as the sum of Protestant, Roman
  Catholic and Other Christian. The Baha'i/Jain micro-buckets and the
  "Christian all" and "Has a religion all" roll-ups are EXCLUDED from the family.
- Sexual orientation, reference Heterosexual/straight, m = 4. Members: Gay
  woman/lesbian, Gay man, Bisexual, Other sexual orientation.
- Marital status, reference Single, m = 2. Members: Married/civil
  partnership/co-habiting, and the merged "Divorced/Separated, Widowed" row
  (reported as the combined heterogeneous category it is, per rule 10).
- Socio-economic background, m = 10. The family is the FULL pairwise quintile
  matrix (all ten Q-vs-Q pairs among Q1 to Q5), NOT four-vs-Q3. Q3 is the
  DISPLAY reference for the ordered gradient (rule 11); the correction family is
  the pairwise set. Display reference and correction family are deliberately
  different here.

### Master forest (one pooled family)

The master forest is a SINGLE pooled family across all characteristics. Its `m`
is the count of every group, across all characteristics, that clears the
300-applicant inclusion threshold, each compared to its own characteristic's
reference. Critical subtlety, settled by reading the actual script: "within"
describes only the REFERENCE logic (each group vs its own reference), NOT the
correction. `p.adjust(..., "BH")` runs ONCE over the whole row-bound stack with
no per-characteristic grouping, so the BH family is pooled into one large `m`.
The pipeline derives that integer `m` at build time over the DEI-era
cross-section (the natural reading for a present-day board).

Expected, NOT a bug: the same comparison can be significant in the master forest
but not in its own per-characteristic family, because the two families have
different `m`. The known case is British Welsh (p_BH around 0.052 within the
12-group ethnicity family, but significant in the larger pooled forest). The
explorer shows the per-characteristic verdict on the characteristic view and the
pooled verdict on the forest, with a one-line note that significance is
family-dependent, exactly as the blog handles it.

### What is NOT a BH family

- Gender (women vs men): a single pre-specified test, plain 95%, no correction
  (rule 6b).
- Age era-change and SES era-change: single pre-specified tests quoted with raw
  p (rules 6b, 8).
- Age bands: NOT a project BH family. Do not invent an age forest.

## 8b. Year-window selection and the precompute (LOCKED)

The explorer lets the user choose which years to include. This is reconciled
with the no-client-computation rule (rule 2) by precomputing, never computing
live.

- Descriptive views (per-year trend, a group's own acceptance rate): ANY year
  selection, free. Each year's value and Wilson interval is precomputed
  independently, so selecting years is pure display and triggers no computation.
- Significance forest (BH-coloured group-vs-reference): the window is restricted
  to CONTIGUOUS year ranges. The pipeline precomputes the frozen-family BH result
  for EVERY contiguous window over the usable years (2015-2019, 2021-2024). The
  front-end looks up the precomputed result for the chosen window and computes
  nothing. Family membership and `m` stay frozen (8a); only the data window moves.
- 2020 is never a counted year inside any window (rule 3). A window written as
  2019-2021 pools 2019 and 2021 only; 2020 is skipped, not summed.
- Non-contiguous subsets are NOT offered: pooling disconnected periods is not
  meaningful, and free subset selection edges into time-window
  significance-shopping (cf rule 7).
- The three canonical timepoints remain as labelled presets that match the blog:
  DEI cross-section (2021-2024), pre-DEI (2015-2019), and full trend. Exploratory
  windows are visually distinguished, and the forest always shows the active
  window and `m`.

Mixed (all) in a window that includes a fused year (2015, 2018, 2019, 2020,
2021): Mixed (all) STAYS in the ethnicity BH family. The fused source row
"Mixed (not specified), Other Mixed background" supplies the fourth component for
those years; the small not-specified contamination is carried and surfaced as a
tooltip note (decided, not silently dropped).

## 9. Inclusion thresholds: display versus significance family

DECISION (tool relaxation of the blog's thresholds): in the explorer, DISPLAY is
separated from significance-FAMILY membership. Rationale: a static chart rations
space and a reader cannot interrogate a tiny bar, but an interactive chart with
honest error bars hands that judgment to the user. So the 100-applicant and
300-applicant thresholds are RELAXED FOR DISPLAY but RETAINED for defining the
correction family.

- Descriptive views (per-year rate, trend, a group's own acceptance rate): show
  EVERY group, with no minimum n. A Wilson interval on a single proportion is not
  a multiple comparison, so there is no statistical cost to showing a small
  group; its wide interval carries the uncertainty (rule 14). Groups whose data
  is entirely suppressed or absent simply have nothing to plot.
- Significance views (forest, group-versus-reference with BH colour): the BH
  family stays the STABLE, PRE-SPECIFIED set (the threshold-qualifying groups,
  the same membership the blog uses). Sub-threshold groups are still SHOWN, but
  in a visually distinct "descriptive only, not in the corrected test" tier:
  their effect and a plain interval, WITHOUT the significance colour. This keeps
  the one clean meaning "coloured bar excludes the null == BH-significant", keeps
  the qualifying groups' verdicts matching the blog, and still shows the small
  groups for the user to judge.
- Sub-threshold groups MUST NOT enter `m`. Letting them inflate the family would
  tighten the BH threshold and could flip a larger group's verdict, creating a
  blog-versus-tool inconsistency for a group that appears in both. Display does
  not imply family membership.
- Pooled-aggregate exception (unchanged): when the group itself is a pooled
  aggregate (for example "40+"), its sub-threshold component bands belong in the
  pool; do not drop a component band just because it alone is under 100.
- Sub-threshold groups are never silently mixed in with qualifying groups in a
  way that implies equal footing; the descriptive tier must be clearly marked.

## 10. Coherence (which categories to include)

- Exclude: "prefer not to say", "not specified", "not applicable", "not stated".
- Exclude: roll-up "Total ..." rows. (Summing a section that contains roll-up
  rows double-counts: disability, ethnicity, and religion have such rows and are
  not simple partitions.)
- Prefer transparently constructed groups over opaque published totals. Example:
  ethnicity "Mixed (all)" is built as the sum of the four named mixed sub-groups,
  not the published "Total in the Mixed group".
- A single merged residual row that cannot be split (for example marital
  "Divorced/Separated, Widowed") is reported as provided, with a note in the
  text that it is a combined, heterogeneous category.

## 11. Reference groups (largest group of each characteristic)

- Ethnicity: British English
- Age: 25-29 (peak band) for the bands view; for the over/under split the
  reference is "under 40"
- Gender: Female
- Religion: No religion
- Sexual orientation: Heterosexual/straight
- Marital status: Single
- Resident status: UK
- Socio-economic background: Q3 (the middle quintile), treated as an ordered
  gradient rather than vs-largest.

## 12. Change over time

- Compute the quantity separately for EACH year, then compare the years as
  observations, so year-to-year variation is treated as noise.
- Test the era difference with a t-test on the per-year values.
- Pre-specified single era-comparison: uncorrected p.

## 13. Causation boundary

- Describe disparities; do not explain them causally.
- Use "disparities" and "gaps", not "discrimination". This applies to every
  label, tooltip, and piece of generated text in the explorer.
- The ONLY licensed causal-style claim is the E-value sensitivity bound for the
  age-versus-dependants question.
- Do not assert untested confounding (for example "this just reflects age") on a
  chart or in prose; either test it or omit the claim.

## 14. Reporting hygiene and reproducibility

- State n (and ideally accepted/total) so readers can judge precision; surface
  this in tooltips.
- Be humble about small-n findings even when significant: let the wide interval
  carry the uncertainty.
- Every reported number must be reproducible from the live data via a printed
  verification table before it is trusted. The pipeline prints this table on
  every run and it must reconcile (section sums to year totals where the section
  is a clean partition; `bar_excludes_null == significant_after_bh` on every
  family row).
