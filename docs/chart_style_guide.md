# DClinPsy / blog — chart style guide

*Hand this to Claude at the start of any chart-building conversation (paste it
or upload the file). It captures the visual house style, the labelling
conventions, and the analysis rules that every chart must follow.*

---

## 1. Visual identity

- **Background:** `#EADDCA` (warm beige) — set on BOTH `plot.background` and `panel.background`.
- **FT red `#990F3D`** — bars, "above reference" points, significant results.
- **Blue `#2D6CA2`** — "below reference" points (forest plots).
- **`grey60`** — "not significant" / "no clear difference".
- **`grey20`** — near-black accent (overall / total rows).
- **Font:** Inter (via showtext).
- **Hollow "not significant" dots:** `shape = 21`, `fill = "#EADDCA"` (the background), coloured outline — so they read as hollow.
- **Export:** PNG at 300 dpi.

## 2. R toolkit (reproduce exactly)

```r
library(ggplot2); library(showtext)
font_add_google("Inter", "inter"); showtext_auto(); showtext_opts(dpi = 300)

ft_bg <- "#EADDCA"; ft_red <- "#990F3D"; ft_blue <- "#2D6CA2"
ft_grey <- "grey60"; ft_ink <- "grey20"

theme_dclinpsy <- function(base_size = 13) {
  theme_minimal(base_size = base_size) +
    theme(
      text = element_text(family = "inter"),
      plot.title.position = "plot", plot.caption.position = "plot",
      plot.title    = element_text(face = "bold", size = 15, hjust = 0,
                                   lineheight = 1.2, margin = margin(b = 6)),
      plot.subtitle = element_text(colour = "grey30", size = 10, hjust = 0,
                                   lineheight = 1.3, margin = margin(b = 16)),
      plot.caption  = element_text(colour = "grey45", size = 9, hjust = 0,
                                   margin = margin(t = 12)),
      plot.background  = element_rect(fill = ft_bg, colour = NA),
      panel.background = element_rect(fill = ft_bg, colour = NA),
      panel.grid.minor = element_blank(),
      panel.grid.major = element_line(colour = "grey80", linewidth = 0.3),
      axis.text = element_text(colour = "grey30", size = 10),
      axis.title = element_text(colour = "grey30", size = 10),
      legend.position = "none", plot.margin = margin(20, 20, 15, 20)
    )
}
# Grid direction is per chart: vertical bars -> + theme(panel.grid.major.x = element_blank())
#                              horizontal forest -> + theme(panel.grid.major.y = element_blank())

save_chart <- function(plot, path, w = 9, h = 6, dpi = 300)
  ggsave(path, plot, width = w, height = h, dpi = dpi, bg = ft_bg)

# Wilson 95% CI for ONE proportion (z adjustable to widen to a BH critical level)
wilson_ci <- function(x, n, z = 1.959964) {
  p <- x/n; den <- 1 + z^2/n
  c(lo = (p + z^2/(2*n))/den - z*sqrt(p*(1-p)/n + z^2/(4*n^2))/den,
    hi = (p + z^2/(2*n))/den + z*sqrt(p*(1-p)/n + z^2/(4*n^2))/den)
}
# Newcombe 95% CI for the DIFFERENCE of two proportions
# (note the unname() — without it the result names mangle to "lo.lo"/"hi.hi")
newcombe_ci <- function(a1, n1, a2, n2, z = 1.959964) {
  p1 <- a1/n1; p2 <- a2/n2; dd <- p1 - p2
  l1 <- wilson_ci(a1, n1, z); l2 <- wilson_ci(a2, n2, z)
  c(lo = unname(dd - sqrt((p1 - l1["lo"])^2 + (l2["hi"] - p2)^2)),
    hi = unname(dd + sqrt((l1["hi"] - p1)^2 + (p2 - l2["lo"])^2)))
}
```

## 3. Text conventions

- **Title:** an assertive sentence stating the finding (e.g. *"Class still shapes who gets a clinical psychology place"*). Descriptive, never causal.
- **Subtitle:** lead with the hard number, then explain the encoding/colours — it grounds the editorial headline in a figure.
- **Caption:** source line + method note + the relevant caveat. Standard source line: `Source: DClinPsy Clearing House, DEI era 2021–25`. Method note names the CI type and BH correction. Caveat where relevant: *"not adjusted for confounding between characteristics."*
- **Units:** percentage points (pp), labelled as such — never rate ratios.
- Say **"DEI"**, never "EDI".

## 4. Data

- Object `equalopps`. Columns: `Year, Section, Category, applicants_n, applicants_pct, accepted_n, accepted_pct` (`accepted_n` is `NA` when the cell was suppressed at source).
- Sections: AGE, ETHNICITY, GENDER, SOCIO-ECONOMIC BACKGROUND, SEXUAL ORIENTATION, RELIGION, MARITAL STATUS, DEPENDANTS, RESIDENT, DISABILITY, TOTALS.

## 5. Analysis rules that govern every chart (non-negotiable)

- **Marginal data** — one characteristic at a time; no confounding adjustment is possible. Every cross-characteristic caveat flows from this.
- **DEI era = 2021–2025** (2025 added 22 Nov 2026, RULES.md C5; the earlier posts used 2021–2024). Pre-DEI = 2015–2019. **2020 is dropped** (transition year).
- **Suppressed cells:** when `accepted_n` is `NA`, **drop the whole row** before summing — `filter(!is.na(accepted_n), !is.na(applicants_n))`, then `group_by` + `summarise(sum())`. **Never** use per-column `na.rm = TRUE`; it sums applicants over all years but accepted only over non-NA years, biasing every rate.
- **Effect measure:** percentage points. **CIs:** Wilson (single proportion), Newcombe (difference between two).
- **Multiple comparisons:** Benjamini-Hochberg across any family of tests; on charts, widen plotted CIs to the BH critical level (α* = 0.05 × k/m for significant comparisons, k = number significant; 0.05 × rank/m for the rest; RULES.md C9) so "the interval clears zero" = "BH-significant". Single pre-specified tests (the per-characteristic omnibus chi-square, the one sex comparison) get **no** correction.
- **Inclusion thresholds:** individual characteristic charts ≥ 100 applicants; the master forest ≥ 300.
- **Coherence:** exclude non-responses ("Prefer not to say"), roll-up totals ("Total in the White group"), comma-merged residuals, and "not specified". Filter: drop `Category` matching `Total|Prefer not|not specified|not applicable` (case-insensitive) OR containing a comma.
- **Reference group:** each characteristic compares to its **largest** group. One exception — **SES uses the middle quintiles (Q2–Q3)**, because it's an ordered gradient where the centre is the natural anchor.
- **Causation boundary — DESCRIBE, DON'T EXPLAIN.** These are **disparities**, not **discrimination**; never use the word "discrimination" for a result. Charts rank associations, not causes. The only licensed causal statement is the E-value bound for age vs dependants.
