import { recordStatus, TEST_REVIEW } from "./plan-fixtures.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERVENTIONS, interventionCounts, interventionReview, suggestIntervention } from "../js/intervention.js";
import { bestCoverage, meanScore, relativeGain, spreadOut, topRanked } from "../js/optimizer.js";
import { createPlan, readiness, sanitiseAll, warnings } from "../js/plan.js";
import { unionReach } from "../js/pilot.js";

const store = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };
const props = (o = {}) => ({ ndvi_mean: 0.3, corridor_gap_flag: false, corridor_gap_dist_m: 900, uncovered_path_length_50m: 0, lst_valid_frac: 1, ...o });

// ---------- intervention suggestion ----------

test("intervention: first matching rule wins, in the order unreliable, green, corridor gap, shade, otherwise inspect", () => {
  assert.equal(suggestIntervention(props({ lst_valid_frac: 0.2, ndvi_mean: 0.7, corridor_gap_flag: true })).key, "inspect");
  assert.equal(suggestIntervention(props({ ndvi_mean: 0.7, corridor_gap_flag: true })).key, "protect");
  assert.equal(suggestIntervention(props({ corridor_gap_flag: true, uncovered_path_length_50m: 80 })).key, "regenerate");
  assert.equal(suggestIntervention(props({ uncovered_path_length_50m: 80 })).key, "plant-shade");
  assert.equal(suggestIntervention(props()).key, "inspect");
});

test("intervention: the other rules a site meets are listed, each with a reason, and every suggestion names a reviewer", () => {
  const s = suggestIntervention(props({ corridor_gap_flag: true, uncovered_path_length_50m: 80, corridor_gap_dist_m: 12 }));
  assert.deepEqual(s.also.map((a) => a.key), ["plant-shade"]);
  assert.match(s.reasons[0], /12 m/);
  assert.ok(s.also[0].reason.length > 10);
  for (const i of INTERVENTIONS) assert.ok(i.reviewer && i.principle && i.sees);
  assert.equal(suggestIntervention(props({ ndvi_mean: 0.7 })).reviewer, "ecologist");
});

test("intervention: missing measurements never trigger protect, regenerate or shade", () => {
  assert.equal(suggestIntervention({}).key, "inspect");
  assert.equal(suggestIntervention({ ndvi_mean: null, corridor_gap_flag: null }).key, "inspect");
});

test("intervention counts add up to the number of sites", () => {
  const feats = [props({ ndvi_mean: 0.8 }), props({ corridor_gap_flag: true }), props(), props({ uncovered_path_length_50m: 5 })].map((p) => ({ properties: p }));
  assert.deepEqual(interventionCounts(feats), { protect: 1, regenerate: 1, "plant-shade": 1, inspect: 1 });
});

test("intervention review: Protect and Regenerate need a named ecologist; a named reviewer marks it reviewed", () => {
  const sug = suggestIntervention(props({ corridor_gap_flag: true }));
  assert.equal(interventionReview({ intervention: "" }, sug).state, "suggested");
  assert.equal(interventionReview({ intervention: "regenerate", interventionBy: "" }, sug).state, "needs-ecologist");
  assert.equal(interventionReview({ intervention: "plant-shade", interventionBy: "" }, sug).state, "chosen");
  const r = interventionReview({ intervention: "protect", interventionBy: "Dr A", interventionOn: "2026-10-20" }, sug);
  assert.equal(r.state, "reviewed");
  assert.match(r.text, /Dr A on 2026-10-20/);
});

// ---------- plan fields ----------

test("plan: intervention and readiness fields are stored, cleaned, and survive a reload; unknown keys are refused", () => {
  const s = store();
  const plan = createPlan(s);
  plan.add("A");
  plan.setIntervention("A", "regenerate");
  plan.setIntervention("A", "bulldoze");              // ignored
  plan.setInterventionBy("A", "  Ecologist B \u0007 ");
  plan.setInterventionOn("A", "2026-13-40");          // not a date: stays empty
  plan.setReadiness("A", "watering", "available");
  plan.setReadiness("A", "watering", "lots");          // ignored
  plan.setReadiness("A", "maintainer", "Township landscape team");
  plan.setReadiness("A", "colour", "green");          // unknown field ignored
  const e = createPlan(s).get("A");
  assert.equal(e.intervention, "regenerate");
  assert.equal(e.interventionBy, "Ecologist B");
  assert.equal(e.interventionOn, "");
  assert.equal(e.watering, "available");
  assert.equal(e.maintainer, "Township landscape team");
  assert.equal("colour" in e, false);
});

test("plan: old stored entries without the new fields load with everything unknown", () => {
  const { items } = sanitiseAll({ items: [{ id: "A", status: "approved", checks: {} }] });
  assert.deepEqual([items[0].intervention, items[0].species, items[0].watering, items[0].maintainer, items[0].establishment], ["", "", "unknown", "", ""]);
});

