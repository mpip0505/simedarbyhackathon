// The planting plan: the planner's own shortlist of sites with a status, a note, field-feasibility checks, an inspection batch and planting phase,
// imported field observations, and (once a planting is recorded) tree records with follow-up observations. All of it is the planner's own entries, kept in
// this browser only. Nothing here inspects, verifies, approves or plants anything, and nothing is sent anywhere. An unknown stays unknown.
// Pure logic plus a small store over an injected storage (localStorage in the app, a fake in tests). No DOM.
import { centroid } from "./csv.js";
import { INTERVENTION_LABEL, suggestIntervention } from "./intervention.js";

export const STATUSES = [
  { key: "proposed", label: "Proposed" },
  { key: "needs-inspection", label: "Needs inspection" },
  { key: "inspected", label: "Inspected" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "planted", label: "Planted" },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));

// Field-feasibility checks: what a person must confirm on the ground. Each is unknown until someone records it.
export const CHECKS = [
  { key: "access", label: "Land access confirmed" },
  { key: "utilities", label: "Utilities and setbacks checked" },
  { key: "space_soil", label: "Planting space, soil and drainage checked" },
  { key: "maintenance", label: "Maintenance access confirmed" },
  { key: "existing_trees", label: "Existing trees and roots checked" },
];
export const CHECK_VALUES = [{ key: "unknown", label: "Not checked" }, { key: "ok", label: "OK" }, { key: "issue", label: "Problem" }];
const CHECK_KEYS = new Set(CHECKS.map((c) => c.key));
const CHECK_VALUE_KEYS = new Set(CHECK_VALUES.map((c) => c.key));

export const CONDITIONS = [
  { key: "alive-good", label: "Alive, good condition" },
  { key: "alive-poor", label: "Alive, poor condition" },
  { key: "dead", label: "Dead" },
  { key: "not-found", label: "Not found" },
];
export const CONDITION_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.key, c.label]));

export const STORAGE_KEY = "elmina-planting-plan-v1";     // the key stays; the stored shape is versioned inside (v1 plans are upgraded when read)
export const MAX_ENTRIES = 300;
export const MAX_TREES = 500;
export const MAX_OBSERVATIONS = 50;
export const NOTE_MAX = 280;
export const PHASES = ["1", "2", "3", "4"];
const SITE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PLAN_COLUMNS = [
  { key: "site_id", label: "site_id" }, { key: "status", label: "status" }, { key: "note", label: "note" },
  { key: "reason", label: "reason" }, { key: "batch", label: "inspection_batch" }, { key: "phase", label: "planting_phase" }, { key: "team", label: "team" },
  { key: "feasibility", label: "field_feasibility" }, { key: "unresolved", label: "checks_not_ok" }, { key: "observation", label: "field_observation" },
  { key: "suggested", label: "suggested_intervention" }, { key: "intervention", label: "chosen_intervention" }, { key: "intervention_by", label: "intervention_reviewed_by" },
  { key: "readiness", label: "maintenance_readiness" }, { key: "species", label: "planned_species" }, { key: "watering", label: "watering" }, { key: "maintainer", label: "maintenance_responsibility" },
  { key: "establishment", label: "establishment_inspections" }, { key: "survival", label: "survival_observation" },
  { key: "rank", label: "current_rank" }, { key: "score_total", label: "current_score" }, { key: "origin", label: "origin" },
  { key: "lat", label: "lat" }, { key: "lon", label: "lon" }, { key: "source", label: "source" }, { key: "plan_note", label: "about_this_file" },
];

export const FIELD_SHEET_COLUMNS = ["site_id", "lat", "lon", "shade_on_path", "canopy_class", "path_in_use", "photo_id", "notes", "observer", "date"];

// Maintenance readiness: who keeps the trees alive. Each starts unknown and stays so until the planner records it; no survival rate is guessed.
export const WATERING = [{ key: "unknown", label: "Unknown" }, { key: "available", label: "Available" }, { key: "none", label: "Not available" }];
const WATERING_KEYS = new Set(WATERING.map((w) => w.key));
export const INTERVENTION_KEYS = new Set(["protect", "regenerate", "plant-shade", "inspect"]);   // the keys in intervention.js

export const PLAN_CAVEAT = "These are the planner's own entries, saved on this device only. Nothing here has been inspected by this tool, and a status such as Planted only records what was typed.";

const control = /[\u0000-\u001f\u007f]+/g;
const cleanText = (v, max) => String(v ?? "").replace(control, " ").trim().slice(0, max);
const cleanNote = (v) => cleanText(v, NOTE_MAX);
const validDate = (v) => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const cleanDate = (v) => (validDate(v) ? v : "");
const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));

