# 04_master_forest_2025.R: the master ("full") forest, 2025 against 2021-24.
# Run from the project root:  source("posts/next/code/04_master_forest_2025.R")
#
# Method, as published in "Clinical psychology's devil is in its detail" (May 2026),
# recovered from posts/2026-05-28 devil in the detail/code/MaterForest.R and the
# published chart:
#   - Characteristics: age, ethnicity, gender, socio-economic, sexual orientation,
#     religion, marital status, dependants, resident. Disability excluded.
#   - Coherent categories only: no "Total", "Prefer not", "not specified",
#     "not applicable", no comma-merged rows except "Divorced/Separated, Widowed"
#     (a single source category, reported as provided).
#   - Suppressed cells dropped as whole rows (never zero).
#   - Membership: groups with at least 300 applicants pooled over 2021-24.
#   - Reference: the largest group of each characteristic; socio-economic uses
#     Quintiles 2 and 3 combined.
#   - One Benjamini-Hochberg correction across every group (pooled family).
# 2025: the same members, references and family size m (frozen, RULES.md 8a), so
# the 2025 verdicts are directly comparable. Groups with no 2025 data stay in m.

source("R/dclinpsy_style.R")
source("pipeline/02_stats_functions.R")
suppressPackageStartupMessages(library(ggplot2))

m <- read.csv("data/equalopps_merged.csv", stringsAsFactors = FALSE)
SECTIONS <- c("AGE", "ETHNICITY", "GENDER", "SOCIO-ECONOMIC BACKGROUND", "SEXUAL ORIENTATION",
              "RELIGION", "MARITAL STATUS", "DEPENDANTS", "RESIDENT")
DEI <- 2021:2024; N_MIN <- 300
coherent <- function(cat) !grepl("Total|Prefer not|not specified|not applicable", cat, ignore.case = TRUE) &
  (!grepl(",", cat) | cat == "Divorced/Separated, Widowed")

pool <- function(sec, years) {
  d <- m[m$Section == sec & m$Year %in% years & !is.na(m$accepted_n) & coherent(m$Category), ]
  if (!nrow(d)) return(data.frame(Category = character(), acc = numeric(), n = numeric()))
  a <- aggregate(cbind(acc = accepted_n, n = applicants_n) ~ Category, d, sum)
  a
}

# ---- membership and references from 2021-24 --------------------------------------
fam <- do.call(rbind, lapply(SECTIONS, function(sec) {
  d <- pool(sec, DEI); d <- d[d$n >= N_MIN, ]
  if (nrow(d) < 2) return(NULL)
  ref <- if (sec == "SOCIO-ECONOMIC BACKGROUND") c("Quintile 2", "Quintile 3") else d$Category[which.max(d$n)]
  data.frame(Section = sec, Category = setdiff(d$Category, ref), ref = paste(ref, collapse = " + "))
}))

gaps <- function(years) {
  out <- lapply(seq_len(nrow(fam)), function(i) {
    d <- pool(fam$Section[i], years); refs <- strsplit(fam$ref[i], " \\+ ")[[1]]
    g <- d[d$Category == fam$Category[i], ]; r <- d[d$Category %in% refs, ]
    ok <- nrow(g) == 1 && nrow(r) == length(refs)
    ga <- if (ok) g$acc else NA; gn <- if (ok) g$n else NA; ra <- sum(r$acc); rn <- sum(r$n)
    data.frame(Section = fam$Section[i], Category = fam$Category[i], ref = fam$ref[i],
               acc = ga, n = gn, ref_acc = ra, ref_n = rn,
               gap = if (ok) 100 * (ga / gn - ra / rn) else NA,
               p_raw = if (ok) raw_p_2x2(ga, gn, ra, rn) else NA)
  })
  d <- do.call(rbind, out)
  # Frozen membership; as in pipeline/02_stats_functions.R bh_widen(), a member with
  # no reportable data in the period has no test and is left out of m.
  ok <- !is.na(d$p_raw)
  d$p_bh <- NA; d$p_bh[ok] <- p.adjust(d$p_raw[ok], "BH")
  d$sig <- !is.na(d$p_bh) & d$p_bh < 0.05
  d$m <- sum(ok)
  d
}
dei <- gaps(DEI); y25 <- gaps(2025)

relabel <- function(cat) {
  x <- cat
  x[grepl("Quintile 5", x)] <- "Most advantaged areas (Q5)"
  x[grepl("Quintile 4", x)] <- "Q4 areas"
  x[grepl("Quintile 1", x)] <- "Least advantaged areas (Q1)"
  x[grepl("^Christian - Roman Catholic$", x)] <- "Roman Catholic"
  x[grepl("^Christian - Other$", x)] <- "Christian (other)"
  x[grepl("^Christian - Protestant$", x)] <- "Protestant"
  x <- ifelse(grepl("^[0-9]+-[0-9]+ years$", x), paste0("Aged ", sub(" years", "", x)), x)
  x[x == "Other EU/EEA"] <- "EU/EEA resident"
  x[grepl("Divorced", x)] <- "Divorced/widowed"
  x[x == "Other White background"] <- "Other White"
  x[x == "Married/civil partnership/co-habiting"] <- "Married/co-habiting"
  x[x == "Other sexual orientation"] <- "Other orientation"
  x
}

# ---- check: reproduce the published chart (22 significant groups, 2021-24) ----------
published <- c("Gay woman/lesbian", "Bisexual", "Most advantaged areas (Q5)", "Roman Catholic",
  "Least advantaged areas (Q1)", "Christian (other)", "Male", "Irish", "British Welsh", "Aged 30-34",
  "British Scottish", "African", "Other White", "Muslim", "Pakistani", "Aged 20-24", "Aged 35-39",
  "Has dependants", "EU/EEA resident", "Divorced/widowed", "Aged 45-49", "Aged 40-44")
