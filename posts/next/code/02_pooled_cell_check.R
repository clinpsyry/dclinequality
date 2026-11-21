# 02_pooled_cell_check.R: how much the source's pooled cells move the headline
# figures. Run from the project root after 01_2025_analysis.R.
#
# The published method sums only rows with a reported acceptance count. Where the
# source pooled a hidden row's acceptances into the row above, that sum keeps the
# hidden row's acceptances but drops its applicants. For an aggregate whose pool
# stays inside the aggregate (40+, or the disability rows taken together) the
# exact figure is recoverable: count the pooled rows' applicants too.
d <- read.csv("data/equalopps_merged.csv", stringsAsFactors = FALSE, check.names = FALSE)
pooled_into <- function(note) {   # names of the hidden rows a "keep" note covers
  m <- regmatches(note, regexpr("(?<=with ').*(?=' below)", note, perl = TRUE))
  if (length(m) == 0) return(character(0))
  sub("50-54 years. 55 and over", "50-54 years, 55 and over", strsplit(m, " \\+ ")[[1]], fixed = TRUE)
}
AGE_OLD   <- c("40-44 years", "45-49 years", "50-54 years", "55 and over", "50-54 years, 55 and over")
AGE_YOUNG <- c("20-24 years", "25-29 years", "30-34 years", "35-39 years")

agg <- function(y, sec, cats, exact) {
  r <- d[d$Year == y & d$Section == sec & d$Category %in% cats, ]
  rep <- r[!is.na(r$accepted_n), ]
  app <- sum(rep$applicants_n); acc <- sum(rep$accepted_n)
  if (exact) {   # add applicants of hidden rows whose acceptances sit in a reported row here
    hidden <- unique(unlist(lapply(rep$note, pooled_into)))
    stopifnot(all(hidden %in% cats))   # the pool must stay inside the aggregate
    app <- app + sum(r$applicants_n[r$Category %in% hidden & is.na(r$accepted_n)])
  }
  c(app = app, acc = acc)
}
rows <- lapply(2015:2025, function(y) {
  o_pub <- agg(y, "AGE", AGE_OLD, FALSE); o_ex <- agg(y, "AGE", AGE_OLD, TRUE)
  u_pub <- agg(y, "AGE", AGE_YOUNG, FALSE); u_ex <- agg(y, "AGE", AGE_YOUNG, TRUE)
  data.frame(year = y,
    rate_40plus_published = 100 * o_pub["acc"] / o_pub["app"], rate_40plus_exact = 100 * o_ex["acc"] / o_ex["app"],
    apps_40plus_published = o_pub["app"], apps_40plus_exact = o_ex["app"],
    gap_published = 100 * (o_pub["acc"] / o_pub["app"] - u_pub["acc"] / u_pub["app"]),
    gap_exact     = 100 * (o_ex["acc"] / o_ex["app"] - u_ex["acc"] / u_ex["app"]), row.names = NULL)
})
age <- do.call(rbind, rows)
age$shift_pp <- age$gap_exact - age$gap_published
cat("== 40+ vs under 40, per year (pp) ==\n"); print(round(age, 2), row.names = FALSE)
cat(sprintf("\nPer-year mean gap, published method: pre-DEI %.1f, DEI %.1f, 2025 %.1f\n",
            mean(age$gap_published[age$year %in% 2015:2019]), mean(age$gap_published[age$year %in% 2021:2024]),
            age$gap_published[age$year == 2025]))
cat(sprintf("Per-year mean gap, exact:            pre-DEI %.1f, DEI %.1f, 2025 %.1f\n",
            mean(age$gap_exact[age$year %in% 2015:2019]), mean(age$gap_exact[age$year %in% 2021:2024]),
            age$gap_exact[age$year == 2025]))
write.csv(round(age, 2), "posts/next/tables/age_gap_pooled_cell_check.csv", row.names = FALSE)

# Disability: Wheelchair, Deaf and Blind are pooled with each other in most years,
# so only their combined rate is knowable.
SENS <- c("Wheelchair user/mobility difficulties", "Deaf/hearing impairment", "Blind/partially sighted")
dis <- do.call(rbind, lapply(2021:2025, function(y) {
  r <- d[d$Year == y & d$Section == "DISABILITY", ]
  s <- r[r$Category %in% SENS, ]; nd <- r[r$Category == "No disability", ]
  hidden <- unique(unlist(lapply(s$note, pooled_into)))
  # exact only if every hidden row of the three sits in a pool led by one of the three
  exact_ok <- all(hidden %in% SENS) && all(s$Category[is.na(s$accepted_n)] %in% hidden)
  data.frame(year = y, apps_combined = sum(s$applicants_n),
             acc_combined = if (exact_ok) sum(s$accepted_n, na.rm = TRUE) else NA,
             rate_combined = if (exact_ok) round(100 * sum(s$accepted_n, na.rm = TRUE) / sum(s$applicants_n), 1) else NA,
             rate_no_disability = round(100 * nd$accepted_n / nd$applicants_n, 1))
}))
cat("\n== Wheelchair + Deaf + Blind combined (only knowable figure) ==\n"); print(dis, row.names = FALSE)
write.csv(dis, "posts/next/tables/disability_sensory_mobility_combined.csv", row.names = FALSE)
