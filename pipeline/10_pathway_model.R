# 10_pathway_model.R: the "chances by try" pathway model (RULES.md C10).
#
# Run from the project root:  Rscript pipeline/10_pathway_model.R
#
# Data
#   - BPS Alternative Handbook 2023 edition, "How many times did you apply ...
#     (including the year you were successful)?", 30 course PDFs
#     (data/raw/bps_alternative_handbook/times_applied_2023_edition.csv).
#     Hull is excluded (reports 100% "once": a data error). "I don't know" dropped.
#   - Clearing House acceptance rate for the entry years those trainees cover,
#     2019 to 2021 pooled (data/equalopps_merged.csv, TOTALS rows).
#
# Models (only C is pre-specified; M0, M1, M3 are reference or exploratory)
#   M0  fresh try, nobody stops:           h_k = p,              c = 1
#   M1  fresh try, some stop:              h_k = p,              c free
#   C   people differ, some stop (PRIMARY): p ~ Beta(a, b),      c free
#   M3  chance changes with each try:      logit h_k = al + be(k-1), c free  (exploratory)
#   h_k = chance of a place on try k; c = chance of applying again after a miss.
#
# Steady state: one cohort of new applicants, followed until they get in or stop.
#   applications = sum_k S_k, places = sum_k S_k h_k, S_k = still applying at try k.
#   Clearing House rate = places / applications. BPS shares = S_k h_k / places.
#
# Pass test (C10): chi-square p > 0.05 on the BPS shares AND every parameter's
# 95% profile interval bounded inside the parameter space.
# House style: no em dashes, colons; "pp".

suppressPackageStartupMessages(library(stats))
set.seed(20261122)
KMAX <- 60            # tries followed (the 6+ cell sums tries 6 to KMAX)
OUT  <- "posts/next/tables"

# ---- Data -------------------------------------------------------------------
bps <- read.csv("data/raw/bps_alternative_handbook/times_applied_2023_edition.csv",
                check.names = FALSE)
bps <- bps[bps$course != "Hull", ]
pc  <- c("pct_once", "pct_twice", "pct_3", "pct_4", "pct_5", "pct_6plus")
n_bps <- sapply(pc, function(v) sum(round(bps[[v]] * bps$responses / 100)))
names(n_bps) <- c("1", "2", "3", "4", "5", "6+")

ch <- read.csv("data/equalopps_merged.csv")
ch <- ch[ch$Section == "TOTALS" & ch$Year %in% 2019:2021, ]
A <- sum(ch$accepted_n); N <- sum(ch$applicants_n)

cat("BPS counts (n =", sum(n_bps), "):", n_bps, "\n")
cat(sprintf("Clearing House 2019 to 2021: %d of %d = %.2f%%\n\n", A, N, 100 * A / N))

# ---- Model machinery -----------------------------------------------------------
# Each model returns per-try success mass s_k and application mass q_k (k = 1..KMAX).
mass_hazard <- function(h, c) {
  S <- numeric(KMAX); S[1] <- 1
  for (k in 2:KMAX) S[k] <- S[k - 1] * (1 - h[k - 1]) * c
  list(s = S * h, q = S)
}
mass_beta <- function(a, b, c) {
  k <- 1:KMAX
  lB <- lbeta(a, b)
  list(s = c^(k - 1) * exp(lbeta(a + 1, b + k - 1) - lB),
       q = c^(k - 1) * exp(lbeta(a, b + k - 1) - lB))
}

models <- list(
  M0 = list(np = 1, start = c(qlogis(0.2)),
            mass = function(t) mass_hazard(rep(plogis(t[1]), KMAX), 1),
            names = "logit p"),
  M1 = list(np = 2, start = c(qlogis(0.2), qlogis(0.7)),
            mass = function(t) mass_hazard(rep(plogis(t[1]), KMAX), plogis(t[2])),
            names = c("logit p", "logit c")),
  C  = list(np = 3, start = c(log(2), log(6), qlogis(0.7)),
            mass = function(t) mass_beta(exp(t[1]), exp(t[2]), plogis(t[3])),
            names = c("log a", "log b", "logit c")),
  M3 = list(np = 3, start = c(qlogis(0.2), 0, qlogis(0.7)),
            mass = function(t) mass_hazard(plogis(t[1] + t[2] * (0:(KMAX - 1))), plogis(t[3])),
            names = c("logit h1", "slope", "logit c"))
)

