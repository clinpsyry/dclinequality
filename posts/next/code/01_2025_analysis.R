# 01_2025_analysis.R: 2025 on its own, and whether the 2021 to 2024 picture holds.
# Run from the project root:  source("posts/next/code/01_2025_analysis.R")
#
# Method (RULES.md):
#   Part 1, 2025 cross-section: each group vs its reference, gap in pp, Newcombe
#     interval. BH within the frozen families (same members and m as published);
#     intervals widened to each comparison's BH critical level so "interval
#     excludes 0" == "BH-significant". Gender, under-40 vs 40+, dependants and
#     the SES Q1 vs Q5 gap are single pre-specified tests (plain 95%).
#   Part 2, does the picture hold: per-year gaps 2021 to 2024 vs the 2025 gap.
#     Descriptive only (decided 21 Nov 2026): is 2025 inside the range of the four
#     DEI years, same sign as the DEI gap, and same significance verdict.
#   Groups are built exactly as the explorer builds them: the script runs the
#   explorer export in a temporary copy and reads its counts (the live site/ is
#   not touched).
# First it reproduces the published 2021 to 2024 verdicts and the STATS_RULES age
# gaps; if those checks fail it stops.

source("pipeline/02_stats_functions.R")
suppressPackageStartupMessages(library(jsonlite))

OUT <- "posts/next/tables"
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)

# ---- build counts exactly as the explorer does (in a temp copy) --------------
tmp <- file.path(tempdir(), "dclin_build")
unlink(tmp, recursive = TRUE); dir.create(tmp)
for (p in c("pipeline", "site", "data")) file.copy(p, tmp, recursive = TRUE)
owd <- setwd(tmp)
invisible(capture.output(source("pipeline/04_export.R")))
counts <- fromJSON("site/data/counts.json", simplifyVector = FALSE)
setwd(owd)

idx <- list()
for (g in counts$groups) idx[[paste(g$characteristic, g$group, sep = "|")]] <- g$by_year
pool <- function(ch, grps, years) {
  app <- 0; acc <- 0; ny <- 0
  for (grp in grps) {
    by <- idx[[paste(ch, grp, sep = "|")]]; if (is.null(by)) next
    for (r in by) if (r$year %in% years && !is.null(r$accepted)) {
      app <- app + r$applicants; acc <- acc + r$accepted; ny <- ny + 1 }
  }
  c(app = app, acc = acc, n_cells = ny)
}
rawp <- function(a1, n1, a2, n2) {
  if (n1 == 0 || n2 == 0 || (a1 + a2) == 0) return(NA)
  suppressWarnings(prop.test(c(a1, a2), c(n1, n2), correct = FALSE)$p.value)
}

# ---- frozen families (as verify_families.R / RULES.md) ----------------------
AGE_OLD <- c("40-44 years", "45-49 years", "50-54 years", "55 and over", "50-54 years, 55 and over")
AGE_YOUNG <- c("20-24 years", "25-29 years", "30-34 years", "35-39 years")
families <- list(
  "ETHNICITY" = list(ref = "British English", members = as.list(c(
    "British Scottish", "British Welsh", "Irish", "Other White background", "Indian",
    "Pakistani", "Bangladeshi", "Chinese", "African", "Caribbean", "Mixed (all)",
    "Middle Eastern/North African"))),
  "ETHNIC GROUP (BROAD)" = list(ref = "White", members = list("Asian", "Black", "Mixed")),
  "RELIGION" = list(ref = "No religion", members = list(
    "Jewish", "Buddhist", "Hindu", "Christian (all)", "Sikh", "Muslim")),
  "SEXUAL ORIENTATION" = list(ref = "Heterosexual/straight", members = list(
    "Gay woman/lesbian", "Gay man", "Bisexual", "Other sexual orientation")),
  "MARITAL STATUS" = list(ref = "Single", members = list(
    "Married/civil partnership/co-habiting", "Divorced/Separated, Widowed")),
  "AGE" = list(ref = "25-29 years", members = list(
    "20-24 years", "30-34 years", "35-39 years", AGE_OLD),
    labels = c("20-24 years", "30-34 years", "35-39 years", "40+ years")),
  "DISABILITY" = list(ref = "No disability", members = list(
    "Dyslexia", "Mental health difficulties", "Unseen disability eg diabetes, epilepsy, asthma",
    "Two or more disabilities", "Other disability", "Personal care support",
    "Wheelchair user/mobility difficulties", "Deaf/hearing impairment", "Blind/partially sighted")),
  "RESIDENT" = list(ref = "UK", members = list("Other EU/EEA", "Other residence"))
)
Q <- c("Quintile 1 (lowest participation rate in HE)", "Quintile 2", "Quintile 3",
       "Quintile 4", "Quintile 5 (highest participation rate in HE)")
