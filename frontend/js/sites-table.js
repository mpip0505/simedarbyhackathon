// The Sites table: which columns it has, how rows are filtered and sorted. Pure functions, no DOM (js/sites.js draws it).
import { fmt, fmtC, fmtMetres, fmtPct } from "./scale.js";
import { SCORE_LABELS, MOSTLY_ESTIMATED } from "./drivers.js";

/**
 * One entry per column: key, label, how to read the value from a site's properties, how to show it, and the direction a first
 * click sorts in (numbers that mean "more is better" start high to low, names and ranks start low to high).
 */
export const COLUMNS = [
  { key: "rank", label: "Rank", value: (p) => p.rank, text: (v) => String(v), first: "asc", num: true },
  { key: "site", label: "Site", value: (p) => p.site_id, text: String, first: "asc" },
  { key: "origin", label: "Origin", value: (p) => p.origin, text: (v) => ORIGIN_LABELS[v] ?? String(v), first: "asc" },
  { key: "score", label: "Score", value: (p) => p.score_total, text: (v) => fmt(v), first: "desc", num: true },
  { key: "cooling", label: SCORE_LABELS.cooling, value: (p) => p.score_cooling, text: (v) => fmt(v), first: "desc", num: true },
  { key: "connectivity", label: SCORE_LABELS.connectivity, value: (p) => p.score_connectivity, text: (v) => fmt(v), first: "desc", num: true },
  { key: "shade", label: SCORE_LABELS.shade, value: (p) => p.score_shade, text: (v) => fmt(v), first: "desc", num: true },
  { key: "heat", label: "Ground heat, 250 m", value: (p) => p.lst_mean_250m, text: (v) => fmtC(v), first: "desc", num: true },
  { key: "gap", label: "Corridor gap", value: (p) => p.corridor_gap_dist_m, text: (v) => fmtMetres(v), first: "asc", num: true },
  { key: "measured", label: "Heat measured", value: (p) => p.lst_valid_frac, text: (v) => fmtPct(100 * v, 0), first: "asc", num: true },
];

export const ORIGIN_LABELS = { open_land: "Open land", corridor_edge: "Corridor edge" };

/** Is this site's ground heat mostly filled in from neighbours rather than measured? (same rule as the site card) */
export const mostlyEstimated = (p) => Number.isFinite(p.lst_valid_frac) && p.lst_valid_frac < MOSTLY_ESTIMATED;

/** Sites that match an origin ("all" or a name) and a search on the site id. Order is kept. */
export function filterSites(features, { origin = "all", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return features.filter((f) => (origin === "all" || f.properties.origin === origin) && (!q || f.properties.site_id.toLowerCase().includes(q)));
}

/** A sorted copy. Text sorts naturally (ELM-9 before ELM-10); a missing number goes last whichever way you sort. */
export function sortSites(features, key, dir) {
  const col = COLUMNS.find((c) => c.key === key) ?? COLUMNS[0];
  const sign = dir === "desc" ? -1 : 1;
  const missing = (v) => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
  return [...features].sort((a, b) => {
    const x = col.value(a.properties), y = col.value(b.properties);
    if (missing(x) || missing(y)) return missing(x) === missing(y) ? 0 : missing(x) ? 1 : -1;
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
    return order * sign || a.properties.rank - b.properties.rank;       // ties keep the ranking's order
  });
}

/** What a click on a column heading does: the same column flips direction, a new column starts in its own first direction. */
export function nextSort(current, key) {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: (COLUMNS.find((c) => c.key === key) ?? COLUMNS[0]).first };
}
