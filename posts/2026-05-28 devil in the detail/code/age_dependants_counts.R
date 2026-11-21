source("C:/Users/RyanR/Downloads/Equal data/dlinpsy_style.R")
library(tidyverse)

if (!exists("equalopps")) {
  bk <- "C:/Users/RyanR/Downloads/Equal data/equalopps_backup.rds"
  if (file.exists(bk)) equalopps <- readRDS(bk) else stop("equalopps + backup both missing")
}
out_dir <- "C:/Users/RyanR/Downloads/Equal data/regenerated"; dir.create(out_dir, showWarnings = FALSE)

YEARS <- 2015:2024   # full decade, same basis as the original E-value

# --- helper: acceptance rate for a set of categories ---
rate <- function(section, cats, years = YEARS) {
  d <- equalopps %>% filter(Section == section, Category %in% cats, Year %in% years,
                            !is.na(accepted_n), !is.na(applicants_n))
  sum(d$accepted_n) / sum(d$applicants_n)
}

# 1. Age effect (risk ratio, under 40 vs 40+)
age <- equalopps %>%
  filter(Section == "AGE", Year %in% YEARS,
         !is.na(accepted_n), !is.na(applicants_n), grepl("^[0-9]", Category)) %>%
  mutate(lower = as.integer(sub("^([0-9]+).*", "\\1", Category)),
         grp = ifelse(lower < 40, "Under 40", "40 and over")) %>%
  group_by(grp) %>% summarise(acc = sum(accepted_n), n = sum(applicants_n), .groups = "drop")
r_u <- with(age, acc[grp == "Under 40"]   / n[grp == "Under 40"])
r_o <- with(age, acc[grp == "40 and over"] / n[grp == "40 and over"])
age_rr <- r_u / r_o

# 2. Dependants association (risk ratio, no dependants vs has dependants)
dep <- equalopps %>%
  filter(Section == "DEPENDANTS", Year %in% YEARS, !is.na(accepted_n), !is.na(applicants_n),
         !grepl("Prefer not|Total|not specified|not applicable", Category, ignore.case = TRUE)) %>%
  mutate(grp = ifelse(grepl("No dependant", Category, ignore.case = TRUE), "None", "Has")) %>%
  group_by(grp) %>% summarise(acc = sum(accepted_n), n = sum(applicants_n), .groups = "drop")
r_none <- with(dep, acc[grp == "None"] / n[grp == "None"])
r_has  <- with(dep, acc[grp == "Has"]  / n[grp == "Has"])
dep_rr <- r_none / r_has

# 3. E-value (VanderWeele & Ding 2017): for RR >= 1, E = RR + sqrt(RR*(RR-1))
evalue <- function(rr) { if (rr < 1) rr <- 1 / rr; rr + sqrt(rr * (rr - 1)) }
e_age <- evalue(age_rr)

cat(sprintf("\nAge RR (under 40 vs 40+):        %.2f\n", age_rr))
cat(sprintf("E-value (threshold to explain):  %.2f\n", e_age))
cat(sprintf("Dependants RR (none vs has):     %.2f\n", dep_rr))

# 4. Chart: the threshold a confounder must clear, vs the strength dependants actually have
bars <- tibble(
  label = c("What a confounder would need\n(to explain the age gap away)",
            "What dependants actually have"),
  value = c(e_age, dep_rr),
  type  = c("needed", "actual")) %>%
  mutate(label = factor(label, levels = rev(label)))

p <- ggplot(bars, aes(value, label, fill = type)) +
  geom_col(width = 0.6) +
  geom_vline(xintercept = 1, linewidth = 0.6, colour = ft_grey, linetype = "dashed") +
  geom_text(aes(label = sprintf("%.1f\u00d7", value)), hjust = -0.25,
            family = "inter", fontface = "bold", size = 5, colour = "grey15") +
  scale_fill_manual(values = c(needed = ft_red, actual = "grey60"), guide = "none") +
  scale_x_continuous(limits = c(0, e_age * 1.18), expand = expansion(mult = c(0, 0.02))) +
  labs(title = "The age gap cannot be just about dependants",
       subtitle = str_wrap(sprintf("To explain the age gap away, dependants (or any hidden factor) would need to be linked to both age and acceptance about %.1f times over. The actual link between dependants and acceptance is only ab