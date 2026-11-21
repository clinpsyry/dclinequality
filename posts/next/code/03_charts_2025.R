# 03_charts_2025.R: charts for the 2025 post, house style, mobile first.
# Run from the project root:  source("posts/next/code/03_charts_2025.R")
#
# Mobile first: most readers see the post on a phone, where Substack shows an
# image about 375 px wide. Charts are 5.5 in wide at 300 dpi (1,650 px) with text
# sized so it lands at roughly 11 to 19 px on a phone; forest charts put each
# group's name above its row so the plot uses the full width. The same images read
# fine on desktop. Published method throughout (RULES.md C8). The published
# comparison figure is a dark tick (forests) or dark line (bars).

source("posts/next/code/01_2025_analysis.R")   # dei, y25, pool(), families, Q, trend, run_ses_pairs()
source("R/dclinpsy_style.R")
suppressPackageStartupMessages({ library(ggplot2); library(readxl) })

CH <- "posts/next/charts"
dir.create(CH, showWarnings = FALSE, recursive = TRUE)
unlink(list.files(CH, pattern = "\\.png$", full.names = TRUE))

W <- 5.5                                  # inches; 1,650 px at 300 dpi
ft_grey_faded <- "#BCB3A4"                # not-significant marks (docs/chart_style_guide_visual.md)
ink <- "grey20"; muted <- "grey40"
TXT <- 4.3                                # geom_text size in mm (about 12 pt)
SRC <- "Source: DClinPsy Clearing House."
fmt_pp <- function(x) sprintf("%+.1f", x)
fmt_n  <- function(x) formatC(round(as.numeric(x)), format = "d", big.mark = ",")   # counts: always whole numbers
wrap <- function(x, n) paste(strwrap(x, width = n), collapse = "\n")
T_W <- 38; C_W <- 68                      # characters per line at 5.5 in: title, footnote

theme_mobile <- function() {
  theme_dclinpsy(base_size = 15) +
    theme(plot.title    = element_text(face = "bold", size = 19, lineheight = 1.1, margin = margin(b = 16)),
          plot.subtitle = element_text(size = 13.5, colour = "grey30", lineheight = 1.25, margin = margin(b = 14)),
          plot.caption  = element_text(size = 11, colour = "grey40", lineheight = 1.2, hjust = 0, margin = margin(t = 14)),
          axis.text     = element_text(size = 12.5, colour = "grey30"),
          strip.text    = element_text(size = 13, face = "bold", hjust = 0, colour = ink),
          plot.margin   = margin(18, 18, 14, 18))
}
# House rule (21 Nov 2026): a plain descriptive title only, no headline or subtitle;
# the interpretation goes in the post. The footnote carries only the key, the
# reference group, the method and the source.
lab_ <- function(title, caption)
  labs(title = wrap(title, T_W), caption = wrap(caption, C_W), x = NULL, y = NULL)
save_m <- function(p, file, h) save_chart(p, file.path(CH, file), w = W, h = h)
pp_axis <- function(x) paste0(ifelse(x > 0, "+", ""), x)

