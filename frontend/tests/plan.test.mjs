import { test } from "node:test";
import assert from "node:assert/strict";
import { FIELD_SHEET_COLUMNS, MAX_ENTRIES, NOTE_MAX, PLAN_CAVEAT, PLAN_COLUMNS, STORAGE_KEY, createPlan, fieldSheetRows, planRows, planTiles, safeCell, sanitise } from "../js/plan.js";
import { toCsv } from "../js/csv.js";

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
};
const square = (x) => ({ type: "Polygon", coordinates: [[[x, 3], [x + 0.0003, 3], [x + 0.0003, 3.0003], [x, 3.0003], [x, 3]]] });
const site = (id, rank, extra = {}) => [id, { type: "Feature", geometry: square(101.5 + rank / 1000), properties: { site_id: id, rank, score_total: 90 - rank, origin: "open_land", source: "simulated", ...extra } }];
const byId = new Map([site("ELM-1", 1), site("ELM-2", 2), site("ELM-3", 3)]);

test("adding, changing, noting and removing a site", () => {
  const plan = createPlan(fakeStorage());
  assert.equal(plan.add("ELM-1"), true);
  assert.equal(plan.add("ELM-1"), false, "no repeats");
  assert.deepEqual(plan.get("ELM-1"), { id: "ELM-1", status: "proposed", note: "" });
  plan.setStatus("ELM-1", "needs-inspection");
  plan.setNote("ELM-1", "  near the car park  ");
  assert.deepEqual(plan.get("ELM-1"), { id: "ELM-1", status: "needs-inspection", note: "near the car park" });
  plan.setStatus("ELM-1", "teleported");
  assert.equal(plan.get("ELM-1").status, "needs-inspection", "unknown statuses are refused");
  plan.remove("ELM-1");
  assert.equal(plan.has("ELM-1"), false);
});

test("the plan is remembered through the storage it was given", () => {
  const storage = fakeStorage();
  const a = createPlan(storage);
  a.add("ELM-2"); a.setStatus("ELM-2", "approved"); a.setNote("ELM-2", "ok");
  const b = createPlan(storage);
  assert.deepEqual(b.list(), [{ id: "ELM-2", status: "approved", note: "ok" }]);
});

test("corrupt or hostile storage is ignored or cleaned, never trusted", () => {
  assert.deepEqual(createPlan(fakeStorage({ [STORAGE_KEY]: "{not json" })).list(), []);
  assert.deepEqual(createPlan(fakeStorage({ [STORAGE_KEY]: "[]" })).list(), []);
  const dirty = { v: 1, items: [
    { id: "<img src=x>", status: "approved", note: "" }, { id: "ELM-1", status: "hacked", note: "" }, { id: "ELM-2", status: "planted", note: "a\u0000b\nc" },
    { id: "ELM-2", status: "approved", note: "repeat" }, null, "x", { id: "ELM-3", status: "proposed", note: "n".repeat(1000) },
  ] };
  const items = sanitise(dirty);
  assert.deepEqual(items.map((x) => x.id), ["ELM-2", "ELM-3"]);
  assert.equal(items[0].note, "a b c");
  assert.equal(items[1].note.length, NOTE_MAX);
});

test("a storage that throws still lets the plan work for the visit", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const plan = createPlan(broken);
  assert.equal(plan.add("ELM-1"), true);
  assert.equal(plan.has("ELM-1"), true);
});

test("the plan has a size limit and refuses invalid ids", () => {
  const plan = createPlan(fakeStorage());
  for (let i = 0; i < MAX_ENTRIES + 20; i++) plan.add(`S${i}`);
  assert.equal(plan.list().length, MAX_ENTRIES);
  assert.equal(plan.add("bad id"), false);
  assert.equal(plan.add("../x"), false);
});

test("counts and tiles reflect the statuses", () => {
  const plan = createPlan(fakeStorage());
  for (const id of ["A", "B", "C", "D"]) plan.add(id);
  plan.setStatus("A", "needs-inspection"); plan.setStatus("B", "needs-inspection"); plan.setStatus("C", "approved");
  const c = plan.counts();
  assert.equal(c.total, 4); assert.equal(c.by["needs-inspection"], 2); assert.equal(c.by.approved, 1); assert.equal(c.by.proposed, 1);
  assert.deepEqual(planTiles(c).map((t) => t.value), ["4", "2", "1", "0"]);
});

test("listeners hear the source of each change", () => {
  const plan = createPlan(fakeStorage());
  const heard = [];
  const off = plan.subscribe((source) => heard.push(source));
  plan.add("ELM-1", "card"); plan.setStatus("ELM-1", "approved", "panel"); plan.setStatus("ELM-1", "approved", "panel");
  off(); plan.remove("ELM-1", "panel");
  assert.deepEqual(heard, ["card", "panel"], "no event for an unchanged value or after unsubscribing");
});

test("the plan file has the current rank, place and a plain note, in plan order, skipping sites the data no longer has", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-3"); plan.add("GONE-1"); plan.add("ELM-1");
  plan.setStatus("ELM-3", "needs-inspection"); plan.setNote("ELM-3", "check access");
  const rows = planRows(plan.list(), byId);
  assert.deepEqual(rows.map((r) => r.site_id), ["ELM-3", "ELM-1"]);
  assert.equal(rows[0].status, "Needs inspection");
  assert.match(String(rows[0].lat), /^3\.0001/);
  const csv = toCsv(rows, PLAN_COLUMNS);
  assert.match(csv.split("\r\n")[0], /^site_id,status,note,current_rank,current_score,origin,lat,lon,source,about_this_file$/);
  assert.match(csv, /not inspected or verified/);
});

test("a note that a spreadsheet would run as a formula is neutralised", () => {
  assert.equal(safeCell("=HYPERLINK(\"http://x\")"), "'=HYPERLINK(\"http://x\")");
  assert.equal(safeCell("+1"), "'+1");
  assert.equal(safeCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(safeCell("-2"), "'-2");
  assert.equal(safeCell("plain note"), "plain note");
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1"); plan.setNote("ELM-1", "=2+2");
  assert.equal(planRows(plan.list(), byId)[0].note, "'=2+2");
});

test("the field sheet lists only Needs inspection sites, by place only, in the columns the importer reads", () => {
  const plan = createPlan(fakeStorage());
  plan.add("ELM-1"); plan.add("ELM-2"); plan.add("ELM-3");
  plan.setStatus("ELM-2", "needs-inspection"); plan.setStatus("ELM-3", "approved");
  const rows = fieldSheetRows(plan.list(), byId);
  assert.deepEqual(rows.map((r) => r.site_id), ["ELM-2"]);
  assert.deepEqual(Object.keys(rows[0]), FIELD_SHEET_COLUMNS);
  assert.equal(rows[0].shade_on_path, "");
  const csv = toCsv(rows, FIELD_SHEET_COLUMNS.map((c) => ({ key: c, label: c })));
  assert.doesNotMatch(csv, /rank|score/i);
});

test("the caveat says the entries are the planner's own and nothing was inspected", () => {
  assert.match(PLAN_CAVEAT, /planner's own entries/);
  assert.match(PLAN_CAVEAT, /Nothing here has been inspected/);
});
