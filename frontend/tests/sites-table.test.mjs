import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, filterSites, sortSites, nextSort, mostlyEstimated } from "../js/sites-table.js";

const site = (rank, site_id, extra = {}) => ({ properties: { rank, site_id, origin: "open_land", score_total: 100 - rank, score_cooling: 50, score_connectivity: 40, score_shade: 30,
  lst_mean_250m: 40 + rank / 10, corridor_gap_dist_m: rank * 10, lst_valid_frac: 0.9, ...extra } });
const features = [site(1, "ELM-10"), site(2, "ELM-9", { origin: "corridor_edge" }), site(3, "ELM-100", { lst_mean_250m: null, lst_valid_frac: 0.2 }), site(4, "ELM-11")];
const ids = (list) => list.map((f) => f.properties.site_id);

test("filters by origin and by a search on the site id, keeping the ranking's order", () => {
  assert.deepEqual(ids(filterSites(features)), ["ELM-10", "ELM-9", "ELM-100", "ELM-11"]);
  assert.deepEqual(ids(filterSites(features, { origin: "corridor_edge" })), ["ELM-9"]);
  assert.deepEqual(ids(filterSites(features, { query: " elm-1 " })), ["ELM-10", "ELM-100", "ELM-11"]);
  assert.deepEqual(filterSites(features, { origin: "corridor_edge", query: "zzz" }), []);
});

test("sorts numbers both ways, with ties in ranking order", () => {
  assert.deepEqual(ids(sortSites(features, "rank", "desc")), ["ELM-11", "ELM-100", "ELM-9", "ELM-10"]);
  assert.deepEqual(ids(sortSites(features, "score", "desc")), ["ELM-10", "ELM-9", "ELM-100", "ELM-11"]);
  assert.deepEqual(ids(sortSites(features, "cooling", "asc")), ["ELM-10", "ELM-9", "ELM-100", "ELM-11"]);   // all equal: the ranking decides
  assert.equal(features[0].properties.site_id, "ELM-10", "the input is not changed");
});

test("sorts site ids naturally, so ELM-9 comes before ELM-10", () => {
  assert.deepEqual(ids(sortSites(features, "site", "asc")), ["ELM-9", "ELM-10", "ELM-11", "ELM-100"]);
});

test("a missing number goes last whichever way you sort", () => {
  assert.equal(ids(sortSites(features, "heat", "asc")).at(-1), "ELM-100");
  assert.equal(ids(sortSites(features, "heat", "desc")).at(-1), "ELM-100");
});

test("a column heading starts in its own direction, and a second click flips it", () => {
  assert.deepEqual(nextSort({ key: "rank", dir: "asc" }, "score"), { key: "score", dir: "desc" });
  assert.deepEqual(nextSort({ key: "score", dir: "desc" }, "score"), { key: "score", dir: "asc" });
  assert.deepEqual(nextSort({ key: "score", dir: "asc" }, "gap"), { key: "gap", dir: "asc" });
});

test("every column shows missing values as a dash, never NaN or null", () => {
  const empty = { properties: {} };
  for (const c of COLUMNS) {
    if (c.key === "origin" || c.key === "site" || c.key === "rank") continue;
    assert.equal(c.text(c.value(empty.properties)), "–", c.key);
  }
});

test("ground heat counts as estimated below half measured, as on the site card", () => {
  assert.equal(mostlyEstimated({ lst_valid_frac: 0.2 }), true);
  assert.equal(mostlyEstimated({ lst_valid_frac: 0.5 }), false);
  assert.equal(mostlyEstimated({ lst_valid_frac: null }), false);
});
