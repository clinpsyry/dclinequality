// Node test: recompute the ethnicity DEI family in JS and check it against the
// R oracle (site/data/reference.json). Run: node site/test/test_stats.js
// Verdicts must match exactly; numbers within tolerance of R's rounded values.
const fs = require("fs");
const path = require("path");
const Stats = require("../js/stats.js");

const dataDir = path.join(__dirname, "..", "data");
const counts = JSON.parse(fs.readFileSync(path.join(dataDir, "counts.json")));
const ref = JSON.parse(fs.readFileSync(path.join(dataDir, "reference.json")));

function findGroup(characteristic, name) {
  const g = counts.groups.find(
    (x) => x.characteristic === characteristic && x.group === name);
  if (!g) throw new Error("group not found: " + characteristic + " / " + name);
  return g;
}

const eth12 = ["British Scottish","British Welsh","Irish","Other White background",
  "Indian","Pakistani","Bangladeshi","Chinese","African","Caribbean",
  "Mixed (all)","Middle Eastern/North African"];
const dei = counts.meta.eras.dei;   // the DEI era as exported (2021 to 2025 since 22 Nov 2026, RULES.md C5)

const members = eth12.map((n) => findGroup("ETHNICITY", n));
const reference = findGroup("ETHNICITY", "British English");
const got = Stats.computeFamily(members, reference, dei);
const want = ref.ethnicity_dei;

let pass = true;
function check(name, g, w, tol) {
  const ok = (g == null && w == null) ||
    (g != null && w != null && Math.abs(g - w) <= tol);
  if (!ok) { pass = false;
    console.log(`  [FAIL] ${name}: got ${g}, want ${w} (tol ${tol})`); }
  return ok;
}

console.log("m: got " + got.m + " want " + want.m);
if (got.m !== want.m) pass = false;
console.log("ref: got " + got.ref_accepted + "/" + got.ref_applicants +
            " want " + want.ref_accepted + "/" + want.ref_applicants);
if (got.ref_applicants !== want.ref_applicants ||
    got.ref_accepted !== want.ref_accepted) pass = false;

console.log("\nper-group checks (verdicts exact, numbers within tol):");
want.rows.forEach((w) => {
  const g = got.rows.find((r) => r.group === w.group);
  if (!g || !g.computable) { pass = false;
    console.log(`  [FAIL] ${w.group}: not computable in JS`); return; }
  // numbers: reference rounded to 3-4 dp, allow a little slack
  check(w.group + ".rate", g.rate, w.rate, 0.02);
  check(w.group + ".pp", g.pp, w.pp, 0.02);
  check(w.group + ".pp_lo", g.pp_lo, w.pp_lo, 0.05);
  check(w.group + ".pp_hi", g.pp_hi, w.pp_hi, 0.05);
  check(w.group + ".rr", g.rr, w.rr, 0.01);
  check(w.group + ".p_bh", g.p_bh, w.p_bh, 1e-3);
  // raw_p: loose relative tol (deep-tail erfc accuracy), skip if tiny
  if (w.raw_p > 1e-4) check(w.group + ".raw_p", g.raw_p, w.raw_p, 1e-3);
  // verdicts: must match exactly
  if (g.significant_after_bh !== w.significant_after_bh) { pass = false;
    console.log(`  [FAIL] ${w.group}.sig: got ${g.significant_after_bh} want ${w.significant_after_bh}`); }
  if (g.bar_excludes_null !== w.bar_excludes_null) { pass = false;
    console.log(`  [FAIL] ${w.group}.bar: got ${g.bar_excludes_null} want ${w.bar_excludes_null}`); }
});

// the rule-2a invariant on the JS side too
const invariant = got.rows.every(
  (r) => !r.computable || r.bar_excludes_null === r.significant_after_bh);
console.log("\nbar_excludes_null == significant_after_bh on all JS rows: " + invariant);
if (!invariant) pass = false;

