// ============================================================================
// explorer.js - front-end for the DClinPsy Equal-Opportunities Explorer.
// Two views:
//   trend  - per-year acceptance rate with Wilson error bars (broken on gaps).
//   forest - each group's effect vs its reference over a chosen year window,
//            BH-coloured for frozen families, plain/descriptive otherwise.
// All statistics come from the oracle-tested Stats engine (governance rule 2a).
// Family membership and m are FIXED by the register (8a), never by the UI.
// House style (FT / Burn-Murdoch): beige, FT red above / blue below / grey
// hollow not-significant, Inter, minimal. No em dashes, colons; "pp".
// ============================================================================
(function () {
  "use strict";

  var ALL_YEARS = [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
  var REFS = window.COUNTS.meta.references || {};

  // Sentinel "characteristic" for the master forest (all groups, one pooled
  // correction). It lives in the Compare to reference view's dropdown, not as a
  // real characteristic, so it is only valid there.
  var ALL_GROUPS = "__ALL_GROUPS__";
  function isAllGroups() { return state.characteristic === ALL_GROUPS; }

  var CHAR_LABELS = {
    "__ALL_GROUPS__":"All groups",
    "ETHNICITY":"Ethnicity (detailed)", "ETHNIC GROUP (BROAD)":"Ethnic group (broad)",
    "AGE":"Age", "DEPENDANTS":"Dependants", "DISABILITY":"Disability",
    "GENDER":"Gender", "MARITAL STATUS":"Marital status",
    "RELIGION":"Religion", "RESIDENT":"Resident status",
    "SEXUAL ORIENTATION":"Sexual orientation",
    "SOCIO-ECONOMIC BACKGROUND":"Socio-economic background"
  };

  // Forest config per characteristic. type: "bh" frozen BH family (significance),
  // "single" pre-specified plain test, "descriptive" no significance test.
  var FORESTS = {
    "ETHNICITY": { type:"bh", ref:"British English", members:[
      "British Scottish","British Welsh","Irish","Other White background","Indian",
      "Pakistani","Bangladeshi","Chinese","African","Caribbean","Mixed (all)",
      "Middle Eastern/North African"] },
    "ETHNIC GROUP (BROAD)": { type:"bh", ref:"White", members:["Asian","Black","Mixed"] },
    "RELIGION": { type:"bh", ref:"No religion", members:[
      "Jewish","Buddhist","Hindu","Christian (all)","Sikh","Muslim"] },
    "SEXUAL ORIENTATION": { type:"bh", ref:"Heterosexual/straight", members:[
      "Gay woman/lesbian","Gay man","Bisexual","Other sexual orientation"] },
    "MARITAL STATUS": { type:"bh", ref:"Single", members:[
      "Married/civil partnership/co-habiting","Divorced/Separated, Widowed"] },
    "GENDER": { type:"single", ref:"Female", members:["Male"] },
    "SOCIO-ECONOMIC BACKGROUND": { type:"pairwise", ref:"Quintile 3", members:[
      "Quintile 1 (lowest participation rate in HE)","Quintile 2","Quintile 4",
      "Quintile 5 (highest participation rate in HE)"] },
    "AGE": { type:"bh", ref:"25-29 years", members:[
      "20-24 years","30-34 years","35-39 years",
      // 40+ pooled aggregate (rule 9): the separate older bands and the merged
      // "50-54, 55 and over" rows never co-occur in a year, so summing them all
      // does not double-count. Suppressed bands drop out (rule 4).
      { label:"40+ years", components:[
        "40-44 years","45-49 years","50-54 years","55 and over",
        "50-54 years, 55 and over"] }] },
    "DISABILITY": { type:"bh", ref:"No disability", members:[
      "Dyslexia","Mental health difficulties",
      "Unseen disability eg diabetes, epilepsy, asthma","Two or more disabilities",
      "Other disability","Personal care support","Wheelchair user/mobility difficulties",
      "Deaf/hearing impairment","Blind/partially sighted"] },
    "RESIDENT": { type:"bh", ref:"UK", members:["Other EU/EEA","Other residence"] },
    "DEPENDANTS": { type:"bh", ref:"No dependants", members:["Has dependants"] }
  };

  // Colours (house style)
  var REF_COLOR = "#333333", BG = "#ffffff";
  var RED = "#990F3D", BLUE = "#2D6CA2", DESC = "#6f6a5d", NOSIG = "#b3a98f";
  var ACCENTS = ["#990F3D","#2D6CA2","#B07A2D","#4F7942","#7A3B69","#1A6B6B",
    "#A0522D","#41506B"];
  var AXISLINE = "#d3ccbe", GRID = "#e3ddd0", MUTED = "#6f6757";

  // index groups by characteristic
  var byChar = {};
  window.COUNTS.groups.forEach(function (g) {
    (byChar[g.characteristic] = byChar[g.characteristic] || []).push(g);
  });
  var CHARS = Object.keys(CHAR_LABELS).filter(function (c) { return byChar[c]; });
  function getGroup(ch, name) {
    return (byChar[ch] || []).find(function (g) { return g.group === name; });
  }
  // reference group for a characteristic (forest config covers all 10; the
  // data's meta.references only covers 8, missing disability and dependants)
  function refFor(ch) { return (FORESTS[ch] && FORESTS[ch].ref) || REFS[ch]; }
  // A forest member is either a group name (string) or a virtual aggregate
  // { label, components:[names] } pooled by summation (rule 2a: only summing).
  function memberLabel(m) { return typeof m === "string" ? m : m.label; }
  function poolMember(ch, m, years) {
    if (typeof m === "string") {
      var g = getGroup(ch, m);
      return g ? Stats.poolGroup(g, years) : { app:0, acc:0 };
    }
    var app = 0, acc = 0;
    m.components.forEach(function (name) {
      var g = getGroup(ch, name);
      if (g) { var p = Stats.poolGroup(g, years); app += p.app; acc += p.acc; }
    });
    return { app:app, acc:acc };
  }

  // Trend aggregates: synthetic per-year groups for the trend (40+ lumps the
  // older age bands), with their raw components hidden from the trend list.
  // Same summation rule as the forest (rule 2a) and suppression (rule 4).
  var TREND_AGGREGATES = {
    "AGE": { label:"40+ years", components:[
      "40-44 years","45-49 years","50-54 years","55 and over",
      "50-54 years, 55 and over"] },
    // Mixed (all) already exists as an R-built group, so this only HIDES the
    // individual mixed sub-groups from the trend list (no rebuild: the guard
    // below skips building when the label already exists).
    "ETHNICITY": { label:"Mixed (all)", components:[
      "White & Asian","White & Black African","White & Black Caribbean",
      "Other Mixed background"] }
  };
  function buildAggregateGroup(ch, label, components) {
    var slot = {}; ALL_YEARS.forEach(function (y) { slot[y] = { app:0, acc:0, has:false }; });
    components.forEach(function (name) {
      var g = getGroup(ch, name); if (!g) return;
      g.by_year.forEach(function (r) {
        if (r.accepted != null) { var s = slot[r.year]; s.app += r.applicants; s.acc += r.accepted; s.has = true; }
      });
    });
    return { characteristic:ch, group:label, constructed:true,
      by_year: ALL_YEARS.map(function (y) { var s = slot[y];
        return { year:y, applicants:s.app, accepted: s.has ? s.acc : null }; }) };
  }
  Object.keys(TREND_AGGREGATES).forEach(function (ch) {
    var agg = TREND_AGGREGATES[ch];
    if (byChar[ch] && !getGroup(ch, agg.label))
      byChar[ch].push(buildAggregateGroup(ch, agg.label, agg.components));
  });
  // Standalone groups to hide from the trend list: opaque residual catch-alls
  // that are in no BH family. (Keep "Other White background", a family member.)
  var TREND_HIDE = {
    "ETHNICITY": ["Other British (white)","Other Asian background",
      "Other Black background","Other ethnic background"],
    // The published "Other" broad total exists for representativeness, but stays
    // out of the curated broad trend and the frozen m=3 forest family.
    "ETHNIC GROUP (BROAD)": ["Other"]
  };
  function trendHidden(ch) {
    var agg = TREND_AGGREGATES[ch] ? TREND_AGGREGATES[ch].components : [];
    return agg.concat(TREND_HIDE[ch] || []);
  }

  var state = { view:"trend", characteristic:"ETHNIC GROUP (BROAD)", selected:{}, showCI:false,
    trendMode:"rate", smooth:1, eraMode:"rate", yearFrom:2021, yearTo:2024, measure:"pp",
    tableYearFrom:2015, tableYearTo:2024, tableSelected:{}, tableMode:"pooled",
    tableSort:{ col:null, dir:1 }, repYearFrom:2021, repYearTo:2024, repMode:"chart",
    repSort:{ col:null, dir:1 }, forestMode:"chart", forestSort:{ col:null, dir:1 },
    eraView:"chart", eraSort:{ col:null, dir:1 }, combine:false };

  // ==========================================================================
  // TREND VIEW
  // ==========================================================================
  // Smoothing: a point for year yr pools the accepted/applicant counts across a
  // centered window of state.smooth years (1 = no smoothing). Pooling counts (not
  // averaging rates) weights by sample size and damps small-year spikes; suppressed
  // cells are dropped from the sum, never interpolated (rule 4).
  function winYears(yr, w) {
    var half = Math.floor(w / 2), out = [];
    ALL_YEARS.forEach(function (y) { if (y >= yr - half && y <= yr + half) out.push(y); });
    return out;
  }
  function smoothLabel(yr, w) { return w > 1 ? yr + " (" + w + "-yr avg)" : "" + yr; }
  var TRACE_STYLE = function (group, color, x, y, eHi, eLo, text) {
    return { name: group.group, x:x, y:y, type:"scatter", mode:"lines+markers",
      connectgaps:true, line:{ color:color, width:2 }, marker:{ color:color, size:6 },
      error_y: state.showCI ? { type:"data", symmetric:false, array:eHi,
        arrayminus:eLo, color:color, thickness:1, width:3, opacity:0.55 }
        : { visible:false },
      hovertemplate:"%{text}<extra></extra>", text:text };
  };
  function traceFor(group, color) {
    var byYear = {};
    group.by_year.forEach(function (r) { byYear[r.year] = r; });
    var w = state.smooth || 1, x = [], y = [], eHi = [], eLo = [], text = [];
    ALL_YEARS.forEach(function (yr) {
      x.push(yr);
      var acc = 0, app = 0, present = false;
      winYears(yr, w).forEach(function (yy) {
        var r = byYear[yy];
        if (r && r.accepted != null) { acc += r.accepted; app += r.applicants; present = true; }
      });
      if (!present || app === 0) { y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
      var ci = Stats.wilsonCI(acc, app), rate = ci.rate * 100;
      y.push(rate); eHi.push(ci.hi*100 - rate); eLo.push(rate - ci.lo*100);
      text.push(group.group + "<br>" + smoothLabel(yr, w) + ": " + rate.toFixed(1) + "% (" +
        acc + "/" + app + ")<br>95% CI " + (ci.lo*100).toFixed(1) + " to " + (ci.hi*100).toFixed(1));
    });
    return TRACE_STYLE(group, color, x, y, eHi, eLo, text);
  }

  // Per-year difference vs the reference group, in pp, with plain 95% Newcombe
  // intervals. A gap if either the group or the reference is suppressed that year.
  function traceVsRef(group, refGroup, color) {
    var gy = {}, ry = {};
    group.by_year.forEach(function (r) { gy[r.year] = r; });
    refGroup.by_year.forEach(function (r) { ry[r.year] = r; });
    var w = state.smooth || 1, x = [], y = [], eHi = [], eLo = [], text = [];
    ALL_YEARS.forEach(function (yr) {
      x.push(yr);
      var gAcc = 0, gApp = 0, rAcc = 0, rApp = 0, present = false;
      winYears(yr, w).forEach(function (yy) {
        var g = gy[yy], rf = ry[yy];
        if (g && rf && g.accepted != null && rf.accepted != null) {
          gAcc += g.accepted; gApp += g.applicants; rAcc += rf.accepted; rApp += rf.applicants;
          present = true;
        }
      });
      if (!present || !gApp || !rApp) { y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
      var diff = (gAcc/gApp - rAcc/rApp) * 100;
      var ci = Stats.newcombeCI(gAcc, gApp, rAcc, rApp);
      var lo = ci[0]*100, hi = ci[1]*100;
      y.push(diff); eHi.push(hi - diff); eLo.push(diff - lo);
      text.push(group.group + "<br>" + smoothLabel(yr, w) + ": " + (diff>=0?"+":"") + diff.toFixed(1) +
        " pp vs " + refGroup.group + "<br>95% CI " + lo.toFixed(1) + " to " +
        hi.toFixed(1) + "<br>n " + gAcc + "/" + gApp);
    });
    return TRACE_STYLE(group, color, x, y, eHi, eLo, text);
  }

  // Combine the selected (non-reference) groups into ONE pooled series: counts are
  // summed across the groups (and the smoothing window), dropping suppressed cells
  // (rule 4), then the same Wilson (rate) or Newcombe-vs-reference (vsref) maths.
  function combinedTrace(groups, refGroup, vs, color) {
    var w = state.smooth || 1;
    var maps = groups.map(function (g) {
      var m = {}; g.by_year.forEach(function (r) { m[r.year] = r; }); return m; });
    var rmap = {}; if (refGroup) refGroup.by_year.forEach(function (r) { rmap[r.year] = r; });
    var name = "Combined (" + groups.length + " group" + (groups.length === 1 ? "" : "s") + ")";
    var listed = groups.map(function (g) { return g.group; }).join(" + ");
    var x = [], y = [], eHi = [], eLo = [], text = [];
    ALL_YEARS.forEach(function (yr) {
      x.push(yr);
      var acc = 0, app = 0, present = false;
      winYears(yr, w).forEach(function (yy) {
        maps.forEach(function (m) { var r = m[yy];
          if (r && r.accepted != null) { acc += r.accepted; app += r.applicants; present = true; } });
      });
      if (!vs) {
        if (!present || app === 0) { y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
        var ci = Stats.wilsonCI(acc, app), rate = ci.rate * 100;
        y.push(rate); eHi.push(ci.hi*100 - rate); eLo.push(rate - ci.lo*100);
        text.push(listed + "<br>" + smoothLabel(yr, w) + ": " + rate.toFixed(1) + "% (" + acc + "/" + app +
          ")<br>95% CI " + (ci.lo*100).toFixed(1) + " to " + (ci.hi*100).toFixed(1));
      } else {
        var rAcc = 0, rApp = 0, rPresent = false;
        winYears(yr, w).forEach(function (yy) { var r = rmap[yy];
          if (r && r.accepted != null) { rAcc += r.accepted; rApp += r.applicants; rPresent = true; } });
        if (!present || !app || !rPresent || !rApp) { y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
        var diff = (acc/app - rAcc/rApp) * 100, nc = Stats.newcombeCI(acc, app, rAcc, rApp);
        var lo = nc[0]*100, hi = nc[1]*100;
        y.push(diff); eHi.push(hi - diff); eLo.push(diff - lo);
        text.push(listed + "<br>" + smoothLabel(yr, w) + ": " + (diff>=0?"+":"") + diff.toFixed(1) +
          " pp vs " + refGroup.group + "<br>95% CI " + lo.toFixed(1) + " to " + hi.toFixed(1) +
          "<br>n " + acc + "/" + app);
      }
    });
    return TRACE_STYLE({ group: name }, color, x, y, eHi, eLo, text);
  }

  function renderTrend() {
    var ch = state.characteristic, ref = refFor(ch), refGroup = getGroup(ch, ref);
    var vs = state.trendMode === "vsref" && !!refGroup;
    var traces = [], ai = 0;
    var selectedGroups = (byChar[ch] || []).filter(function (g) { return state.selected[g.group]; });
    var combining = state.combine &&
      selectedGroups.filter(function (g) { return g.group !== ref; }).length > 0;
    if (combining) {
      var pool = selectedGroups.filter(function (g) { return g.group !== ref; });
      traces.push(combinedTrace(pool, refGroup, vs, RED));
      if (!vs && refGroup) traces.push(traceFor(refGroup, REF_COLOR));   // baseline to compare against
    } else {
      selectedGroups.forEach(function (g) {
        if (vs && g.group === ref) return;   // reference is the flat baseline
        var color = g.group === ref ? REF_COLOR : ACCENTS[ai++ % ACCENTS.length];
        traces.push(vs ? traceVsRef(g, refGroup, color) : traceFor(g, color));
      });
    }
    var label = CHAR_LABELS[ch];
    var shapes = [{ type:"rect", xref:"x", yref:"paper", x0:2020.5, x1:2024.5, y0:0, y1:1,
      fillcolor:"#efe7d6", opacity:0.4, line:{ width:0 }, layer:"below" }];
    if (vs) shapes.push({ type:"line", xref:"paper", x0:0, x1:1, yref:"y", y0:0, y1:0,
      line:{ color:"#7a6f5a", width:1.4, dash:"dot" } });
    var yaxis = vs
      ? { title:"Difference from "+ref+" (pp)", ticksuffix:" pp", showgrid:true,
          gridcolor:GRID, zeroline:false, linecolor:AXISLINE, tickcolor:AXISLINE }
      : { title:"Acceptance rate (%)", rangemode:"tozero", ticksuffix:"%", showgrid:true,
          gridcolor:GRID, zeroline:false, linecolor:AXISLINE, tickcolor:AXISLINE };
    var sw = state.smooth || 1;
    var cadence = sw > 1 ? sw + "-year rolling average" : "each year";
    var combNote = combining ? " The selected groups are pooled into one group (summed counts)." : "";
    setChartHead(label + (vs ? ": acceptance vs " + ref + " over time" : ": acceptance rate by year"),
      (vs ? "Difference from " + ref + ", " + cadence + ", in percentage points, with 95% intervals."
         : "Share of applicants accepted, " + cadence + ", with 95% Wilson intervals.") + combNote);
    var layout = {
      paper_bgcolor:BG, plot_bgcolor:BG, height:480,
      font:{ family:"Inter, system-ui, sans-serif", color:"#1a1a1a", size:13 },
      margin:{ t:22, r:24, b:70, l:64 },
      xaxis:{ dtick: narrowView() ? 3 : 1, range:[2014.5,2024.5], showgrid:false, zeroline:false,
        linecolor:AXISLINE, tickcolor:AXISLINE },
      yaxis:yaxis, hovermode:"closest",
      legend:{ orientation:"h", y:-0.18, bgcolor:"rgba(0,0,0,0)", font:{ size:12 } },
      shapes:shapes,
      annotations:[
        { x:2024.4, y:0.985, yref:"paper", xanchor:"right", yanchor:"top",
          showarrow:false, text:"DEI era", font:{ size:11, color:"#8a7d64" } }
      ]
    };
    Plotly.react("chart", traces, lockZoom(layout), PLOT_CFG);
    var gd = document.getElementById("chart"); gd._lastHi = null; bindTrendHover(gd);
  }

  // Hover to focus: hovering a line dims the others so a tangle is readable on
  // demand. Bound once; the handlers no-op off the trend view, and every render
  // rebuilds traces at full opacity so dimming never sticks.
  function bindTrendHover(gd) {
    if (gd._trendHoverBound) return;
    gd._trendHoverBound = true;
    gd.on("plotly_hover", function (ev) {
      if (state.view !== "trend") return;
      var n = gd.data.length; if (n < 2) return;
      var hi = (ev.points && ev.points.length) ? ev.points[0].curveNumber : -1;
      if (hi < 0 || hi === gd._lastHi) return;
      gd._lastHi = hi;
      var op = []; for (var i = 0; i < n; i++) op.push(i === hi ? 1 : 0.18);
      Plotly.restyle(gd, { opacity: op });
    });
    gd.on("plotly_unhover", function () {
      if (state.view !== "trend" || gd._lastHi == null) return;
      gd._lastHi = null;
      var op = []; for (var i = 0; i < gd.data.length; i++) op.push(1);
      Plotly.restyle(gd, { opacity: op });
    });
  }

  // ==========================================================================
  // FOREST VIEW
  // ==========================================================================
  function windowYears() {
    var ys = [];
    for (var y = state.yearFrom; y <= state.yearTo; y++) ys.push(y);
    return ys;
  }

  function computeForest(years) {
    var ch = state.characteristic, cfg = FORESTS[ch];
    var refG = getGroup(ch, cfg.ref);
    if (cfg.type === "bh") return computeBHFamily(ch, cfg.members, cfg.ref, years);
    var z = Stats.Z_95, refp = poolMember(ch, cfg.ref, years);
    var refRate = refp.app ? refp.acc / refp.app : null;
    var rows = cfg.members.map(function (m) {
      var label = memberLabel(m), pl = poolMember(ch, m, years);
      if (!pl.app || !refp.app) return { group:label, computable:false };
      var ci = Stats.newcombeCI(pl.acc, pl.app, refp.acc, refp.app, z);
      var rr = Stats.rateRatioCI(pl.acc, pl.app, refp.acc, refp.app, z);
      var row = { group:label, computable:true, applicants:pl.app, accepted:pl.acc,
        rate:100*pl.acc/pl.app, pp:100*(pl.acc/pl.app - refRate),
        pp_lo:ci[0]*100, pp_hi:ci[1]*100, rr:rr.value, rr_lo:rr.lo, rr_hi:rr.hi };
      if (cfg.type === "single") {
        var rp = Stats.rawP2x2(pl.acc, pl.app, refp.acc, refp.app);
        row.raw_p = rp; row.significant = rp != null && rp < 0.05;
        row.bar_excludes_null = !(ci[0] <= 0 && ci[1] >= 0);
      }
      return row;
    });
    return { kind:cfg.type, ref:cfg.ref, ref_applicants:refp.app,
      ref_accepted:refp.acc, m:null, rows:rows };
  }

  function isSig(res, row) {
    if (res.kind === "bh") return !!row.significant_after_bh;
    if (res.kind === "single") return !!row.significant;
    return false; // descriptive: no significance claim
  }

  // Master forest: every group across the BH significance families vs its own
  // reference, pooled into ONE BH family (register 8a). 300-applicant threshold
  // over the window. m is the count clearing the threshold (NOT the on-screen
  // selection): same fixed-family principle as the per-characteristic forests.
  var MASTER_FAMS = ["ETHNICITY","RELIGION","SEXUAL ORIENTATION","MARITAL STATUS",
    "SOCIO-ECONOMIC BACKGROUND"];
  function computeMaster(years) {
    var cand = [];
    MASTER_FAMS.forEach(function (ch) {
      var cfg = FORESTS[ch], refp = poolMember(ch, cfg.ref, years);
      if (!refp.app) return;
      cfg.members.forEach(function (mb) {
        var pl = poolMember(ch, mb, years);
        if (pl.app < 300) return;                  // threshold (rule 9)
        cand.push({ ch:ch, label:memberLabel(mb), pl:pl, refp:refp });
      });
    });
    var rawPs = cand.map(function (c) {
      return Stats.rawP2x2(c.pl.acc, c.pl.app, c.refp.acc, c.refp.app); });
    var bh = Stats.bhWiden(rawPs);
    var rows = cand.map(function (c, k) {
      var b = bh[k]; if (b.zStar == null) return { group:c.label, computable:false };
      var z = b.zStar, refRate = c.refp.acc / c.refp.app;
      var ci = Stats.newcombeCI(c.pl.acc, c.pl.app, c.refp.acc, c.refp.app, z);
      var rr = Stats.rateRatioCI(c.pl.acc, c.pl.app, c.refp.acc, c.refp.app, z);
      return { group:c.label, characteristic:c.ch, computable:true,
        applicants:c.pl.app, accepted:c.pl.acc, rate:100*c.pl.acc/c.pl.app,
        pp:100*(c.pl.acc/c.pl.app - refRate), pp_lo:ci[0]*100, pp_hi:ci[1]*100,
        rr:rr.value, rr_lo:rr.lo, rr_hi:rr.hi, raw_p:b.pRaw, p_bh:b.pBh, z_star:z,
        significant_after_bh:b.sig, bar_excludes_null:!(ci[0] <= 0 && ci[1] >= 0) };
    });
    return { kind:"bh", master:true, m:bh.m, rows:rows };
  }

  // BH family vs a single reference, via poolMember (handles virtual aggregates
  // like 40+). Mathematically identical to Stats.computeFamily for plain members,
  // so the oracle-verified ethnicity result is unchanged.
  function computeBHFamily(ch, memberSpecs, refSpec, years) {
    var refp = poolMember(ch, refSpec, years);
    var pooled = memberSpecs.map(function (m) {
      return { label: memberLabel(m), pl: poolMember(ch, m, years) }; });
    var rawPs = pooled.map(function (p) {
      return (p.pl.app && refp.app) ? Stats.rawP2x2(p.pl.acc, p.pl.app, refp.acc, refp.app) : null; });
    var bh = Stats.bhWiden(rawPs);
    var refRate = refp.app ? refp.acc / refp.app : null;
    var rows = pooled.map(function (p, k) {
      var b = bh[k];
      if (p.pl.app === 0 || b.zStar == null) return { group: p.label, computable: false, applicants: p.pl.app };
      var z = b.zStar;
      var ci = Stats.newcombeCI(p.pl.acc, p.pl.app, refp.acc, refp.app, z);
      var rr = Stats.rateRatioCI(p.pl.acc, p.pl.app, refp.acc, refp.app, z);
      return { group: p.label, computable: true, applicants: p.pl.app, accepted: p.pl.acc,
        rate: 100 * p.pl.acc / p.pl.app, pp: 100 * (p.pl.acc / p.pl.app - refRate),
        pp_lo: ci[0] * 100, pp_hi: ci[1] * 100, rr: rr.value, rr_lo: rr.lo, rr_hi: rr.hi,
        raw_p: b.pRaw, p_bh: b.pBh, z_star: z, significant_after_bh: b.sig,
        bar_excludes_null: !(ci[0] <= 0 && ci[1] >= 0) };
    });
    return { kind: "bh", ref: memberLabel(refSpec), m: bh.m,
      ref_applicants: refp.app, ref_accepted: refp.acc, rows: rows };
  }

  function renderForest() {
    drawForest(isAllGroups() ? computeMaster(windowYears()) : computeForest(windowYears()));
  }

  // SES pairwise quintile matrix (frozen family, m = 10 over all Q-vs-Q pairs).
  var SES_CH = "SOCIO-ECONOMIC BACKGROUND";
  var SES_Q = [
    { full:"Quintile 1 (lowest participation rate in HE)",  short:"Q1" },
    { full:"Quintile 2", short:"Q2" },
    { full:"Quintile 3", short:"Q3" },
    { full:"Quintile 4", short:"Q4" },
    { full:"Quintile 5 (highest participation rate in HE)", short:"Q5" }
  ];
  function computeSESPairs(years) {
    var pools = SES_Q.map(function (q) { return poolMember(SES_CH, q.full, years); });
    var pairs = [];
    for (var i = 0; i < 5; i++) for (var j = i+1; j < 5; j++) pairs.push([i, j]);
    var rawPs = pairs.map(function (p) { var a = pools[p[0]], b = pools[p[1]];
      return (a.app && b.app) ? Stats.rawP2x2(a.acc, a.app, b.acc, b.app) : null; });
    var bh = Stats.bhWiden(rawPs);
    var pinfo = {};
    pairs.forEach(function (p, k) { pinfo[p[0]+"_"+p[1]] =
      { sig: bh[k].sig, zStar: bh[k].zStar, pBh: bh[k].pBh }; });
    return { pools: pools, pinfo: pinfo, m: bh.m };
  }
  function renderSESMatrix() {
    var res = computeSESPairs(windowYears()), pp = state.measure === "pp";
    var winLabel = state.yearFrom === state.yearTo ? ("" + state.yearFrom)
      : (state.yearFrom + " to " + state.yearTo);
    var h = '<div class="matrix-title">Socio-economic background: pairwise quintile comparison</div>';
    h += '<div class="matrix-sub">Acceptance-rate difference, row minus column, ' +
      (pp ? "in percentage points" : "as a rate ratio") + ", " + winLabel +
      ". Colour = significant after Benjamini-Hochberg across the 10 pairs (m = " +
      res.m + "). Q1 is the lowest HE-participation quintile, Q5 the highest.</div>";
    h += '<table class="matrix"><tr><th></th>';
    SES_Q.forEach(function (q) { h += "<th>" + q.short + "</th>"; });
    h += "</tr>";
    for (var r = 0; r < 5; r++) {
      h += "<tr><th>" + SES_Q[r].short + "</th>";
      for (var c = 0; c < 5; c++) {
        if (r === c) { h += '<td class="diag"></td>'; continue; }
        var i = Math.min(r, c), j = Math.max(r, c), info = res.pinfo[i+"_"+j];
        var a = res.pools[r], b = res.pools[c];
        if (!a.app || !b.app || !info || info.zStar == null) { h += '<td class="nd">-</td>'; continue; }
        var ra = a.acc/a.app, rb = b.acc/b.app, diff = ra - rb, sig = info.sig;
        var cls = sig ? "up" : "ns";   // all significant = red; the +/- value shows direction
        var val = pp ? ((diff >= 0 ? "+" : "") + (diff*100).toFixed(1)) : (ra/rb).toFixed(2);
        var tip = SES_Q[r].short + " vs " + SES_Q[c].short + ": " +
          (pp ? val + " pp" : val + "x") + ", " + (sig ? "significant" : "not significant");
        h += '<td class="' + cls + '" title="' + tip + '">' + val + "</td>";
      }
      h += "</tr>";
    }
    h += "</table>";
    h += '<div class="matrix-legend"><span class="k up"></span>significant difference' +
      ' (sign shows which quintile is higher)<span class="k ns"></span>not significant</div>';
    document.getElementById("matrix").innerHTML = h;
  }

  // ==========================================================================
  // ERA VIEW: pre-DEI (2015-2019) vs DEI (2021-2024). 2020 is the changeover
  // year, in neither pool. The change is tested on PER-YEAR values with a Welch
  // t-test (rule 12), BH-corrected across the displayed groups. Each era's
  // displayed value is the mean per-year quantity with a 95% t-interval (rule 6b).
  // ==========================================================================
  var PRE_DEI = window.COUNTS.meta.eras.pre_dei || [2015,2016,2017,2018,2019];
  var DEI_Y   = window.COUNTS.meta.eras.dei || [2021,2022,2023,2024];

  // per-year quantity for a member: acceptance rate (%) or gap vs reference (pp)
  function perYearQ(ch, mb, refGroup, year, mode) {
    var pl = poolMember(ch, mb, [year]);
    if (!pl.app) return null;
    var rate = pl.acc / pl.app;
    if (mode === "rate") return rate * 100;
    var rp = Stats.poolGroup(refGroup, [year]);
    if (!rp.app) return null;
    return (rate - rp.acc / rp.app) * 100;
  }

  function computeEra() {
    var ch = state.characteristic, cfg = FORESTS[ch], mode = state.eraMode;
    var refGroup = getGroup(ch, cfg.ref);
    var members = cfg.members.slice();
    if (mode === "rate") members = [cfg.ref].concat(members); // include reference
    var rows = members.map(function (mb) {
      var label = memberLabel(mb), pre = [], dei = [];
      PRE_DEI.forEach(function (y) { var v = perYearQ(ch, mb, refGroup, y, mode); if (v != null) pre.push(v); });
      DEI_Y.forEach(function (y) { var v = perYearQ(ch, mb, refGroup, y, mode); if (v != null) dei.push(v); });
      var preStat = Stats.tInterval(pre), deiStat = Stats.tInterval(dei);
      var tt = Stats.ttestWelch(dei, pre);
      return { group: label, isRef: (mode === "rate" && label === cfg.ref),
        pre: preStat, dei: deiStat,
        change: (deiStat.mean != null && preStat.mean != null) ? deiStat.mean - preStat.mean : null,
        raw_p: tt.p, testable: tt.p != null };
    });
    var ps = rows.map(function (r) { return r.testable ? r.raw_p : null; });
    var bh = Stats.bhWiden(ps);
    rows.forEach(function (r, k) { r.p_bh = bh[k].pBh; r.sig = !!bh[k].sig; });
    return { mode: mode, m: bh.m, ref: cfg.ref, rows: rows };
  }

  function eraColor(r) {
    if (!r.testable || !r.sig) return { fill: BG, line: NOSIG, w: 1.6 };
    return { fill: RED, line: RED, w: 0 };   // all significant = red; direction shown by the arrow
  }

  function renderEra() {
    var res = computeEra(), mode = res.mode, pp = mode === "vsref";
    var rows = res.rows.filter(function (r) { return r.pre.mean != null && r.dei.mean != null; });
    rows.sort(function (a, b) { return b.dei.mean - a.dei.mean; });
    var ys = rows.map(function (r) { return r.group; });
    var unit = pp ? " pp" : "%";

    var idx = rows.map(function (_, i) { return i; });

    function hov(r, era) {
      var s = era === "pre" ? r.pre : r.dei;
      var t = r.group + "<br>" + (era === "pre" ? "pre-DEI" : "DEI") + " mean " +
        s.mean.toFixed(1) + unit + " (" + s.n + " yrs)";
      if (s.lo != null) t += "<br>95% t-interval " + s.lo.toFixed(1) + " to " + s.hi.toFixed(1);
      if (era === "dei") {
        t += "<br>change " + (r.change >= 0 ? "+" : "") + r.change.toFixed(1) + " pp";
        t += r.testable ? ("<br>" + (r.sig ? "significant" : "not significant") +
          " (p_bh " + r.p_bh.toFixed(3) + ")") : "<br>not testable (too few years)";
      }
      return t;
    }
    // faint origin dot at the pre-DEI value
    var preTrace = { x: rows.map(function (r) { return r.pre.mean; }), y: idx, type: "scatter",
      mode: "markers", showlegend: false,
      marker: { size: 6, color: "#c3b69d", line: { color: "#a99e86", width: 1 } },
      hovertemplate: "%{text}<extra></extra>", text: rows.map(function (r) { return hov(r, "pre"); }) };
    // invisible hit-area at the DEI value for hover (the arrowhead is the visual)
    var deiTrace = { x: rows.map(function (r) { return r.dei.mean; }), y: idx, type: "scatter",
      mode: "markers", showlegend: false,
      marker: { size: 16, color: "rgba(0,0,0,0)" },
      hovertemplate: "%{text}<extra></extra>", text: rows.map(function (r) { return hov(r, "dei"); }) };

    // one arrow per group: pre-DEI -> DEI, coloured only when significant
    var arrows = rows.map(function (r, i) {
      var sig = r.testable && r.sig;
      var col = sig ? RED : "#bdb29a";   // red when significant; direction is the arrow
      return { x: r.dei.mean, y: i, ax: r.pre.mean, ay: i,
        xref: "x", yref: "y", axref: "x", ayref: "y",
        showarrow: true, arrowhead: 3, arrowsize: 1.2, arrowwidth: sig ? 3 : 1.6,
        arrowcolor: col, standoff: 5, startstandoff: 4 };
    });

    var xtitle = pp ? "Gap from " + res.ref + " (pp)" : "Acceptance rate (%)";
    var shapes = [];
    if (pp) shapes.push({ type: "line", xref: "x", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1,
      line: { color: "#7a6f5a", width: 1.4, dash: "dot" } });
    setEraHead(res);
    var height = Math.max(300, rows.length * 40 + 80);
    var layout = {
      paper_bgcolor: BG, plot_bgcolor: BG, height: height,
      font: { family: "Inter, system-ui, sans-serif", color: "#1a1a1a", size: 13 },
      margin: { t: 18, r: 30, b: 54, l: narrowView() ? 96 : 200 },
      xaxis: { title: xtitle, showgrid: true, gridcolor: GRID, zeroline: false,
        linecolor: AXISLINE, tickcolor: AXISLINE, ticksuffix: pp ? " pp" : "%" },
      yaxis: { tickvals: idx, ticktext: wrapLabels(ys), autorange: "reversed", showgrid: false,
        zeroline: false, linecolor: AXISLINE, tickcolor: AXISLINE, automargin: true, tickfont: tickFont() },
      hovermode: "closest", showlegend: false, shapes: shapes,
      annotations: arrows
    };
    Plotly.react("chart", [preTrace, deiTrace], lockZoom(layout), PLOT_CFG);
  }

  function drawForest(res) {
    var rows = res.rows.filter(function (r) {
      return r.computable && (state.measure === "pp"
        ? r.pp != null : (r.rr != null && r.rr_lo != null));
    });
    // order by pp (most above reference at top)
    rows.sort(function (a, b) { return a.pp - b.pp; });

    var pp = state.measure === "pp";
    var xs = rows.map(function (r) { return pp ? r.pp : r.rr; });
    var elo = rows.map(function (r) { return pp ? r.pp - r.pp_lo : r.rr - r.rr_lo; });
    var ehi = rows.map(function (r) { return pp ? r.pp_hi - r.pp : r.rr_hi - r.rr; });
    var ys = rows.map(function (r) { return r.group; });
    var ylab = wrapLabels(ys);

    var mColor = [], mLineColor = [], mLineW = [];
    rows.forEach(function (r) {
      if (res.kind === "descriptive") { mColor.push(DESC); mLineColor.push(DESC); mLineW.push(0); return; }
      if (isSig(res, r)) { mColor.push(RED); mLineColor.push(RED); mLineW.push(0); }   // all significant = red
      else { mColor.push(BG); mLineColor.push(NOSIG); mLineW.push(1.6); }              // not sig = hollow
    });

    var refWord = res.master ? "own reference" : res.ref;
    var text = rows.map(function (r) {
      var eff = pp ? (r.pp >= 0 ? "+" : "") + r.pp.toFixed(1) + " pp"
                   : r.rr.toFixed(2) + "x";
      var lo = pp ? r.pp_lo.toFixed(1) : r.rr_lo.toFixed(2);
      var hi = pp ? r.pp_hi.toFixed(1) : r.rr_hi.toFixed(2);
      var verdict = res.kind === "descriptive" ? "descriptive (no test)"
        : (isSig(res, r) ? "significant" : "not significant");
      var head = res.master
        ? r.group + " (" + (CHAR_LABELS[r.characteristic] || r.characteristic) + ")"
        : r.group;
      return head + "<br>" + eff + " vs " + refWord + "<br>interval " + lo +
        " to " + hi + "<br>n " + r.accepted + "/" + r.applicants + "<br>" + verdict;
    });

    var trace = { x:xs, y:ylab, type:"scatter", mode:"markers",
      marker:{ size:11, color:mColor, line:{ color:mLineColor, width:mLineW } },
      error_x:{ type:"data", symmetric:false, array:ehi, arrayminus:elo,
        color:"#8c8270", thickness:1.4, width:0 },
      hovertemplate:"%{text}<extra></extra>", text:text };

    // n labels down the right margin (hidden on phones, where they would clip;
    // the hover and the Table view still carry n)
    var nAnno = narrowView() ? [] : rows.map(function (r) {
      return { xref:"paper", x:1.005, xanchor:"left", yref:"y", y:r.group,
        text:r.accepted + "/" + r.applicants, showarrow:false,
        font:{ size:10, color:"#8c8270" } };
    });

    var nullX = pp ? 0 : 1;
    var xtitle = pp ? "Acceptance rate vs " + refWord + " (pp)"
                    : "Rate ratio vs " + refWord;
    setForestHead(res);
    var height = Math.max(300, rows.length * 40 + 80);
    var layout = {
      paper_bgcolor:BG, plot_bgcolor:BG, height:height,
      font:{ family:"Inter, system-ui, sans-serif", color:"#1a1a1a", size:13 },
      margin:{ t:18, r: narrowView() ? 30 : 70, b:54, l: narrowView() ? 96 : 200 },
      xaxis:{ title:xtitle, showgrid:true, gridcolor:GRID, zeroline:false,
        linecolor:AXISLINE, tickcolor:AXISLINE, tickformat: pp ? "+," : "",
        ticksuffix: pp ? " pp" : "" },
      yaxis:{ automargin:true, showgrid:false, zeroline:false, linecolor:AXISLINE,
        tickcolor:AXISLINE, categoryorder:"array", categoryarray:ylab, tickfont:tickFont() },
      hovermode:"closest", showlegend:false,
      shapes:[{ type:"line", x0:nullX, x1:nullX, yref:"paper", y0:0, y1:1,
        line:{ color:"#7a6f5a", width:1.4, dash:"dot" } }],
      annotations: nAnno
    };
    Plotly.react("chart", [trace], lockZoom(layout), PLOT_CFG);
  }

  // Shared title/subtitle for the forest and master views (chart and table).
  function setForestHead(res) {
    var pp = state.measure === "pp";
    var label = res.master ? "All groups" : CHAR_LABELS[state.characteristic];
    var refWord = res.master ? "own reference" : res.ref;
    var winLabel = state.yearFrom === state.yearTo ? ("" + state.yearFrom)
      : (state.yearFrom + " to " + state.yearTo);
    var measureWord = pp ? "in percentage points" : "as a rate ratio";
    var sub;
    if (res.master)
      sub = "Every group across the significance families vs its own reference, " + measureWord +
        ", " + winLabel + ". One Benjamini-Hochberg correction across all (m = " + res.m +
        "); significant differences are in red. Groups under 300 omitted.";
    else if (res.kind === "bh")
      sub = "Difference in acceptance rate vs " + res.ref + ", " + measureWord + ", " + winLabel +
        ". Significant after Benjamini-Hochberg (family m = " + res.m + ") is shown in red.";
    else if (res.kind === "single")
      sub = "Acceptance rate vs " + res.ref + ", " + measureWord + ", " + winLabel +
        ". Single pre-specified test, plain 95% interval.";
    else
      sub = "Difference vs " + res.ref + ", " + measureWord + ", " + winLabel +
        ". Descriptive only: no significance test for this characteristic.";
    if (state.characteristic === "AGE")
      sub += " Note: age gaps may reflect life stage or confounding, not unfair treatment.";
    setChartHead(label + ": acceptance vs " + refWord, sub);
  }
  // Small sortable-header helper shared by the chart-view tables.
  function sortTh(srt, label, col, left) {
    var active = srt.col === col, glyph = active ? (srt.dir > 0 ? "▲" : "▼") : "↕";
    return '<th data-sort="' + col + '"' + (left ? ' style="text-align:left"' : "") +
      ' title="Click to sort">' + label + '<span class="sarr' + (active ? " on" : "") +
      '">' + glyph + "</span></th>";
  }
  function fmtP(p) { return p == null ? "&mdash;" : p < 0.001 ? "&lt;0.001" : p.toFixed(3); }
  function sortRows(rows, srt, strCols) {
    if (!srt.col) return rows;
    return rows.slice().sort(function (a, b) {
      var sc = strCols.indexOf(srt.col) >= 0;
      var va = sc ? String(a[srt.col] || "").toLowerCase() : a[srt.col];
      var vb = sc ? String(b[srt.col] || "").toLowerCase() : b[srt.col];
      if (va == null) va = -Infinity; if (vb == null) vb = -Infinity;
      return va < vb ? -srt.dir : va > vb ? srt.dir : 0;
    });
  }
  function renderForestTable() {
    var res = isAllGroups() ? computeMaster(windowYears()) : computeForest(windowYears());
    setForestHead(res);
    var tbl = document.getElementById("table"), pp = state.measure === "pp", srt = state.forestSort;
    var hasSig = res.kind !== "descriptive", master = !!res.master;
    var rows = res.rows.filter(function (r) {
      return r.computable && (pp ? r.pp != null : (r.rr != null && r.rr_lo != null));
    }).map(function (r) {
      return { group: r.group, ch: r.characteristic ? (CHAR_LABELS[r.characteristic] || r.characteristic) : "",
        n: r.applicants, rate: r.rate, eff: pp ? r.pp : r.rr, lo: pp ? r.pp_lo : r.rr_lo,
        hi: pp ? r.pp_hi : r.rr_hi, sig: hasSig ? isSig(res, r) : false,
        p: r.p_bh != null ? r.p_bh : (r.raw_p != null ? r.raw_p : null) };
    });
    rows = sortRows(rows, srt, ["group", "ch"]);
    var effHdr = pp ? "vs ref (pp)" : "Rate ratio";
    var pHdr = res.kind === "single" ? "p" : "p (BH)";
    function eff(r) { return pp ? (r.eff >= 0 ? "+" : "") + r.eff.toFixed(1) : r.eff.toFixed(2); }
    function ci(r) { return pp ? r.lo.toFixed(1) + " to " + r.hi.toFixed(1) : r.lo.toFixed(2) + " to " + r.hi.toFixed(2); }
    var h = '<table class="datatable"><thead><tr>' + sortTh(srt, "Group", "group", true) +
      (master ? sortTh(srt, "Characteristic", "ch", true) : "") + sortTh(srt, "Applicants", "n") +
      sortTh(srt, "Rate", "rate") + sortTh(srt, effHdr, "eff") + "<th>95% CI</th>" +
      (hasSig ? sortTh(srt, pHdr, "p") : "") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var effCell = "<td" + (r.sig ? ' style="color:' + RED + ';font-weight:600"' : "") + ">" + eff(r) + "</td>";
      h += "<tr><td style='text-align:left'>" + r.group + "</td>" +
        (master ? "<td style='text-align:left'>" + r.ch + "</td>" : "") +
        "<td>" + r.n + "</td><td>" + r.rate.toFixed(1) + "%</td>" + effCell +
        "<td>" + ci(r) + "</td>" + (hasSig ? "<td>" + fmtP(r.p) + "</td>" : "") + "</tr>";
    });
    h += "</tbody></table>";
    if (!rows.length) h += '<p class="table-sub">No computable groups in this window.</p>';
    tbl.innerHTML = h;
  }
  // Shared title/subtitle for the era view (chart and table).
  function setEraHead(res) {
    var pp = res.mode === "vsref", label = CHAR_LABELS[state.characteristic];
    var sub = (pp ? "Per-year gap from " + res.ref : "Per-year acceptance rate") +
      ", averaged within each era, with the change tested on the per-year values (Welch t-test) " +
      "and Benjamini-Hochberg corrected (m = " + res.m + "); significant changes are in red. " +
      "2020 is the changeover year, in neither era.";
    setChartHead(label + ": pre-DEI vs DEI", sub);
  }
  function renderEraTable() {
    var res = computeEra(), pp = res.mode === "vsref", unit = pp ? " pp" : "%";
    setEraHead(res);
    var tbl = document.getElementById("table"), srt = state.eraSort;
    var rows = res.rows.filter(function (r) { return r.pre.mean != null && r.dei.mean != null; })
      .map(function (r) {
        return { group: r.group, pre: r.pre.mean, dei: r.dei.mean, change: r.change,
          sig: r.testable && r.sig, p: r.testable ? r.p_bh : null };
      });
    rows = sortRows(rows, srt, ["group"]);
    function v(x) { return x == null ? "&mdash;" : x.toFixed(1) + unit; }
    var h = '<table class="datatable"><thead><tr>' + sortTh(srt, "Group", "group", true) +
      sortTh(srt, "Pre-DEI", "pre") + sortTh(srt, "DEI", "dei") + sortTh(srt, "Change", "change") +
      sortTh(srt, "p (BH)", "p") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var chCell = "<td" + (r.sig ? ' style="color:' + RED + ';font-weight:600"' : "") + ">" +
        (r.change == null ? "&mdash;" : (r.change >= 0 ? "+" : "") + r.change.toFixed(1) + " pp") + "</td>";
      h += "<tr><td style='text-align:left'>" + r.group + "</td><td>" + v(r.pre) + "</td><td>" +
        v(r.dei) + "</td>" + chCell + "<td>" + fmtP(r.p) + "</td></tr>";
    });
    h += "</tbody></table>";
    if (!rows.length) h += '<p class="table-sub">No groups with both eras in this view.</p>';
    tbl.innerHTML = h;
  }

  // ==========================================================================
  // REPRESENTATIVENESS: applicant/accepted composition vs the 2021 Census.
  // Buckets map our (PNTS-excluded) groups onto the Census comparison categories.
  // ==========================================================================
  var REP = {
    // Broad ethnicity uses the published broad totals directly (consistent with the
    // rate views), not a sum of detailed sub-groups.
    "ETHNIC GROUP (BROAD)": { census:"ETHNIC GROUP (BROAD)", source:"ETHNIC GROUP (BROAD)", buckets:{
      "White":["White"], "Asian":["Asian"], "Black":["Black"], "Mixed":["Mixed"], "Other":["Other"] } },
    "ETHNICITY": { census:"ETHNICITY", source:"ETHNICITY", buckets:{
      "White British":["British English","British Scottish","British Welsh"],
      "White Irish":["Irish"], "Other White":["Other White background","Other British (white)"],
      "Indian":["Indian"], "Pakistani":["Pakistani"], "Bangladeshi":["Bangladeshi"], "Chinese":["Chinese"],
      "Other Asian":["Other Asian background"], "Black African":["African"],
      "Black Caribbean":["Caribbean"], "Other Black":["Other Black background"],
      "Mixed":["Mixed (all)"], "Middle Eastern (Arab)":["Middle Eastern/North African"],
      "Other":["Other ethnic background"] } },
    "RELIGION": { census:"RELIGION", source:"RELIGION", buckets:{
      "No religion":["No religion"], "Christian":["Christian (all)"], "Muslim":["Muslim"],
      "Hindu":["Hindu"], "Sikh":["Sikh"], "Jewish":["Jewish"], "Buddhist":["Buddhist"],
      "Other religion":["Other religion"] } },
    "SEXUAL ORIENTATION": { census:"SEXUAL ORIENTATION", source:"SEXUAL ORIENTATION", buckets:{
      "Heterosexual":["Heterosexual/straight"], "Gay or Lesbian":["Gay man","Gay woman/lesbian"],
      "Bisexual":["Bisexual"], "Other":["Other sexual orientation"] } },
    "GENDER": { census:"GENDER", source:"GENDER", buckets:{ "Female":["Female"], "Male":["Male"] } },
    "DISABILITY": { census:"DISABILITY", source:"DISABILITY", buckets:{
      "No disability":["No disability"], "Any disability":"__REST__" } },
    "SOCIO-ECONOMIC BACKGROUND": { census:"SOCIO-ECONOMIC BACKGROUND", source:"SOCIO-ECONOMIC BACKGROUND", buckets:{
      "Quintile 1 (lowest)":["Quintile 1 (lowest participation rate in HE)"],
      "Quintile 2":["Quintile 2"], "Quintile 3":["Quintile 3"], "Quintile 4":["Quintile 4"],
      "Quintile 5 (highest)":["Quintile 5 (highest participation rate in HE)"] } }
  };
  function repYears() { var ys=[]; for (var y=state.repYearFrom; y<=state.repYearTo; y++) ys.push(y); return ys; }
  function computeRep() {
    var ch = state.characteristic, cfg = REP[ch]; if (!cfg) return null;
    var census = window.CENSUS[cfg.census], cats = Object.keys(census), years = repYears();
    var claimed = {};
    cats.forEach(function (c) { if (cfg.buckets[c] !== "__REST__")
      (cfg.buckets[c] || []).forEach(function (g) { claimed[g] = 1; }); });
    function srcOf(cat) {
      if (cfg.buckets[cat] === "__REST__")
        return (byChar[cfg.source] || []).map(function (g) { return g.group; })
          .filter(function (g) { return !claimed[g]; });
      return cfg.buckets[cat] || [];
    }
    var rows = cats.map(function (cat) {
      var app = 0, acc = 0;
      srcOf(cat).forEach(function (gn) {
        var g = getGroup(cfg.source, gn); if (!g) return;
        var p = Stats.poolGroup(g, years); app += p.app; acc += p.acc;
      });
      return { cat: cat, pop: census[cat], app_n: app, acc_n: acc };
    });
    var appTot = rows.reduce(function (s, r) { return s + r.app_n; }, 0);
    var accTot = rows.reduce(function (s, r) { return s + r.acc_n; }, 0);
    // Per-pool benchmark. By default applicants and accepted share one Census
    // figure; for disability it is AGE-ADJUSTED to each pool's age profile.
    var perPool = null;
    if (ch === "DISABILITY") {
      var e = ageAdjustedDisability(years);
      if (e.app != null && e.acc != null) perPool = {
        "Any disability": { app: e.app, acc: e.acc },
        "No disability": { app: 100 - e.app, acc: 100 - e.acc }
      };
    }
    rows.forEach(function (r) {
      r.appPct = appTot ? 100 * r.app_n / appTot : 0;
      r.accPct = accTot ? 100 * r.acc_n / accTot : 0;
      if (perPool && perPool[r.cat]) { r.popApp = perPool[r.cat].app; r.popAcc = perPool[r.cat].acc; }
      else { r.popApp = r.pop; r.popAcc = r.pop; }
    });
    return { cats: cats, rows: rows, appTot: appTot, accTot: accTot, ageAdjusted: !!perPool };
  }
  // Age-matched expected disability rate (indirect standardisation): the Census
  // age-specific rates re-weighted by the pool's own age distribution.
  function ageAdjustedDisability(years) {
    var R = window.CENSUS_DISABILITY_BY_AGE, appE = 0, appN = 0, accE = 0, accN = 0;
    Object.keys(R).forEach(function (band) {
      var g = getGroup("AGE", band); if (!g) return;
      var p = Stats.poolGroup(g, years);
      appE += p.app * R[band]; appN += p.app;
      accE += p.acc * R[band]; accN += p.acc;
    });
    return { app: appN ? appE / appN : null, acc: accN ? accE / accN : null };
  }
  // Benchmark labels per characteristic, shared by the chart and the table.
  function repBench(ch) {
    if (ch === "DISABILITY") return {
      benchLabel: "age-adjusted population share (England &amp; Wales, Census 2021)",
      annoLabel: "Age-adjusted population (Census 2021)", popWord: "age-adjusted population",
      colHdr: "Age-adj. pop. %" };
    if (ch === "SOCIO-ECONOMIC BACKGROUND") return {
      benchLabel: "equal-fifths benchmark of 20% per quintile",
      annoLabel: "Equal fifths (20%)", popWord: "equal share", colHdr: "Equal share %" };
    return {
      benchLabel: "population share (England &amp; Wales, Census 2021)",
      annoLabel: "Population (Census 2021)", popWord: "population", colHdr: "Population %" };
  }
  function setRepHead() {
    var ch = state.characteristic, label = CHAR_LABELS[ch].replace(" (detailed)", "");
    setChartHead(label + ": over- and under-representation",
      "Applicant and accepted shares as the difference from the " + repBench(ch).benchLabel + ", " +
      state.repYearFrom + " to " + state.repYearTo + ".");
  }
  function repNoBench() {
    setChartHead(CHAR_LABELS[state.characteristic] + ": no benchmark",
      "Representativeness is available where there is a population benchmark: ethnicity " +
      "(broad and detailed), religion, sexual orientation, sex, disability, and socio-economic " +
      "background. Pick one of those.");
  }
  function renderRepTable() {
    var res = computeRep(), tbl = document.getElementById("table");
    if (!res) { repNoBench(); tbl.innerHTML = ""; return; }
    setRepHead();
    var b = repBench(state.characteristic), srt = state.repSort;
    var rows = res.rows.map(function (r) {
      return { cat: r.cat, bench: r.popApp, app: r.appPct, appdev: r.appPct - r.popApp,
        acc: r.accPct, accdev: r.accPct - r.popAcc };
    });
    if (srt.col) rows.sort(function (a, c) {
      var va = srt.col === "group" ? a.cat.toLowerCase() : a[srt.col];
      var vb = srt.col === "group" ? c.cat.toLowerCase() : c[srt.col];
      return va < vb ? -srt.dir : va > vb ? srt.dir : 0;
    });
    function th(label, col, left) {
      var active = srt.col === col, glyph = active ? (srt.dir > 0 ? "▲" : "▼") : "↕";
      return '<th data-sort="' + col + '"' + (left ? ' style="text-align:left"' : "") +
        ' title="Click to sort">' + label + '<span class="sarr' + (active ? " on" : "") +
        '">' + glyph + "</span></th>";
    }
    function pp(x) { return (x >= 0 ? "+" : "") + x.toFixed(1) + " pp"; }
    var h = '<table class="datatable"><thead><tr>' + th("Group", "group", true) +
      th(b.colHdr, "bench") + th("Applicants %", "app") + th("Applicants vs benchmark", "appdev") +
      th("Accepted %", "acc") + th("Accepted vs benchmark", "accdev") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr><td style='text-align:left'>" + r.cat + "</td><td>" + r.bench.toFixed(1) +
        "</td><td>" + r.app.toFixed(1) + "</td><td>" + pp(r.appdev) +
        "</td><td>" + r.acc.toFixed(1) + "</td><td>" + pp(r.accdev) + "</td></tr>";
    });
    h += "</tbody></table>";
    tbl.innerHTML = h;
  }
  function renderRep() {
    var res = computeRep();
    if (!res) { repNoBench(); Plotly.purge("chart"); return; }
    var ys = res.cats, rows = res.rows, ch = state.characteristic;
    var b = repBench(ch), annoLabel = b.annoLabel, popWord = b.popWord;
    var appShare = rows.map(function (r) { return r.appPct; });
    var accShare = rows.map(function (r) { return r.accPct; });
    var appDev = rows.map(function (r) { return r.appPct - r.popApp; });
    var accDev = rows.map(function (r) { return r.accPct - r.popAcc; });
    function tx(stage, share, popKey) {
      return rows.map(function (r, i) {
        var pop = r[popKey], dev = share[i] - pop, ratio = pop > 0 ? share[i] / pop : null;
        return r.cat + "<br>" + stage + " " + share[i].toFixed(1) + "% vs " + popWord + " " +
          pop.toFixed(1) + "%<br>" + (dev >= 0 ? "+" : "") + dev.toFixed(1) + " pp" +
          (ratio != null ? " (" + ratio.toFixed(2) + "x)" : "");
      });
    }
    var ylab = wrapLabels(ys);
    var traces = [
      { y: ylab, x: appDev, name: "Applicants", type: "bar", orientation: "h",
        marker: { color: BLUE }, textposition: "none",
        hovertemplate: "%{text}<extra></extra>", text: tx("Applicants", appShare, "popApp") },
      { y: ylab, x: accDev, name: "Accepted", type: "bar", orientation: "h",
        marker: { color: RED }, textposition: "none",
        hovertemplate: "%{text}<extra></extra>", text: tx("Accepted", accShare, "popAcc") }
    ];
    setRepHead();
    var height = Math.max(300, ys.length * 64 + 60);
    var layout = {
      paper_bgcolor: BG, plot_bgcolor: BG, height: height,
      font: { family: "Inter, system-ui, sans-serif", color: "#1a1a1a", size: 13 },
      margin: { t: 26, r: 26, b: 56, l: narrowView() ? 90 : 168 }, barmode: "group", bargap: 0.4, bargroupgap: 0.12,
      xaxis: { ticksuffix: " pp", tickformat: "+,", showgrid: true, gridcolor: GRID,
        zeroline: false, linecolor: AXISLINE, tickcolor: AXISLINE },
      yaxis: { automargin: true, autorange: "reversed", showgrid: false, zeroline: false,
        linecolor: AXISLINE, tickcolor: AXISLINE, tickfont: tickFont() },
      legend: { orientation: "h", y: -0.18, bgcolor: "rgba(0,0,0,0)", font: { size: 12 } },
      hovermode: "closest",
      shapes: [{ type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1,
        line: { color: "#7a6f5a", width: 1.4, dash: "dot" } }],
      annotations: [{ x: 0, xref: "x", y: 1.0, yref: "paper", yanchor: "bottom",
        xanchor: "center", text: annoLabel,
        showarrow: false, font: { size: 10, color: "#8a7d64" } }]
    };
    Plotly.react("chart", traces, lockZoom(layout), PLOT_CFG);
  }

  // ==========================================================================
  // Controls
  // ==========================================================================
  // ==========================================================================
  // TABLE VIEW: the underlying numbers for selected categories and years, with
  // suppression shown honestly. Shared row builder feeds both the HTML and CSV.
  // ==========================================================================
  function tableRows() {
    var ch = state.characteristic, out = [], years = [];
    for (var y = state.tableYearFrom; y <= state.tableYearTo; y++) years.push(y);
    var pooled = state.tableMode === "pooled";
    (byChar[ch] || []).forEach(function (g) {
      if (!state.tableSelected[g.group]) return;
      var byYear = {}; g.by_year.forEach(function (r) { byYear[r.year] = r; });
      if (pooled) {
        var pl = Stats.poolGroup(g, years), supp = 0;
        years.forEach(function (y) { var r = byYear[y]; if (r && r.accepted == null) supp++; });
        var row = { category: g.group, yearsPooled: pl.nYears, nSupp: supp, applicants: pl.app };
        if (pl.app === 0) { row.accepted = null; row.rate = row.lo = row.hi = null; row.suppressed = true; }
        else { var w = Stats.wilsonCI(pl.acc, pl.app);
          row.accepted = pl.acc; row.rate = w.rate*100; row.lo = w.lo*100; row.hi = w.hi*100; row.suppressed = false; }
        out.push(row);
      } else {
        years.forEach(function (y) {
          var r = byYear[y]; if (!r) return;
          var acc = r.accepted, rate = null, lo = null, hi = null;
          if (acc != null) { var w = Stats.wilsonCI(acc, r.applicants);
            rate = w.rate*100; lo = w.lo*100; hi = w.hi*100; }
          out.push({ category: g.group, year: y, applicants: r.applicants,
            accepted: acc, rate: rate, lo: lo, hi: hi, suppressed: acc == null });
        });
      }
    });
    return out;
  }

  // The "All applicants" reference total: the sum of the characteristic's partition
  // groups (its non-constructed leaves; or the constructed broad groups when there
  // are no leaves, as for broad ethnicity). Suppressed group-years are dropped from
  // both applicants and acceptances (rule 4), exactly like the per-group pool. The
  // merged age/disability residual rows only hold the years the split rows lack, so
  // summing the leaves never double-counts within a year.
  function partitionGroups(ch) {
    var gs = byChar[ch] || [], leaves = gs.filter(function (g) { return !g.constructed; });
    return leaves.length ? leaves : gs.slice();
  }
  function allRows() {
    var ch = state.characteristic, parts = partitionGroups(ch), years = [];
    for (var y = state.tableYearFrom; y <= state.tableYearTo; y++) years.push(y);
    var byYearOf = parts.map(function (g) {
      var m = {}; g.by_year.forEach(function (r) { m[r.year] = r; }); return m;
    });
    function yearTotal(yr) {
      var app = 0, acc = 0, present = false;
      byYearOf.forEach(function (m) {
        var r = m[yr]; if (r && r.accepted != null) { app += r.applicants; acc += r.accepted; present = true; }
      });
      return present ? { app: app, acc: acc } : null;
    }
    if (state.tableMode === "pooled") {
      var app = 0, acc = 0, ny = 0;
      years.forEach(function (yr) { var t = yearTotal(yr); if (t) { app += t.app; acc += t.acc; ny++; } });
      var row = { category: "All applicants", isAll: true, applicants: app, yearsPooled: ny, nSupp: 0 };
      if (app === 0) { row.accepted = null; row.rate = row.lo = row.hi = null; row.suppressed = true; }
      else { var w = Stats.wilsonCI(acc, app);
        row.accepted = acc; row.rate = w.rate * 100; row.lo = w.lo * 100; row.hi = w.hi * 100; row.suppressed = false; }
      return [row];
    }
    return years.map(function (yr) {
      var t = yearTotal(yr); if (!t) return null;
      var w = Stats.wilsonCI(t.acc, t.app);
      return { category: "All applicants", isAll: true, year: yr, applicants: t.app, accepted: t.acc,
        rate: w.rate * 100, lo: w.lo * 100, hi: w.hi * 100, suppressed: false };
    }).filter(Boolean);
  }

  var CONSTRUCTED = { "Mixed (all)":1, "Christian (all)":1, "40+ years":1 };
  // Groups whose series is incomplete because some years were only reported
  // inside a now-excluded merged residual row (the Baha'i/Jain religion merges).
  var INCOMPLETE = {
    "Jewish": "2015 only reported in an excluded merged row",
    "Buddhist": "2020-21 only reported in an excluded merged row",
    "Other religion": "2023-24 only reported in an excluded merged row"
  };
  function fmtRate(r) { return r.rate == null ? "&mdash;" : r.rate.toFixed(1) + "%"; }
  function fmtCI(r) { return r.lo == null ? "&mdash;" : r.lo.toFixed(1) + " to " + r.hi.toFixed(1); }
  function fmtAcc(r) { return r.suppressed ? '<span class="supp">suppressed</span>' : r.accepted; }

  function tableSortVal(r, col) {
    switch (col) {
      case "category": return r.category.toLowerCase();
      case "year": return r.year;
      case "applicants": return r.applicants;
      case "accepted": return r.suppressed ? -Infinity : r.accepted;
      case "rate": return r.rate == null ? -Infinity : r.rate;
      case "ci": return r.lo == null ? -Infinity : r.lo;
      case "years": return r.yearsPooled == null ? -Infinity : r.yearsPooled;
      default: return 0;
    }
  }
  function renderTable() {
    var pooled = state.tableMode === "pooled", rows = tableRows();
    var srt = state.tableSort;
    if (srt.col) rows = rows.slice().sort(function (a, b) {
      var va = tableSortVal(a, srt.col), vb = tableSortVal(b, srt.col);
      return va < vb ? -srt.dir : va > vb ? srt.dir : 0;
    });
    var range = state.tableYearFrom + " to " + state.tableYearTo;
    var h = '<div class="table-title">' + CHAR_LABELS[state.characteristic] + ': data table</div>';
    h += '<div class="table-sub">' + (pooled
      ? "Applicants, accepted, and acceptance rate POOLED over " + range + ", with 95% Wilson " +
        "interval. Suppressed years are excluded from the pool (a suppressed year contributes neither applicants nor acceptances)."
      : "Applicants, accepted, and acceptance rate per year, " + range + ", with 95% Wilson " +
        "interval. A suppressed acceptance is too small to report; it is not zero.") +
      " The highlighted All applicants row is the overall total across the characteristic's " +
      "groups, as a reference. * = constructed aggregate. Click a column heading to sort.</div>";
    function thc(label, col) {
      var active = srt.col === col;
      var glyph = active ? (srt.dir > 0 ? "▲" : "▼") : "↕";
      return '<th data-sort="' + col + '" title="Click to sort">' + label +
        '<span class="sarr' + (active ? " on" : "") + '">' + glyph + "</span></th>";
    }
    function rowHtml(r) {
      return "<tr" + (r.isAll ? ' class="allrow"' : "") + "><td>" + r.category +
        (CONSTRUCTED[r.category] ? " *" : "") + (INCOMPLETE[r.category] ? " †" : "") + "</td>" +
        (pooled ? "" : "<td>" + r.year + "</td>") +
        "<td>" + r.applicants + "</td><td>" + fmtAcc(r) + "</td><td>" + fmtRate(r) +
        "</td><td>" + fmtCI(r) + "</td>" +
        (pooled ? ("<td>" + (r.yearsPooled != null ? r.yearsPooled : "") +
          (r.nSupp ? " (" + r.nSupp + " suppressed)" : "") + "</td>") : "") +
        "</tr>";
    }
    h += '<table class="datatable"><thead><tr>' + thc("Category", "category") +
      (pooled ? "" : thc("Year", "year")) + thc("Applicants", "applicants") +
      thc("Accepted", "accepted") + thc("Rate", "rate") + thc("95% CI", "ci") +
      (pooled ? thc("Years pooled", "years") : "") + "</tr></thead><tbody>";
    if (rows.length) allRows().forEach(function (r) { h += rowHtml(r); });
    rows.forEach(function (r) { h += rowHtml(r); });
    h += "</tbody></table>";
    if (rows.some(function (r) { return INCOMPLETE[r.category]; }))
      h += '<p class="table-sub">&dagger; Incomplete series: some years were only reported in a merged residual row (now excluded), so they are not shown.</p>';
    if (rows.length === 0) h += '<p class="table-sub">No categories selected.</p>';
    document.getElementById("table").innerHTML = h;
  }

  function csvCell(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function downloadTableCSV() {
    var pooled = state.tableMode === "pooled", catRows = tableRows();
    var rows = catRows.length ? allRows().concat(catRows) : catRows;
    var header = pooled
      ? ["Characteristic","Category","Year_from","Year_to","Applicants","Accepted",
         "Rate_pct","CI_lo_pct","CI_hi_pct","Years_pooled","Years_suppressed"]
      : ["Characteristic","Category","Year","Applicants","Accepted","Rate_pct","CI_lo_pct","CI_hi_pct"];
    var lines = [header.join(",")];
    rows.forEach(function (r) {
      var base = [csvCell(CHAR_LABELS[state.characteristic]), csvCell(r.category)];
      var tail = [r.applicants, r.suppressed ? "suppressed" : r.accepted,
        r.rate == null ? "" : r.rate.toFixed(2), r.lo == null ? "" : r.lo.toFixed(2),
        r.hi == null ? "" : r.hi.toFixed(2)];
      if (pooled) lines.push(base.concat([state.tableYearFrom, state.tableYearTo], tail, [r.yearsPooled, r.nSupp]).join(","));
      else lines.push(base.concat([r.year], tail).join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url;
    a.download = "dclinpsy_" + state.characteristic.toLowerCase().replace(/\W+/g, "_") +
      "_" + state.tableYearFrom + "-" + state.tableYearTo + (pooled ? "_pooled" : "") + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function isSESPairwise() {
    return state.view === "forest" &&
      FORESTS[state.characteristic] && FORESTS[state.characteristic].type === "pairwise";
  }
  // HTML chart title/subtitle (wraps responsively; Plotly text annotations clip).
  function setChartHead(title, sub) {
    document.getElementById("chart-head").innerHTML =
      '<div class="chart-title">' + title + "</div>" +
      (sub ? '<div class="chart-sub">' + sub + "</div>" : "");
  }
  // Lock the charts: no click-drag zoom, scroll zoom, or double-click reset, but
  // keep hover tooltips. fixedrange on both axes is the bulletproof way.
  function lockZoom(layout) {
    layout.dragmode = false;
    ["xaxis", "yaxis"].forEach(function (k) { if (layout[k]) layout[k].fixedrange = true; });
    return layout;
  }
  var PLOT_CFG = { responsive: true, displayModeBar: false, scrollZoom: false, doubleClick: false };
  // Narrow viewport (phones): used to shrink the big left label margins so the plot
  // area is not crushed. Plotly automargin still keeps labels from being clipped.
  function narrowView() { return window.innerWidth < 640; }
  // Wrap a long category label across lines (<br>) so the left margin (which
  // auto-sizes to the widest label) does not eat the whole plot on a phone.
  function wrapLabel(s, n) {
    if (!s || s.length <= n) return s;
    // tokens = words with their trailing space/slash kept, so we break BEFORE a
    // word that would overflow the line (greedy word-wrap, no lookbehind).
    var raw = s.split(/([ /])/), tokens = [];
    for (var i = 0; i < raw.length; i += 2) tokens.push(raw[i] + (raw[i + 1] || ""));
    var lines = [], cur = "";
    tokens.forEach(function (t) {
      if (cur && (cur.length + t.length) > n) { lines.push(cur.replace(/\s+$/, "")); cur = t; }
      else cur += t;
    });
    if (cur) lines.push(cur.replace(/\s+$/, ""));
    return lines.join("<br>");
  }
  function wrapLabels(arr) { return narrowView() ? arr.map(function (s) { return wrapLabel(s, 14); }) : arr; }
  function tickFont() { return narrowView() ? { size: 10 } : undefined; }

  // ---- Download the current chart as a branded PNG --------------------------
  function escAnn(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function wrapAnn(s, n) {
    var words = String(s).split(" "), lines = [], cur = "";
    words.forEach(function (w) {
      if ((cur + " " + w).trim().length > n) { if (cur) lines.push(cur.trim()); cur = w; }
      else cur += " " + w;
    });
    if (cur.trim()) lines.push(cur.trim());
    return lines.join("<br>");
  }
  function slug(s) {
    return String(s || "chart").toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").slice(0, 60) || "chart";
  }
  function downloadChart() {
    var gd = document.getElementById("chart");
    if (!gd || !gd.data || !gd.data.length) return;
    var head = document.getElementById("chart-head");
    var title = (head.querySelector(".chart-title") || {}).textContent || "DClinPsy chart";
    var sub = (head.querySelector(".chart-sub") || {}).textContent || "";
    var W = 1120, srcH = (gd._fullLayout && gd._fullLayout.height) || 480, H = srcH + 152;
    var data = JSON.parse(JSON.stringify(gd.data));
    var layout = JSON.parse(JSON.stringify(gd.layout));
    var m = Object.assign({ t: 24, r: 26, b: 60, l: 64 }, layout.margin || {});
    m.t = 108; m.b = Math.max(m.b, 60) + 50;
    layout.margin = m; layout.width = W; layout.height = H;
    layout.paper_bgcolor = BG; layout.plot_bgcolor = BG;
    var foot = -(m.b - 20);
    layout.annotations = (layout.annotations || []).concat([
      { xref: "paper", x: 0, yref: "paper", y: 1, yanchor: "bottom", yshift: 72, xanchor: "left",
        showarrow: false, align: "left", text: "<b>" + escAnn(title) + "</b>",
        font: { size: 19, color: "#1c1a16", family: "Inter, sans-serif" } },
      { xref: "paper", x: 0, yref: "paper", y: 1, yanchor: "bottom", yshift: 22, xanchor: "left",
        showarrow: false, align: "left", text: wrapAnn(escAnn(sub), 118),
        font: { size: 11.5, color: MUTED, family: "Inter, sans-serif" } },
      { xref: "paper", x: 0, yref: "paper", y: 0, yanchor: "top", yshift: foot, xanchor: "left",
        showarrow: false, text: "DClinPsy Equal-Opportunities Explorer · Clearing House 2015-2024",
        font: { size: 10.5, color: "#a59c89", family: "Inter, sans-serif" } },
      { xref: "paper", x: 1, yref: "paper", y: 0, yanchor: "top", yshift: foot, xanchor: "right",
        showarrow: false, text: "noncogito.substack.com",
        font: { size: 11.5, color: RED, family: "Inter, sans-serif" } }
    ]);
    var tmp = document.createElement("div");
    tmp.style.cssText = "position:fixed;left:-99999px;top:0;width:" + W + "px;height:" + H + "px;";
    document.body.appendChild(tmp);
    function cleanup() { try { Plotly.purge(tmp); } catch (e) {} tmp.remove(); }
    Plotly.newPlot(tmp, data, layout, { displayModeBar: false, staticPlot: true })
      .then(function () { return Plotly.toImage(tmp, { format: "png", width: W, height: H, scale: 2 }); })
      .then(function (url) {
        var a = document.createElement("a");
        a.href = url; a.download = "dclinpsy-" + slug(title) + ".png";
        document.body.appendChild(a); a.click(); a.remove(); cleanup();
      }).catch(cleanup);
  }
  function render() {
    var about = document.getElementById("about"), wrap = document.getElementById("chartwrap");
    if (state.view === "about") {
      wrap.style.display = "none"; about.style.display = "block"; return;
    }
    wrap.style.display = ""; about.style.display = "none";
    var repTable = state.view === "rep" && state.repMode === "table";
    var forestTable = state.view === "forest" && state.forestMode === "table" && !isSESPairwise();
    var eraTable = state.view === "era" && state.eraView === "table";
    var dl = document.getElementById("dl-png");
    if (dl) dl.style.display =
      (state.view === "table" || isSESPairwise() || repTable || forestTable || eraTable)
        ? "none" : "inline-flex";
    // Hide the forest View toggle when the forest is the SES pairwise matrix (which
    // is itself a table), so the toggle never offers a redundant/empty mode.
    var fvc = document.getElementById("forest-view-ctl");
    if (fvc) fvc.style.display = (state.view === "forest" && isSESPairwise()) ? "none" : "";
    var chart = document.getElementById("chart"), matrix = document.getElementById("matrix"),
        table = document.getElementById("table");
    chart.style.display = "none"; matrix.style.display = "none"; table.style.display = "none";
    // chart-head is used by the Plotly chart views and the chart-view tables (which
    // have no title of their own); the data Table and SES matrix carry their own titles.
    document.getElementById("chart-head").style.display =
      (state.view === "table" || isSESPairwise()) ? "none" : "block";
    if (state.view === "table") { table.style.display = "block"; renderTable(); }
    else if (isSESPairwise()) { matrix.style.display = "block"; renderSESMatrix(); }
    else if (repTable) { table.style.display = "block"; renderRepTable(); }
    else if (forestTable) { table.style.display = "block"; renderForestTable(); }
    else if (eraTable) { table.style.display = "block"; renderEraTable(); }
    else {
      chart.style.display = "block";
      if (state.view === "trend") renderTrend();
      else if (state.view === "era") renderEra();
      else if (state.view === "rep") renderRep();
      else renderForest();
    }
    updateNote();
  }

  function updateNote() {
    var note = document.getElementById("chart-note");
    if (state.view === "table") {
      note.textContent = "Every selected category and year. A suppressed acceptance is withheld because the count is too small to report safely; it is never zero. Use Download CSV for the full data.";
      return;
    }
    note.textContent = state.view === "trend"
      ? ((state.trendMode === "vsref"
        ? "Each point is the group's gap from the reference that year, in pp, with a 95% interval. The dotted line is the reference (no gap). A year with no dot is a suppressed or missing count; the line bridges it rather than treating it as zero. Grey marks the DEI era."
        : "Each point is that group's acceptance rate for the year. Hover for n and the interval. A year with no dot is a suppressed or missing count, never a zero; the line bridges it. Grey marks the DEI era, from 2021.")
        + (state.smooth > 1 ? " Smoothing is on: each point pools the applicant and accepted counts over a " + state.smooth + "-year window centred on that year, so single-year spikes are damped (it is a sample-weighted average, not a mean of yearly rates)." : ""))
      : state.view === "rep"
        ? (function () {
          var isTbl = state.repMode === "table";
          var lead = isTbl ? "The table shows how far" : "Bars show how far";
          var dl = isTbl ? "" : " (dotted line)";
          var tail = isTbl ? "Each row lists the shares and the representation ratio."
            : "Hover for the shares and representation ratio.";
          if (state.characteristic === "DISABILITY")
            return lead + " the applicant and accepted disability shares sit above (+) or below (-) the age-adjusted population rate" + dl + ". Applicants are young and disability rises with age, so the whole-population rate (about 18%) misleads; instead the Census 2021 age-specific rates are re-weighted to each pool's age profile (indirect standardisation), giving an expected rate of about 12%. This adjusts for age, not the definition gap (Census day-to-day limitation vs self-reported conditions) or sex. " + tail;
          if (state.characteristic === "SOCIO-ECONOMIC BACKGROUND")
            return lead + " the applicant and accepted shares in each POLAR quintile sit above (+) or below (-) 20%" + dl + ". POLAR groups areas by the share of young people entering higher education, in equal fifths, so 20% per quintile is the representative baseline. Quintile 1 is the lowest-participation, most disadvantaged areas. It is an area-based proxy assigned from home postcode, not individual socio-economic status. " + tail;
          if (state.characteristic === "ETHNICITY")
            return lead + " each group's applicant and accepted share sits above (+) or below (-) its population share" + (isTbl ? " (Census 2021)" : " (dotted line, Census 2021)") + ". British English, Scottish and Welsh are combined as White British, which the Census does not split. " + tail;
          return lead + " each group's applicant and accepted share sits above (+) or below (-) its population share. " + (isTbl ? "The benchmark is the population (Census 2021). " : "The dotted line is the population (Census 2021). ") + tail;
        })()
      : state.view === "era"
        ? "Each group's pre-DEI and DEI value is the mean of its per-year rates (or gaps), with a 95% t-interval. The change between eras is tested on those per-year values (Welch t-test), corrected across the groups. 2020 is the changeover year, in neither era."
      : isSESPairwise()
          ? "Each cell is the acceptance-rate gap between two quintiles (row minus column), with one Benjamini-Hochberg correction across the 10 pairs. Hover a cell for the value and verdict."
      : isAllGroups()
          ? "Every group across the significance families, each vs its own reference, pooled under one Benjamini-Hochberg correction. A group can be significant here but not in its own family, because the pooled m differs (e.g. British Welsh). Under-300 groups omitted."
        : state.forestMode === "table"
          ? "Each row is the group's effect vs its reference, with its 95% interval and significance. Significant differences are in red. n is the pooled applicant count over the chosen years."
          : "Each point is the group's effect vs its reference, with its interval. The dotted line is no difference. Hover for detail. n is accepted/total pooled over the chosen years.";
  }

  function buildCharPicker() {
    var sel = document.getElementById("char-picker");
    var ovr = document.createElement("optgroup"); ovr.label = "Overview";
    var oAll = document.createElement("option");
    oAll.value = ALL_GROUPS; oAll.textContent = "All groups";
    if (state.characteristic === ALL_GROUPS) oAll.selected = true;
    ovr.appendChild(oAll); sel.appendChild(ovr);
    var grp = document.createElement("optgroup"); grp.label = "Characteristic";
    CHARS.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = CHAR_LABELS[c];
      if (c === state.characteristic) o.selected = true;
      grp.appendChild(o);
    });
    sel.appendChild(grp);
    sel.addEventListener("change", function () {
      state.characteristic = sel.value; state.selected = {};
      defaultSelection(); buildGroupList();
      state.tableSelected = {}; buildTableCatList();
      render();
    });
  }

  // Per-view dropdown gating: "All groups" only applies to Compare to reference;
  // characteristics with no Census benchmark are disabled on the rep tab.
  function updateCharOptions() {
    var rep = state.view === "rep", forest = state.view === "forest";
    Array.prototype.forEach.call(document.querySelectorAll("#char-picker option"),
      function (o) {
        if (o.value === ALL_GROUPS) o.disabled = !forest;
        else o.disabled = rep && !REP[o.value];
      });
  }

  // White ethnic groups, excluded from the default ethnicity selection so the
  // chart opens on the largest non-white minority groups (the focus of the tool).
  var WHITE_ETH = { "British English":1, "British Scottish":1, "British Welsh":1,
    "Irish":1, "Other White background":1, "Other British (white)":1 };
  function defaultSelection() {
    var ch = state.characteristic, ref = refFor(ch), hidden = trendHidden(ch);
    var groups = (byChar[ch] || []).filter(function (g) {
      return hidden.indexOf(g.group) === -1; });
    var pool = groups;
    if (ch === "ETHNICITY")
      pool = groups.filter(function (g) { return !WHITE_ETH[g.group] && !g.constructed; });
    else if (ch === "ETHNIC GROUP (BROAD)")
      pool = groups.filter(function (g) { return g.group !== "White"; });
    var totals = pool.map(function (g) {
      return { name:g.group, total:g.by_year.reduce(function (s, r) {
        return s + (r.applicants || 0); }, 0) };
    }).sort(function (a, b) { return b.total - a.total; });
    if (ref) state.selected[ref] = true;
    var added = 0;
    totals.forEach(function (t) {
      if (t.name !== ref && added < 3) { state.selected[t.name] = true; added++; }
    });
  }

  function buildGroupList() {
    var box = document.getElementById("group-list"); box.innerHTML = "";
    var ref = refFor(state.characteristic), hidden = trendHidden(state.characteristic);
    (byChar[state.characteristic] || []).forEach(function (g) {
      if (hidden.indexOf(g.group) !== -1) return;
      var lbl = document.createElement("label"); lbl.className = "grp";
      var cb = document.createElement("input"); cb.type = "checkbox";
      cb.checked = !!state.selected[g.group];
      cb.addEventListener("change", function () { state.selected[g.group] = cb.checked; render(); });
      lbl.appendChild(cb);
      var span = document.createElement("span");
      span.textContent = g.group + (g.group === ref ? " (reference)" : "") +
        (g.constructed ? " *" : "") + (INCOMPLETE[g.group] ? " †" : "");
      lbl.appendChild(span); box.appendChild(lbl);
    });
  }

  function buildYearControls() {
    var from = document.getElementById("year-from"), to = document.getElementById("year-to");
    ALL_YEARS.forEach(function (y) {
      var a = document.createElement("option"); a.value = y; a.textContent = y;
      if (y === state.yearFrom) a.selected = true; from.appendChild(a);
      var b = document.createElement("option"); b.value = y; b.textContent = y;
      if (y === state.yearTo) b.selected = true; to.appendChild(b);
    });
    from.addEventListener("change", function () {
      state.yearFrom = +from.value;
      if (state.yearFrom > state.yearTo) { state.yearTo = state.yearFrom; to.value = state.yearTo; }
      render();
    });
    to.addEventListener("change", function () {
      state.yearTo = +to.value;
      if (state.yearTo < state.yearFrom) { state.yearFrom = state.yearTo; from.value = state.yearFrom; }
      render();
    });
  }

  function buildTrendModeSeg() {
    var seg = document.getElementById("trendmode-seg");
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.trendMode = b.getAttribute("data-mode");
      seg.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === b); });
      render();
    });
    var sm = document.getElementById("smooth-seg");
    sm.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.smooth = +b.getAttribute("data-win");
      sm.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === b); });
      render();
    });
  }

  function buildTableCatList() {
    var box = document.getElementById("table-cat-list"); box.innerHTML = "";
    (byChar[state.characteristic] || []).forEach(function (g) {
      if (state.tableSelected[g.group] === undefined) state.tableSelected[g.group] = true;
      var lbl = document.createElement("label"); lbl.className = "grp";
      var cb = document.createElement("input"); cb.type = "checkbox";
      cb.checked = !!state.tableSelected[g.group];
      cb.addEventListener("change", function () { state.tableSelected[g.group] = cb.checked; render(); });
      lbl.appendChild(cb);
      var span = document.createElement("span");
      span.textContent = g.group + (g.constructed ? " *" : "") + (INCOMPLETE[g.group] ? " †" : "");
      lbl.appendChild(span); box.appendChild(lbl);
    });
  }
  function buildTableControls() {
    var from = document.getElementById("table-year-from"), to = document.getElementById("table-year-to");
    ALL_YEARS.forEach(function (y) {
      var a = document.createElement("option"); a.value = y; a.textContent = y;
      if (y === state.tableYearFrom) a.selected = true; from.appendChild(a);
      var b = document.createElement("option"); b.value = y; b.textContent = y;
      if (y === state.tableYearTo) b.selected = true; to.appendChild(b);
    });
    from.addEventListener("change", function () { state.tableYearFrom = +from.value;
      if (state.tableYearFrom > state.tableYearTo) { state.tableYearTo = state.tableYearFrom; to.value = state.tableYearTo; }
      render(); });
    to.addEventListener("change", function () { state.tableYearTo = +to.value;
      if (state.tableYearTo < state.tableYearFrom) { state.tableYearFrom = state.tableYearTo; from.value = state.tableYearFrom; }
      render(); });
    document.getElementById("table-csv").addEventListener("click", downloadTableCSV);
    var seg = document.getElementById("tablemode-seg");
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.tableMode = b.getAttribute("data-mode");
      seg.querySelectorAll(".seg-btn").forEach(function (x) { x.classList.toggle("active", x === b); });
      render();
    });
    // sort by clicking a column header (delegated; table is rebuilt each render)
    document.getElementById("table").addEventListener("click", function (e) {
      var th = e.target.closest("th[data-sort]"); if (!th) return;
      var col = th.getAttribute("data-sort");
      var srt = state.view === "rep" ? state.repSort
        : state.view === "era" ? state.eraSort
        : state.view === "forest" ? state.forestSort
        : state.tableSort;
      if (srt.col === col) srt.dir *= -1;
      else { srt.col = col; srt.dir = 1; }
      render();
    });
  }

  function buildRepControls() {
    var from = document.getElementById("rep-year-from"), to = document.getElementById("rep-year-to");
    ALL_YEARS.forEach(function (y) {
      var a = document.createElement("option"); a.value = y; a.textContent = y;
      if (y === state.repYearFrom) a.selected = true; from.appendChild(a);
      var b = document.createElement("option"); b.value = y; b.textContent = y;
      if (y === state.repYearTo) b.selected = true; to.appendChild(b);
    });
    from.addEventListener("change", function () { state.repYearFrom = +from.value;
      if (state.repYearFrom > state.repYearTo) { state.repYearTo = state.repYearFrom; to.value = state.repYearTo; }
      render(); });
    to.addEventListener("change", function () { state.repYearTo = +to.value;
      if (state.repYearTo < state.repYearFrom) { state.repYearFrom = state.repYearTo; from.value = state.repYearFrom; }
      render(); });
    document.getElementById("rep-legend").innerHTML =
      '<div><span class="swatch" style="background:' + BLUE + '"></span>Applicants</div>' +
      '<div><span class="swatch" style="background:' + RED + '"></span>Accepted</div>' +
      '<div style="margin-top:.35rem">Dotted line = the representative benchmark for the chosen ' +
      'characteristic. Bars right = over-represented, left = under-represented.</div>' +
      '<div style="margin-top:.4rem">Benchmarks: Census 2021 (England &amp; Wales, all ages) for ' +
      'ethnicity, religion, sexual orientation and sex; an age-adjusted rate for disability; and an ' +
      'equal 20% per quintile for socio-economic background (POLAR). All-ages benchmarks slightly ' +
      'understate representation for a young graduate pool. Shares exclude prefer-not-to-say.</div>';
    var seg = document.getElementById("repmode-seg");
    seg.addEventListener("click", function (e) {
      var btn = e.target.closest(".seg-btn"); if (!btn) return;
      state.repMode = btn.getAttribute("data-mode");
      seg.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === btn); });
      render();
    });
  }

  function buildEraSeg() {
    var seg = document.getElementById("eramode-seg");
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.eraMode = b.getAttribute("data-mode");
      seg.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === b); });
      render();
    });
    document.getElementById("era-legend").innerHTML =
      '<div><span class="swatch" style="background:#c3b69d;border:1px solid #a99e86"></span>pre-DEI start (2015-2019)</div>' +
      '<div style="margin-top:.4rem">Arrow points to the DEI value (2021-2024):</div>' +
      '<div><span class="swatch" style="background:' + RED + '"></span>significant change</div>' +
      '<div><span class="swatch" style="background:#bdb29a"></span>no significant change</div>' +
      '<div style="margin-top:.3rem">Tested on per-year values (t-test), BH-corrected across the groups shown.</div>';
  }

  function buildMeasureSeg() {
    var seg = document.getElementById("measure-seg");
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.measure = b.getAttribute("data-measure");
      seg.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === b); });
      render();
    });
  }

  function buildLegendKey() {
    document.getElementById("legendkey").innerHTML =
      '<div><span class="swatch" style="background:' + RED + '"></span>Significant (after correction)</div>' +
      '<div><span class="swatch" style="background:' + BG + ';border:1.6px solid ' + NOSIG + '"></span>Not significant</div>' +
      '<div style="margin-top:.3rem">Position shows the direction (above or below reference); colour shows significance after Benjamini-Hochberg within each characteristic.</div>';
  }

  // Switch characteristic and rebuild the dependent selections/lists.
  function switchCharacteristic(ch) {
    state.characteristic = ch;
    document.getElementById("char-picker").value = ch;
    state.selected = {}; defaultSelection(); buildGroupList();
    state.tableSelected = {}; buildTableCatList();
  }

  function buildTabs() {
    var tabs = document.getElementById("tabs");
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest(".tab"); if (!b) return;
      state.view = b.getAttribute("data-view");
      tabs.querySelectorAll(".tab").forEach(function (x) {
        x.classList.toggle("active", x === b); });
      document.getElementById("trend-controls").hidden = state.view !== "trend";
      document.getElementById("forest-controls").hidden = state.view !== "forest";
      document.getElementById("era-controls").hidden = state.view !== "era";
      document.getElementById("rep-controls").hidden = state.view !== "rep";
      document.getElementById("table-controls").hidden = state.view !== "table";
      document.getElementById("char-control").hidden = state.view === "about";
      // "All groups" is only valid on Compare to reference: fall back elsewhere.
      if (state.view !== "forest" && isAllGroups()) switchCharacteristic("ETHNICITY");
      // representativeness only supports characteristics with a Census benchmark
      if (state.view === "rep" && !REP[state.characteristic])
        switchCharacteristic("ETHNIC GROUP (BROAD)");
      updateCharOptions();
      render();
    });
  }

  function buildToggles() {
    function bindChip(id, key) {
      var b = document.getElementById(id);
      b.classList.toggle("on", !!state[key]);
      b.setAttribute("aria-pressed", state[key] ? "true" : "false");
      b.addEventListener("click", function () {
        state[key] = !state[key];
        b.classList.toggle("on", state[key]);
        b.setAttribute("aria-pressed", state[key] ? "true" : "false");
        render();
      });
    }
    bindChip("toggle-ci", "showCI");
    bindChip("toggle-combine", "combine");
  }

  // Chart/Table toggles for the forest+master views and the era view.
  function buildViewToggles() {
    [["forestmode-seg", "forestMode"], ["eraview-seg", "eraView"]].forEach(function (pair) {
      var seg = document.getElementById(pair[0]), key = pair[1];
      seg.addEventListener("click", function (e) {
        var b = e.target.closest(".seg-btn"); if (!b) return;
        state[key] = b.getAttribute("data-mode");
        seg.querySelectorAll(".seg-btn").forEach(function (x) {
          x.classList.toggle("active", x === b); });
        render();
      });
    });
  }

  // ---- Init -----------------------------------------------------------------
  buildTabs(); buildCharPicker(); defaultSelection(); buildGroupList();
  buildToggles(); buildTrendModeSeg(); buildEraSeg(); buildRepControls();
  buildYearControls(); buildMeasureSeg(); buildLegendKey();
  buildTableCatList(); buildTableControls(); buildViewToggles();
  document.getElementById("dl-png").addEventListener("click", downloadChart);
  updateCharOptions();
  render();
})();
