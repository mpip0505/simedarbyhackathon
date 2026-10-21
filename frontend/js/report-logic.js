// Wording and numbers for the before/after view. Pure functions, no DOM.
// The honest reading of the data lives here: canopy change is within noise, temperature change is indicative only.
import { fmt } from "./scale.js";

export const METRIC_TITLES = { ndvi: "Greenness (satellite)", lst: "Ground heat (satellite)" };
export const METHOD_LABELS = {
  esa_worldcover_2021: "ESA WorldCover (2021 map)",
  dynamic_world_same_window: "Google Dynamic World (same window)",
  ours: "Our satellite greenness estimate",
};
export const WINDOW_LABELS = { baseline: "Earlier period", latest: "Recent period" };
const FALLBACK_NOISE_POINTS = 5; // measured year-to-year swing of the canopy proxy, used if the yearly series is missing

/** Spread (max minus min) of the yearly canopy values, or null with fewer than two. */
export function noiseRange(series) {
  const values = (series?.points ?? []).map((p) => p.canopy_pct).filter(Number.isFinite);
  return values.length > 1 ? Math.max(...values) - Math.min(...values) : null;
}

/** Is the baseline-to-latest canopy change bigger than the year-to-year swing? */
export function canopyVerdict(deltaPoints, series) {
  const noise = noiseRange(series) ?? FALLBACK_NOISE_POINTS;
  if (Math.abs(deltaPoints) <= noise) {
    return {
      label: "No detectable change",
      detail: `The difference is within the year-to-year swing of about ${fmt(noise, 0)} percentage points.`,
      withinNoise: true,
    };
  }
  return {
    label: "Larger than the year-to-year swing",
    detail: "Check the independent maps below before relying on this.",
    withinNoise: false,
  };
}

/** The plain-language question and answer at the top of the before/after screen. */
export function reportHeadline(deltaPoints, series) {
  return canopyVerdict(deltaPoints, series).withinNoise
    ? "Has tree cover changed? Not detectably so far."
    : "Has tree cover changed? The difference is larger than the usual swing, so check the other maps first.";
}

/** "4% to 28%": the spread of the canopy estimates across methods, whole numbers. Null if there is nothing to compare. */
export function rangeSummary(rows) {
  const values = rows.map((r) => r.pct).filter(Number.isFinite);
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  return { min: lo, max: hi, text: `${Math.round(lo)}% to ${Math.round(hi)}%` };
}

export const TEMPERATURE_NOTE =
  "Indicative only: each period pools different clear days and seasons, and satellite ground heat is for ranking, not exact values.";

/** Rows for the comparison table: every reference map plus our own proxy, for both windows. */
export function crosscheckRows(crosscheck, summary) {
  const rows = (crosscheck?.rows ?? []).map((r) => ({
    method: METHOD_LABELS[r.reference] ?? r.reference, window: r.window, pct: r.reference_tree_pct,
  }));
  if (summary) {
    rows.push({ method: METHOD_LABELS.ours, window: "baseline", pct: summary.baseline.canopy_pct });
    rows.push({ method: METHOD_LABELS.ours, window: "latest", pct: summary.latest.canopy_pct });
  }
  return rows;
}

/** One-sentence headline: how far apart the estimates are. Null if there is nothing to compare. */
export function disagreementHeadline(rows) {
  const values = rows.map((r) => r.pct).filter(Number.isFinite);
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  if (!(lo > 0)) return `Estimates range from ${fmt(lo)}% to ${fmt(hi)}%.`;
  return `Estimates range from ${fmt(lo)}% to ${fmt(hi)}%, about ${fmt(hi / lo, 0)} times apart, so canopy share is uncertain.`;
}
