import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEYS, normaliseWeights, round1, totalScore, assignRanks, retotal, sharePercent, topChange } from "../js/weights.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/retotal_cases.json", import.meta.url), "utf8"));
const feature = (s) => ({ type: "Feature", geometry: null, properties: { ...s } });

test("re-ranking in the browser matches what the Python backend returns, for every fixture case", () => {
  assert.ok(fixture.cases.length >= 20);
  for (const c of fixture.cases) {
    const out = retotal(c.sites.map(feature), c.weights);
    const got = out.map((f) => [f.properties.site_id, f.properties.score_total, f.properties.rank]);
    assert.deepEqual(got, c.expected, `case "${c.name}" with weights ${JSON.stringify(c.weights)}`);
  }
});

test("round1 equals Python round(x, 1) for ties, near-ties and random values", () => {
  assert.ok(fixture.round_cases.length > 2500);
  const bad = fixture.round_cases.filter(([x, expected]) => !Object.is(round1(x), expected) && round1(x) !== expected);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} mismatches`);
});

test("round1 rounds exact ties to the even digit and is not fooled by values stored just below a tie", () => {
  assert.equal(round1(72.25), 72.2);   // exact tie: half to even (toFixed / Math.round would give 72.3)
  assert.equal(round1(0.25), 0.2);
  assert.equal(round1(0.75), 0.8);
  assert.equal(round1(0.15), 0.1);     // 0.15 is stored as 0.1499999...
  assert.equal(round1(0.45), 0.5);     // 0.45 is stored as 0.4500000000000000111...
  assert.equal(round1(72.375), 72.4);
  assert.equal(round1(-0.25), -0.2);
  assert.ok(Number.isNaN(round1(NaN)));
});

test("normaliseWeights scales to 1 and rejects an all-zero set", () => {
  const w = normaliseWeights({ cooling: 2, connectivity: 1, shade: 1 });
  assert.deepEqual(w, { cooling: 0.5, connectivity: 0.25, shade: 0.25 });
  assert.throws(() => normaliseWeights({ cooling: 0, connectivity: 0, shade: 0 }), /more than 0/);
  assert.equal(KEYS.length, 3);
});

test("totalScore is the weighted average of the three scores, 1 decimal", () => {
  assert.equal(totalScore(100, 0, 0, { cooling: 1, connectivity: 1, shade: 1 }), 33.3);
  assert.equal(totalScore(80, 60, 40, { cooling: 1, connectivity: 0, shade: 0 }), 80);
  assert.equal(totalScore(80, 60, 40, { cooling: 70, connectivity: 20, shade: 10 }), 72);
});

const sites = [
  { site_id: "B", score_cooling: 50, score_connectivity: 50, score_shade: 50 },
  { site_id: "A", score_cooling: 50, score_connectivity: 50, score_shade: 50 },
  { site_id: "C", score_cooling: 90, score_connectivity: 10, score_shade: 10 },
];

test("equal totals are ordered by site_id so ranks are stable", () => {
  // input order is B, A, C; A and B tie on 50, C is lower, so the result must be A, B, C
  const out = retotal(sites.map(feature), { cooling: 1, connectivity: 1, shade: 1 });
  assert.deepEqual(out.map((f) => f.properties.site_id), ["A", "B", "C"]);
});

test("weights decide the order, and ranks are 1..n with no repeats", () => {
  const coolingFirst = retotal(sites.map(feature), { cooling: 1, connectivity: 0, shade: 0 });
  assert.equal(coolingFirst[0].properties.site_id, "C");
  const equal = retotal(sites.map(feature), { cooling: 1, connectivity: 1, shade: 1 });
  assert.deepEqual(equal.map((f) => f.properties.rank), [1, 2, 3]);
  assert.equal(equal[2].properties.site_id, "C");
});

test("retotal does not modify its input and returns features sorted by rank", () => {
  const input = sites.map(feature);
  const before = JSON.stringify(input);
  const out = retotal(input, { cooling: 1, connectivity: 1, shade: 1 });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(out.map((f) => f.properties.rank), [1, 2, 3]);
});

test("retotal fails clearly when a component score is missing", () => {
  const broken = [feature({ site_id: "X", score_cooling: 1, score_connectivity: null, score_shade: 1 })];
  assert.throws(() => retotal(broken, { cooling: 1, connectivity: 1, shade: 1 }), /site X has no score_connectivity/);
});

test("assignRanks ranks by score_total descending", () => {
  const out = assignRanks([feature({ site_id: "L", score_total: 10 }), feature({ site_id: "H", score_total: 90 })]);
  assert.deepEqual(out.map((f) => [f.properties.site_id, f.properties.rank]), [["H", 1], ["L", 2]]);
});

test("sharePercent gives whole-number shares", () => {
  assert.deepEqual(sharePercent({ cooling: 2, connectivity: 1, shade: 1 }), { cooling: 50, connectivity: 25, shade: 25 });
});

const ranked = (ids) => ids.map((id, i) => ({ properties: { site_id: id, rank: i + 1 } }));

test("topChange counts how many of the top n are new", () => {
  const before = ranked(["a", "b", "c", "d", "e"]);
  assert.deepEqual(topChange(before, ranked(["a", "b", "c", "d", "e"]), 3), { changed: 0, n: 3 });
  assert.deepEqual(topChange(before, ranked(["a", "b", "x", "c", "d"]), 3), { changed: 1, n: 3 });
  assert.deepEqual(topChange(before, ranked(["x", "y", "z", "a", "b"]), 3), { changed: 3, n: 3 });
});

test("topChange ignores reordering inside the top n and handles short lists", () => {
  assert.deepEqual(topChange(ranked(["a", "b", "c"]), ranked(["c", "b", "a"]), 3), { changed: 0, n: 3 });
  assert.deepEqual(topChange(ranked(["a", "b"]), ranked(["a", "z"]), 10), { changed: 1, n: 2 });
  assert.deepEqual(topChange([], [], 10), { changed: 0, n: 0 });
});

test("topChange reads rank, not array order", () => {
  const abc = ranked(["a", "b", "c"]);
  const shuffled = [abc[2], abc[0], abc[1]];
  assert.deepEqual(topChange(shuffled, ranked(["a", "b", "c"]), 2), { changed: 0, n: 2 });
});
