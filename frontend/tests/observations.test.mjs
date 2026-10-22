import { test } from "node:test";
import assert from "node:assert/strict";
import { compareObservation, parseCsv, readFieldSheet, summariseImport } from "../js/observations.js";

const HEAD = "site_id,lat,lon,shade_on_path,canopy_class,path_in_use,photo_id,notes,observer,date";
const known = new Set(["ELM-1", "ELM-2", "ELM-3", "ELM-9"]);
const inPlan = new Set(["ELM-1", "ELM-2", "ELM-3"]);
const read = (body) => readFieldSheet(`${HEAD}\r\n${body}`, { knownIds: known, planIds: inPlan });

test("the CSV reader handles quotes, doubled quotes, commas and line breaks inside cells, and a byte-order mark", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"line\nbreak",z'), [["a", "b"], ["x, y", 'say "hi"'], ["line\nbreak", "z"]]);
  assert.deepEqual(parseCsv(""), []);
});

test("a good sheet gives one entry per site with trimmed, lower-cased answers", () => {
  const r = read("ELM-1,3.1,101.5, None ,SPARSE,Yes,P1,\"near, the gate\",Aisha,2026-10-24\r\nELM-2,3.1,101.5,full,dense,no,,,,");
  assert.equal(r.ok, true);
  assert.equal(r.entries.length, 2);
  assert.deepEqual([r.entries[0].shade_on_path, r.entries[0].canopy_class, r.entries[0].path_in_use], ["none", "sparse", "yes"]);
  assert.equal(r.entries[0].notes, "near, the gate");
  assert.equal(r.entries[1].date, "");
});

test("missing columns, wrong words, bad dates, repeats, unknown sites and sites outside the plan each give a clear message", () => {
  assert.match(readFieldSheet("site_id,lat\nELM-1,3", { knownIds: known, planIds: inPlan }).problems[0], /Missing column\(s\): lon, shade_on_path/);
  const r = read([
    "ELM-1,3,101,maybe,sparse,yes,,,,", "ELM-1,3,101,none,sparse,yes,,,,", "ELM-404,3,101,none,sparse,yes,,,,", "ELM-9,3,101,none,sparse,yes,,,,",
    "ELM-2,3,101,none,sparse,yes,,,,2026-02-31",
  ].join("\r\n"));
  assert.equal(r.ok, false);
  const msg = r.problems.join(" | ");
  assert.match(msg, /row 2: shade_on_path 'maybe' must be one of none, partial, full/);
  assert.match(msg, /row 3: ELM-1 appears more than once|row 3: ELM-1/);
  assert.match(msg, /row 4: unknown site ELM-404/);
  assert.match(msg, /row 5: ELM-9 is not in your planting plan/);
  assert.match(msg, /row 6: date '2026-02-31' must look like 2026-10-24/);
});

test("a blank answer is insufficient, never guessed, and does not make the file unusable", () => {
  const r = read("ELM-1,3,101,none,sparse,yes,,,,\r\nELM-2,3,101,,sparse,yes,,,,\r\nELM-3,3,101,,,,,,,");
  assert.equal(r.ok, true);
  assert.deepEqual(r.insufficient.map((x) => [x.site_id, x.missing.length]), [["ELM-2", 1], ["ELM-3", 3]]);
  assert.equal(r.entries.length, 1);
});

test("a file with no usable row is not ok, and oversize files are refused", () => {
  assert.equal(read("ELM-1,3,101,,,,,,,").ok, false);
  assert.match(readFieldSheet("x".repeat(1_000_001), { knownIds: known, planIds: inPlan }).problems[0], /too large/);
  assert.match(readFieldSheet("", { knownIds: known, planIds: inPlan }).problems[0], /empty|no rows/);
});

test("many problems are summarised, not dumped", () => {
  const body = Array.from({ length: 20 }, (_, i) => `ELM-X${i},3,101,none,sparse,yes,,,,`).join("\r\n");
  const r = read(body);
  assert.equal(r.problems.length, 13);
  assert.match(r.problems[12], /and 8 more/);
});

test("the comparison names what differs and never calls agreement a validation", () => {
  const props = { path_length_within_50m: 120, path_canopy_frac_50m: 0.05, canopy_pct_baseline: 6 };
  assert.deepEqual(compareObservation({ shade_on_path: "none", canopy_class: "sparse" }, props), { outcome: "agree", differences: [] });
  const shaded = compareObservation({ shade_on_path: "full", canopy_class: "sparse" }, props);
  assert.equal(shaded.outcome, "disagree");
  assert.match(shaded.differences[0], /little tree cover on the nearby footpath/);
  const dense = compareObservation({ shade_on_path: "partial", canopy_class: "dense" }, props);
  assert.match(dense.differences[0], /Seen: dense tree cover/);
  assert.equal(compareObservation({ shade_on_path: "full", canopy_class: "dense" }, props).differences.length, 2);
});

test("without a comparable footpath, agreement is insufficient but canopy contradictions remain visible", () => {
  const props = { path_length_within_50m: 0, path_canopy_frac_50m: null, canopy_pct_baseline: 5 };
  assert.equal(compareObservation({ shade_on_path: "full", canopy_class: "none" }, props).outcome, "insufficient");
  assert.equal(compareObservation({ shade_on_path: "full", canopy_class: "moderate" }, props).outcome, "disagree");
});

test("import counts", () => {
  assert.deepEqual(summariseImport([{ outcome: "agree" }, { outcome: "disagree" }, { outcome: "agree" }]), { total: 3, agree: 2, disagree: 1, insufficient: 0 });
});
