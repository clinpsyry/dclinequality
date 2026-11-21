# ============================================================================
# Comprehensive data verification. Confirms the shipped site/data/counts.json
# faithfully represents the source CSV: reconciliation, exact round-trip of
# every non-constructed group-year, honest suppression (never zero-filled),
# and correct constructed aggregates. Prints PASS/FAIL and exits non-zero on
# any failure. Run: Rscript pipeline/verify_all.R
# ============================================================================
source("pipeline/01_load_clean.R")
suppressPackageStartupMessages(library(jsonlite))

raw    <- load_raw()
d      <- classify(raw)
counts <- fromJSON("site/data/counts.json", simplifyVector = FALSE)

fails <- 0
ok <- function(name, cond) {
  cat(sprintf("  [%s] %s\n", if (isTRUE(cond)) "PASS" else "FAIL", name))
  if (!isTRUE(cond)) fails <<- fails + 1
}
# helper: source row for a plain group-year
src1 <- function(sec, cat_, yr) raw[raw$Section == sec & raw$Category == cat_ & raw$Year == yr, ]
# sum of reportable (non-suppressed) components from raw, for a year
rep_sum <- function(sec, cats, yr) {
  r <- raw[raw$Section == sec & raw$Category %in% cats & raw$Year == yr & !is.na(raw$accepted_n), ]
  list(app = sum(r$applicants_n), acc = sum(r$accepted_n), n = nrow(r))
}

cat("== 1. Reconciliation (partition leaves -> published year totals) ==\n")
rec <- reconcile(d)
ok("applicants reconcile on every section-year", max(abs(rec$app_diff)) == 0)
accc <- rec[!is.na(rec$acc_diff), ]
ok("accepted reconciles on every unsuppressed section-year", max(abs(accc$acc_diff)) == 0)

cat("\n== 2. counts.json round-trip vs source CSV (non-constructed groups) ==\n")
CONSTRUCTED_SECS <- "ETHNIC GROUP (BROAD)"
CONSTRUCTED_GRPS <- c("Christian (all)", "Mixed (all)")
nchk <- 0; nbad <- 0; bad_eg <- character(0)
for (g in counts$groups) {
  if (g$characteristic %in% CONSTRUCTED_SECS || g$group %in% CONSTRUCTED_GRPS) next
  if (isTRUE(g$constructed) || isTRUE(g$contextual)) next   # checked in sections 6 and 7
  for (by in g$by_year) {
    s <- src1(g$characteristic, g$group, by$year); nchk <- nchk + 1
    bad <- FALSE
    if (nrow(s) != 1) bad <- TRUE
    else {
      if (s$applicants_n != by$applicants) bad <- TRUE
      supp_src <- is.na(s$accepted_n); supp_json <- is.null(by$accepted)
      if (supp_src != supp_json) bad <- TRUE
      if (!supp_src && !supp_json && s$accepted_n != by$accepted) bad <- TRUE
    }
    if (bad) { nbad <- nbad + 1; if (length(bad_eg) < 5)
      bad_eg <- c(bad_eg, paste(g$characteristic, g$group, by$year)) }
  }
}
ok(sprintf("all %d non-constructed group-years match source exactly", nchk), nbad == 0)
if (nbad > 0) cat("    examples:", paste(bad_eg, collapse = " | "), "\n")

cat("\n== 3. No zero-fills: every source-suppressed cell is null in counts.json ==\n")
zf <- 0
for (g in counts$groups) {
  if (g$characteristic %in% CONSTRUCTED_SECS || g$group %in% CONSTRUCTED_GRPS) next
  if (isTRUE(g$constructed) || isTRUE(g$contextual)) next
  for (by in g$by_year) {
    s <- src1(g$characteristic, g$group, by$year)
    if (nrow(s) == 1 && is.na(s$accepted_n) && !is.null(by$accepted)) zf <- zf + 1
  }
}
ok("zero-fill count is 0 (suppressed never became a number)", zf == 0)

cat("\n== 4. Aggregates: Christian = sum-of-reportable; broad + Mixed = published totals ==\n")
get_json <- function(sec, grp) Filter(function(g) g$characteristic == sec && g$group == grp, counts$groups)[[1]]

# Christian (all): still a sum of reportable components (no published total exists).
ok("Christian (all) = Protestant + Roman Catholic + Other (reportable)", {
  jg <- get_json("RELIGION","Christian (all)"); good <- TRUE
  for (by in jg$by_year) { rs <- rep_sum("RELIGION", CHRISTIAN_COMPONENTS, by$year)
    jacc <- if (is.null(by$accepted)) NA else by$accepted
    exp <- if (rs$n==0) NA else rs$acc
    if (!isTRUE(by$applicants==rs$app) || !((is.na(jacc)&&is.na(exp))||(isTRUE(jacc==exp)))) good <- FALSE }
  good })

