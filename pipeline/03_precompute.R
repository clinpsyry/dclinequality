# ============================================================================
# Phase 2b: Precompute. Wires Phase 1 (clean data) through Phase 2a (stats)
# to produce per-year series and per-window frozen-family forests, then emits
# explorer_data.json and prints the verification table. Fails loudly if any
# assertion breaks (governance rules 6a, 14).
#
# Covered in this build: per-year series (all analysis groups + constructed
# aggregates); the five frozen vs-reference / pairwise families across all 45
# contiguous windows on pp + rate-ratio scales with BH-widened pp intervals and
# the bar_excludes_null == significant_after_bh assertion; the gender single
# pre-specified test.
# TODO (next): master pooled forest; special elements (age + SES era-change,
# age-vs-dependants E-value).
#
# House style: no em dashes, colons; "pp" for percentage points.
# ============================================================================

source("pipeline/01_load_clean.R")       # load_raw, classify, build_aggregate, configs
source("pipeline/02_stats_functions.R")  # wilson_ci, newcombe_ci, raw_p_2x2, bh_widen, rate_ratio_ci
suppressPackageStartupMessages(library(jsonlite))

USABLE_YEARS <- c(2015:2019, 2021:2024)   # 2020 excluded (rule 3)

# ---- Windows: all contiguous ranges over the 9 usable years ----------------
make_windows <- function(years = USABLE_YEARS) {
  ys <- sort(years); n <- length(ys); out <- list()
  for (i in seq_len(n)) for (j in i:n) {
    yy <- ys[i:j]
    id <- if (length(yy) == 1) as.character(yy[1]) else paste0(yy[1], "-", yy[length(yy)])
    out[[id]] <- list(id = id, start = yy[1], end = yy[length(yy)], years = yy)
  }
  out
}

# ---- Per-year (app, acc) table for a group spec ----------------------------
# spec is either a plain Category string in `section`, or one of the constructed
# aggregate ids "Christian (all)" / "Mixed (all)". Returns data.frame(Year, app,
# acc) over all years the group has any row; acc is NA where suppressed.
group_year_table <- function(d, section, spec) {
  if (spec == "Christian (all)") {
    rows <- do.call(rbind, lapply(sort(unique(d$Year)), function(yr) {
      rel <- d[d$Section == "RELIGION" & d$Year == yr, ]
      a <- build_aggregate(rel, CHRISTIAN_COMPONENTS)
      if (is.null(a)) NULL else data.frame(Year = yr, app = a$applicants_n, acc = a$accepted_n)
    }))
    return(rows)
  }
  if (spec == "Mixed (all)") {
    rows <- do.call(rbind, lapply(sort(unique(d$Year)), function(yr) {
      eth <- d[d$Section == "ETHNICITY" & d$Year == yr, ]
      comps <- if ("Other Mixed background" %in% eth$Category) MIXED_NAMED
               else c(MIXED_NAMED[1:3], MIXED_OTHER_MERGED)
      a <- build_aggregate(eth, comps)
      if (is.null(a)) NULL else data.frame(Year = yr, app = a$applicants_n, acc = a$accepted_n)
    }))
    return(rows)
  }
  sub <- d[d$Section == section & d$Category == spec, c("Year","applicants_n","accepted_n")]
  if (nrow(sub) == 0) return(data.frame(Year = integer(), app = integer(), acc = integer()))
  data.frame(Year = sub$Year, app = sub$applicants_n, acc = sub$accepted_n)
}

# Pool a group over a window: drop suppressed group-years entirely (rule 4:
# a suppressed year contributes neither numerator nor denominator).
pool_group <- function(gyt, window_years) {
  sub <- gyt[gyt$Year %in% window_years & !is.na(gyt$acc), ]
  list(app = sum(sub$app), acc = sum(sub$acc),
       years_used = sub$Year, n_years = nrow(sub))
}