const blankChecks = () => Object.fromEntries(CHECKS.map((c) => [c.key, "unknown"]));

function cleanChecks(raw) {
  const out = blankChecks();
  if (raw && typeof raw === "object") for (const k of Object.keys(out)) if (CHECK_VALUE_KEYS.has(raw[k])) out[k] = raw[k];
  return out;
}

const SHADE = ["none", "partial", "full"], CANOPY = ["none", "sparse", "moderate", "dense"], YESNO = ["yes", "no"];

/** An imported field observation, or null when it is not in the shape the importer writes. */
function cleanObserved(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!SHADE.includes(raw.shade_on_path) || !CANOPY.includes(raw.canopy_class) || !YESNO.includes(raw.path_in_use)) return null;
  if (!["agree", "disagree"].includes(raw.outcome)) return null;
  return {
    shade_on_path: raw.shade_on_path, canopy_class: raw.canopy_class, path_in_use: raw.path_in_use, outcome: raw.outcome,
    differences: Array.isArray(raw.differences) ? raw.differences.slice(0, 6).map((d) => cleanText(d, 160)) : [],
    photo_id: cleanText(raw.photo_id, 60), notes: cleanText(raw.notes, NOTE_MAX), observer: cleanText(raw.observer, 60), date: cleanDate(raw.date), imported_on: cleanDate(raw.imported_on),
  };
}

function cleanEntry(it) {
  return {
    id: it.id, status: it.status, note: cleanNote(it.note), checks: cleanChecks(it.checks), reason: cleanText(it.reason, NOTE_MAX),
    batch: cleanText(it.batch, 24), phase: PHASES.includes(String(it.phase)) ? String(it.phase) : "", team: cleanText(it.team, 40),
    observed: cleanObserved(it.observed), reviewed: ["", "kept", "rejected"].includes(it.reviewed) ? it.reviewed : "",
    intervention: INTERVENTION_KEYS.has(it.intervention) ? it.intervention : "", interventionBy: cleanText(it.interventionBy, 60), interventionOn: cleanDate(it.interventionOn),
    species: cleanText(it.species, 60), watering: WATERING_KEYS.has(it.watering) ? it.watering : "unknown", maintainer: cleanText(it.maintainer, 60), establishment: cleanText(it.establishment, 80),
  };
}

function cleanTree(t, usedIds) {
  if (!t || typeof t !== "object" || !/^T\d{1,6}$/.test(String(t.id)) || usedIds.has(t.id) || !SITE_ID.test(String(t.site_id))) return null;
  const obs = (Array.isArray(t.observations) ? t.observations : []).filter((o) => o && validDate(o.date) && CONDITION_LABEL[o.condition]).slice(0, MAX_OBSERVATIONS)
    .map((o) => ({ date: o.date, condition: o.condition, note: cleanText(o.note, 200) }));
  const lat = Number(t.lat), lon = Number(t.lon);
  return {
    id: t.id, site_id: t.site_id, species: cleanText(t.species, 60), planted_on: cleanDate(t.planted_on), owner: cleanText(t.owner, 60),
    next_inspection: cleanDate(t.next_inspection), lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null, lon: Number.isFinite(lon) && Math.abs(lon) <= 180 ? lon : null,
    observations: obs,
  };
}

const cleanSettings = (s) => ({
  inspectionsPerDay: num(s?.inspectionsPerDay), costPerInspection: num(s?.costPerInspection), treesPerSite: num(s?.treesPerSite), costPerTree: num(s?.costPerTree),
  unit: cleanText(s?.unit, 8),
});

/** The stored shape made safe to trust: known site-id shape, known status, short text, no repeats, size limits. v1 plans are upgraded. */
export function sanitiseAll(raw) {
  const seen = new Set();
  const items = [];
  for (const it of Array.isArray(raw?.items) ? raw.items : []) {
    if (!it || typeof it !== "object" || !SITE_ID.test(String(it.id)) || seen.has(it.id) || !STATUS_LABEL[it.status]) continue;
    seen.add(it.id);
    items.push(cleanEntry(it));
    if (items.length >= MAX_ENTRIES) break;
  }
  const usedTrees = new Set();
  const trees = [];
  for (const t of Array.isArray(raw?.trees) ? raw.trees : []) {
    const c = cleanTree(t, usedTrees);
    if (c) { usedTrees.add(c.id); trees.push(c); }
    if (trees.length >= MAX_TREES) break;
  }
  return { items, trees, settings: cleanSettings(raw?.settings) };
}
/** Just the entries (the original v1 helper, kept for callers and tests). */
export const sanitise = (raw) => sanitiseAll(raw).items;

