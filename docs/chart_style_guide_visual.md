# Chart style guide: visual house style

*Hand this to Claude at the start of any chart-building conversation. It is the
reusable visual house style and travels to any dataset.*

---

## 1. Visual identity

- Background: `#EADDCA` (warm beige): set on BOTH `plot.background` and `panel.background`.
- FT red `#990F3D`: bars, "above reference" points, significant results.
- Blue `#2D6CA2`: "below reference" points (forest plots).
- `grey60`: "not significant" / "no clear difference".
- `grey20`: near-black accent (overall / total rows).
- Font: Inter (via showtext).
- Hollow "not significant" dots: `shape = 21`, `fill = "#EADDCA"` (the background colour), coloured outline, so they read as hollow.
- Export: PNG at 300 dpi.

## 2. The look (in words)

Clean, minimal, FT / John Burn-Murdoch style: generous whitespace, no chart
junk, no boxed legend where direct labelling will do, inline labels on points
and bars rather than a separate key where possible, gridlines faint and only
where they aid reading (usually major-x only on a horizontal forest plot).

## 3. R theme and helpers (drop-in)

```r
library(ggplot2)
library(showtext)
font_add_google("Inter", "Inter")
showtext_auto()

ft_bg   <- "#EADDCA"
ft_red  <- "#990F3D"
ft_blue <- "#2D6CA2"
ft_grey_faded <- "#BCB3A4"

theme_dclinpsy <- function(base_size = 13) {
  theme_minimal(base_family = "Inter", base_size = base_size) +
  theme(
    plot.background  = element_rect(fill = ft_bg, colour = NA),
    panel.background = element_rect(fill = ft_bg, colour = NA),
    panel.grid.minor = element_blank(),
    plot.title    = element_text(face = "bold", size = base_size * 1.5),
    plot.subtitle = element_text(size = base_size * 1.05, margin = margin(b = 10)),
    plot.caption  = element_text(size = base_size * 0.8, colour = "grey35", hjust = 0),
    axis.title    = element_text(size = base_size * 0.95)
  )
}

save_chart <- function(p, path, w = 9, h = 6) {
  ggsave(path, p, width = w, height = h, dpi = 300, bg = ft_bg)
}
```

## 4. Text conventions on the chart

- Title: a "finding" style headline (states the result, e.g. "Who's ahead, and who's behind"), not a generic descriptor.
- Subtitle: one descriptive sentence saying what the axis is, e.g. acceptance rate vs reference group, in percentage points, plus the time slice. Descriptive, never causal.
- Caption: methods footnote (reference group, what the interval is, n source), left-aligned, grey, small.
- Axis labels: signed where it aids reading (e.g. `+5`, `-10` around a zero line).
- State n (and ideally accepted/total) on or near each row so readers can judge precision.
- No em dashes anywhere: use colons.
- "Percentage points" abbreviated "pp".