shares <- function(m) { f <- m$s / sum(m$s); c(f[1:5], sum(f[6:KMAX])) }
rate   <- function(m) sum(m$s) / sum(m$q)

loglik <- function(t, mod, nb = n_bps, a = A, n = N) {
  m <- mod$mass(t)
  f <- shares(m); r <- rate(m)
  if (any(!is.finite(f)) || any(f <= 0) || !is.finite(r) || r <= 0 || r >= 1) return(-1e12)
  sum(nb * log(f)) + a * log(r) + (n - a) * log(1 - r)
}
fit <- function(mod, nb = n_bps, a = A, n = N, start = mod$start) {
  best <- NULL
  for (j in 1:6) {
    st <- if (j == 1) start else start + rnorm(length(start), 0, 1)
    if (length(st) == 1) {
      if (j > 1) next
      o <- optim(st, function(t) -loglik(t, mod, nb, a, n), method = "Brent", lower = -10, upper = 10)
    } else {
      o <- tryCatch(optim(st, function(t) -loglik(t, mod, nb, a, n), method = "Nelder-Mead",
                          control = list(maxit = 5000, reltol = 1e-12)), error = function(e) NULL)
      if (is.null(o)) next
      o <- optim(o$par, function(t) -loglik(t, mod, nb, a, n), method = "BFGS",
                 control = list(maxit = 1000, reltol = 1e-12))
    }
    if (is.null(best) || o$value < best$value) best <- o
  }
  best
}

# Saturated log-likelihood (data reproduced exactly), for the deviance test.
ll_sat <- sum(n_bps * log(n_bps / sum(n_bps))) + A * log(A / N) + (N - A) * log(1 - A / N)

# ---- Fit every model -------------------------------------------------------------
res <- list()
for (nm in names(models)) {
  mod <- models[[nm]]; o <- fit(mod)
  m <- mod$mass(o$par); f <- shares(m)
  e <- sum(n_bps) * f
  pearson <- sum((n_bps - e)^2 / e)
  dev <- 2 * (ll_sat + o$value)
  df <- 6 - mod$np        # 5 free BPS shares + 1 rate, minus parameters
  res[[nm]] <- list(par = o$par, ll = -o$value, f = f, r = rate(m), pearson = pearson,
                    dev = dev, df = df, p_dev = if (df > 0) pchisq(dev, df, lower.tail = FALSE) else NA,
                    aic = 2 * mod$np + 2 * o$value, ever = sum(m$s))
}

cat("Observed BPS shares:", sprintf("%.1f", 100 * n_bps / sum(n_bps)), "\n")
for (nm in names(res)) {
  r <- res[[nm]]
  cat(sprintf("%-3s fitted shares: %s | rate %.2f%% | deviance %.1f on %d df, p = %s | AIC %.1f\n",
              nm, paste(sprintf("%.1f", 100 * r$f), collapse = " "), 100 * r$r, r$dev, r$df,
              if (is.na(r$p_dev)) "n/a" else format.pval(r$p_dev, digits = 3), r$aic))
}

# ---- Primary model C: pass test ----------------------------------------------------
mC <- models$C; oC <- res$C
cat("\nModel C estimates: a =", round(exp(oC$par[1]), 3), " b =", round(exp(oC$par[2]), 3),
    " c =", round(plogis(oC$par[3]), 3), "\n")

profile_ci <- function(mod, best, i, lo, hi, steps = 61) {
  grid <- seq(lo, hi, length.out = steps)
  pl <- sapply(grid, function(g) {
    sub <- list(np = mod$np - 1, start = best$par[-i],
                mass = function(t) { tt <- append(t, g, after = i - 1); mod$mass(tt) })
    o <- fit(sub, start = best$par[-i]); -o$value
  })
  inside <- grid[2 * (best$ll - pl) <= qchisq(0.95, 1)]
  list(lo = min(inside), hi = max(inside), bounded = min(inside) > lo && max(inside) < hi)
}
ranges <- list(c(-6, 8), c(-6, 10), c(-8, 12))
prof <- lapply(1:3, function(i) profile_ci(mC, oC, i, ranges[[i]][1], ranges[[i]][2]))
for (i in 1:3) cat(sprintf("  profile 95%% for %-8s: %.2f to %.2f  %s\n", mC$names[i],
                           prof[[i]]$lo, prof[[i]]$hi, if (prof[[i]]$bounded) "bounded" else "NOT bounded"))