# ---- forest, mobile layout: name above each row, value at the right -------------
# d: label, gap, lo, hi, sig, cmp (comparison figure for the tick; NA for none)
forest <- function(d, title, caption, file, xbreaks = waiver()) {
  d <- d[order(d$gap, decreasing = TRUE), ]
  d$y <- rev(seq_len(nrow(d)))
  rng <- range(c(d$lo, d$hi, d$cmp, 0), na.rm = TRUE)
  sig <- d$sig %in% TRUE
  p <- ggplot(d) +
    geom_vline(xintercept = 0, colour = "grey50", linetype = "dashed", linewidth = 0.5) +
    geom_segment(aes(x = lo, xend = hi, y = y, yend = y), colour = ifelse(sig, ft_red, ft_grey_faded), linewidth = 1.3) +
    geom_point(data = d[!is.na(d$cmp), ], aes(x = cmp, y = y), shape = 124, size = 7, colour = ink) +
    geom_point(data = d[sig, ], aes(x = gap, y = y), colour = ft_red, size = 4.6) +
    geom_point(data = d[!sig, ], aes(x = gap, y = y), shape = 21, fill = ft_bg, colour = "grey50", stroke = 1.2, size = 4.2) +
    geom_label(aes(x = -Inf, y = y + 0.42, label = label), hjust = 0, size = TXT, family = "inter", colour = ink,
               fill = ft_bg, label.size = 0, label.padding = unit(0.08, "lines")) +
    geom_text(aes(x = Inf, y = y + 0.42, label = paste(fmt_pp(gap), "pp")), hjust = 1, size = TXT,
              family = "inter", fontface = ifelse(sig, "bold", "plain"), colour = ifelse(sig, ink, muted)) +
    # extra room on the right so the value labels never sit on the data or the zero line
    scale_x_continuous(labels = pp_axis, breaks = xbreaks, expand = expansion(mult = c(0.04, 0.24))) +
    scale_y_continuous(limits = c(0.55, nrow(d) + 0.75), breaks = NULL) +
    lab_(title, caption) + theme_mobile() +
    theme(panel.grid.major.y = element_blank(), axis.text.y = element_blank())
  save_m(p, file, h = 2.6 + 0.78 * nrow(d))
}
fam_df <- function(ch, label_fun = identity) {
  a <- y25$families[y25$families$characteristic == ch, ]; a <- a[!is.na(a$gap_pp), ]
  b <- dei$families[dei$families$characteristic == ch, ]
  data.frame(label = paste0(label_fun(a$group), ifelse(a$app < 100, "*", ""), "  ", a$acc, "/", fmt_n(a$app)),
             gap = a$gap_pp, lo = a$lo_bh, hi = a$hi_bh, sig = a$sig, cmp = b$gap_pp[match(a$group, b$group)])
}
TICK <- "Dot and bar: 2025. Dark tick: 2021–24."
KEY <- "Red: differs from the reference after Benjamini-Hochberg correction; grey: no clear difference."
BH <- "Bars are 95% intervals widened to the Benjamini-Hochberg level."
LOWN <- "* fewer than 100 applicants in 2025."

# ==== 1. Headline gaps ======================================================
s25 <- y25$singles; sd <- dei$singles
nm <- c("Male vs Female" = "Men vs women", "40+ vs under 40" = "Aged 40+ vs under 40",
        "Has dependants vs No dependants" = "With dependants vs without",
        "Q1 vs Q5 (lowest vs highest HE participation)" = "Poorest vs richest HE areas")
forest(data.frame(label = nm[s25$test], gap = s25$gap_pp, lo = s25$lo, hi = s25$hi, sig = s25$sig,
                  cmp = sd$gap_pp[match(s25$test, sd$test)]),
       "Acceptance-rate gaps, 2025 and 2021–24 (percentage points)",
       paste(TICK, "Single pre-specified comparisons, 95% Newcombe intervals. HE areas: POLAR quintile 1 vs 5.",
             "Not adjusted for confounding between characteristics.", SRC),
       "01_headline_gaps_2025.png")

