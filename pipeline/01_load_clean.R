# ============================================================================
# Phase 1: Data layer for the DClinPsy Equal-Opportunities Explorer
#
# Reads equalopps_2015-2024_merged.csv and produces a clean, tidy group-year
# table with coherence classification, reference-group flags, era tags,
# suppression flags, and the transparently constructed aggregate groups.
# Prints a reconciliation table. NO statistics here (those are Phase 2):
# this script does not compute a rate, interval, p-value, or effect size.
#
# House style: no em dashes, colons; "pp" for percentage points.
# Governance: extracted_docs/STATS_AND_TOOL_GOVERNANCE.md (esp. rules 1, 3, 4,
# 8a, 10, 11). Where this script and that doc disagree, the doc wins.
# ============================================================================

CSV_PATH <- "equalopps_2015-2024_merged.csv"

# ---- Eras (governance rule 3) ----------------------------------------------
ERA_PRE_DEI  <- c(2015, 2016, 2017, 2018, 2019)
ERA_DEI      <- c(2021, 2022, 2023, 2024)
ERA_EXCLUDED <- c(2020)   # transition year: never in an era, never connected

era_of <- function(year) {
  ifelse(year %in% ERA_DEI, "dei",
  ifelse(year %in% ERA_PRE_DEI, "pre_dei",
  ifelse(year %in% ERA_EXCLUDED, "excluded", "unknown")))
}

# ---- Coherence: rows to exclude from analysis (governance rule 10) ----------
# "Prefer not to say" and the various not-specified / not-stated / not-applicable
# buckets are excluded from analysis (but remain part of the population for the
# partition reconciliation below).
EXCLUDE_PNTS_RE     <- "prefer not to say|not applicable|not specified|not stated|not applic"
# Micro-bucket merges to exclude (register 8a, rule 10): the source merges the
# tiny Baha'i / Jain religion buckets into heterogeneous rows that drift year to
# year (e.g. "Jewish, Jain", "Baha'i, Jain, Buddhist", "Baha'i, Jain, Other
# religion"). These are not coherent groups; exclude any category naming Baha'i
# or Jain. The clean named groups (Jewish, Buddhist, Other religion, etc.) are
# untouched; they simply lack the year(s) the source only reported merged.
EXCLUDE_MICRO_RE    <- "Baha|Jain"
# Roll-up "Total ..." rows double-count and must never enter a sum.
ROLLUP_RE           <- "^Total\\b|^TOTALS$"

# ---- Reference groups (governance rule 11) ---------------------------------
# Keyed by Section. Age has two references depending on the view; the bands
# reference is encoded here, the over/under-40 split reference is handled in the
# stats layer (Phase 2).
REFERENCE_GROUP <- list(
  "ETHNICITY"                 = "British English",
  "AGE"                       = "25-29 years",
  "GENDER"                    = "Female",
  "RELIGION"                  = "No religion",
  "SEXUAL ORIENTATION"        = "Heterosexual/straight",
  "MARITAL STATUS"            = "Single",
  "RESIDENT"                  = "UK",
  "SOCIO-ECONOMIC BACKGROUND" = "Quintile 3"   # display gradient ref (rule 11)
)

# ---- Constructed aggregate groups (governance rule 10, register 8a) ---------
# Built transparently from named sub-groups, never from a published roll-up.
# "Christian" = Protestant + Roman Catholic + Other Christian.
CHRISTIAN_COMPONENTS <- c("Christian - Protestant",
                          "Christian - Roman Catholic",
                          "Christian - Other")
# "Mixed (all)" = the four named mixed sub-groups. The fourth ("Other Mixed
# background") drifts: standalone some years, fused with "Mixed (not specified)"
# in others. We take it standalone where available, else fall back to the merged
# row and flag the year as carrying not-specified contamination.
MIXED_NAMED        <- c("White & Asian", "White & Black African",
                        "White & Black Caribbean", "Other Mixed background")
MIXED_OTHER_MERGED <- "Mixed (not specified), Other Mixed background"

# Broad racial groups: use the source's PUBLISHED "Total in the X group" rows, not
# a sum of named sub-groups. Summing sub-groups via sum-of-reportable drops the
# applicants of suppressed sub-cells, which (verified against the published totals)
# overstated the minority acceptance rates: e.g. Mixed 2024 read 24.0% by sum but
# 19.6% in the published total. The published totals are the authoritative figures
# and also resolve the sub-category-assignment ambiguity (e.g. where Chinese sits).
# "Other" IS now built (the published total is not the opaque residual the old sum
# was); the export keeps it for representativeness only.
BROAD_TOTAL_PATTERNS <- c(
  White = "^Total in the White group$",
  Asian = "^Total in the Asian",
  Black = "^Total in the Black",
  Mixed = "^Total in the Mixed group$",
  Other = "^Total in the Other group$"
)

