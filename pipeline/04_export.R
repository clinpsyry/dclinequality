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

# ---- pooled cells (RULES.md C8): flag, do not change ---------------------------
# The source adds a hidden acceptance count to the row above. 00_merge_raw.R leaves
# those "keep" pools as in the source (the published method) and notes them on the
# upper row: "Source pools this row's acceptances with 'A + B' below; ...". Flag
# the upper row (pooled_with) and the hidden rows (pooled_into) for the explorer.
pooled_names <- function(note) {
  if (is.na(note) || !grepl("^Source pools", note)) return(character(0))
  m <- regmatches(note, regexpr("(?<=with ').*(?=' below)", note, perl = TRUE))
  if (!length(m)) return(character(0))
  sub("50-54 years. 55 and over", "50-54 years, 55 and over", strsplit(m, " \\+ ")[[1]], fixed = TRUE)
}
raw_all <- load_raw(); raw_all$note[is.na(raw_all$note)] <- ""
flag_with <- list(); flag_into <- list()
for (i in which(grepl("^Source pools", raw_all$note))) {
  r <- raw_all[i, ]; hid <- pooled_names(r$note)
  flag_with[[paste(r$Section, r$Category, r$Year, sep = "|")]] <- hid
  for (h in hid) flag_into[[paste(r$Section, h, r$Year, sep = "|")]] <- r$Category
}

# ---- combined disability group: the only knowable figure (RULES.md C8) ------------
# Wheelchair, Deaf and Blind are pooled with each other in most years. Their combined
# rate is exact in a year when every hidden row among the three sits in a pool led
# by one of the three; otherwise the combined acceptances are suppressed.
SENS <- c("Wheelchair user/mobility difficulties", "Deaf/hearing impairment", "Blind/partially sighted")
SENS_LABEL <- "Wheelchair, deaf or blind (combined)"
sens <- do.call(rbind, lapply(sort(unique(raw_all$Year)), function(y) {
  s <- raw_all[raw_all$Year == y & raw_all$Section == "DISABILITY" & raw_all$Category %in% SENS, ]
  if (!nrow(s)) return(NULL)
  hidden <- unique(unlist(lapply(s$note, pooled_names)))
  exact <- all(hidden %in% SENS) && all(s$Category[is.na(s$accepted_n)] %in% hidden)
  data.frame(Section = "DISABILITY", Category = SENS_LABEL, Year = y, applicants_n = sum(s$applicants_n),
             accepted_n = if (exact) sum(s$accepted_n, na.rm = TRUE) else NA)
}))
allg <- rbind(allg, sens)
constructed_names <- c(constructed_names, SENS_LABEL)

# ---- contextual admissions questions (2023 entry onwards) -----------------------------
source("pipeline/00c_contextual.R")
ctx <- read_contextual()
ctx_g <- data.frame(Section = paste0("CONTEXT: ", ctx$question), Category = ctx$answer, Year = ctx$Year,
                    applicants_n = ctx$applicants_n, accepted_n = ctx$accepted_n)
allg <- rbind(allg, ctx_g)

# ---- overall: everyone, from the source's published yearly TOTALS row ---------------
tot <- d[d$Section == "TOTALS", ]
allg <- rbind(data.frame(Section = "OVERALL", Category = "All applicants", Year = tot$Year,
                         applicants_n = tot$applicants_n, accepted_n = tot$accepted_n), allg)
constructed_names <- c(constructed_names, "All applicants")

