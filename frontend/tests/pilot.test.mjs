import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEDULE_COLUMNS, blocksOf, inspectionPlan, nextAction, plantingPlan, suggestAlternatives, unionReach, workSchedule } from "../js/pilot.js";
import { createPlan } from "../js/plan.js";
import { CONDITIONS } from "../js/plan.js";
import { STATE_LABEL, TREE_COLUMNS, maintenanceSchedule, survivalReport, treeRows } from "../js/trees.js";

const store = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };
const none = { inspectionsPerDay: null, costPerInspection: null, treesPerSite: null, costPerTree: null, unit: "" };
function planWith(specs) {
  const plan = createPlan(store());
  for (const [id, status, extra = {}] of specs) {
    plan.add(id); plan.setStatus(id, status);
    if (extra.batch) plan.setBatch(id, extra.batch);
    if (extra.phase) plan.setPhase(id, extra.phase);
  }
  return plan;
}

test("inspection workload: counts by batch, and days and cost only from the planner's own numbers", () => {
  const plan = planWith([["A", "needs-inspection", { batch: "Week 1" }], ["B", "needs-inspection", { batch: "Week 1" }], ["C", "needs-inspection"], ["D", "approved"], ["E", "rejected"], ["F", "inspected"]]);
  const none1 = inspectionPlan(plan.list(), none);
  assert.deepEqual([none1.awaiting, none1.days, none1.cost, none1.inspected, none1.rejected], [3, null, null, 1, 1]);
  assert.deepEqual(none1.batches.map((b) => [b.name, b.count, b.days]), [["No batch yet", 1, null], ["Week 1", 2, null]]);
  const some = inspectionPlan(plan.list(), { ...none, inspectionsPerDay: 2, costPerInspection: 50 });
  assert.equal(some.days, 2);
  assert.equal(some.cost, 150);
  assert.deepEqual(some.batches.map((b) => b.days), [1, 1]);
});

test("planting phases count approved and planted sites; trees and cost appear only when trees per site and a cost per tree are entered", () => {
  const plan = planWith([["A", "approved", { phase: "1" }], ["B", "approved", { phase: "1" }], ["C", "planted", { phase: "2" }], ["D", "approved"], ["E", "proposed"]]);
  const bare = plantingPlan(plan.list(), none);
  assert.equal(bare.sites, 4);
  assert.deepEqual(bare.rows.map((r) => [r.phase, r.sites, r.trees, r.cost]), [["1", 2, null, null], ["2", 1, null, null], ["No phase yet", 1, null, null]]);
  assert.equal(bare.trees, null);
  const priced = plantingPlan(plan.list(), { ...none, treesPerSite: 3, costPerTree: 10 });
  assert.deepEqual(priced.rows.map((r) => [r.trees, r.cost]), [[6, 60], [3, 30], [3, 30]]);
  assert.equal(priced.trees, 12);
});

test("replacements prefer the same 250 m block, skip sites already in the plan, and say which are nearby", () => {
  const f = (id, rank, block) => ({ properties: { site_id: id, rank, score_total: 100 - rank, block_id: block } });
  const ranked = [f("S1", 1, "B1"), f("S2", 2, "B2"), f("S3", 3, "B1"), f("S4", 4, "B3"), f("S5", 5, "B1"), f("S6", 6, "B2")];
  const out = suggestAlternatives("S1", ranked, new Set(["S1", "S3"]), 3);
  assert.deepEqual(out.map((x) => x.id), ["S5", "S2", "S4"]);
  assert.deepEqual(out.map((x) => x.sameBlock), [true, false, false]);
  assert.deepEqual(suggestAlternatives("S1", ranked, new Set(ranked.map((x) => x.properties.site_id)), 3), []);
  assert.equal(suggestAlternatives("ZZ", ranked, new Set(), 2).length, 2);
});

test("blocks are counted once however many sites share them", () => {
  const byId = new Map([["A", { properties: { block_id: "B1" } }], ["B", { properties: { block_id: "B1" } }], ["C", { properties: { block_id: "B2" } }]]);
  assert.equal(blocksOf(["A", "B", "C", "MISSING"], byId), 2);
});

test("unique reach is a union: shared footpath samples, homes and gaps are counted once", () => {
  const sets = { totals: { footpath_samples: 10, homes: 4, gap_samples: 2 }, sample_step_m: { footpath: 10, gap: 10 },
    sites: { A: [[0, 1, 2], [0, 1], [0]], B: [[2, 3], [1, 2], []], C: [[9], [], [1]] } };
  assert.deepEqual(unionReach(sets, ["A", "B"]), { footpath_m: 40, footpath_pct: 40, homes: 3, homes_pct: 75, gap_m: 10, gap_pct: 50 });
  assert.equal(unionReach(sets, ["A", "A", "A"]).footpath_m, 30, "repeats change nothing");
  assert.deepEqual(unionReach(sets, []), { footpath_m: 0, footpath_pct: 0, homes: 0, homes_pct: 0, gap_m: 0, gap_pct: 0 });
  assert.equal(unionReach(null, ["A"]), null);
});