singles <- list(   # single pre-specified tests: group vs reference, plain 95%
  list(ch = "GENDER", label = "Male vs Female", grp = "Male", ref = "Female"),
  list(ch = "AGE", label = "40+ vs under 40", grp = AGE_OLD, ref = AGE_YOUNG),
  list(ch = "DEPENDANTS", label = "Has dependants vs No dependants", grp = "Has dependants", ref = "No dependants"),
  list(ch = "SOCIO-ECONOMIC BACKGROUND", label = "Q1 vs Q5 (lowest vs highest HE participation)", grp = Q[1], ref = Q[5])
)

# ---- one family over a set of years -----------------------------------------
run_family <- function(ch, f, years) {
  refp <- pool(ch, f$ref, years)
  labels <- if (!is.null(f$labels)) f$labels else vapply(f$members, function(m) m[1], "")
  rows <- lapply(seq_along(f$members), function(i) {
    p <- pool(ch, f$members[[i]], years)
    data.frame(characteristic = ch, group = labels[i], reference = f$ref[1],
               app = p["app"], acc = p["acc"], ref_app = refp["app"], ref_acc = refp["acc"],
               p_raw = rawp(p["acc"], p["app"], refp["acc"], refp["app"]))
  })
  d <- do.call(rbind, rows); rownames(d) <- NULL
  bh <- bh_widen(d$p_raw)
  d$m <- attr(bh, "m"); d$p_bh <- bh$p_bh; d$sig <- bh$sig; d$z_star <- bh$z_star
  d$rate <- 100 * d$acc / d$app; d$ref_rate <- 100 * d$ref_acc / d$ref_app
  d$gap_pp <- d$rate - d$ref_rate
  ci <- t(mapply(function(a, n, ra, rn, z) if (is.na(z)) c(NA, NA) else 100 * newcombe_ci(a, n, ra, rn, z),
                 d$acc, d$app, d$ref_acc, d$ref_app, d$z_star))
  d$lo_bh <- ci[, 1]; d$hi_bh <- ci[, 2]
  d$bar_excludes_0 <- !is.na(d$lo_bh) & (d$lo_bh > 0 | d$hi_bh < 0)
  d
}
run_single <- function(s, years) {
  a <- pool(s$ch, s$grp, years); r <- pool(s$ch, s$ref, years)
  ci <- 100 * newcombe_ci(a["acc"], a["app"], r["acc"], r["app"])
  p <- rawp(a["acc"], a["app"], r["acc"], r["app"])
  data.frame(test = s$label, app = a["app"], acc = a["acc"], ref_app = r["app"], ref_acc = r["acc"],
             rate = 100 * a["acc"] / a["app"], ref_rate = 100 * r["acc"] / r["app"],
             gap_pp = 100 * (a["acc"] / a["app"] - r["acc"] / r["app"]),
             lo = ci[1], hi = ci[2], p = p, sig = p < 0.05, row.names = NULL)
}
run_ses_pairs <- function(years) {
  out <- list()
  for (i in 1:4) for (j in (i + 1):5) {
    a <- pool("SOCIO-ECONOMIC BACKGROUND", Q[i], years); b <- pool("SOCIO-ECONOMIC BACKGROUND", Q[j], years)
    out[[length(out) + 1]] <- data.frame(pair = paste0("Q", i, " vs Q", j),
      gap_pp = 100 * (a["acc"] / a["app"] - b["acc"] / b["app"]),
      p_raw = rawp(a["acc"], a["app"], b["acc"], b["app"]), a_acc = a["acc"], a_app = a["app"],
      b_acc = b["acc"], b_app = b["app"], row.names = NULL)
  }
  d <- do.call(rbind, out); bh <- bh_widen(d$p_raw)
  d$m <- attr(bh, "m"); d$p_bh <- bh$p_bh; d$sig <- bh$sig
  ci <- t(mapply(function(a, n, ra, rn, z) 100 * newcombe_ci(a, n, ra, rn, z),
                 d$a_acc, d$a_app, d$b_acc, d$b_app, bh$z_star))
  d$lo_bh <- ci[, 1]; d$hi_bh <- ci[, 2]
  d
}
run_all <- function(years) {
  fam <- do.call(rbind, lapply(names(families), function(ch) run_family(ch, families[[ch]], years)))
  list(families = fam, singles = do.call(rbind, lapply(singles, run_single, years = years)),
       ses = run_ses_pairs(years))
}