pass_fit <- !is.na(oC$p_dev) && oC$p_dev > 0.05
pass_id  <- all(sapply(prof, `[[`, "bounded"))
cat(sprintf("\nPASS TEST (C10): fit %s (p = %s), identified %s  ->  %s\n",
            if (pass_fit) "OK" else "FAILS", format.pval(oC$p_dev, digits = 3),
            if (pass_id) "OK" else "FAILS", if (pass_fit && pass_id) "PASS" else "FAIL"))

# ---- Exploratory M3: what the shape says ----------------------------------------
o3 <- res$M3
h3 <- plogis(o3$par[1] + o3$par[2] * 0:5)
cat("\nExploratory M3 (labelled exploratory): chance on try 1..6 =",
    paste(sprintf("%.1f%%", 100 * h3), collapse = ", "),
    sprintf("| reapply after a miss c = %.2f | ever get a place = %.1f%%\n", plogis(o3$par[3]), 100 * o3$ever))

# Accounting check (any model): applications per place vs tries per trainee.
mean_tries <- sum(c(1:5, 6) * n_bps) / sum(n_bps)
cat(sprintf("\nApplications per place (CH 2019 to 2021): %.2f. Tries per trainee (BPS, 6+ as 6): %.2f.\n",
            N / A, mean_tries))
cat(sprintf("Steady state: about %.0f%% of applications come from people who never get a place.\n",
            100 * (1 - mean_tries * A / N)))

# ---- Bootstrap for the reported models (parametric, 1,000 refits) ------------------
boot_model <- function(nm, B = 1000) {
  mod <- models[[nm]]; r <- res[[nm]]
  out <- replicate(B, {
    nb <- as.vector(rmultinom(1, sum(n_bps), r$f)); a <- rbinom(1, N, r$r)
    o <- fit(mod, nb, a, N, start = r$par); m <- mod$mass(o$par)
    c(shares(m)[1], m$s[1] / m$q[1], sum(m$s), rate(m))
  })
  t(apply(out, 1, quantile, c(0.025, 0.975)))
}

summ <- do.call(rbind, lapply(names(res), function(nm) {
  r <- res[[nm]]
  data.frame(model = nm, n_par = models[[nm]]$np, deviance = round(r$dev, 2), df = r$df,
             p_fit = signif(r$p_dev, 3), aic = round(r$aic, 1),
             fit_1 = round(100 * r$f[1], 1), fit_2 = round(100 * r$f[2], 1), fit_3 = round(100 * r$f[3], 1),
             fit_4 = round(100 * r$f[4], 1), fit_5 = round(100 * r$f[5], 1), fit_6plus = round(100 * r$f[6], 1),
             fit_rate = round(100 * r$r, 2), ever_get_place = round(100 * r$ever, 1))
}))
obs <- data.frame(model = "observed", n_par = NA, deviance = NA, df = NA, p_fit = NA, aic = NA,
                  fit_1 = round(100 * n_bps[1] / sum(n_bps), 1), fit_2 = round(100 * n_bps[2] / sum(n_bps), 1),
                  fit_3 = round(100 * n_bps[3] / sum(n_bps), 1), fit_4 = round(100 * n_bps[4] / sum(n_bps), 1),
                  fit_5 = round(100 * n_bps[5] / sum(n_bps), 1), fit_6plus = round(100 * n_bps[6] / sum(n_bps), 1),
                  fit_rate = round(100 * A / N, 2), ever_get_place = NA)
write.csv(rbind(obs, summ), file.path(OUT, "pathway_model_fits.csv"), row.names = FALSE)
cat("\nWrote", file.path(OUT, "pathway_model_fits.csv"), "\n")

if (pass_fit && pass_id) {
  bc <- boot_model("C")
  cat("Model C bootstrap 95%: first-try share", sprintf("%.1f-%.1f%%", 100 * bc[1, 1], 100 * bc[1, 2]),
      "| ever get a place", sprintf("%.1f-%.1f%%\n", 100 * bc[3, 1], 100 * bc[3, 2]))
}
