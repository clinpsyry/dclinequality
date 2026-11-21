source("C:/Users/RyanR/Downloads/Equal data/dlinpsy_style.R")
library(tidyverse)

if (!exists("equalopps")) {
  bk <- "C:/Users/RyanR/Downloads/Equal data/equalopps_backup.rds"
  if (file.exists(bk)) equalopps <- readRDS(bk) else stop("equalopps + backup both missing")
}
out_dir <- "C:/Users/RyanR/Downloads/Equal data/regenerated"
dir.create(out_dir, showWarnings = FALSE)

YEARS <- 2021:2024; N_MIN <- 300

relabel <- function(cat) {
  cat <- as.character(cat)
  case_when(
    grepl("Quintile 5", cat) ~ "Wealthiest areas (Q5)",
    grepl("Quintile 4", cat) ~ "Q4 areas",
    grepl("Quintile 1", cat) ~ "Poorest areas (Q1)",
    grepl("Roman Catholic", cat) ~ "Roman Catholic",
    grepl("Christian.*Other|Christian \\(other\\)", cat, ignore.case = TRUE) ~ "Christian (other)",
    grepl("[0-9]+-[0-9]+ years", cat) ~ paste0("Aged ", sub(" years", "", cat)),
    grepl("Other EU|EU/EEA", cat) ~ "EU/EEA resident",
    grepl("Divorced", cat) ~ "Divorced/widowed",
    grepl("Other White", cat) ~ "Other White",
    grepl("Other Asian", cat) ~ "Other Asian",
    TRUE ~ cat
  )
}

is_incoherent <- function(cat)
  grepl("Total|Prefer not|not specified|not applicable", cat, ignore.case = TRUE) | grepl(",", cat)

SECTIONS <- c("AGE","ETHNICITY","GENDER","SOCIO-ECONOMIC BACKGROUND",
              "SEXUAL ORIENTATION","RELIGION","MARITAL STATUS","DEPENDANTS","RESIDENT")

agg_section <- function(sec) {
  equalopps %>%
    filter(Section == sec, Year %in% YEARS,
           !is.na(accepted_n), !is.na(applicants_n), !is_incoherent(Category)) %>%
    group_by(Category) %>% summarise(acc = sum(accepted_n), n = sum(applicants_n), .groups = "drop") %>%
    filter(n >= N_MIN)
}

rows <- list()
for (sec in SECTIONS) {
  d <- agg_section(sec); if (nrow(d) < 2) next
  if (sec == "SOCIO-ECONOMIC BACKGROUND") {
    midx <- grepl("Quintile 2|Quintile 3", d$Category)
    if (any(midx)) { ref_acc <- sum(d$acc[midx]); ref_n <- sum(d$n[midx]); d <- d[!midx, ] }
    else { i <- which.max(d$n); ref_acc <- d$acc[i]; ref_n <- d$n[i]; d <- d[-i, ] }
  } else { i <- which.max(d$n); ref_acc <- d$acc[i]; ref_n <- d$n[i]; d <- d[-i, ] }
  r_rate <- ref_acc / ref_n
  for (j in seq_len(nrow(d))) {
    a <- d$acc[j]; n <- d$n[j]
    m  <- matrix(c(a, n - a, ref_acc, ref_n - ref_acc), 2, byrow = TRUE)
    pv <- suppressWarnings(chisq.test(m, correct = FALSE)$p.value)
    rows[[length(rows)+1]] <- tibble(Section = sec, Category = d$Category[j],
                                     n = n, gap = 100*(a/n - r_rate), p_raw = pv)
  }
}
tab <- bind_rows(rows) %>% mutate(p_bh = p.adjust(p_raw, "BH"), sig = p_bh < 0.05)

cat("\n===== MASTER FOREST (DEI era, n >=", N_MIN, ") — check vs your original =====\n")
tab %>% arrange(desc(gap)) %>%
  transmute(Section, label = relabel(Category), gap = sprintf("%+.1f", gap),
            p_bh = ifelse(p_bh < .001, "<.001", sprintf("%.3f", p_bh)), shown = ifelse(sig, "*", "")) %>%
  as.data.frame() %>% print(row.names = FALSE)
cat("\n* = significant after BH, so plotted. DISABILITY excluded by design (no 'Mental health' row).\n\n")

plotdat <- tab %>% filter(sig) %>%
  mutate(dir = ifelse(gap >= 0, "above", "below"),
         lab = relabel(Category), lab = fct_reorder(lab, gap))

p <- ggplot(plotdat, aes(gap, lab, colour = dir)) +
  geom_vline(xintercept = 0, linewidth = 0.9, colour = "grey35", linetype = "dashed") +
  geom_segment(aes(x = 0, xend = gap, yend = lab), linewidth = 0.6) +
  geom_point(size = 3.6) +
  scale_colour_manual(values = c(above = ft_red, below = ft_blue),
                      labels = c(above = "Above its reference group", below = "Below its reference group"),
                      name = NULL) +
  scale_x_continuous(breaks = seq(-15, 5, 5), labels = function(x) paste0(ifelse(x > 0, "+", ""), x, " pp")) +
  labs(title = "Who's ahead, and who's behind",
       subtitle = str_wrap("Each group's acceptance rate minus its own reference group's, in percentage points, 2021-24. Compared within each characteristic (e.g. ethnic groups vs British English, ages vs 25-29). Only differences significant after Benjamini-Hochberg correction are shown.", 95),
       caption = str_wrap("Source: DClinPsy Clearing House, DEI era 2021-24. Groups under 300 applicants and 'prefer not to say' excluded.", 110),
       x = "Percentage points from the reference group's acceptance rate", y = NULL) +
  theme_dclinpsy() + theme(legend.position = "top", panel.grid.major.y = element_blank())

save_chart(p, file.path(out_dir, "master_forest_within.png"), w = 9, h = 9.5)