# ---- check 1: reproduce the published 2021 to 2024 verdicts --------------------
DEI <- 2021:2024
dei <- run_all(DEI)
# Published oracle: Rscript pipeline/verify_families.R on the committed explorer
# data (2015 to 2024), run 21 Nov 2026. m and the significant groups per family.
published <- list(
  "ETHNICITY"            = list(m = 12, sig = c("British Scottish", "Other White background", "Pakistani", "African")),
  "ETHNIC GROUP (BROAD)" = list(m = 3,  sig = c("Asian", "Black")),
  "RELIGION"             = list(m = 6,  sig = c("Jewish", "Christian (all)", "Muslim")),
  "SEXUAL ORIENTATION"   = list(m = 4,  sig = c("Gay woman/lesbian", "Bisexual", "Other sexual orientation")),
  "MARITAL STATUS"       = list(m = 2,  sig = c("Divorced/Separated, Widowed")),
  "AGE"                  = list(m = 4,  sig = c("20-24 years", "30-34 years", "35-39 years", "40+ years")),
  "DISABILITY"           = list(m = 8,  sig = c("Wheelchair user/mobility difficulties", "Blind/partially sighted")),
  "RESIDENT"             = list(m = 1,  sig = c("Other EU/EEA")))
ok1 <- all(vapply(names(published), function(ch) {
  x <- dei$families[dei$families$characteristic == ch, ]
  ok <- x$m[1] == published[[ch]]$m && setequal(x$group[which(x$sig)], published[[ch]]$sig)
  if (!ok) cat("  MISMATCH", ch, ": m", x$m[1], "sig", paste(x$group[which(x$sig)], collapse = ", "), "\n")
  ok }, TRUE))
ok_bh <- all(dei$families$bar_excludes_0 == (dei$families$sig %in% TRUE))
ses_got <- gsub(" vs ", "-", dei$ses$pair[dei$ses$sig])
ok_ses <- setequal(ses_got, c("Q1-Q3", "Q1-Q4", "Q1-Q5", "Q2-Q5", "Q3-Q5", "Q4-Q5")) &&
  isTRUE(dei$singles$sig[dei$singles$test == "Male vs Female"])
cat("CHECK 1 (2021-24 family m and verdicts match the published oracle):", ok1, "\n")
cat("CHECK 2 (interval excludes 0 == BH-significant, every row):", ok_bh, "\n")
cat("CHECK 3 (SES pairwise and sex verdicts match):", ok_ses, "\n")

# ---- check 4: STATS_RULES age gap, per-year mean, pre-DEI -7.1 / DEI -13.7 pp ----
year_gap <- function(ch, grp, ref, y) {
  a <- pool(ch, grp, y); r <- pool(ch, ref, y)
  if (a["app"] == 0 || r["app"] == 0) return(NA)
  100 * (a["acc"] / a["app"] - r["acc"] / r["app"])
}
age_gap <- function(y) year_gap("AGE", AGE_OLD, AGE_YOUNG, y)
pre_mean <- mean(sapply(2015:2019, age_gap)); dei_mean <- mean(sapply(DEI, age_gap))
ok4 <- abs(pre_mean - (-7.1)) < 0.05 && abs(dei_mean - (-13.7)) < 0.05
cat(sprintf("CHECK 4 (age gap per-year means): pre-DEI %.2f (want -7.1), DEI %.2f (want -13.7): %s\n",
            pre_mean, dei_mean, ok4))
if (!(ok1 && ok_bh && ok_ses && ok4)) stop("Validation failed: 2025 results not produced.")

