# 00_merge_raw.R: build the merged dataset from the raw Clearing House files.
#
# Run from the project root:  source("pipeline/00_merge_raw.R")
#
# Reads every "Equal opportunities data for <year> entry.xlsx" in
# data/raw/clearing_house/, plus the socio-economic (POLAR) rows that the Clearing
# House moved to its Contextual admissions files from the 2023 entry onwards, and
# writes the tidy long dataset the rest of the pipeline uses.
#
# Pooled cells. When a small acceptance count is suppressed, the source pools it
# with the row below: the upper row carries the combined acceptances and a success
# rate computed over BOTH rows' applicants, and the lower row shows no acceptances.
# This script detects every such pair from that arithmetic and applies the decision
# recorded for it in data/raw/pooled_cells.csv:
#   move     : give the pooled acceptances to the lower row, set the upper row to 0
#              (the convention used for 2015 to 2024; the upper row is normally a
#              tiny "Prefer not to say" or "not specified" row)
#   suppress : the lower row's acceptances stay suppressed (NA), upper row set to 0
#              (use when the upper row is too big a share of the pool to attribute)
#   merge    : combine the two rows into one category named in merged_category
#   keep     : leave as the source has it: the upper row keeps the pooled
#              acceptances over its own applicants (so its rate is overstated) and
#              the lower row stays suppressed. This is how the 2015 to 2024 dataset
#              held every pooled pair that was not hand-corrected.
# A pooled pair with no recorded decision stops the build, so every attribution is
# a visible, deliberate choice. Rules: RULES.md, docs/STATS_RULES.md.
#
# FIX_POOLED_UPPER: if TRUE, every "keep" pair is treated as suppressed on BOTH
# rows (the upper row's own acceptances are unknown), which removes the overstated
# rates. Default FALSE reproduces the 2015 to 2024 dataset exactly. See RULES.md C8.
if (!exists("FIX_POOLED_UPPER")) FIX_POOLED_UPPER <- FALSE

suppressMessages(library(readxl))

RAW_DIR     <- "data/raw/clearing_house"
POOLED_PATH <- "data/raw/pooled_cells.csv"
OUT_PATH    <- "data/equalopps_merged.csv"

SECTIONS <- c("TOTALS", "GENDER", "DEPENDANTS", "AGE", "MARITAL STATUS",
              "SEXUAL ORIENTATION", "RESIDENT", "DISABILITY", "RELIGION",
              "ETHNICITY", "SOCIO-ECONOMIC BACKGROUND")

num <- function(v) suppressWarnings(as.numeric(v))

# ---- read one year's equal-opportunities workbook --------------------------------
read_eo_year <- function(year) {
  f <- file.path(RAW_DIR, sprintf("Equal opportunities data for %d entry.xlsx", year))
  x <- as.data.frame(read_excel(f, col_names = FALSE, .name_repair = "minimal"))
  lab <- trimws(as.character(x[[1]]))
  app <- num(x[[2]]); acc <- num(x[[4]]); succ <- num(x[[6]])
  rows <- list(); sec <- NA_character_
  for (i in seq_len(nrow(x))) {
    if (is.na(lab[i]) || lab[i] == "") next
    if (lab[i] == "TOTALS" && !is.na(app[i])) {
      rows[[length(rows) + 1]] <- data.frame(Section = "TOTALS", Category = "TOTALS",
        applicants_n = app[i], accepted_n = acc[i], success = succ[i])
      next
    }
    if (lab[i] %in% SECTIONS) { sec <- lab[i]; next }
    if (!is.na(sec) && !is.na(app[i])) {
      rows[[length(rows) + 1]] <- data.frame(Section = sec, Category = lab[i],
        applicants_n = app[i], accepted_n = acc[i], success = succ[i])
    }
  }
  d <- do.call(rbind, rows)
  d$Year <- year
  d$source <- "equalopps_workbook"
  d
}

