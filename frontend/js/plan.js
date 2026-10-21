// The planting plan: the planner's own shortlist of sites with a status and a note for each, kept in this browser only.
// It records what the planner types. Nothing here inspects, verifies or plants anything, and nothing is sent anywhere.
// Pure logic plus a small store over an injected storage (localStorage in the app, a fake in tests). No DOM.
import { centroid } from "./csv.js";

export const STATUSES = [
  { key: "proposed", label: "Proposed" },
  { key: "needs-inspection", label: "Needs inspection" },
  { key: "inspected", label: "Inspected" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "planted", label: "Planted" },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));

export const STORAGE_KEY = "elmina-planting-plan-v1";
export const MAX_ENTRIES = 300;
export const NOTE_MAX = 280;
const SITE_ID = /^[A-Za-z0-9_-]{1,40}$/;

export const PLAN_COLUMNS = [
  { key: "site_id", label: "site_id" }, { key: "status", label: "status" }, { key: "note", label: "note" },
  { key: "rank", label: "current_rank" }, { key: "score_total", label: "current_score" }, { key: "origin", label: "origin" },
  { key: "lat", label: "lat" }, { key: "lon", label: "lon" }, { key: "source", label: "source" }, { key: "plan_note", label: "about_this_file" },
];

export const FIELD_SHEET_COLUMNS = ["site_id", "lat", "lon", "shade_on_path", "canopy_class", "path_in_use", "photo_id", "notes", "observer", "date"];

export const PLAN_CAVEAT = "These are the planner's own entries, saved on this device only. Nothing here has been inspected by this tool, and a status such as Planted only records what was typed.";

const cleanNote = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, NOTE_MAX);

/** Entries that are safe to trust from storage: a known site-id shape, a known status, a short note, no repeats, at most MAX_ENTRIES. */
export function sanitise(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || !SITE_ID.test(String(it.id)) || seen.has(it.id) || !STATUS_LABEL[it.status]) continue;
    seen.add(it.id);
    out.push({ id: it.id, status: it.status, note: cleanNote(it.note) });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

/** A plan over `storage` (anything with getItem and setItem; failures are swallowed, so the plan still works for the session). */
export function createPlan(storage) {
  let items = [];
  try { items = sanitise(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null")); } catch { items = []; }
  const listeners = new Set();
  const save = (source) => {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ v: 1, items })); } catch { /* not remembered: still fine for this visit */ }
    for (const fn of listeners) fn(source);
  };
  const find = (id) => items.find((x) => x.id === id);
  return {
    has: (id) => Boolean(find(id)),
    get: (id) => (find(id) ? { ...find(id) } : null),
    list: () => items.map((x) => ({ ...x })),
    ids: () => new Set(items.map((x) => x.id)),
    /** Add a site as Proposed; false when the id is invalid, already there, or the plan is full. */
    add(id, source) {
      if (!SITE_ID.test(String(id)) || find(id) || items.length >= MAX_ENTRIES) return false;
      items.push({ id, status: "proposed", note: "" });
      save(source);
      return true;
    },
    remove(id, source) {
      const before = items.length;
      items = items.filter((x) => x.id !== id);
      if (items.length !== before) save(source);
    },
    setStatus(id, status, source) {
      const it = find(id);
      if (it && STATUS_LABEL[status] && it.status !== status) { it.status = status; save(source); }
    },
    setNote(id, note, source) {
      const it = find(id);
      const next = cleanNote(note);
      if (it && it.note !== next) { it.note = next; save(source); }
    },
    clear(source) { if (items.length) { items = []; save(source); } },
    counts() {
      const by = Object.fromEntries(STATUSES.map((s) => [s.key, 0]));
      for (const x of items) by[x.status] += 1;
      return { total: items.length, by };
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** A spreadsheet reads a cell starting with = + - @ as a formula; a leading apostrophe stops that. */
export const safeCell = (text) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

/** One row per planned site that the current data knows, in plan order, ready for toCsv(rows, PLAN_COLUMNS). */
export function planRows(entries, byId) {
  const rows = [];
  for (const e of entries) {
    const f = byId.get(e.id);
    if (!f) continue;
    const c = centroid(f.geometry);
    rows.push({
      site_id: e.id, status: STATUS_LABEL[e.status], note: safeCell(e.note), rank: f.properties.rank, score_total: f.properties.score_total,
      origin: f.properties.origin, lat: c ? Number(c.lat.toFixed(6)) : "", lon: c ? Number(c.lon.toFixed(6)) : "",
      source: f.properties.source ?? "simulated",
      plan_note: "Planner's own entries from a screening tool; example sites (simulated); not inspected or verified.",
    });
  }
  return rows;
}

/** Rows for the blind field sheet: sites marked Needs inspection, place only (no rank or score), in the columns backend/field_checks.py reads back. */
export function fieldSheetRows(entries, byId) {
  const rows = [];
  for (const e of entries) {
    if (e.status !== "needs-inspection") continue;
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
