// Reading a completed field sheet back into the app. The sheet is the blind one the app (or backend/field_sheet.py) writes: place only, with three
// answers to fill in. Everything is checked row by row with a clear message; a bad file is refused whole rather than half-used.
// Comparing an observation with the model is a plain rule, not a validation: it says "the model's proxy and the walker agree" or "differ", nothing more.
// Pure functions, no DOM.
import { FIELD_SHEET_COLUMNS } from "./plan.js";

export const SHADE = ["none", "partial", "full"];
export const CANOPY = ["none", "sparse", "moderate", "dense"];
export const YESNO = ["yes", "no"];
export const REQUIRED_ANSWERS = ["shade_on_path", "canopy_class", "path_in_use"];
export const MAX_ROWS = 1000;
export const MAX_FILE_CHARS = 1_000_000;

/** CSV text to rows of cells (quotes, doubled quotes, commas and line breaks inside quotes, a leading byte-order mark). Blank lines are dropped. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false, closed = false;
  const src = String(text).replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = false; closed = true; } } else cell += ch;
    } else if (ch === '"') { if (cell || closed) throw new Error("Unexpected quote in CSV cell"); quoted = true; }
    else if (ch === ",") { row.push(cell); cell = ""; closed = false; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      closed = false;
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else { if (closed && ch.trim()) throw new Error("Text after closing CSV quote"); if (!closed) cell += ch; }
  }
  if (quoted) throw new Error("Unclosed quote in CSV");
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * Check a completed sheet against the plan. Returns { ok, problems, entries, insufficient, ignored }:
 *  - entries: valid observations, one per site, as { site_id, line, shade_on_path, canopy_class, path_in_use, photo_id, notes, observer, date }
 *  - insufficient: rows where one of the three answers is blank (kept out of the comparison, never guessed)
 *  - problems: anything that makes the file unusable (missing columns, unknown or repeated sites, sites not in the plan, answers outside the allowed words, bad dates)
 * ok is true only when there are no problems and at least one usable entry.
 */
export function readFieldSheet(text, { knownIds, planIds }) {
  const problems = [];
  if (typeof text !== "string" || text.length > MAX_FILE_CHARS) return { ok: false, problems: ["The file is empty or too large (limit about 1 MB)."], entries: [], insufficient: [], ignored: 0 };
  let rows;
  try { rows = parseCsv(text); } catch (e) { return { ok: false, problems: [e.message], entries: [], insufficient: [], ignored: 0 }; }
  if (!rows.length) return { ok: false, problems: ["The file has no rows."], entries: [], insufficient: [], ignored: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (new Set(header).size !== header.length) return { ok: false, problems: ["Duplicate CSV column names are not allowed."], entries: [], insufficient: [], ignored: 0 };
  const missing = FIELD_SHEET_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { ok: false, problems: [`Missing column(s): ${missing.join(", ")}. Use the field sheet the app or the script wrote.`], entries: [], insufficient: [], ignored: 0 };
  if (rows.length - 1 > MAX_ROWS) return { ok: false, problems: [`More than ${MAX_ROWS} rows.`], entries: [], insufficient: [], ignored: 0 };
  const col = Object.fromEntries(FIELD_SHEET_COLUMNS.map((c) => [c, header.indexOf(c)]));
  const get = (r, c) => String(r[col[c]] ?? "").trim();
  const seen = new Set(), entries = [], insufficient = [];
  let ignored = 0;
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (r.length !== header.length) { problems.push(`row ${line}: ${r.length} cells; expected ${header.length}`); return; }
    const id = get(r, "site_id");
    if (!id) { ignored += 1; return; }
    if (!knownIds.has(id)) { problems.push(`row ${line}: unknown site ${id}`); return; }
    if (!planIds.has(id)) { problems.push(`row ${line}: ${id} is not in your planting plan`); return; }
    if (seen.has(id)) { problems.push(`row ${line}: ${id} appears more than once`); return; }
    seen.add(id);
    const a = { shade_on_path: get(r, "shade_on_path").toLowerCase(), canopy_class: get(r, "canopy_class").toLowerCase(), path_in_use: get(r, "path_in_use").toLowerCase() };
    const blanks = REQUIRED_ANSWERS.filter((k) => a[k] === "");
    const date = get(r, "date");
    let bad = false;
    for (const [k, allowed] of [["shade_on_path", SHADE], ["canopy_class", CANOPY], ["path_in_use", YESNO]]) {
      if (a[k] !== "" && !allowed.includes(a[k])) { problems.push(`row ${line}: ${k} '${a[k]}' must be one of ${allowed.join(", ")}`); bad = true; }
    }
    if (date && !validDate(date)) { problems.push(`row ${line}: date '${date}' must look like 2026-10-24`); bad = true; }
    if (bad) return;
    if (blanks.length) { insufficient.push({ site_id: id, line, missing: blanks }); return; }
    entries.push({ site_id: id, line, ...a, photo_id: get(r, "photo_id").slice(0, 60), notes: get(r, "notes").slice(0, 280), observer: get(r, "observer").slice(0, 60), date });
  });
  const shown = problems.length > 12 ? [...problems.slice(0, 12), `and ${problems.length - 12} more`] : problems;
  return { ok: problems.length === 0 && entries.length > 0, problems: shown, entries, insufficient, ignored };
}

