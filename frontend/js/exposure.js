// Resident walking exposure under explicit assumptions. Proximity to a mapped residential building is not evidence of residents or walking.
import { safeCell } from "./plan.js";

const STORAGE_KEY = "elmina-exposure-scenario-v1";
export const EXPOSURE_FIELDS = [
  { key: "residentsPerBuilding", label: "Residents per mapped residential building", min: 0.01, max: 10000 },
  { key: "walkersPct", label: "Residents walking this route daily (%)", min: 0, max: 100 },
  { key: "minutesPerDay", label: "Minutes on the route per walker per day", min: 0.01, max: 1440 },
  { key: "baselineShadePct", label: "Current share of walking time in shade (%)", min: 0, max: 100 },
  { key: "targetShadePct", label: "Scenario share of walking time in shade (%)", min: 0, max: 100 },
];
export const EXPOSURE_NOTE = "Assumption-based scenario, not a measured benefit or a shade forecast. Mapped residential buildings are not households; apartments may contain many homes and OSM coverage is incomplete. Proximity does not establish route use. Shade shares must come from your assumptions or a timed walk, never satellite greenness. No cooling or health effect is calculated.";

const text = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const numeric = (v) => (typeof v === "number" || (typeof v === "string" && v.trim())) && Number.isFinite(Number(v)) ? Number(v) : null;
function clean(raw) {
  return { ...Object.fromEntries(EXPOSURE_FIELDS.map(({ key }) => [key, numeric(raw?.[key])])), horizon: text(raw?.horizon, 60), basis: text(raw?.basis, 280) };
}

export function createExposure(storage) {
  let state = clean(null);
  try { state = clean(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null")); } catch { /* start blank */ }
  const listeners = new Set();
  return {
    get: () => ({ ...state }),
    set(key, value) {
      if (!Object.hasOwn(state, key)) return;
      state = clean({ ...state, [key]: value });
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* session only */ }
      for (const fn of listeners) fn();
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export function exposureScenario(reach, raw) {
  if (!Number.isInteger(reach?.homes) || reach.homes < 0) return { state: "no-reach", note: "Current unique reach data is unavailable." };
  const s = clean(raw);
  const missing = EXPOSURE_FIELDS.filter(({ key, min, max }) => s[key] === null || s[key] < min || s[key] > max).map((f) => f.label);
  if (!s.horizon) missing.push("Scenario horizon");
  if (!s.basis) missing.push("Source or basis for the assumptions");
  if (missing.length) return { state: "needs-inputs", missing, note: "Enter all assumptions, their basis and a scenario horizon to calculate exposure." };
  const walkers = reach.homes * s.residentsPerBuilding * s.walkersPct / 100;
  const walking = walkers * s.minutesPerDay;
  const baseline = walking * (1 - s.baselineShadePct / 100), target = walking * (1 - s.targetShadePct / 100);
  return { state: "ready", homes: reach.homes, walkers, baseline, target, difference: baseline - target, settings: s, note: EXPOSURE_NOTE };
}

export function exposureRows(reach, settings) {
  const r = exposureScenario(reach, settings);
  return r.state !== "ready" ? [] : [{
    mapped_residential_buildings: r.homes, ...r.settings, horizon: safeCell(r.settings.horizon), basis: safeCell(r.settings.basis),
    assumed_daily_walkers: r.walkers, baseline_person_minutes_per_day: r.baseline, scenario_person_minutes_per_day: r.target,
    fewer_unshaded_person_minutes_per_day: r.difference, caveat: EXPOSURE_NOTE,
  }];
}