# ==== 2 and 4. Trend charts ===================================================
tr <- trend[trend$year != 2020, ]
tr$era <- ifelse(tr$year <= 2019, "pre", ifelse(tr$year <= 2024, "dei", "y25"))
tr$col <- c(pre = "grey55", dei = ft_red, y25 = ink)[tr$era]
trend_chart <- function(var, title, caption, file) {
  tr$v <- tr[[var]]; yl <- range(c(tr$v, 0)); span <- diff(yl)
  run <- ifelse(tr$era == "y25", "dei", tr$era)
  tr$pos <- vapply(seq_len(nrow(tr)), function(i) {
    nb <- c(if (i > 1 && run[i - 1] == run[i]) tr$v[i - 1], if (i < nrow(tr) && run[i + 1] == run[i]) tr$v[i + 1])
    if (!length(nb) || all(tr$v[i] >= nb)) "above" else if (all(tr$v[i] <= nb)) "below" else "right" }, "")
  tr$x <- seq_len(nrow(tr))
  tr$lx <- tr$x + ifelse(tr$pos == "right", 0.25, 0)
  tr$ly <- tr$v + c(above = 0.05, below = -0.05, right = 0)[tr$pos] * span
  p <- ggplot(tr, aes(x = x, y = v)) +
    geom_hline(yintercept = 0, colour = "grey55", linetype = "dashed", linewidth = 0.5) +
    geom_line(data = tr[tr$era == "pre", ], colour = "grey55", linewidth = 1.3) +
    geom_line(data = tr[tr$era == "dei", ], colour = ft_red, linewidth = 1.3) +
    geom_line(data = tr[tr$year %in% 2024:2025, ], colour = ink, linewidth = 0.9, linetype = "dotted") +
    geom_point(aes(colour = col), size = 3.8) +
    geom_text(aes(x = lx, y = ly, label = sprintf("%.1f", v), colour = col,
                  hjust = ifelse(pos == "right", 0, 0.5), vjust = ifelse(pos == "above", 0, ifelse(pos == "below", 1, 0.5))),
              size = 3.9, fontface = "bold", family = "inter") +
    annotate("text", x = c(3, 7.5, 10), y = yl[2] + span * 0.17, label = c("Pre-DEI", "DEI era", "2025"),
             colour = c("grey50", ft_red, ink), fontface = "bold", family = "inter", size = TXT) +
    scale_colour_identity() +
    scale_x_continuous(breaks = tr$x, labels = paste0("'", substr(tr$year, 3, 4)), expand = expansion(add = 0.5)) +
    scale_y_continuous(labels = function(x) paste(x, "pp"), limits = c(yl[1] - span * 0.12, yl[2] + span * 0.22)) +
    lab_(title, caption) + theme_mobile() + theme(panel.grid.major.x = element_blank())
  save_m(p, file, h = 6)
}
trend_chart("age_gap_pp", "Acceptance-rate gap, aged 40+ vs under 40, by year (percentage points)",
  paste("Negative: applicants aged 40+ accepted less often. 2020 excluded (transition year).", SRC),
  "02_age_gap_trend_2015-2025.png")
trend_chart("sex_gap_pp", "Acceptance-rate gap, men vs women, by year (percentage points)",
  paste("Negative: men accepted less often. 2020 excluded (transition year).", SRC),
  "04_sex_gap_trend_2015-2025.png")

# ==== 3. Age bands ============================================================
BANDS <- c("20-24 years", "25-29 years", "30-34 years", "35-39 years", "40-44 years", "45-49 years")
band <- do.call(rbind, lapply(BANDS, function(b) { x <- pool("AGE", b, 2025); y <- pool("AGE", b, 2021:2024)
  data.frame(band = sub(" years", "", b), r25 = 100 * x["acc"] / x["app"], rdei = 100 * y["acc"] / y["app"]) }))
p3 <- ggplot(band, aes(x = band)) +
  geom_col(aes(y = r25), fill = ft_red, width = 0.62) +
  geom_errorbar(aes(ymin = rdei, ymax = rdei), colour = ink, width = 0.78, linewidth = 1.2) +
  geom_text(aes(y = r25 - 0.8, label = sprintf("%.1f", r25)), colour = "white", fontface = "bold", size = TXT, family = "inter", vjust = 1) +
  geom_text(aes(y = rdei + 0.5, label = sprintf("%.1f", rdei)), colour = "grey30", size = 3.6, family = "inter", vjust = 0) +
  annotate("text", x = 1, y = band$rdei[1] + 2.6, label = "2021–24", colour = "grey30", size = 3.6, family = "inter", fontface = "italic") +
  scale_y_continuous(expand = expansion(mult = c(0, 0.08)), labels = NULL) +
  lab_("Acceptance rate by age band, 2025 and 2021–24 (%)",
       paste("Bars: 2025. Dark line: 2021–24. Ages 50 and over are suppressed in the source.", SRC)) +
  theme_mobile() + theme(panel.grid.major = element_blank(), axis.text.x = element_text(size = 12.5))
save_m(p3, "03_age_bands_2025.png", h = 5.6)

# ==== 5 to 7. Characteristic forests ============================================
short <- function(x) { x <- sub("Middle Eastern/North African", "Middle Eastern/N. African", x); sub(" background", "", x) }
forest(fam_df("ETHNICITY", short), "Acceptance-rate gap by ethnicity vs British English, 2025 (percentage points)",
       paste("Reference: British English, 23.2% accepted.", TICK, KEY, "Labels: accepted/applicants.", LOWN, BH, SRC),
       "05_ethnicity_2025.png")
