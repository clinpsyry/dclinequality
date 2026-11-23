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

  var META = window.COUNTS.meta;
  var ALL_YEARS = META.years || [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
  var FIRST_YEAR = ALL_YEARS[0], LATEST = META.latest_year || ALL_YEARS[ALL_YEARS.length - 1];
  var DEI_FROM = (META.eras.dei || [2021])[0], DEI_TO = (META.eras.dei || [2025]).slice(-1)[0];
  var REFS = META.references || {};

  // Sentinel "characteristics" for the two overview forests. They live in the
  // Compare groups view's dropdown only.
  //   ALL_GROUPS: the full forest (every group vs its own reference, one correction;
  //               the method of the published May 2026 chart, families.js).
  //   ALL_CONTEXT: every contextual-admissions question, 'Yes' vs 'No'.
  var ALL_GROUPS = "__ALL_GROUPS__", ALL_CONTEXT = "__ALL_CONTEXT__";
  function isAllGroups() { return state.characteristic === ALL_GROUPS; }
  function isAllContext() { return state.characteristic === ALL_CONTEXT; }
  function isOverview() { return isAllGroups() || isAllContext(); }
  function isContext(ch) { return /^CONTEXT: /.test(ch || state.characteristic); }

  var CHAR_LABELS = {
    "__ALL_GROUPS__":"All groups (full forest)",
    "__ALL_CONTEXT__":"All contextual questions",
    "OVERALL":"All applicants (overall)",
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
      "Other disability","Personal care support",
      // Wheelchair, Deaf and Blind are pooled with each other in the source, so
      // only their combined rate is knowable (built in R; RULES.md C8).
      "Wheelchair, deaf or blind (combined)"] },
    "RESIDENT": { type:"bh", ref:"UK", members:["Other EU/EEA","Other residence"] },
    "DEPENDANTS": { type:"bh", ref:"No dependants", members:["Has dependants"] }
  };
  // Contextual-admissions questions (2023 entry onwards): each is a single
  // pre-specified 'Yes' vs 'No' comparison; the overview corrects across all ten.
  (META.context_questions || []).forEach(function (q) {
    CHAR_LABELS[q] = q.replace(/^CONTEXT: /, "");
    FORESTS[q] = { type:"single", ref:"No", members:["Yes"] };
  });
  // The three source rows behind the combined disability group stay in the data
  // table but are hidden from the trend list (their rows are pooled artefacts).
  var POOLED_DISABILITY = ["Wheelchair user/mobility difficulties","Deaf/hearing impairment",
    "Blind/partially sighted"];

  // Colours (house style)
  // Blog chart style (R/dclinpsy_style.R): warm beige panel, FT red, blue for
  // "below reference" in the full forest, faded grey for no clear difference,
  // grey20 ink.
  var REF_COLOR = "#333333", BG = "#EADDCA", INK = "#333333";
  var RED = "#990F3D", BLUE = "#2D6CA2", DESC = "#6f6a5d", NOSIG = "#BCB3A4";
  var ACCENTS = ["#990F3D","#2D6CA2","#B07A2D","#4F7942","#7A3B69","#1A6B6B",
    "#A0522D","#41506B"];
  var AXISLINE = "#c9bca6", GRID = "#d9ccb6", MUTED = "#6f6757";
  // Phone layout (narrowView): 13 px tick labels, thicker marks, lighter
  // gridlines. The grid colour is GRID mixed halfway towards the panel BG, so
  // the lines stay in the palette but recede on a small screen.
  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = "#";
    [16, 8, 0].forEach(function (sh) {
      var ca = (pa >> sh) & 255, cb = (pb >> sh) & 255, c = Math.round(ca + (cb - ca) * t);
      out += (c < 16 ? "0" : "") + c.toString(16);
    });
    return out;
  }
  var GRID_PHONE = mixHex(GRID, BG, 0.5);
  var PH = { tick: 13, line: 3, marker: 8, ciThick: 1.6, faint: 1.3 };
  // Apply the phone tick size and light gridlines to every axis of a layout.
  function phoneAxes(layout) {
    if (!narrowView()) return layout;
    Object.keys(layout).forEach(function (k) {
      if (!/^[xy]axis\d*$/.test(k)) return;
      var ax = layout[k];
      ax.tickfont = Object.assign({}, ax.tickfont || {}, { size: PH.tick });
      if (ax.showgrid) ax.gridcolor = GRID_PHONE;
    });
    return layout;
  }

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
    "ETHNIC GROUP (BROAD)": ["Other"],
    "DISABILITY": POOLED_DISABILITY
  };
  function trendHidden(ch) {
    var agg = TREND_AGGREGATES[ch] ? TREND_AGGREGATES[ch].components : [];
    return agg.concat(TREND_HIDE[ch] || []);
  }

  // Compare groups opens on the latest year. The DEI era band is off until the
  // "DEI era" chip turns it on.
  var state = { view:"trend", characteristic:"ETHNIC GROUP (BROAD)", selected:{}, showCI:false,
    trendMode:"rate", trendMeasure:"pp", numShow:"both", numUnit:"count", repKind:"share", repPop:true, repStart:true, repSel:{}, trendFrom:FIRST_YEAR, trendTo:LATEST, eraMode:"rate",
    yearFrom:LATEST, yearTo:LATEST, measure:"pp",
    tableYearFrom:FIRST_YEAR, tableYearTo:LATEST, tableSelected:{}, tableMode:"pooled",
    tableSort:{ col:null, dir:1 }, repYearFrom:DEI_FROM, repYearTo:LATEST, repMode:"chart",
    repSort:{ col:null, dir:1 }, forestMode:"chart", forestSort:{ col:null, dir:1 },
    eraView:"chart", eraSort:{ col:null, dir:1 }, combine:false, sub:"",
    yCustom:false, yMin:"", yMax:"", showDEI:false, phoneMode:"auto", pngFormat:"phone", noteOpen:false, noteDeskOpen:false };

  // ---- pooled cells (RULES.md C8): flagged, not changed --------------------------
  // A row's acceptances may include hidden rows (pooled_with), or its own
  // acceptances may sit in another row (pooled_into). poolNote() describes any such
  // cell in the chosen years for a group, for hovers, labels and the footnote.
  function pooledCells(g, years) {
    var ys = {}; years.forEach(function (y) { ys[y] = 1; });
    var out = [];
    (g ? g.by_year : []).forEach(function (r) {
      if (!ys[r.year]) return;
      if (r.pooled_with) out.push({ year:r.year, with:[].concat(r.pooled_with) });
      if (r.pooled_into) out.push({ year:r.year, into:r.pooled_into });
    });
    return out;
  }
  function poolNote(cells) {
    return cells.map(function (c) {
      return c.year + ": " + (c.with ? "includes the acceptances of " + c.with.join(" + ")
        : "acceptances counted in the " + c.into + " row");
    }).join("; ");
  }
  var DAGGER = " †";

  // ==========================================================================
  // TREND VIEW
  // ==========================================================================
  var TRACE_STYLE = function (group, color, x, y, eHi, eLo, text) {
    var ph = narrowView();
    return { name: group.group, x:x, y:y, type:"scatter", mode:"lines+markers",
      connectgaps:true, line:{ color:color, width: ph ? PH.line : 2 }, marker:{ color:color, size: ph ? PH.marker : 6 },
      error_y: state.showCI ? { type:"data", symmetric:false, array:eHi,
        arrayminus:eLo, color:color, thickness: ph ? PH.ciThick : 1, width:3, opacity:0.55 }
        : { visible:false },
      hovertemplate:"%{text}<extra></extra>", text:text };
  };
  function traceFor(group, color) {
    var byYear = {};
    group.by_year.forEach(function (r) { byYear[r.year] = r; });
    var x = [], y = [], eHi = [], eLo = [], text = [];
    ALL_YEARS.forEach(function (yr) {
      if (yr < state.trendFrom || yr > state.trendTo) return;
      x.push(yr);
      var r = byYear[yr];
      if (!r || r.accepted == null || r.applicants === 0) {
        y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
      var acc = r.accepted, app = r.applicants;
      var ci = Stats.wilsonCI(acc, app), rate = ci.rate * 100;
      y.push(rate); eHi.push(ci.hi*100 - rate); eLo.push(rate - ci.lo*100);
      var pc = pooledCells(group, [yr]);
      text.push(group.group + "<br>" + yr + ": " + rate.toFixed(1) + "% (" +
        acc + "/" + app + ")<br>95% CI " + (ci.lo*100).toFixed(1) + " to " + (ci.hi*100).toFixed(1) +
        (pc.length ? "<br>† pooled in source: " + poolNote(pc).replace(/^\d{4}: /, "") : ""));
    });
    return TRACE_STYLE(group, color, x, y, eHi, eLo, text);
  }

  // Per-year contrast vs the reference group. rr=false: pp difference with a 95%
  // Newcombe interval. rr=true: rate ratio (group rate / reference rate) with a 95%
  // Katz-log interval. A gap if either group or reference is suppressed that year.
  function traceVsRef(group, refGroup, color, rr) {
    var gy = {}, ry = {};
    group.by_year.forEach(function (r) { gy[r.year] = r; });
    refGroup.by_year.forEach(function (r) { ry[r.year] = r; });
    var x = [], y = [], eHi = [], eLo = [], text = [];
    ALL_YEARS.forEach(function (yr) {
      if (yr < state.trendFrom || yr > state.trendTo) return;
      x.push(yr);
      var g = gy[yr], rf = ry[yr];
      if (!g || !rf || g.accepted == null || rf.accepted == null || !g.applicants || !rf.applicants) {
        y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
      var gAcc = g.accepted, gApp = g.applicants, rAcc = rf.accepted, rApp = rf.applicants;
      if (rr) {
        var R = Stats.rateRatioCI(gAcc, gApp, rAcc, rApp);
        if (R.value == null) { y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
        y.push(R.value); eHi.push(R.hi - R.value); eLo.push(R.value - R.lo);
        text.push(group.group + "<br>" + yr + ": " + R.value.toFixed(2) + "x " + refGroup.group +
          "<br>95% CI " + R.lo.toFixed(2) + " to " + R.hi.toFixed(2) + "<br>n " + gAcc + "/" + gApp);
        return;
      }
      var diff = (gAcc/gApp - rAcc/rApp) * 100;
      var ci = Stats.newcombeCI(gAcc, gApp, rAcc, rApp);
      var lo = ci[0]*100, hi = ci[1]*100;
      y.push(diff); eHi.push(hi - diff); eLo.push(diff - lo);
      text.push(group.group + "<br>" + yr + ": " + (diff>=0?"+":"") + diff.toFixed(1) +
        " pp vs " + refGroup.group + "<br>95% CI " + lo.toFixed(1) + " to " +
        hi.toFixed(1) + "<br>n " + gAcc + "/" + gApp);
    });
    return TRACE_STYLE(group, color, x, y, eHi, eLo, text);
  }

  // Combine the selected (non-reference) groups into ONE pooled series: counts are
  // summed across the groups, dropping suppressed cells (rule 4), then the same
  // Wilson (rate) or Newcombe-vs-reference (vsref) maths.
  function combinedTrace(groups, refGroup, vs, color, rr) {
    var maps = groups.map(function (g) {
      var m = {}; g.by_year.forEach(function (r) { m[r.year] = r; }); return m; });
    var rmap = {}; if (refGroup) refGroup.by_year.forEach(function (r) { rmap[r.year] = r; });
    var name = "Combined (" + groups.length + " group" + (groups.length === 1 ? "" : "s") + ")";
    var listed = groups.map(function (g) { return g.group; }).join(" + ");
    var x = [], y = [], eHi = [], eLo = [], text = [];
    ALL_YEARS.forEach(function (yr) {
      if (yr < state.trendFrom || yr > state.trendTo) return;
      x.push(yr);
      var acc = 0, app = 0, present = false;
      maps.forEach(function (m) { var r = m[yr];
        if (r && r.accepted != null) { acc += r.accepted; app += r.applicants; present = true; } });
      if (!vs) {
        if (!present || app === 0) { y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
        var ci = Stats.wilsonCI(acc, app), rate = ci.rate * 100;
        y.push(rate); eHi.push(ci.hi*100 - rate); eLo.push(rate - ci.lo*100);
        text.push(listed + "<br>" + yr + ": " + rate.toFixed(1) + "% (" + acc + "/" + app +
          ")<br>95% CI " + (ci.lo*100).toFixed(1) + " to " + (ci.hi*100).toFixed(1));
      } else {
        var rf = rmap[yr], rAcc = 0, rApp = 0, rPresent = false;
        if (rf && rf.accepted != null) { rAcc = rf.accepted; rApp = rf.applicants; rPresent = true; }
        if (!present || !app || !rPresent || !rApp) { y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
        if (rr) {
          var R = Stats.rateRatioCI(acc, app, rAcc, rApp);
          if (R.value == null) { y.push(null); eHi.push(0); eLo.push(0); text.push(""); return; }
          y.push(R.value); eHi.push(R.hi - R.value); eLo.push(R.value - R.lo);
          text.push(listed + "<br>" + yr + ": " + R.value.toFixed(2) + "x " + refGroup.group +
            "<br>95% CI " + R.lo.toFixed(2) + " to " + R.hi.toFixed(2) + "<br>n " + acc + "/" + app);
          return;
        }
        var diff = (acc/app - rAcc/rApp) * 100, nc = Stats.newcombeCI(acc, app, rAcc, rApp);
        var lo = nc[0]*100, hi = nc[1]*100;
        y.push(diff); eHi.push(hi - diff); eLo.push(diff - lo);
        text.push(listed + "<br>" + yr + ": " + (diff>=0?"+":"") + diff.toFixed(1) +
          " pp vs " + refGroup.group + "<br>95% CI " + lo.toFixed(1) + " to " + hi.toFixed(1) +
          "<br>n " + acc + "/" + app);
      }
    });
    return TRACE_STYLE({ group: name }, color, x, y, eHi, eLo, text);
  }

  // Phone layout for the line charts (Over time): each line is named at its last
  // point instead of a legend (labels nudged apart so they never overlap), no
  // rotated axis title (the unit is in the chart title), larger text.
  function phoneLines(layout, traces) {
    if (!narrowView()) return layout;
    var ys = [], labs = [];
    traces.forEach(function (t) { (t.y || []).forEach(function (v) { if (v != null) ys.push(v); }); });
    traces.forEach(function (t) {
      if (!t.name) return;
      var i = (t.y || []).length - 1; while (i >= 0 && t.y[i] == null) i--;
      if (i < 0) return;
      labs.push({ x: t.x[i], y: t.y[i], ly: t.y[i], text: t.name, color: (t.line && t.line.color) || INK });
    });
    var yr = layout.yaxis && layout.yaxis.range, lo = yr ? yr[0] : Math.min.apply(null, ys.concat(layout.yaxis && layout.yaxis.rangemode === "tozero" ? [0] : []));
    var hi = yr ? yr[1] : Math.max.apply(null, ys), gap = ((hi - lo) || 1) * 0.085;
    labs.sort(function (a, b) { return b.y - a.y; });
    for (var k = 1; k < labs.length; k++) if (labs[k - 1].ly - labs[k].ly < gap) labs[k].ly = labs[k - 1].ly - gap;
    layout.annotations = (layout.annotations || []).concat(labs.map(function (l) {
      return { x: l.x, y: l.ly, xref: "x", yref: "y", xanchor: "left", yanchor: "middle", xshift: 7, showarrow: false,
        align: "left", text: "<b>" + wrapLabel(escAnn(l.text), 13) + "</b>", font: { size: 12, color: l.color } };
    }));
    layout.showlegend = false;
    if (layout.yaxis) { delete layout.yaxis.title; layout.yaxis.automargin = true; }
    // Right margin just wide enough for the longest end label (12 px bold Inter is
    // about 7.3 px per character, plus the 7 px offset and a little air), so the
    // plot is not pushed left by an empty strip. The y axis sizes its own left margin.
    var longest = 0;
    labs.forEach(function (l) {
      wrapLabel(l.text, 13).split("<br>").forEach(function (ln) { longest = Math.max(longest, ln.length); });
    });
    layout.margin = { t: 16, r: Math.min(104, Math.max(24, Math.ceil(longest * 7.3) + 14)), b: 36, l: 8 };
    layout.height = 440;
    return phoneAxes(layout);
  }

  // User-set y-axis range (Over time). Applied only when both ends are numbers
  // and the low end is below the high end; otherwise the chart keeps Auto.
  function applyY(yaxis) {
    var lo = parseFloat(state.yMin), hi = parseFloat(state.yMax);
    if (state.yCustom && isFinite(lo) && isFinite(hi) && lo < hi) {
      yaxis.range = [lo, hi]; yaxis.autorange = false; delete yaxis.rangemode;
    }
    return yaxis;
  }

  // Play (Over time): the lines draw year by year. state.playYear is the last
  // year drawn (null: every year). While it plays the y axis keeps the range of
  // the whole series, so the lines grow into a still frame instead of the axis
  // jumping each year. Never in a PNG export.
  function playClip(traces, yaxis, include) {
    state._playRange = null;
    if (state.playYear == null || (state.exporting && !state._gif)) return;
    if (!applyY({}).range) {
      var lo = include == null ? Infinity : include, hi = include == null ? -Infinity : include;
      traces.forEach(function (t) {
        (t.y || []).forEach(function (v, k) {
          if (v == null) return;
          var a = v, b = v;
          if (t.error_y && t.error_y.array) { b = v + (t.error_y.array[k] || 0); a = v - (t.error_y.arrayminus[k] || 0); }
          lo = Math.min(lo, a); hi = Math.max(hi, b);
        });
      });
      if (isFinite(lo)) {
        var zero = yaxis && yaxis.rangemode === "tozero", pad = (hi - lo || 1) * 0.06;
        state._playRange = [zero ? Math.min(0, lo) : lo - pad, hi + pad];
        if (yaxis) { yaxis.range = state._playRange.slice(); yaxis.autorange = false; }
      }
    }
    traces.forEach(function (t) {
      if (t.x && t.y) t.y = t.y.map(function (v, k) { return t.x[k] > state.playYear ? null : v; });
    });
  }
  // the year being drawn, large and faint behind the lines
  function playMark(layout) {
    if (state.playYear == null || (state.exporting && !state._gif)) return;
    layout.annotations = (layout.annotations || []).concat([{ xref: "paper", yref: "paper", x: 0.015, y: 0.985,
      xanchor: "left", yanchor: "top", showarrow: false, text: String(state.playYear),
      font: { size: narrowView() ? 30 : 52, color: "#d8c8ad" } }]);
  }

  // Share totals per year for a characteristic: everyone who answered the
  // question (prefer-not-to-say is not in the data), summed over the raw groups
  // only, so built totals never count anyone twice. A group-year with a hidden
  // acceptance count adds nothing (rule 4: never zero).
  function shareTotals(ch) {
    var tot = {}, all = byChar[ch] || [], raw = all.filter(function (g) { return !g.constructed; });
    (raw.length ? raw : all).forEach(function (g) {
      g.by_year.forEach(function (r) {
        if (r.accepted == null || !r.applicants) return;
        var t = tot[r.year] || (tot[r.year] = { app: 0, acc: 0 });
        t.app += r.applicants; t.acc += r.accepted;
      });
    });
    return tot;
  }

  // Numbers mode: applicants (solid) and acceptances (dotted) as counts, per group.
  // Combine Groups sums the ticked groups into one pair of lines; a year where any
  // ticked group's acceptances are suppressed shows no accepted point (never a
  // partial sum, which would understate it).
  function renderNumbers() {
    var ch = state.characteristic, label = CHAR_LABELS[ch], ai = 0, traces = [];
    var groups = (byChar[ch] || []).filter(function (g) { return state.selected[g.group]; });
    var combined = state.combine && groups.length > 1;
    if (combined) {
      var maps = groups.map(function (g) { var m = {}; g.by_year.forEach(function (r) { m[r.year] = r; }); return m; });
      var sumBy = {};
      ALL_YEARS.forEach(function (y) {
        var app = 0, acc = 0, accOk = true, any = false;
        maps.forEach(function (m) { var r = m[y]; if (!r) { accOk = false; return; } any = true;
          app += r.applicants; if (r.accepted == null) accOk = false; else acc += r.accepted; });
        if (any) sumBy[y] = { year: y, applicants: app, accepted: accOk ? acc : null };
      });
      groups = [{ group: "Combined (" + groups.map(function (g) { return g.group; }).join(" + ") + ")",
        by_year: Object.keys(sumBy).map(function (k) { return sumBy[k]; }) }];
    }
    // Lines: applicants, accepted or both. Unit: count, or share of everyone in
    // the characteristic who answered the question that year (prefer-not-to-say
    // is not in the data). The share total sums the raw groups only (built totals
    // such as Christian (all) would count people twice). A group-year with a
    // hidden acceptance count adds to neither the total nor its own share
    // (rule 4: never zero), as in Representation; that year is a gap for it.
    var share = state.numUnit === "share" && ch !== "OVERALL";
    var showApp = state.numShow !== "accepted", showAcc = state.numShow !== "applicants";
    var single = !(showApp && showAcc);
    var tot = share ? shareTotals(ch) : {};
    groups.forEach(function (g) {
      var color = (ch === "OVERALL" || combined) ? RED : ACCENTS[ai++ % ACCENTS.length];
      var by = {}; g.by_year.forEach(function (r) { by[r.year] = r; });
      var xs = ALL_YEARS.filter(function (y) { return y >= state.trendFrom && y <= state.trendTo; });
      function series(key, dash, word) {
        var many = groups.length > 1 || (ch !== "OVERALL" && !combined);
        var name = single ? (many ? g.group : word) : (many ? g.group + ": " : "") + word;
        var who = key === "applicants" ? "applicants" : "acceptances";
        var y = xs.map(function (yr) {
          var r = by[yr]; if (!r) return null;
          if (!share) return key === "applicants" ? r.applicants : r.accepted;
          var t = tot[yr]; if (!t || r.accepted == null) return null;
          var v = key === "applicants" ? r.applicants / t.app : r.accepted / t.acc;
          return isFinite(v) ? 100 * v : null;
        });
        var text = xs.map(function (yr) {
          var r = by[yr], t = tot[yr]; if (!share || !r || !t || r.accepted == null) return "";
          return key === "applicants" ? r.applicants.toLocaleString() + " of " + t.app.toLocaleString()
            : r.accepted.toLocaleString() + " of " + t.acc.toLocaleString();
        });
        return { name: name, x: xs, type:"scatter", mode:"lines+markers", connectgaps:false, y: y, text: text,
          line:{ color: color, width: narrowView() ? PH.line : 2.4, dash: dash }, marker:{ color: color, size: narrowView() ? PH.marker : 7 },
          hovertemplate: (share ? "%{x}: %{y:.1f}% of " + who + " (%{text})" : "%{x}: %{y:,} " + word.toLowerCase()) +
            (groups.length > 1 ? "<br>" + g.group : "") + "<extra></extra>" };
      }
      if (showApp) traces.push(series("applicants", "solid", "Applicants"));
      if (showAcc) traces.push(series("accepted", "dot", "Accepted"));
    });
    var yrs = state.trendFrom + "–" + state.trendTo, what = label.toLowerCase() + ", " + yrs;
    var lines = !single ? " Solid line: applicants; dotted line: accepted." : "";
    setChartHead(share
        ? (single ? "Share of " + (showApp ? "applicants" : "acceptances") : "Share of applicants and of acceptances") +
          " by year, " + what + " (%)"
        : (single ? (showApp ? "Applicants" : "Acceptances") : "Applicants and acceptances") + " by year, " + what,
      (share
        ? "Each group's share of everyone who answered this question that year." + lines +
          " Prefer-not-to-say is not counted. A year where a group's acceptance count is hidden is a gap " +
          "for that group and is left out of that year's total (never counted as zero)."
        : (single ? (showApp ? "Number of applicants each year." : "Number of applicants accepted each year.")
          : "Number of applicants (solid line) and of applicants accepted (dotted line) each year.") +
          (ch === "OVERALL" ? " Everyone who applied, from the Clearing House's published yearly totals." : "") +
          (showAcc ? " A missing " + (single ? "" : "dotted ") + "point is a suppressed count, never zero." : "")) +
      (combined ? " " + groups[0].group + ": the ticked groups summed." +
        (share ? "" : " Applicants who answered 'prefer not to say' are not in any group, so a combined total " +
          "can sit slightly below All applicants (overall).") : ""));
    var layout = {
      paper_bgcolor:BG, plot_bgcolor:BG, height:480,
      font:{ family:"Inter, system-ui, sans-serif", color:"#1a1a1a", size:13 },
      margin:{ t:22, r:24, b:70, l:64 },
      xaxis:{ dtick: narrowView() ? Math.max(1, Math.ceil((state.trendTo - state.trendFrom + 1) / 4)) : 1,
        range:[state.trendFrom - 0.5, state.trendTo + 0.5], showgrid:false, zeroline:false,
        linecolor:AXISLINE, tickcolor:AXISLINE },
      yaxis: applyY(share
        ? { title: single ? "Share of " + (showApp ? "applicants" : "acceptances") + " (%)" : "Share (%)",
            rangemode:"tozero", ticksuffix:"%", showgrid:true, gridcolor:GRID, zeroline:false, linecolor:AXISLINE, tickcolor:AXISLINE }
        : { title: single ? (showApp ? "Number of applicants" : "Number accepted") : "Number of people",
            rangemode:"tozero", tickformat:",", showgrid:true, gridcolor:GRID, zeroline:false, linecolor:AXISLINE, tickcolor:AXISLINE }),
      hovermode:"closest", legend:{ orientation:"h", y:-0.18, bgcolor:"rgba(0,0,0,0)", font:{ size:12 } }
    };
    playClip(traces, layout.yaxis); playMark(layout);
    var ngd = document.getElementById("chart");
    // Phones, 3 or more lines: one small panel per line, as in Rate
    if (narrowView() && traces.length >= 3) {
      var sm = smallMultiples(traces, { count: !share });
      ngd._smallMult = true;
      Plotly.react("chart", sm.data, lockZoom(sm.layout), PLOT_CFG);
      deskRailDots(traces);
      return;
    }
    ngd._smallMult = false;
    var desk = deskPolish();
    // one line per group: name each line at its end, as in Rate
    if (desk) deskTrendLayout(layout, traces, single);
    var drawn = Plotly.react("chart", traces, lockZoom(phoneLines(layout, traces)), PLOT_CFG);
    deskRailDots(traces);
    if (desk && single) drawn.then(function () { return deskLineLabels(ngd); });
  }

  // Phones: x range padded so the value labels beside the marks have room.
  // lo/hi: data extent; padL/padR: the share of the axis kept free on each side.
  // A custom range (applyX) still wins, because applyX runs after this.
  function padRange(lo, hi, padL, padR) {
    var span = (hi - lo) || 1, total = span / (1 - padL - padR);
    return [lo - padL * total, hi + padR * total];
  }
  var LABEL_PAD = 0.15;
  // Signed value to 1 dp for chart labels; zero has no sign ("0.0", never "+0.0" or "-0.0").
  function sgn1(v) { var t = v.toFixed(1); return t === "0.0" || t === "-0.0" ? "0.0" : (v > 0 ? "+" : "") + t; }   // about 50 px of a 340 px plot: fits "+12.3" at 12 px plus its offset

  function renderTrend() {
    if (state.playYear != null && (state.playYear < state.trendFrom || state.playYear >= state.trendTo)) state.playYear = null;
    document.getElementById("num-show-ctl").hidden = state.trendMode !== "numbers";
    document.getElementById("num-unit-ctl").hidden = state.trendMode !== "numbers" || state.characteristic === "OVERALL";
    if (state.trendMode === "numbers") { renderNumbers(); return; }
    var ch = state.characteristic, ref = refFor(ch), refGroup = getGroup(ch, ref);
    var vs = state.trendMode === "vsref" && !!refGroup;
    var rr = vs && state.trendMeasure === "rr";
    var mc = document.getElementById("trend-measure-ctl");
    if (mc) mc.hidden = !vs;   // the pp/ratio measure choice only applies vs reference
    var traces = [], ai = 0;
    var selectedGroups = (byChar[ch] || []).filter(function (g) { return state.selected[g.group]; });
    // Combine: vs reference pools the non-reference groups against the reference;
    // in Rate mode the reference is pooled too, so ticking every group gives the
    // combined rate for everyone in them.
    var poolable = selectedGroups.filter(function (g) { return !vs || g.group !== ref; });
    var combining = state.combine && poolable.length > (vs ? 0 : 1);
    if (combining) {
      traces.push(combinedTrace(poolable, refGroup, vs, RED, rr));
    } else {
      selectedGroups.forEach(function (g) {
        if (vs && g.group === ref) return;   // reference is the flat baseline
        var color = g.group === ref ? REF_COLOR : ACCENTS[ai++ % ACCENTS.length];
        traces.push(vs ? traceVsRef(g, refGroup, color, rr) : traceFor(g, color));
      });
    }
    var label = CHAR_LABELS[ch];
    // shade the DEI era only if switched on (DEI era chip) and in view
    var showDEI = state.showDEI && state.trendTo >= DEI_FROM && !isContext(ch);
    var shapes = showDEI ? [{ type:"rect", xref:"x", yref:"paper", x0:DEI_FROM - 0.5, x1:DEI_TO + 0.5, y0:0, y1:1,
      fillcolor:"#ddcfb8", opacity:0.55, line:{ width:0 }, layer:"below" }] : [];
    if (vs) shapes.push({ type:"line", xref:"paper", x0:0, x1:1, yref:"y", y0:rr?1:0, y1:rr?1:0,
      line:{ color:"#7a6f5a", width:1.4, dash:"dot" } });
    var yaxis = rr
      ? { title:"Acceptance ratio vs "+ref, ticksuffix:"x", showgrid:true,
          gridcolor:GRID, zeroline:false, linecolor:AXISLINE, tickcolor:AXISLINE }
      : vs
      ? { title:"Difference from "+ref+" (pp)", ticksuffix:" pp", showgrid:true,
          gridcolor:GRID, zeroline:false, linecolor:AXISLINE, tickcolor:AXISLINE }
      : { title:"Acceptance rate (%)", rangemode:"tozero", ticksuffix:"%", showgrid:true,
          gridcolor:GRID, zeroline:false, linecolor:AXISLINE, tickcolor:AXISLINE };
    var combNote = combining ? " The selected groups are pooled into one group (summed counts)." : "";
    var yrs = state.trendFrom + "–" + state.trendTo;
    setChartHead(rr ? "Acceptance-rate ratio vs " + ref + " by year, " + label.toLowerCase() + ", " + yrs
        : vs ? "Acceptance-rate gap vs " + ref + " by year, " + label.toLowerCase() + ", " + yrs + " (percentage points)"
        : "Acceptance rate by year, " + label.toLowerCase() + ", " + yrs + " (%)",
      (rr ? "Ratio of each group's acceptance rate to " + ref + " each year (1 = parity), with 95% intervals."
         : vs ? "Difference from " + ref + " each year, in percentage points, with 95% intervals."
         : "Share of applicants accepted each year, with 95% Wilson intervals.") + combNote);
    playClip(traces, yaxis, vs ? (rr ? 1 : 0) : null);
    var gd = document.getElementById("chart");
    // Phones, 3 or more separate lines: one small panel per group instead of a tangle.
    if (narrowView() && !combining && traces.length >= 3) {
      var sm = smallMultiples(traces, { vs: vs, rr: rr, showDEI: showDEI });
      gd._smallMult = true;
      Plotly.react("chart", sm.data, lockZoom(sm.layout), PLOT_CFG);
      return;
    }
    gd._smallMult = false;
    var layout = {
      paper_bgcolor:BG, plot_bgcolor:BG, height:480,
      font:{ family:"Inter, system-ui, sans-serif", color:"#1a1a1a", size:13 },
      margin:{ t:22, r:24, b:70, l:64 },
      xaxis:{ dtick: narrowView() ? Math.max(1, Math.ceil((state.trendTo - state.trendFrom + 1) / 4)) : 1,
        range:[state.trendFrom - 0.5, state.trendTo + 0.5], showgrid:false, zeroline:false,
        linecolor:AXISLINE, tickcolor:AXISLINE },
      yaxis:applyY(yaxis), hovermode:"closest",
      legend:{ orientation:"h", y:-0.18, bgcolor:"rgba(0,0,0,0)", font:{ size:12 } },
      shapes:shapes,
      annotations: showDEI ? [
        { x:Math.min(DEI_TO + 0.4, state.trendTo + 0.4), y:0.985, yref:"paper", xanchor:"right", yanchor:"top",
          showarrow:false, text:"DEI era", font:{ size:11, color:"#7a6c55" } }
      ] : []
    };
    playMark(layout);
    var desk = deskPolish();
    if (desk) deskTrendLayout(layout, traces, true);
    var drawn = Plotly.react("chart", traces, lockZoom(phoneLines(layout, traces)), PLOT_CFG);
    deskRailDots(traces);
    if (desk) drawn.then(function () { return deskLineLabels(gd); });
    gd._lastHi = null; bindTrendHover(gd);
  }

  // Small multiples (phones, Over time, Rate or Vs reference, 3+ lines): one
  // panel per group in 2 columns. Each panel draws its own group in colour over
  // the other groups in faint grey, with one shared y range for every panel, the
  // DEI band and the reference line in each panel, and only the first and last
  // year on the x axis. The panel title names the group and its latest value.
  var SM = { cols: 2, panelH: 118, rowGap: 30, colGap: 0.07, titleLine: 16, nameWrap: 16, lineFit: 21 };
  function smallMultiples(traces, o) {
    var n = traces.length, cols = SM.cols, rows = Math.ceil(n / cols);
    var x0 = state.trendFrom - 0.5, x1 = state.trendTo + 0.5, refY = o.rr ? 1 : 0;
    // shared y range: every value (and interval end, when shown), the reference
    // line in Vs reference and zero for rates; a user-set range wins (applyY)
    var lo = Infinity, hi = -Infinity;
    traces.forEach(function (t) {
      t.y.forEach(function (v, k) {
        if (v == null) return;
        var a = v, b = v;
        if (state.showCI && t.error_y && t.error_y.array) { b = v + t.error_y.array[k]; a = v - t.error_y.arrayminus[k]; }
        lo = Math.min(lo, a); hi = Math.max(hi, b);
      });
    });
    if (!isFinite(lo)) { lo = refY; hi = refY + 1; }
    if (o.vs) { lo = Math.min(lo, refY); hi = Math.max(hi, refY); } else lo = Math.min(lo, 0);
    var pad = (hi - lo || 1) * 0.06, yr = [o.vs || lo < 0 ? lo - pad : lo, hi + pad];
    var user = applyY({});
    if (user.range) yr = user.range;
    else if (state._playRange) yr = state._playRange.slice();
    function fmtV(v) {
      return o.count ? Math.round(v).toLocaleString() : o.rr ? v.toFixed(2) + "x" : o.vs ? (v >= 0 ? "+" : "") + v.toFixed(1) + " pp" : v.toFixed(1) + "%";
    }
    // titles: wrapped name plus the latest value, on the name's last line if it fits
    var titles = traces.map(function (t) {
      var i = t.y.length - 1; while (i >= 0 && t.y[i] == null) i--;
      var val = i >= 0 ? fmtV(t.y[i]) + " in " + t.x[i] : "no data";
      var lines = wrapLabel(escAnn(t.name), SM.nameWrap).split("<br>");
      var last = lines[lines.length - 1].replace(/&amp;/g, "&");
      var color = (t.line && t.line.color) || INK, name = "<b>" + lines.join("<br>") + "</b>";
      var vSpan = '<span style="color:' + INK + '">' + val + "</span>";
      var same = last.length + 1 + val.length <= SM.lineFit;
      return { text: name + (same ? " " : "<br>") + vSpan, lines: lines.length + (same ? 0 : 1), color: color };
    });
    var titleH = Math.max.apply(null, titles.map(function (t) { return t.lines; })) * SM.titleLine + 6;
    var m = { t: 8, r: 20, b: 26, l: 40 };
    var plotH = rows * (titleH + SM.panelH) + (rows - 1) * SM.rowGap;
    var H = plotH + m.t + m.b;
    var colW = (1 - SM.colGap * (cols - 1)) / cols;
    var layout = { paper_bgcolor: BG, plot_bgcolor: BG, height: H, margin: m, showlegend: false,
      font: { family: "Inter, system-ui, sans-serif", color: "#1a1a1a", size: 13 },
      hovermode: "closest", shapes: [], annotations: [] };
    var data = [];
    traces.forEach(function (t, p) {
      var r = Math.floor(p / cols), c = p % cols, sfx = p === 0 ? "" : String(p + 1);
      var xa = "x" + sfx, ya = "y" + sfx;
      var top = 1 - (r * (titleH + SM.panelH + SM.rowGap) + titleH) / plotH;
      var bot = top - SM.panelH / plotH;
      var xd = [c * (colW + SM.colGap), c * (colW + SM.colGap) + colW];
      layout["xaxis" + sfx] = { domain: xd, anchor: ya, range: [x0, x1], showgrid: false, zeroline: false,
        linecolor: AXISLINE, tickcolor: AXISLINE, tickmode: "array",
        tickvals: state.trendFrom === state.trendTo ? [state.trendFrom] : [state.trendFrom, state.trendTo],
        ticktext: state.trendFrom === state.trendTo ? [String(state.trendFrom)] : [String(state.trendFrom), String(state.trendTo)] };
      layout["yaxis" + sfx] = { domain: [bot, top], anchor: xa, range: yr.slice(), autorange: false,
        showgrid: true, gridcolor: GRID, zeroline: false, linecolor: AXISLINE, tickcolor: AXISLINE, nticks: 4,
        showticklabels: c === 0, ticksuffix: o.count || o.vs ? "" : o.rr ? "x" : "%", tickformat: o.count ? "," : "" };
      if (o.showDEI) layout.shapes.push({ type: "rect", xref: xa, yref: ya, x0: DEI_FROM - 0.5, x1: Math.min(DEI_TO + 0.5, x1),
        y0: yr[0], y1: yr[1], fillcolor: "#ddcfb8", opacity: 0.55, line: { width: 0 }, layer: "below" });
      if (o.vs) layout.shapes.push({ type: "line", xref: xa, yref: ya, x0: x0, x1: x1, y0: refY, y1: refY,
        line: { color: "#7a6f5a", width: 1.4, dash: "dot" } });
      // the other groups, faint, behind
      traces.forEach(function (u, q) {
        if (q === p) return;
        data.push({ type: "scatter", mode: "lines", x: u.x, y: u.y, xaxis: xa, yaxis: ya, connectgaps: true,
          line: { color: NOSIG, width: PH.faint }, opacity: 0.75, hoverinfo: "skip", showlegend: false });
      });
      // this group, in colour, on top (intervals only here, when shown)
      var own = JSON.parse(JSON.stringify(t));
      own.xaxis = xa; own.yaxis = ya; own.showlegend = false;
      data.push(own);
      // titles hang from the top of their slot, so one-line and two-line titles align
      layout.annotations.push({ xref: "paper", yref: "paper", x: xd[0], y: top + titleH / plotH, xanchor: "left", yanchor: "top",
        showarrow: false, align: "left", text: titles[p].text, font: { size: 12.5, color: titles[p].color } });
    });
    if (o.showDEI) layout.annotations.push({ xref: "x", yref: "paper", x: Math.min(DEI_TO + 0.4, x1 - 0.1),
      y: 1 - titleH / plotH, xanchor: "right", yanchor: "top", yshift: -2, showarrow: false, text: "DEI era",
      font: { size: 10.5, color: "#7a6c55" } });
    return { data: data, layout: phoneAxes(layout) };
  }

  // Hover to focus: hovering a line dims the others so a tangle is readable on
  // demand. Bound once; the handlers no-op off the trend view, and every render
  // rebuilds traces at full opacity so dimming never sticks.
  function bindTrendHover(gd) {
    if (gd._trendHoverBound) return;
    gd._trendHoverBound = true;
    gd.on("plotly_hover", function (ev) {
      if (state.view !== "trend" || gd._smallMult) return;
      var n = gd.data.length; if (n < 2) return;
      var hi = (ev.points && ev.points.length) ? ev.points[0].curveNumber : -1;
      if (hi < 0 || hi === gd._lastHi) return;
      gd._lastHi = hi;
      var op = []; for (var i = 0; i < n; i++) op.push(i === hi ? 1 : 0.18);
      Plotly.restyle(gd, { opacity: op });
    });
    gd.on("plotly_unhover", function () {
      if (state.view !== "trend" || gd._smallMult || gd._lastHi == null) return;
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

  // Full forest and contextual overview: computed by families.js, the same code
  // the node tests check against the R oracle. Rate ratios are added here for the
  // measure toggle (at each row's own BH-widened z).
  // The overviews are shown in percentage points only (as published); the measure
  // toggle is hidden for them (ppOnly()).
  var GIDX = Families.indexGroups(window.COUNTS);
  function withRR(res) { return res; }
  function ppOnly() { return isOverview() || state.view !== "forest"; }
  function usePP() { return state.measure === "pp" || isOverview(); }
  function shortGroup(ch, g) {
    if (/Quintile 5/.test(g)) return "Most advantaged areas (Q5)";
    if (/Quintile 1/.test(g)) return "Least advantaged areas (Q1)";
    if (g === "Quintile 4") return "Q4 areas";
    if (/^Christian - /.test(g)) return g.replace(/^Christian - Roman Catholic$/, "Roman Catholic")
      .replace(/^Christian - Other$/, "Christian (other)").replace(/^Christian - Protestant$/, "Protestant");
    if (/^\d+-\d+ years$/.test(g)) return "Aged " + g.replace(" years", "");
    if (g === "Other EU/EEA") return "EU/EEA resident";
    if (/^Divorced/.test(g)) return "Divorced/widowed";
    if (g === "Married/civil partnership/co-habiting") return "Married/co-habiting";
    if (g === "Other White background") return "Other White";
    if (g === "Other sexual orientation") return "Other orientation";
    if (g === "Male") return "Men";
    return g;
  }
  function computeMaster(years) {
    var res = Families.master(window.COUNTS, years, GIDX);
    res.rows.forEach(function (r) {
      r.fullGroup = r.group; r.group = shortGroup(r.characteristic, r.group);
      r.groupObj = getGroup(r.characteristic, r.fullGroup);
    });
    return withRR(res);
  }
  function computeContextAll(years) {
    var res = Families.context(window.COUNTS, years, GIDX);
    res.rows.forEach(function (r) { r.groupObj = getGroup(r.characteristic, "Yes"); });
    return withRR(res);
  }
  function computeOverview(years) { return isAllGroups() ? computeMaster(years) : computeContextAll(years); }

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

  function forestFor(years) { return isOverview() ? computeOverview(years) : computeForest(years); }
  function renderForest() {
    drawForest(forestFor(windowYears()));
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
          (pp ? val + " pp" : val + "x") + ", p (BH) " + pHover(info.pBh) + ", " +
          (sig ? "significant" : "not significant");
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
  // ERA VIEW: pre-DEI (2015-2019) vs DEI (2021-2025; RULES.md C5). 2020 is the changeover
  // year, in neither pool. The change is tested on PER-YEAR values with a Welch
  // t-test (rule 12), BH-corrected across the displayed groups. Each era's
  // displayed value is the mean per-year quantity with a 95% t-interval (rule 6b).
  // ==========================================================================
  var PRE_DEI = window.COUNTS.meta.eras.pre_dei || [2015,2016,2017,2018,2019];
  var DEI_Y   = window.COUNTS.meta.eras.dei || [2021,2022,2023,2024,2025];

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
        t += r.testable ? ("<br>raw p " + pHover(r.raw_p) + ", p (BH) " + pHover(r.p_bh) +
          "<br>" + (r.sig ? "significant" : "not significant")) : "<br>not testable (too few years)";
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
    var narrow = narrowView();
    if (narrow) preTrace.marker.size = 9;
    var arrows = rows.map(function (r, i) {
      var sig = r.testable && r.sig;
      var col = sig ? RED : "#bdb29a";   // red when significant; direction is the arrow
      return { x: r.dei.mean, y: i, ax: r.pre.mean, ay: i,
        xref: "x", yref: "y", axref: "x", ayref: "y",
        showarrow: true, arrowhead: 3, arrowsize: 1.2, arrowwidth: sig ? (narrow ? 3.6 : 3) : (narrow ? 2.2 : 1.6),
        arrowcolor: col, standoff: 5, startstandoff: 4 };
    });

    var xtitle = pp ? "Gap from " + res.ref + " (pp)" : "Acceptance rate (%)";
    var shapes = [];
    if (pp) shapes.push({ type: "line", xref: "x", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1,
      line: { color: "#7a6f5a", width: 1.4, dash: "dot" } });
    setEraHead(res);
    var f = function (v) { return pp ? sgn1(v) : v.toFixed(1); };
    // Desktop: "pre → DEI" at the right of every row. Phones: the pre value beside
    // its dot, on the side away from the arrow, and the DEI value beyond the
    // arrowhead. Bold when the change is significant.
    var vals = [];
    rows.forEach(function (r, i) {
      var sig = r.testable && r.sig, font = { size: 12, color: sig ? INK : "#7a6f5f" };
      var b0 = sig ? "<b>" : "", b1 = sig ? "</b>" : "";
      if (!narrow) {
        vals.push({ xref: "paper", x: 1, xanchor: "left", xshift: 10, yref: "y", y: i, showarrow: false,
          text: b0 + f(r.pre.mean) + " → " + f(r.dei.mean) + b1, font: font });
        return;
      }
      var up = r.dei.mean >= r.pre.mean;
      vals.push({ xref: "x", x: r.pre.mean, yref: "y", y: i, xanchor: up ? "right" : "left", xshift: up ? -8 : 8,
        showarrow: false, text: f(r.pre.mean), font: { size: 12, color: "#7a6f5f" }, bgcolor: BG });
      vals.push({ xref: "x", x: r.dei.mean, yref: "y", y: i, xanchor: up ? "left" : "right", xshift: up ? 9 : -9,
        showarrow: false, text: b0 + f(r.dei.mean) + b1, font: font, bgcolor: BG });
    });
    var eraX = null;
    if (narrow && rows.length) {
      var all = []; rows.forEach(function (r) { all.push(r.pre.mean, r.dei.mean); });
      if (pp) all.push(0);
      eraX = padRange(Math.min.apply(null, all), Math.max.apply(null, all), LABEL_PAD, LABEL_PAD);
    }
    var names = narrow ? rows.map(function (r, i) {
      return { xref: "paper", x: 0, xanchor: "left", yref: "y", y: i, yshift: 15, showarrow: false,
        text: escAnn(r.group), font: { size: 12, color: INK }, bgcolor: BG };
    }) : [];
    var layout = {
      paper_bgcolor: BG, plot_bgcolor: BG, height: Math.max(260, rows.length * (narrow ? 52 : 40) + 70),
      font: { family: "Inter, system-ui, sans-serif", color: "#1a1a1a", size: 13 },
      margin: narrow ? { t: 26, r: 10, b: 40, l: 10 } : { t: 18, r: 120, b: 54, l: 200 },
      xaxis: applyX("era", { title: narrow ? undefined : xtitle, showgrid: true, gridcolor: GRID, zeroline: false,
        range: eraX || undefined, autorange: eraX ? false : undefined,
        linecolor: AXISLINE, tickcolor: AXISLINE, ticksuffix: pp ? "" : "%", tickformat: pp ? "+," : "",
        tickfont: { size: 12 } }),
      yaxis: { tickvals: narrow ? [] : idx, ticktext: narrow ? [] : ys, autorange: "reversed", showgrid: false,
        zeroline: false, showline: false, automargin: true, tickfont: { size: 12.5, color: INK },
        range: [rows.length - 0.4, -0.7] },
      hovermode: "closest", showlegend: false, shapes: shapes,
      annotations: arrows.concat(vals, names)
    };
    Plotly.react("chart", [preTrace, deiTrace], lockZoom(phoneAxes(layout)), PLOT_CFG);
  }

  // Source groups behind a forest row, for the pooled-cell flags.
  function rowGroups(res, r) {
    if (r.groupObj) return [r.groupObj];
    var ch = state.characteristic, cfg = FORESTS[ch]; if (!cfg) return [];
    var mb = cfg.members.filter(function (m) { return memberLabel(m) === r.group; })[0];
    if (!mb) return [];
    var names = typeof mb === "string" ? [mb] : mb.components;
    return names.map(function (n) { return getGroup(ch, n); }).filter(Boolean);
  }
  function rangeLabel(a, b) { return a === b ? "" + a : a + "–" + b; }

  // Forest in the blog style: dot and bar for the chosen years, the value at the
  // right of every row. Colour: red = significant
  // (the full forest, as published, uses red above / blue below its reference);
  // hollow grey = no clear difference. Phones: group name above its row.
  function drawForest(res) {
    var pp = usePP();
    var rows = res.rows.filter(function (r) {
      return r.computable && (pp ? r.pp != null : (r.rr != null && r.rr_lo != null));
    });
    rows.sort(function (a, b) { return (pp ? b.pp - a.pp : b.rr - a.rr); });   // largest at top
    var years = windowYears(), narrow = narrowView();
    // Play lock: every year's rows in one fixed order (a row with no data that
    // year keeps its place, empty), on one fixed axis
    var lock = playLock("forest"), pos = null;
    if (lock) {
      pos = {}; lock.order.forEach(function (k, i) { pos[k] = i; });
      rows = rows.filter(function (r) { return pos[r.characteristic + "|" + r.group] != null; })
        .sort(function (a, b) { return pos[a.characteristic + "|" + a.group] - pos[b.characteristic + "|" + b.group]; });
    }
    var nRows = lock ? lock.order.length : rows.length;

    function val(r) { return pp ? r.pp : r.rr; }
    function cls(r) {
      if (res.kind === "descriptive") return "desc";
      if (!isSig(res, r)) return "ns";
      return res.master ? (r.pp >= 0 ? "above" : "below") : "sig";
    }
    var COL = { sig: RED, above: RED, below: BLUE, ns: NOSIG, desc: DESC };
    var refWord = res.master ? "its own reference" : res.context ? "'No'" : res.ref;
    var pooledAny = false;
    var info = rows.map(function (r, i) {
      var pc = []; rowGroups(res, r).forEach(function (g) { pc = pc.concat(pooledCells(g, years)); });
      if (pc.length) pooledAny = true;
      return { r: r, i: pos ? pos[r.characteristic + "|" + r.group] : i, c: cls(r), pooled: pc,
        label: r.group + (r.applicants < 100 ? "*" : "") + (pc.length ? DAGGER : "") };
    });

    function hover(o) {
      var r = o.r, eff = pp ? (r.pp >= 0 ? "+" : "") + r.pp.toFixed(1) + " pp" : r.rr.toFixed(2) + "x";
      var lo = pp ? r.pp_lo : r.rr_lo, hi = pp ? r.pp_hi : r.rr_hi;
      var t = "<b>" + r.group + "</b>" + (res.master ? " (" + (CHAR_LABELS[r.characteristic] || r.characteristic) + ")" : "") +
        "<br>" + rangeLabel(state.yearFrom, state.yearTo) + ": " + eff + " vs " + refWord +
        (lo != null ? "<br>interval " + (pp ? lo.toFixed(1) + " to " + hi.toFixed(1) : lo.toFixed(2) + " to " + hi.toFixed(2)) : "") +
        "<br>n " + r.accepted + "/" + r.applicants +
        (res.kind === "bh" ? "<br>raw p " + pHover(r.raw_p) + ", p (BH) " + pHover(r.p_bh)
          : res.kind === "single" ? "<br>p " + pHover(r.raw_p) : "") +
        "<br>" + (res.kind === "descriptive" ? "descriptive (no test)" : isSig(res, r) ? "significant" : "no clear difference");
      if (o.pooled.length) t += "<br>† pooled in source: " + poolNote(o.pooled);
      return t;
    }

    var traces = [];
    ["ns", "desc", "sig", "above", "below"].forEach(function (k) {
      var g = info.filter(function (o) { return o.c === k; }); if (!g.length) return;
      var hollow = k === "ns";
      traces.push({ type:"scatter", mode:"markers",
        x: g.map(function (o) { return val(o.r); }), y: g.map(function (o) { return o.i; }),
        error_x:{ type:"data", symmetric:false, color: COL[k], thickness: narrow ? 3.2 : 2.4, width: 0,
          array: g.map(function (o) { return pp ? o.r.pp_hi - o.r.pp : o.r.rr_hi - o.r.rr; }),
          arrayminus: g.map(function (o) { return pp ? o.r.pp - o.r.pp_lo : o.r.rr - o.r.rr_lo; }) },
        marker:{ size: (hollow ? 11 : 12) + (narrow ? 2 : 0), color: hollow ? BG : COL[k],
          line:{ color: hollow ? "#8a8073" : COL[k], width: hollow ? (narrow ? 2.4 : 2) : 0 } },
        hovertemplate:"%{text}<extra></extra>", text: g.map(hover) });
    });

    // Desktop: the value at the right of each row. Phones: the value just right
    // of the interval's upper end, and the name above the row.
    function hiEnd(o) { return pp ? o.r.pp_hi : o.r.rr_hi; }
    var annos = info.map(function (o) {
      var strong = o.c !== "ns" && o.c !== "desc";
      var txt = (strong ? "<b>" : "") + (pp ? sgn1(val(o.r)) : val(o.r).toFixed(2) + "x") + (strong ? "</b>" : "");
      var font = { size: 12, color: strong ? INK : "#7a6f5f" };
      if (narrow) return { xref:"x", x: hiEnd(o), xanchor:"left", xshift: 7, yref:"y", y:o.i,
        showarrow:false, text: txt, font: font, bgcolor: BG };
      return { xref:"paper", x:1, xanchor:"right", yref:"y", y:o.i, showarrow:false, text: txt, font: font };
    });
    var forestX = null;
    if (lock) forestX = narrow ? padRange(lock.range[0], lock.range[1], 0.03, LABEL_PAD) : lock.range.slice();
    else if (narrow && info.length) {
      var ext = [pp ? 0 : 1];
      info.forEach(function (o) { ext.push(pp ? o.r.pp_lo : o.r.rr_lo, hiEnd(o)); });
      forestX = padRange(Math.min.apply(null, ext), Math.max.apply(null, ext), 0.03, LABEL_PAD);
    }
    if (narrow) info.forEach(function (o) {
      annos.push({ xref:"paper", x:0, xanchor:"left", yref:"y", y:o.i, yshift:15, showarrow:false,
        text: escAnn(o.label), font:{ size:12, color:INK }, bgcolor: BG });
    });
    // play lock: rows with no data this year keep their place and say so
    var tickV = info.map(function (o) { return o.i; }), tickT = info.map(function (o) { return o.label; });
    if (lock) {
      var have = {}; info.forEach(function (o) { have[o.i] = o.label; });
      tickV = lock.order.map(function (k, i) { return i; });
      tickT = lock.order.map(function (k, i) { return have[i] != null ? have[i] : lock.labels[k] + " (no data)"; });
      if (narrow) lock.order.forEach(function (k, i) {
        if (have[i] == null) annos.push({ xref:"paper", x:0, xanchor:"left", yref:"y", y:i, yshift:15, showarrow:false,
          text: escAnn(lock.labels[k] + " (no data)"), font:{ size:12, color:MUTED }, bgcolor: BG });
      });
    }

    var nullX = pp ? 0 : 1;
    setForestHead(res, pooledAny);
    var rowH = narrow ? 50 : 36;
    var layout = {
      paper_bgcolor:BG, plot_bgcolor:BG, height: Math.max(260, nRows * rowH + 70),
      font:{ family:"Inter, system-ui, sans-serif", color:"#1a1a1a", size:13 },
      margin:{ t: narrow ? 26 : 10, r: narrow ? 10 : 58, b:44, l:10 },
      xaxis: applyX("forest", { showgrid:true, gridcolor:GRID, zeroline:false, linecolor:AXISLINE, tickcolor:AXISLINE,
        range: forestX || undefined, autorange: forestX ? false : undefined,
        tickformat: pp ? "+," : "", ticksuffix: pp ? "" : "x", fixedrange:true }),
      yaxis:{ automargin:true, showgrid:false, zeroline:false, showline:false, autorange:"reversed",
        tickvals: narrow ? [] : tickV, ticktext: narrow ? [] : tickT,
        tickfont:{ size:12.5, color:INK }, range:[nRows - 0.4, -0.7] },
      hovermode:"closest", showlegend:false,
      shapes:[{ type:"line", x0:nullX, x1:nullX, yref:"paper", y0:0, y1:1,
        line:{ color:"#6d6252", width:1.3, dash:"dash" } }],
      annotations: annos
    };
    var desk = deskPolish(), fgd = document.getElementById("chart");
    if (desk) {
      layout.margin = { t: 38, r: 84, b: 48, l: 14 };
      Object.assign(layout.xaxis, { gridcolor: GRID_SOFT, showline: false, ticks: "", ticksuffix: pp ? " pp" : "x",
        tickfont: { size: 12.5, color: MUTED } });
      Object.assign(layout.yaxis, { tickfont: { size: 14, color: INK }, ticklabelstandoff: 14,
        autorange: false, range: [nRows - 0.5, -0.5] });
      annos.forEach(function (a) { a.font = Object.assign({}, a.font, { size: 13.5 }); });
      annos.push({ xref: "paper", yref: "paper", x: 1, y: 1, xanchor: "right", yanchor: "bottom", yshift: 10,
        showarrow: false, text: pp ? "Gap (pp)" : "Ratio", font: { size: 12, color: MUTED } });
      // full screen with many rows: smaller labels and marks, so tight rows stay legible
      var tight = isMax() && fgd.clientHeight > 0 && fgd.clientHeight / nRows < 21;
      if (tight) {
        layout.yaxis.tickfont = { size: 12, color: INK };
        annos.forEach(function (a) { if (a.font) a.font.size = 12; });
      }
      traces.forEach(function (t) {
        if (t.error_x) t.error_x.thickness = tight ? 2.4 : 3.2;
        if (t.marker && typeof t.marker.size === "number") t.marker.size += tight ? 0 : 3;
      });
      fgd._fitMax = nRows * 100 + 150;
      fgd._fitMin = isMax() ? nRows * 15 + 60 : 0;   // full screen: never below about 15 px a row
    }
    if (lock) { layout.yaxis.autorange = false; layout.yaxis.range = [nRows - (narrow ? 0.4 : 0.5), narrow ? -0.7 : -0.5]; }
    var drawn = Plotly.react("chart", traces, lockZoom(phoneAxes(layout)), PLOT_CFG);
    if (desk) drawn.then(function () { return deskRowBands(fgd, nRows); });
  }

  // Shared title/subtitle for the forest and master views (chart and table).
  // Plain descriptive title (house rule, Nov 2026); everything else is footnote.
  function setForestHead(res, pooledAny) {
    var pp = usePP(), win = rangeLabel(state.yearFrom, state.yearTo);
    var unit = pp ? " (percentage points)" : " (rate ratio)";
    var title = res.master ? "Acceptance-rate gap from each group's reference group, " + win + unit
      : res.context ? "Acceptance-rate gap by contextual admissions question, 'yes' vs 'no', " + win + unit
      : "Acceptance-rate gap by " + (CHAR_LABELS[state.characteristic] || "").toLowerCase().replace(/^context: /, "") +
        " vs " + (isContext() ? "'no'" : res.ref) + ", " + win + unit;
    var key = "Dot and bar: " + win + ".";
    var sub;
    if (res.master)
      sub = key + " Each group vs the largest group of its characteristic (socio-economic: Q2 and Q3 combined). " +
        "Red: above its reference; blue: below; grey: no clear difference, after one Benjamini-Hochberg correction " +
        "across the " + res.m + " groups with data (the " + res.n_members + " groups with 300+ applicants in " + DEI_FROM + "–" + DEI_TO +
        ", the DEI era; the published May chart used 2021–24). Disability not included. A group can differ here and not in its own " +
        "characteristic's chart, because significance depends on how many groups share the correction.";
    else if (res.context)
      sub = key + " Each contextual question, 'yes' vs 'no'. Red: differs after one Benjamini-Hochberg correction " +
        "across the " + res.m + " questions; grey: no clear difference. Asked from 2023 entry. Not adjusted for other characteristics.";
    else if (res.kind === "bh")
      sub = key + " Reference: " + res.ref + ". Red: differs after Benjamini-Hochberg correction (m = " + res.m +
        "); grey: no clear difference. Bars are 95% intervals widened to the Benjamini-Hochberg level.";
    else if (res.kind === "single")
      sub = key + " Reference: " + res.ref + ". Single pre-specified comparison, plain 95% Newcombe interval.";
    else
      sub = key + " Reference: " + res.ref + ". Descriptive only: no significance test for this characteristic.";
    sub += " * fewer than 100 applicants in " + win + ".";
    if (pooledAny) sub += " † the source pooled a small hidden count with this group in at least one of these years; " +
      "hover for detail. Figures follow the source, as in the published posts.";
    if (state.characteristic === "AGE")
      sub += " Age gaps may reflect life stage or confounding, not unfair treatment.";
    setChartHead(title, sub);
  }
  // Small sortable-header helper shared by the chart-view tables.
  function sortTh(srt, label, col, left) {
    var active = srt.col === col, glyph = active ? (srt.dir > 0 ? "▲" : "▼") : "↕";
    return '<th data-sort="' + col + '"' + (left ? ' style="text-align:left"' : "") +
      ' title="Click to sort">' + label + '<span class="sarr' + (active ? " on" : "") +
      '">' + glyph + "</span></th>";
  }
  function fmtP(p) { return p == null ? "&mdash;" : p < 0.001 ? "&lt;0.001" : p.toFixed(3); }
  // Plain-text p for chart hovers (no HTML entities; not used in PNG export).
  function pHover(p) { return p == null ? "n/a" : p < 0.001 ? "<0.001" : p.toFixed(3); }
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
    var res = forestFor(windowYears());
    setForestHead(res);
    var tbl = document.getElementById("table"), pp = usePP(), srt = state.forestSort;
    var hasSig = res.kind !== "descriptive", master = !!res.master, isBH = res.kind === "bh";
    var rows = res.rows.filter(function (r) {
      return r.computable && (pp ? r.pp != null : (r.rr != null && r.rr_lo != null));
    }).map(function (r) {
      return { group: r.group, ch: r.characteristic ? (CHAR_LABELS[r.characteristic] || r.characteristic) : "",
        n: r.applicants, rate: r.rate, eff: pp ? r.pp : r.rr, lo: pp ? r.pp_lo : r.rr_lo,
        hi: pp ? r.pp_hi : r.rr_hi, sig: hasSig ? isSig(res, r) : false,
        pRaw: r.raw_p != null ? r.raw_p : null, pBh: r.p_bh != null ? r.p_bh : null };
    });
    rows = sortRows(rows, srt, ["group", "ch"]);
    var effHdr = pp ? "vs ref (pp)" : "Rate ratio";
    var pHead = isBH ? (sortTh(srt, "Raw p", "pRaw") + sortTh(srt, "p (BH)", "pBh"))
      : res.kind === "single" ? sortTh(srt, "p", "pRaw") : "";
    function eff(r) { return pp ? (r.eff >= 0 ? "+" : "") + r.eff.toFixed(1) : r.eff.toFixed(2); }
    function ci(r) { return pp ? r.lo.toFixed(1) + " to " + r.hi.toFixed(1) : r.lo.toFixed(2) + " to " + r.hi.toFixed(2); }
    var h = '<table class="datatable"><thead><tr>' + sortTh(srt, "Group", "group", true) +
      (master ? sortTh(srt, "Characteristic", "ch", true) : "") + sortTh(srt, "Applicants", "n") +
      sortTh(srt, "Rate", "rate") + sortTh(srt, effHdr, "eff") + "<th>95% CI</th>" +
      pHead + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var effCell = "<td" + (r.sig ? ' style="color:' + RED + ';font-weight:600"' : "") + ">" + eff(r) + "</td>";
      var pCells = isBH ? ("<td>" + fmtP(r.pRaw) + "</td><td>" + fmtP(r.pBh) + "</td>")
        : res.kind === "single" ? ("<td>" + fmtP(r.pRaw) + "</td>") : "";
      h += "<tr><td style='text-align:left'>" + r.group + "</td>" +
        (master ? "<td style='text-align:left'>" + r.ch + "</td>" : "") +
        "<td>" + (r.n != null ? r.n.toLocaleString("en-GB") : "") + "</td><td>" + r.rate.toFixed(1) + "%</td>" + effCell +
        "<td>" + ci(r) + "</td>" + pCells + "</tr>";
    });
    h += "</tbody></table>";
    if (!rows.length) h += '<p class="table-sub">No computable groups in this window.</p>';
    tbl.innerHTML = h;
  }
  // Shared title/subtitle for the era view (chart and table).
  function setEraHead(res) {
    var pp = res.mode === "vsref", label = CHAR_LABELS[state.characteristic];
    var pre = PRE_DEI[0] + "–" + PRE_DEI[PRE_DEI.length - 1], dei = DEI_Y[0] + "–" + DEI_Y[DEI_Y.length - 1];
    var sub = "Dot: pre-DEI (" + pre + "). Arrow head: DEI era (" + dei + "). Values: pre-DEI → DEI. " +
      (pp ? "Per-year gap from " + res.ref : "Per-year acceptance rate") +
      ", averaged within each era, with the change tested on the per-year values (Welch t-test) " +
      "and Benjamini-Hochberg corrected (m = " + res.m + "); red: significant change; grey: no clear change. " +
      "2020 is the changeover year, in neither era.";
    setChartHead((pp ? "Acceptance-rate gap vs " + res.ref : "Acceptance rate") + " by " +
      label.toLowerCase() + ", pre-DEI vs DEI era" + (pp ? " (percentage points)" : " (%)"), sub);
  }
  function renderEraTable() {
    var res = computeEra(), pp = res.mode === "vsref", unit = pp ? " pp" : "%";
    setEraHead(res);
    var tbl = document.getElementById("table"), srt = state.eraSort;
    var rows = res.rows.filter(function (r) { return r.pre.mean != null && r.dei.mean != null; })
      .map(function (r) {
        return { group: r.group, pre: r.pre.mean, dei: r.dei.mean, change: r.change,
          sig: r.testable && r.sig, pRaw: r.testable ? r.raw_p : null, pBh: r.testable ? r.p_bh : null };
      });
    rows = sortRows(rows, srt, ["group"]);
    function v(x) { return x == null ? "&mdash;" : x.toFixed(1) + unit; }
    var h = '<table class="datatable"><thead><tr>' + sortTh(srt, "Group", "group", true) +
      sortTh(srt, "Pre-DEI", "pre") + sortTh(srt, "DEI", "dei") + sortTh(srt, "Change", "change") +
      sortTh(srt, "Raw p", "pRaw") + sortTh(srt, "p (BH)", "pBh") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var chCell = "<td" + (r.sig ? ' style="color:' + RED + ';font-weight:600"' : "") + ">" +
        (r.change == null ? "&mdash;" : (r.change >= 0 ? "+" : "") + r.change.toFixed(1) + " pp") + "</td>";
      h += "<tr><td style='text-align:left'>" + r.group + "</td><td>" + v(r.pre) + "</td><td>" +
        v(r.dei) + "</td>" + chCell + "<td>" + fmtP(r.pRaw) + "</td><td>" + fmtP(r.pBh) + "</td></tr>";
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
  function computeRep(years) {
    var ch = state.characteristic, cfg = REP[ch]; if (!cfg) return null;
    var census = window.CENSUS[cfg.census], cats = Object.keys(census);
    years = years || repYears();
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
      benchLabel: "age-adjusted population share (England and Wales, Census 2021)",
      annoLabel: "Age-adjusted population (Census 2021)", popWord: "age-adjusted population",
      colHdr: "Age-adj. pop. %" };
    if (ch === "SOCIO-ECONOMIC BACKGROUND") return {
      benchLabel: "equal-fifths benchmark of 20% per quintile",
      annoLabel: "Equal fifths (20%)", popWord: "equal share", colHdr: "Equal share %" };
    return {
      benchLabel: "population share (England and Wales, Census 2021)",
      annoLabel: "Population (Census 2021)", popWord: "population", colHdr: "Population %" };
  }
  // ==========================================================================
  // WHO APPLIES, WHO GETS IN (the "rep" tab): each group's share of applicants
  // and of acceptances, either as plain shares that move year by year ("share",
  // formerly Mix on Over time) or as the gap from a population benchmark ("gap",
  // formerly Representation). The rows are the source groups; compared with the
  // population they are the Census categories (groups pooled to match the Census,
  // exactly as Representation always did). Shares, totals and suppression follow
  // shareTotals and computeRep: a withheld acceptance count drops that group-year
  // from both its share and the total, never counted as zero.
  // ==========================================================================
  var MIX_MS = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? 0 : 450;
  function repHasBench() { return !!REP[state.characteristic]; }
  function repKind() { return repHasBench() && state.repKind === "gap" ? "gap" : "share"; }
  function repCensus() { return repHasBench() && (repKind() === "gap" || state.repPop); }
  // every row the current setting can show, in display order for the Census
  function repUnits() {
    var ch = state.characteristic;
    if (repCensus()) return Object.keys(window.CENSUS[REP[ch].census]).map(function (c) { return { key: c, label: c }; });
    var hidden = trendHidden(ch);
    return (byChar[ch] || []).filter(function (g) { return hidden.indexOf(g.group) === -1; })
      .map(function (g) { return { key: g.group, label: g.group, group: g }; });
  }
  // Census categories are all shown until unticked; source groups share the
  // Over time selection, so a group ticked there is ticked here too
  function repIsSel(u) { return repCensus() ? state.repSel[u.key] !== false : !!state.selected[u.key]; }
  // shares of every row over some years
  function repCompute(years) {
    var out = { byKey: {}, appTot: 0, accTot: 0 };
    if (repCensus()) {
      var res = computeRep(years); if (!res) return out;
      out.appTot = res.appTot; out.accTot = res.accTot;
      res.rows.forEach(function (r) {
        out.byKey[r.cat] = { app_n: r.app_n, acc_n: r.acc_n, appPct: res.appTot ? r.appPct : null,
          accPct: res.accTot ? r.accPct : null, popApp: r.popApp, popAcc: r.popAcc };
      });
      return out;
    }
    var tot = shareTotals(state.characteristic);
    years.forEach(function (y) { if (tot[y]) { out.appTot += tot[y].app; out.accTot += tot[y].acc; } });
    repUnits().forEach(function (u) {
      var p = Stats.poolGroup(u.group, years);
      out.byKey[u.key] = { app_n: p.app, acc_n: p.acc,
        appPct: out.appTot ? 100 * p.app / out.appTot : null, accPct: out.accTot ? 100 * p.acc / out.accTot : null };
    });
    return out;
  }
  // The rows shown for some years: the ticked rows, or one combined row. A
  // combined row adds up only the years in which every ticked row is reported,
  // so a withheld count is never treated as zero inside the sum.
  function repRows(years) {
    var units = repUnits().filter(repIsSel), all = repCompute(years);
    function row(u) {
      var v = all.byKey[u.key] || {}, missing = !v.app_n;
      return { key: u.key, label: u.label, app_n: v.app_n || 0, acc_n: v.acc_n || 0,
        appPct: missing ? null : v.appPct, accPct: missing ? null : v.accPct,
        popApp: v.popApp, popAcc: v.popAcc, missing: missing };
    }
    if (!(state.combine && units.length > 1))
      return { rows: units.map(row), appTot: all.appTot, accTot: all.accTot, combined: false };
    var na = 0, nc = 0, da = 0, dc = 0, used = 0;
    years.forEach(function (y) {
      var one = repCompute([y]), ok = one.appTot > 0;
      units.forEach(function (u) { var v = one.byKey[u.key]; if (!v || !v.app_n) ok = false; });
      if (!ok) return;
      used++; da += one.appTot; dc += one.accTot;
      units.forEach(function (u) { na += one.byKey[u.key].app_n; nc += one.byKey[u.key].acc_n; });
    });
    var pa = null, pc = null;
    if (repCensus()) {
      pa = 0; pc = 0;
      units.forEach(function (u) { var v = all.byKey[u.key] || {}; pa += v.popApp || 0; pc += v.popAcc || 0; });
    }
    return { rows: [{ key: "__combined__", label: "Combined: " + units.map(function (u) { return u.label; }).join(" + "),
      app_n: na, acc_n: nc, appPct: used && da ? 100 * na / da : null, accPct: used && dc ? 100 * nc / dc : null,
      popApp: pa, popAcc: pc, missing: !used, partYears: used && used < years.length ? used : 0 }],
      appTot: da, accTot: dc, combined: true, parts: units.length };
  }
  // source groups: largest applicant share in the last year with data at the top,
  // fixed whatever year is shown, so the bars keep their places while playing
  function repOrder(rows) {
    if (repCensus() || rows.length < 2) return rows;
    var ys = playYearsFor("rep"), by = repCompute(ys.length ? [ys[ys.length - 1]] : repYears()).byKey;
    function v(r) { var x = by[r.key]; return x && x.app_n ? x.appPct : -1; }
    return rows.slice().sort(function (a, b) { return v(b) - v(a); });
  }
  function repFirstYear() { var ys = playYearsFor("rep"); return ys.length ? ys[0] : FIRST_YEAR; }
  // why a row has no bar: withheld (hidden) or not reported (no data)
  function repMissingText(r) {
    var single = state.repYearFrom === state.repYearTo, when = single ? " this year" : " in these years";
    if (r.key === "__combined__") return "hidden or not reported" + when;
    if (!repCensus() && single) {
      var g = getGroup(state.characteristic, r.key), row = null;
      if (g) g.by_year.forEach(function (x) { if (x.year === state.repYearFrom) row = x; });
      return (row && row.accepted == null ? "hidden" : "no data") + when;
    }
    return "hidden or not reported" + when;
  }
  function repShowWords() {
    var a = state.numShow !== "accepted", c = state.numShow !== "applicants";
    return a && c ? "applicants and of acceptances" : a ? "applicants" : "acceptances";
  }
  function setRepHead(R) {
    var ch = state.characteristic, label = CHAR_LABELS[ch].replace(" (detailed)", "").toLowerCase();
    var yrs = rangeLabel(state.repYearFrom, state.repYearTo), b = repHasBench() ? repBench(ch) : null;
    var comb = R && R.combined ? " Combined: the ticked " + (repCensus() ? "categories" : "groups") +
      " added together; a year in which any of them is hidden or not reported is left out of the combined bar" +
      (R.rows[0] && R.rows[0].partYears ? " (here " + R.rows[0].partYears + " of the years)" : "") + "." : "";
    if (repKind() === "gap") {
      var a = state.numShow !== "accepted", c = state.numShow !== "applicants";
      setChartHead("Share of " + repShowWords() + " vs the " +
        (ch === "SOCIO-ECONOMIC BACKGROUND" ? "equal-fifths benchmark" : ch === "DISABILITY" ? "age-adjusted population" : "population") +
        ", " + label + ", " + yrs + " (percentage points)",
        (a && c ? "Blue: applicants. Red: accepted. " : a ? "Blue: applicants. " : "Red: accepted. ") +
        "Each bar is the group's share minus its " + b.benchLabel + "." + comb);
      return;
    }
    var y0 = repFirstYear();
    setChartHead("Share of " + repShowWords() + ", " + label + ", " + yrs + " (%)",
      "Each group's share of everyone who answered this question in " + yrs + "; across all the groups of this " +
      "characteristic each colour adds up to 100%. Prefer-not-to-say is not counted." +
      (repCensus() ? " Groups are pooled to match the Census categories. Diamonds: the " + b.benchLabel + "." : "") +
      (state.repStart ? " Black ticks: each bar's share in " + y0 + "." : "") + comb +
      " Press Play or move the slider to change the year. A group whose acceptance count is withheld that year is left out " +
      "of that year's total and never counted as zero; 'no data' means the source did not report it.");
  }
  function repNoRows() {
    setChartHead("No groups ticked", "Tick at least one group in Groups shown.");
  }
  function renderRepTable() {
    var tbl = document.getElementById("table"), R = repRows(repYears()), rows = repOrder(R.rows);
    setRepHead(R);
    if (!rows.length) { repNoRows(); tbl.innerHTML = ""; return; }
    var census = repCensus(), gap = census, b = census ? repBench(state.characteristic) : null, srt = state.repSort;
    var a = state.numShow !== "accepted", c = state.numShow !== "applicants";
    var data = rows.map(function (r) {
      return { cat: r.label, missing: r.missing, bench: r.popApp, app: r.appPct, acc: r.accPct,
        appdev: r.appPct == null || r.popApp == null ? null : r.appPct - r.popApp,
        accdev: r.accPct == null || r.popAcc == null ? null : r.accPct - r.popAcc };
    });
    if (srt.col) data.sort(function (x, y) {
      var vx = srt.col === "group" ? x.cat.toLowerCase() : x[srt.col], vy = srt.col === "group" ? y.cat.toLowerCase() : y[srt.col];
      if (vx == null) vx = -Infinity; if (vy == null) vy = -Infinity;
      return vx < vy ? -srt.dir : vx > vy ? srt.dir : 0;
    });
    function th(label, col, left) {
      var active = srt.col === col, glyph = active ? (srt.dir > 0 ? "▲" : "▼") : "↕";
      return '<th data-sort="' + col + '"' + (left ? ' style="text-align:left"' : "") +
        ' title="Click to sort">' + label + '<span class="sarr' + (active ? " on" : "") + '">' + glyph + "</span></th>";
    }
    function pct(x) { return x == null ? "&mdash;" : x.toFixed(1); }
    function pp(x) { return x == null ? "&mdash;" : sgn1(x) + " pp"; }
    var h = '<table class="datatable"><thead><tr>' + th("Group", "group", true) + (census ? th(b.colHdr, "bench") : "") +
      (a ? th("Applicants %", "app") + (gap ? th("Applicants vs benchmark", "appdev") : "") : "") +
      (c ? th("Accepted %", "acc") + (gap ? th("Accepted vs benchmark", "accdev") : "") : "") + "</tr></thead><tbody>";
    data.forEach(function (r) {
      h += "<tr><td style='text-align:left'>" + escAnn(r.cat) + (r.missing ? " (no data)" : "") + "</td>" +
        (census ? "<td>" + pct(r.bench) + "</td>" : "") +
        (a ? "<td>" + pct(r.app) + "</td>" + (gap ? "<td>" + pp(r.appdev) + "</td>" : "") : "") +
        (c ? "<td>" + pct(r.acc) + "</td>" + (gap ? "<td>" + pp(r.accdev) + "</td>" : "") : "") + "</tr>";
    });
    h += "</tbody></table>";
    tbl.innerHTML = h;
  }
  function renderRep() {
    if (repKind() === "gap") renderRepGap(); else renderRepShares();
  }
  function repEmpty() {
    repNoRows(); var gd = document.getElementById("chart"); gd._mixKey = null; Plotly.purge(gd);
  }
  // Shares: bars for one year (or a pooled range) that move when the year changes.
  // Rows sit on a numeric axis so each bar carries its own marks: the population
  // share (diamond) and the share in the first year (tick), for applicants on the
  // blue bar and for acceptances on the red one. Each value sits just past the
  // furthest of its bar and marks, so nothing covers it.
  function renderRepShares() {
    var ch = state.characteristic, narrow = narrowView(), census = repCensus();
    var showApp = state.numShow !== "accepted", showAcc = state.numShow !== "applicants", both = showApp && showAcc;
    var R = repRows(repYears()), rows = repOrder(R.rows), yrs = rangeLabel(state.repYearFrom, state.repYearTo);
    setRepHead(R);
    if (!rows.length) { repEmpty(); return; }
    var y0 = repFirstYear(), startBy = {};
    if (state.repStart) repRows([y0]).rows.forEach(function (r) { startBy[r.key] = r; });
    var names = rows.map(function (r) { return r.label; });
    var series = [];
    if (showApp) series.push({ app: true, color: BLUE, name: "Applicants", word: "applicants", off: both ? -0.18 : 0 });
    if (showAcc) series.push({ app: false, color: RED, name: "Accepted", word: "acceptances", off: both ? 0.18 : 0 });
    var bw = both ? 0.34 : 0.56;
    var traces = [], xmax = 1, ann = [];
    series.forEach(function (sr) {
      var xs = rows.map(function (r) { return sr.app ? r.appPct : r.accPct; });
      traces.push({ type: "bar", orientation: "h", name: sr.name, x: xs, width: bw,
        y: rows.map(function (_, i) { return i + sr.off; }), marker: { color: sr.color }, customdata: names,
        hovertemplate: "%{customdata}<br>" + yrs + ": %{x:.1f}% of " + sr.word + "<extra></extra>" });
    });
    var tickSize = Math.round((narrow ? (both ? 50 : 34) : (both ? 54 : 36)) * bw * 0.8) + 2;   // a little taller than its bar
    if (state.repStart) {
      var tx = [], ty = [], tc = [];
      series.forEach(function (sr) { rows.forEach(function (r, i) {
        var t = startBy[r.key], v = t ? (sr.app ? t.appPct : t.accPct) : null;
        tx.push(v); ty.push(i + sr.off); tc.push(r.label + "<br>" + y0 + ": " + (v == null ? "no data" : v.toFixed(1) + "% of " + sr.word));
      }); });
      traces.push({ type: "scatter", mode: "markers", name: "Share in " + y0, x: tx, y: ty, text: tc,
        marker: { symbol: "line-ns", size: tickSize, line: { color: INK, width: 2 } },
        hovertemplate: "%{text}<extra></extra>" });
    }
    if (census) {
      var px = [], py = [], pc = [], bw2 = repBench(ch);
      series.forEach(function (sr) { rows.forEach(function (r, i) {
        var v = sr.app ? r.popApp : r.popAcc;
        px.push(v); py.push(i + sr.off); pc.push(r.label + "<br>" + bw2.popWord + ": " + (v == null ? "n/a" : v.toFixed(1) + "%"));
      }); });
      traces.push({ type: "scatter", mode: "markers", name: bw2.annoLabel, x: px, y: py, text: pc,
        marker: { symbol: "diamond", size: narrow ? 9 : 10, color: BG, line: { color: "#6d6252", width: 2 } },
        hovertemplate: "%{text}<extra></extra>" });
    }
    traces.forEach(function (t) { t.x.forEach(function (v) { if (v != null && isFinite(v)) xmax = Math.max(xmax, v); }); });
    var lock = playLock("rep"), range = lock ? lock.range.slice() : [0, xmax * 1.16];
    ann.push({ xref: "paper", yref: "paper", x: 1, y: 0.01, xanchor: "right", yanchor: "bottom", showarrow: false,
      text: yrs, font: { size: narrow ? 30 : 52, color: "#d8c8ad" } });
    // fixed label slots (one value per bar, one note per row), empty when not
    // needed: the bar animation replaces annotations slot by slot
    series.forEach(function (sr) { rows.forEach(function (r, i) {
      var v = sr.app ? r.appPct : r.accPct, far = v;
      if (v != null) {
        var t = startBy[r.key], tv = state.repStart && t ? (sr.app ? t.appPct : t.accPct) : null;
        var pv = census ? (sr.app ? r.popApp : r.popAcc) : null;
        [tv, pv].forEach(function (m) { if (m != null && isFinite(m)) far = Math.max(far, m); });
      }
      ann.push({ xref: "x", yref: "y", x: v == null ? 0 : far, y: i + sr.off, xanchor: "left", xshift: v == null ? 0 : 7,
        showarrow: false, text: v == null ? "" : v.toFixed(1) + "%", font: { size: narrow ? 11.5 : 12, color: INK } });
    }); });
    rows.forEach(function (r, i) {
      ann.push({ xref: "x", yref: "y", x: 0, y: i, xanchor: "left", xshift: 8, showarrow: false,
        text: r.missing ? repMissingText(r) : "", font: { size: 12, color: MUTED } });
    });
    var per = both ? (narrow ? 50 : 54) : (narrow ? 34 : 36);
    // phones stack the legend one entry per line: give it its own height, so the rows keep theirs
    var legendH = narrow ? traces.length * 20 : 0;
    var layout = { paper_bgcolor: BG, plot_bgcolor: BG, height: Math.max(260, rows.length * per + 90 + legendH),
      font: { family: "Inter, system-ui, sans-serif", color: "#1a1a1a", size: 13 },
      margin: { t: 30 + legendH, r: narrow ? 22 : 24, b: 40, l: 10 }, barmode: "overlay",
      hovermode: "closest", showlegend: true,
      legend: { orientation: "h", x: 0, y: 1, yanchor: "bottom", bgcolor: "rgba(0,0,0,0)", font: { size: narrow ? 11.5 : 12 } },
      xaxis: applyX("rep", { range: range, ticksuffix: "%", showgrid: true, gridcolor: GRID, zeroline: false,
        linecolor: AXISLINE, tickcolor: AXISLINE, fixedrange: true }),
      yaxis: { range: [rows.length - 0.5, -0.6], autorange: false, automargin: true, showgrid: false, zeroline: false,
        fixedrange: true, tickmode: "array", tickvals: rows.map(function (_, i) { return i; }),
        ticktext: rows.map(function (r) { return wrapLabel(escAnn(r.label), narrow ? 14 : 30); }),
        tickfont: { size: narrow ? 12 : 13, color: INK }, ticklabelstandoff: 6 },
      annotations: ann };
    var gd = document.getElementById("chart");
    gd._smallMult = false;
    gd._fitMax = Math.round(layout.height * 1.5);
    var key = [ch, census, names.join("|"), state.numShow, state.repStart, state.combine, narrow, deskPolish(),
      Math.floor(gd.getBoundingClientRect().width)].join("~");
    if (state._mixAnim && MIX_MS && !state.exporting && gd._fullLayout && gd._mixKey === key) {
      state._mixAnim = false;
      gd._animUntil = Date.now() + MIX_MS + 60;
      Plotly.animate(gd, { data: traces, layout: { annotations: ann, xaxis: { range: layout.xaxis.range } } },
        { transition: { duration: MIX_MS, easing: "cubic-in-out" }, frame: { duration: MIX_MS, redraw: false } });
      return;
    }
    state._mixAnim = false;
    Plotly.react("chart", traces, lockZoom(phoneAxes(layout)), PLOT_CFG);
    if (!state.exporting) gd._mixKey = key;
  }
  // Vs population: each row's share minus its benchmark, in percentage points.
  function renderRepGap() {
    var ch = state.characteristic, narrow = narrowView();
    var showApp = state.numShow !== "accepted", showAcc = state.numShow !== "applicants", both = showApp && showAcc;
    var R = repRows(repYears()), rows = R.rows;
    setRepHead(R);
    if (!rows.length) { repEmpty(); return; }
    document.getElementById("chart")._mixKey = null;
    var b = repBench(ch), annoLabel = b.annoLabel, popWord = b.popWord;
    var ys = rows.map(function (r) { return r.label; });
    function dev(r, app) { var s = app ? r.appPct : r.accPct, p = app ? r.popApp : r.popAcc; return s == null || p == null ? null : s - p; }
    function tx(app) {
      return rows.map(function (r) {
        var s = app ? r.appPct : r.accPct, pop = app ? r.popApp : r.popAcc;
        if (s == null) return r.label + "<br>" + repMissingText(r);
        var d = s - pop, ratio = pop > 0 ? s / pop : null;
        return r.label + "<br>" + (app ? "Applicants" : "Accepted") + " " + s.toFixed(1) + "% vs " + popWord + " " +
          pop.toFixed(1) + "%<br>" + sgn1(d) + " pp" + (ratio != null ? " (" + ratio.toFixed(2) + "x)" : "");
      });
    }
    var ylab = wrapLabels(ys), series = [];
    if (showApp) series.push({ app: true, color: BLUE, name: "Applicants" });
    if (showAcc) series.push({ app: false, color: RED, name: "Accepted" });
    var traces = series.map(function (sr) {
      return { y: ylab, x: rows.map(function (r) { return dev(r, sr.app); }), name: sr.name, type: "bar", orientation: "h",
        marker: { color: sr.color }, textposition: "none", hovertemplate: "%{text}<extra></extra>", text: tx(sr.app) };
    });
    var idx = ys.map(function (_, i) { return i; });
    if (narrow) {
      // phones: numeric rows so the name can sit above its bars, full width
      if (both) {
        traces[0].y = idx.map(function (i) { return i - 0.08; }); traces[0].width = 0.32;
        traces[1].y = idx.map(function (i) { return i + 0.26; }); traces[1].width = 0.32;
      } else { traces[0].y = idx.map(function (i) { return i + 0.09; }); traces[0].width = 0.4; }
    }
    var annos = [{ x: 0, xref: "x", y: 1.0, yref: "paper", yanchor: "bottom", xanchor: "center", text: annoLabel,
      showarrow: false, font: { size: 10.5, color: "#7a6c55" } }];
    var repX = null, rlock = playLock("rep"), vals = [0];
    traces.forEach(function (t) { t.x.forEach(function (v) { if (v != null) vals.push(v); }); });
    rows.forEach(function (r, i) {
      if (r.missing) annos.push({ xref: "paper", x: narrow ? 0 : 0.02, xanchor: "left", yref: "y", y: narrow ? i + 0.09 : ylab[i],
        showarrow: false, text: repMissingText(r), font: { size: 12, color: MUTED } });
    });
    if (narrow) {
      // phones: the name above its bars, each value at its own bar's end
      // (outside right for a positive bar, outside left for a negative one)
      ys.forEach(function (c, i) {
        annos.push({ xref: "paper", x: 0, xanchor: "left", yref: "y", y: i - 0.3, yanchor: "bottom", showarrow: false,
          text: escAnn(c), font: { size: 12, color: INK }, bgcolor: BG });
        traces.forEach(function (t, k) {
          var v = t.x[i]; if (v == null) return;
          annos.push({ xref: "x", x: v, yref: "y", y: t.y[i], xanchor: v >= 0 ? "left" : "right",
            xshift: v >= 0 ? 4 : -4, showarrow: false, text: sgn1(v), font: { size: 12, color: series[k].color } });
        });
      });
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      repX = padRange(lo, hi, lo < 0 ? LABEL_PAD : 0.03, hi > 0 ? LABEL_PAD : 0.03);
    }
    // play lock: one axis over every year, so the bars compare by eye
    if (rlock) repX = narrow ? padRange(rlock.range[0], rlock.range[1], LABEL_PAD, LABEL_PAD) : rlock.range.slice();
    var layout = {
      paper_bgcolor: BG, plot_bgcolor: BG, height: Math.max(280, ys.length * (narrow ? (both ? 76 : 60) : (both ? 64 : 44)) + 70),
      font: { family: "Inter, system-ui, sans-serif", color: "#1a1a1a", size: 13 },
      margin: narrow ? { t: 30, r: 12, b: 40, l: 10 } : { t: 26, r: 26, b: 56, l: 168 },
      barmode: narrow ? "overlay" : "group", bargap: 0.4, bargroupgap: 0.12,
      xaxis: applyX("rep", { ticksuffix: narrow ? "" : " pp", tickformat: "+,", showgrid: true, gridcolor: GRID,
        range: repX || undefined, autorange: repX ? false : undefined,
        zeroline: false, linecolor: AXISLINE, tickcolor: AXISLINE, tickfont: { size: 12 } }),
      yaxis: narrow ? { tickvals: [], autorange: "reversed", showgrid: false, zeroline: false, showline: false,
          range: [ys.length - 0.45, -0.75] }
        : { automargin: true, autorange: "reversed", showgrid: false, zeroline: false,
          linecolor: AXISLINE, tickcolor: AXISLINE, tickfont: { size: 12.5, color: INK } },
      showlegend: !narrow,
      legend: { orientation: "h", y: -0.18, bgcolor: "rgba(0,0,0,0)", font: { size: 12 } },
      hovermode: "closest",
      shapes: [{ type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1,
        line: { color: "#7a6f5a", width: 1.4, dash: "dot" } }],
      annotations: annos
    };
    Plotly.react("chart", traces, lockZoom(phoneAxes(layout)), PLOT_CFG);
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
  function fmtAcc(r) { return r.suppressed ? '<span class="supp">suppressed</span>' : r.accepted.toLocaleString("en-GB"); }

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
      ? "Applicants, accepted, and acceptance rate pooled over " + range + ", with 95% Wilson " +
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
        "<td>" + r.applicants.toLocaleString("en-GB") + "</td><td>" + fmtAcc(r) + "</td><td>" + fmtRate(r) +
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
  // Plain title only above the chart (house rule, Nov 2026); the explanatory text
  // becomes the footnote under the chart (updateNote), as on the blog.
  function setChartHead(title, sub) {
    document.getElementById("chart-head").innerHTML = '<div class="chart-title">' + title + "</div>";
    state.sub = sub || "";
  }
  // Lock the charts: no click-drag zoom, scroll zoom, or double-click reset, but
  // keep hover tooltips. fixedrange on both axes is the bulletproof way.
  function lockZoom(layout) {
    layout.dragmode = false;
    // Plotly.react reuses the width it measured last time and only re-measures on
    // a window resize, so after the phone switch (or a view that was hidden) the
    // chart would overflow or underfill its card. Give it the card's width now.
    var gd = document.getElementById("chart");
    var cw = gd ? Math.floor(gd.getBoundingClientRect().width) : 0;   // floor: never 1 px wider than the card
    if (cw) layout.width = cw;
    // Desktop: draw to the height the card has left, so the page never scrolls.
    // The chart may shrink to about half its usual height; past that (a very long
    // forest on a short screen) it keeps its size and scrolls inside the card.
    // Off Over time, a few rows never stretch past twice their usual height.
    if (gd && deskPolish()) {
      var avail = Math.floor(gd.clientHeight), natural = layout.height || 450;
      // full screen: let a long chart squeeze further, so it fits without scrolling
      var minH = Math.min(natural, Math.max(220, Math.round(natural * (isMax() ? 0.3 : 0.55))));
      if (gd._fitMin) minH = Math.max(minH, gd._fitMin);
      var maxH = gd._fitMax || (state.view === "trend" ? Infinity : natural * 2);
      if (avail > 0) layout.height = Math.max(minH, Math.min(maxH, avail));
      gd._fitAvail = avail;
    }
    ["xaxis", "yaxis"].forEach(function (k) { if (layout[k]) layout[k].fixedrange = true; });
    return layout;
  }
  var PLOT_CFG = { responsive: true, displayModeBar: false, scrollZoom: false, doubleClick: false };

  // Desktop chart polish (Nov 2026 redesign), on screen only: never in a PNG
  // export (the blog chart style stays) and never in the phone layout. The axis
  // title becomes a level unit label above the plot; lines get thicker with a
  // beige ring on each point; Rate and Vs reference name each line at its end
  // instead of a legend; the chart grows to fill the window.
  var GRID_SOFT = "#ddd0bb";
  function deskPolish() { return !state.exporting && !narrowView() && !isAppShell(); }
  function deskTrendLayout(layout, traces, lineLabels) {
    var yt = layout.yaxis.title; yt = typeof yt === "string" ? yt : (yt && yt.text) || "";
    layout.yaxis.title = { text: "" };
    Object.assign(layout.yaxis, { ticks: "", showline: false, gridcolor: GRID_SOFT, ticklabelstandoff: 10,
      tickfont: { size: 12.5, color: MUTED } });
    Object.assign(layout.xaxis, { ticklen: 4, tickfont: { size: 12.5, color: MUTED } });
    var widest = 0;
    if (lineLabels) traces.forEach(function (t) {
      if (t.name && t.showlegend !== false) wrapLabel(t.name, 22).split("<br>").forEach(function (l) {
        widest = Math.max(widest, l.length); });
    });
    layout.margin = { t: 40, l: layout.margin.l, b: lineLabels ? 40 : layout.margin.b,
      r: lineLabels ? Math.min(240, Math.max(60, Math.round(widest * 7.8) + 24)) : layout.margin.r };
    if (lineLabels) layout.showlegend = false;
    if (yt) layout.annotations = (layout.annotations || []).concat([{ xref: "paper", yref: "paper", x: 0, y: 1,
      xanchor: "left", yanchor: "bottom", xshift: -(layout.margin.l - 8), yshift: 14, showarrow: false, align: "left",
      text: escAnn(yt), font: { size: 12.5, color: MUTED } }]);
    traces.forEach(function (t) {
      if (!/lines/.test(t.mode || "")) return;
      t.line = Object.assign({}, t.line, { width: 2.6 });
      t.marker = Object.assign({}, t.marker, { size: 7.5, line: { color: BG, width: 1.5 } });
    });
  }
  // Name each line at its right end, in its colour, nudged apart so no two overlap.
  function deskLineLabels(gd) {
    var fl = gd._fullLayout; if (!fl || !fl.yaxis || !gd.data) return Promise.resolve();
    var labs = [];
    gd.data.forEach(function (t) {
      if (!t.name || !/lines/.test(t.mode || "") || t.showlegend === false || !t.y) return;
      for (var k = t.y.length - 1; k >= 0; k--) if (t.y[k] != null) {
        var txt = wrapLabel(t.name, 22);
        labs.push({ text: txt, y: t.y[k], c: t.line.color, px: fl.yaxis.l2p(t.y[k]),
          h: txt.split("<br>").length * 17 + 4 });
        break;
      }
    });
    labs.sort(function (a, b) { return a.px - b.px; });
    var pos = labs.map(function (l) { return l.px; });
    for (var it = 0; it < 60; it++) for (var j = 1; j < pos.length; j++) {
      var need = (labs[j - 1].h + labs[j].h) / 2, d = pos[j] - pos[j - 1];
      if (d < need) { var m = (need - d) / 2; pos[j - 1] -= m; pos[j] += m; }
    }
    var ann = (gd.layout.annotations || []).filter(function (a) { return a.name !== "desklab"; });
    labs.forEach(function (l, i) {
      ann.push({ name: "desklab", xref: "paper", x: 1, xanchor: "left", xshift: 10, yref: "y", y: l.y,
        yanchor: "middle", yshift: l.px - pos[i], showarrow: false, align: "left",
        text: "<b>" + l.text.split("<br>").map(escAnn).join("<br>") + "</b>", font: { size: 13, color: l.c } });
    });
    return Plotly.relayout(gd, { annotations: ann });
  }
  // Compare groups: a soft band behind each row, from the group name to its
  // value, and a "Group" heading over the names (placed once the names' width is known).
  function deskRowBands(gd, n) {
    var sz = gd._fullLayout && gd._fullLayout._size; if (!sz) return Promise.resolve();
    var x0 = -(sz.l - 2) / sz.w, x1 = 1 + (sz.r - 2) / sz.w;
    var shapes = (gd.layout.shapes || []).filter(function (s) { return s.name !== "deskband"; });
    for (var i = 0; i < n; i++) shapes.unshift({ name: "deskband", type: "rect", layer: "below", xref: "paper", yref: "y",
      x0: x0, x1: x1, y0: i - 0.44, y1: i + 0.44, fillcolor: "rgba(255,255,255,.30)", line: { width: 0 } });
    var ann = (gd.layout.annotations || []).filter(function (a) { return a.name !== "deskhead"; });
    ann.push({ name: "deskhead", xref: "paper", yref: "paper", x: x0, y: 1, xanchor: "left", yanchor: "bottom",
      xshift: 10, yshift: 10, showarrow: false, text: "Group", font: { size: 12, color: MUTED } });
    return Plotly.relayout(gd, { shapes: shapes, annotations: ann });
  }
  // The group list doubles as the colour key: a dot in each drawn line's colour.
  function deskRailDots(traces) {
    document.querySelectorAll("#group-list label.grp").forEach(function (l) {
      var span = l.querySelector("span:not(.c-dot)");
      var base = span ? span.textContent.replace(/\s*\(reference\)|[*\u2020]/g, "").trim() : "";
      var t = traces.filter(function (d) { return d.name && d.line && (d.name === base || d.name.indexOf(base + ":") === 0); })[0];
      // Combine: every ticked group feeds the one pooled line
      if (!t && traces.length === 1 && /^Combined/.test(traces[0].name || "")) t = traces[0];
      var dot = l.querySelector(".c-dot");
      if (!dot) { dot = document.createElement("span"); dot.className = "c-dot"; dot.setAttribute("aria-hidden", "true"); l.appendChild(dot); }
      var on = !!t && l.querySelector("input").checked;
      dot.className = "c-dot" + (on ? "" : " off");
      dot.style.background = on ? t.line.color : "";
    });
  }
  // Signed axes ("+,") label zero as "+0"; zero has no sign. Plotly has no format
  // for "sign except at zero", so the label is corrected after drawing (on screen)
  // or fixed as explicit ticks (in the PNG export).
  var SIGNED_ZERO = /^\+0(\.0+)?( pp|%|x)?$/;
  function unsignZero(gd) {
    gd.querySelectorAll(".xtick text, .ytick text").forEach(function (t) {
      if (SIGNED_ZERO.test(t.textContent)) t.textContent = t.textContent.slice(1); });
  }
  function unsignZeroExport(gd) {
    var ax = gd._fullLayout && gd._fullLayout.xaxis, v = ax && ax._vals;
    if (!v || !v.some(function (t) { return SIGNED_ZERO.test(t.text); })) return Promise.resolve();
    return Plotly.relayout(gd, { "xaxis.tickmode": "array",
      "xaxis.tickvals": v.map(function (t) { return t.x; }),
      "xaxis.ticktext": v.map(function (t) { return SIGNED_ZERO.test(t.text) ? t.text.slice(1) : t.text; }) });
  }
  // Narrow viewport (phones): used to shrink the big left label margins so the plot
  // area is not crushed. Plotly automargin still keeps labels from being clipped.
  // Phone chart layout: the PNG being made decides while exporting; otherwise the
  // "Phone layout" switch (On / Off), or on Auto the screen width.
  function narrowView() {
    if (state.exporting) return state.exporting === "phone";
    if (state.phoneMode === "on") return true;
    if (state.phoneMode === "off") return false;
    return window.innerWidth < 640;
  }
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
  // PNG in the blog's mobile-first shape: 400 px wide at 4.125x (1,650 px, the
  // width of the blog charts), plain title, the chart drawn in its phone layout
  // (names above rows), the footnote, and the source mark.
  function downloadChart(returnUrl, opts) {
    if (returnUrl && returnUrl.type) returnUrl = false;   // click event, not the test hook
    opts = opts || {};
    var gd = document.getElementById("chart");
    if (!gd || !gd.data || !gd.data.length) return;
    var head = document.getElementById("chart-head");
    var title = (head.querySelector(".chart-title") || {}).textContent || "DClinPsy chart";
    var fmt = state.pngFormat === "wide" ? "wide" : "phone";
    state.exporting = fmt;
    try { render(); } finally { state.exporting = false; }
    var data = JSON.parse(JSON.stringify(gd.data));
    var layout = JSON.parse(JSON.stringify(gd.layout));
    var sub = state.sub;
    render();   // restore the on-screen layout
    // Phone (blog): 400 css px drawn at 4.125x = 1,650 px, the proportions of the
    // blog charts (5.5 in at 300 dpi), so text reads at about 11 px on a 375 px
    // phone; the chart is drawn in its phone layout. Wide: 900 px at 2x, the
    // desktop layout, for slides or wide pages.
    var wide = fmt === "wide";
    var W = wide ? 900 : 400, TW = wide ? 70 : 30, FW = wide ? 150 : 64, SCALE = opts.scale || (wide ? 2 : 4.125);
    var titleLines = wrapAnn(escAnn(title), TW).split("<br>").length;
    var footText = wrapAnn(escAnn(sub + " Source: Clearing House for Postgraduate Courses in Clinical Psychology."), FW);
    var footLines = footText.split("<br>").length;
    var top = 24 + titleLines * 24 + 14, bottom = 40 + footLines * 14 + 30;
    var srcH = layout.height || 480, H = srcH + top + bottom;
    var m = Object.assign({ t: 10, r: 58, b: 44, l: 10 }, layout.margin || {});
    m.t += top; m.b += bottom;
    layout.margin = m; layout.width = W; layout.height = H;
    layout.paper_bgcolor = BG; layout.plot_bgcolor = BG;
    layout.annotations = (layout.annotations || []).concat([
      { xref: "paper", x: 0, yref: "paper", y: 1, yanchor: "bottom", yshift: top - 24 - titleLines * 24 + 8,
        xanchor: "left", xshift: -(m.l - 12), showarrow: false, align: "left",
        text: "<b>" + wrapAnn(escAnn(title), TW) + "</b>",
        font: { size: 18, color: "#1c1a16", family: "Inter, sans-serif" } },
      { xref: "paper", x: 0, yref: "paper", y: 0, yanchor: "top", yshift: -(m.b - bottom + 34),
        xanchor: "left", xshift: -(m.l - 12), showarrow: false, align: "left", text: footText,
        font: { size: 10.5, color: "#5f574a", family: "Inter, sans-serif" } },
      { xref: "paper", x: 1, yref: "paper", y: 0, yanchor: "top", yshift: -(m.b - 20),
        xanchor: "right", showarrow: false, text: "noncogito.substack.com",
        font: { size: 11, color: RED, family: "Inter, sans-serif" } }
    ]);
    var tmp = document.createElement("div");
    tmp.style.cssText = "position:fixed;left:-99999px;top:0;width:" + W + "px;height:" + H + "px;";
    document.body.appendChild(tmp);
    function cleanup() { try { Plotly.purge(tmp); } catch (e) {} tmp.remove(); }
    var done = Plotly.newPlot(tmp, data, layout, { displayModeBar: false, staticPlot: true })
      .then(function () { return unsignZeroExport(tmp); })
      .then(function () { return Plotly.toImage(tmp, { format: "png", width: W, height: H, scale: SCALE }); })
      .then(function (url) {
        if (!returnUrl) {
          var a = document.createElement("a");
          a.href = url; a.download = "dclinpsy-" + slug(title) + ".png";
          document.body.appendChild(a); a.click(); a.remove();
        }
        cleanup(); return url;
      }, function (e) { cleanup(); throw e; });
    return done;
  }
  // Test hook: build the PNG without downloading it (used to check the export).
  function exportPNG() { return downloadChart(true); }
  // ---- Quick controls (phones) ------------------------------------------------
  // A row of the most-used settings for the current view, above the chart. Each
  // one drives the real control in the Options sheet (a click, or a select change),
  // so the two always agree and every existing handler still does the work.
  var QB_SHORT = { "Vs reference": "Vs ref", "Percentage points": "pp", "Rate ratio": "Ratio",
    "Combine Groups": "Combine", "95% CI": "95% CI", "DEI era": "DEI era" };
  function qbSeg(segId, ariaLabel) {
    var real = document.getElementById(segId); if (!real) return null;
    var wrap = document.createElement("div"); wrap.className = "qb-seg"; wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", ariaLabel);
    real.querySelectorAll(".seg-btn").forEach(function (rb) {
      if (rb.hidden) return;
      var b = document.createElement("button"); b.type = "button";
      var t = rb.textContent.trim(); b.textContent = QB_SHORT[t] || t;
      var on = rb.classList.contains("active");
      b.className = on ? "on" : ""; b.setAttribute("aria-pressed", on ? "true" : "false");
      b.addEventListener("click", function () { if (!rb.classList.contains("active")) rb.click(); });
      wrap.appendChild(b);
    });
    return wrap;
  }
  function qbChip(id) {
    var rb = document.getElementById(id); if (!rb) return null;
    var b = document.createElement("button"), on = rb.classList.contains("on"), t = rb.textContent.trim();
    b.type = "button"; b.className = "qb-chip" + (on ? " on" : "");
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.textContent = QB_SHORT[t] || t;
    b.addEventListener("click", function () { rb.click(); });
    return b;
  }
  // One year for Compare groups: sets the pooled window to that single year.
  function qbYear() {
    var sel = document.createElement("select"); sel.className = "qb-select"; sel.setAttribute("aria-label", "Year");
    if (state.yearFrom !== state.yearTo) {
      var o = document.createElement("option"); o.value = ""; o.textContent = state.yearFrom + "–" + state.yearTo;
      o.selected = true; sel.appendChild(o);
    }
    ALL_YEARS.slice().reverse().forEach(function (y) {
      var o = document.createElement("option"); o.value = y; o.textContent = y;
      if (state.yearFrom === y && state.yearTo === y) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      if (!sel.value) return;
      var y = +sel.value, f = document.getElementById("year-from"), t = document.getElementById("year-to");
      state.yearFrom = y; state.yearTo = y; f.value = y; t.value = y;
      render();
    });
    return sel;
  }
  function buildQuickbar() {
    var qb = document.getElementById("quickbar"); if (!qb) return;
    qb.innerHTML = "";
    var v = state.view, items = [];
    if (v === "trend") {
      items.push(qbSeg("trendmode-seg", "Show"));
      if (state.trendMode === "vsref") items.push(qbSeg("trend-measure-seg", "Measure"));
      if (state.trendMode === "numbers") {
        items.push(qbSeg("num-show-seg", "Lines"));
        if (state.characteristic !== "OVERALL") items.push(qbSeg("num-unit-seg", "Unit"));
      }
      if (state.trendMode !== "numbers") items.push(qbChip("toggle-ci"));
      if (!isContext()) items.push(qbChip("toggle-dei"));
      items.push(qbChip("toggle-combine"));
    } else if (v === "forest") {
      items.push(qbYear());
      if (!isSESPairwise()) {
        if (!isOverview()) items.push(qbSeg("measure-seg", "Measure"));
        items.push(qbSeg("forestmode-seg", "View"));
      }
    } else if (v === "era") {
      items.push(qbSeg("eramode-seg", "Show"));
      items.push(qbSeg("eraview-seg", "View"));
    } else if (v === "rep") {
      if (repHasBench()) items.push(qbSeg("repkind-seg", "Show"));
      items.push(qbSeg("rep-show-seg", "Bars"));
      if (repKind() === "share") {
        if (repHasBench()) items.push(qbChip("rep-pop"));
        items.push(qbChip("rep-start"));
      }
      items.push(qbChip("rep-combine"));
      items.push(qbSeg("repmode-seg", "View"));
    } else if (v === "table") {
      items.push(qbSeg("tablemode-seg", "Show"));
    }
    var keep = qb._view === v ? qb.scrollLeft : 0;   // a new view starts the row at its first control
    items.filter(Boolean).forEach(function (el) { qb.appendChild(el); });
    qb.hidden = v === "about" || !qb.children.length;
    qb.scrollLeft = keep; qb._view = v;
  }

  function render() {
    if (!state.exporting) applyPhoneClasses();
    if (state.view !== "trend") state.playYear = null;
    // A Mix bar animation still running would carry over into a different chart
    // (Plotly applies its pending frames to the new traces): start that chart clean.
    var cg = document.getElementById("chart");
    if (cg._animUntil && Date.now() < cg._animUntil && !(state.view === "rep" && repKind() === "share")) {
      cg._animUntil = 0; cg._mixKey = null; Plotly.purge(cg); cg.__zeroHook = false; cg._trendHoverBound = false;
    }
    if (state._lockView !== state.view) { state._lockOn = false; state._lockView = state.view; }
    document.getElementById("chart")._fitMax = 0; document.getElementById("chart")._fitMin = 0;
    var about = document.getElementById("about"), wrap = document.getElementById("chartwrap");
    var tb = document.getElementById("m-toolbar");
    if (tb) tb.hidden = state.view === "about";
    var qbar = document.getElementById("quickbar");
    if (qbar && state.view === "about") qbar.hidden = true;
    // the About page carries its own support button
    var ms = document.querySelector(".mobile-support");
    if (ms) ms.hidden = state.view === "about";
    if (state.view === "about") {
      wrap.style.display = "none"; about.style.display = "block"; return;
    }
    wrap.style.display = ""; about.style.display = "none";
    var repTable = state.view === "rep" && state.repMode === "table";
    var forestTable = state.view === "forest" && state.forestMode === "table" && !isSESPairwise();
    var eraTable = state.view === "era" && state.eraView === "table";
    // the download button and its format picker go together: hidden when there is no chart
    var dl = document.getElementById("dl-group");
    if (dl) dl.hidden = state.view === "table" || isSESPairwise() || repTable || forestTable || eraTable;
    // Hide the forest View toggle when the forest is the SES pairwise matrix (which
    // is itself a table), so the toggle never offers a redundant/empty mode.
    var fvc = document.getElementById("forest-view-ctl");
    if (fvc) fvc.style.display = (state.view === "forest" && isSESPairwise()) ? "none" : "";
    // extra room on the right of forests so the value labels never sit on the data
    // overviews are percentage points only
    var mctl = document.getElementById("measure-ctl");
    if (mctl) mctl.hidden = isOverview();
    if (state.view === "forest") buildLegendKey();
    if (!state.exporting) { syncShared(); if (state.view === "rep") buildRepGroupList(); }
    document.getElementById("legendkey").hidden = state.view !== "forest" || isSESPairwise();
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
      if (!chart.__zeroHook && chart.on) {
        chart.on("plotly_afterplot", function () { unsignZero(chart); }); chart.__zeroHook = true; }
      unsignZero(chart);
    }
    labelTableCells();
    updateNote();
    foldNote();
    if (!state.exporting) { buildQuickbar(); syncPlaybar(); }
  }

  // Play bar: a Play button and a year slider inside the chart card.
  //  - Over time: the lines draw up to the chosen year (Mix: the bars show it).
  //  - Compare groups and Representation: one year at a time. While the slider
  //    or Play drives a single year, the axis range and the row order are held
  //    fixed across every year (the "play lock"), so the years compare by eye.
  var playTimer = null, playView = null;
  var PLAY_MS = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? 1200 : 700;
  var STEP_MS = PLAY_MS === 700 ? 950 : 1300;
  function setPlayIcon(on) {
    var b = document.getElementById("play-btn"); if (!b) return;
    b.querySelector(".play-word").textContent = on ? "Pause" : "Play";
    b.querySelector("path").setAttribute("d", on ? "M4 3h3.5v10H4zM8.5 3H12v10H8.5z" : "M4 2.5l9 5.5-9 5.5z");
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } setPlayIcon(false); }
  // the years a view can step through: those with any data for this characteristic
  var playYearsCache = {};
  function playYearsFor(view) {
    var key = view + "|" + state.characteristic + "|" + state.measure + "|" + (view === "rep" && repCensus() ? "c" : "g");
    if (playYearsCache[key]) return playYearsCache[key];
    var save = view === "forest" ? [state.yearFrom, state.yearTo] : [state.repYearFrom, state.repYearTo], ys = [];
    try {
      ALL_YEARS.forEach(function (y) {
        if (view === "forest") {
          var res = forestFor([y]);
          if (res && res.rows.some(function (r) { return r.computable; })) ys.push(y);
        } else {
          var rr = repCompute([y]); if (rr.appTot > 0 && rr.accTot > 0) ys.push(y);
        }
      });
    } finally {
      if (view === "rep") { state.repYearFrom = save[0]; state.repYearTo = save[1]; }
    }
    return (playYearsCache[key] = ys);
  }
  // what the play bar drives in the current view: its years, the year shown, and how to show another
  function playCfg() {
    var v = state.view;
    if (v === "trend") {
      if (state.trendTo <= state.trendFrom) return null;
      var tys = []; for (var y = state.trendFrom; y <= state.trendTo; y++) tys.push(y);
      return { years: tys, cur: state.playYear == null ? state.trendTo : state.playYear,
        label: null, go: function (y) { state.playYear = y >= state.trendTo ? null : y; } };
    }
    if (v === "forest" && !isSESPairwise() && state.forestMode !== "table") {
      var fys = playYearsFor("forest"); if (fys.length < 2) return null;
      return { years: fys, cur: state.yearTo, label: state.yearFrom === state.yearTo ? null : rangeLabel(state.yearFrom, state.yearTo),
        go: function (y) {
          state.yearFrom = state.yearTo = y;
          var f = document.getElementById("year-from"), t = document.getElementById("year-to");
          if (f) f.value = y; if (t) t.value = y;
        } };
    }
    if (v === "rep" && state.repMode === "chart") {
      var rys = playYearsFor("rep"); if (rys.length < 2) return null;
      return { years: rys, cur: state.repYearTo, label: state.repYearFrom === state.repYearTo ? null : rangeLabel(state.repYearFrom, state.repYearTo),
        go: function (y) {
          state.repYearFrom = state.repYearTo = y; state._mixAnim = repKind() === "share";
          var f = document.getElementById("rep-year-from"), t = document.getElementById("rep-year-to");
          if (f) f.value = y; if (t) t.value = y;
        } };
    }
    return null;
  }
  function syncPlaybar() {
    var bar = document.getElementById("playbar"); if (!bar) return;
    var c = playCfg();
    bar.hidden = !c;
    var gb = document.getElementById("dl-gif");
    if (gb) gb.hidden = !c || document.getElementById("dl-group").hidden;
    if (!c) { stopPlay(); return; }
    var sl = document.getElementById("play-year"), ys = c.years;
    var cur = Math.min(Math.max(c.cur, ys[0]), ys[ys.length - 1]);
    sl.min = ys[0]; sl.max = ys[ys.length - 1]; sl.value = cur;
    var txt = c.label || String(cur);
    sl.setAttribute("aria-valuetext", txt);
    document.getElementById("play-yr").textContent = txt;
  }
  function playTo(y) {
    var c = playCfg(); if (!c) return;
    if (state.view !== "trend") state._lockOn = true;   // hold axes and order while stepping
    c.go(y); render();
  }
  function buildPlaybar() {
    var btn = document.getElementById("play-btn"), sl = document.getElementById("play-year");
    if (!btn || !sl) return;
    btn.addEventListener("click", function () {
      if (playTimer) { stopPlay(); return; }
      var c = playCfg(); if (!c) return;
      var ys = c.years, last = ys[ys.length - 1], at = ys.indexOf(c.label ? -1 : c.cur);
      playView = state.view;
      setPlayIcon(true);
      playTo(at < 0 || c.cur >= last ? ys[0] : ys[at + 1]);
      playTimer = setInterval(function () {
        var k = playCfg();
        if (!k || state.view !== playView) { stopPlay(); return; }
        var i = k.years.indexOf(k.cur);
        if (i < 0 || i >= k.years.length - 1) { stopPlay(); return; }
        playTo(k.years[i + 1]);
        if (k.years[i + 1] >= k.years[k.years.length - 1]) stopPlay();
      }, playView === "trend" ? PLAY_MS : STEP_MS);
    });
    sl.addEventListener("input", function () {
      stopPlay();
      var c = playCfg(); if (!c) return;
      var v = +sl.value, best = c.years[0];
      c.years.forEach(function (y) { if (Math.abs(y - v) < Math.abs(best - v)) best = y; });
      playTo(best);
    });
  }
  // The play lock for Compare groups and Representation: one fixed axis range and
  // row order over every year, while a single year is shown after Play or the slider.
  var lockCache = {};
  function playLock(view) {
    if (!state._lockOn || (state.exporting && !state._gif) || state.view !== view) return null;
    if (view === "forest" && state.yearFrom !== state.yearTo) return null;
    if (view === "rep" && state.repYearFrom !== state.repYearTo) return null;
    var key = view + "|" + state.characteristic + "|" + state.measure + "|" + narrowView() +
      (view === "rep" ? "|" + [repKind(), repCensus(), state.combine, state.numShow, repUnits().filter(repIsSel).map(function (u) { return u.key; }).join(",")].join("|") : "");
    if (lockCache[key]) return lockCache[key];
    var ys = playYearsFor(view), lo = Infinity, hi = -Infinity, lock = { order: [], labels: {} };
    if (view === "forest") {
      var pp = usePP(), last = null;
      ys.forEach(function (y) {
        var res = forestFor([y]);
        res.rows.forEach(function (r) {
          if (!r.computable) return;
          var a = pp ? r.pp_lo : r.rr_lo, b = pp ? r.pp_hi : r.rr_hi, v = pp ? r.pp : r.rr;
          [a, b, v].forEach(function (x) { if (x != null && isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } });
          var k = r.characteristic + "|" + r.group;
          if (lock.labels[k] == null) lock.labels[k] = r.group;
        });
        last = res;
      });
      // rows in the order of the latest year (largest at top), then any others
      var latest = last.rows.filter(function (r) { return r.computable && (pp ? r.pp != null : r.rr != null); })
        .sort(function (a, b) { return pp ? b.pp - a.pp : b.rr - a.rr; })
        .map(function (r) { return r.characteristic + "|" + r.group; });
      lock.order = latest.concat(Object.keys(lock.labels).filter(function (k) { return latest.indexOf(k) < 0; }));
      var nul = pp ? 0 : 1; lo = Math.min(lo, nul); hi = Math.max(hi, nul);
    } else {
      var gap = repKind() === "gap", showApp = state.numShow !== "accepted", showAcc = state.numShow !== "applicants";
      ys.forEach(function (y) {
        repRows([y]).rows.forEach(function (r) {
          var xs = [];
          if (showApp && r.appPct != null) xs.push(gap ? r.appPct - r.popApp : r.appPct);
          if (showAcc && r.accPct != null) xs.push(gap ? r.accPct - r.popAcc : r.accPct);
          if (!gap && r.popApp != null) xs.push(r.popApp, r.popAcc);
          xs.forEach(function (x) { if (isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } });
        });
      });
      lo = Math.min(lo, 0); hi = Math.max(hi, 0);
      if (!gap) { lock.range = [0, (hi || 1) * 1.16]; return (lockCache[key] = lock); }
    }
    var pad = (hi - lo || 1) * 0.05;
    lock.range = [lo - pad, hi + pad];
    return (lockCache[key] = lock);
  }

  // GIF: the animation as a file. One frame per year of the play bar, each drawn
  // exactly like the PNG (the chosen blog or wide shape, at a lighter scale), with
  // the axes and rows held as when playing; the last year stays up longer. The
  // encoder (js/gifenc.js, MIT) loads only when a GIF is made.
  var gifBusy = false;
  function loadGifenc() {
    if (window.gifenc) return Promise.resolve(window.gifenc);
    return new Promise(function (ok, fail) {
      var sc = document.createElement("script"); sc.src = "js/gifenc.js";
      sc.onload = function () { window.gifenc ? ok(window.gifenc) : fail(new Error("gifenc did not load")); };
      sc.onerror = function () { fail(new Error("gifenc did not load")); };
      document.head.appendChild(sc);
    });
  }
  function setGifLabel(t) { var b = document.getElementById("dl-gif"); if (b) b.querySelector(".gif-word").textContent = t; }
  function loadImg(url) {
    return new Promise(function (ok, fail) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = fail; im.src = url; });
  }
  function exportGIF(returnBlob) {
    if (returnBlob && returnBlob.type) returnBlob = false;   // click event, not the test hook
    var c = playCfg(); if (!c || gifBusy) return Promise.resolve(null);
    stopPlay(); gifBusy = true;
    var btn = document.getElementById("dl-gif"); if (btn) btn.disabled = true;
    var saved = { playYear: state.playYear, yearFrom: state.yearFrom, yearTo: state.yearTo,
      repYearFrom: state.repYearFrom, repYearTo: state.repYearTo, lockOn: state._lockOn };
    var wide = state.pngFormat === "wide", scale = wide ? 1.25 : 2, years = c.years.slice(), urls = [], title = "";
    state._gif = true; if (state.view !== "trend") state._lockOn = true;
    var chain = loadGifenc();
    years.forEach(function (y, i) {
      chain = chain.then(function () {
        setGifLabel("GIF " + (i + 1) + "/" + years.length);
        c.go(y); state._mixAnim = false;   // frames are stills: no on-screen bar animation
        render();   // redraw first, so the frame's title is this year's
        return downloadChart(true, { scale: scale });
      }).then(function (u) { urls.push(u); });
    });
    function restore() {
      state._gif = false;
      state.playYear = saved.playYear; state.yearFrom = saved.yearFrom; state.yearTo = saved.yearTo;
      state.repYearFrom = saved.repYearFrom; state.repYearTo = saved.repYearTo; state._lockOn = saved.lockOn;
      [["year-from", "yearFrom"], ["year-to", "yearTo"], ["rep-year-from", "repYearFrom"], ["rep-year-to", "repYearTo"]].forEach(function (p) {
        var el = document.getElementById(p[0]); if (el) el.value = state[p[1]]; });
      gifBusy = false; if (btn) btn.disabled = false; setGifLabel("GIF");
      state._mixAnim = false;
      render();
    }
    return chain.then(function () {
      title = ((document.querySelector("#chart-head .chart-title") || {}).textContent || "chart").replace(/,? ?\d{4}(–\d{4})?(?= \(|$)/, "");
      return Promise.all(urls.map(loadImg));
    }).then(function (imgs) {
      setGifLabel("Saving GIF");
      var W = 0, H = 0; imgs.forEach(function (im) { W = Math.max(W, im.naturalWidth); H = Math.max(H, im.naturalHeight); });
      var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      var ctx = cv.getContext("2d", { willReadFrequently: true }), g = window.gifenc, enc = g.GIFEncoder();
      imgs.forEach(function (im, i) {
        ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); ctx.drawImage(im, 0, 0);
        var px = ctx.getImageData(0, 0, W, H).data, pal = g.quantize(px, 256), idx = g.applyPalette(px, pal);
        enc.writeFrame(idx, W, H, { palette: pal, delay: i === imgs.length - 1 ? 2600 : 900 });
      });
      enc.finish();
      var blob = new Blob([enc.bytes()], { type: "image/gif" });
      if (!returnBlob) {
        var a = document.createElement("a"), href = URL.createObjectURL(blob);
        a.href = href; a.download = "dclinpsy-" + slug(title) + ".gif";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
      }
      restore(); return blob;
    }, function (e) { restore(); throw e; });
  }

  // Full screen (desktop): the chart card alone on the whole screen, drawn to its
  // height (the fit in lockZoom), so a long chart such as All groups fits. Uses the
  // browser's full screen where it can; otherwise the card fills the window. Esc,
  // or the button again, returns.
  var MAX_ICON = "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5", MIN_ICON = "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5";
  function isMax() { return document.body.classList.contains("chart-max"); }
  function setMax(on) {
    document.body.classList.toggle("chart-max", on);
    var b = document.getElementById("max-btn"); if (!b) return;
    var t = on ? "Exit full screen (Esc)" : "Full screen";
    b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", t); b.title = t;
    b.querySelector("path").setAttribute("d", on ? MIN_ICON : MAX_ICON);
    requestAnimationFrame(function () { render(); });
  }
  function buildMaxButton() {
    var b = document.getElementById("max-btn"); if (!b) return;
    b.addEventListener("click", function () {
      if (!isMax()) {
        setMax(true);
        var el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
      } else {
        setMax(false);
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      }
    });
    document.addEventListener("fullscreenchange", function () {
      if (!document.fullscreenElement && isMax()) setMax(false);   // Esc in the browser's full screen
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isMax() && !document.fullscreenElement) setMax(false);
    });
    window.addEventListener("resize", function () { if (isMax() && isAppShell()) setMax(false); });
  }

  // Phones: the footnote folds behind a "How to read this chart" button, closed
  // by default. Desktop shows it in full (the CSS only folds under phone-charts),
  // and the PNG always carries the full text (it is built from state.sub).
  function foldNote() {
    var note = document.getElementById("chart-note"), btn = document.getElementById("note-toggle");
    if (!note || !btn) return;
    var open = !!state.noteOpen;
    note.classList.toggle("folded", !open);
    btn.hidden = !note.textContent;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.querySelector(".chev").textContent = open ? "▴" : "▾";
    // Desktop: two lines, then "Read the full note" (only when there is more to read)
    var more = document.getElementById("note-more"); if (!more) return;
    var desk = !document.body.classList.contains("phone-charts") && !isAppShell();
    note.classList.toggle("clamp", desk && !state.noteDeskOpen);
    var longer = desk && !!note.textContent && (state.noteDeskOpen || note.scrollHeight > note.clientHeight + 2);
    more.hidden = !longer;
    more.textContent = state.noteDeskOpen ? "Show less" : "Read the full note";
    more.setAttribute("aria-expanded", state.noteDeskOpen ? "true" : "false");
  }
  function buildNoteToggle() {
    var btn = document.getElementById("note-toggle");
    if (btn) btn.addEventListener("click", function () { state.noteOpen = !state.noteOpen; foldNote(); });
    var more = document.getElementById("note-more");
    if (more) more.addEventListener("click", function () { state.noteDeskOpen = !state.noteDeskOpen; foldNote(); });
  }

  function updateNote() {
    var note = document.getElementById("chart-note");
    if (state.view === "table") {
      note.textContent = "Every selected category and year. A suppressed acceptance is withheld because the count is too small to report safely; it is never zero. † the source pooled a small hidden count with this row. Use Download CSV for the full data.";
      return;
    }
    if (state.view === "forest" && !isSESPairwise()) {
      note.textContent = state.sub + (state.forestMode === "table" ? "" : " Hover any row for n, the interval and p-values.") +
        " Source: Clearing House for Postgraduate Courses in Clinical Psychology.";
      return;
    }
    var lead = state.sub ? state.sub + " " : "";
    if (state.view === "trend" && state.trendMode === "numbers") {
      note.textContent = lead + "Source: Clearing House for Postgraduate Courses in Clinical Psychology."; return; }
    var deiTxt = (state.showDEI && !isContext()) ? " The shaded band marks the DEI era (" + DEI_FROM + " to " + DEI_TO + ")." : "";
    note.textContent = lead + (state.view === "trend"
      ? ((state.trendMode === "vsref"
        ? (state.trendMeasure === "rr"
          ? "Each point is the ratio of the group's acceptance rate to the reference that year (a 95% Katz-log interval). The dotted line is parity (ratio 1): below 1 means accepted less often than the reference, above 1 more often. A year with no dot is a suppressed, missing or zero count; the line bridges it." + deiTxt
          : "Each point is the group's gap from the reference that year, in pp, with a 95% interval. The dotted line is the reference (no gap). A year with no dot is a suppressed or missing count; the line bridges it rather than treating it as zero." + deiTxt)
        : "Each point is that group's acceptance rate for the year. Hover for n and the interval. A year with no dot is a suppressed or missing count, never a zero; the line bridges it." + deiTxt))
      : state.view === "rep"
        ? (function () {
          if (repKind() === "share") {
            var cq = state.characteristic, bn = !repCensus() ? ""
              : cq === "DISABILITY" ? "The disability benchmark is age-adjusted: the Census 2021 age-specific rates re-weighted to each pool's age profile (about 12%, not the whole-population 18%). "
              : cq === "SOCIO-ECONOMIC BACKGROUND" ? "POLAR quintiles are equal fifths of young people by construction, so 20% per quintile is the representative share. "
              : cq === "ETHNICITY" ? "British English, Scottish and Welsh are combined as White British, which the Census does not split. " : "";
            return bn + "Source: Clearing House for Postgraduate Courses in Clinical Psychology.";
          }
          var isTbl = state.repMode === "table";
          var lead = isTbl ? "The table shows how far" : "Bars show how far";
          var dl = isTbl ? "" : " (dotted line)";
          var tail = isTbl ? "Each row lists the shares and the representation ratio."
            : "Hover for the shares and representation ratio.";
          if (state.characteristic === "DISABILITY")
            return lead + " the applicant and accepted disability shares sit above (+) or below (−) the age-adjusted population rate" + dl + ". Applicants are young and disability rises with age, so the whole-population rate (about 18%) misleads; instead the Census 2021 age-specific rates are re-weighted to each pool's age profile (indirect standardisation), giving an expected rate of about 12%. This adjusts for age, not the definition gap (Census day-to-day limitation vs self-reported conditions) or sex. " + tail;
          if (state.characteristic === "SOCIO-ECONOMIC BACKGROUND")
            return lead + " the applicant and accepted shares in each POLAR quintile sit above (+) or below (−) 20%" + dl + ". POLAR groups areas by the share of young people entering higher education, in equal fifths, so 20% per quintile is the representative baseline. Quintile 1 is the lowest-participation, most disadvantaged areas. It is an area-based proxy assigned from home postcode, not individual socio-economic status. " + tail;
          if (state.characteristic === "ETHNICITY")
            return lead + " each group's applicant and accepted share sits above (+) or below (−) its population share" + (isTbl ? " (Census 2021)" : " (dotted line, Census 2021)") + ". British English, Scottish and Welsh are combined as White British, which the Census does not split. " + tail;
          // chart mode: the subtitle already says what a bar is, so only say how to read it
          if (!isTbl) return "Right of the dotted line: over-represented; left: under-represented. " + tail;
          return lead + " each group's applicant and accepted share sits above (+) or below (−) its population share. The benchmark is the population (Census 2021). " + tail;
        })()
      : state.view === "era"
        ? "Each value is the mean of the group's per-year figures in that era, with a 95% t-interval. Source: Clearing House for Postgraduate Courses in Clinical Psychology."
      : "Each cell is the acceptance-rate gap between two quintiles (row minus column), with one Benjamini-Hochberg correction across the 10 pairs. Hover a cell for the value and verdict.");
  }

  function buildCharPicker() {
    var sel = document.getElementById("char-picker");
    function opt(parent, value, text) {
      var o = document.createElement("option"); o.value = value; o.textContent = text;
      if (value === state.characteristic) o.selected = true; parent.appendChild(o);
    }
    var ovr = document.createElement("optgroup"); ovr.label = "Overview (Compare groups)";
    opt(ovr, ALL_GROUPS, CHAR_LABELS[ALL_GROUPS]);
    if ((META.context_questions || []).length) opt(ovr, ALL_CONTEXT, CHAR_LABELS[ALL_CONTEXT]);
    sel.appendChild(ovr);
    var grp = document.createElement("optgroup"); grp.label = "Characteristic";
    CHARS.filter(function (c) { return !isContext(c) && c !== ALL_GROUPS && c !== ALL_CONTEXT; })
      .forEach(function (c) { opt(grp, c, CHAR_LABELS[c]); });
    sel.appendChild(grp);
    var ctxg = document.createElement("optgroup");
    ctxg.label = "Contextual background (" + (META.context_questions.length ? "from 2023" : "") + ")";
    (META.context_questions || []).forEach(function (c) { opt(ctxg, c, CHAR_LABELS[c]); });
    if (ctxg.children.length) sel.appendChild(ctxg);
    sel.addEventListener("change", function () {
      state.characteristic = sel.value; state.selected = {}; state.repSel = {}; resetY();
      defaultSelection(); buildGroupList();
      state.tableSelected = {}; buildTableCatList();
      render(); fadeIn();
    });
  }

  // Per-view dropdown gating: "All groups" only applies to Compare to reference;
  // characteristics with no Census benchmark are disabled on the rep tab.
  // Overviews only on Compare groups; contextual questions have no pre-DEI years
  // (era view) and no population benchmark (representation view).
  function charAllowed(c, view) {
    if (c === ALL_GROUPS || c === ALL_CONTEXT) return view === "forest";
    // the overall total has nothing to compare against: trend and table only
    if (c === "OVERALL") return view === "trend" || view === "table";
    if (view === "rep") return true;
    if (view === "era") return !isContext(c);
    return true;
  }
  function updateCharOptions() {
    Array.prototype.forEach.call(document.querySelectorAll("#char-picker option"),
      function (o) { o.disabled = !charAllowed(o.value, state.view); });
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
    buildRangeSelect("trend-year-from", "trend-year-to", "trendFrom", "trendTo");
  }

  // Generic from/to year-range select pair bound to two state keys.
  function buildRangeSelect(fromId, toId, fromKey, toKey) {
    var from = document.getElementById(fromId), to = document.getElementById(toId);
    if (!from || !to) return;
    ALL_YEARS.forEach(function (y) {
      var a = document.createElement("option"); a.value = y; a.textContent = y;
      if (y === state[fromKey]) a.selected = true; from.appendChild(a);
      var b = document.createElement("option"); b.value = y; b.textContent = y;
      if (y === state[toKey]) b.selected = true; to.appendChild(b);
    });
    from.addEventListener("change", function () {
      state[fromKey] = +from.value;
      if (state[fromKey] > state[toKey]) { state[toKey] = state[fromKey]; to.value = state[toKey]; }
      render();
    });
    to.addEventListener("change", function () {
      state[toKey] = +to.value;
      if (state[toKey] < state[fromKey]) { state[fromKey] = state[toKey]; from.value = state[fromKey]; }
      render();
    });
  }

  function buildTrendModeSeg() {
    var seg = document.getElementById("trendmode-seg");
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.trendMode = b.getAttribute("data-mode"); resetY();
      seg.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === b); });
      render();
    });
    // Numbers: which lines, and count or share
    [["num-show-seg", "numShow", "data-show"], ["num-unit-seg", "numUnit", "data-unit"]].forEach(function (c) {
      var sg = document.getElementById(c[0]); if (!sg) return;
      sg.addEventListener("click", function (e) {
        var b = e.target.closest(".seg-btn"); if (!b) return;
        state[c[1]] = b.getAttribute(c[2]); resetY();
        sg.querySelectorAll(".seg-btn").forEach(function (x) { x.classList.toggle("active", x === b); });
        render();
      });
    });
    var ms = document.getElementById("trend-measure-seg");
    if (ms) ms.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.trendMeasure = b.getAttribute("data-measure"); resetY();
      ms.querySelectorAll(".seg-btn").forEach(function (x) {
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
      '<div style="margin-top:.35rem"><strong>Shares:</strong> each group\'s share of everyone who answered, year by ' +
      'year. Diamond = the population share; black tick = the share in the first year.</div>' +
      '<div style="margin-top:.35rem"><strong>Vs population:</strong> the share minus the population share. ' +
      'Bars right = over-represented, left = under-represented.</div>' +
      '<div style="margin-top:.4rem">Benchmarks: Census 2021 (England &amp; Wales, all ages) for ' +
      'ethnicity, religion, sexual orientation and sex; an age-adjusted rate for disability; and an ' +
      'equal 20% per quintile for socio-economic background (POLAR). All-ages benchmarks slightly ' +
      'understate representation for a young graduate pool. Shares exclude prefer-not-to-say.</div>';
    function seg(id, attr, key) {
      var sg = document.getElementById(id);
      sg.addEventListener("click", function (e) {
        var b = e.target.closest(".seg-btn"); if (!b || b.disabled) return;
        state[key] = b.getAttribute(attr); resetX(); render();
      });
    }
    seg("repmode-seg", "data-mode", "repMode");
    seg("repkind-seg", "data-kind", "repKind");
    seg("rep-show-seg", "data-show", "numShow");
    [["rep-pop", "repPop"], ["rep-start", "repStart"], ["rep-combine", "combine"]].forEach(function (c) {
      document.getElementById(c[0]).addEventListener("click", function () { state[c[1]] = !state[c[1]]; render(); });
    });
    // All / None for the group lists (Over time and this tab)
    document.querySelectorAll(".sel-all button").forEach(function (b) {
      b.addEventListener("click", function () {
        var on = b.getAttribute("data-sel") === "all", inRep = !!b.closest("#rep-controls");
        if (inRep && repCensus()) repUnits().forEach(function (u) { state.repSel[u.key] = on; });
        else {
          var hidden = trendHidden(state.characteristic);
          (byChar[state.characteristic] || []).forEach(function (g) {
            if (hidden.indexOf(g.group) === -1) state.selected[g.group] = on; });
        }
        buildGroupList(); render();
      });
    });
  }
  // The group list on this tab: the rows it can show, ticked as they are shown.
  function buildRepGroupList() {
    var box = document.getElementById("rep-group-list"); if (!box) return;
    box.innerHTML = "";
    var ref = refFor(state.characteristic), census = repCensus();
    repUnits().forEach(function (u) {
      var lbl = document.createElement("label"); lbl.className = "grp";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = repIsSel(u);
      cb.addEventListener("change", function () {
        if (census) state.repSel[u.key] = cb.checked; else { state.selected[u.key] = cb.checked; buildGroupList(); }
        render();
      });
      lbl.appendChild(cb);
      var span = document.createElement("span");
      span.textContent = u.label + (!census && u.key === ref ? " (reference)" : "") +
        (!census && u.group && u.group.constructed ? " *" : "") + (!census && INCOMPLETE[u.key] ? " †" : "");
      lbl.appendChild(span); box.appendChild(lbl);
    });
    document.getElementById("rep-groups-title").firstChild.textContent = census ? "Categories shown " : "Groups shown ";
  }
  // Controls that two tabs share (Applicants / Accepted / Both, Combine) show the same state.
  function syncShared() {
    document.querySelectorAll("#num-show-seg .seg-btn, #rep-show-seg .seg-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-show") === state.numShow); });
    document.querySelectorAll("#repmode-seg .seg-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === state.repMode); });
    var kind = repKind();
    document.querySelectorAll("#repkind-seg .seg-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-kind") === kind);
      if (b.getAttribute("data-kind") === "gap") {
        b.disabled = !repHasBench();
        b.title = repHasBench() ? "Each share minus its population benchmark" : "No population benchmark for this characteristic";
      }
    });
    [["toggle-combine", "combine"], ["rep-combine", "combine"], ["rep-pop", "repPop"], ["rep-start", "repStart"]].forEach(function (c) {
      var b = document.getElementById(c[0]); if (!b) return;
      b.classList.toggle("on", !!state[c[1]]); b.setAttribute("aria-pressed", state[c[1]] ? "true" : "false");
    });
    document.getElementById("rep-pop").hidden = kind !== "share" || !repHasBench();
    document.getElementById("rep-start").hidden = kind !== "share";
    document.getElementById("repkind-ctl").hidden = !repHasBench();
  }

  function buildEraSeg() {
    var seg = document.getElementById("eramode-seg");
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.eraMode = b.getAttribute("data-mode"); resetX();
      seg.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === b); });
      render();
    });
    document.getElementById("era-legend").innerHTML =
      '<div><span class="swatch" style="background:#c3b69d;border:1px solid #a99e86"></span>pre-DEI start (2015-2019)</div>' +
      '<div style="margin-top:.4rem">Arrow points to the DEI value (' + DEI_FROM + '-' + DEI_TO + '):</div>' +
      '<div><span class="swatch" style="background:' + RED + '"></span>significant change</div>' +
      '<div><span class="swatch" style="background:#bdb29a"></span>no significant change</div>' +
      '<div style="margin-top:.3rem">Tested on per-year values (t-test), BH-corrected across the groups shown.</div>';
  }

  function buildMeasureSeg() {
    var seg = document.getElementById("measure-seg");
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.measure = b.getAttribute("data-measure"); resetX();
      seg.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x === b); });
      render();
    });
  }

  // Sidebar key for Compare groups; rebuilt on every render (the full forest
  // colours direction as published: red above, blue below).
  function buildLegendKey() {
    var hollow = '<div><span class="swatch" style="background:#fff;border:1.6px solid #8a8073"></span>No clear difference</div>';
    var html = isAllGroups()
      ? '<div><span class="swatch" style="background:' + RED + '"></span>Above its reference group</div>' +
        '<div><span class="swatch" style="background:' + BLUE + '"></span>Below its reference group</div>' + hollow +
        '<div style="margin-top:.3rem">One Benjamini-Hochberg correction across every group, as in the published full forest.</div>'
      : '<div><span class="swatch" style="background:' + RED + '"></span>Significant (after correction)</div>' + hollow +
        '<div style="margin-top:.3rem">Position shows the direction (above or below the reference); colour shows significance.</div>';
    html += '<div style="margin-top:.3rem">† the source pooled a small hidden count with this group; hover for detail.</div>';
    document.getElementById("legendkey").innerHTML = html;
  }

  // Switch characteristic and rebuild the dependent selections/lists.
  function switchCharacteristic(ch) {
    state.characteristic = ch;
    document.getElementById("char-picker").value = ch;
    state.selected = {}; state.repSel = {}; defaultSelection(); buildGroupList();
    state.tableSelected = {}; buildTableCatList();
  }

  function buildTabs() {
    var tabs = document.getElementById("tabs");
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest(".tab"); if (!b) return;
      var changed = state.view !== b.getAttribute("data-view");
      if (changed) closeSheet();
      state.view = b.getAttribute("data-view");
      tabs.querySelectorAll(".tab").forEach(function (x) {
        x.classList.toggle("active", x === b);
        if (x === b) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
      // phones: the bottom bar switches screens, so start the new one at the top
      if (changed && isAppShell()) window.scrollTo(0, 0);
      document.getElementById("trend-controls").hidden = state.view !== "trend";
      document.getElementById("forest-controls").hidden = state.view !== "forest";
      document.getElementById("era-controls").hidden = state.view !== "era";
      document.getElementById("rep-controls").hidden = state.view !== "rep";
      document.getElementById("table-controls").hidden = state.view !== "table";
      document.getElementById("char-control").hidden = state.view === "about";
      // Fall back when the current characteristic does not apply to this view.
      if (state.view !== "about" && !charAllowed(state.characteristic, state.view))
        switchCharacteristic(state.view === "rep" ? "ETHNIC GROUP (BROAD)" : "ETHNICITY");
      updateCharOptions();
      render();
      if (changed) fadeIn();
    });
  }
  // A short fade when the screen changes (skipped if the reader asks for less motion).
  function fadeIn() {
    var el = document.querySelector(".content");
    if (!el || !el.animate) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
      { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
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
    bindChip("toggle-dei", "showDEI");
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

  // Y-axis range for Over time. "Set range" starts from the range currently on
  // screen; the range goes back to Auto when the characteristic or mode changes,
  // since the units change (%, pp, ratio, counts).
  function setYMode(custom) {
    state.yCustom = custom;
    var seg = document.getElementById("yaxis-seg");
    seg.querySelectorAll(".seg-btn").forEach(function (x) {
      x.classList.toggle("active", (x.getAttribute("data-mode") === "custom") === custom); });
    document.getElementById("yrange").hidden = !custom;
    if (custom) {
      var gd = document.getElementById("chart"), r = gd._fullLayout && gd._fullLayout.yaxis && gd._fullLayout.yaxis.range;
      if (r) {
        var span = Math.abs(r[1] - r[0]), dp = span >= 100 ? 0 : span >= 10 ? 1 : 2;
        state.yMin = (+r[0]).toFixed(dp); state.yMax = (+r[1]).toFixed(dp);
        document.getElementById("y-min").value = state.yMin; document.getElementById("y-max").value = state.yMax;
      }
    }
  }
  function resetY() { if (state.yCustom) setYMode(false); resetX(); }

  // X-axis range for the horizontal gap charts: Compare groups ("forest"),
  // Before vs after DEI ("era") and Representation ("rep"). Same behaviour as
  // the y-axis control; each view keeps its own range.
  var XR = { forest:{ custom:false, min:"", max:"" }, era:{ custom:false, min:"", max:"" },
    rep:{ custom:false, min:"", max:"" } };
  function applyX(view, xaxis) {
    var s = XR[view], lo = parseFloat(s.min), hi = parseFloat(s.max);
    if (s.custom && isFinite(lo) && isFinite(hi) && lo < hi) { xaxis.range = [lo, hi]; xaxis.autorange = false; }
    return xaxis;
  }
  function setXMode(view, custom) {
    var s = XR[view]; s.custom = custom;
    document.querySelectorAll("#" + view + "-xaxis-seg .seg-btn").forEach(function (x) {
      x.classList.toggle("active", (x.getAttribute("data-mode") === "custom") === custom); });
    document.getElementById(view + "-xrange").hidden = !custom;
    if (custom) {
      var gd = document.getElementById("chart"), r = gd._fullLayout && gd._fullLayout.xaxis && gd._fullLayout.xaxis.range;
      if (r) {
        var span = Math.abs(r[1] - r[0]), dp = span >= 100 ? 0 : span >= 10 ? 1 : 2;
        s.min = (+r[0]).toFixed(dp); s.max = (+r[1]).toFixed(dp);
        document.getElementById(view + "-xmin").value = s.min; document.getElementById(view + "-xmax").value = s.max;
      }
    }
  }
  function resetX() { Object.keys(XR).forEach(function (v) { if (XR[v].custom) setXMode(v, false); }); }
  function buildXControls() {
    Object.keys(XR).forEach(function (view) {
      document.getElementById(view + "-xaxis-seg").addEventListener("click", function (e) {
        var b = e.target.closest(".seg-btn"); if (!b) return;
        setXMode(view, b.getAttribute("data-mode") === "custom"); render();
      });
      var t;
      ["min", "max"].forEach(function (k) {
        document.getElementById(view + "-x" + k).addEventListener("input", function (e) {
          XR[view][k] = e.target.value; clearTimeout(t); t = setTimeout(render, 250);
        });
      });
    });
  }
  function buildYControls() {
    document.getElementById("yaxis-seg").addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      setYMode(b.getAttribute("data-mode") === "custom"); render();
    });
    var t;
    ["y-min", "y-max"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", function (e) {
        state[id === "y-min" ? "yMin" : "yMax"] = e.target.value;
        clearTimeout(t); t = setTimeout(render, 250);
      });
    });
  }

  // The characteristic picker always sits above the chart. Phones and small
  // tablets (the app shell, 860 px and below): the other controls move from the
  // side rail into a slide-up "Chart options" sheet, opened by the Options button
  // beside the picker, and the quick controls make their own row under it.
  // Desktop: the side rail stays; the quick controls and the download join the
  // picker in one row, and the Compare groups key moves under the chart.
  var rail = document.querySelector(".rail"), railHome = rail.parentNode, railNext = rail.nextSibling;
  var charCtl = document.getElementById("char-control");
  function homeOf(el) { return { el: el, parent: el.parentNode, next: el.nextSibling }; }
  var deskMoves = [homeOf(document.getElementById("quickbar")), homeOf(document.getElementById("dl-group")),
    homeOf(document.getElementById("legendkey"))];
  var vrule = document.createElement("span"); vrule.className = "c-vrule"; vrule.setAttribute("aria-hidden", "true");
  function isAppShell() { return window.innerWidth <= 860; }
  function placeRail() {
    var narrow = isAppShell(), drawer = document.getElementById("options-drawer"), slot = document.getElementById("m-char");
    if (narrow && rail.parentNode !== drawer) drawer.appendChild(rail);
    else if (!narrow && rail.parentNode === drawer) { closeSheet(); railHome.insertBefore(rail, railNext); }
    if (charCtl.parentNode !== slot) slot.appendChild(charCtl);
    var tb = document.getElementById("m-toolbar"), note = document.getElementById("chart-note");
    if (!narrow && vrule.parentNode !== tb) {
      tb.appendChild(vrule); tb.appendChild(deskMoves[0].el); tb.appendChild(deskMoves[1].el);
      note.parentNode.insertBefore(deskMoves[2].el, note);
    } else if (narrow && vrule.parentNode === tb) {
      vrule.remove();
      deskMoves.forEach(function (m) { m.parent.insertBefore(m.el, m.next); });
    }
    document.getElementById("options-toggle").hidden = !narrow;
  }
  var sheetReturn = null;
  function openSheet() {
    var drawer = document.getElementById("options-drawer"), bd = document.getElementById("sheet-backdrop");
    sheetReturn = document.activeElement;
    bd.hidden = false;
    requestAnimationFrame(function () { bd.classList.add("show"); });
    drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("sheet-open");
    document.getElementById("options-toggle").setAttribute("aria-expanded", "true");
    setTimeout(function () { var d = document.getElementById("sheet-done"); if (d) d.focus({ preventScroll: true }); }, 60);
    // bring the chart up under the top bar, so it shows above the half-height sheet
    var head = document.getElementById("chart-head"), bar = document.querySelector(".brand");
    if (head && head.offsetParent) {
      var top = head.getBoundingClientRect().top + window.pageYOffset - (bar ? bar.offsetHeight : 0) - 8;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }
  function closeSheet() {
    var drawer = document.getElementById("options-drawer"), bd = document.getElementById("sheet-backdrop");
    if (!drawer.classList.contains("open")) return;
    drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true");
    bd.classList.remove("show");
    setTimeout(function () { if (!drawer.classList.contains("open")) bd.hidden = true; }, 260);
    document.body.classList.remove("sheet-open");
    document.getElementById("options-toggle").setAttribute("aria-expanded", "false");
    if (sheetReturn && sheetReturn.focus) sheetReturn.focus({ preventScroll: true });
  }
  function buildOptionsToggle() {
    document.getElementById("options-toggle").addEventListener("click", openSheet);
    document.getElementById("sheet-done").addEventListener("click", closeSheet);
    document.getElementById("sheet-backdrop").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
    // tap the long intro above a table or the matrix to read all of it (phones)
    ["table", "matrix"].forEach(function (id) {
      document.getElementById(id).addEventListener("click", function (e) {
        var t = e.target.closest(".table-sub, .matrix-sub");
        if (t && document.body.classList.contains("phone-charts")) t.classList.toggle("open");
      });
    });
    placeRail();
    var t; window.addEventListener("resize", function () {
      clearTimeout(t); t = setTimeout(function () { placeRail(); render(); }, 150); });
  }

  // Phone layout switch and PNG shape. Both are remembered in this browser (a
  // convenience only; the page works the same without storage).
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function applyPhoneClasses() {
    document.body.classList.toggle("phone-charts", narrowView());
    document.body.classList.toggle("phone-preview", state.phoneMode === "on" && window.innerWidth > 860);
  }
  function buildPhoneControls() {
    var seg = document.getElementById("phone-seg"), saved = store("dclin.phoneMode");
    if (saved === "on" || saved === "off" || saved === "auto") state.phoneMode = saved;
    function sync() {
      seg.querySelectorAll(".seg-btn").forEach(function (x) {
        x.classList.toggle("active", x.getAttribute("data-mode") === state.phoneMode); });
    }
    seg.addEventListener("click", function (e) {
      var b = e.target.closest(".seg-btn"); if (!b) return;
      state.phoneMode = b.getAttribute("data-mode"); store("dclin.phoneMode", state.phoneMode);
      sync(); render();
    });
    sync();
    var pf = document.getElementById("png-format"), savedF = store("dclin.pngFormat");
    if (savedF === "wide" || savedF === "phone") state.pngFormat = savedF;
    pf.value = state.pngFormat;
    pf.addEventListener("change", function () { state.pngFormat = pf.value; store("dclin.pngFormat", pf.value); });
  }
  // Card layout for tables on phones: label every cell with its column heading.
  function labelTableCells() {
    document.querySelectorAll("#table table.datatable").forEach(function (t) {
      var heads = Array.prototype.map.call(t.querySelectorAll("thead th"), function (th) {
        return th.textContent.replace(/[▲▼↕]/g, "").trim(); });
      t.querySelectorAll("tbody tr").forEach(function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) { td.setAttribute("data-label", heads[i] || ""); });
      });
    });
  }

  // ---- Init -----------------------------------------------------------------
  document.querySelector(".brand .eyebrow").textContent =
    "Admissions equity · " + FIRST_YEAR + " to " + LATEST;
  buildTabs(); buildCharPicker(); defaultSelection(); buildGroupList();
  buildToggles(); buildTrendModeSeg(); buildEraSeg(); buildRepControls();
  buildYearControls(); buildMeasureSeg(); buildLegendKey(); buildYControls(); buildXControls();
  buildTableCatList(); buildTableControls(); buildViewToggles(); buildPhoneControls(); buildOptionsToggle(); buildNoteToggle(); buildPlaybar(); buildMaxButton();
  document.getElementById("dl-png").addEventListener("click", downloadChart);
  document.getElementById("dl-gif").addEventListener("click", function () {
    exportGIF().catch(function () { setGifLabel("GIF failed"); setTimeout(function () { setGifLabel("GIF"); }, 2500); });
  });
  updateCharOptions();
  render();
  // Safety net: if the card changes width for any other reason (a scrollbar, the
  // options panel), redraw the chart at the new width rather than overflow.
  if (window.ResizeObserver) {
    var chartEl = document.getElementById("chart");
    new ResizeObserver(function () {
      if (state.exporting || !chartEl._fullLayout || chartEl.style.display === "none") return;
      var w = Math.floor(chartEl.getBoundingClientRect().width);
      if (w && Math.abs(w - chartEl._fullLayout.width) > 1) Plotly.relayout(chartEl, { width: w });
    }).observe(chartEl.parentElement);
    var fitT;
    new ResizeObserver(function () {
      if (state.exporting || !chartEl._fullLayout || chartEl.style.display === "none" || !deskPolish()) return;
      if (Math.abs(chartEl.clientHeight - (chartEl._fitAvail || 0)) > 2) { clearTimeout(fitT); fitT = setTimeout(render, 120); }
    }).observe(chartEl);
  }
  // Debug and test hook (read-only): lets the browser check reproduce the R oracle.
  window.__explorer = { computeMaster: computeMaster, computeContextAll: computeContextAll, exportPNG: exportPNG,
    exportGIF: function () { return exportGIF(true); },
    computeForest: function (ch, years) { var s = state.characteristic; state.characteristic = ch;
      try { return forestFor(years); } finally { state.characteristic = s; } } };
})();
