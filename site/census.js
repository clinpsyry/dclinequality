// ============================================================================
// Census 2021 population benchmarks (England & Wales, ONS) for the
// Representativeness view. Percentages are REBASED to the "answered" population
// (i.e. excluding "not answered / not stated") so they are on the same base as
// the applicant data, which excludes "prefer not to say".
//
// CAVEATS (surfaced on the chart):
//  - Disability is AGE-STANDARDISED. All others are whole-population, ALL AGES,
//    so part of any gap reflects the young, graduate applicant pool rather than
//    clinical-psychology-specific representation.
//  - Geography is England & Wales; applicants are UK-wide.
//
// Source files (ONS Census 2021 bulletins) in the project root:
//  Census Ethnicity.xlsx, Census Religion.xlsx, Census Sexuality.xlsx,
//  Census Disability.xlsx, percentage-of-males-and-females-in-each-ethnic-group.csv
// ============================================================================
window.CENSUS = {
  "ETHNIC GROUP (BROAD)": {
    "White": 81.7, "Asian": 9.3, "Black": 4.0, "Mixed": 2.9, "Other": 2.1
  },
  // Detailed ethnicity, computed from the persons counts in
  // percentage-of-males-and-females-in-each-ethnic-group.csv (total pop
  // 59,597,540). British English/Scottish/Welsh are combined as "White British"
  // because the Census does not split White British by nation. Gypsy/Roma folded
  // into "Other White"; "Middle Eastern (Arab)" is the Census "Arab" group.
  "ETHNICITY": {
    "White British": 74.42, "White Irish": 0.85, "Other White": 6.44,
    "Indian": 3.13, "Pakistani": 2.67, "Bangladeshi": 1.08, "Chinese": 0.75,
    "Other Asian": 1.63, "Black African": 2.50, "Black Caribbean": 1.05,
    "Other Black": 0.50, "Mixed": 2.88, "Middle Eastern (Arab)": 0.56, "Other": 1.55
  },
  "RELIGION": {        // rebased excluding "Not answered" (6.0% of total)
    "No religion": 39.5, "Christian": 49.1, "Muslim": 6.9, "Hindu": 1.8,
    "Sikh": 1.0, "Jewish": 0.5, "Buddhist": 0.5, "Other religion": 0.6
  },
  "SEXUAL ORIENTATION": {   // rebased to the answered population (from ONS counts)
    "Heterosexual": 96.6, "Gay or Lesbian": 1.66, "Bisexual": 1.39, "Other": 0.37
  },
  "GENDER": { "Female": 51.0, "Male": 49.0 },
  "DISABILITY": { "No disability": 82.2, "Any disability": 17.8 },  // crude, replaced live by age-adjusted
  // POLAR (Participation Of Local Areas, OfS) quintiles of HE participation. The
  // quintiles are equal fifths of the young population BY CONSTRUCTION, so the
  // representative benchmark is a flat 20% per quintile (no Census file needed).
  // Q1 = lowest-participation (most disadvantaged) areas. Area-based proxy.
  "SOCIO-ECONOMIC BACKGROUND": {
    "Quintile 1 (lowest)": 20, "Quintile 2": 20, "Quintile 3": 20,
    "Quintile 4": 20, "Quintile 5 (highest)": 20
  }
};

// Age-specific disability rates for AGE-ADJUSTING the disability benchmark.
// Persons % disabled (Equality-Act "limited a lot" + "limited a little"), England,
// Census 2021, derived from "disability age.xlsx" as the mean of the female and
// male age-specific rates per band. Keyed to the applicant AGE bands (which match
// the Census 5-year bands 1:1 for 20-54). "55 and over" is a population-weighted
// collapse of the Census 55-90+ bands; it carries negligible weight (~0.2% of
// applicants). The explorer re-weights these by the applicant (and accepted) age
// distribution to get an age-matched expected disability rate (~12%), which is the
// honest benchmark for a young graduate pool, far below the 17.8% whole-population
// figure (that one is standardised to a much older standard population).
window.CENSUS_DISABILITY_BY_AGE = {
  "20-24 years": 13.20, "25-29 years": 11.80, "30-34 years": 11.25, "35-39 years": 11.95,
  "40-44 years": 13.35, "45-49 years": 15.90, "50-54 years": 18.30, "55 and over": 30.10
};