forest(fam_df("RELIGION"), "Acceptance-rate gap by religion vs no religion, 2025 (percentage points)",
       paste("Reference: no religion, 21.7% accepted. Christian denominations combined.", TICK, KEY,
             "Labels: accepted/applicants.", LOWN, BH, SRC),
       "06_religion_2025.png")
forest(fam_df("SEXUAL ORIENTATION", function(x) sub("Other sexual orientation", "Other orientation", x)),
       "Acceptance-rate gap by sexual orientation vs heterosexual, 2025 (percentage points)",
       paste("Reference: heterosexual/straight, 18.5% accepted.", TICK, KEY, "Labels: accepted/applicants.", LOWN, BH, SRC),
       "07_sexual_orientation_2025.png")

# ==== 8. Socio-economic vs Q3 ======================================================
ses_vs_q3 <- function(years) {
  pr <- run_ses_pairs(years); want <- c("Q1 vs Q3", "Q2 vs Q3", "Q3 vs Q4", "Q3 vs Q5")
  r <- pr[pr$pair %in% want, ]; flip <- r$pair %in% c("Q3 vs Q4", "Q3 vs Q5")
  data.frame(q = c("Q1", "Q2", "Q4", "Q5")[match(r$pair, want)], gap = ifelse(flip, -r$gap_pp, r$gap_pp),
             lo = ifelse(flip, -r$hi_bh, r$lo_bh), hi = ifelse(flip, -r$lo_bh, r$hi_bh), sig = r$sig)
}
s5 <- ses_vs_q3(2025); sdei <- ses_vs_q3(2021:2024)
qn <- sapply(Q, function(q) { x <- pool("SOCIO-ECONOMIC BACKGROUND", q, 2025); paste0(x["acc"], "/", fmt_n(x["app"])) })
qlab <- c(Q1 = "Q1, least advantaged", Q2 = "Q2", Q4 = "Q4", Q5 = "Q5, most advantaged")
forest(data.frame(label = paste0(qlab[s5$q], "  ", qn[match(s5$q, c("Q1", "Q2", "Q3", "Q4", "Q5"))]),
                  gap = s5$gap, lo = s5$lo, hi = s5$hi, sig = s5$sig, cmp = sdei$gap[match(s5$q, sdei$q)]),
       "Acceptance-rate gap by POLAR quintile vs the middle quintile, 2025 (percentage points)",
       paste0("Reference: Q3, 19.3% accepted (", qn[3], "). POLAR: HE participation by home area. ", TICK, " ", KEY,
              " Correction across all ten quintile pairs. ", BH, " ", SRC),
       "08_socio_economic_2025.png")

# ==== 9. Competition ===================================================================
m <- read.csv("data/equalopps_merged.csv", stringsAsFactors = FALSE)
tot <- m[m$Section == "TOTALS", c("Year", "applicants_n", "accepted_n")]
tot$rate <- 100 * tot$accepted_n / tot$applicants_n
cnt <- rbind(data.frame(year = tot$Year, v = tot$applicants_n, s = "Applicants"),
             data.frame(year = tot$Year, v = tot$accepted_n, s = "Accepted"))