# ---- detect pooled pairs within one section of one year --------------------------
# A pool can span more than two rows (e.g. 2021 disability: Blind + Deaf +
# Wheelchair). For k = 1, 2, ... following rows with no acceptances, test whether
# the upper row's success rate equals its acceptances over all k + 1 rows'
# applicants. "lower" lists the pooled rows joined by " + ".
find_pooled <- function(d) {
  out <- list()
  for (i in seq_len(nrow(d) - 1)) {
    a <- d[i, ]
    if (is.na(a$accepted_n) || is.na(a$success) || a$accepted_n == 0) next
    if (abs(a$success - a$accepted_n / a$applicants_n) <= 1e-6) next
    j <- i; apps <- a$applicants_n; hit <- NA
    while (j < nrow(d) && d$Section[j + 1] == a$Section && is.na(d$accepted_n[j + 1])) {
      j <- j + 1; apps <- apps + d$applicants_n[j]
      if (abs(a$success - a$accepted_n / apps) < 1e-6) { hit <- j; break }
    }
    if (!is.na(hit)) out[[length(out) + 1]] <- data.frame(Year = a$Year, Section = a$Section,
      upper = a$Category, lower = paste(d$Category[(i + 1):hit], collapse = " + "),
      upper_row = i, n_lower = hit - i)
  }
  if (length(out)) do.call(rbind, out) else NULL
}

apply_pooled <- function(d, decisions) {
  pairs <- find_pooled(d)
  d$note <- ""
  if (is.null(pairs)) return(d)
  drop <- integer(0)
  for (k in seq_len(nrow(pairs))) {
    p <- pairs[k, ]
    dec <- decisions[decisions$Year == p$Year & decisions$Section == p$Section &
                     decisions$upper == p$upper & decisions$lower == p$lower, ]
    if (nrow(dec) != 1) stop(sprintf(
      "Pooled cell with no decision: %d %s: '%s' pooled into '%s'. Add a row to %s.",
      p$Year, p$Section, p$upper, p$lower, POOLED_PATH))
    i <- p$upper_row; j <- i + 1; jj <- i + p$n_lower
    if (p$n_lower > 1 && dec$decision != "keep")
      stop(sprintf("Only 'keep' is supported for a pool of more than two rows (%d %s '%s')", p$Year, p$Section, p$upper))
    if (dec$decision == "move") {
      d$accepted_n[j] <- d$accepted_n[i]; d$accepted_n[i] <- 0
      d$note[j] <- sprintf("Acceptance values moved here from misaligned '%s' row above; success rate recomputed", p$upper)
      d$note[i] <- sprintf("Acceptance values reassigned to '%s' row; set to 0 here (true value suppressed in source)", p$lower)
    } else if (dec$decision == "suppress") {
      d$accepted_n[i] <- 0
      d$note[j] <- sprintf("Acceptances pooled with '%s' in the source and cannot be attributed; kept suppressed", p$upper)
      d$note[i] <- sprintf("Acceptances pooled with '%s' in the source; set to 0 here (true value suppressed in source)", p$lower)
    } else if (dec$decision == "keep" && !FIX_POOLED_UPPER) {
      d$note[i] <- sprintf("Source pools this row's acceptances with '%s' below; accepted_n includes both, so the rate is overstated", p$lower)
    } else if (dec$decision == "keep" && FIX_POOLED_UPPER) {
      d$note[i] <- sprintf("Acceptances pooled with '%s' in the source (%d over %d applicants for the pool); own value unknown, set to suppressed",
                           p$lower, as.integer(d$accepted_n[i]), as.integer(sum(d$applicants_n[i:jj])))
      d$accepted_n[i] <- NA
    } else if (dec$decision == "merge") {
      d$Category[i] <- dec$merged_category
      d$applicants_n[i] <- d$applicants_n[i] + d$applicants_n[j]
      d$note[i] <- sprintf("'%s' and '%s' merged: the source pooled their acceptances", p$upper, p$lower)
      drop <- c(drop, j)
    } else stop("Unknown decision: ", dec$decision)
  }
  if (length(drop)) d <- d[-drop, ]
  d
}