test("readiness: six rows, unknowns stay unknown, soil comes from the field check and survival only from inspected trees", () => {
  const plan = createPlan(store());
  plan.add("A");
  const r0 = readiness(plan.get("A"));
  assert.equal(r0.rows.length, 6);
  assert.equal(r0.set, 0);
  assert.deepEqual(r0.rows.map((r) => r.value), ["Awaiting ecologist selection", "Not checked", "Unknown", "Unassigned", "To be set by planner", "No field data"]);
  plan.setCheck("A", "space_soil", "issue");
  plan.setReadiness("A", "species", "Shorea roxburghii");
  const trees = [{ site_id: "A", observations: [] }, { site_id: "A", observations: [{ date: "2026-12-01", condition: "dead" }, { date: "2027-01-01", condition: "alive-poor" }] }];
  const r1 = readiness(plan.get("A"), trees);
  assert.equal(r1.rows.find((r) => r.key === "soil").value, "Checked, problem found");
  assert.equal(r1.rows.find((r) => r.key === "survival").value, "1 of 1 inspected trees alive");
  assert.equal(r1.set, 3);
  assert.equal(readiness(plan.get("A"), [{ site_id: "A", observations: [] }]).rows.find((r) => r.key === "survival").value, "Trees recorded, none inspected yet");
});

test("warnings: an unreviewed Protect or Regenerate, planting a Protect site, and planting with no maintainer are flagged", () => {
  const plan = createPlan(store());
  plan.add("A"); plan.setIntervention("A", "protect"); recordStatus(plan, "A", "approved");
  const w = warnings(plan.get("A"));
  assert.ok(w.some((x) => /name the ecologist/.test(x)));
  assert.ok(w.some((x) => /Protect existing vegetation/.test(x)));
  assert.ok(w.some((x) => /responsible for maintenance/.test(x)));
  plan.setInterventionBy("A", "Ecologist B"); plan.setIntervention("A", "plant-shade"); plan.setReadiness("A", "maintainer", "Team C");
  assert.equal(warnings(plan.get("A")).filter((x) => /ecologist|Protect|maintenance/.test(x)).length, 0);
});

// ---------- optimizer ----------

// Four sites in rank order. A and B reach the same footpath; C reaches new homes; D reaches a corridor gap.
const reach = {
  stale: false,
  totals: { footpath_samples: 10, homes: 10, gap_samples: 10 },
  sample_step_m: { footpath: 10, gap: 10 },
  sites: { A: [[1, 2, 3], [1], []], B: [[1, 2, 3], [1], []], C: [[4], [2, 3, 4, 5], []], D: [[], [], [1, 2, 3]] },
};
const feat = (id, rank, block) => ({ properties: { site_id: id, rank, block_id: block, score_total: 100 - rank } });
const ranked = [feat("A", 1, "b1"), feat("B", 2, "b1"), feat("C", 3, "b2"), feat("D", 4, "b3")];

test("best coverage skips a site that only repeats what is already reached", () => {
  const r = bestCoverage(reach, ranked, 3, "balanced");
  assert.deepEqual(r.ids, ["C", "A", "D"]);
  assert.deepEqual(topRanked(ranked, 3), ["A", "B", "C"]);
  const best = unionReach(reach, r.ids), top = unionReach(reach, topRanked(ranked, 3));
  assert.ok(best.footpath_m >= top.footpath_m && best.homes >= top.homes && best.gap_m > top.gap_m);
});

test("best coverage: single objectives, ties go to the better rank, and zero-gain picks fall back to rank order", () => {
  assert.deepEqual(bestCoverage(reach, ranked, 2, "footpath").ids, ["A", "C"]);
  assert.deepEqual(bestCoverage(reach, ranked, 1, "gaps").ids, ["D"]);
  assert.deepEqual(bestCoverage(reach, ranked, 4, "gaps").ids, ["D", "A", "B", "C"]);
  assert.deepEqual(bestCoverage(reach, ranked, 4, "gaps").gains, [3, 0, 0, 0]);
});

test("best coverage leaves out excluded (rejected) sites, honours the pool, and says when it is short", () => {
  assert.equal(bestCoverage(reach, ranked, 4, "balanced", { exclude: new Set(["C"]) }).ids.includes("C"), false);
  const small = bestCoverage(reach, ranked, 4, "balanced", { pool: 2 });
  assert.deepEqual(small.ids, ["A", "B"]);
  assert.equal(small.short, true);
});

test("best coverage refuses stale or missing reach data rather than guess", () => {
  assert.equal(bestCoverage(null, ranked, 2), null);
  assert.equal(bestCoverage({ ...reach, stale: true }, ranked, 2), null);
  assert.equal(bestCoverage({ ...reach, stale: null }, ranked, 2), null);
});

test("spread out keeps at most maxPerBlock sites per block, in rank order", () => {
  assert.deepEqual(spreadOut(ranked, 3, new Set(), 1), ["A", "C", "D"]);
  assert.deepEqual(spreadOut(ranked, 3, new Set(["A"]), 1), ["B", "C", "D"]);
});

test("mean score and relative gain", () => {
  const byId = new Map(ranked.map((f) => [f.properties.site_id, f]));
  assert.equal(meanScore(["A", "C"], byId), 98);
  assert.equal(meanScore([], byId), null);
  assert.equal(relativeGain(150, 100), 50);
  assert.equal(relativeGain(5, 0), null);
});