# ---- Frozen family definitions (governance register 8a) --------------------
# type "vs_ref": each member vs `reference`. type "pairwise": all unordered pairs.
FAMILIES <- list(
  ethnicity = list(label = "Ethnicity", section = "ETHNICITY", type = "vs_ref",
    reference = "British English", m_dei = 12,
    members = c("British Scottish","British Welsh","Irish","Other White background",
                "Indian","Pakistani","Bangladeshi","Chinese","African","Caribbean",
                "Mixed (all)","Middle Eastern/North African")),
  religion = list(label = "Religion", section = "RELIGION", type = "vs_ref",
    reference = "No religion", m_dei = 6,
    members = c("Jewish","Buddhist","Hindu","Christian (all)","Sikh","Muslim")),
  sexual_orientation = list(label = "Sexual orientation", section = "SEXUAL ORIENTATION",
    type = "vs_ref", reference = "Heterosexual/straight", m_dei = 4,
    members = c("Gay woman/lesbian","Gay man","Bisexual","Other sexual orientation")),
  marital = list(label = "Marital status", section = "MARITAL STATUS", type = "vs_ref",
    reference = "Single", m_dei = 2,
    members = c("Married/civil partnership/co-habiting","Divorced/Separated, Widowed")),
  ses = list(label = "Socio-economic background", section = "SOCIO-ECONOMIC BACKGROUND",
    type = "pairwise", reference = "Quintile 3", m_dei = 10,
    members = c("Quintile 1 (lowest participation rate in HE)","Quintile 2",
                "Quintile 3","Quintile 4","Quintile 5 (highest participation rate in HE)"))
)

# Gender: single pre-specified test, plain 95%, no correction (rule 6b).
GENDER <- list(section = "GENDER", group = "Male", reference = "Female")

# ---- Effects for one comparison (group1 vs group2) over a window -----------
# Returns pooled counts and point effects; intervals are added later at z.
comparison_core <- function(g1, g2, window_years) {
  p1 <- pool_group(g1, window_years); p2 <- pool_group(g2, window_years)
  if (p1$app == 0 || p2$app == 0)
    return(list(ok = FALSE, n1 = p1$app, a1 = p1$acc, n2 = p2$app, a2 = p2$acc))
  r1 <- p1$acc / p1$app; r2 <- p2$acc / p2$app
  list(ok = TRUE, n1 = p1$app, a1 = p1$acc, n2 = p2$app, a2 = p2$acc,
       rate1 = r1, rate2 = r2,
       pp_point = (r1 - r2) * 100,
       raw_p = raw_p_2x2(p1$acc, p1$app, p2$acc, p2$app))
}

# Build a family's forest for one window. Applies BH widening over the family,
# computes pp (Newcombe at z_star) and rr (Katz at z_star) intervals, and the
# verdicts. Returns a list of per-comparison rows + the assertion check.
family_forest <- function(d, fam, window_years) {
  # Enumerate comparisons.
  if (fam$type == "vs_ref") {
    comps <- lapply(fam$members, function(mb) list(label = mb,
      g1 = group_year_table(d, fam$section, mb),
      g2 = group_year_table(d, fam$section, fam$reference)))
  } else { # pairwise
    mb <- fam$members; pairs <- list()
    for (i in 1:(length(mb)-1)) for (j in (i+1):length(mb))
      pairs[[length(pairs)+1]] <- list(label = paste(mb[i], "vs", mb[j]),
        g1 = group_year_table(d, fam$section, mb[i]),
        g2 = group_year_table(d, fam$section, mb[j]))
    comps <- pairs
  }
  cores <- lapply(comps, function(cc) comparison_core(cc$g1, cc$g2, window_years))
  raw_p <- sapply(cores, function(cc) if (isTRUE(cc$ok)) cc$raw_p else NA_real_)
  bh <- bh_widen(raw_p)
  m  <- attr(bh, "m")

  rows <- list(); assert_ok <- TRUE
  for (k in seq_along(comps)) {
    cc <- cores[[k]]
    if (!isTRUE(cc$ok) || is.na(bh$z_star[k])) {
      rows[[k]] <- list(label = comps[[k]]$label, computable = FALSE,
                        n1 = cc$n1, n2 = cc$n2)
      next
    }
    z <- bh$z_star[k]
    pp_ci <- newcombe_ci(cc$a1, cc$n1, cc$a2, cc$n2, z) * 100
    rr    <- rate_ratio_ci(cc$a1, cc$n1, cc$a2, cc$n2, z)
    sig   <- isTRUE(bh$sig[k])
    bar_excludes_null <- !(pp_ci[1] <= 0 && pp_ci[2] >= 0)
    if (bar_excludes_null != sig) assert_ok <- FALSE   # rule 6a assertion
    rows[[k]] <- list(label = comps[[k]]$label, computable = TRUE,
      n1 = cc$n1, a1 = cc$a1, n2 = cc$n2, a2 = cc$a2,
      pp = list(value = round(cc$pp_point, 3), ci_lo = round(pp_ci[1], 3),
                ci_hi = round(pp_ci[2], 3), null = 0),
      rr = list(value = round(rr$value, 4), ci_lo = round(rr$lo, 4),
                ci_hi = round(rr$hi, 4), null = 1),
      raw_p = round(cc$raw_p, 5), p_bh = round(bh$p_bh[k], 5),
      z_star = round(z, 5),
      significant_after_bh = sig, bar_excludes_null = bar_excludes_null)
  }
  list(m = m, rows = rows, assert_ok = assert_ok)
}

