> Moved here on 21 Nov 2026 from Downloads\DClin Equal\PROJECT_INDEX.md. Paths below are the OLD locations; the new layout is in the project README.

# DClinPsy equal-opportunities project: index

Compiled 21 November 2026. Nothing has been moved; this file just records where everything is.

## Timeline

| When | What | Where |
|---|---|---|
| 19 May 2026 | Downloaded Clearing House files, 2015 to 2024 entry | `Downloads\DClin Equal\` |
| 20 May 2026 | **Post 1** published: "The biggest equity gap in UK clinical psychology training is one nobody is talking about" (saved draft HTML is titled "The clinical psychologists of tomorrow look different from those of a decade ago") | noncogito.substack.com; draft at `Downloads\The clinical psychologists of tomorrow ... .html` |
| 21 May 2026 | Merged 2015 to 2024 into one table | `Downloads\Equal_opportunities_combined_2015-2024.csv` / `.xlsx` / `(1).xlsx` |
| 21 to 27 May 2026 | R analysis and charts (RRs, era forests, E-values, SES matrix, ethnicity, disability tables) | `Downloads\Equal data\` (finals in `regenerated\`) |
| 28 May 2026 | **Post 2** published: "Clinical psychology's devil is in its detail: a closer look at who gets in" | Substack; PDF at `Downloads\Equal data\regenerated\Final Draft\` |
| 9 to 10 June 2026 | Interactive explorer built (R pipeline as oracle, JS front end, Census benchmarks) | `Downloads\DClinEqualOpp App\`; GitHub `clinpsyry/dclinequality`; live at https://dclinequality.pages.dev |
| 11 June 2026 | **Post 3** published: "Introducing: Interactive DClinPsy Applicant Equality Dashboard" | Substack |
| 21 Nov 2026 | 2025 entry file downloaded | `Downloads\DClin Equal\Equal opportunities data for 2025 entry.xlsx` |

## Key files to start from

- **Best dataset:** `Downloads\DClinEqualOpp App\equalopps_2015-2024_merged.csv` (reconciled, used by the app). The May analyses used the earlier `Equal_opportunities_combined_2015-2024 (1).xlsx`.
- **Best code:** `Downloads\DClinEqualOpp App\pipeline\` (`01_load_clean.R` to `04_export.R`, plus `verify_all.R`, `verify_families.R`). Rebuild with `source("pipeline/04_export.R")`.
- **Extra Census file (27 May):** `Downloads\census_2022_UV201a_ethnic_group_21_by_sex_by_age_20_council_area_2019.csv` (Scotland's Census 2022, ethnicity by sex by age), probably pulled for a benchmark.
- **Methods and rules:** `DClinEqualOpp App\extracted_docs\STATS_AND_TOOL_GOVERNANCE.md`, `DClinEqualOpp App\README.md`.
- **May analysis notes:** `Equal data\dclinpsy_analysis_summary_v2.md`, `Equal data\chart_style_guide.md`, `Equal data\dlinpsy_style.R`.
- **May R code:** `Equal data\r.R`, `Equal data\rSave.R`, `Equal data\full_history.txt`, `Equal data\regenerated\*.R`.

## Gaps and loose ends

- Many scripts in `Equal data\regenerated\` are **0 bytes** (e.g. `dclinpsy_sex.R`, `dclinpsy_religion.R`, `dclinpsy_ses_forest.R`). The PNGs exist but the code that made them was never saved. `full_history.txt` and `rSave.R` may hold it.
- The app repo has uncommitted `.RData` and `.Rhistory` (12 June).
- The Claude Code transcripts for the June app sessions are no longer on disk.
- claude.ai Projects (from the 21 Nov export): **"DClin Equal Opportunities"** (created 19 May, no files) and **"DClin Equality 2"** (created 22 May, holds `STATS_RULES.md`, copy now in this folder). `chart_style_guide_visual.md` came from the "Neuropsychology of ASD" Project. The chats themselves are in `conversations-000.zip`, not yet downloaded.
- All rules are combined in `DCLINPSY_RULES.md` in this folder.

## 2025 entry file: first look (not yet through the pipeline)

Same layout as 2024. Quirks to handle before merging:

- Religion: "Baha'i, Jain, Other religion" is now split into two rows, and the accepted count for the pair sits on the Baha'i, Jain row (5 applicants, 27 accepted). The pipeline already excludes Baha'i/Jain rows.
- Marital status: Prefer not to say shows 17 accepted but a 8.3% rate, i.e. 17 / (109 + 96): the suppressed Divorced row is pooled into it.
- 50 to 54 and 55 and over have no accepted counts (suppressed), as in 2024.
- POLAR / socio-economic data is no longer in this file (moved to Clearing House contextual admissions page from 2024 entry).

Quick 2024 vs 2025 comparison (rate ratio, log-method 95% CI, straight from the two files):

| Contrast | 2024 | 2025 |
|---|---|---|
| Overall | 5,603 applicants, 1,154 accepted, 20.6% | 5,910 applicants, 1,177 accepted, 19.9% |
| Female vs male | 20.9% vs 19.6%, RR 1.07 (0.93 to 1.23) | 20.8% vs 15.9%, RR 1.31 (1.12 to 1.53) |
| Under 40 vs 40 and over | 21.5% vs 8.3% (25/301) | 20.9% vs 8.3% (26/315) |
| No dependants vs has dependants | RR 1.68 (1.36 to 2.07) | RR 1.84 (1.49 to 2.27) |
| White vs Black | RR 1.17 (0.92 to 1.50) | RR 1.17 (0.92 to 1.50) |
| White vs Asian | RR 1.10 (0.93 to 1.31) | RR 1.33 (1.10 to 1.60) |
| No religion vs any religion | RR 1.24 (1.11 to 1.40) | RR 1.30 (1.15 to 1.46) |
| LGB vs heterosexual | RR 1.34 (1.18 to 1.52) | RR 1.28 (1.13 to 1.45) |
| Disability vs none | RR 1.03 (0.90 to 1.18) | RR 1.10 (0.97 to 1.25) |

The 50 to 54 and 55 and over bands have suppressed acceptances, so per `STATS_RULES.md` they are dropped from both numerator and denominator (40+ here means 40 to 49). This table uses rate ratios, which the blog rules don't allow (pp only): treat it as a first look, and rerun through the pipeline with Wilson/Newcombe and the BH families before quoting anything.
