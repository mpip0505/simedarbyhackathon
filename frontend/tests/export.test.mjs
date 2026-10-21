import { test } from "node:test";
import assert from "node:assert/strict";
import { toGeoJson, briefRows } from "../js/export.js";
import { buildContext } from "../js/drivers.js";

const square = (x) => ({ type: "Polygon", coordinates: [[[x, 3], [x + 0.0003, 3], [x + 0.0003, 3.0003], [x, 3.0003], [x, 3]]] });
const site = (n, extra = {}) => ({
  type: "Feature", geometry: square(101.5 + n / 1000),
  properties: { rank: n, site_id: `ELM-${n}`, score_total: 90 - n, score_cooling: 80, score_connectivity: 70, score_shade: 60, origin: "open_land",
    area_m2: 900, source: "simulated", score_source: "ml", lst_mean_250m: 42, ndvi_mean_250m: 0.3, secret_internal: "x", ...extra },
});
const features = [site(1), site(2, { origin: "corridor_edge" }), site(3)];

test("the GeoJSON keeps geometry, the simulated label and the score source, and drops other fields", () => {
  const g = toGeoJson(features, { scoreSource: "ml", dataVersion: "abc" });
  assert.equal(g.type, "FeatureCollection");
  assert.equal(g.features.length, 3);
  assert.match(g.note, /simulated/);
  assert.doesNotMatch(g.note, /previews/);
  assert.equal(g.data_version, "abc");
  assert.equal(g.features[0].properties.source, "simulated");
  assert.equal(g.features[0].properties.secret_internal, undefined);
  assert.deepEqual(g.features[1].geometry, features[1].geometry);
});

test("preview scores are said to be previews in the file itself", () => {
  assert.match(toGeoJson(features, { scoreSource: "placeholder" }).note, /previews/);
});

test("brief rows follow the given order, cap at n, and carry a place and a reason", () => {
  const ctx = buildContext(features);
  const rows = briefRows(features, { n: 2, ctx, steadyOf: (id) => (id === "ELM-1" ? { label: "Steady top-20 pick" } : null) });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.siteId), ["ELM-1", "ELM-2"]);
  assert.match(rows[0].place, /^3\.\d{5}, 101\.\d{5}$/);
  assert.ok(rows[0].reason.length > 10);
  assert.equal(rows[0].steady, "Steady top-20 pick");
  assert.equal(rows[1].steady, "");
  assert.equal(rows[1].origin, "Corridor edge");
});