const bw = got.rows.find((r) => r.group === "British Welsh");
console.log("British Welsh (JS): p_bh=" + bw.p_bh.toFixed(5) +
            " sig=" + bw.significant_after_bh + " bar=" + bw.bar_excludes_null);

// ---- Student-t functions vs R (for the era-change t-test) ------------------
console.log("\nStudent-t functions vs R:");
function chkT(name, got, want, tol) {
  var ok = Math.abs(got - want) < (tol || 1e-5);
  console.log("  [" + (ok ? "OK" : "FAIL") + "] " + name + ": got " +
    got.toFixed(8) + " want " + want);
  if (!ok) pass = false;
}
chkT("pt(2,5)", Stats.pt(2, 5), 0.94903026);
chkT("pt(-1.3,8)", Stats.pt(-1.3, 8), 0.11490181);
chkT("qt(0.975,4)", Stats.qt(0.975, 4), 2.77644511, 1e-4);
var tt = Stats.ttestWelch([10, 12, 11, 13, 9], [15, 17, 16, 14]);
chkT("welch t", tt.t, -4.700097, 1e-4);
chkT("welch df", tt.df, 6.980769, 1e-4);
chkT("welch p", tt.p, 0.00222460, 1e-6);

// ---- Full forest and contextual questions vs R (families.js) ---------------------
const Families = require("../js/families.js");
function checkTable(name, got, want, keyOf) {
  console.log("\n" + name + ":");
  let bad = 0;
  want.forEach((w) => {
    const g = got.rows.find((r) => keyOf(r) === keyOf(w));
    if (!g) { bad++; console.log("  [FAIL] missing " + keyOf(w)); return; }
    if (!!g.computable !== (w.computable !== false)) { bad++; console.log("  [FAIL] computable " + keyOf(w)); return; }
    if (w.computable === false) return;
    if (Math.abs(g.pp - w.pp) > 0.02 || Math.abs(g.pp_lo - w.pp_lo) > 0.05 || Math.abs(g.pp_hi - w.pp_hi) > 0.05 ||
        Math.abs(g.p_bh - w.p_bh) > 1e-3 || g.significant_after_bh !== w.significant_after_bh ||
        g.bar_excludes_null !== w.bar_excludes_null) {
      bad++; console.log(`  [FAIL] ${keyOf(w)}: pp ${g.pp.toFixed(3)} vs ${w.pp}, sig ${g.significant_after_bh} vs ${w.significant_after_bh}`);
    }
  });
  const m = want.find((w) => w.m != null);
  if (m && got.m !== m.m) { bad++; console.log(`  [FAIL] m: got ${got.m} want ${m.m}`); }
  const sig = got.rows.filter((r) => r.significant_after_bh).length;
  console.log(`  ${want.length} rows, m = ${got.m}, significant ${sig}: ${bad ? "MISMATCH" : "all match R"}`);
  if (bad) pass = false;
}
const yrs = counts.meta.years, latest = counts.meta.latest_year;
checkTable("Full forest, " + dei[0] + "-" + dei[dei.length - 1], Families.master(counts, dei), ref.master_dei, (r) => r.characteristic + "|" + r.group);
checkTable("Full forest, " + latest, Families.master(counts, [latest]), ref.master_latest, (r) => r.characteristic + "|" + r.group);
checkTable("Contextual questions, " + latest, Families.context(counts, [latest]), ref.context_latest, (r) => r.characteristic);
// Full forest anchor: 26 significant groups over 2021 to 2025 (36 members), after
// 2025 joined the DEI era on 22 Nov 2026. The published May chart (2021 to 2024,
// 31 members) had 22; the R export reproduces that with ERA_DEI = 2021:2024.
const nsig = Families.master(counts, dei).rows.filter((r) => r.significant_after_bh).length;
console.log("  full forest (26 significant in 2021-25): " + (nsig === 26 ? "OK" : "FAIL " + nsig));
if (nsig !== 26) pass = false;

console.log("\n" + (pass ? "ALL JS-vs-R ORACLE CHECKS PASS" : "ORACLE MISMATCH"));
process.exit(pass ? 0 : 1);