keys <- unique(allg[, c("Section","Category")])
groups <- list()
for (i in seq_len(nrow(keys))) {
  sec <- keys$Section[i]; cat_ <- keys$Category[i]
  rows <- allg[allg$Section == sec & allg$Category == cat_, ]
  rows <- rows[order(rows$Year), ]
  by_year <- lapply(seq_len(nrow(rows)), function(j) {
    k <- paste(sec, cat_, rows$Year[j], sep = "|")
    e <- list(year = rows$Year[j], applicants = rows$applicants_n[j],
      accepted = if (is.na(rows$accepted_n[j])) NULL else rows$accepted_n[j])
    if (!is.null(flag_with[[k]])) e$pooled_with <- I(flag_with[[k]])
    if (!is.null(flag_into[[k]])) e$pooled_into <- flag_into[[k]]
    e
  })
  groups[[length(groups)+1]] <- list(characteristic = sec, group = cat_,
    constructed = cat_ %in% constructed_names || sec == "ETHNIC GROUP (BROAD)",
    contextual = startsWith(sec, "CONTEXT: "),
    by_year = by_year)
}
ctx_secs <- unique(ctx_g$Section)
references <- c(REFERENCE_GROUP, list("ETHNIC GROUP (BROAD)" = "White"),
                setNames(as.list(rep("No", length(ctx_secs))), ctx_secs))

# ---- full ("master") forest: frozen membership, as in the published May chart -------------
# Nine characteristics (no disability); coherent categories; groups with 300+
# applicants pooled over the DEI era (ERA_DEI); reference = largest group of the characteristic,
# socio-economic = Quintiles 2 and 3 combined. One BH correction across all.
MASTER_SECS <- c("AGE", "ETHNICITY", "GENDER", "SOCIO-ECONOMIC BACKGROUND", "SEXUAL ORIENTATION",
                 "RELIGION", "MARITAL STATUS", "DEPENDANTS", "RESIDENT")
coherent <- function(cat) !grepl("Total|Prefer not|not specified|not applicable", cat, ignore.case = TRUE) &
  (!grepl(",", cat) | cat == "Divorced/Separated, Widowed")
leaf <- allg[!(allg$Category %in% constructed_names) & allg$Section %in% MASTER_SECS & coherent(allg$Category), ]
pool_leaf <- function(sec, cats, years) {
  r <- leaf[leaf$Section == sec & leaf$Category %in% cats & leaf$Year %in% years & !is.na(leaf$accepted_n), ]
  c(app = sum(r$applicants_n), acc = sum(r$accepted_n), n_cat = length(unique(r$Category)))
}
master <- list()
for (sec in MASTER_SECS) {
  cats <- unique(leaf$Category[leaf$Section == sec])
  n <- sapply(cats, function(cc) unname(pool_leaf(sec, cc, ERA_DEI)["app"]))
  keep <- cats[n >= 300]
  ref <- if (sec == "SOCIO-ECONOMIC BACKGROUND") c("Quintile 2", "Quintile 3") else keep[which.max(n[match(keep, cats)])]
  for (cc in setdiff(keep, ref)) master[[length(master) + 1]] <- list(characteristic = sec, group = cc, ref = I(ref))
}
master_table <- function(years) {
  rows <- lapply(master, function(mb) {
    g <- pool_leaf(mb$characteristic, mb$group, years)
    r <- pool_leaf(mb$characteristic, unclass(mb$ref), years)
    ok <- g["app"] > 0 && r["n_cat"] == length(mb$ref)
    list(g = g, r = r, p = if (ok) raw_p_2x2(g["acc"], g["app"], r["acc"], r["app"]) else NA)
  })
  bh <- bh_widen(sapply(rows, `[[`, "p"))
  lapply(seq_along(master), function(k) {
    g <- rows[[k]]$g; r <- rows[[k]]$r; ok <- !is.na(rows[[k]]$p)
    base <- list(characteristic = master[[k]]$characteristic, group = master[[k]]$group,
                 applicants = unname(g["app"]), accepted = unname(g["acc"]))
    if (!ok) return(c(base, list(computable = FALSE)))
    ci <- newcombe_ci(g["acc"], g["app"], r["acc"], r["app"], bh$z_star[k]) * 100
    c(base, list(computable = TRUE, pp = unname(round(100 * (g["acc"] / g["app"] - r["acc"] / r["app"]), 3)),
      pp_lo = round(ci[1], 3), pp_hi = round(ci[2], 3), raw_p = signif(rows[[k]]$p, 6),
      p_bh = round(bh$p_bh[k], 6), significant_after_bh = unname(bh$sig[k]),
      bar_excludes_null = unname(!(ci[1] <= 0 && ci[2] >= 0)), m = attr(bh, "m")))
  })
}