# ---- Part 1: 2025 cross-section -----------------------------------------------
y25 <- run_all(2025)
stopifnot(all(y25$families$bar_excludes_0 == (y25$families$sig %in% TRUE)))

# ---- Part 2: does the picture hold --------------------------------------------
hold <- do.call(rbind, lapply(names(families), function(ch) {
  f <- families[[ch]]
  labels <- if (!is.null(f$labels)) f$labels else vapply(f$members, function(m) m[1], "")
  do.call(rbind, lapply(seq_along(f$members), function(i) {
    g <- sapply(c(DEI, 2025), function(y) year_gap(ch, f$members[[i]], f$ref, y))
    d1 <- dei$families[dei$families$characteristic == ch & dei$families$group == labels[i], ]
    d2 <- y25$families[y25$families$characteristic == ch & y25$families$group == labels[i], ]
    data.frame(characteristic = ch, group = labels[i],
      dei_gap = d1$gap_pp, dei_sig = d1$sig, dei_min_year = min(g[1:4], na.rm = TRUE),
      dei_max_year = max(g[1:4], na.rm = TRUE), dei_years = sum(!is.na(g[1:4])),
      gap_2025 = g[5], n_2025 = d2$app, sig_2025 = d2$sig, lo_2025 = d2$lo_bh, hi_2025 = d2$hi_bh)
  }))
}))
singles_hold <- do.call(rbind, lapply(singles, function(s) {
  g <- sapply(c(DEI, 2025), function(y) year_gap(s$ch, s$grp, s$ref, y))
  d1 <- dei$singles[dei$singles$test == s$label, ]; d2 <- y25$singles[y25$singles$test == s$label, ]
  data.frame(characteristic = s$ch, group = s$label, dei_gap = d1$gap_pp, dei_sig = d1$sig,
    dei_min_year = min(g[1:4], na.rm = TRUE), dei_max_year = max(g[1:4], na.rm = TRUE),
    dei_years = sum(!is.na(g[1:4])), gap_2025 = g[5], n_2025 = d2$app, sig_2025 = d2$sig,
    lo_2025 = d2$lo, hi_2025 = d2$hi)
}))
hold <- rbind(singles_hold, hold)
hold$inside_dei_range <- !is.na(hold$gap_2025) & hold$gap_2025 >= hold$dei_min_year & hold$gap_2025 <= hold$dei_max_year
hold$same_sign <- sign(hold$gap_2025) == sign(hold$dei_gap)
hold$same_verdict <- (hold$sig_2025 %in% TRUE) == (hold$dei_sig %in% TRUE)
hold$low_n_2025 <- hold$n_2025 < 100

# Headline gaps, every year (for the trend charts)
trend <- data.frame(year = 2015:2025,
  age_gap_pp = sapply(2015:2025, age_gap),
  sex_gap_pp = sapply(2015:2025, function(y) year_gap("GENDER", "Male", "Female", y)),
  dependants_gap_pp = sapply(2015:2025, function(y) year_gap("DEPENDANTS", "Has dependants", "No dependants", y)),
  ses_q1_q5_gap_pp = sapply(2015:2025, function(y) year_gap("SOCIO-ECONOMIC BACKGROUND", Q[1], Q[5], y)))

r2 <- function(d) { n <- vapply(d, is.numeric, TRUE); d[n] <- lapply(d[n], round, 2); d }
write.csv(r2(y25$families), file.path(OUT, "2025_families.csv"), row.names = FALSE)
write.csv(r2(y25$singles),  file.path(OUT, "2025_single_tests.csv"), row.names = FALSE)
write.csv(r2(y25$ses),      file.path(OUT, "2025_ses_pairwise.csv"), row.names = FALSE)
write.csv(r2(dei$families), file.path(OUT, "dei_2021-24_families_reproduced.csv"), row.names = FALSE)
write.csv(r2(dei$singles),  file.path(OUT, "dei_2021-24_single_tests_reproduced.csv"), row.names = FALSE)
write.csv(r2(hold),         file.path(OUT, "2025_vs_dei_does_it_hold.csv"), row.names = FALSE)
write.csv(r2(trend),        file.path(OUT, "per_year_gaps_2015-2025.csv"), row.names = FALSE)
cat("Wrote tables to", OUT, "\n")
