# ============================================================================
# Verify every significance family from the SHIPPED counts.json: pool each
# family over the DEI window exactly as the browser does (sum reportable years,
# drop nulls), run the BH procedure, and print m + the significant groups. This
# is the R oracle the browser's live results are checked against (verify_browser
# step). Run: Rscript pipeline/verify_families.R
# ============================================================================
suppressPackageStartupMessages(library(jsonlite))
counts <- fromJSON("site/data/counts.json", simplifyVector = FALSE)
DEI <- 2021:2024

idx <- list()
for (g in counts$groups) idx[[paste(g$characteristic, g$group, sep = "|")]] <- g$by_year
pool <- function(ch, grps) {               # sum reportable DEI years over grps
  app <- 0; acc <- 0
  for (grp in grps) {
    by <- idx[[paste(ch, grp, sep = "|")]]; if (is.null(by)) next
    for (r in by) if (r$year %in% DEI && !is.null(r$accepted)) {
      app <- app + r$applicants; acc <- acc + r$accepted }
  }
  c(app = app, acc = acc)
}
rawp <- function(a1, n1, a2, n2) {
  if (n1 == 0 || n2 == 0 || (a1 + a2) == 0) return(NA)
  suppressWarnings(prop.test(c(a1, a2), c(n1, n2), correct = FALSE)$p.value)
}

AGE_OLD <- c("40-44 years","45-49 years","50-54 years","55 and over",
             "50-54 years, 55 and over","50-54 years. 55 and over")
families <- list(
  "ETHNICITY" = list(ref = "British English", members = as.list(c(
    "British Scottish","British Welsh","Irish","Other White background","Indian",
    "Pakistani","Bangladeshi","Chinese","African","Caribbean","Mixed (all)",
    "Middle Eastern/North African"))),
  "ETHNIC GROUP (BROAD)" = list(ref = "White", members = list("Asian","Black","Mixed")),
  "RELIGION" = list(ref = "No religion", members = list(
    "Jewish","Buddhist","Hindu","Christian (all)","Sikh","Muslim")),
  "SEXUAL ORIENTATION" = list(ref = "Heterosexual/straight", members = list(
    "Gay woman/lesbian","Gay man","Bisexual","Other sexual orientation")),
  "MARITAL STATUS" = list(ref = "Single", members = list(
    "Married/civil partnership/co-habiting","Divorced/Separated, Widowed")),
  "AGE" = list(ref = "25-29 years", members = list(
    "20-24 years","30-34 years","35-39 years", AGE_OLD), labels = c(
    "20-24 years","30-34 years","35-39 years","40+ years")),
  "DISABILITY" = list(ref = "No disability", members = list(
    "Dyslexia","Mental health difficulties","Unseen disability eg diabetes, epilepsy, asthma",
    "Two or more disabilities","Other disability","Personal care support",
    "Wheelchair user/mobility difficulties","Deaf/hearing impairment","Blind/partially sighted")),
  "RESIDENT" = list(ref = "UK", members = list("Other EU/EEA","Other residence")),
  "DEPENDANTS" = list(ref = "No dependants", members = list("Has dependants"))
)

for (ch in names(families)) {
  f <- families[[ch]]; refp <- pool(ch, f$ref)
  labels <- if (!is.null(f$labels)) f$labels else sapply(f$members, function(m) m[1])
  ps <- sapply(f$members, function(m) { p <- pool(ch, m)
    rawp(p["acc"], p["app"], refp["acc"], refp["app"]) })
  bh <- p.adjust(ps, "BH"); sig <- which(bh < 0.05 & !is.na(bh))
  cat(sprintf("%-22s ref=%-22s m=%d  significant: %s\n", ch, f$ref, sum(!is.na(ps)),
      if (length(sig)) paste(labels[sig], collapse = ", ") else "(none)"))
}

# Gender: single pre-specified test (plain, no BH)
gp <- pool("GENDER","Male"); gr <- pool("GENDER","Female")
cat(sprintf("%-22s ref=Female               single test p=%.4f sig=%s\n", "GENDER",
    rawp(gp["acc"], gp["app"], gr["acc"], gr["app"]),
    rawp(gp["acc"], gp["app"], gr["acc"], gr["app"]) < 0.05))

# SES pairwise (m=10)
Q <- c("Quintile 1 (lowest participation rate in HE)","Quintile 2","Quintile 3",
       "Quintile 4","Quintile 5 (highest participation rate in HE)")
pr <- c(); lab <- c()
for (i in 1:4) for (j in (i+1):5) { a <- pool("SOCIO-ECONOMIC BACKGROUND", Q[i])
  b <- pool("SOCIO-ECONOMIC BACKGROUND", Q[j])
  pr <- c(pr, rawp(a["acc"],a["app"],b["acc"],b["app"])); lab <- c(lab, paste0("Q",i,"-Q",j)) }
bh <- p.adjust(pr,"BH")
cat(sprintf("%-22s pairwise              m=%d  significant pairs: %s\n",
    "SOCIO-ECONOMIC", length(pr), paste(lab[bh<0.05], collapse=", ")))
