import { test } from "node:test";
import assert from "node:assert/strict";
import { createExposure, exposureScenario, exposureRows } from "../js/exposure.js";

const inputs = { residentsPerBuilding: 3, walkersPct: 25, minutesPerDay: 10, baselineShadePct: 20, targetShadePct: 60, horizon: "Year 5", basis: "Illustrative assumptions" };

test("exposure uses unique mapped buildings and states assumptions rather than outcomes", () => {
  const r = exposureScenario({ homes: 100 }, inputs);
  assert.equal(r.state, "ready");
  assert.equal(r.walkers, 75);
  assert.equal(r.baseline, 600);
  assert.equal(r.target, 300);
  assert.equal(r.difference, 300);
  assert.match(r.note, /scenario/i);
});

test("unknown reach or assumptions cannot turn into a headline number", () => {
  assert.equal(exposureScenario(null, inputs).state, "no-reach");
  for (const key of Object.keys(inputs)) {
    assert.notEqual(exposureScenario({ homes: 100 }, { ...inputs, [key]: "" }).state, "ready", key);
  }
  for (const v of [-1, Infinity, NaN, "abc", true]) {
    assert.notEqual(exposureScenario({ homes: 100 }, { ...inputs, walkersPct: v }).state, "ready");
  }
  assert.notEqual(exposureScenario({ homes: 100 }, { ...inputs, targetShadePct: 101 }).state, "ready");
});

test("zero walkers/buildings and a worsening shade scenario remain visible", () => {
  assert.equal(exposureScenario({ homes: 0 }, inputs).baseline, 0);
  assert.equal(exposureScenario({ homes: 100 }, { ...inputs, walkersPct: 0 }).target, 0);
  assert.equal(exposureScenario({ homes: 100 }, { ...inputs, targetShadePct: 0 }).difference, -150);
});

test("inputs persist without seeding demo values and exports carry their basis", () => {
  let saved;
  const storage = { getItem: () => saved ?? null, setItem: (_, v) => { saved = v; } };
  const s = createExposure(storage);
  assert.notEqual(exposureScenario({ homes: 100 }, s.get()).state, "ready");
  for (const [k, v] of Object.entries(inputs)) s.set(k, v);
  assert.deepEqual(createExposure(storage).get(), s.get());
  s.set("basis", "=CMD()");
  const row = exposureRows({ homes: 100 }, s.get())[0];
  assert.equal(row.basis, "'=CMD()");
  assert.match(row.caveat, /not a measured/i);
  assert.equal(row.baseline_person_minutes_per_day, 600);
  assert.equal(exposureRows(null, s.get()).length, 0);
});
