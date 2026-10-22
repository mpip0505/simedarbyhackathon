import { recordStatus, TEST_REVIEW } from "./plan-fixtures.mjs";
// The extended planting plan: field-feasibility checks, batches and phases, imported observations, tree records, settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, CHECK_VALUES, CONDITIONS, STORAGE_KEY, createPlan, feasibility, fieldSheetRows, planRows, warnings } from "../js/plan.js";

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
};
const square = (x) => ({ type: "Polygon", coordinates: [[[x, 3], [x + 0.0003, 3], [x + 0.0003, 3.0003], [x, 3.0003], [x, 3]]] });
const site = (id, rank) => [id, { type: "Feature", geometry: square(101.5 + rank / 1000), properties: { site_id: id, rank, score_total: 90 - rank, origin: "open_land", source: "simulated" } }];
const byId = new Map([site("ELM-1", 1), site("ELM-2", 2), site("ELM-3", 3)]);

test("a new site has five unknown checks, and unknown never counts as OK", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1");
  const e = plan.get("ELM-1");
  assert.equal(Object.keys(e.checks).length, 5);
  assert.ok(Object.values(e.checks).every((v) => v === "unknown"));
  assert.deepEqual([feasibility(e).state, feasibility(e).ok, feasibility(e).unknown], ["not-checked", 0, 5]);
});

test("feasibility is partial, then problem found, then all OK, and all OK is never called an approval", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1");
  plan.setCheck("ELM-1", "access", "ok"); plan.setCheck("ELM-1", "utilities", "ok");
  assert.equal(feasibility(plan.get("ELM-1")).state, "partial");
  assert.match(feasibility(plan.get("ELM-1")).label, /2 of 5 checks OK/);
  plan.setCheck("ELM-1", "space_soil", "issue");
  assert.equal(feasibility(plan.get("ELM-1")).state, "issue");
  for (const c of CHECKS) plan.setCheck("ELM-1", c.key, "ok");
  const f = feasibility(plan.get("ELM-1"));
  assert.equal(f.state, "all-ok");
  assert.match(f.label, /not an approval/);
  assert.equal(plan.get("ELM-1").status, "proposed", "completing the checks never changes the status");
});

test("unknown check names and values are refused", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1");
  plan.setCheck("ELM-1", "nonsense", "ok"); plan.setCheck("ELM-1", "access", "maybe");
  assert.ok(Object.values(plan.get("ELM-1").checks).every((v) => v === "unknown"));
  assert.deepEqual(CHECK_VALUES.map((c) => c.key), ["unknown", "ok", "issue"]);
});

test("legacy statuses still show missing-evidence warnings, while new unsupported approvals are refused", () => {
  const plan=createPlan(fakeStorage());plan.add("ELM-1");
  assert.equal(plan.setStatus("ELM-1","approved"),false);
  const old={...plan.get("ELM-1"),status:"approved"};
  assert.match(warnings(old)[0],/Approved with checks not yet OK/);
  old.checks.access="issue";assert.match(warnings(old)[0],/although a check found a problem/);
  assert.match(warnings({...old,status:"rejected",reason:""})[0],/Add a reason/);
  assert.ok(warnings(old).some(x=>/Legacy status/.test(x)));
});

test("batch, phase and team are kept, trimmed and limited", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1");
  plan.setBatch("ELM-1", "  Week 1  "); plan.setPhase("ELM-1", "2"); plan.setTeam("ELM-1", "Landscape team A");
  assert.deepEqual([plan.get("ELM-1").batch, plan.get("ELM-1").phase, plan.get("ELM-1").team], ["Week 1", "2", "Landscape team A"]);
  plan.setPhase("ELM-1", "9");
  assert.equal(plan.get("ELM-1").phase, "", "an unknown phase clears it");
  plan.setBatch("ELM-1", "x".repeat(100));
  assert.equal(plan.get("ELM-1").batch.length, 24);
});

test("an unverified observation preserves inspection status, and an attributed review can reject it", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1"); plan.setStatus("ELM-1", "needs-inspection");
  plan.setObserved("ELM-1", { shade_on_path: "none", canopy_class: "sparse", path_in_use: "yes", outcome: "agree", differences: [], date: "2026-10-22" });
  assert.equal(plan.get("ELM-1").status, "needs-inspection");
  assert.equal(plan.get("ELM-1").observed.outcome, "insufficient", "legacy observations have no issued-sheet provenance");
  plan.setObserved("ELM-1", { shade_on_path: "bogus", canopy_class: "sparse", path_in_use: "yes", outcome: "agree" });
  assert.equal(plan.get("ELM-1").observed.shade_on_path, "none", "an invalid observation is refused");
  plan.setReviewed("ELM-1", "rejected", "test", TEST_REVIEW);
  assert.equal(plan.get("ELM-1").status, "rejected");
});

test("an old (v1) stored plan is upgraded with unknown checks", () => {
  const old = { v: 1, items: [{ id: "ELM-9", status: "approved", note: "kept" }] };
  const plan = createPlan(fakeStorage({ [STORAGE_KEY]: JSON.stringify(old) }));
  const e = plan.get("ELM-9");
  assert.equal(e.status, "approved");
  assert.equal(e.note, "kept");
  assert.ok(Object.values(e.checks).every((v) => v === "unknown"));
  assert.deepEqual(plan.trees(), []);
});