# Broad groups + Mixed (all): must equal the source's published "Total in the X
# group" rows (the corrected method; sum-of-reportable overstated minority rates).
pub_total <- function(pattern, yr) {
  r <- raw[raw$Section == "ETHNICITY" & raw$Year == yr & grepl(pattern, raw$Category), ]
  if (nrow(r) != 1) return(NULL)
  list(app = r$applicants_n[1], acc = r$accepted_n[1])
}
check_published <- function(sec, grp, pattern) {
  jg <- get_json(sec, grp); good <- TRUE
  for (by in jg$by_year) {
    p <- pub_total(pattern, by$year); if (is.null(p)) { good <- FALSE; next }
    jacc <- if (is.null(by$accepted)) NA else by$accepted
    if (!isTRUE(by$applicants == p$app) ||
        !((is.na(jacc) && is.na(p$acc)) || isTRUE(jacc == p$acc))) good <- FALSE
  }
  good
}
ok("Mixed (all) = published 'Total in the Mixed group'",
   check_published("ETHNICITY","Mixed (all)", "^Total in the Mixed group$"))
ok("Broad White = published 'Total in the White group'",
   check_published("ETHNIC GROUP (BROAD)","White", "^Total in the White group$"))
ok("Broad Asian = published 'Total in the Asian ...'",
   check_published("ETHNIC GROUP (BROAD)","Asian", "^Total in the Asian"))
ok("Broad Black = published 'Total in the Black ...'",
   check_published("ETHNIC GROUP (BROAD)","Black", "^Total in the Black"))
ok("Broad Mixed = published 'Total in the Mixed group'",
   check_published("ETHNIC GROUP (BROAD)","Mixed", "^Total in the Mixed group$"))
ok("Broad Other = published 'Total in the Other group'",
   check_published("ETHNIC GROUP (BROAD)","Other", "^Total in the Other group$"))

cat("\n== 5. Reference groups present every year ==\n")
refs <- counts$meta$references
present_all <- TRUE
n_all <- length(unique(raw$Year))
for (sec in names(refs)) {
  if (sec == "ETHNIC GROUP (BROAD)" || startsWith(sec, "CONTEXT: ")) next
  yrs <- length(unique(raw$Year[raw$Section == sec & raw$Category == refs[[sec]]]))
  if (yrs != n_all) { present_all <- FALSE; cat("    ", sec, refs[[sec]], yrs, "yrs\n") }
}
ok(sprintf("all references present in all %d years", n_all), present_all)

cat("\n== 6. Contextual questions round-trip vs the Contextual admissions files ==\n")
source("pipeline/00c_contextual.R")
ctx <- read_contextual(); cbad <- 0; cn <- 0
for (g in Filter(function(g) isTRUE(g$contextual), counts$groups)) {
  q <- sub("^CONTEXT: ", "", g$characteristic)
  for (by in g$by_year) {
    s <- ctx[ctx$question == q & ctx$answer == g$group & ctx$Year == by$year, ]; cn <- cn + 1
    if (nrow(s) != 1 || s$applicants_n != by$applicants || !isTRUE(s$accepted_n == by$accepted)) cbad <- cbad + 1
  }
}
ok(sprintf("all %d contextual group-years match the source files", cn), cbad == 0 && cn == nrow(ctx))

cat("\n== 6b. Overall (all applicants) = the published yearly TOTALS row ==\n")
og <- Filter(function(g) g$characteristic == "OVERALL", counts$groups)[[1]]
ok(sprintf("overall applicants and acceptances match TOTALS in all %d years", length(og$by_year)),
   length(og$by_year) == n_all && all(sapply(og$by_year, function(by) {
     s <- src1("TOTALS", "TOTALS", by$year); nrow(s) == 1 && s$applicants_n == by$applicants && s$accepted_n == by$accepted })))

cat("\n== 7. Combined disability group and pooled-cell flags ==\n")
SENS <- c("Wheelchair user/mobility difficulties", "Deaf/hearing impairment", "Blind/partially sighted")
cg <- Filter(function(g) g$group == "Wheelchair, deaf or blind (combined)", counts$groups)[[1]]
ok("combined group applicants = sum of the three rows, every year", all(sapply(cg$by_year, function(by)
  by$applicants == sum(raw$applicants_n[raw$Section == "DISABILITY" & raw$Year == by$year & raw$Category %in% SENS]))))
ok("combined acceptances, where shown, = sum of the reported rows", all(sapply(cg$by_year, function(by)
  is.null(by$accepted) || by$accepted == sum(raw$accepted_n[raw$Section == "DISABILITY" & raw$Year == by$year &
    raw$Category %in% SENS], na.rm = TRUE))))
nflag <- sum(sapply(counts$groups, function(g) sum(sapply(g$by_year, function(by) !is.null(by$pooled_with)))))
shown <- unique(unlist(lapply(counts$groups, function(g) paste(g$characteristic, g$group))))
kp <- raw[grepl("^Source pools", raw$note), ]
nkeep <- sum(paste(kp$Section, kp$Category) %in% shown)   # pools led by a row the explorer shows
ok(sprintf("every 'keep' pool led by a shown row is flagged (%d of %d)", nflag, nkeep), nflag == nkeep)
ninto <- sum(sapply(counts$groups, function(g) sum(sapply(g$by_year, function(by) !is.null(by$pooled_into)))))
ok(sprintf("hidden rows of pools are flagged as pooled into another row (%d)", ninto), ninto > 0)

cat(sprintf("\n%s  (%d failure%s)\n",
    if (fails == 0) "ALL DATA CHECKS PASS" else "DATA VERIFICATION FAILED",
    fails, if (fails == 1) "" else "s"))
if (fails > 0) quit(status = 1)
