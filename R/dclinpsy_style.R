# dclinpsy_style.R — house style for DClinPsy / blog charts
# Source at the top of any chart:  source("R/dclinpsy_style.R")  (run from the project root)
# then add  + theme_dclinpsy()  to the plot and save with  save_chart(p, "path.png", w, h)

library(ggplot2)
library(showtext)

# ---- PALETTE (change colours here, once) ----
ft_bg   <- "#EADDCA"   # background — warm beige (was #FFF1E5)
ft_red  <- "#990F3D"   # bars / "above reference" / significant
ft_blue <- "#2D6CA2"   # "below reference" (forests)
ft_grey <- "grey60"    # not significant / no clear difference
ft_ink  <- "grey20"    # near-black accent (overall/total rows)
# Hollow dots: geom_point(shape = 21, fill = ft_bg, colour = ft_red, stroke = 1)

# ---- FONT ----
font_add_google("Inter", "inter"); showtext_auto(); showtext_opts(dpi = 300)
# OFFLINE fallback: comment the line above and use local files —
# font_add("inter",
#   regular = "R/fonts/Inter_18pt-Regular.ttf",
#   bold    = "R/fonts/Inter_18pt-Bold.ttf")

# ---- THEME ----
theme_dclinpsy <- function(base_size = 13) {
  theme_minimal(base_size = base_size) +
    theme(
      text                  = element_text(family = "inter"),
      plot.title.position   = "plot",
      plot.caption.position = "plot",
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
      axis.text  = element_text(colour = "grey30", size = 10),
      axis.title = element_text(colour = "grey30", size = 10),
      legend.position = "none",
      plot.margin = margin(20, 20, 15, 20)
    )
}
# Set grid direction per chart AFTER the theme:
#   vertical bars     -> + theme(panel.grid.major.x = element_blank())
#   horizontal forest -> + theme(panel.grid.major.y = element_blank())

# ---- SAVE HELPER (locks in background + dpi) ----
save_chart <- function(plot, path, w = 9, h = 6, dpi = 300) {
  ggsave(path, plot, width = w, height = h, dpi = dpi, bg = ft_bg)
  message("Saved: ", path)
}

# ---- STATS HELPERS ----
wilson_ci <- function(x, n, z = 1.959964) {
  p <- x / n; den <- 1 + z^2 / n
  c(lo = (p + z^2/(2*n))/den - z*sqrt(p*(1-p)/n + z^2/(4*n^2))/den,
    hi = (p + z^2/(2*n))/den + z*sqrt(p*(1-p)/n + z^2/(4*n^2))/den)
}
newcombe_ci <- function(a1, n1, a2, n2, z = 1.959964) {
  p1 <- a1/n1; p2 <- a2/n2; dd <- p1 - p2
  l1 <- wilson_ci(a1, n1, z); l2 <- wilson_ci(a2, n2, z)
  c(lo = unname(dd - sqrt((p1 - l1["lo"])^2 + (l2["hi"] - p2)^2)),
    hi = unname(dd + sqrt((l1["hi"] - p1)^2 + (p2 - l2["lo"])^2)))
}
message("dclinpsy_style.R loaded.")
