source("C:/Users/RyanR/Downloads/Equal data/dlinpsy_style.R")
library(tidyverse)

if (!exists("equalopps")) {
  bk <- "C:/Users/RyanR/Downloads/Equal data/equalopps_backup.rds"
  if (file.exists(bk)) equalopps <- readRDS(bk) else stop("equalopps + backup both missing")
}
out_dir <- "C:/Users/RyanR/Downloads/Equal data/regenerated"; dir.create(out_dir, showWarnings = FALSE)

# Age gap (under 40 vs 40+), full decade — same basis as the original E-value (RR 2.47)
age <- equalopps %>%
  filter(Section == "AGE", Year %in% 2015:2024,
         !is.na(accepted_n), !is.na(applicants_n), grepl("^[0-9]", Category)) %>%
  mutate(lower = as.integer(sub("^([0-9]+).*", "\\1", Category)),
         grp = ifelse(lower < 40, "Under 40", "40 and over")) %>%
  group_by(grp) %>% summarise(acc = sum(accepted_n), n = sum(applicants_n), .groups = "drop")

r_u <- with(age, acc[grp == "Under 40"] / n[grp == "Under 40"])
r_o <- with(age, acc[grp == "40 and over"] / n[grp == "40 and over"])
gap <- 100 * (r_u - r_o)
max_frac <- 0.173                 # most generous sensitivity scenario (ONS-based) -> upper bound
dep_max  <- gap * max_frac

cat(sprintf("\nUnder 40: %.1f%% | 40+: %.1f%% | age gap: %.1f pp\n", 100*r_u, 100*r_o, gap))
cat(sprintf("Most dependants could explain (<=%.0f%%): %.1f pp; remaining: %.1f pp\n",
            100*max_frac, dep_max, gap - dep_max))

bars <- tibble(label = c("The age gap\n(under-40 vs over-40)", "Most that dependants\ncould explain"),
               value = c(gap, dep_max), type = c("gap", "dep")) %>%
  mutate(label = factor(label, levels = rev(label)))

p <- ggplot(bars, aes(value, label, fill = type)) +
  geom_col(width = 0.62) +
  geom_text(aes(label = sprintf("%.1f pp", value)), hjust = -0.15,
            family = "inter", fontface = "bold", size = 5, colour = "grey15") +
  scale_fill_manual(values = c(gap = ft_red, dep = "grey65"), guide = "none") +
  scale_x_continuous(limits = c(0, gap * 1.18), expand = expansion(mult = c(0, 0.02)),
                     labels = function(x) paste0(x, " pp")) +
  labs(title = "The age gap cannot be just about dependants",
       subtitle = str_wrap(sprintf("Applicants under 40 are accepted about %.0f pp more often than those over 40. Even under the most generous assumptions about who has dependants, dependants could account for at most about %.0f of those points \u2014 so the gap isn't really about them.", gap, dep_max), 95),
       caption = str_wrap("The 'most dependants could explain' bar is the upper bound from a sensitivity analysis using ONS dependant-prevalence assumptions (most generous scenario). Source: DClinPsy Clearing House, 2015-24.", 100),
       x = NULL, y = NULL) +
  theme_dclinpsy() + theme(panel.grid.major.y = element_blank())

save_chart(p, file.path(out_dir, "age_evalue_pp.png"), w = 9, h = 5)

# --- auto-save this script next to its chart ---
try({ if (rstudioapi::isAvailable())
  writeLines(rstudioapi::getSourceEditorContext()$contents,
             file.path(out_dir, "age_evalue_pp.R")) }, silent = TRUE)