cnt$panel <- "Applicants and acceptances"
rt <- data.frame(year = tot$Year, v = tot$rate, s = "Rate", panel = "Acceptance rate (%)")
both <- rbind(cnt, rt); both$panel <- factor(both$panel, levels = c("Applicants and acceptances", "Acceptance rate (%)"))
ends <- both[both$year %in% c(2015, 2022, 2025), ]
ends$lab <- ifelse(ends$s == "Rate", sprintf("%.1f%%", ends$v), formatC(round(ends$v), format = "d", big.mark = ","))
ends$hj <- c(`2015` = 0.15, `2022` = 0.5, `2025` = 0.85)[as.character(ends$year)]
p9 <- ggplot(both, aes(year, v, group = s)) +
  geom_line(aes(colour = ifelse(s == "Accepted", ink, ft_red)), linewidth = 1.3) +
  geom_point(data = ends, aes(colour = ifelse(s == "Accepted", ink, ft_red)), size = 3) +
  geom_text(data = ends, aes(label = lab, hjust = hj), vjust = -0.9, size = 3.8, family = "inter", colour = ink, fontface = "bold") +
  geom_text(data = both[both$year == 2018 & both$s != "Rate", ], aes(label = s, colour = ifelse(s == "Accepted", ink, ft_red)),
            vjust = -1.1, size = TXT, family = "inter", fontface = "bold") +
  facet_wrap(~panel, ncol = 1, scales = "free_y") +
  scale_colour_identity() +
  scale_x_continuous(breaks = c(2015, 2018, 2021, 2025), expand = expansion(add = c(0.6, 0.6))) +
  scale_y_continuous(labels = function(x) formatC(x, format = "d", big.mark = ","), expand = expansion(mult = c(0.08, 0.28)), limits = function(l) c(0, l[2])) +
  lab_("Applicants, acceptances and acceptance rate, 2015–2025",
       paste("All applicants and acceptances, each entry year.", SRC)) +
  theme_mobile() + theme(panel.grid.major.x = element_blank(), panel.spacing = unit(1.4, "lines"))
save_m(p9, "09_competition_2015-2025.png", h = 7)

# ==== 10 and 11. Contextual admissions =========================================================
CTX_SHORT <- c("first generation" = "First in family at university", "free school meals" = "Free school meals",
               "income support" = "Household income support", "in care or looked after" = "Care-experienced",
               "family breakdo" = "Family relationship broke down", "caring responsibilities" = "Young carer",
               "recognised as a refugee" = "Refugee status", "lower results" = "Contextual (lower-grade) offer",
               "funding for your undergraduate" = "Non-repayable undergrad funding",
               "funding for your postgraduate" = "Non-repayable postgrad funding")
short_q <- function(q) { for (k in names(CTX_SHORT)) if (grepl(k, q, fixed = TRUE)) return(CTX_SHORT[[k]]); q }
ctx <- do.call(rbind, lapply(2023:2025, function(y) {
  x <- as.data.frame(read_excel(sprintf("data/raw/contextual_admissions/Contextual admissions data for %d entry.xlsx", y),
                                col_names = FALSE, .name_repair = "minimal"))
  lab <- trimws(as.character(x[[1]])); app <- suppressWarnings(as.numeric(x[[2]])); acc <- suppressWarnings(as.numeric(x[[4]]))
  out <- list(); q <- NA
  for (i in seq_along(lab)) {
    if (is.na(lab[i])) next
    if (is.na(app[i]) && nchar(lab[i]) > 20) { q <- short_q(lab[i]); next }
    if (!is.na(q) && !is.na(app[i]) && lab[i] %in% c("Yes", "No"))
      out[[length(out) + 1]] <- data.frame(year = y, q = q, ans = lab[i], app = app[i], acc = acc[i])
  }
  do.call(rbind, out)
}))
stopifnot(all(ctx$q %in% CTX_SHORT), length(unique(ctx$q)) == 10)
cgap <- function(years) do.call(rbind, lapply(unique(ctx$q), function(q) {
  s <- ctx[ctx$q == q & ctx$year %in% years, ]
  y <- colSums(s[s$ans == "Yes", c("app", "acc")]); n <- colSums(s[s$ans == "No", c("app", "acc")])
  data.frame(q = q, yes_acc = y["acc"], yes_app = y["app"], no_acc = n["acc"], no_app = n["app"],
             gap = 100 * (y["acc"] / y["app"] - n["acc"] / n["app"]), p = raw_p_2x2(y["acc"], y["app"], n["acc"], n["app"]), row.names = NULL)
}))
c25 <- cgap(2025); bh <- bh_widen(c25$p); c25$sig <- bh$sig
ci <- t(mapply(function(a, n, ra, rn, z) 100 * newcombe_ci(a, n, ra, rn, z), c25$yes_acc, c25$yes_app, c25$no_acc, c25$no_app, bh$z_star))
c25$lo <- ci[, 1]; c25$hi <- ci[, 2]
c2324 <- cgap(2023:2024)
forest(data.frame(label = paste0(c25$q, ifelse(c25$yes_app < 100, "*", ""), "  ", c25$yes_acc, "/", fmt_n(c25$yes_app)),
                  gap = c25$gap, lo = c25$lo, hi = c25$hi, sig = c25$sig, cmp = c2324$gap[match(c25$q, c2324$q)]),
       "Acceptance-rate gap by contextual admissions question, 'yes' vs 'no', 2025 (percentage points)",
       paste("Dot and bar: 2025. Dark tick: 2023–24.", KEY, "Labels: accepted/applicants answering 'yes'.", LOWN,
             "Bars are 95% intervals widened to the Benjamini-Hochberg level across the ten questions.",
             "Questions asked since 2023 entry. Not adjusted for other characteristics.", SRC),
       "10_contextual_admissions_2025.png")

