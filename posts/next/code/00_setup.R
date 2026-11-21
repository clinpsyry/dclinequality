# 00_setup.R: starting point for the 2025 post.
# Run from the project root (open "DClinPsy Equality.Rproj"), then:
#   source("posts/next/code/00_setup.R")
#
# Plan for this post (RULES.md C5): report 2025 on its own and compare it with the
# published DEI era (2021 to 2024). Rules: RULES.md. Nothing here tests anything;
# it only loads the data the same way the explorer does.

source("R/dclinpsy_style.R")          # theme_dclinpsy(), save_chart(), palette
source("pipeline/01_load_clean.R")    # load_raw(), classify(), eras, references
source("pipeline/02_stats_functions.R")  # wilson_ci(), newcombe_ci(), bh_widen(), t_interval()
# 02 is sourced after the style file on purpose: both define wilson_ci() and
# newcombe_ci(), and the pipeline's versions are the ones the explorer is tested on.

d <- classify(load_raw())

# Analysis rows only: no PNTS, no roll-ups, no Baha'i/Jain buckets, no TOTALS.
an <- d[d$in_analysis, c("Year", "Section", "Category", "applicants_n", "accepted_n", "era", "note")]

# Pool counts over a set of years, dropping suppressed group-years as whole rows
# (RULES.md: never count a suppressed cell as zero).
pool_years <- function(rows, years) {
  r <- rows[rows$Year %in% years & !is.na(rows$accepted_n), ]
  if (!nrow(r)) return(data.frame(Section = character(), Category = character(),
                                  applicants_n = integer(), accepted_n = integer(), n_years = integer()))
  out <- aggregate(cbind(applicants_n, accepted_n) ~ Section + Category, r, sum)
  out$n_years <- aggregate(Year ~ Section + Category, r, length)$Year
  out
}

dei_2021_24 <- pool_years(an, ERA_DEI)
y2025       <- pool_years(an, 2025)

# Side-by-side rates (descriptive only, %): a quick look, not a result.
compare_2025 <- merge(dei_2021_24, y2025, by = c("Section", "Category"),
                      all = TRUE, suffixes = c("_dei", "_2025"))
compare_2025$rate_dei  <- round(100 * compare_2025$accepted_n_dei  / compare_2025$applicants_n_dei, 1)
compare_2025$rate_2025 <- round(100 * compare_2025$accepted_n_2025 / compare_2025$applicants_n_2025, 1)

cat("Loaded", nrow(d), "rows,", length(unique(d$Year)), "years.",
    "Objects: d (all rows), an (analysis rows), dei_2021_24, y2025, compare_2025.\n")
