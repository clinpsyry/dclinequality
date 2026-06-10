# Phase 1 scouting part 2: look at the constructed-group components and the
# drifting residual rows across years, to decide how Mixed (all) and Christian
# are built and how merged residuals are handled. Read-only.

d <- read.csv("equalopps_2015-2024_merged.csv", stringsAsFactors = FALSE,
              check.names = FALSE, na.strings = c("", "NA"))

show <- function(sec, pattern) {
  sub <- d[d$Section == sec & grepl(pattern, d$Category, ignore.case = TRUE), ]
  sub <- sub[order(sub$Category, sub$Year), c("Year","Category","applicants_n","accepted_n")]
  print(sub, row.names = FALSE)
  cat("\n")
}

cat("===== ETHNICITY: Mixed components, all years =====\n")
show("ETHNICITY", "Mixed|White & ")

cat("===== RELIGION: Christian components + Jewish drift =====\n")
show("RELIGION", "Christian|Jewish|Jain")

cat("===== Year totals from TOTALS section =====\n")
tot <- d[d$Section == "TOTALS", c("Year","applicants_n","accepted_n")]
print(tot[order(tot$Year), ], row.names = FALSE)
