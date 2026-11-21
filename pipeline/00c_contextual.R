# 00c_contextual.R: read the Clearing House Contextual admissions questions.
# Source:  data/raw/contextual_admissions/Contextual admissions data for <year> entry.xlsx
# Each question is a Yes / No (/ Prefer not to say / Not applicable) block. Only
# Yes and No are returned; the POLAR block is handled by 00_merge_raw.R.
# Used by 04_export.R (explorer) and posts/next/code/03_charts_2025.R.

suppressMessages(library(readxl))

CONTEXT_QUESTIONS <- c(
  "first generation"               = "First in family at university",
  "free school meals"              = "Free school meals",
  "income support"                 = "Household income support",
  "in care or looked after"        = "Care-experienced",
  "family breakdo"                 = "Family relationship broke down",
  "caring responsibilities"        = "Young carer",
  "recognised as a refugee"        = "Refugee status",
  "lower results"                  = "Contextual (lower-grade) offer",
  "funding for your undergraduate" = "Non-repayable undergrad funding",
  "funding for your postgraduate"  = "Non-repayable postgrad funding")

context_short <- function(q) {
  for (k in names(CONTEXT_QUESTIONS)) if (grepl(k, q, fixed = TRUE)) return(CONTEXT_QUESTIONS[[k]])
  stop("Unrecognised contextual question: ", q)
}

read_contextual <- function(dir = "data/raw/contextual_admissions") {
  files <- list.files(dir, pattern = "^Contextual admissions data for \\d{4} entry\\.xlsx$", full.names = TRUE)
  out <- list()
  for (f in files) {
    y <- as.integer(sub(".*for (\\d{4}) entry\\.xlsx$", "\\1", f))
    x <- as.data.frame(read_excel(f, col_names = FALSE, .name_repair = "minimal"))
    lab <- trimws(as.character(x[[1]]))
    app <- suppressWarnings(as.numeric(x[[2]])); acc <- suppressWarnings(as.numeric(x[[4]]))
    q <- NA
    for (i in seq_along(lab)) {
      if (is.na(lab[i])) next
      if (grepl("^Postcode compared with POLAR|^Yes responses", lab[i])) { q <- NA; next }
      if (is.na(app[i]) && nchar(lab[i]) > 20 && grepl("\\?$|Did |Are |Have |At any", lab[i])) { q <- context_short(lab[i]); next }
      if (!is.na(q) && !is.na(app[i]) && lab[i] %in% c("Yes", "No"))
        out[[length(out) + 1]] <- data.frame(Year = y, question = q, answer = lab[i],
                                             applicants_n = app[i], accepted_n = acc[i])
    }
  }
  d <- do.call(rbind, out)
  stopifnot(all(table(d$Year[d$answer == "Yes"]) == length(CONTEXT_QUESTIONS)))
  d
}