/**
 * Compare one valid observation with what the model's measurements say about the site (its properties from the API).
 * The model's proxy: little tree cover on the nearby footpath, and low baseline tree cover. Returns { outcome: "agree" | "disagree" | "insufficient", differences: [] }.
 * Agreement means the proxy and the walker agree on this one visit; it is not validation.
 */
export function compareObservation(obs, p) {
  const differences = [];
  const finite = (v) => typeof v === "number" && Number.isFinite(v);
  const pathKnown = finite(p?.path_length_within_50m) && p.path_length_within_50m > 0 && finite(p?.path_canopy_frac_50m) && p.path_canopy_frac_50m >= 0 && p.path_canopy_frac_50m <= 1 && SHADE.includes(obs?.shade_on_path);
  const canopyKnown = finite(p?.canopy_pct_baseline) && p.canopy_pct_baseline >= 0 && p.canopy_pct_baseline <= 100 && CANOPY.includes(obs?.canopy_class);
  if (pathKnown) {
    const expected = p.path_canopy_frac_50m <= 0.33 ? "none" : p.path_canopy_frac_50m >= 0.67 ? "full" : "partial";
    // Partial shade is too ambiguous to contradict a low/high proxy. Opposite extremes do contradict it.
    if ((expected === "none" && obs.shade_on_path === "full") || (expected === "full" && obs.shade_on_path === "none")) differences.push(`Model: ${expected === "none" ? "little tree cover on the nearby footpath" : "high tree cover on the nearby footpath"}. Seen: ${obs.shade_on_path} shade.`);
  }
  if (canopyKnown) {
    const expected = p.canopy_pct_baseline < 25 ? "low" : p.canopy_pct_baseline >= 75 ? "high" : "middle";
    const seen = ["none", "sparse"].includes(obs.canopy_class) ? "low" : obs.canopy_class === "dense" ? "high" : "middle";
    if ((expected === "low" && seen !== "low") || (expected === "high" && seen === "low")) differences.push(`Model: ${expected === "low" ? "low" : "high"} earlier-period tree cover around the site. Seen: ${obs.canopy_class} tree cover.`);
  }
  const pathMatches = pathKnown && obs.shade_on_path === (p.path_canopy_frac_50m <= 0.33 ? "none" : p.path_canopy_frac_50m >= 0.67 ? "full" : "partial");
  const canopyMatches = canopyKnown && (p.canopy_pct_baseline < 25 ? ["none","sparse"].includes(obs.canopy_class) : p.canopy_pct_baseline >= 75 ? obs.canopy_class === "dense" : obs.canopy_class === "moderate");
  const ambiguous = !pathMatches || !canopyMatches;
  return { outcome: differences.length ? "disagree" : !pathKnown || !canopyKnown || ambiguous ? "insufficient" : "agree", differences };
}

/** Counts for the message after an import. */
export function summariseImport(results) {
  const agree = results.filter((r) => r.outcome === "agree").length;
  return { total: results.length, agree, disagree: results.filter((r) => r.outcome === "disagree").length, insufficient: results.filter((r) => r.outcome === "insufficient").length };
}
