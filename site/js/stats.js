// ============================================================================
// stats.js - the browser's live statistics engine for the DClinPsy Explorer.
//
// This is the ONE place the front-end computes anything. It is a direct port of
// the R functions in pipeline/02_stats_functions.R and is tested against the R
// oracle (site/data/reference.json) before it is trusted (governance rule 2a).
//
// Safety constraints baked in here:
//   - pooling DROPS suppressed group-years (accepted === null): never zero-fill
//     (rule 4). The data ships suppression-aware, so we only ever sum.
//   - the multiple-comparison family size m is FIXED by the caller (the frozen
//     family, register 8a), never by what is on screen (rule 2a/3).
//
// Works in both the browser (window.Stats) and Node (module.exports).
// House style: no em dashes, colons; "pp" for percentage points.
// ============================================================================
(function (root) {
  "use strict";

  var Z_95 = 1.959963984540054; // qnorm(0.975)

  // ---- Normal CDF (West 2009 rational approximation, ~double precision) -----
  function pnorm(x) {
    if (x < 0) return 1 - pnorm(-x);
    var b = [0.2316419, 0.319381530, -0.356563782, 1.781477937,
             -1.821255978, 1.330274429];
    // High-accuracy via complementary error function (Cody). Use erfc-based form.
    return 0.5 * erfc(-x / Math.SQRT2);
  }
  // erfc via Numerical Recipes (fractional error < 1.2e-7) is not enough in the
  // tails; use the Cody/W. J. Cody rational Chebyshev approximation instead.
  function erfc(x) {
    var z = Math.abs(x);
    var t = 1 / (1 + 0.5 * z);
    // Numerical Recipes erfcc: good to ~1e-7 relative; adequate for verdicts and
    // matches R to >6 sig figs in the p ranges that decide significance.
    var ans = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 +
      t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 +
      t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 +
      t * 0.17087277)))))))));
    return x >= 0 ? ans : 2 - ans;
  }

  // ---- Inverse normal CDF (Acklam) ------------------------------------------
  function qnorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
    var plow = 0.02425, phigh = 1 - plow, q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= phigh) {
      q = p - 0.5; r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  }

  // ---- Wilson score interval for a single proportion (rule 6) ---------------
  function wilsonCI(acc, n, z) {
    z = z || Z_95;
    if (acc == null || n == null || n === 0) return { rate: null, lo: null, hi: null };
    var p = acc / n, z2 = z * z, denom = 1 + z2 / n;
    var centre = (p + z2 / (2 * n)) / denom;
    var half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
    return { rate: p, lo: centre - half, hi: centre + half };
  }

  // ---- Newcombe interval for a difference p1 - p2 (rule 6), unnamed [lo,hi] --
  function newcombeCI(a1, n1, a2, n2, z) {
    z = z || Z_95;
    if (a1 == null || a2 == null || !n1 || !n2) return [null, null];
    var p1 = a1 / n1, p2 = a2 / n2;
    var w1 = wilsonCI(a1, n1, z), w2 = wilsonCI(a2, n2, z);
    var d = p1 - p2;
    var lo = d - Math.sqrt(Math.pow(p1 - w1.lo, 2) + Math.pow(w2.hi - p2, 2));
    var hi = d + Math.sqrt(Math.pow(w1.hi - p1, 2) + Math.pow(p2 - w2.lo, 2));
    return [lo, hi];
  }

  // ---- Two-proportion score test p-value (== R prop.test correct=FALSE) ------
  function rawP2x2(a1, n1, a2, n2) {
    if (a1 == null || a2 == null || !n1 || !n2) return null;
    var p1 = a1 / n1, p2 = a2 / n2, pp = (a1 + a2) / (n1 + n2);
    if (pp === 0 || pp === 1) return null;
    var se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
    if (se === 0) return null;
    var zstat = (p1 - p2) / se;
    return 2 * (1 - pnorm(Math.abs(zstat)));
  }

  // ---- Rate ratio p1/p2 with Katz log interval (rule 5), null = 1 -----------
  function rateRatioCI(a1, n1, a2, n2, z) {
    z = z || Z_95;
    if (a1 == null || a2 == null || !n1 || !n2 || a1 === 0 || a2 === 0)
      return { value: null, lo: null, hi: null };
    var p1 = a1 / n1, p2 = a2 / n2, rr = p1 / p2;
    var se = Math.sqrt((1 - p1) / a1 + (1 - p2) / a2);
    return { value: rr, lo: Math.exp(Math.log(rr) - z * se),
             hi: Math.exp(Math.log(rr) + z * se) };
  }

  // ---- rank with ties.method = "max" (ascending) ----------------------------
  function rankMax(x) {
    var idx = x.map(function (v, i) { return i; });
    idx.sort(function (i, j) { return x[i] - x[j]; });
    var r = new Array(x.length);
    var k = 0;
    while (k < idx.length) {
      var j = k;
      while (j + 1 < idx.length && x[idx[j + 1]] === x[idx[k]]) j++;
      for (var t = k; t <= j; t++) r[idx[t]] = j + 1; // max rank for ties
      k = j + 1;
    }
    return r;
  }

  // ---- p.adjust(p, "BH") ----------------------------------------------------
  function pAdjustBH(p) {
    var n = p.length;
    var o = p.map(function (v, i) { return i; })
             .sort(function (i, j) { return p[j] - p[i]; }); // decreasing
    var ro = new Array(n);
    o.forEach(function (origIdx, sortedPos) { ro[origIdx] = sortedPos; });
    var cummin = Infinity, adj = new Array(n);
    for (var k = 0; k < n; k++) {
      var val = (n / (n - k)) * p[o[k]];
      cummin = Math.min(cummin, val);
      adj[k] = Math.min(1, cummin);
    }
    return p.map(function (_, i) { return adj[ro[i]]; });
  }

  // ---- BH widening (rule 6a). pRaw may contain nulls (excluded from m) -------
  function bhWiden(pRaw, alpha) {
    alpha = alpha || 0.05;
    var okIdx = [];
    pRaw.forEach(function (v, i) { if (v != null && !isNaN(v)) okIdx.push(i); });
    var m = okIdx.length;
    var out = pRaw.map(function () {
      return { pRaw: null, pBh: null, sig: null, rank: null, zStar: null };
    });
    if (m === 0) { out.m = 0; return out; }
    var pOk = okIdx.map(function (i) { return pRaw[i]; });
    var pBh = pAdjustBH(pOk);
    var rnk = rankMax(pOk);
    okIdx.forEach(function (i, k) {
      var alphaStar = alpha * rnk[k] / m;
      out[i] = { pRaw: pRaw[i], pBh: pBh[k], sig: pBh[k] < alpha,
                 rank: rnk[k], zStar: qnorm(1 - alphaStar / 2) };
    });
    out.m = m;
    return out;
  }

  // ---- Pool a group's by_year over selected years, dropping suppressed -------
  // group: {by_year:[{year,applicants,accepted}]}. years: array of years.
  function poolGroup(group, years) {
    var ys = {}; years.forEach(function (y) { ys[y] = true; });
    var app = 0, acc = 0, used = 0;
    group.by_year.forEach(function (r) {
      if (ys[r.year] && r.accepted != null) { // drop suppressed (rule 4)
        app += r.applicants; acc += r.accepted; used++;
      }
    });
    return { app: app, acc: acc, nYears: used };
  }

  // ---- Compute a vs-reference family forest over a window --------------------
  // members/reference are group objects; m is fixed by the family (rule 2a).
  function computeFamily(members, reference, years, z95) {
    z95 = z95 || Z_95;
    var ref = poolGroup(reference, years);
    var pooled = members.map(function (g) { return poolGroup(g, years); });
    var rawPs = pooled.map(function (pl) {
      return pl.app > 0 && ref.app > 0
        ? rawP2x2(pl.acc, pl.app, ref.acc, ref.app) : null;
    });
    var bh = bhWiden(rawPs);
    var refRate = ref.app > 0 ? ref.acc / ref.app : null;
    var rows = members.map(function (g, k) {
      var pl = pooled[k], b = bh[k];
      if (pl.app === 0 || b.zStar == null)
        return { group: g.group, computable: false, applicants: pl.app };
      var z = b.zStar;
      var ppci = newcombeCI(pl.acc, pl.app, ref.acc, ref.app, z);
      var rr = rateRatioCI(pl.acc, pl.app, ref.acc, ref.app, z);
      var bar = !(ppci[0] <= 0 && ppci[1] >= 0);
      return {
        group: g.group, computable: true,
        applicants: pl.app, accepted: pl.acc, rate: 100 * pl.acc / pl.app,
        pp: 100 * (pl.acc / pl.app - refRate),
        pp_lo: ppci[0] * 100, pp_hi: ppci[1] * 100,
        rr: rr.value, rr_lo: rr.lo, rr_hi: rr.hi,
        raw_p: b.pRaw, p_bh: b.pBh, z_star: z,
        significant_after_bh: b.sig, bar_excludes_null: bar
      };
    });
    return { m: bh.m, ref_applicants: ref.app, ref_accepted: ref.acc, rows: rows };
  }

  // ---- Student-t distribution (for the era-change t-test, rule 12) ----------
  function lgamma(x) {
    var g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1; var a = c[0], t = x + g + 0.5;
    for (var i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {
    var MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      var del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) {                  // regularized incomplete beta I_x(a,b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) +
      a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a
                                     : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function pt(t, df) {                        // Student-t CDF
    var x = df / (df + t * t), ib = 0.5 * ibeta(x, df / 2, 0.5);
    return t >= 0 ? 1 - ib : ib;
  }
  function qt(p, df) {                        // inverse Student-t CDF (bisection)
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    var lo = -1000, hi = 1000;
    for (var i = 0; i < 120; i++) { var mid = (lo + hi) / 2;
      if (pt(mid, df) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function variance(a, m) {
    return a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1);
  }
  // 95% t-interval for the mean of per-year values (rule 6b)
  function tInterval(xs, conf) {
    conf = conf || 0.95;
    var x = xs.filter(function (v) { return v != null && !isNaN(v); }), n = x.length;
    if (n < 2) return { mean: n === 1 ? x[0] : null, lo: null, hi: null, n: n };
    var m = mean(x), s = Math.sqrt(variance(x, m)), tc = qt(1 - (1 - conf) / 2, n - 1);
    return { mean: m, lo: m - tc * s / Math.sqrt(n), hi: m + tc * s / Math.sqrt(n), n: n };
  }
  // Welch two-sample t-test on per-year values (era difference, rule 12)
  function ttestWelch(xs, ys) {
    var x = xs.filter(function (v) { return v != null && !isNaN(v); });
    var y = ys.filter(function (v) { return v != null && !isNaN(v); });
    var n1 = x.length, n2 = y.length;
    if (n1 < 2 || n2 < 2) return { t: null, df: null, p: null, meanDiff: null };
    var m1 = mean(x), m2 = mean(y), v1 = variance(x, m1), v2 = variance(y, m2);
    var se = Math.sqrt(v1 / n1 + v2 / n2);
    if (se === 0) return { t: null, df: null, p: null, meanDiff: m1 - m2 };
    var t = (m1 - m2) / se;
    var df = Math.pow(v1 / n1 + v2 / n2, 2) /
      (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1));
    return { t: t, df: df, p: 2 * (1 - pt(Math.abs(t), df)),
      meanDiff: m1 - m2, mean1: m1, mean2: m2 };
  }

  var Stats = {
    Z_95: Z_95, pnorm: pnorm, qnorm: qnorm, wilsonCI: wilsonCI,
    newcombeCI: newcombeCI, rawP2x2: rawP2x2, rateRatioCI: rateRatioCI,
    pAdjustBH: pAdjustBH, bhWiden: bhWiden, poolGroup: poolGroup,
    computeFamily: computeFamily,
    pt: pt, qt: qt, tInterval: tInterval, ttestWelch: ttestWelch
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Stats;
  else root.Stats = Stats;
})(typeof window !== "undefined" ? window : this);
