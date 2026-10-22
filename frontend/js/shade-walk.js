// Timed shade walks: the measurement that can fill the exposure calculator's baseline. A person walks a route with a stopwatch and records how many
// minutes of the walk were in shade. Pooled over several walks and routes that gives a measured share of walking time in shade for TODAY. It says nothing
// about the shade after planting (that stays an assumption) and nothing about who walks where (that needs route-use counts). Pure functions, no DOM.
import { safeCell } from "./plan.js";

export const WALK_COLUMNS = ["walk_id", "route_id", "date", "start_time", "weather", "participant_type", "walking_minutes", "shaded_minutes", "notes"];
export const PARTICIPANT_TYPES = ["resident", "proxy", "team"];
export const MIN_WALKS = 5;
export const MIN_ROUTES = 2;
export const MAX_WALKS = 500;
const MAX_MINUTES = 240;

export const WALK_NOTE = "A timed walk measures the share of one route that was in shade, at that time of day and in that weather; both change it. It measures today's baseline only: "
  + "the share after planting stays an assumption until the same routes are walked again. Walks by team members or proxies are not residents' experience, so label them as such.";

const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const validTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Blank rows for a walk sheet: a route name for each place to walk (for example near a shortlisted site), `walksPerRoute` rows each, answers left empty. */
export function blankWalkSheet(routeNames, walksPerRoute = 2) {
  const rows = [];
  let n = 1;
  for (const route of routeNames) {
    for (let i = 0; i < walksPerRoute; i++) {
      rows.push({ walk_id: `W${String(n++).padStart(2, "0")}`, route_id: safeCell(route), date: "", start_time: "", weather: "", participant_type: "", walking_minutes: "", shaded_minutes: "", notes: "" });
    }
  }
  return rows;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const src = String(text).replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false; } else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i += 1; row.push(cell); cell = ""; if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Read a completed walk sheet. Returns { ok, problems, walks, blank }:
 *  - walks: valid walks { walk_id, route_id, date, start_time, weather, participant_type, walking_minutes, shaded_minutes, notes }
 *  - blank: rows left empty on purpose (no minutes at all), kept out and counted, never guessed
 *  - problems: anything that makes the file unusable, with the row number. A bad file is refused whole (ok is false), like the field-sheet import.
 */
export function readWalkSheet(text) {
  if (typeof text !== "string" || !text.trim() || text.length > 1_000_000) return { ok: false, problems: ["The file is empty or too large (limit about 1 MB)."], walks: [], blank: 0 };
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = WALK_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { ok: false, problems: [`Missing column(s): ${missing.join(", ")}. Use the walk sheet the app wrote.`], walks: [], blank: 0 };
  if (rows.length - 1 > MAX_WALKS) return { ok: false, problems: [`More than ${MAX_WALKS} rows.`], walks: [], blank: 0 };
  const col = Object.fromEntries(WALK_COLUMNS.map((c) => [c, header.indexOf(c)]));
  const get = (r, c) => String(r[col[c]] ?? "").trim();
  const problems = [], walks = [], seen = new Set();
  let blank = 0;
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const id = get(r, "walk_id"), walking = get(r, "walking_minutes"), shaded = get(r, "shaded_minutes");
    if (!walking && !shaded && !get(r, "date")) { blank += 1; return; }
    const bad = (msg) => problems.push(`row ${line}: ${msg}`);
    if (!id || id.length > 20) return bad("walk_id is missing or too long");
    if (seen.has(id)) return bad(`walk_id ${id} appears more than once`);
    seen.add(id);
    const route = get(r, "route_id");
    if (!route || route.length > 60) bad("route_id is missing or too long");
    const date = get(r, "date");
    if (!validDate(date)) bad(`date '${date}' must look like 2026-11-02`);
    const time = get(r, "start_time");
    if (time && !validTime(time)) bad(`start_time '${time}' must look like 09:30`);
    const type = get(r, "participant_type").toLowerCase();
    if (!PARTICIPANT_TYPES.includes(type)) bad(`participant_type '${type}' must be one of ${PARTICIPANT_TYPES.join(", ")}`);
    const w = Number(walking), s = Number(shaded);
    if (!walking || !Number.isFinite(w) || w <= 0 || w > MAX_MINUTES) bad(`walking_minutes '${walking}' must be a number above 0 and at most ${MAX_MINUTES}`);
    else if (shaded === "" || !Number.isFinite(s) || s < 0) bad(`shaded_minutes '${shaded}' must be a number, 0 or more`);
    else if (s > w) bad(`shaded_minutes (${s}) is more than walking_minutes (${w})`);
    if (problems.length && problems[problems.length - 1].startsWith(`row ${line}:`)) return;
    walks.push({ walk_id: id, route_id: route.slice(0, 60), date, start_time: time, weather: get(r, "weather").slice(0, 40), participant_type: type, walking_minutes: w, shaded_minutes: s, notes: get(r, "notes").slice(0, 200) });
  });
  const shown = problems.length > 12 ? [...problems.slice(0, 12), `and ${problems.length - 12} more`] : problems;
  return { ok: problems.length === 0 && walks.length > 0, problems: problems.length || walks.length ? shown : ["No row had any walking minutes."], walks, blank };
}