/** How far the five field checks have got. An unknown never counts as OK, and all-ok is never an approval. */
export function feasibility(entry) {
  const vals = CHECKS.map((c) => entry.checks[c.key]);
  const ok = vals.filter((v) => v === "ok").length, issue = vals.filter((v) => v === "issue").length, unknown = vals.length - ok - issue;
  const state = issue ? "issue" : ok === vals.length ? "all-ok" : ok === 0 ? "not-checked" : "partial";
  const label = { issue: `Problem found (${issue})`, "all-ok": "All five checks OK (not an approval)", "not-checked": "Not checked", partial: `${ok} of ${vals.length} checks OK` }[state];
  return { state, ok, issue, unknown, label };
}

/**
 * Establishment and maintenance readiness for one entry: six rows of { key, label, value, set } and how many are set. trees is that site's tree records.
 * Soil and drainage come from the field check; survival only from recorded inspections. An unknown is shown as unknown, never filled in.
 */
export function readiness(entry, trees = []) {
  const soil = entry.checks.space_soil;
  const inspected = trees.filter((t) => t.observations.length);
  const alive = inspected.filter((t) => ["alive-good", "alive-poor"].includes(t.observations[t.observations.length - 1].condition)).length;
  const rows = [
    { key: "species", label: "Species", value: entry.species || "Awaiting ecologist selection", set: Boolean(entry.species) },
    { key: "soil", label: "Soil and drainage", value: soil === "ok" ? "Checked, OK" : soil === "issue" ? "Checked, problem found" : "Not checked", set: soil !== "unknown" },
    { key: "watering", label: "Watering availability", value: WATERING.find((w) => w.key === entry.watering).label, set: entry.watering !== "unknown" },
    { key: "maintainer", label: "Maintenance responsibility", value: entry.maintainer || "Unassigned", set: Boolean(entry.maintainer) },
    { key: "establishment", label: "Establishment inspections", value: entry.establishment || "To be set by planner", set: Boolean(entry.establishment) },
    { key: "survival", label: "Survival observation", value: inspected.length ? `${alive} of ${inspected.length} inspected trees alive` : trees.length ? "Trees recorded, none inspected yet" : "No field data", set: inspected.length > 0 },
  ];
  const n = rows.filter((r) => r.set).length;
  return { rows, set: n, label: `${n} of ${rows.length} recorded` };
}

/** Plain warnings about one entry: things the planner may want to fix. Never blocks anything. */
export function warnings(entry) {
  const out = [];
  const f = feasibility(entry);
  if ((entry.status === "approved" || entry.status === "planted") && f.state !== "all-ok") out.push(f.state === "issue" ? "Marked as " + STATUS_LABEL[entry.status] + " although a check found a problem" : "Marked as " + STATUS_LABEL[entry.status] + " with checks not yet OK");
  if (entry.status === "rejected" && !entry.reason) out.push("Add a reason for rejecting this site");
  if (entry.observed?.outcome === "disagree" && !entry.reviewed) out.push("The field observation disagrees with the model: keep or reject this site");
  if ((entry.intervention === "protect" || entry.intervention === "regenerate") && !entry.interventionBy) out.push(`${entry.intervention === "protect" ? "Protect" : "Regenerate"} is chosen: name the ecologist who reviewed it`);
  if ((entry.status === "approved" || entry.status === "planted") && entry.intervention === "protect") out.push("Marked for planting although the chosen intervention is Protect existing vegetation");
  if ((entry.status === "approved" || entry.status === "planted") && !entry.maintainer) out.push("No one is named as responsible for maintenance");
  return out;
}

