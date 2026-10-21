import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGE_HEIGHT, badgeWidth, badgeSpacing, rankColumnWidth } from "../js/badge.js";

test("a one- or two-digit rank keeps the 26 px circle, three digits or more get a wider pill", () => {
  assert.equal(BADGE_HEIGHT, 26);
  for (const rank of [1, 9, 10, 99]) assert.equal(badgeWidth(rank), 26, `rank ${rank}`);
  assert.equal(badgeWidth(100), 34);
  assert.equal(badgeWidth(564), 34);
  assert.equal(badgeWidth(1000), 42);
});

test("odd input still gives a usable width", () => {
  assert.equal(badgeWidth("12"), 26);       // numbers that arrive as text
  assert.equal(badgeWidth(0), 26);
  assert.equal(badgeWidth(NaN), 26);
  assert.equal(badgeWidth(undefined), 26);
  assert.equal(badgeWidth(-5), 26);
});

test("two circles keep the 28 px spacing the badge layout always used, wider labels need more", () => {
  assert.equal(badgeSpacing(26, 26), 28);
  assert.equal(badgeSpacing(26, 34), 32);
  assert.equal(badgeSpacing(34, 34), 36);
});

test("the list's rank column fits the longest rank on show", () => {
  assert.equal(rankColumnWidth([1, 2, 5]), 28);
  assert.equal(rankColumnWidth([1, 99]), 32);
  assert.equal(rankColumnWidth([1, 100, 564]), 40);
  assert.equal(rankColumnWidth([]), 28);
  assert.equal(rankColumnWidth([12345678901]), 64);   // capped, so a bad value cannot blow the layout up
});
