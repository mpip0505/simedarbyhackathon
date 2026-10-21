import { test } from "node:test";
import assert from "node:assert/strict";
import { SCORE_LABELS, SCORE_HINTS, contributions, buildContext, driverNotes, mainReason, siteHeadline } from "../js/drivers.js";

test("contributions: weighted points, largest first, points add up to the total", () => {
  const p = { score_cooling: 90, score_connectivity: 30, score_shade: 60 };
  const c = contributions(p, { cooling: 2, connectivity: 1, shade: 1 });
  assert.deepEqual(c.map((x) => x.key), ["cooling", "shade", "connectivity"]);
  assert.equal(c[0].points, 45);
  assert.ok(Math.abs(c.reduce((a, x) => a + x.points, 0) - 67.5) < 1e-9);
  assert.equal(c[0].label, SCORE_LABELS.cooling);
  assert.ok(Math.abs(c.reduce((a, x) => a + x.share, 0) - 1) < 1e-12);
});

test("contributions follow the weights", () => {
  const p = { score_cooling: 90, score_connectivity: 30, score_shade: 60 };
  assert.equal(contributions(p, { cooling: 0, connectivity: 1, shade: 0 })[0].key, "connectivity");
});

const sites = [0, 1, 2, 3, 4].map((i) => ({
  properties: { site_id: `S${i}`, lst_mean_250m: 36 + i * 2, ndvi_mean_250m: 0.5 - i * 0.05 },
}));
const ctx = buildContext(sites);

test("buildContext collects the reference values", () => {
  assert.deepEqual(ctx.lst250, [36, 38, 40, 42, 44]);
  assert.equal(ctx.ndvi250.length, 5);
});

const base = {
  lst_mean_250m: 44, ndvi_mean_250m: 0.3, path_length_within_50m: 120, uncovered_path_length_50m: 90,
  dist_to_path_m: 10, corridor_gap_flag: true, corridor_gap_dist_m: 35, residential_buildings_within_250m: 28,
  buildings_within_250m: 30, lst_valid_frac: 1,
};

test("heat and greenness notes are relative to the other sites", () => {
  const { notes } = driverNotes(base, ctx);
  assert.match(notes[0], /hotter than 80% of sites \(250 m average 44\.0 °C\)/);
  assert.match(notes[1], /less green than 80% of sites \(greenness 0\.30\)/);
});

test("shade note: uncovered path, covered path, and no path", () => {
  assert.match(driverNotes(base, ctx).notes[2], /90 m of the 120 m of nearby path has no shade/);
  assert.match(driverNotes({ ...base, uncovered_path_length_50m: 0 }, ctx).notes[2], /already has shade/);
  const none = driverNotes({ ...base, path_length_within_50m: 0, dist_to_path_m: 180 }, ctx).notes[2];
  assert.match(none, /No mapped walking path within 50 m \(nearest 180 m\)/);
});

test("corridor note says the corridor is approximate when the site is not next to a gap", () => {
  assert.match(driverNotes(base, ctx).notes[3], /Next to a gap in the approximate corridor \(35 m away\)/);
  const far = driverNotes({ ...base, corridor_gap_flag: false, corridor_gap_dist_m: 700 }, ctx).notes[3];
  assert.match(far, /Nearest corridor gap is 700 m away \(the corridor is approximate\)/);
});

test("buildings note: residential, other buildings, none mapped", () => {
  assert.match(driverNotes(base, ctx).notes[4], /28 homes within 250 m/);
  assert.match(driverNotes({ ...base, residential_buildings_within_250m: 0 }, ctx).notes[4], /30 buildings within 250 m/);
  const none = driverNotes({ ...base, residential_buildings_within_250m: 0, buildings_within_250m: 0 }, ctx).notes[4];
  assert.match(none, /may under-map/);
});

test("a mostly gap-filled temperature produces a warning, a real one does not", () => {
  assert.equal(driverNotes(base, ctx).warnings.length, 0);
  const w = driverNotes({ ...base, lst_valid_frac: 0.2 }, ctx).warnings;
  assert.equal(w.length, 1);
  assert.match(w[0], /mostly estimated from nearby pixels \(20% measured\)/);
});