got <- relabel(dei$Category[dei$sig])
ok <- setequal(got, published)
cat(sprintf("CHECK (2021-24 significant groups match the published master forest): %s  [m = %d, significant %d]\n",
            ok, dei$m[1], sum(dei$sig)))
if (!ok) { cat("  only in rebuild:", setdiff(got, published), "\n  only in published:", setdiff(published, got), "\n") }
options(width = 200)
print(transform(dei[order(-dei$gap), c("Section", "Category", "n", "gap", "p_bh", "sig")], gap = round(gap, 1), p_bh = signif(p_bh, 2)), row.names = FALSE)
if (!ok) stop("Master forest rebuild does not match the published chart.")

# ---- 2025 chart: all 31 members, mobile first ------------------------------------------
d <- y25
d$label <- relabel(d$Category)
d$cmp <- dei$gap[match(d$Category, dei$Category)]
d$col <- ifelse(!d$sig, "ns", ifelse(d$gap > 0, "above", "below"))
d$val <- ifelse(is.na(d$gap), "no 2025 data", sprintf("%+.1f", d$gap))
d <- d[order(is.na(d$gap), -d$gap), ]          # largest gap at top, no-data rows at the bottom
d$y <- rev(seq_len(nrow(d)))
d$label <- paste0(d$label, ifelse(!is.na(d$n) & d$n < 100, "*", ""))
CH <- "posts/next/charts"
ink <- "grey20"; muted <- "grey40"; ft_grey_faded <- "#BCB3A4"
xr <- range(c(d$gap, d$cmp, 0), na.rm = TRUE)
ys <- d[!is.na(d$gap), ]
p <- ggplot(d, aes(y = y)) +
  geom_vline(xintercept = 0, colour = "grey45", linetype = "dashed", linewidth = 0.6) +
  geom_segment(data = ys, aes(x = 0, xend = gap, yend = y,
               colour = c(above = ft_red, below = ft_blue, ns = ft_grey_faded)[col]), linewidth = 0.9) +
  geom_point(data = d[!is.na(d$cmp), ], aes(x = cmp), shape = 124, size = 5.2, colour = ink) +
  geom_point(data = ys[ys$col != "ns", ], aes(x = gap, colour = c(above = ft_red, below = ft_blue)[col]), size = 3.8) +
  geom_point(data = ys[ys$col == "ns", ], aes(x = gap), shape = 21, fill = ft_bg, colour = "grey50", stroke = 1.1, size = 3.4) +
  geom_text(aes(x = xr[2] + diff(xr) * 0.27, label = val, colour = ifelse(col == "ns" | is.na(gap), muted, ink),
                fontface = ifelse(col == "ns" | is.na(gap), "plain", "bold")),
            hjust = 1, size = 3.7, family = "inter") +
  scale_colour_identity() +
  scale_y_continuous(breaks = d$y, labels = d$label, expand = expansion(add = 0.7)) +
  scale_x_continuous(breaks = seq(-25, 15, 5), labels = function(x) paste0(ifelse(x > 0, "+", ""), x),
                     limits = c(xr[1] - diff(xr) * 0.03, xr[2] + diff(xr) * 0.28)) +
  labs(title = "Acceptance-rate gap from each group's\nreference group, 2025\n(percentage points)",
       caption = paste(strwrap(paste(
         "Each group vs the largest group of its characteristic (socio-economic: Q2 and Q3 combined). Dot: 2025. Dark tick: 2021–24.",
         "Red: above its reference; blue: below; grey: no clear difference, after one Benjamini-Hochberg correction across all",
         sprintf("%d groups with 2025 data (the %d groups with 300+ applicants in 2021–24, as in the published chart).", d$m[1], nrow(d)),
         "* fewer than 100 applicants in 2025. Disability not included. Divorced/widowed is one combined source category;",
         "its 2025 acceptances are not reportable. Significance depends on how many groups share the correction,",
         "so a group can differ here and not in its own characteristic's chart (Pakistani in 2025).",
         "Source: DClinPsy Clearing House."), 68), collapse = "\n"),
       x = NULL, y = NULL) +
  theme_dclinpsy(base_size = 15) +
  theme(plot.title = element_text(face = "bold", size = 19, lineheight = 1.1, margin = margin(b = 16)),
        plot.caption = element_text(size = 11, colour = "grey40", lineheight = 1.2, hjust = 0, margin = margin(t = 14)),
        axis.text.y = element_text(size = 12, colour = ink), axis.text.x = element_text(size = 12, colour = "grey30"),
        panel.grid.major.y = element_blank(), plot.margin = margin(18, 18, 14, 12))
save_chart(p, file.path(CH, "14_master_forest_2025.png"), w = 5.5, h = 2.4 + 0.34 * nrow(d))

# summary for the findings file
s <- merge(dei[, c("Category", "gap", "sig")], y25[, c("Category", "n", "gap", "sig")], by = "Category", suffixes = c("_dei", "_2025"))
s$label <- relabel(s$Category)
cat("\nStill significant in 2025:", paste(s$label[s$sig_dei & s$sig_2025], collapse = ", "), "\n")
cat("Significant 2021-24, not in 2025:", paste(s$label[s$sig_dei & !s$sig_2025], collapse = ", "), "\n")
cat("New in 2025:", paste(s$label[!s$sig_dei & s$sig_2025], collapse = ", "), "\n")
write.csv(within(s, { gap_dei <- round(gap_dei, 2); gap_2025 <- round(gap_2025, 2) }),
          "posts/next/tables/master_forest_2025.csv", row.names = FALSE)
