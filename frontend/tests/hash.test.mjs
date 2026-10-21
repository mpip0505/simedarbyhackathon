import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHash, parseHash } from "../js/hash.js";
import { siteSpeech } from "../js/speech.js";
import { TOUR_STEPS } from "../js/tour.js";

const defaults = { cooling: 45, connectivity: 30, shade: 25 };

test("a valid hash gives weights and a site", () => {
  assert.deepEqual(parseHash("#w=100,0,20&site=ELM-3734-11725"), { weights: { cooling: 100, connectivity: 0, shade: 20 }, site: "ELM-3734-11725" });
  assert.deepEqual(parseHash("site=ELM-1"), { weights: null, site: "ELM-1" });
});

test("anything invalid is ignored, never trusted", () => {
  for (const bad of ["#w=0,0,0", "#w=1,2", "#w=1,2,3,4", "#w=a,b,c", "#w=101,0,0", "#w=-1,5,5", "#w=1e2,0,0"]) assert.equal(parseHash(bad).weights, null, bad);
  for (const bad of ["#site=<img src=x>", "#site=a b", "#site=../etc", "#site=" + "x".repeat(41), "#site="]) assert.equal(parseHash(bad).site, null, bad);
  assert.deepEqual(parseHash(undefined), { weights: null, site: null });
});

test("building a hash keeps weights only when they differ from the defaults", () => {
  assert.equal(buildHash({ weights: defaults, defaults, site: null }), "");
  assert.equal(buildHash({ weights: defaults, defaults, site: "ELM-9" }), "#site=ELM-9");
  assert.equal(buildHash({ weights: { cooling: 100, connectivity: 0, shade: 0 }, defaults, site: "ELM-9" }), "#w=100,0,0&site=ELM-9");
  assert.equal(buildHash({ weights: defaults, defaults, site: "bad site" }), "");
});

test("a built hash parses back to the same state", () => {
  const w = { cooling: 10, connectivity: 80, shade: 10 };
  assert.deepEqual(parseHash(buildHash({ weights: w, defaults, site: "ELM-5" })), { weights: w, site: "ELM-5" });
});

test("the spoken text says example, simulated, the rank and the scores", () => {
  const t = siteSpeech({ site_id: "ELM-1", rank: 1, score_total: 92.5, score_cooling: 87.3, score_connectivity: 94.8, score_shade: 99.1 }, "Hot and bare.", 564);
  assert.match(t, /Site ELM-1, an example site, simulated\. Ranked 1 of 564\./);
  assert.match(t, /Score 93 out of 100: heat relief 87, links green areas 95, shade for walkers 99\./);
  assert.match(siteSpeech({ site_id: "x", rank: 2 }, "h", 3), /not available/);
});

test("every tour step has a selector, a title and plain text without markup", () => {
  assert.ok(TOUR_STEPS.length >= 5);
  for (const s of TOUR_STEPS) {
    assert.match(s.target, /^[#.][\w-]+$/);
    assert.ok(s.title.length > 2 && s.text.length > 20);
    assert.doesNotMatch(s.title + s.text, /[<>]/);
  }
});
