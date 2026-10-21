// Planted-tree records: the maintenance schedule and the recorded-survival report. Only what the planner has entered counts. A tree with no follow-up
// inspection is never counted as surviving, and with no records at all the report says "No field data". Pure functions, no DOM.
import { CONDITION_LABEL, safeCell } from "./plan.js";

const alive = (c) => c === "alive-good" || c === "alive-poor";
const latest = (t) => t.observations[t.observations.length - 1] ?? null;

export const TREE_COLUMNS = [
  { key: "id", label: "tree_id" }, { key: "site_id", label: "site_id" }, { key: "species", label: "species" }, { key: "planted_on", label: "planted_on" },
  { key: "owner", label: "maintenance_owner" }, { key: "next_inspection", label: "next_inspection" }, { key: "last_date", label: "last_observation_date" },
  { key: "last_condition", label: "last_observed_condition" }, { key: "count", label: "observations" }, { key: "lat", label: "lat" }, { key: "lon", label: "lon" },
];

/** Recorded survival among INSPECTED trees: the latest observation of each tree, with the denominator and the date range stated. */
export function survivalReport(trees) {
  const inspected = trees.filter((t) => t.observations.length > 0);
  const notYet = trees.length - inspected.length;
  if (!trees.length) return { state: "no-data", trees: 0, inspected: 0, notYet: 0, text: "No field data: no planted trees have been recorded." };
  if (!inspected.length) return { state: "no-inspections", trees: trees.length, inspected: 0, notYet, text: `No field data on survival yet: ${notYet} planted tree${notYet === 1 ? "" : "s"} recorded, none inspected.` };
  const last = inspected.map(latest);
  const aliveN = last.filter((o) => alive(o.condition)).length;
  const good = last.filter((o) => o.condition === "alive-good").length;
  const dates = last.map((o) => o.date).sort();
  const pct = Math.round((1000 * aliveN) / inspected.length) / 10;
  return {
    state: "ok", trees: trees.length, inspected: inspected.length, alive: aliveN, aliveGood: good, deadOrMissing: inspected.length - aliveN, notYet, pct,
    from: dates[0], to: dates[dates.length - 1],
    text: `Recorded survival among inspected trees: ${aliveN} of ${inspected.length} (${pct}%) at each tree's latest inspection, ${dates[0]} to ${dates[dates.length - 1]}. `
      + `${notYet} recorded tree${notYet === 1 ? " has" : "s have"} not been inspected and ${notYet === 1 ? "is" : "are"} not counted as surviving.`,
  };
}

/** Trees sorted by next inspection date: overdue first. `today` is a YYYY-MM-DD string. Trees with no date set go last. */
export function maintenanceSchedule(trees, today) {
  return trees.map((t) => ({
    id: t.id, site_id: t.site_id, species: t.species, owner: t.owner, next_inspection: t.next_inspection,
    state: !t.next_inspection ? "no-date" : t.next_inspection < today ? "overdue" : t.next_inspection === today ? "due-today" : "scheduled",
    last: latest(t),
  })).sort((a, b) => (a.next_inspection || "9999").localeCompare(b.next_inspection || "9999") || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export const STATE_LABEL = { overdue: "Overdue", "due-today": "Due today", scheduled: "Scheduled", "no-date": "No date set" };

/** Rows for a tree register download. */
export function treeRows(trees) {
  return trees.map((t) => {
    const l = latest(t);
    return { id: t.id, site_id: t.site_id, species: safeCell(t.species), planted_on: t.planted_on, owner: safeCell(t.owner), next_inspection: t.next_inspection,
      last_date: l?.date ?? "", last_condition: l ? CONDITION_LABEL[l.condition] : "No inspection recorded", count: t.observations.length, lat: t.lat ?? "", lon: t.lon ?? "" };
  });
}