test("tree records need a site recorded as Planted, a species and a valid planting date", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1");
  assert.equal(plan.addTree({ site_id: "ELM-1", species: "Shorea", planted_on: "2026-11-01" }), null, "not Planted yet");
  recordStatus(plan, "ELM-1", "planted");
  assert.equal(plan.addTree({ site_id: "ELM-1", species: "", planted_on: "2026-11-01" }), null, "no species");
  assert.equal(plan.addTree({ site_id: "ELM-1", species: "Shorea", planted_on: "2026-02-31" }), null, "an impossible date");
  const id = plan.addTree({ site_id: "ELM-1", species: "Shorea", planted_on: "2026-11-01", owner: "Contractor", lat: 3.17, lon: 101.5 });
  assert.equal(id, "T1");
  assert.equal(plan.addTree({ site_id: "ELM-1", species: "Dipterocarp", planted_on: "2026-11-01" }), "T2");
  assert.equal(plan.trees().length, 2);
});

test("tree observations are dated, sorted, validated and limited", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1"); recordStatus(plan, "ELM-1", "planted");
  const id = plan.addTree({ site_id: "ELM-1", species: "Shorea", planted_on: "2026-11-01" });
  assert.equal(plan.addObservation(id, { date: "2027-05-01", condition: "alive-good" }), true);
  assert.equal(plan.addObservation(id, { date: "2027-02-01", condition: "dead", note: "gone" }), true);
  assert.equal(plan.addObservation(id, { date: "not a date", condition: "dead" }), false);
  assert.equal(plan.addObservation(id, { date: "2027-06-01", condition: "thriving" }), false);
  assert.deepEqual(plan.trees()[0].observations.map((o) => o.date), ["2027-02-01", "2027-05-01"]);
  assert.equal(CONDITIONS.length, 4);
});

test("tree records and settings survive a reload of the same storage", () => {
  const storage = fakeStorage();
  const a = createPlan(storage);
  a.add("ELM-1"); recordStatus(a, "ELM-1", "planted");
  const id = a.addTree({ site_id: "ELM-1", species: "Shorea", planted_on: "2026-11-01" });
  a.addObservation(id, { date: "2027-05-01", condition: "alive-good" });
  a.setSetting("inspectionsPerDay", "6");
  const b = createPlan(storage);
  assert.equal(b.trees()[0].observations.length, 1);
  assert.equal(b.settings().inspectionsPerDay, 6);
});

test("settings are user-entered numbers, never defaults", () => {
  const plan = createPlan(fakeStorage());
  assert.deepEqual(plan.settings(), { inspectionsPerDay: null, costPerInspection: null, treesPerSite: null, costPerTree: null, unit: "" });
  plan.setSetting("inspectionsPerDay", "6"); plan.setSetting("costPerInspection", "-5"); plan.setSetting("unit", "RM"); plan.setSetting("nonsense", "1");
  assert.deepEqual(plan.settings(), { inspectionsPerDay: 6, costPerInspection: null, treesPerSite: null, costPerTree: null, unit: "RM" });
});

test("hostile stored trees and settings are cleaned or dropped", () => {
  const dirty = { v: 2, items: [{ id: "ELM-1", status: "planted", note: "" }], settings: { inspectionsPerDay: "abc", unit: "<script>alert(1)</script>" },
    trees: [{ id: "T1", site_id: "ELM-1", species: "A".repeat(500), planted_on: "2026-13-45", observations: [{ date: "2027-01-01", condition: "dead" }, { date: "bad", condition: "dead" }] },
      { id: "<x>", site_id: "ELM-1", species: "x", planted_on: "2026-01-01" }, { id: "T1", site_id: "ELM-1", species: "dup", planted_on: "2026-01-01" }] };
  const plan = createPlan(fakeStorage({ [STORAGE_KEY]: JSON.stringify(dirty) }));
  assert.equal(plan.trees().length, 1);
  assert.equal(plan.trees()[0].species.length, 60);
  assert.equal(plan.trees()[0].planted_on, "");
  assert.equal(plan.trees()[0].observations.length, 1);
  assert.equal(plan.settings().inspectionsPerDay, null);
  assert.equal(plan.settings().unit.length, 8);
});

test("plan rows carry feasibility, batch, phase and the field observation outcome, with formula-safe text", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1"); plan.setBatch("ELM-1", "=Week 1"); plan.setPhase("ELM-1", "1"); plan.setCheck("ELM-1", "access", "ok");
  const row = planRows(plan.list(), byId)[0];
  assert.equal(row.batch, "'=Week 1");
  assert.equal(row.phase, "1");
  assert.match(row.feasibility, /1 of 5 checks OK/);
  assert.equal(row.unresolved, 4);
  assert.equal(row.observation, "No field observation");
});

test("a field sheet can be limited to one inspection batch", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1"); plan.add("ELM-2");
  plan.setStatus("ELM-1", "needs-inspection"); plan.setStatus("ELM-2", "needs-inspection");
  plan.setBatch("ELM-1", "A"); plan.setBatch("ELM-2", "B");
  assert.deepEqual(fieldSheetRows(plan.list(), byId, "A").map((r) => r.site_id), ["ELM-1"]);
  assert.equal(fieldSheetRows(plan.list(), byId).length, 2);
});
