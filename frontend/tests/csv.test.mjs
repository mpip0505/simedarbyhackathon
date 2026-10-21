import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, centroid, rankedRows, toCsv } from "../js/csv.js";

const square = { type: "Polygon", coordinates: [[[101.5, 3.2], [101.6, 3.2], [101.6, 3.3], [101.5, 3.3], [101.5, 3.2]]] };

test("centroid is the mean of the outer ring without the closing point", () => {
  assert.deepEqual(centroid(square), { lon: 101.55, lat: 3.25 });
  assert.equal(centroid(null), null);
  assert.equal(centroid({ type: "Point", coordinates: [1, 2] }), null);
});

test("rankedRows adds lon/lat and keeps the simulated and score-source labels", () => {
  const rows = rankedRows([{ geometry: square, properties: { site_id: "S1", source: "simulated", score_source: "placeholder" } }]);
  assert.equal(rows[0].lon, 101.55);
  assert.equal(rows[0].source, "simulated");
  assert.equal(rows[0].score_source, "placeholder");
});

test("toCsv writes a header, CRLF line endings and one line per row", () => {
  const csv = toCsv([{ rank: 1, site_id: "A", score_total: 80.5 }, { rank: 2, site_id: "B", score_total: null }]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], COLUMNS.map((c) => c.label).join(","));
  assert.ok(lines[1].startsWith("1,A,80.5,"));
  assert.ok(lines[2].startsWith("2,B,,")); // null becomes an empty cell
  assert.equal(lines.at(-1), "");
});

test("toCsv quotes commas, quotes and newlines", () => {
  const csv = toCsv([{ a: 'He said "hi", ok', b: "line1\nline2", c: "plain" }], [
    { key: "a", label: "a" }, { key: "b", label: "b" }, { key: "c", label: "c" }]);
  assert.equal(csv, 'a,b,c\r\n"He said ""hi"", ok","line1\nline2",plain\r\n');
});

test("the exported columns include the labels that keep the data honest", () => {
  const keys = COLUMNS.map((c) => c.key);
  assert.ok(keys.includes("source") && keys.includes("score_source"));
});
