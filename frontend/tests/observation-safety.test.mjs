import { test } from "node:test";
import assert from "node:assert/strict";
import { compareObservation, readFieldSheet, parseCsv } from "../js/observations.js";

const obs = { shade_on_path: "none", canopy_class: "sparse", path_in_use: "yes" };
const props = { path_length_within_50m: 100, path_canopy_frac_50m: 0.1, canopy_pct_baseline: 5 };
const header = "site_id,lat,lon,shade_on_path,canopy_class,path_in_use,photo_id,notes,observer,date";
const options = { knownIds: new Set(["A"]), planIds: new Set(["A"]) };

test("missing and ambiguous proxies never count as agreement", () => {
  for (const p of [null, {}, { ...props, path_canopy_frac_50m: null }, { ...props, canopy_pct_baseline: null }, { ...props, path_length_within_50m: 0 }]) {
    assert.equal(compareObservation(obs, p).outcome, "insufficient");
  }
});
test("contradictions are checked in both directions", () => {
  assert.equal(compareObservation(obs, props).outcome, "agree");
  const r = compareObservation(obs, { ...props, path_canopy_frac_50m: 0.9, canopy_pct_baseline: 90 });
  assert.equal(r.outcome, "disagree");
  assert.equal(r.differences.length, 2);
});
test("malformed CSV, duplicate headers, wrong row widths and impossible dates are refused safely", () => {
  assert.throws(() => parseCsv('a,b\n"unterminated,z'), /quote/i);
  for (const text of [`${header},site_id\nA,3,101,none,sparse,yes,,,,,A`, `${header}\nA,3,101,none,sparse,yes,,,,2026-99-99`, `${header}\nA,3,101,none,sparse,yes,,,,2026-10-22,extra`]) {
    assert.doesNotThrow(() => readFieldSheet(text, options));
    assert.equal(readFieldSheet(text, options).ok, false);
  }
});

test("middle proxies cannot agree with extreme observations",()=>{
 assert.equal(compareObservation({...obs,canopy_class:"dense"},{...props,path_canopy_frac_50m:0.5,canopy_pct_baseline:50}).outcome,"insufficient");
 assert.equal(compareObservation({...obs,shade_on_path:"full",canopy_class:"moderate"},{...props,path_canopy_frac_50m:0.9,canopy_pct_baseline:90}).outcome,"insufficient");
});
