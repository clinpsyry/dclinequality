# Statistical Rules Guide: DClinPsy Equal-Opportunities Analysis

A standalone reference for the statistical conventions used throughout this
project. Every chart and every number in the blog must follow these. Where a
rule has an exception, the exception is stated explicitly.

------------------------------------------------------------------
## 1. Time periods (eras)
- DEI era = 2021, 2022, 2023, 2024, 2025 (2025 added 22 Nov 2026, RULES.md C5;
  the posts before that used 2021 to 2024).
- Pre-DEI era = 2015, 2016, 2017, 2018, 2019.
- 2020 is ALWAYS EXCLUDED as a transition year (never in either era, never on a
  trend chart's connected line).
- Present-day / cross-sectional figures use the DEI era (2021-25) unless a chart
  is explicitly about change over time.
- Always write "DEI", never "EDI".

------------------------------------------------------------------
## 2. Missing / suppressed data
- A suppressed acceptance count appears as accepted_n = NA. Suppression means
  "a count too small to report", NOT "zero acceptances".
- RULE: drop the whole row before summing -
  filter(!is.na(accepted_n), !is.na(applicants_n)).
- NEVER use per-column na.rm (it would keep the applicants while dropping the
  acceptances, distorting the rate).
- NEVER count a suppressed cell as zero acceptances. (This exact error in an old
  age chart inflated a deficit and produced unreproducible numbers.)
- Consequence: a suppressed band-year contributes neither numerator nor
  denominator; its applicants are excluded from that period's rate.

------------------------------------------------------------------
## 3. Effect measure
- Report differences in PERCENTAGE POINTS (pp), not rate ratios.
- Single exception: the E-value, which is intrinsically on the risk-ratio scale.

------------------------------------------------------------------
## 4. Confidence intervals
- Single proportion: Wilson interval (wilson_ci(), returns NAMED c(lo,hi)).
- Difference of two proportions: Newcombe interval
  (newcombe_ci(acc1,n1,acc2,n2,z), returns UNNAMED vector, index by position [1]/[2]).
- All intervals are 95% by default (z = 1.959964).

### 4a. BH-widened intervals (the key convention for significance charts)
On any chart where the colour encodes "significant vs not" across a FAMILY of
comparisons, the plotted intervals are WIDENED to the Benjamini-Hochberg
critical level, so that "the bar excludes zero" coincides EXACTLY with "the
comparison is significant after BH correction". Procedure:
  1. Compute each comparison's raw p (uncorrected, e.g. chi-square).
  2. p_bh = p.adjust(p_raw, "BH"); sig = p_bh < 0.05.
  3. rank = rank(p_raw); m = number of comparisons in the family.
  4. alpha_star = 0.05 * rank / m.
  5. z_star = qnorm(1 - alpha_star / 2).
  6. Compute each comparison's Newcombe interval AT ITS OWN z_star.
Every such script prints a bar_excl_0 column that MUST equal the colour
verdict on every row. Charts using this: ethnicity subgroups, sexuality,
marital, SES pairwise matrix, religion, master forest.

### 4b. Plain 95% intervals (single pre-specified tests)
A single, pre-specified comparison gets NO multiple-comparison correction and a
plain 95% interval. Charts using this: gender (women vs men), and the age
era-change test (pre-DEI vs DEI). For the age era test, because the unit of
analysis is the per-year gap, the interval is a 95% t-interval ACROSS the years
in each era (not a Newcombe interval on pooled counts).

------------------------------------------------------------------
## 5. Multiple comparisons (Benjamini-Hochberg)
- Apply BH across any FAMILY of tests asked together (e.g. all ethnic groups vs
  the reference; all pairwise SES quintiles; all religions).
- Define the family explicitly and keep it stable; the family size m sets the
  threshold and therefore which results are called significant.
- A single pre-specified test is NOT a family, so no correction (see 4b).
- Whether a comparison is "pre-specified" vs "one of a screen" is a substantive
  decision the analyst must make and state. Age era-change was treated as
  pre-specified (uncorrected, p = 0.003). For consistency, the SES era-change
  should be quoted the same way (raw p).
- Do not present an underpowered breakdown (e.g. a 20-cell year-by-year p-value
  grid) as if each cell were a finding; a family of underpowered, non-
  independent cells can show 0/20 "significant" while the correct aggregate test
  is clearly significant. Report the aggregate, not the cells.

------------------------------------------------------------------
## 6. Inclusion thresholds
- Individual charts: include groups with at least 100 applicants.
- Master within-characteristic forest: at least 300 applicants.
- EXCEPTION (pooled-aggregate rule): when the GROUP itself is a pooled aggregate
  (e.g. "40+" = all bands from 40 up), its sub-threshold component bands belong
  in the pool, because the group's COMBINED n is what's analysed. Do not drop a
  component band just because it alone is under 100.

------------------------------------------------------------------
## 7. Coherence rule (which categories to include)
- EXCLUDE: "prefer not to say", "not specified", "not applicable", "not stated".
- EXCLUDE: roll-up "Total ..." rows.
- EXCLUDE / treat with care: comma-containing merged residual rows.
- PREFER transparently constructed groups over opaque published totals. Example:
  the ethnicity "Mixed (all)" group is built as the SUM of the four named mixed
  sub-groups (traceable), NOT the published "Total in the Mixed group", which
  contained 63 untraceable suppressed-denominator applicants.
- If a category is a single MERGED row in the source and cannot be split (e.g.
  marital "Divorced/Separated, Widowed"), report it as provided and note in the
  text that it is a combined, heterogeneous category.

------------------------------------------------------------------
## 8. Reference groups
Use the largest group of each characteristic as the reference:
- Ethnicity: British English
- Age: 25-29 (peak band) for the bands chart; for the over/under split the
  reference is "under 40"
- Gender: Female
- Religion: No religion
- Sexual orientation: Heterosexual/straight
- Marital status: Single
- Resident status: UK
- Socio-economic background: Q3 (the MIDDLE quintile), treated as an ordered
  gradient rather than vs-largest.

------------------------------------------------------------------
## 9. Change over time
- Compute the quantity SEPARATELY for each year, then compare the years as
  observations (so year-to-year variation is treated as noise, not pooled away).
- Test the era difference with a t-test on the per-year values.
- This is distinct from pooling all applicants per era; for the age gap both
  happen to give about -7.1 / -13.7, but the per-year approach is the one whose
  uncertainty is honestly represented and whose p-value is quoted.
- Pre-specified single era-comparison: uncorrected p.

------------------------------------------------------------------
## 10. Causation boundary
- Describe disparities; do not explain them causally.
- Use "disparities" / "gaps", not "discrimination".
- The ONLY licensed causal-style claim is the E-value sensitivity bound for the
  age vs dependants question (how strong an unmeasured confounder would need to
  be to explain the age gap, vs how strong dependant-status actually is).
- Do not assert untested confounding (e.g. "this just reflects age") on a chart
  or in prose; either test it or omit the claim.

------------------------------------------------------------------
## 11. Reporting hygiene
- No em dashes anywhere; use colons.
- Percentage points abbreviated "pp".
- State n (and ideally accepted/total) so readers can judge precision.
- Be humble about small-n findings even when significant: let the (wide) CI
  carry the uncertainty and avoid over-precise prose. Example: the marital
  divorced/sep/widowed deficit is real and significant but rests on 35
  acceptances out of 327.
- Every reported number must be reproducible from the live data via a printed
  verification table before it is trusted.
