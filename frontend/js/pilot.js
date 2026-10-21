// The pilot work package: inspection batches, planting phases, resource estimates from the planner's OWN numbers, a work schedule, replacement
// suggestions for rejected sites, and the unique reach of the shortlist. Pure functions, no DOM. Nothing is estimated from assumed local rates:
// if the planner has not entered a number, the answer says so instead of guessing. A 30 m site is not assumed to be one tree.
import { CHECKS, STATUS_LABEL, feasibility, safeCell } from "./plan.js";

const ACTIONS = {
  proposed: "Run the field checks and put the site in an inspection batch",
  "needs-inspection": "Inspect on site",
  inspected: "Review the findings and keep or reject the site",
  approved: "Plan the planting design and species with the landscape team, then plant",
  rejected: "Replace with the next-ranked alternative",
  planted: "Record the tree and schedule follow-up inspections",
};
export const nextAction = (entry) => ACTIONS[entry.status] ?? "";

export const SCHEDULE_COLUMNS = [
  { key: "site_id", label: "site_id" }, { key: "batch", label: "inspection_batch" }, { key: "phase", label: "planting_phase" }, { key: "team", label: "team" },
  { key: "status", label: "status" }, { key: "next", label: "next_action" }, { key: "unresolved", label: "checks_not_ok" }, { key: "reason", label: "reason" },
];

/** One row per site for a downloadable work schedule, grouped by batch then phase. */
export function workSchedule(entries) {
  return entries.map((e) => ({
    site_id: e.id, batch: safeCell(e.batch), phase: e.phase, team: safeCell(e.team), status: STATUS_LABEL[e.status], next: nextAction(e),
    unresolved: CHECKS.length - feasibility(e).ok, reason: safeCell(e.reason),
  })).sort((a, b) => (a.batch ? 0 : 1) - (b.batch ? 0 : 1) || a.batch.localeCompare(b.batch)       // sites with no batch or phase go last
    || (a.phase ? 0 : 1) - (b.phase ? 0 : 1) || a.phase.localeCompare(b.phase) || a.site_id.localeCompare(b.site_id));
}

const per = (n, rate) => (Number.isFinite(rate) && rate > 0 ? Math.ceil(n / rate) : null);

/**
 * Inspection workload: how many sites await inspection, by batch, and (only if the planner entered them) how many days and what cost.
 * settings is plan.settings(): { inspectionsPerDay, costPerInspection, ... }, each a number or null.
 */
export function inspectionPlan(entries, settings) {
  const waiting = entries.filter((e) => e.status === "needs-inspection");
  const by = new Map();
  for (const e of waiting) by.set(e.batch || "", (by.get(e.batch || "") ?? 0) + 1);
  const batches = [...by.entries()].map(([name, count]) => ({ name: name || "No batch yet", count, days: per(count, settings.inspectionsPerDay) })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    awaiting: waiting.length,
    batches,
    days: per(waiting.length, settings.inspectionsPerDay),
    cost: Number.isFinite(settings.costPerInspection) ? waiting.length * settings.costPerInspection : null,
    inspected: entries.filter((e) => e.status === "inspected").length,
    rejected: entries.filter((e) => e.status === "rejected").length,
  };
}

/** Planting phases: approved sites per phase, with trees and cost only if the planner entered trees per site and a cost per tree. */
export function plantingPlan(entries, settings) {
  const approved = entries.filter((e) => e.status === "approved" || e.status === "planted");
  const phases = new Map();
  for (const e of approved) phases.set(e.phase || "", (phases.get(e.phase || "") ?? 0) + 1);
  const rows = [...phases.entries()].map(([phase, sites]) => {
    const trees = Number.isFinite(settings.treesPerSite) ? sites * settings.treesPerSite : null;
    return { phase: phase || "No phase yet", sites, trees, cost: trees !== null && Number.isFinite(settings.costPerTree) ? trees * settings.costPerTree : null };
  }).sort((a, b) => a.phase.localeCompare(b.phase));
  return { rows, sites: approved.length, trees: rows.every((r) => r.trees !== null) && rows.length ? rows.reduce((a, r) => a + r.trees, 0) : null };
}

