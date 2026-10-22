import { test } from "node:test";
import assert from "node:assert/strict";
import { plantStats } from "../js/stats.js";

const site = (score_total, extra = {}) => ({ properties: { score_total, corridor_gap_flag: false, lst_valid_frac: 0.9, ...extra } });
const ranked = [site(81.24, { corridor_gap_flag: true }), site(70, { lst_valid_frac: 0.3 }), site(55, { corridor_gap_flag: true, lst_valid_frac: 0.5 }), site(40, { lst_valid_frac: null })];

test("the strip counts sites, the top score, corridor-gap sites and sites with measured ground heat", () => {
  const [sites, top, gap, heat] = plantStats(ranked, { placeholder: true, usingServer: true });
  assert.deepEqual(sites, { label: "Candidate sites", value: "4", unit: "", note: "simulated" });
  assert.deepEqual(top, { label: "Top preview score", value: "81.2", unit: "", note: "placeholder weights" });
  assert.deepEqual(gap, { label: "Near a corridor gap", value: "2", unit: "sites", note: "within 50 m of the approximate corridor" });
  // 0.9 and 0.5 count as measured; 0.3 and a missing value count as estimated
  assert.deepEqual(heat, { label: "Reliable ground heat", value: "2", unit: "of 4", note: "2 are estimated" });
});

test("the labels say where the top score comes from", () => {
  assert.equal(plantStats(ranked, { placeholder: false, usingServer: true })[1].label, "Top score");
  assert.equal(plantStats(ranked, { placeholder: false, usingServer: true })[1].note, "scoring model");
  assert.equal(plantStats(ranked, { placeholder: true, usingServer: false })[1].note, "your weights");
});

test("an empty list gives dashes and zeros instead of NaN or -Infinity", () => {
  const tiles = plantStats([], { placeholder: true, usingServer: true });
  assert.equal(tiles[0].value, "0");
  assert.equal(tiles[1].value, "–");
  assert.equal(tiles[3].note, "0 are estimated");
  assert.doesNotMatch(JSON.stringify(tiles), /NaN|Infinity|null|undefined/);
});
