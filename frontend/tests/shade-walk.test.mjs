import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_ROUTES, MIN_WALKS, WALK_COLUMNS, WALK_NOTE, baselineBasis, blankWalkSheet, createWalks, readWalkSheet, summariseWalks } from "../js/shade-walk.js";
import { createExposure, exposureScenario } from "../js/exposure.js";

const HEAD = WALK_COLUMNS.join(",");
const row = (id, route, date, type, walking, shaded, extra = {}) => [id, route, date, extra.time ?? "09:30", extra.weather ?? "sunny", type, walking, shaded, extra.notes ?? ""].join(",");
const sheet = (...rows) => [HEAD, ...rows].join("\r\n");

test("a good sheet gives walks with numbers, trimmed and typed", () => {
  const r = readWalkSheet(sheet(row("W01", "near ELM-1", "2026-11-02", "RESIDENT", "12", "3.5"), row("W02", "near ELM-2", "2026-11-02", "proxy", "10", "0")));
  assert.equal(r.ok, true);
  assert.equal(r.walks.length, 2);
  assert.deepEqual([r.walks[0].participant_type, r.walks[0].walking_minutes, r.walks[0].shaded_minutes], ["resident", 12, 3.5]);
});

test("every kind of bad row is refused whole with its row number and the rule", () => {
  const r = readWalkSheet(sheet(
    row("W01", "R", "2026-02-31", "resident", "10", "2"),
    row("W02", "R", "2026-11-02", "tourist", "10", "2"),
    row("W03", "R", "2026-11-02", "resident", "10", "12"),
    row("W04", "R", "2026-11-02", "resident", "0", "0"),
    row("W05", "R", "2026-11-02", "resident", "abc", "1"),
    row("W06", "R", "2026-11-02", "resident", "300", "1"),
    row("W06", "R", "2026-11-02", "resident", "10", "1"),
    row("W07", "R", "2026-11-02", "resident", "10", "-1"),
    row("W08", "R", "2026-11-02", "resident", "10", "1", { time: "25:99" }),
  ));
  assert.equal(r.ok, false);
  const msg = r.problems.join(" | ");
  assert.match(msg, /row 2: date '2026-02-31'/);
  assert.match(msg, /row 3: participant_type 'tourist' must be one of resident, proxy, team/);
  assert.match(msg, /row 4: shaded_minutes \(12\) is more than walking_minutes \(10\)/);
  assert.match(msg, /row 5: walking_minutes '0'/);
  assert.match(msg, /row 6: walking_minutes 'abc'/);
  assert.match(msg, /row 7: walking_minutes '300'/);
  assert.match(msg, /walk_id W06 appears more than once/);
  assert.match(msg, /shaded_minutes '-1' must be a number, 0 or more/);
  assert.match(msg, /start_time '25:99'/);
  assert.equal(r.walks.length, 0 + r.walks.length);
});

test("empty rows are left out and counted, a missing column or an empty file is refused", () => {
  const r = readWalkSheet(sheet(row("W01", "R", "2026-11-02", "team", "10", "5"), "W02,R,,,,,,,", "W03,R,,,,,,,"));
  assert.equal(r.ok, true);
  assert.equal(r.blank, 2);
  assert.match(readWalkSheet("walk_id,route_id\nW1,R").problems[0], /Missing column\(s\): date, start_time/);
  assert.equal(readWalkSheet("").ok, false);
  assert.equal(readWalkSheet(sheet("W02,R,,,,,,,")).ok, false);
});

test("the pooled share is minutes in shade over minutes walked, not an average of percentages", () => {
  const walks = readWalkSheet(sheet(row("W01", "A", "2026-11-02", "resident", "30", "30"), row("W02", "B", "2026-11-03", "proxy", "10", "0"))).walks;
  const s = summariseWalks(walks);
  assert.equal(s.pooledShadePct, 75);
  assert.equal(s.minShadePct, 0);
  assert.equal(s.maxShadePct, 100);
  assert.deepEqual([s.from, s.to, s.routes], ["2026-11-02", "2026-11-03", 2]);
  assert.deepEqual(s.byRoute.map((x) => [x.route, x.shadePct]), [["A", 100], ["B", 0]]);
  assert.deepEqual(s.byType, { resident: 1, proxy: 1 });
});

