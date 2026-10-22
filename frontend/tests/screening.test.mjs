import { test } from "node:test";
import assert from "node:assert/strict";
import { conflictFor, conflictRows, openDataRows } from "../js/screening.js";
import { unionReach } from "../js/pilot.js";
import { toGeoJson } from "../js/export.js";
import { appPageUrl } from "../js/api.js";

const report = { stale: false, data_version: "v1", sites: { A: { state: "review", flags: [{ code: "road-edge", label: "Road", distance_m: 10 }], unknown_layers: [], distances_m: { road: 10 } } } };
test("missing, stale or uncheckable siting-screen data stays unknown", () => {
  assert.equal(conflictFor(report, "A").state, "review");
  for (const r of [null, { ...report, stale: true }, { ...report, stale: null }]) assert.equal(conflictFor(r, "A").state, "unknown");
  assert.equal(conflictFor(report, "missing").state, "unknown");
});
test("siting-screen exports include unknowns, caveats and version without altering scores", () => {
  const features = [{ type: "Feature", geometry: null, properties: { site_id: "A", score_total: 90, source: "simulated" } }];
  const row = conflictRows(features, report)[0];
  assert.equal(row.map_state, "review");
  assert.match(row.flags, /road-edge/);
  assert.match(row.caveat, /not an approval/);
  assert.equal(row.data_version, "v1");
  const geo = toGeoJson(features, { scoreSource: "ml", conflicts: report });
  assert.equal(geo.features[0].properties.siting_screen.state, "review");
  assert.equal(geo.features[0].properties.score_total, 90);
});
test("OSM-only exports retain provenance, status, methods and attribution", () => {
  const rows = openDataRows({ stale: false, source_mode: "osm-only", data_version: "x", method: { weights: { footpath_proximity: 0.6 } }, input_hashes: { "roads.geojson": "abc" },
    attribution: "OSM contributors, ODbL", note: "Simulated screening", features: [{ geometry: null, properties: { site_id: "=bad", rank: 1, screening_score: 80, conflicts: report.sites.A } }] });
  assert.equal(rows[0].site_id, "'=bad");
  assert.equal(rows[0].source_mode, "osm-only");
  assert.equal(rows[0].source_verification, "current");
  assert.match(rows[0].input_hashes, /abc/);
  assert.match(rows[0].method, /footpath_proximity/);
  assert.match(rows[0].attribution, /ODbL/);
});
test("a partially covered or stale reach report cannot produce an exposure headline", () => {
  const reach = { stale: false, sites: { A: [[], [0], []] }, totals: { footpath_samples: 0, homes: 1, gap_samples: 0 }, sample_step_m: { footpath: 10, gap: 10 } };
  assert.equal(unionReach(reach, ["A", "missing"]), null);
  assert.equal(unionReach({ ...reach, stale: true }, ["A"]), null);
  assert.equal(unionReach({ ...reach, stale: null }, ["A"]), null);
});
test("fallback navigation retains the resolved API origin for separately hosted frontends", () => {
  assert.equal(appPageUrl("open-data.html", "http://localhost:8765"), "open-data.html?api=http%3A%2F%2Flocalhost%3A8765");
  assert.equal(appPageUrl("./", ""), "./");
});
