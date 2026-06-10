# ============================================================================
# Phase 2a: Statistics functions for the DClinPsy Explorer precompute.
#
# Pure, offline statistics. These are the ONLY place effect sizes, intervals,
# and significance are ever computed (governance rule 2: the browser computes
# nothing). Sourced by the precompute script; run directly to self-test.
#
# Conventions:
#   - wilson_ci() returns a named list(lo, hi).
#   - newcombe_ci() returns an UNNAMED numeric c(lo, hi), indexed by position,
#     as the build plan specifies.
#   - All intervals 95% by default, z = 1.959964 (governance rule 6).
#   - Suppressed counts are NA and must be dropped before any sum by the caller;
#     these functions assume their inputs are already clean integers.
# House style: no em dashes, colons; "pp" for percentage points.
# ============================================================================

Z_95 <- qnorm(1 - 0.05 / 2)   # 1.959964

# ---- Wilson score interval for a single proportion (rule 6) -----------------
# acc accepted, n applicants. Returns rate and named lo/hi on the 0..1 scale.
wilson_ci <- function(acc, n, z = Z_95) {
  if (is.na(acc) || is.na(n) || n == 0) return(list(rate = NA, lo = NA, hi = NA))
  p  <- acc / n
  z2 <- z * z
  denom  <- 1 + z2 / n
  centre <- (p + z2 / (2 * n)) / denom
  half   <- (z * sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom
  list(rate = p, lo = centre - half, hi = centre + half)
}

# ---- Newcombe interval for a difference of two proportions (rule 6) ---------
# Difference is p1 - p2 (group minus reference). Uses each proportion's Wilson
# bounds (Newcombe's method 10). Returns UNNAMED c(lo, hi) on the difference
# scale (0..1 units; multiply by 100 for pp). z may be widened to z_star for
# BH-coincident intervals (rule 6a).
newcombe_ci <- function(acc1, n1, acc2, n2, z = Z_95) {
  if (any(is.na(c(acc1, n1, acc2, n2))) || n1 == 0 || n2 == 0) return(c(NA, NA))
  p1 <- acc1 / n1; p2 <- acc2 / n2
  w1 <- wilson_ci(acc1, n1, z); w2 <- wilson_ci(acc2, n2, z)
  l1 <- w1$lo; u1 <- w1$hi; l2 <- w2$lo; u2 <- w2$hi
  d  <- p1 - p2
  lo <- d - sqrt((p1 - l1)^2 + (u2 - p2)^2)
  hi <- d + sqrt((u1 - p1)^2 + (p2 - l2)^2)
  c(lo, hi)
}

# ---- Raw p-value for a 2x2 (group vs reference): chi-square w/o continuity ---
# Used to rank comparisons for the BH procedure (rule 6a step 1).
raw_p_2x2 <- function(acc1, n1, acc2, n2) {
  if (any(is.na(c(acc1, n1, acc2, n2))) || n1 == 0 || n2 == 0) return(NA)
  m <- matrix(c(acc1, n1 - acc1, acc2, n2 - acc2), nrow = 2, byrow = TRUE)
  if (any(rowSums(m) == 0) || any(colSums(m) == 0)) return(NA)
  suppressWarnings(prop.test(c(acc1, acc2), c(n1, n2), correct = FALSE)$p.value)
}

# ---- BH widening for a family (governance rule 6a) --------------------------
# Given a family's raw p-vector, return per-comparison: p_bh, sig (p_bh<.05),
# z_star, and the verdict-coincidence guarantee is enforced by the caller using
# the returned z_star to build each Newcombe interval. m = family size.
# NA raw-p comparisons (fully suppressed) are excluded from m and get NA out.
bh_widen <- function(p_raw, alpha = 0.05) {
  ok <- !is.na(p_raw)
  m  <- sum(ok)
  out <- data.frame(p_raw = p_raw, p_bh = NA_real_, sig = NA,
                    rank = NA_integer_, alpha_star = NA_real_, z_star = NA_real_)
  if (m == 0) return(out)
  p_ok <- p_raw[ok]
  out$p_bh[ok]  <- p.adjust(p_ok, method = "BH")
  out$sig[ok]   <- out$p_bh[ok] < alpha
  r             <- rank(p_ok, ties.method = "max")
  out$rank[ok]  <- r
  out$alpha_star[ok] <- alpha * r / m
  out$z_star[ok]     <- qnorm(1 - out$alpha_star[ok] / 2)
  attr(out, "m") <- m
  out
}

# ---- Rate ratio with interval (effect-size switch, rule 5) ------------------
# RR = p1 / p2 (group / reference); null = 1. Katz log interval.
rate_ratio_ci <- function(acc1, n1, acc2, n2, z = Z_95) {
  if (any(is.na(c(acc1, n1, acc2, n2))) || n1 == 0 || n2 == 0 ||
      acc1 == 0 || acc2 == 0) return(list(value = NA, lo = NA, hi = NA))
  p1 <- acc1 / n1; p2 <- acc2 / n2
  rr <- p1 / p2
  se <- sqrt((1 - p1) / acc1 + (1 - p2) / acc2)   # SE of log RR
  list(value = rr, lo = exp(log(rr) - z * se), hi = exp(log(rr) + z * se))
}

# ---- Per-year t-interval for an era gap (governance rule 6b, 12) ------------
# Input: a numeric vector of per-year gaps (e.g. one gap per year in an era,
# or per-year differences). Returns mean and 95% t-interval across the years.
t_interval <- function(x, conf = 0.95) {
  x <- x[!is.na(x)]
  n <- length(x)
  if (n < 2) return(list(mean = if (n == 1) x else NA, lo = NA, hi = NA, n = n))
  m  <- mean(x); s <- sd(x)
  tc <- qt(1 - (1 - conf) / 2, df = n - 1)
  list(mean = m, lo = m - tc * s / sqrt(n), hi = m + tc * s / sqrt(n), n = n)
}

# ---- E-value for the age-vs-dependants sensitivity bound (rule 13) ----------
# E-value for a risk/rate ratio point estimate and its CI (VanderWeele & Ding).
# For RR < 1, invert before computing. Returns the point E-value and the E-value
# for the CI limit closest to the null.
evalue_rr <- function(rr, lo, hi) {
  ev <- function(r) { if (is.na(r)) return(NA); if (r < 1) r <- 1 / r; r + sqrt(r * (r - 1)) }
  point <- ev(rr)
  # CI limit closest to the null (1):
  if (is.na(lo) || is.na(hi)) { ci_ev <- NA } else if (lo > 1) {
    ci_ev <- ev(lo)
  } else if (hi < 1) {
    ci_ev <- ev(hi)
  } else { ci_ev <- 1 }   # CI crosses null
  list(evalue = point, evalue_ci = ci_ev)
}

# ============================================================================
# Self-tests: run `Rscript pipeline/02_stats_functions.R`. Values checked
# against textbook/reference results.
# ============================================================================
.self_test <- function() {
  pass <- TRUE
  chk <- function(name, got, want, tol = 1e-3) {
    ok <- !is.na(got) && abs(got - want) < tol
    cat(sprintf("  [%s] %-34s got %.5f want %.5f\n",
                if (ok) "OK" else "FAIL", name, got, want))
    if (!ok) pass <<- FALSE
  }

  # Wilson: 10/100. Reference Wilson score 95% (no continuity correction):
  # (0.05523, 0.17437), centre ~0.11480.
  w <- wilson_ci(10, 100)
  chk("wilson rate",  w$rate, 0.10)
  chk("wilson lo",    w$lo,   0.05523)
  chk("wilson hi",    w$hi,   0.17437)

  # Newcombe: 56/211 vs 56/211 (identical) -> difference 0, symmetric interval.
  nc0 <- newcombe_ci(56, 211, 56, 211)
  chk("newcombe identical mid", (nc0[1] + nc0[2]) / 2, 0)

  # Newcombe known example (Newcombe 1998, Table II, method 10):
  # 56/70 vs 48/80 -> diff 0.2, CI approx (0.0524, 0.3339).
  nc <- newcombe_ci(56, 70, 48, 80)
  chk("newcombe diff",  (56/70 - 48/80), 0.2)
  chk("newcombe lo",    nc[1], 0.05243, tol = 2e-3)
  chk("newcombe hi",    nc[2], 0.33361, tol = 2e-3)

  # prop.test raw p sanity: large clear difference -> tiny p.
  p <- raw_p_2x2(20, 100, 5, 100)
  cat(sprintf("  [%s] raw_p_2x2 small p                  got %.5f (<0.01)\n",
              if (!is.na(p) && p < 0.01) "OK" else "FAIL", p))
  if (is.na(p) || p >= 0.01) pass <<- FALSE

  # BH widening: a family where ranks/z_star are checkable.
  bh <- bh_widen(c(0.001, 0.02, 0.04, 0.9))
  cat(sprintf("  [%s] bh m == 4                          got %d\n",
              if (isTRUE(attr(bh, "m") == 4)) "OK" else "FAIL", attr(bh, "m")))
  if (!isTRUE(attr(bh, "m") == 4)) pass <<- FALSE
  # rank-1 alpha_star = 0.05*1/4 = 0.0125 -> z_star = qnorm(0.99375)
  chk("bh z_star rank1", bh$z_star[1], qnorm(1 - 0.0125 / 2))
  # p.adjust BH agreement
  chk("bh p_bh[1]", bh$p_bh[1], p.adjust(c(0.001,0.02,0.04,0.9),"BH")[1])

  # Rate ratio: 20/100 vs 10/100 -> RR 2.0.
  rr <- rate_ratio_ci(20, 100, 10, 100)
  chk("rate ratio", rr$value, 2.0)

  # t-interval: 1:5 -> mean 3, n 5.
  ti <- t_interval(c(1,2,3,4,5))
  chk("t-interval mean", ti$mean, 3)

  # E-value: RR 2.0 -> E = 2 + sqrt(2) = 3.4142.
  ev <- evalue_rr(2.0, 1.5, 2.7)
  chk("evalue point", ev$evalue, 3.41421)
  chk("evalue ci (lo 1.5)", ev$evalue_ci, 1.5 + sqrt(1.5 * 0.5))

  cat(if (pass) "\nALL STATS SELF-TESTS PASS\n" else "\nSELF-TESTS FAILED\n")
  invisible(pass)
}

if (sys.nframe() == 0) .self_test()
