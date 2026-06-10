# Phase 1 scouting: print the exact Category strings per Section, and which
# years each appears in, so the cleaning rules match the data precisely.
# Read-only. Does not write anything.

csv_path <- "equalopps_2015-2024_merged.csv"
d <- read.csv(csv_path, stringsAsFactors = FALSE, check.names = FALSE,
              na.strings = c("", "NA"))

cat("Rows:", nrow(d), " Cols:", paste(names(d), collapse = ", "), "\n")
cat("Years:", paste(sort(unique(d$Year)), collapse = ", "), "\n")
cat("Sources:", paste(sort(unique(d$source)), collapse = " | "), "\n\n")

for (sec in unique(d$Section)) {
  cat("================ ", sec, " ================\n")
  sub <- d[d$Section == sec, ]
  cats <- unique(sub$Category)
  for (ct in cats) {
    rows <- sub[sub$Category == ct, ]
    yrs <- paste(sort(unique(rows$Year)), collapse = ",")
    n_supp <- sum(is.na(rows$accepted_n))
    cat(sprintf("  [%-2d yrs | %d suppressed] %s\n",
                length(unique(rows$Year)), n_supp, ct))
  }
  cat("\n")
}
