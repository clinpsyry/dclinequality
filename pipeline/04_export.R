# ============================================================================
# Phase 2c: Export artefacts for the front-end, reproducibly (rule 14).
# Regenerates everything the browser loads (counts) and is tested against
# (reference), plus the file:// JS globals. Run:  source("pipeline/04_export.R")
# Prints the oracle checks. NO new statistics decisions live here.
# ============================================================================
source("pipeline/01_load_clean.R")
source("pipeline/02_stats_functions.R")
suppressPackageStartupMessages(library(jsonlite))

d <- classify(load_raw())
constructed_names <- c("Christian (all)", "Mixed (all)")
con   <- build_constructed(d)
broad <- build_broad_race(d)   # White/Asian/Black/Mixed broad racial groups

# ---- counts.json: every analysis group + constructed aggregates -------------
ag    <- d[d$in_analysis, c("Section","Category","Year","applicants_n","accepted_n")]
con2  <- data.frame(Section = con$Section, Category = con$group, Year = con$Year,
                    applicants_n = con$applicants_n, accepted_n = con$accepted_n)
brd2  <- data.frame(Section = broad$Section, Category = broad$group, Year = broad$Year,
                    applicants_n = broad$applicants_n, accepted_n = broad$accepted_n)
allg <- rbind(ag, con2, brd2)
keys <- unique(allg[, c("Section","Category")])
groups <- list()
for (i in seq_len(nrow(keys))) {
  sec <- keys$Section[i]; cat_ <- keys$Category[i]
  rows <- allg[allg$Section == sec & allg$Category == cat_, ]
  rows <- rows[order(rows$Year), ]
  by_year <- lapply(seq_len(nrow(rows)), function(j) list(
    year = rows$Year[j], applicants = rows$applicants_n[j],
    accepted = if (is.na(rows$accepted_n[j])) NULL else rows$accepted_n[j]))
  groups[[length(groups)+1]] <- list(characteristic = sec, group = cat_,
    constructed = cat_ %in% constructed_names || sec == "ETHNIC GROUP (BROAD)",
    by_year = by_year)
}
references <- c(REFERENCE_GROUP, list("ETHNIC GROUP (BROAD)" = "White"))
export <- list(
  meta = list(source_file = CSV_PATH,
    generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
    eras = list(pre_dei = ERA_PRE_DEI, dei = ERA_DEI, excluded = ERA_EXCLUDED),
    references = references),
  groups = groups)

# ---- reference.json: ethnicity DEI family (gold standard) -------------------
dei <- c(2021, 2022, 2023, 2024)
pool <- function(section, category, years) {
  r <- d[d$Section == section & d$Category == category &
         d$Year %in% years & !is.na(d$accepted_n), ]
  c(app = sum(r$applicants_n), acc = sum(r$accepted_n))
}
pool_constructed <- function(group, years) {
  r <- con[con$group == group & con$Year %in% years & !con$suppressed, ]
  c(app = sum(r$applicants_n), acc = sum(r$accepted_n))
}
family_table <- function(section, members, reference, years) {
  refp  <- if (reference %in% constructed_names) pool_constructed(reference, years)
           else pool(section, reference, years)
  poolm <- function(g) if (g %in% constructed_names) pool_constructed(g, years)
                       else pool(section, g, years)
  P <- t(sapply(members, function(g) { gg <- poolm(g)
    c(app = unname(gg["app"]), acc = unname(gg["acc"]),
      raw_p = raw_p_2x2(gg["acc"], gg["app"], refp["acc"], refp["app"])) }))
  bh <- bh_widen(P[, "raw_p"]); ref_rate <- unname(refp["acc"] / refp["app"])
  rows <- lapply(seq_along(members), function(k) {
    a <- P[k, "acc"]; n <- P[k, "app"]; z <- bh$z_star[k]
    ppci <- newcombe_ci(a, n, refp["acc"], refp["app"], z) * 100
    rr   <- rate_ratio_ci(a, n, refp["acc"], refp["app"], z)
    bar  <- !(ppci[1] <= 0 && ppci[2] >= 0)
    list(group = members[k], applicants = n, accepted = a, rate = round(100*a/n, 3),
      pp = unname(round(100*(a/n - ref_rate), 3)), pp_lo = round(ppci[1], 3),
      pp_hi = round(ppci[2], 3), rr = round(rr$value, 4), rr_lo = round(rr$lo, 4),
      rr_hi = round(rr$hi, 4), raw_p = signif(P[k, "raw_p"], 6),
      p_bh = round(bh$p_bh[k], 6), z_star = round(z, 6),
      significant_after_bh = unname(bh$sig[k]), bar_excludes_null = unname(bar))
  })
  list(reference = reference, m = attr(bh, "m"), ref_applicants = unname(refp["app"]),
       ref_accepted = unname(refp["acc"]), rows = rows)
}
eth12 <- c("British Scottish","British Welsh","Irish","Other White background","Indian",
  "Pakistani","Bangladeshi","Chinese","African","Caribbean","Mixed (all)",
  "Middle Eastern/North African")
eth_dei <- family_table("ETHNICITY", eth12, "British English", dei)
reference <- list(meta = list(generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
  note = "Gold standard; the browser's live results must match these."),
  ethnicity_dei = eth_dei)

# ---- write all four artefacts ----------------------------------------------
dir.create("site/data", recursive = TRUE, showWarnings = FALSE)
write_json(export, "site/data/counts.json", auto_unbox = TRUE, null = "null", pretty = TRUE)
write_json(reference, "site/data/reference.json", auto_unbox = TRUE, null = "null",
           pretty = TRUE, digits = 6)
writeLines(paste0("window.COUNTS = ", toJSON(export, auto_unbox = TRUE, null = "null"), ";"),
           "site/data.js")
writeLines(paste0("window.REFERENCE = ", toJSON(reference, auto_unbox = TRUE, null = "null"), ";"),
           "site/reference.js")

# ---- checks -----------------------------------------------------------------
chk <- sapply(eth_dei$rows, function(r) r$bar_excludes_null == r$significant_after_bh)
pick <- function(g) eth_dei$rows[[ which(sapply(eth_dei$rows, function(r) r$group == g)) ]]
bw <- pick("British Welsh"); mx <- pick("Mixed (all)")
cat("wrote counts.json, reference.json, data.js, reference.js\n")
cat("bar == sig on all", length(chk), "ethnicity DEI rows:", all(chk), "\n")
cat("British Welsh: p_bh", bw$p_bh, "sig", bw$significant_after_bh, "\n")
cat("Mixed (all) DEI: n", mx$accepted, "/", mx$applicants,
    "| p_bh", mx$p_bh, "sig", mx$significant_after_bh, "\n\n")
cat("Mixed (all) by year (should now be continuous, no suppressed years):\n")
print(con[con$group == "Mixed (all)", c("Year","applicants_n","accepted_n","suppressed")],
      row.names = FALSE)