cy <- do.call(rbind, lapply(2023:2025, function(y) { g <- cgap(y); g$year <- y; g }))
foc <- c("Family relationship broke down", "First in family at university")
cy$hl <- cy$q %in% foc
endl <- cy[cy$year == 2025, ]
p11 <- ggplot(cy, aes(year, gap, group = q)) +
  geom_hline(yintercept = 0, colour = "grey55", linetype = "dashed", linewidth = 0.5) +
  geom_line(data = cy[!cy$hl, ], colour = ft_grey_faded, linewidth = 0.8) +
  geom_line(data = cy[cy$hl, ], aes(colour = ifelse(q == foc[1], ft_red, ink)), linewidth = 1.5) +
  geom_point(data = cy[cy$hl, ], aes(colour = ifelse(q == foc[1], ft_red, ink)), size = 3.6) +
  geom_text(data = cy[cy$hl, ], aes(label = sprintf("%.1f", gap), vjust = ifelse(q == foc[1], 1.9, -1)),
            size = 3.9, family = "inter", fontface = "bold", colour = ink) +
  geom_text(data = endl[endl$hl, ], aes(x = 2023, y = ifelse(q == foc[1], -9.6, -7.9), label = q,
            colour = ifelse(q == foc[1], ft_red, ink)), hjust = 0, size = TXT, family = "inter", fontface = "bold") +
  scale_colour_identity() +
  scale_x_continuous(breaks = 2023:2025, expand = expansion(add = c(0.25, 0.25))) +
  scale_y_continuous(labels = function(x) paste(x, "pp"), limits = c(-10.5, 6)) +
  lab_("Acceptance-rate gap by contextual question, 'yes' vs 'no', 2023–2025 (percentage points)",
       paste("Grey: the other eight questions. Negative: 'yes' accepted less often. Year-to-year changes are descriptive, not tested.", SRC)) +
  theme_mobile() + theme(panel.grid.major.x = element_blank())
save_m(p11, "11_contextual_widening_2023-2025.png", h = 6)

# ==== 12. Applicant mix ============================================================================
share <- function(sec, cats) sapply(2015:2025, function(y) {
  s <- m[m$Year == y & m$Section == sec, ]; 100 * sum(s$applicants_n[s$Category %in% cats]) / m$applicants_n[m$Year == y & m$Section == "TOTALS"] })
OLD30 <- c("30-34 years", "35-39 years", "40-44 years", "45-49 years", "50-54 years", "55 and over", "50-54 years, 55 and over")
mix <- rbind(data.frame(year = 2015:2025, v = share("DISABILITY", "Total with a disability"), s = "Declared a\ndisability"),
             data.frame(year = 2015:2025, v = share("SEXUAL ORIENTATION", c("Bisexual", "Gay man", "Gay woman/lesbian")), s = "Lesbian, gay\nor bisexual"),
             data.frame(year = 2015:2025, v = share("AGE", OLD30), s = "Aged 30\nor over"),
             data.frame(year = 2015:2025, v = share("DEPENDANTS", "Has dependants"), s = "Has\ndependants"))
