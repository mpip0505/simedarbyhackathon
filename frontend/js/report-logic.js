// Wording and numbers for the before/after view. Pure functions, no DOM.
// The honest reading of the data lives here: canopy change is within noise, temperature change is indicative only.
import { DASH, fmt, fmtC, fmtPct } from "./scale.js";

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

/** "2021-10 to 2022-09" becomes "2021–22": the label under each yearly bar. */
export function shortYear(label) {
  const m = /^(\d{4})-\d{2} to (\d{4})-\d{2}$/.exec(label ?? "");
  return m ? `${m[1]}–${m[2].slice(2)}` : String(label ?? "");
}

/** What hovering or focusing each yearly column says. The warmest year is flagged. */
export function yearTips(points) {
  const heat = points.map((p) => p.mean_lst_c);
  const warmest = heat.indexOf(Math.max(...heat.filter(Number.isFinite)));
  return {
    warmest,
    canopy: points.map((p) => ({
      title: shortYear(p.label),
      lines: [`Tree-cover estimate ${fmtPct(p.canopy_pct)}`,
        ...(Number.isFinite(p.canopy_pct_low) && Number.isFinite(p.canopy_pct_high) ? [`Range ${fmtPct(p.canopy_pct_low)} to ${fmtPct(p.canopy_pct_high)}`] : [])],
    })),
    heat: points.map((p, i) => ({
      title: shortYear(p.label),
      lines: [`Mean ground heat ${fmtC(p.mean_lst_c)}`, `${fmt(p.lst_clear_obs_per_pixel)} clear looks per pixel`, ...(i === warmest ? ["Warmest year"] : [])],
    })),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2021-10-01" becomes "Oct 2021". Anything else comes back unchanged. */
export function monthYear(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  const month = m ? MONTHS[Number(m[2]) - 1] : null;
  return month ? `${month} ${m[1]}` : String(iso ?? "");
}

/** "Oct 2021 to Sep 2023" for a summary window ({ start, end }). */
export const periodRange = (window) => `${monthYear(window.start)} to ${monthYear(window.end)}`;

/** A signed change: "+0.7", "−1.2" (a true minus sign) or "0.0" when it rounds to nothing. */
export function signed(value, digits = 1) {
  if (!Number.isFinite(value)) return DASH;
  const text = Math.abs(value).toFixed(digits);
  return Number(text) === 0 ? text : `${value > 0 ? "+" : "−"}${text}`;
}

/** The five tiles above the before/after maps: [{ label, value, unit, note }]. */
export function reportStats(summary, series) {
  const b = summary.baseline, l = summary.latest;
  const verdict = canopyVerdict(summary.delta_canopy_pct_points, series);
  return [
    { label: "Tree-cover estimate, earlier", value: fmt(b.canopy_pct), unit: "%", note: periodRange(b) },
    { label: "Tree-cover estimate, recent", value: fmt(l.canopy_pct), unit: "%", note: periodRange(l) },
    { label: "Change", value: signed(summary.delta_canopy_pct_points), unit: "points",
      note: verdict.withinNoise ? "within the yearly swing" : "larger than the yearly swing" },
    { label: "Ground heat, earlier", value: fmt(b.mean_lst_c), unit: "°C", note: "indicative" },
    { label: "Ground heat, recent", value: fmt(l.mean_lst_c), unit: "°C", note: `${signed(summary.delta_mean_lst_c)} °C, indicative` },
  ];
}

const SHORT_METHODS = new Map([
  [METHOD_LABELS.esa_worldcover_2021, "ESA WorldCover (2021)"],
  [METHOD_LABELS.dynamic_world_same_window, "Dynamic World"],
  [METHOD_LABELS.ours, "Ours"],
]);

/**
 * The bars in "How sure are we?": [{ label, pct, ours }], reference maps first and our own estimate last.
 * A map that gives the same number for both windows (ESA WorldCover is one 2021 map) appears once.
 */
export function compareRows(rows) {
  const out = [];
  for (const method of new Set(rows.map((r) => r.method))) {
    const own = rows.filter((r) => r.method === method && Number.isFinite(r.pct));
    const base = SHORT_METHODS.get(method) ?? method;
    const ours = method === METHOD_LABELS.ours;
    if (own.length > 1 && own.every((r) => r.pct === own[0].pct)) out.push({ label: base, pct: own[0].pct, ours });
    else for (const r of own) out.push({ label: `${base}, ${r.window === "baseline" ? "earlier" : "recent"}`, pct: r.pct, ours });
  }
  return out;
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
  return `Estimates range from ${fmt(lo)}% to ${fmt(hi)}%, about ${fmt(hi / lo, 0)} times apart, so tree-cover share is uncertain.`;
}