# ============================================================================
# Load
# ============================================================================
load_raw <- function(path = CSV_PATH) {
  d <- read.csv(path, stringsAsFactors = FALSE, check.names = FALSE,
                na.strings = c("", "NA"))
  stopifnot(all(c("Year","Section","Category","applicants_n","accepted_n",
                  "note","source") %in% names(d)))
  # applicants_n must never be missing (governance rule 1).
  if (any(is.na(d$applicants_n)))
    stop("applicants_n is missing on ", sum(is.na(d$applicants_n)), " row(s)")
  d$Year <- as.integer(d$Year)
  d
}

# ============================================================================
# Classify every raw row: leaf vs roll-up, included vs PNTS-excluded.
# ============================================================================
classify <- function(d) {
  d$is_rollup   <- grepl(ROLLUP_RE, d$Category)
  d$is_pnts     <- grepl(EXCLUDE_PNTS_RE, d$Category, ignore.case = TRUE) &
                   !d$is_rollup
  d$is_micro    <- grepl(EXCLUDE_MICRO_RE, d$Category) & !d$is_rollup
  # A "leaf" is a real population partition member (used for reconciliation):
  # everything that is not a roll-up. PNTS and micro-bucket leaves count toward
  # the population total but are excluded from analysis.
  d$is_leaf     <- !d$is_rollup
  # Analysis rows: leaves that are not PNTS, not micro-bucket merges, not TOTALS.
  d$in_analysis <- d$is_leaf & !d$is_pnts & !d$is_micro & d$Section != "TOTALS"
  d$suppressed  <- is.na(d$accepted_n)
  d$era         <- era_of(d$Year)
  d$exclude_from_trend <- d$Year %in% ERA_EXCLUDED
  d
}

# ============================================================================
# Reconciliation (governance rule 14): for each section that is a clean
# partition, the sum of its leaf applicants must equal that year's TOTALS
# applicants. Accepted reconciles only where no leaf is suppressed.
# ============================================================================
reconcile <- function(d) {
  totals <- d[d$Section == "TOTALS", c("Year","applicants_n","accepted_n")]
  names(totals) <- c("Year","tot_app","tot_acc")
  secs <- setdiff(unique(d$Section), "TOTALS")
  out <- data.frame()
  for (sec in secs) {
    for (yr in sort(unique(d$Year))) {
      leaves <- d[d$Section == sec & d$Year == yr & d$is_leaf, ]
      if (nrow(leaves) == 0) next
      tref <- totals[totals$Year == yr, ]
      app_sum <- sum(leaves$applicants_n)
      any_supp <- any(is.na(leaves$accepted_n))
      acc_sum <- if (any_supp) NA_integer_ else sum(leaves$accepted_n)
      out <- rbind(out, data.frame(
        Section = sec, Year = yr,
        leaf_app = app_sum, tot_app = tref$tot_app,
        app_diff = app_sum - tref$tot_app,
        leaf_acc = acc_sum, tot_acc = tref$tot_acc,
        acc_diff = if (is.na(acc_sum)) NA_integer_ else acc_sum - tref$tot_acc,
        n_suppressed = sum(is.na(leaves$accepted_n))
      ))
    }
  }
  out
}

# ============================================================================
# Build the constructed aggregate groups for one section/year.
# Returns a one-row data.frame (or NULL) with applicants, accepted (NA if any
# component is suppressed: never zero-fill, governance rule 4), and flags.
# ============================================================================
build_aggregate <- function(rows, components, allow_partial = FALSE) {
  present <- rows[rows$Category %in% components, ]
  missing <- setdiff(components, present$Category)
  if (length(missing) > 0 && !allow_partial) return(NULL)
  # Sum of reportable components (rule 4): a suppressed component contributes
  # neither numerator nor denominator, so drop it and sum the rest. The
  # aggregate is suppressed only if NO component is reportable. This keeps the
  # aggregate continuous (e.g. Mixed (all), 40+) instead of blanking a whole
  # year because one small sub-group was suppressed.
  reportable <- present[!is.na(present$accepted_n), ]
  app <- sum(reportable$applicants_n)
  acc <- if (nrow(reportable) == 0) NA_integer_ else sum(reportable$accepted_n)
  data.frame(applicants_n = app, accepted_n = acc,
             n_components = nrow(present),
             n_reportable = nrow(reportable),
             n_missing = length(missing),
             suppressed = is.na(acc))
}