/** A plan over `storage` (anything with getItem and setItem; failures are swallowed, so the plan still works for the session). */
export function createPlan(storage) {
  let state = { items: [], trees: [], settings: cleanSettings(null) };
  try { state = sanitiseAll(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null")); } catch { /* start empty */ }
  const listeners = new Set();
  const save = (source) => {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ v: 2, items: state.items, trees: state.trees, settings: state.settings })); } catch { /* not remembered: still fine for this visit */ }
    for (const fn of listeners) fn(source);
  };
  const find = (id) => state.items.find((x) => x.id === id);
  const tree = (id) => state.trees.find((x) => x.id === id);
  const copy = (x) => (x ? JSON.parse(JSON.stringify(x)) : null);
  const edit = (id, source, fn) => { const it = find(id); if (it && fn(it) !== false) save(source); };
  return {
    has: (id) => Boolean(find(id)),
    get: (id) => copy(find(id)),
    list: () => state.items.map(copy),
    ids: () => new Set(state.items.map((x) => x.id)),
    /** Add a site as Proposed; false when the id is invalid, already there, or the plan is full. */
    add(id, source) {
      if (!SITE_ID.test(String(id)) || find(id) || state.items.length >= MAX_ENTRIES) return false;
      state.items.push(cleanEntry({ id, status: "proposed" }));
      save(source);
      return true;
    },
    remove(id, source) {
      const before = state.items.length;
      state.items = state.items.filter((x) => x.id !== id);
      if (state.items.length !== before) save(source);
    },
    setStatus: (id, status, source) => edit(id, source, (it) => { if (!STATUS_LABEL[status] || it.status === status) return false; it.status = status; }),
    setNote: (id, note, source) => edit(id, source, (it) => { const n = cleanNote(note); if (it.note === n) return false; it.note = n; }),
    setReason: (id, text, source) => edit(id, source, (it) => { const n = cleanText(text, NOTE_MAX); if (it.reason === n) return false; it.reason = n; }),
    setCheck: (id, key, value, source) => edit(id, source, (it) => { if (!CHECK_KEYS.has(key) || !CHECK_VALUE_KEYS.has(value) || it.checks[key] === value) return false; it.checks[key] = value; }),
    setBatch: (id, batch, source) => edit(id, source, (it) => { const n = cleanText(batch, 24); if (it.batch === n) return false; it.batch = n; }),
    setPhase: (id, phase, source) => edit(id, source, (it) => { const n = PHASES.includes(String(phase)) ? String(phase) : ""; if (it.phase === n) return false; it.phase = n; }),
    setTeam: (id, team, source) => edit(id, source, (it) => { const n = cleanText(team, 40); if (it.team === n) return false; it.team = n; }),
    /** The planner's chosen intervention (a key from intervention.js, or "" to go back to the suggestion), who reviewed it and when. */
    setIntervention: (id, key, source) => edit(id, source, (it) => { if (key !== "" && !INTERVENTION_KEYS.has(key)) return false; if (it.intervention === key) return false; it.intervention = key; }),
    setInterventionBy: (id, text, source) => edit(id, source, (it) => { const n = cleanText(text, 60); if (it.interventionBy === n) return false; it.interventionBy = n; }),
    setInterventionOn: (id, date, source) => edit(id, source, (it) => { const n = cleanDate(date); if (it.interventionOn === n) return false; it.interventionOn = n; }),
    /** One readiness field: species, maintainer or establishment (text), or watering (a WATERING key). */
    setReadiness: (id, field, value, source) => edit(id, source, (it) => {
      let n;
      if (field === "watering") { if (!WATERING_KEYS.has(value)) return false; n = value; }
      else if (field === "species" || field === "maintainer") n = cleanText(value, 60);
      else if (field === "establishment") n = cleanText(value, 80);
      else return false;
      if (it[field] === n) return false;
      it[field] = n;
    }),
    /** Store an imported field observation and move a Needs inspection site to Inspected (a person still decides to keep or reject it). */
    setObserved: (id, observed, source) => edit(id, source, (it) => {
      const o = cleanObserved(observed);
      if (!o) return false;
      it.observed = o; it.reviewed = "";
      if (it.status === "needs-inspection" || it.status === "proposed") it.status = "inspected";
    }),
    setReviewed: (id, decision, source) => edit(id, source, (it) => {
      if (!["kept", "rejected"].includes(decision)) return false;
      it.reviewed = decision;
      if (decision === "rejected") it.status = "rejected";
    }),
    clear(source) { if (state.items.length || state.trees.length) { state = { items: [], trees: [], settings: state.settings }; save(source); } },
    counts() {
      const by = Object.fromEntries(STATUSES.map((s) => [s.key, 0]));
      for (const x of state.items) by[x.status] += 1;
      return { total: state.items.length, by };
    },
    settings: () => ({ ...state.settings }),
    setSetting(key, value, source) {
      if (!(key in state.settings)) return;
      const next = cleanSettings({ ...state.settings, [key]: value });
      if (next[key] === state.settings[key]) return;
      state.settings = next;
      save(source);
    },
    // tree records: only for a site recorded as Planted; observations are the planner's own entries
    trees: () => state.trees.map(copy),
    addTree({ site_id, species, planted_on, lat, lon, owner, next_inspection }, source) {
      const site = find(site_id);
      if (!site || site.status !== "planted" || state.trees.length >= MAX_TREES) return null;
      let n = 1; while (tree(`T${n}`)) n += 1;
      const t = cleanTree({ id: `T${n}`, site_id, species, planted_on, lat, lon, owner, next_inspection, observations: [] }, new Set());
      if (!t || !t.species || !t.planted_on) return null;
      state.trees.push(t);
      save(source);
      return t.id;
    },
    setTreeField(treeId, field, value, source) {
      const t = tree(treeId);
      if (!t || !["species", "owner", "next_inspection", "planted_on"].includes(field)) return;
      const next = cleanTree({ ...t, [field]: value }, new Set())?.[field];
      if (next === undefined || (field === "planted_on" && !next) || next === t[field]) return;
      t[field] = next;
      save(source);
    },
    addObservation(treeId, { date, condition, note }, source) {
      const t = tree(treeId);
      if (!t || !validDate(date) || !CONDITION_LABEL[condition] || t.observations.length >= MAX_OBSERVATIONS) return false;
      t.observations.push({ date, condition, note: cleanText(note, 200) });
      t.observations.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      save(source);
      return true;
    },
    removeTree(treeId, source) {
      const before = state.trees.length;
      state.trees = state.trees.filter((x) => x.id !== treeId);
      if (state.trees.length !== before) save(source);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** A spreadsheet reads a cell starting with = + - @ as a formula; a leading apostrophe stops that. */
export const safeCell = (text) => (/^[=+\-@\t\r]/.test(String(text)) ? `'${text}` : text);

/** One row per planned site that the current data knows, in plan order, ready for toCsv(rows, PLAN_COLUMNS). trees: the plan's tree records. */
export function planRows(entries, byId, trees = []) {
  const rows = [];
  for (const e of entries) {
    const f = byId.get(e.id);
    if (!f) continue;
    const c = centroid(f.geometry);
    const fe = feasibility(e);
    const ready = readiness(e, trees.filter((t) => t.site_id === e.id));
    const value = (k) => ready.rows.find((r) => r.key === k).value;
    rows.push({
      site_id: e.id, status: STATUS_LABEL[e.status], note: safeCell(e.note), reason: safeCell(e.reason), batch: safeCell(e.batch), phase: e.phase, team: safeCell(e.team),
      feasibility: fe.label, unresolved: CHECKS.length - fe.ok,
      observation: e.observed ? `${e.observed.outcome === "agree" ? "Agrees with model" : "Disagrees with model"}${e.reviewed ? `; planner: ${e.reviewed}` : ""}` : "No field observation",
      suggested: suggestIntervention(f.properties).label, intervention: e.intervention ? INTERVENTION_LABEL[e.intervention] : "Not chosen",
      intervention_by: safeCell([e.interventionBy, e.interventionOn].filter(Boolean).join(", ")),
      readiness: ready.label, species: safeCell(value("species")), watering: value("watering"), maintainer: safeCell(value("maintainer")),
      establishment: safeCell(value("establishment")), survival: value("survival"),
      rank: f.properties.rank, score_total: f.properties.score_total,
      origin: f.properties.origin, lat: c ? Number(c.lat.toFixed(6)) : "", lon: c ? Number(c.lon.toFixed(6)) : "",
      source: f.properties.source ?? "simulated",
      plan_note: "Planner's own entries from a screening tool; example sites (simulated); not inspected or verified.",
    });
  }
  return rows;
}

/** Rows for the blind field sheet: sites marked Needs inspection (optionally one batch), place only (no rank or score), in the columns backend/field_checks.py reads back. */
export function fieldSheetRows(entries, byId, batch = null) {
  const rows = [];
  for (const e of entries) {
    if (e.status !== "needs-inspection" || (batch !== null && e.batch !== batch)) continue;
    const f = byId.get(e.id);
    const c = f ? centroid(f.geometry) : null;
    if (!c) continue;
    rows.push({ site_id: e.id, lat: Number(c.lat.toFixed(6)), lon: Number(c.lon.toFixed(6)), shade_on_path: "", canopy_class: "", path_in_use: "", photo_id: "", notes: "", observer: "", date: "" });
  }
  return rows;
}

/** The four tiles above the plan table: [{ label, value, unit, note }]. */
export function planTiles(counts) {
  return [
    { label: "In the plan", value: String(counts.total), unit: "sites", note: "your shortlist" },
    { label: "Needs inspection", value: String(counts.by["needs-inspection"]), unit: "", note: "to walk first" },
    { label: "Approved", value: String(counts.by.approved), unit: "", note: "recorded by you" },
    { label: "Planted", value: String(counts.by.planted), unit: "", note: "recorded by you" },
  ];
}
