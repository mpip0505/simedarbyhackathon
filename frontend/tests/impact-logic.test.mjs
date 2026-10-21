import { test } from "node:test";
import assert from "node:assert/strict";
import { IMPACT_CAPTION, availableSteps, impactHeadline, impactRow, impactTiles } from "../js/impact-logic.js";

const report = {
  totals: { unshaded_path_m: 65860, homes: 968, gap_m: 1650 },
  ceiling: { unshaded_path_m: 9330, homes: 443, gap_m: 1510 },
  rows: [
    { n: 10, unshaded_path_m: 2120, unshaded_path_pct_of_township: 3.2, unshaded_path_pct_of_reachable: 22.7, homes: 242, homes_pct_of_township: 25, homes_pct_of_reachable: 54.6, gap_m: 350, gap_pct_of_corridor_gaps: 21.2, gap_pct_of_reachable: 23.2 },
    { n: 50, unshaded_path_m: 5400, unshaded_path_pct_of_township: 8.2, unshaded_path_pct_of_reachable: 57.9, homes: 349, homes_pct_of_township: 36.1, homes_pct_of_reachable: 78.8, gap_m: 1150, gap_pct_of_corridor_gaps: 69.7, gap_pct_of_reachable: 76.2 },
  ],
};

test("only the steps the report has are offered, in order", () => {
  assert.deepEqual(availableSteps(report), [10, 50]);
  assert.deepEqual(availableSteps(null), []);
  assert.equal(impactRow(report, 20), null);
});

test("the headline leads with the township share and says mapped homes", () => {
  const h = impactHeadline(report, 50);
  assert.match(h, /first 50 sites/);
  assert.match(h, /5,400 m of footpath with no tree cover \(8% of the township's\)/);
  assert.match(h, /349 mapped homes \(36%\)/);
  assert.equal(impactHeadline(report, 20), null);
});

test("three tiles give the township share and the share of what any site can reach", () => {
  const tiles = impactTiles(report, 50);
  assert.equal(tiles.length, 3);
  assert.equal(tiles[0].value, "5,400");
  assert.match(tiles[0].note, /8% of the township's 65,860 m; 58% of the 9,330 m any site can reach/);
  assert.match(tiles[2].label, /approximate/);
  assert.deepEqual(impactTiles(report, 20), []);
});

test("the caption says reach is not a benefit and that the sites are simulated", () => {
  assert.match(IMPACT_CAPTION, /does not show that planting there would cool/);
  assert.match(IMPACT_CAPTION, /simulated/);
});
