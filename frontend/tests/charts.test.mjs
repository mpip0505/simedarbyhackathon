// The yearly bar charts: axis, geometry and the words on hover. Pure functions, no browser needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { niceScale, mean, chartGeometry } from "../js/charts.js";
import { shortYear, yearTips } from "../js/report-logic.js";

test("niceScale gives a tidy axis with at most six ticks", () => {
  assert.deepEqual(niceScale(21.93), { vmax: 25, step: 5, ticks: [0, 5, 10, 15, 20, 25] });
  assert.deepEqual(niceScale(44.86).ticks, [0, 10, 20, 30, 40, 50]);
  assert.equal(niceScale(7).vmax, 8);                      // step 2 (rough step is 1.4)
  assert.ok(niceScale(0.87).ticks.length <= 6);
  assert.deepEqual(niceScale(0), { vmax: 1, step: 1, ticks: [0, 1] });
  assert.deepEqual(niceScale(-3), { vmax: 1, step: 1, ticks: [0, 1] });
});

test("mean is the plain average", () => {
  assert.equal(mean([2, 4, 9]), 5);
});

test("chartGeometry places bars, whiskers, ticks and the average as percentages of the plot", () => {
  const g = chartGeometry({ values: [10, 20], ranges: [[5, 30], [15, 25]], vmax: 40, ticks: [0, 20, 40], average: 15 });
  assert.deepEqual(g.ticks.map((t) => t.bottom), [0, 50, 100]);
  assert.equal(g.average, 37.5);
  assert.deepEqual(g.columns.map((c) => [c.left, c.width, c.center]), [[0, 50, 25], [50, 50, 75]]);
  assert.deepEqual(g.columns.map((c) => c.bar), [25, 50]);
  assert.deepEqual(g.columns[0].range, { low: 12.5, high: 75 });
  assert.equal(g.columns[0].top, 75);                      // the tooltip clears the whisker, not just the bar
  assert.equal(g.columns[1].top, 62.5);
});

test("chartGeometry clamps values outside the axis and works without ranges or an average", () => {
  const g = chartGeometry({ values: [-5, 80], vmax: 40, ticks: [0, 40] });
  assert.deepEqual(g.columns.map((c) => c.bar), [0, 100]);
  assert.equal(g.average, null);
  assert.equal(g.columns[0].range, null);
});

test("shortYear shortens a window label and leaves anything else alone", () => {
  assert.equal(shortYear("2021-10 to 2022-09"), "2021–22");
  assert.equal(shortYear("whole period"), "whole period");
  assert.equal(shortYear(undefined), "");
});

test("yearTips words each column and flags the warmest year", () => {
  const points = [
    { label: "2021-10 to 2022-09", canopy_pct: 14.15, canopy_pct_low: 6.57, canopy_pct_high: 21.93, mean_lst_c: 37.0, lst_clear_obs_per_pixel: 1.6 },
    { label: "2024-10 to 2025-09", canopy_pct: 7.98, canopy_pct_low: 0.98, canopy_pct_high: 16.36, mean_lst_c: 44.86, lst_clear_obs_per_pixel: 1.8 },
  ];
  const t = yearTips(points);
  assert.equal(t.warmest, 1);
  assert.deepEqual(t.canopy[1], { title: "2024–25", lines: ["Tree-cover estimate 8.0%", "Range 1.0% to 16.4%"] });
  assert.deepEqual(t.heat[1].lines, ["Mean ground heat 44.9 °C", "1.8 clear looks per pixel", "Warmest year"]);
  assert.deepEqual(t.heat[0].lines, ["Mean ground heat 37.0 °C", "1.6 clear looks per pixel"]);
});

test("yearTips leaves the range line out when the data set has none", () => {
  const t = yearTips([{ label: "2021-10 to 2022-09", canopy_pct: 10, mean_lst_c: 38, lst_clear_obs_per_pixel: 2 }]);
  assert.deepEqual(t.canopy[0].lines, ["Tree-cover estimate 10.0%"]);
});
