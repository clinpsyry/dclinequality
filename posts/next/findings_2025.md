# 2025 entry: findings

Analysis run 21 November 2026. Code: `posts/next/code/01_2025_analysis.R` and `02_pooled_cell_check.R`. Tables: `posts/next/tables/`.

## How this was done

- **Same method as the published posts** (RULES.md): gaps in percentage points against each characteristic's reference group, Newcombe intervals, Benjamini-Hochberg within the same frozen families (same members, same m), intervals widened to the BH level so "interval clears 0" means "significant".
- **Single pre-specified tests, plain 95%:** men vs women, 40+ vs under 40, dependants, SES Q1 vs Q5.
- **2025 is reported on its own** and set against the published DEI era (2021 to 2024). "Does it hold" is descriptive: is the 2025 gap the same sign as the DEI gap, and inside the range of the four DEI years' own gaps.
- **Checked first:** the script reproduces every published 2021 to 2024 family verdict and the STATS_RULES age gaps (−7.1 pp pre-DEI, −13.7 pp DEI) before it produces any 2025 figure.
- **One year has about a quarter of the data of the era.** Intervals are wider, so a group that was significant in 2021 to 2024 and has a similar gap in 2025 but is not significant has usually lost power, not changed. Read the gaps, not the verdicts.

## The headline: the picture holds

All four single-test gaps are significant in 2025, the same sign as 2021 to 2024, and inside the DEI years' range.

| Gap (pp) | 2021 to 2024 | DEI year range | 2025 (95% CI) |
|---|---|---|---|
| 40+ vs under 40 | −13.7 | −16.7 to −12.3 | **−12.6** (−15.4 to −8.9) |
| Has dependants vs none | −11.3 | −13.5 to −8.8 | **−9.7** (−12.1 to −6.9) |
| SES Q1 vs Q5 | −7.1 | −8.9 to −5.1 | **−8.1** (−11.8 to −4.2) |
| Men vs women | −3.6 | −5.6 to −1.3 | **−4.9** (−7.3 to −2.2) |

- **Applications:** 5,910, up 5.5% on 2024 (5,603). 1,177 accepted, a success rate of 19.9% (20.6% in 2024).
- **Age is still the largest gap.** Applicants aged 40+ were accepted at 8.3%, against 20.9% for under-40s. Every age band trails 25 to 29 (24.5%): 20 to 24 by 9.0 pp, 30 to 34 by 6.4 pp, 35 to 39 by 11.3 pp, 40+ by 16.3 pp. The 30 to 34 gap is wider than in any DEI year (range −4.9 to −3.3).
- **The sex gap widened again.** It had narrowed to −1.3 pp in 2024; in 2025 men trail women by 4.9 pp (15.9% vs 20.8%), the second widest gap in the series after 2022.
- **SES:** the advantage sits with the highest-participation quintile. Q5 (25.2%) is significantly ahead of Q1, Q2 and Q3; Q1 to Q4 are not distinguishable from each other in 2025.

## Ethnicity

Reference: British English, 23.2% in 2025.

- **Significant in 2025:** British Scottish (−7.4 pp) and Other White background (−7.1 pp), both also significant in 2021 to 2024.
- **Same gap, no longer significant:** Pakistani (−7.0 pp; DEI −7.8) and African (−5.9 pp; DEI −5.0). This is the single-year power point, not a closing gap.
- **Every group except Chinese is below British English in 2025.** Several gaps are wider than in any DEI year: Irish (−8.0), Indian (−6.0), Bangladeshi (−10.5, 63 applicants), Caribbean (−5.5, 85 applicants). None is significant after correction; treat as a direction to watch, not a finding.
- **Broad groups (vs White, 20.8%):** Asian −5.1 pp, significant and wider than the DEI average (−3.4). Black −3.1 pp, close to the DEI gap (−2.9) but not significant on one year. Mixed +0.1 pp.

## Religion

Reference: No religion, 21.7%.

- **Muslim applicants: −8.4 pp, significant**, and wider than any DEI year (range −8.2 to −5.1).
- **Christian (all): −4.3 pp, significant** (DEI −2.5).
- **Jewish applicants reversed:** +10.3 pp in 2021 to 2024 (significant), −7.4 pp in 2025. This rests on 5 acceptances out of 35 applicants and is not significant: report with care.

## Sexual orientation

Reference: Heterosexual/straight, 18.5%.

- **Bisexual: +5.9 pp, significant**, above every DEI year (range +3.1 to +5.7).
- Gay woman/lesbian +5.4 pp and Other +3.9 pp: same direction as 2021 to 2024, not significant on one year. Gay man +0.0 pp (DEI +3.8, not significant either time).

## Marital status, disability, residence

- **Married/co-habiting vs single: −2.2 pp** (p_BH 0.05, not significant). In 2021 to 2024 the gap was +0.5 pp, so this is outside the DEI range.
- **Divorced/Separated, Widowed: not reportable for 2025.** The source pooled its acceptances with "Prefer not to say", which is over half the pool (decision recorded in `data/raw/pooled_cells.csv`).
- **Disability: no group differs from No disability in 2025.** In 2021 to 2024 only Wheelchair users and Blind/partially sighted were flagged; both flags are artefacts (next section).
- **Other EU/EEA residents: −10.9 pp, significant**, as in every year. Their count includes "Other residence" acceptances, so the true gap is larger.