# ============================================================================
# Build the full data object
# ============================================================================
build <- function() {
  d <- classify(load_raw())
  windows <- make_windows()

  # ---- Per-year series for every analysis group + constructed aggregates ----
  series <- list()
  group_keys <- unique(d[d$in_analysis, c("Section","Category")])
  for (i in seq_len(nrow(group_keys))) {
    sec <- group_keys$Section[i]; cat_ <- group_keys$Category[i]
    gyt <- group_year_table(d, sec, cat_)
    by_year <- lapply(sort(unique(d$Year)), function(yr) {
      r <- gyt[gyt$Year == yr, ]
      if (nrow(r) == 0) return(list(year = yr, applicants = NULL, accepted = NULL,
        rate = NULL, ci_lo = NULL, ci_hi = NULL, suppressed = TRUE,
        exclude_from_trend = yr %in% ERA_EXCLUDED))
      w <- wilson_ci(r$acc, r$app)
      list(year = yr, applicants = r$app, accepted = if (is.na(r$acc)) NULL else r$acc,
        rate = if (is.na(w$rate)) NULL else round(w$rate * 100, 3),
        ci_lo = if (is.na(w$lo)) NULL else round(w$lo * 100, 3),
        ci_hi = if (is.na(w$hi)) NULL else round(w$hi * 100, 3),
        suppressed = is.na(r$acc), exclude_from_trend = yr %in% ERA_EXCLUDED)
    })
    series[[length(series)+1]] <- list(characteristic = sec, group = cat_, by_year = by_year)
  }
  # constructed aggregates into the series too
  for (spec in c("Christian (all)", "Mixed (all)")) {
    sec <- if (spec == "Christian (all)") "RELIGION" else "ETHNICITY"
    gyt <- group_year_table(d, sec, spec)
    by_year <- lapply(sort(unique(d$Year)), function(yr) {
      r <- gyt[gyt$Year == yr, ]
      if (nrow(r) == 0 || is.na(r$acc)) return(list(year = yr,
        applicants = if (nrow(r)) r$app else NULL, accepted = NULL, rate = NULL,
        ci_lo = NULL, ci_hi = NULL, suppressed = TRUE,
        exclude_from_trend = yr %in% ERA_EXCLUDED))
      w <- wilson_ci(r$acc, r$app)
      list(year = yr, applicants = r$app, accepted = r$acc,
        rate = round(w$rate*100,3), ci_lo = round(w$lo*100,3), ci_hi = round(w$hi*100,3),
        suppressed = FALSE, exclude_from_trend = yr %in% ERA_EXCLUDED)
    })
    series[[length(series)+1]] <- list(characteristic = sec, group = spec,
      by_year = by_year, constructed = TRUE)
  }

  # ---- Family forests across all windows ------------------------------------
  family_out <- list(); all_assert_ok <- TRUE; m_checks <- list()
  for (fid in names(FAMILIES)) {
    fam <- FAMILIES[[fid]]
    per_window <- list()
    for (wid in names(windows)) {
      ff <- family_forest(d, fam, windows[[wid]]$years)
      if (!ff$assert_ok) all_assert_ok <- FALSE
      per_window[[wid]] <- list(m = ff$m, rows = ff$rows)
      if (wid == "2021-2024") m_checks[[fid]] <- list(got = ff$m, want = fam$m_dei)
    }
    family_out[[fid]] <- list(label = fam$label, reference = fam$reference,
      type = fam$type, m_dei = fam$m_dei, windows = per_window)
  }

  # ---- Gender single test across windows (plain 95%, no correction) ---------
  gyt_m <- group_year_table(d, GENDER$section, GENDER$group)
  gyt_f <- group_year_table(d, GENDER$section, GENDER$reference)
  gender_windows <- list()
  for (wid in names(windows)) {
    cc <- comparison_core(gyt_m, gyt_f, windows[[wid]]$years)
    if (!isTRUE(cc$ok)) { gender_windows[[wid]] <- list(computable = FALSE); next }
    pp_ci <- newcombe_ci(cc$a1, cc$n1, cc$a2, cc$n2) * 100
    rr <- rate_ratio_ci(cc$a1, cc$n1, cc$a2, cc$n2)
    gender_windows[[wid]] <- list(computable = TRUE, n1 = cc$n1, a1 = cc$a1,
      n2 = cc$n2, a2 = cc$a2,
      pp = list(value = round(cc$pp_point,3), ci_lo = round(pp_ci[1],3),
                ci_hi = round(pp_ci[2],3), null = 0),
      rr = list(value = round(rr$value,4), ci_lo = round(rr$lo,4),
                ci_hi = round(rr$hi,4), null = 1),
      raw_p = round(cc$raw_p,5))
  }

  list(
    meta = list(
      generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
      source_file = CSV_PATH, z_95 = Z_95,
      eras = list(pre_dei = ERA_PRE_DEI, dei = ERA_DEI, excluded = ERA_EXCLUDED),
      usable_years = USABLE_YEARS,
      windows = unname(lapply(windows, function(w) list(id = w$id, start = w$start,
        end = w$end, years = w$years))),
      effect_scales = c("pp","rr"),
      notes = "pp default, rate ratio optional (rule 5). Master forest and special elements pending."),
    series = series,
    families = family_out,
    gender_test = list(group = "Male", reference = "Female", windows = gender_windows),
    special = list(status = "pending: age era-change, SES era-change, age-vs-dependants E-value")
  ) -> obj

  attr(obj, "all_assert_ok") <- all_assert_ok
  attr(obj, "m_checks") <- m_checks
  obj
}

