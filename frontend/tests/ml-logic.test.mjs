import { test } from "node:test";
import assert from "node:assert/strict";
import { steadiness, steadySummary, shortlistRows, shortlistNote, scenarioSeries, scenarioHeadline } from "../js/ml-logic.js";

const U = { draws: 2000, k: 20, robust_threshold: 0.8, robust_count: 14, boundary_range: [0.2, 0.8], sites: {
  a: { rank_p05: 1, rank_p95: 1, rank_median: 1, topk_frequency: 1 },
  b: { rank_p05: 12, rank_p95: 49, rank_median: 27, topk_frequency: 0.39 },
  c: { rank_p05: 80, rank_p95: 200, rank_median: 120, topk_frequency: 0 },
} };

test("steadiness sorts sites into steady, on the fence and rare, with the rank range in words", () => {
  assert.equal(steadiness(U, "a").kind, "steady");
  assert.match(steadiness(U, "a").detail, /#1 every time/);
  assert.match(steadiness(U, "a").detail, /2,000 plausible/);
  const b = steadiness(U, "b");
  assert.equal(b.kind, "fence");
  assert.match(b.detail, /between #12 and #49 \(typically #27\).*39%/);
  assert.equal(steadiness(U, "c").kind, "rare");
});

test("steadiness is null without a report or a row", () => {
  assert.equal(steadiness(null, "a"), null);
  assert.equal(steadiness(U, "zzz"), null);
  assert.equal(steadySummary(null), null);
  assert.match(steadySummary(U), /^14 of the top 20 stay there in at least 80% of 2,000/);
});

test("shortlistRows keeps the shortlist order and drops unknown sites", () => {
  const byId = new Map([["x", { id: "x" }], ["y", { id: "y" }]]);
  assert.deepEqual(shortlistRows({ diversified_sites: [{ site_id: "y" }, { site_id: "gone" }, { site_id: "x" }] }, byId), [{ id: "y" }, { id: "x" }]);
  assert.deepEqual(shortlistRows(null, byId), []);
});

test("shortlistNote states the trade-off", () => {
  const note = shortlistNote({ max_per_block: 3, score_given_up: 1, raw_top_k: { distinct_blocks: 6 }, diversified: { n: 20, distinct_blocks: 10 } });
  assert.match(note, /at most 3 per 250 m block.*10 areas instead of 6.*1\.0 point/);
  assert.equal(shortlistNote({}), "");
});

const S = { k: 50, years: [0, 1, 2], start_pct: 3.8, ceiling_pct: 15.1, do_nothing_pct: 3.8,
  growth_scenarios_years_to_90pct: { fast: 10, default: 15, slow: 20 },
  trajectories: { fast: [3.8, 8, 12], default: [3.8, 6, 9], slow: [3.8, 5, 7] }, end_of_horizon: { default: 9 } };

test("scenarioSeries gives doing nothing plus three growth lines, axis up to the ceiling", () => {
  const s = scenarioSeries(S);
  assert.deepEqual(s.lines.map((l) => l.key), ["nothing", "slow", "default", "fast"]);
  assert.deepEqual(s.lines[0].values, [3.8, 3.8, 3.8]);
  assert.equal(s.vmax, 15.1);
  assert.match(s.lines[2].label, /Middle growth \(90% of the way in 15 years\)/);
  assert.equal(scenarioSeries(null), null);
  assert.equal(scenarioSeries({ years: [0], trajectories: { default: [1] } }), null);
});

test("scenarioHeadline compares the middle speed with doing nothing", () => {
  assert.equal(scenarioHeadline(S), "Planting the top 50 sites could take their tree cover from 3.8% to about 9.0% in 2 years, if trees grow at the middle speed. Doing nothing leaves it at 3.8%.");
  assert.equal(scenarioHeadline({}), "");
});