test("fewer than five walks or two routes is too few to use as a baseline", () => {
  const few = readWalkSheet(sheet(row("W01", "A", "2026-11-02", "team", "10", "5"), row("W02", "B", "2026-11-02", "team", "10", "5"))).walks;
  assert.equal(summariseWalks(few).enough, false);
  assert.match(summariseWalks(few).why, new RegExp(`at least ${MIN_WALKS} walks on ${MIN_ROUTES} routes`));
  const oneRoute = readWalkSheet(sheet(...[1, 2, 3, 4, 5].map((i) => row(`W0${i}`, "A", "2026-11-02", "team", "10", "5")))).walks;
  assert.equal(summariseWalks(oneRoute).enough, false);
  const enough = readWalkSheet(sheet(...[1, 2, 3, 4, 5].map((i) => row(`W0${i}`, i % 2 ? "A" : "B", "2026-11-02", "team", "10", "5")))).walks;
  assert.equal(summariseWalks(enough).enough, true);
  assert.equal(summariseWalks([]).n, 0);
});

test("the basis sentence records n, routes, dates, participant types and the pooled share", () => {
  const walks = readWalkSheet(sheet(...[1, 2, 3, 4, 5].map((i) => row(`W0${i}`, i % 2 ? "A" : "B", "2026-11-0" + i, i < 3 ? "resident" : "proxy", "10", "4")))).walks;
  const b = baselineBasis(summariseWalks(walks));
  assert.match(b, /^Timed shade walks: 5 walks on 2 routes, 2026-11-01 to 2026-11-05; 2 resident, 3 proxy; pooled shade share 40% of 50 walking minutes\.$/);
  assert.ok(b.length < 200);
});

test("filling the baseline from walks never fills the scenario share, and the calculator still needs the rest", () => {
  const exposure = createExposure({ getItem: () => null, setItem() {} });
  exposure.set("baselineShadePct", 40);
  const state = exposure.get();
  assert.equal(state.baselineShadePct, 40);
  assert.equal(state.targetShadePct, null);
  assert.equal(exposureScenario({ homes: 100 }, state).state, "needs-inputs");
});

test("a blank walk sheet has the agreed columns, numbered walks and formula-safe route names", () => {
  const rows = blankWalkSheet(["near ELM-1", "=BAD"], 2);
  assert.equal(rows.length, 4);
  assert.deepEqual(Object.keys(rows[0]), WALK_COLUMNS);
  assert.deepEqual(rows.map((r) => r.walk_id), ["W01", "W02", "W03", "W04"]);
  assert.equal(rows[3].route_id, "'=BAD");
  assert.equal(rows[0].walking_minutes, "");
});

test("stored walks are re-checked with the same rules, and bad stored data is dropped", () => {
  let saved = null;
  const storage = { getItem: () => saved, setItem: (_, v) => { saved = v; } };
  const a = createWalks(storage);
  const walks = readWalkSheet(sheet(row("W01", "A", "2026-11-02", "team", "10", "5"))).walks;
  a.set(walks, "Imported 1 walk.");
  assert.equal(createWalks(storage).get().walks.length, 1);
  assert.equal(createWalks(storage).get().note, "Imported 1 walk.");
  saved = JSON.stringify({ walks: [{ walk_id: "W1", route_id: "A", date: "nope", participant_type: "resident", walking_minutes: 10, shaded_minutes: 5 }], note: "x" });
  assert.equal(createWalks(storage).get().walks.length, 0);
  saved = "{not json";
  assert.equal(createWalks(storage).get().walks.length, 0);
});

test("the note says a walk is one route at one time, a baseline only, and that proxies are not residents", () => {
  assert.match(WALK_NOTE, /one route that was in shade, at that time of day and in that weather/);
  assert.match(WALK_NOTE, /today's baseline only/);
  assert.match(WALK_NOTE, /not residents' experience/);
});
