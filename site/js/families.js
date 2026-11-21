// ============================================================================
// families.js - the full ("master") forest and the contextual-questions forest.
// Shared by the explorer (browser) and site/test/test_stats.js (node), so the
// numbers the site shows are the numbers tested against the R oracle
// (pipeline/04_export.R -> reference.json: master_dei, master_latest,
// context_latest).
//
// Full forest (method of the published May 2026 chart): frozen membership from
// counts.meta.master (groups with 300+ applicants in 2021-24 across nine
// characteristics; each vs the largest group of its characteristic, socio-economic
// vs Quintiles 2 and 3 combined). One Benjamini-Hochberg correction across every
// member with data in the chosen years (a member with none is left out of m, as
// in the R bh_widen()).
// Contextual forest: each question's 'Yes' vs 'No', one correction across them.
// House style: no em dashes, colons; "pp".
// ============================================================================
(function (root) {
  "use strict";
  var Stats = root.Stats || (typeof require !== "undefined" ? require("./stats.js") : null);

  function indexGroups(counts) {
    var idx = {};
    counts.groups.forEach(function (g) { idx[g.characteristic + "|" + g.group] = g; });
    return idx;
  }

  // Pool several groups of one characteristic; null if any is missing or has no
  // reportable year in the window (mirrors pool_leaf + the n_cat check in R).
  function poolAll(idx, ch, names, years) {
    var app = 0, acc = 0;
    for (var i = 0; i < names.length; i++) {
      var g = idx[ch + "|" + names[i]]; if (!g) return null;
      var p = Stats.poolGroup(g, years); if (!p.app) return null;
      app += p.app; acc += p.acc;
    }
    return { app: app, acc: acc };
  }

  function finish(cands, bh) {
    return cands.map(function (c, k) {
      var b = bh[k], base = { characteristic: c.characteristic, group: c.group, ref: c.ref,
        applicants: c.g ? c.g.app : 0, accepted: c.g ? c.g.acc : 0 };
      if (!c.g || !c.r || b.zStar == null) { base.computable = false; return base; }
      var ci = Stats.newcombeCI(c.g.acc, c.g.app, c.r.acc, c.r.app, b.zStar);
      base.computable = true;
      base.rate = 100 * c.g.acc / c.g.app; base.ref_rate = 100 * c.r.acc / c.r.app;
      base.pp = base.rate - base.ref_rate; base.pp_lo = ci[0] * 100; base.pp_hi = ci[1] * 100;
      base.raw_p = b.pRaw; base.p_bh = b.pBh; base.z_star = b.zStar;
      base.significant_after_bh = !!b.sig;
      base.bar_excludes_null = !(ci[0] <= 0 && ci[1] >= 0);
      return base;
    });
  }

  function master(counts, years, idx) {
    idx = idx || indexGroups(counts);
    var cands = (counts.meta.master || []).map(function (mb) {
      var refs = [].concat(mb.ref);
      return { characteristic: mb.characteristic, group: mb.group, ref: refs.join(" + "),
        g: poolAll(idx, mb.characteristic, [mb.group], years),
        r: poolAll(idx, mb.characteristic, refs, years) };
    });
    var bh = Stats.bhWiden(cands.map(function (c) {
      return (c.g && c.r) ? Stats.rawP2x2(c.g.acc, c.g.app, c.r.acc, c.r.app) : null; }));
    return { kind: "bh", master: true, m: bh.m, n_members: cands.length, rows: finish(cands, bh) };
  }

  function context(counts, years, idx) {
    idx = idx || indexGroups(counts);
    var cands = (counts.meta.context_questions || []).map(function (q) {
      return { characteristic: q, group: q.replace(/^CONTEXT: /, ""), ref: "No",
        g: poolAll(idx, q, ["Yes"], years), r: poolAll(idx, q, ["No"], years) };
    });
    var bh = Stats.bhWiden(cands.map(function (c) {
      return (c.g && c.r) ? Stats.rawP2x2(c.g.acc, c.g.app, c.r.acc, c.r.app) : null; }));
    return { kind: "bh", context: true, m: bh.m, n_members: cands.length, rows: finish(cands, bh) };
  }

  var Families = { indexGroups: indexGroups, master: master, context: context };
  if (typeof module !== "undefined" && module.exports) module.exports = Families;
  else root.Families = Families;
})(typeof window !== "undefined" ? window : this);