test("the work schedule gives one row per site, with a next action for each status, sorted by batch then phase", () => {
  const plan = planWith([["Z", "approved", { batch: "B", phase: "2" }], ["A", "needs-inspection", { batch: "A" }], ["M", "rejected"]]);
  const rows = workSchedule(plan.list());
  assert.deepEqual(rows.map((r) => r.site_id), ["A", "Z", "M"]);
  assert.match(rows[0].next, /Inspect on site/);
  assert.match(rows[2].next, /next-ranked alternative/);
  assert.deepEqual(SCHEDULE_COLUMNS.map((c) => c.key), ["site_id", "batch", "phase", "team", "status", "next", "unresolved", "reason"]);
  assert.match(nextAction({ status: "planted" }), /follow-up inspections/);
});

// ---------------- trees: schedule and survival ----------------
function trees(specs) {
  const plan = createPlan(store());
  plan.add("S"); plan.setStatus("S", "planted");
  for (const [species, planted, next, obs = []] of specs) {
    const id = plan.addTree({ site_id: "S", species, planted_on: planted, next_inspection: next });
    for (const [date, condition] of obs) plan.addObservation(id, { date, condition });
  }
  return plan.trees();
}

test("with no tree records the report says No field data", () => {
  assert.equal(survivalReport([]).state, "no-data");
  assert.match(survivalReport([]).text, /^No field data/);
});

test("trees with no inspection are never counted as surviving", () => {
  const r = survivalReport(trees([["A", "2026-11-01", ""], ["B", "2026-11-01", ""]]));
  assert.equal(r.state, "no-inspections");
  assert.equal(r.inspected, 0);
  assert.match(r.text, /none inspected/);
});

test("survival is alive among inspected trees at each tree's latest inspection, with the denominator, dates and the not-yet-inspected stated", () => {
  const r = survivalReport(trees([
    ["A", "2026-11-01", "", [["2027-05-01", "alive-good"]]],
    ["B", "2026-11-01", "", [["2027-02-01", "alive-good"], ["2027-06-01", "dead"]]],
    ["C", "2026-11-01", "", [["2027-05-10", "alive-poor"]]],
    ["D", "2026-11-01", "", [["2027-05-12", "not-found"]]],
    ["E", "2026-11-01", ""],
  ]));
  assert.deepEqual([r.trees, r.inspected, r.alive, r.deadOrMissing, r.notYet, r.pct], [5, 4, 2, 2, 1, 50]);
  assert.equal(r.from, "2027-05-01");
  assert.equal(r.to, "2027-06-01");
  assert.match(r.text, /2 of 4 \(50%\)/);
  assert.match(r.text, /1 recorded tree has not been inspected and is not counted as surviving/);
});

test("the maintenance schedule puts overdue first and trees with no date last", () => {
  const rows = maintenanceSchedule(trees([["A", "2026-11-01", "2027-09-01"], ["B", "2026-11-01", "2027-01-15"], ["C", "2026-11-01", ""], ["D", "2026-11-01", "2027-03-01"]]), "2027-03-01");
  assert.deepEqual(rows.map((r) => [r.id, r.state]), [["T2", "overdue"], ["T4", "due-today"], ["T1", "scheduled"], ["T3", "no-date"]]);
  assert.equal(STATE_LABEL.overdue, "Overdue");
});

test("the tree register rows say when nothing has been recorded and are formula-safe", () => {
  const rows = treeRows(trees([["=cmd", "2026-11-01", "", []], ["B", "2026-11-01", "", [["2027-05-01", "alive-good"]]]]));
  assert.equal(rows[0].species, "'=cmd");
  assert.equal(rows[0].last_condition, "No inspection recorded");
  assert.equal(rows[1].last_condition, "Alive, good condition");
  assert.equal(TREE_COLUMNS.length, 11);
  assert.equal(CONDITIONS.length, 4);
});

import { STEP_NAMES, nextStep } from "../js/pilot.js";

test("the guide always names one next step from where the plan stands", () => {
  const e = (status, extra = {}) => ({ id: status, status, observed: null, reviewed: "", phase: "", ...extra });
  assert.equal(nextStep([], []).step, 1);
  assert.equal(nextStep([e("proposed")], []).step, 1);
  assert.equal(nextStep([e("needs-inspection")], []).step, 2);
  assert.match(nextStep([e("needs-inspection")], []).text, /Download the field sheet/);
  assert.equal(nextStep([e("inspected")], []).step, 1);
  assert.match(nextStep([e("inspected")], []).text, /keep or reject/);
  assert.equal(nextStep([e("approved", { observed: { outcome: "agree" }, reviewed: "kept" })], []).step, 3);
  assert.match(nextStep([e("approved", { phase: "1" })], []).text, /mark that site Planted/);
  assert.equal(nextStep([e("planted")], []).step, 4);
  assert.match(nextStep([e("planted")], [{ id: "T1" }]).text, /only trees that were inspected/);
  assert.equal(STEP_NAMES.length, 4);
});
