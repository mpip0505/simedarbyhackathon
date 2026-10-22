// Guards the honesty of what is shown on screen. A redesign may change every word, but must keep these
// rules (docs/pitch-fact-check.md, docs/judge-qa.md): the data is simulated, scores may be placeholders,
// the sources are credited, and nothing overclaims.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const shipped = [["index.html", read("index.html")],
  ...readdirSync(new URL("js/", root)).filter((f) => f.endsWith(".js")).map((f) => [`js/${f}`, read(`js/${f}`)])];

// Phrases that overclaim, or repeat figures the project could not verify.
const BANNED = [/reportable/i, /defensible/i, /\baccurate\b/i, /10,266/, /5% planted/i, /canopy (increased|growth|gain)/i,
  /carbon sequestered/i, /heat islands? doubled/i, /our recommended sites/i, /\bvalidated\b/i];

test("no shipped file uses an overclaiming or unverified phrase", () => {
  for (const [name, text] of shipped) {
    for (const re of BANNED) assert.doesNotMatch(text, re, `${name} contains ${re}`);
  }
});

test("index.html carries the honesty content a redesign must keep", () => {
  const html = read("index.html");
  const marked = [...html.matchAll(/data-required="honesty"/g)].length;
  assert.ok(marked >= 6, `expected at least 6 elements marked data-required="honesty", found ${marked}`);
  for (const id of ["screening-note", "chip-simulated", "chip-scores", "honesty-text", "caveats", "attribution"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*data-required="honesty"|data-required="honesty"[^>]*id="${id}"`), `#${id} must be marked`);
  }
  assert.match(html, /simulated/i);
  assert.match(html, /scoring model is connected/);
  assert.match(html, /not a tree count/i);
});

test("the scripts keep the placeholder and simulated labels, and the temperature and canopy cautions", () => {
  const all = shipped.map(([, t]) => t).join("\n");
  assert.match(all, /scoring model not connected yet/);
  assert.match(all, /Preview score/);
  assert.match(all, /Example site|simulated/i);
  assert.match(all, /Indicative only/);
  assert.match(all, /No detectable change/);
  assert.match(all, /not a tree count/i);
  assert.match(all, /corridor is approximate|approximate corridor/);
});

test("the page loads Leaflet from its own folder, not a CDN, so it works offline", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/, "index.html loads something from the internet");
  assert.match(html, /vendor\/leaflet\/leaflet\.js/);
});

test("the only internet address in the scripts is the optional street-map tile server", () => {
  const urls = new Set();
  for (const [, text] of shipped) for (const m of text.matchAll(/https?:\/\/[^\s"'`)]+/g)) urls.add(m[0].replace(/[.,;]+$/, ""));
  const allowed = [...urls].filter((u) => !/tile\.openstreetmap\.org|127\.0\.0\.1|localhost|www\.w3\.org/.test(u));
  assert.deepEqual(allowed, []);
});

test("the pilot plan keeps its honesty wording: the planner's own entries, never an approval, unknown stays unknown", () => {
  const all = shipped.map(([, t]) => t).join("\n");
  assert.match(all, /Nothing is inspected, approved or planted by this tool/);
  assert.match(all, /All five checks OK \(not an approval\)/);
  assert.match(all, /Not checked/);
  assert.match(all, /No field data: no planted trees have been recorded/);
  assert.match(all, /is never counted as surviving|not counted as surviving/);
  assert.match(all, /one visit's comparison, not validation/);
  assert.match(all, /A 30 m site is not assumed to be one tree/);
  assert.match(all, /Nothing is assumed: with a field left empty, the answer says Not set/);
  assert.match(all, /Reach counts what lies near the sites[\s\S]*It is not a benefit/);
});

test("the siting screen is not called a conflict screen anywhere a person reads, and it says it is not about wildlife", () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  const openData = read("open-data.html");
  for (const [name, text] of [...shipped, ["open-data.html", openData], ["README.md", readme]]) {
    for (const old of [/mapped conflicts?\b/i, /conflicts? only/i, /conflict-aware/i, /conflict screen/i, /Download mapped conflicts/i]) {
      assert.doesNotMatch(text, old, `${name} still says ${old}`);
    }
  }
  const all = shipped.map(([, t]) => t).join("\n");
  assert.match(all, /does not assess wildlife/);
  assert.match(all, /no forest-edge layer is mapped/);
  assert.match(all, /Siting screen: field review needed/);
});
