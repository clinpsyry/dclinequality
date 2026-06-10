// One-off: rebuild the broad ethnic groups (White/Asian/Black/Mixed/Other) and the
// detailed "Mixed (all)" group from the source's PUBLISHED "Total in the X group"
// rows, replacing the old sum-of-reportable construction (which dropped the
// applicants of suppressed sub-cells and so overstated minority acceptance rates).
// Regenerates site/data/counts.json AND site/data.js consistently.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

// --- 1. published broad totals from the source CSV --------------------------
const lines = fs.readFileSync(path.join(ROOT, "equalopps_2015-2024_merged.csv"), "utf8")
  .split(/\r?\n/).filter(Boolean);
function broadKey(cat) {
  if (/Mixed/.test(cat)) return "Mixed";
  if (/White/.test(cat)) return "White";
  if (/Asian/.test(cat)) return "Asian";
  if (/Black/.test(cat)) return "Black";
  if (/Other/.test(cat)) return "Other";
  return null;
}
const TOT = {}; // TOT[label][year] = {applicants, accepted}
lines.forEach(function (l) {
  const m = l.match(/^(\d{4}),ETHNICITY,(?:"([^"]*)"|([^,]*)),(\d*),(\d*)/);
  if (!m) return;
  const cat = m[2] || m[3];
  if (!/^Total in the .* group$/.test(cat)) return;
  const k = broadKey(cat); if (!k) return;
  (TOT[k] = TOT[k] || {})[+m[1]] = {
    applicants: m[4] === "" ? null : +m[4],
    accepted: m[5] === "" ? null : +m[5]
  };
});
const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
function byYear(label) {
  return YEARS.map(function (y) {
    const r = TOT[label][y] || { applicants: null, accepted: null };
    return { year: y, applicants: r.applicants, accepted: r.accepted };
  });
}

// --- 2. patch counts.json ---------------------------------------------------
const cj = JSON.parse(fs.readFileSync(path.join(ROOT, "site/data/counts.json"), "utf8"));
function setGroup(ch, name, rows) {
  const g = cj.groups.find(function (x) { return x.characteristic === ch && x.group === name; });
  if (!g) throw new Error("group not found: " + ch + " / " + name);
  g.by_year = rows;
  return g;
}
["White", "Asian", "Black", "Mixed"].forEach(function (lab) {
  setGroup("ETHNIC GROUP (BROAD)", lab, byYear(lab));
});
// Mixed (all) detailed == the published Mixed total
setGroup("ETHNICITY", "Mixed (all)", byYear("Mixed"));

// Add the published "Other" broad total (used by representativeness; hidden from
// the broad forest/trend so the frozen m=3 family and curated trend are unchanged).
if (!cj.groups.find(function (x) { return x.characteristic === "ETHNIC GROUP (BROAD)" && x.group === "Other"; })) {
  const mixedIdx = cj.groups.findIndex(function (x) {
    return x.characteristic === "ETHNIC GROUP (BROAD)" && x.group === "Mixed"; });
  cj.groups.splice(mixedIdx + 1, 0, {
    characteristic: "ETHNIC GROUP (BROAD)", group: "Other", constructed: true, by_year: byYear("Other")
  });
}
cj.meta.aggregate_method = "published group totals (Total in the X group rows)";

// --- 3. write both artefacts ------------------------------------------------
fs.writeFileSync(path.join(ROOT, "site/data/counts.json"), JSON.stringify(cj, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "site/data.js"), "window.COUNTS = " + JSON.stringify(cj) + ";");

console.log("Rebuilt broad groups + Mixed (all) from published totals. New rates:");
["White", "Asian", "Black", "Mixed", "Other"].forEach(function (lab) {
  console.log("  " + lab + ": " + byYear(lab).map(function (r) {
    return r.year + " " + (100 * r.accepted / r.applicants).toFixed(1) + "%"; }).join("  "));
});