const pct1 = (n, d) => (d > 0 ? Math.round((1000 * n) / d) / 10 : null);

/** Summary of valid walks: pooled share of walking time in shade, per route and per participant type, date range, and whether there are enough to use as a baseline. */
export function summariseWalks(walks) {
  if (!walks?.length) return { n: 0, routes: 0, enough: false, why: "No walks yet." };
  const walking = walks.reduce((a, w) => a + w.walking_minutes, 0), shaded = walks.reduce((a, w) => a + w.shaded_minutes, 0);
  const byRoute = new Map(), byType = new Map();
  for (const w of walks) {
    for (const [map, key] of [[byRoute, w.route_id], [byType, w.participant_type]]) {
      const cur = map.get(key) ?? { n: 0, walking: 0, shaded: 0 };
      cur.n += 1; cur.walking += w.walking_minutes; cur.shaded += w.shaded_minutes;
      map.set(key, cur);
    }
  }
  const shares = walks.map((w) => pct1(w.shaded_minutes, w.walking_minutes));
  const dates = walks.map((w) => w.date).sort();
  const routes = byRoute.size;
  const enough = walks.length >= MIN_WALKS && routes >= MIN_ROUTES;
  return {
    n: walks.length, routes, walkingMinutes: Math.round(walking * 10) / 10, shadedMinutes: Math.round(shaded * 10) / 10,
    pooledShadePct: pct1(shaded, walking), minShadePct: Math.min(...shares), maxShadePct: Math.max(...shares),
    from: dates[0], to: dates[dates.length - 1],
    byRoute: [...byRoute.entries()].map(([route, v]) => ({ route, n: v.n, shadePct: pct1(v.shaded, v.walking) })).sort((a, b) => a.route.localeCompare(b.route)),
    byType: Object.fromEntries([...byType.entries()].map(([k, v]) => [k, v.n])),
    enough,
    why: enough ? "" : `Too few to use as a baseline: ${walks.length} walk${walks.length === 1 ? "" : "s"} on ${routes} route${routes === 1 ? "" : "s"}; at least ${MIN_WALKS} walks on ${MIN_ROUTES} routes are needed.`,
  };
}

/** One sentence recording where a baseline shade share came from, for the exposure scenario's "source or basis" box. */
export function baselineBasis(s) {
  const types = Object.entries(s.byType).map(([k, v]) => `${v} ${k}`).join(", ");
  return `Timed shade walks: ${s.n} walks on ${s.routes} routes, ${s.from}${s.to !== s.from ? ` to ${s.to}` : ""}; ${types}; pooled shade share ${s.pooledShadePct}% of ${s.walkingMinutes} walking minutes.`;
}

const KEY = "elmina-shade-walks-v1";

/** Imported walks kept on this device (their own storage key), with the last import message. */
export function createWalks(storage) {
  let state = { walks: [], note: "" };
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? "null");
    const check = raw && Array.isArray(raw.walks) ? readWalkSheet(toCsv(raw.walks)) : null;
    if (check?.ok) state = { walks: check.walks, note: typeof raw.note === "string" ? raw.note.slice(0, 300) : "" };
  } catch { /* start empty */ }
  const listeners = new Set();
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* session only */ } for (const fn of listeners) fn(); };
  return {
    get: () => ({ walks: state.walks.map((w) => ({ ...w })), note: state.note }),
    set(walks, note = "") { state = { walks, note: String(note).slice(0, 300) }; save(); },
    clear() { state = { walks: [], note: "" }; save(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** Rows back to CSV text (used to re-validate stored walks with the same rules as an import). */
function toCsv(walks) {
  const cell = (v) => { const t = String(v ?? ""); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [WALK_COLUMNS.join(","), ...walks.map((w) => WALK_COLUMNS.map((c) => cell(w[c])).join(","))].join("\r\n");
}