/**
 * Up to n replacements for a rejected site: sites not already in the plan, preferring the same 250 m block, then the next best ranks.
 * ranked is the features in current rank order; planIds and skipIds are Sets of site ids to leave out.
 */
export function suggestAlternatives(rejectedId, ranked, planIds, n = 3) {
  const from = ranked.find((f) => f.properties.site_id === rejectedId);
  const block = from?.properties.block_id;
  const open = ranked.filter((f) => !planIds.has(f.properties.site_id));
  const same = block ? open.filter((f) => f.properties.block_id === block) : [];
  const out = [];
  for (const f of [...same, ...open]) {
    if (!out.includes(f)) out.push(f);
    if (out.length >= n) break;
  }
  return out.map((f) => ({ id: f.properties.site_id, rank: f.properties.rank, score: f.properties.score_total, sameBlock: Boolean(block) && f.properties.block_id === block }));
}

/** How many different 250 m blocks the given sites fall in. */
export function blocksOf(ids, byId) {
  return new Set(ids.map((id) => byId.get(id)?.properties.block_id).filter(Boolean)).size;
}

/**
 * The unique reach of any set of sites, from ml/reports/reach_sets.json (/ml/reach-sets): each footpath sample, home and corridor-gap sample is counted once.
 * Returns null when the data is missing. Reach, not benefit.
 */
export function unionReach(reachSets, ids) {
  if (!reachSets?.sites || reachSets.stale === true || reachSets.stale === null || ids.some((id) => !reachSets.sites[id])) return null;
  const path = new Set(), homes = new Set(), gaps = new Set();
  for (const id of ids) {
    const s = reachSets.sites[id];
    if (!s) continue;
    for (const i of s[0]) path.add(i);
    for (const i of s[1]) homes.add(i);
    for (const i of s[2]) gaps.add(i);
  }
  const t = reachSets.totals, step = reachSets.sample_step_m;
  const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  return {
    footpath_m: Math.round(path.size * step.footpath), footpath_pct: pct(path.size, t.footpath_samples),
    homes: homes.size, homes_pct: pct(homes.size, t.homes),
    gap_m: Math.round(gaps.size * step.gap), gap_pct: pct(gaps.size, t.gap_samples),
  };
}

export const STEP_NAMES = ["Shortlist and decide", "Inspect", "Plan the work", "Plant and maintain"];

/** The one thing to do next, in plain words, from where the plan stands: { step: 1 to 4, text }. */
export function nextStep(entries, trees) {
  const has = (status) => entries.some((e) => e.status === status);
  if (!entries.length) return { step: 1, text: "Add sites to the plan: start with the first five in the list on Plant first, or open a site card." };
  if (has("proposed")) return { step: 1, text: "Mark the sites you want inspected as Needs inspection and put them in an inspection batch." };
  if (has("needs-inspection")) return { step: 2, text: "Download the field sheet, have someone walk those sites, then import the completed sheet." };
  if (entries.some((e) => (e.observed && !e.reviewed) || e.status === "inspected")) return { step: 1, text: "Review the findings: keep or reject each inspected site." };
  if (has("rejected")) return { step: 1, text: "Replace rejected sites with the next-ranked alternatives, or leave them out." };
  if (entries.some((e) => e.status === "approved" && !e.phase)) return { step: 3, text: "Put approved sites in a planting phase and enter your own capacity and costs." };
  if (has("approved")) return { step: 3, text: "When a planting is done, mark that site Planted in step 1, then record its trees." };
  if (has("planted") && !trees.length) return { step: 4, text: "Record the planted trees and schedule their follow-up inspections." };
  if (trees.length) return { step: 4, text: "Record follow-up inspections. The survival report counts only trees that were inspected." };
  return { step: 1, text: "Decide the next status for each site in the plan." };
}