# ============================================================================
# Run, verify, emit
# ============================================================================
main <- function() {
  obj <- build()

  cat("== Verification table ==\n")
  ok <- TRUE

  cat("\n-- Family m at DEI cross-section (2021-2024) vs register 8a --\n")
  for (fid in names(attr(obj, "m_checks"))) {
    mc <- attr(obj, "m_checks")[[fid]]
    pass <- isTRUE(mc$got == mc$want)
    cat(sprintf("  [%s] %-20s m got %s want %d\n",
                if (pass) "OK" else "FAIL", fid, mc$got, mc$want))
    if (!pass) ok <- FALSE
  }

  cat("\n-- bar_excludes_null == significant_after_bh on every family row,",
      "every window (rule 6a) --\n")
  if (isTRUE(attr(obj, "all_assert_ok"))) {
    cat("  [OK] all family rows across all 45 windows agree.\n")
  } else { cat("  [FAIL] at least one row disagrees.\n"); ok <- FALSE }

  cat("\n-- Coverage --\n")
  cat("  series groups:", length(obj$series),
      "| families:", length(obj$families),
      "| windows:", length(obj$meta$windows), "\n")

  if (!ok) stop("VERIFICATION FAILED: not emitting JSON.")

  out_path <- "site/explorer_data.json"
  dir.create("site", showWarnings = FALSE)
  write_json(obj, out_path, auto_unbox = TRUE, null = "null", na = "null",
             digits = 6, pretty = TRUE)
  cat("\nWROTE", out_path, "(",
      round(file.info(out_path)$size / 1024, 1), "KB )\n")
  invisible(obj)
}

if (sys.nframe() == 0) main()