## Data quality: pooled cells (affects published numbers too)

When the Clearing House hides a small acceptance count, it adds it to the row above. That row's success rate is calculated over all the pooled rows, but its applicants column shows only its own. Summing the reported rows (the published method) therefore keeps the hidden acceptances and drops the hidden applicants. The merge script now finds every case from the sheets' own success rates (108 across 2015 to 2025, some covering three to five rows) and records a decision for each.

What it changes:

- **The age gap is larger than published.** In 2022 to 2025 the 45 to 49 band's count includes the 50+ bands. Counting their applicants too gives the exact 40+ rate:

  | Per-year mean gap, 40+ vs under 40 | Pre-DEI | DEI | 2025 |
  |---|---|---|---|
  | Published method | −7.1 | −13.7 | −12.6 |
  | Exact | −9.0 | −14.9 | −13.9 |

  The story holds and is slightly stronger: the gap widened between eras and 2025 is in line with 2021 to 2024.
- **The disability "significant" results in the explorer are artefacts.** Example: 2021 Blind/partially sighted reads 10 of 11 accepted (91%), but the sheet's own success rate is 10 of 41, the Blind, Deaf and Wheelchair rows together (24.4%). Taken together, those three groups are accepted at about the No disability rate (2021: 24.4% vs 22.2%; 2025: 21.2% vs 19.6%). Individually they cannot be separated.
- **Smaller effects:** some single ethnic groups in single years (for example Caribbean 2019 to 2021 and 2024, African 2023), and Other EU/EEA every year. Suppressing every uncorrected pool changes only the Disability and Resident verdicts in 2021 to 2024; ethnicity, religion, sexuality, marital, age and SES verdicts are unchanged (RULES.md C8).

## Not done yet

- The live explorer is unchanged and still shows the two disability artefacts.
- Decided 21 Nov 2026: the post uses the published method for comparability (RULES.md C8), with an optional one-line methods note.

## Charts

`posts/next/charts/`, made by `posts/next/code/03_charts_2025.R` in the house style, mobile first (5.5 in at 300 dpi, checked at 375 px wide), plain descriptive titles, no subtitles. Comparison figures are a dark tick (or line, on the bars).

1. `01_headline_gaps_2025.png`: the four single-test gaps
2. `02_age_gap_trend_2015-2025.png`: age gap by year
3. `03_age_bands_2025.png`: acceptance by age band
4. `04_sex_gap_trend_2015-2025.png`: sex gap by year
5. `05_ethnicity_2025.png`
6. `06_religion_2025.png`
7. `07_sexual_orientation_2025.png`
8. `08_socio_economic_2025.png`
9. `09_competition_2015-2025.png`: applicants, acceptances, acceptance rate
10. `10_contextual_admissions_2025.png`: ten contextual questions, 2025 vs 2023–24
11. `11_contextual_widening_2023-2025.png`: family breakdown and first in family by year
12. `12_applicant_mix_2015-2025.png`: share of applicants with a disability, LGB, aged 30+, with dependants
13. `13_applicants_vs_accepted_2025.png`: share of applicants vs share of acceptances
14. `14_master_forest_2025.png`: the master ("full") forest, made by `code/04_master_forest_2025.R`. Same 31 groups, references and single Benjamini-Hochberg correction as the published May chart (the script first reproduces all 22 published significant groups). Socio-economic reference is Q2 and Q3 combined, as published.
    - Still significant in 2025: all age bands, has dependants, men, EU/EEA residents, Muslim, Roman Catholic, Christian (other), Other White, British Scottish, Irish, Pakistani, Bisexual, most advantaged areas (Q5).
    - Significant in 2021–24, not in 2025: Gay woman/lesbian, African, British Welsh, least advantaged areas (Q1); Divorced/widowed not reportable.
    - New in 2025: Other British (white), −8.2 pp (134 applicants).

## Other 2025 angles (first pass, 21 Nov 2026)

- **Competition:** applicants 3,565 (2015) to 5,910 (2025); acceptances 1,135 (2022) to 1,177 (2025); acceptance rate 25.1% (2022), 23.7%, 20.6%, 19.9%.
- **Contextual admissions** (asked since 2023; table `tables/contextual_2025.csv`; BH across the ten questions within 2025, my choice, not yet in RULES.md):
  - Family relationship broke down before 19: 14.0% vs 20.7%, −6.7 pp, significant; −2.4 (2023), −4.1 (2024).
  - First in family at university: 18.1% vs 22.1%, −4.0 pp, significant; −1.9 (2023), −2.2 (2024).
  - Care-experienced (99 applicants) and refugee status (49) point the same way but are not significant. Free school meals and household income support: small, not significant.
- **Applicant mix:** declared disability 8.9% (2015) to 19.5% (2025); LGB 6.1% to 18.3%; aged 30+ 27.1% and with dependants 12.0%, both the highest in the series. Applicants with any disability were accepted at or above the no-disability rate in every year since 2019 (2025: +2.0 pp).
- **Who is accepted, 2025:** aged 25-29 are 53% of applicants and 65% of acceptances; British English 47% and 54%.

Not redrawn for 2025: marital status (Divorced/Separated, Widowed not reportable), disability (no group differs; the published flags are artefacts), the master forest and the E-value chart.