# Contextual questions: each 'Yes' vs 'No', one BH correction across the ten.
context_table <- function(years) {
  pl <- function(sec, ans) { r <- ctx_g[ctx_g$Section == sec & ctx_g$Category == ans & ctx_g$Year %in% years &
    !is.na(ctx_g$accepted_n), ]; c(app = sum(r$applicants_n), acc = sum(r$accepted_n)) }
  P <- lapply(ctx_secs, function(q) list(y = pl(q, "Yes"), n = pl(q, "No")))
  bh <- bh_widen(sapply(P, function(p) raw_p_2x2(p$y["acc"], p$y["app"], p$n["acc"], p$n["app"])))
  lapply(seq_along(ctx_secs), function(k) { y <- P[[k]]$y; n <- P[[k]]$n
    ci <- newcombe_ci(y["acc"], y["app"], n["acc"], n["app"], bh$z_star[k]) * 100
    list(characteristic = ctx_secs[k], applicants = unname(y["app"]), accepted = unname(y["acc"]),
      pp = unname(round(100 * (y["acc"] / y["app"] - n["acc"] / n["app"]), 3)), pp_lo = round(ci[1], 3),
      pp_hi = round(ci[2], 3), p_bh = round(bh$p_bh[k], 6), significant_after_bh = unname(bh$sig[k]),
      bar_excludes_null = unname(!(ci[1] <= 0 && ci[2] >= 0)), m = attr(bh, "m")) })
}

years_all <- sort(unique(d$Year))
export <- list(
  meta = list(source_file = CSV_PATH,
    generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
    years = years_all, latest_year = max(years_all),
    eras = list(pre_dei = ERA_PRE_DEI, dei = ERA_DEI, excluded = ERA_EXCLUDED),
    references = references,
    master = master,
    context_questions = I(ctx_secs),
    combined_groups = list(list(characteristic = "DISABILITY", group = SENS_LABEL, components = I(SENS)))),
  groups = groups)

# ---- reference.json: ethnicity DEI family (gold standard) -------------------
dei <- ERA_DEI
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
master_dei <- master_table(ERA_DEI); master_latest <- master_table(max(years_all))
context_latest <- context_table(max(years_all))
reference <- list(meta = list(generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
  note = "Gold standard; the browser's live results must match these."),
  ethnicity_dei = eth_dei,
  master_dei = master_dei, master_latest = master_latest, latest_year = max(years_all),
  context_latest = context_latest)

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
sig_names <- function(tab) unlist(lapply(Filter(function(r) isTRUE(r$significant_after_bh), tab), `[[`, "group"))
cat("Full forest: ", length(master), " frozen members; DEI era (", min(ERA_DEI), "-", max(ERA_DEI), ") significant: ", length(sig_names(master_dei)),
    "; ", max(years_all), " significant: ", length(sig_names(master_latest)), "\n", sep = "")
cat("Contextual ", max(years_all), " significant: ",
    paste(unlist(lapply(Filter(function(r) isTRUE(r$significant_after_bh), context_latest), `[[`, "characteristic")), collapse = ", "), "\n", sep = "")
cat("Pooled cells flagged: ", length(flag_with), " pools covering ", length(flag_into), " hidden rows\n", sep = "")
cat("Combined disability group years exact: ", paste(sens$Year[!is.na(sens$accepted_n)], collapse = ", "), "\n\n", sep = "")
cat("Mixed (all) by year (should now be continuous, no suppressed years):\n")
print(con[con$group == "Mixed (all)", c("Year","applicants_n","accepted_n","suppressed")],
      row.names = FALSE)