# Read a single published "Total in the X group" roll-up row for a year/section.
published_total <- function(rows, pattern) {
  r <- rows[grepl(pattern, rows$Category), ]
  if (nrow(r) != 1) return(NULL)
  data.frame(applicants_n = r$applicants_n[1],
             accepted_n   = r$accepted_n[1],
             suppressed   = is.na(r$accepted_n[1]))
}

build_constructed <- function(d) {
  out <- data.frame()
  for (yr in sort(unique(d$Year))) {
    # Christian
    rel <- d[d$Section == "RELIGION" & d$Year == yr, ]
    ch  <- build_aggregate(rel, CHRISTIAN_COMPONENTS)
    if (!is.null(ch)) out <- rbind(out, data.frame(
      Section = "RELIGION", Year = yr, group = "Christian (all)",
      ch[c("applicants_n","accepted_n","suppressed")],
      note = "", row.names = NULL))

    # Mixed (all): the published "Total in the Mixed group" row (authoritative;
    # includes the applicants of suppressed sub-cells the old sum dropped).
    eth <- d[d$Section == "ETHNICITY" & d$Year == yr, ]
    mx <- published_total(eth, "^Total in the Mixed group$")
    if (!is.null(mx)) out <- rbind(out, data.frame(
      Section = "ETHNICITY", Year = yr, group = "Mixed (all)",
      mx[c("applicants_n","accepted_n","suppressed")],
      note = "", row.names = NULL))
  }
  out
}

# Broad racial groups (White, Asian, Black, Mixed, Other) as a separate
# characteristic, taken from the source's published "Total in the X group" rows.
build_broad_race <- function(d) {
  out <- data.frame()
  for (yr in sort(unique(d$Year))) {
    eth <- d[d$Section == "ETHNICITY" & d$Year == yr, ]
    for (g in names(BROAD_TOTAL_PATTERNS)) {
      a <- published_total(eth, BROAD_TOTAL_PATTERNS[[g]])
      if (!is.null(a)) out <- rbind(out, data.frame(
        Section = "ETHNIC GROUP (BROAD)", Year = yr, group = g,
        a[c("applicants_n","accepted_n","suppressed")], row.names = NULL))
    }
  }
  out
}

# ============================================================================
# Main
# ============================================================================
main <- function() {
  d <- classify(load_raw())

  cat("== Load ==\n")
  cat("Rows:", nrow(d),
      "| analysis rows:", sum(d$in_analysis),
      "| roll-up rows:", sum(d$is_rollup),
      "| PNTS rows:", sum(d$is_pnts),
      "| suppressed:", sum(d$suppressed), "\n\n")

  cat("== Reconciliation: leaf applicants vs year TOTALS (rule 14) ==\n")
  rec <- reconcile(d)
  bad_app <- rec[rec$app_diff != 0, ]
  if (nrow(bad_app) == 0) {
    cat("PASS: every section's leaf applicants reconcile to year totals",
        "on all years.\n")
  } else {
    cat("FAIL: applicant mismatches:\n")
    print(bad_app[, c("Section","Year","leaf_app","tot_app","app_diff")],
          row.names = FALSE)
  }
  acc_clean <- rec[!is.na(rec$acc_diff), ]
  bad_acc <- acc_clean[acc_clean$acc_diff != 0, ]
  cat(sprintf("Accepted reconciliation checked on %d section-years with no",
              nrow(acc_clean)),
      "suppression;",
      if (nrow(bad_acc) == 0) "all PASS.\n" else "MISMATCHES below:\n")
  if (nrow(bad_acc) > 0)
    print(bad_acc[, c("Section","Year","leaf_acc","tot_acc","acc_diff")],
          row.names = FALSE)
  cat("\n")

  cat("== Reference groups present every year? (rule 11) ==\n")
  for (sec in names(REFERENCE_GROUP)) {
    ref <- REFERENCE_GROUP[[sec]]
    yrs <- sort(unique(d$Year[d$Section == sec & d$Category == ref]))
    ok <- length(yrs) == 10
    cat(sprintf("  %-26s ref '%s': %s\n", sec, ref,
                if (ok) "all 10 years" else paste("ONLY", paste(yrs, collapse=","))))
  }
  cat("\n")

  cat("== Constructed aggregate groups (rule 10) ==\n")
  con <- build_constructed(d)
  print(con, row.names = FALSE)
  flagged <- con[con$note != "", ]
  if (nrow(flagged) > 0)
    cat("\nNOTE:", nrow(flagged), "Mixed (all) year(s) carry a merged-residual",
        "flag (see 'note' column).\n")

  invisible(list(data = d, reconciliation = rec, constructed = con))
}

if (sys.nframe() == 0) main()
