# =============================================================
# age_era_final_numbers.R   (DEFINITIVE source for the age-era finding)
# 40+ DEFICIT vs under-40, pre-DEI (2015-19) vs DEI (2021-24).
# 2020 excluded. Method, locked:
#   - "40+" = ALL bands aged 40 and over pooled (40-44, 45-49,
#     50-54, 55+, and the merged 50-54/55 rows). The group n is
#     what matters, so sub-threshold bands belong in the pool.
#   - SUPPRESSED cells (accepted = NA) are DROPPED, never counted
#     as zero (house rule: suppressed != zero).
#   - PER-YEAR gaps averaged; t-test across years (pre-specified
#     single test -> NO BH); also prints pooled for reference.
# Prints everything for verification, then is the single source
# both age charts read their numbers from.
# =============================================================
source("C:/Users/RyanR/Downloads/Equal data/dlinpsy_style.R")
library(tidyverse)
if (!exists("equalopps")) {
  bk <- "C:/Users/RyanR/Downloads/Equal data/equalopps_backup.rds"
  if (file.exists(bk)) equalopps <- readRDS(bk)
}
PRE <- 2015:2019; DEI <- 2021:2024

A <- equalopps %>%
  filter(Section == "AGE", !is.na(applicants_n)) %>%
  mutate(fn = as.numeric(str_extract(Category, "\\d+")),
         is_pns = grepl("Prefer not", Category))

# under-40 = bands 20-39 ; 40+ = ALL bands with a starting age >= 40
# (drops Prefer-not-to-say; drops suppressed accepted=NA cells)
classify <- A %>%
  filter(!is_pns, !is.na(fn)) %>%
  mutate(grp = ifelse(fn < 40, "u40", "p40"))

per_year <- classify %>%
  filter(!is.na(accepted_n)) %>%                 # DROP suppressed cells
  group_by(Year, grp) %>%
  summarise(acc = sum(accepted_n), n = sum(applicants_n), .groups = "drop") %>%
  mutate(rate = acc / n) %>%
  select(Year, grp, rate) %>%
  pivot_wider(names_from = grp, values_from = rate) %>%
  mutate(deficit = 100 * (p40 - u40),            # negative = 40+ worse
         era = case_when(Year %in% PRE ~ "Pre-DEI",
                         Year %in% DEI ~ "DEI",
                         TRUE ~ "excl"))

cat("===== per-year 40+ deficit (40+ minus under-40) =====\n")
print(as.data.frame(per_year %>% filter(era != "excl") %>%
                      transmute(Year, era, deficit = round(deficit, 1))))

eras <- per_year %>% filter(era %in% c("Pre-DEI","DEI"))
era_mean <- eras %>% group_by(era) %>%
  summarise(mean = mean(deficit), sd = sd(deficit), k = n(), .groups = "drop") %>%
  mutate(se = sd/sqrt(k), t = qt(.975, k-1), lo = mean - t*se, hi = mean + t*se)

cat("\n===== era means (per-year), 95% t-interval =====\n")
print(as.data.frame(era_mean %>% transmute(era, mean = round(mean,1),
                                           CI = sprintf("[%.1f, %.1f]", lo, hi))))

tt <- t.test(deficit ~ era, data = eras)
cat(sprintf("\nPre-specified single test (NO BH): t-test p = %.3f\n", tt$p.value))

# pooled, for reference
pooled <- classify %>% filter(!is.na(accepted_n),
                              Year %in% c(PRE,DEI)) %>%
  mutate(era = ifelse(Year %in% DEI,"DEI","Pre-DEI")) %>%
  group_by(era, grp) %>% summarise(acc=sum(accepted_n), n=sum(applicants_n), .groups="drop") %>%
  mutate(rate=acc/n) %>% select(era,grp,rate) %>%
  pivot_wider(names_from=grp, values_from=rate) %>% mutate(deficit=100*(p40-u40))
cat("\n===== pooled deficit (reference) =====\n")
print(as.data.frame(pooled %>% transmute(era, deficit = round(deficit,1))))

cat("\nLOCKED METHOD: 40+ = all bands 40+; suppressed cells dropped;\n")
cat("per-year means; pre-specified t-test, no BH.\n")
