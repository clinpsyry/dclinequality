# Data-quality check for broad racial groups: published group total vs a
# transparent sum of named sub-groups. The gap is the residual (not-specified +
# other-background buckets). Pooled over the DEI window (2021-2024).
source("pipeline/01_load_clean.R")
raw <- load_raw()
dei <- 2021:2024
eth <- raw[raw$Section == "ETHNICITY" & raw$Year %in% dei, ]

# applicants are never suppressed -> clean to sum
app <- function(cats) sum(eth$applicants_n[eth$Category %in% cats])
# accepted: drop suppressed component-years (rule 4)
acc <- function(cats) {
  v <- eth$accepted_n[eth$Category %in% cats]
  sum(v[!is.na(v)])
}
appS <- function(cats) {  # applicants only for the non-suppressed accepted rows
  sub <- eth[eth$Category %in% cats & !is.na(eth$accepted_n), ]
  sum(sub$applicants_n)
}

named <- list(
  White = c("British English","British Scottish","British Welsh","Irish","Other White background"),
  Asian = c("Indian","Pakistani","Bangladeshi","Chinese"),
  Black = c("African","Caribbean"),
  Mixed = c("White & Asian","White & Black African","White & Black Caribbean",
            "Other Mixed background","Mixed (not specified), Other Mixed background"),
  Other = c("Middle Eastern/North African")
)
published <- list(
  White = "Total in the White group",
  Asian = "Total in the Asian/Asian British/Asian English/Asian Scottish/Asian Welsh group",
  Black = "Total in the Black/Black British/Black English/Black Scottish/Black Welsh group",
  Mixed = "Total in the Mixed group",
  Other = "Total in the Other group")

cat(sprintf("%-7s %10s %10s %9s %7s | %9s %9s\n",
    "Group","Pub.app","Named.app","Resid","Resid%","Pub.rate","Named.rate"))
for (g in names(named)) {
  pa <- app(published[[g]]); na <- app(named[[g]]); resid <- pa - na
  pacc <- acc(published[[g]]); papp_ns <- appS(published[[g]])
  nacc <- acc(named[[g]]);     napp_ns <- appS(named[[g]])
  prate <- if (papp_ns > 0) 100*pacc/papp_ns else NA
  nrate <- if (napp_ns > 0) 100*nacc/napp_ns else NA
  cat(sprintf("%-7s %10d %10d %9d %6.1f%% | %8.1f%% %8.1f%%\n",
      g, pa, na, resid, 100*resid/pa, prate, nrate))
}
cat("\nResidual = applicants in the published total NOT in the named sum",
    "(i.e. 'Other X background' + 'X not specified').\n")
cat("Rates use accepted/applicants over non-suppressed rows only.\n")
