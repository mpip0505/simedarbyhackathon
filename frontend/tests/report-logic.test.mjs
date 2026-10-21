import { test } from "node:test";
import assert from "node:assert/strict";
import { noiseRange, canopyVerdict, crosscheckRows, disagreementHeadline, reportHeadline, rangeSummary, METHOD_LABELS, METRIC_TITLES, WINDOW_LABELS, TEMPERATURE_NOTE } from "../js/report-logic.js";

const series = { points: [14.15, 9.09, 10.22, 7.98, 13.4].map((canopy_pct) => ({ canopy_pct })) };

test("noiseRange is the spread of the yearly canopy values", () => {
  assert.ok(Math.abs(noiseRange(series) - 6.17) < 1e-9);
  assert.equal(noiseRange({ points: [{ canopy_pct: 10 }] }), null);
  assert.equal(noiseRange(null), null);
  assert.equal(noiseRange({ points: [{ canopy_pct: 10 }, { canopy_pct: NaN }] }), null);
});

test("a change inside the year-to-year swing is reported as no detectable change", () => {
  const v = canopyVerdict(0.74, series);
  assert.equal(v.label, "No detectable change");
  assert.equal(v.withinNoise, true);
  assert.match(v.detail, /year-to-year swing of about 6 percentage points/);
  assert.equal(canopyVerdict(-0.74, series).withinNoise, true);   // direction does not matter
});

test("a change larger than the swing is not called noise, and is not called growth either", () => {
  const v = canopyVerdict(9, series);
  assert.equal(v.withinNoise, false);
  assert.doesNotMatch(v.label + v.detail, /grow|increase|gain/i);
});

test("without a yearly series the measured fallback of about 5 points is used", () => {
  assert.equal(canopyVerdict(4.9, null).withinNoise, true);
  assert.equal(canopyVerdict(5.1, null).withinNoise, false);
});

const summary = { baseline: { canopy_pct: 9.65 }, latest: { canopy_pct: 10.4 } };
const crosscheck = { rows: [
  { window: "baseline", reference: "esa_worldcover_2021", reference_tree_pct: 27.68 },
  { window: "latest", reference: "dynamic_world_same_window", reference_tree_pct: 4.43 },
] };

test("crosscheckRows lists the reference maps and our own proxy for both windows", () => {
  const rows = crosscheckRows(crosscheck, summary);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { method: METHOD_LABELS.esa_worldcover_2021, window: "baseline", pct: 27.68 });
  assert.deepEqual(rows.at(-1), { method: METHOD_LABELS.ours, window: "latest", pct: 10.4 });
  assert.equal(crosscheckRows(null, summary).length, 2);        // still shows our own numbers
  assert.deepEqual(crosscheckRows(null, null), []);
});

test("the headline says how far apart the estimates are", () => {
  const text = disagreementHeadline(crosscheckRows(crosscheck, summary));
  assert.match(text, /from 4\.4% to 27\.7%/);
  assert.match(text, /6 times apart/);
  assert.match(text, /uncertain/);
  assert.equal(disagreementHeadline([]), null);
  assert.equal(disagreementHeadline([{ pct: 5 }]), null);
});

test("the temperature note says indicative and ranking-only", () => {
  assert.match(TEMPERATURE_NOTE, /Indicative only/);
  assert.match(TEMPERATURE_NOTE, /ranking/);
});

test("the before/after headline is a plain question with an honest answer", () => {
  assert.equal(reportHeadline(0.74, series), "Has tree cover changed? Not detectably so far.");
  const big = reportHeadline(9, series);
  assert.match(big, /^Has tree cover changed\?/);
  assert.match(big, /check the other maps first/);
  assert.doesNotMatch(big, /grow|increase|gain/i);
});

test("rangeSummary gives the spread of estimates in whole numbers", () => {
  const r = rangeSummary(crosscheckRows(crosscheck, summary));
  assert.equal(r.text, "4% to 28%");
  assert.ok(r.min < r.max);
  assert.equal(rangeSummary([]), null);
  assert.equal(rangeSummary([{ pct: 5 }]), null);
});

test("metric, window and method names are plain words", () => {
  assert.deepEqual(METRIC_TITLES, { ndvi: "Greenness (satellite)", lst: "Ground heat (satellite)" });
  assert.deepEqual(WINDOW_LABELS, { baseline: "Earlier period", latest: "Recent period" });
  assert.doesNotMatch(Object.values(METHOD_LABELS).join(" "), /NDVI|proxy/);
});
