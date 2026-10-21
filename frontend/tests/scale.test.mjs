import { test } from "node:test";
import assert from "node:assert/strict";
import { RAMP, classIndex, colorFor, legendBins, extent, percentBelow, fmt, fmtPct, fmtC, fmtMetres, DASH } from "../js/scale.js";

test("the ramp has 7 distinct colours, lightest first", () => {
  assert.equal(RAMP.length, 7);
  assert.equal(new Set(RAMP).size, 7);
  assert.ok(RAMP.every((c) => /^#[0-9a-f]{6}$/.test(c)));
});

test("classIndex covers the whole range and clamps outside values", () => {
  assert.equal(classIndex(0, 0, 100), 0);
  assert.equal(classIndex(100, 0, 100), 6);
  assert.equal(classIndex(50, 0, 100), 3);
  assert.equal(classIndex(-20, 0, 100), 0);
  assert.equal(classIndex(500, 0, 100), 6);
  assert.equal(classIndex(NaN, 0, 100), 0);
});

test("classIndex copes with a flat range", () => {
  assert.equal(classIndex(5, 5, 5), 3);
});

test("colorFor gives pale for low and deep for high scores", () => {
  assert.equal(colorFor(0, 0, 100), RAMP[0]);
  assert.equal(colorFor(100, 0, 100), RAMP[6]);
});

test("legendBins tile the range with one colour each", () => {
  const bins = legendBins(0, 70);
  assert.equal(bins.length, 7);
  assert.equal(bins[0].from, 0);
  assert.ok(Math.abs(bins[6].to - 70) < 1e-9);
  assert.deepEqual(bins.map((b) => b.color), RAMP);
});

test("extent ignores non-finite values and has a safe default", () => {
  assert.deepEqual(extent([3, NaN, 9, null, 1]), [1, 9]);
  assert.deepEqual(extent([]), [0, 1]);
});

test("percentBelow is the share of values strictly below", () => {
  assert.equal(percentBelow([1, 2, 3, 4], 3), 50);
  assert.equal(percentBelow([1, 2, 3, 4], 1), 0);
  assert.equal(percentBelow([], 3), null);
  assert.equal(percentBelow([1, 2], NaN), null);
});

test("formatters show an en dash for missing values, never NaN", () => {
  assert.equal(fmt(3.14159, 2), "3.14");
  assert.equal(fmt(null), DASH);
  assert.equal(fmtPct(9.65), "9.7%");
  assert.equal(fmtPct(undefined), DASH);
  assert.equal(fmtC(42.07), "42.1 °C");
  assert.equal(fmtMetres(35.4), "35 m");
  assert.equal(fmtMetres(NaN), DASH);
});