mix$s <- factor(mix$s, levels = unique(mix$s))
me <- mix[mix$year %in% c(2015, 2025), ]
p12 <- ggplot(mix, aes(year, v)) +
  geom_line(colour = ft_red, linewidth = 1.3) +
  geom_point(data = me, colour = ft_red, size = 3) +
  geom_text(data = me, aes(label = sprintf("%.1f%%", v), hjust = ifelse(year == 2015, 0.1, 0.9)), vjust = -1,
            size = 3.9, family = "inter", fontface = "bold", colour = ink) +
  facet_wrap(~s, ncol = 2) +
  scale_x_continuous(breaks = c(2015, 2025), expand = expansion(add = c(1.2, 1.2))) +
  scale_y_continuous(labels = function(x) paste0(x, "%"), limits = c(0, 33)) +
  lab_("Share of all applicants by characteristic, 2015–2025 (%)",
       paste("Lesbian, gay or bisexual: bisexual, gay man and gay woman/lesbian combined.", SRC)) +
  theme_mobile() + theme(panel.grid.major.x = element_blank(), panel.spacing = unit(1.2, "lines"))
save_m(p12, "12_applicant_mix_2015-2025.png", h = 6.2)

# ==== 13. Share of applicants vs share of acceptances, 2025 ==========================================
pick <- data.frame(sec = c("AGE", "ETHNICITY", "SOCIO-ECONOMIC BACKGROUND", "DEPENDANTS", "AGE", "GENDER", "RELIGION"),
                   cat = c("25-29 years", "British English", Q[5], "Has dependants", "20-24 years", "Male", "Muslim"),
                   lab = c("Aged 25-29", "British English", "Most advantaged HE areas (Q5)", "Has dependants", "Aged 20-24", "Men", "Muslim"))
sh <- do.call(rbind, lapply(seq_len(nrow(pick)), function(i) {
  r <- m[m$Year == 2025 & m$Section == pick$sec[i] & m$Category == pick$cat[i], ]
  data.frame(lab = pick$lab[i], app = 100 * r$applicants_n / 5910, acc = 100 * r$accepted_n / 1177) }))
sh$d <- sh$acc - sh$app; sh <- sh[order(sh$d), ]; sh$y <- seq_len(nrow(sh))
p13 <- ggplot(sh) +
  geom_segment(aes(x = app, xend = acc, y = y, yend = y), colour = "grey60", linewidth = 1.1) +
  geom_point(aes(x = app, y = y), shape = 21, fill = ft_bg, colour = "grey40", stroke = 1.2, size = 4.2) +
  geom_point(aes(x = acc, y = y), colour = ft_red, size = 4.6) +
  geom_text(aes(x = -Inf, y = y + 0.4, label = lab), hjust = 0, size = TXT, family = "inter", colour = ink) +
  geom_text(aes(x = Inf, y = y + 0.4, label = sprintf("%.0f%% → %.0f%%", app, acc)), hjust = 1, size = TXT,
            family = "inter", fontface = "bold", colour = ink) +
  annotate("text", x = sh$app[nrow(sh)], y = nrow(sh) - 0.38, label = "applicants", size = 3.6, family = "inter", colour = "grey35") +
  annotate("text", x = sh$acc[nrow(sh)], y = nrow(sh) - 0.38, label = "accepted", size = 3.6, family = "inter", colour = ft_red, fontface = "bold") +
  scale_x_continuous(labels = function(x) paste0(x, "%"), limits = c(0, 70), expand = expansion(mult = 0.02)) +
  scale_y_continuous(limits = c(0.5, nrow(sh) + 0.75), breaks = NULL) +
  lab_("Share of all applicants and of all acceptances, selected groups, 2025 (%)",
       paste("Hollow: share of applicants. Red: share of acceptances. Groups overlap and are not adjusted for each other.", SRC)) +
  theme_mobile() + theme(panel.grid.major.y = element_blank())
save_m(p13, "13_applicants_vs_accepted_2025.png", h = 2.6 + 0.78 * nrow(sh))

# For the findings file
ctx_out <- merge(c25[, c("q", "yes_acc", "yes_app", "no_acc", "no_app", "gap", "lo", "hi", "sig")],
                 setNames(c2324[, c("q", "gap")], c("q", "gap_2023_24")), by = "q")
write.csv(within(ctx_out, { gap <- round(gap, 2); lo <- round(lo, 2); hi <- round(hi, 2); gap_2023_24 <- round(gap_2023_24, 2) }),
          "posts/next/tables/contextual_2025.csv", row.names = FALSE)
cat("Charts written to", CH, "\n")
