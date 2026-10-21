import { test } from "node:test";
import assert from "node:assert/strict";
import { METHOD_ORDER, TRADEOFF_CAPTION, TRADEOFF_LEAD, tradeoffRows, tradeoffSteps } from "../js/tradeoff-logic.js";

const row = (path, homes, gap, areas, heat) => ({ n: 20, unshaded_path_m: path, unshaded_path_pct: path / 100, homes, homes_pct: homes / 10, gap_m: gap, gap_pct: gap / 20, areas, hotter_than_pct: heat });
const report = {
  ours: "ours",
  results: { "20": { heat_only: row(500, 80, 200, 9, 98), canopy_gap_only: row(600, 0, 90, 6, 61), heat_and_gap: row(540, 70, 0, 7, 96), ours: row(2800, 240, 480, 6, 68), spread_out: row(3600, 300, 660, 10, 66) } },
};

test("only steps the report has are offered", () => {
  assert.deepEqual(tradeoffSteps(report), [20]);
  assert.deepEqual(tradeoffSteps(null), []);
  assert.deepEqual(tradeoffRows(report, 50), []);
});

test("rows follow the fixed order and scale each bar to the largest value in its measure", () => {
  const rows = tradeoffRows(report, 20);
  assert.deepEqual(rows.map((r) => r.key), METHOD_ORDER);
  const path = (r) => r.measures[0];
  assert.equal(path(rows[4]).share, 1);
  assert.ok(path(rows[0]).share < 0.2);
  assert.equal(rows[3].name, "Our default weights");
  assert.equal(rows[0].measures[1].text, "80");
  assert.equal(rows[0].measures[0].text, "500 m");
  assert.equal(rows[0].heat, 98);
});

test("the wording is a trade-off and does not declare a winner", () => {
  assert.match(TRADEOFF_LEAD, /The planner chooses/);
  assert.match(TRADEOFF_CAPTION, /not proof that it is better/);
  assert.match(TRADEOFF_CAPTION, /simulated/);
  for (const banned of [/\bbest\b/i, /\bwinner\b/i, /outperform/i]) assert.doesNotMatch(TRADEOFF_LEAD + TRADEOFF_CAPTION, banned);
});