test("missing measurements are skipped instead of printing NaN or undefined", () => {
  const { notes } = driverNotes({ ...base, lst_mean_250m: null, ndvi_mean_250m: undefined }, ctx);
  assert.ok(notes.every((n) => !/NaN|undefined|null/.test(n)));
  assert.equal(notes.length, 3);
});

test("scores use plain words, each with a one-line hint", () => {
  assert.deepEqual(SCORE_LABELS, { cooling: "Heat relief", connectivity: "Links green areas", shade: "Shade for walkers" });
  assert.deepEqual(Object.keys(SCORE_HINTS), ["cooling", "connectivity", "shade"]);
  assert.ok(Object.values(SCORE_HINTS).every((h) => h.length > 10 && h.length < 50));
});

// sites 0..4 have 250 m heat 36,38,40,42,44 and greenness 0.50,0.45,0.40,0.35,0.30
const heatOnly = { cooling: 1, connectivity: 0, shade: 0 };
const linkOnly = { cooling: 0, connectivity: 1, shade: 0 };
const shadeOnly = { cooling: 0, connectivity: 0, shade: 1 };
const scored = { score_cooling: 90, score_connectivity: 80, score_shade: 70 };

test("mainReason names the strongest score's cause in a few words", () => {
  const hotBare = { ...base, ...scored, lst_mean_250m: 44, ndvi_mean_250m: 0.3 };
  assert.equal(mainReason(hotBare, heatOnly, ctx), "hot and bare around it");
  assert.equal(mainReason({ ...hotBare, ndvi_mean_250m: 0.5 }, heatOnly, ctx), "hot surroundings");
  assert.equal(mainReason({ ...hotBare, lst_mean_250m: 36, ndvi_mean_250m: 0.3 }, heatOnly, ctx), "bare surroundings");
  assert.equal(mainReason(hotBare, linkOnly, ctx), "next to a corridor gap");
  assert.equal(mainReason({ ...hotBare, corridor_gap_flag: false }, linkOnly, ctx), "close to the corridor");
  assert.equal(mainReason(hotBare, shadeOnly, ctx), "unshaded footpath nearby");
  assert.equal(mainReason({ ...hotBare, uncovered_path_length_50m: 0 }, shadeOnly, ctx), "walkers nearby");
});

test("mainReason follows the weights and copes with missing measurements", () => {
  const p = { ...base, ...scored };
  assert.notEqual(mainReason(p, heatOnly, ctx), mainReason(p, linkOnly, ctx));
  const missing = { ...p, lst_mean_250m: null, ndvi_mean_250m: undefined };
  assert.equal(mainReason(missing, heatOnly, ctx), "bare surroundings");
  assert.doesNotMatch(mainReason(missing, heatOnly, ctx), /NaN|undefined|null/);
});

test("siteHeadline is one readable sentence built from what is notable", () => {
  const s = siteHeadline(base, ctx);
  assert.equal(s, "Hot, bare surroundings, a footpath with no shade and right next to a gap in the corridor.");
  assert.ok(s.endsWith(".") && s[0] === s[0].toUpperCase());
});

test("siteHeadline with one or two facts, and with nothing notable", () => {
  const calm = { ...base, lst_mean_250m: 38, ndvi_mean_250m: 0.45, uncovered_path_length_50m: 0, corridor_gap_flag: false, corridor_gap_dist_m: 700 };
  assert.equal(siteHeadline(calm, ctx), "A moderate fit: nothing stands out on heat, shade or the corridor.");
  assert.equal(siteHeadline({ ...calm, uncovered_path_length_50m: 60 }, ctx), "A footpath with no shade.");
  assert.equal(siteHeadline({ ...calm, corridor_gap_dist_m: 90 }, ctx), "Close to a gap in the corridor.");
  assert.equal(siteHeadline({ ...calm, lst_mean_250m: 44, uncovered_path_length_50m: 60 }, ctx), "Hot surroundings and a footpath with no shade.");
});

test("siteHeadline never prints NaN, undefined or null", () => {
  const sparse = { site_id: "x", corridor_gap_flag: false };
  assert.doesNotMatch(siteHeadline(sparse, ctx), /NaN|undefined|null/);
});