# ---- socio-economic rows from the Contextual admissions files (2023 onwards) ------
# Files: data/raw/contextual_admissions/Contextual admissions data for <year> entry.xlsx
# (Clearing House, Contextual admissions data page). Only the POLAR block is used;
# the other contextual questions (first generation, free school meals, etc.) are
# not merged.
read_contextual_ses <- function(years) {
  dir <- "data/raw/contextual_admissions"
  out <- list()
  for (y in years) {
    f <- file.path(dir, sprintf("Contextual admissions data for %d entry.xlsx", y))
    if (file.exists(f)) {
      x <- as.data.frame(read_excel(f, col_names = FALSE, .name_repair = "minimal"))
      lab <- trimws(as.character(x[[1]])); app <- num(x[[2]]); acc <- num(x[[4]])
      start <- which(grepl("^Postcode compared with POLAR", lab))[1]
      if (is.na(start)) stop("No 'Postcode compared with POLAR' section found in ", f)
      i <- start + 1; rows <- list()
      while (i <= nrow(x) && !is.na(app[i])) {
        rows[[length(rows) + 1]] <- data.frame(Year = y, Section = "SOCIO-ECONOMIC BACKGROUND",
          Category = lab[i], applicants_n = app[i], accepted_n = acc[i],
          note = "SES POLAR for this year sourced from the Contextual Admissions page",
          source = "contextual_admissions")
        i <- i + 1
      }
      if (length(rows) != 6) stop("Expected 6 POLAR rows in ", f, ", found ", length(rows))
      out[[length(out) + 1]] <- do.call(rbind, rows)
    } else {
      warning(sprintf("No socio-economic data for %d: add the Contextual admissions file to %s", y, dir))
    }
  }
  if (length(out)) do.call(rbind, out) else NULL
}

# ---- build -------------------------------------------------------------------
build_merged <- function(years = NULL) {
  if (is.null(years)) years <- sort(as.integer(sub(".*for (\\d{4}) entry\\.xlsx$", "\\1",
                list.files(RAW_DIR, pattern = "^Equal opportunities data for \\d{4} entry\\.xlsx$"))))
  decisions <- read.csv(POOLED_PATH, stringsAsFactors = FALSE)
  eo <- do.call(rbind, lapply(years, function(y) apply_pooled(read_eo_year(y), decisions)))
  eo$success <- NULL
  ses_years <- years[!years %in% unique(eo$Year[eo$Section == "SOCIO-ECONOMIC BACKGROUND"])]
  ses <- read_contextual_ses(ses_years)
  d <- rbind(eo[, c("Year", "Section", "Category", "applicants_n", "accepted_n", "note", "source")], ses)
  # Source label typos (after pooling, which matches on the raw labels)
  d$Category[d$Category == "50-54 years. 55 and over"] <- "50-54 years, 55 and over"
  # Contextual files from 2024 spell out "Higher Education"; keep the 2023 "HE" label
  d$Category <- sub("participation rate in Higher Education\\)$", "participation rate in HE)", d$Category)
  d$applicants_n <- as.integer(d$applicants_n); d$accepted_n <- as.integer(d$accepted_n)
  d <- d[order(d$Year, d$Section, d$Category), ]
  rownames(d) <- NULL
  d
}

if (exists("MERGE_ONLY_FUNCTIONS") && isTRUE(MERGE_ONLY_FUNCTIONS)) stop_here <- TRUE else stop_here <- FALSE
if (!stop_here) {
merged <- build_merged()
write.csv(merged, OUT_PATH, row.names = FALSE, na = "")
cat("Wrote", OUT_PATH, ":", nrow(merged), "rows, years",
    paste(range(merged$Year), collapse = " to "), "\n")
}
