// "What the top sites reach": plain wording for ml/reports/impact_reach.json (GET /ml/impact). Pure functions, no DOM.
// It is REACH, never outcome: it counts footpath, homes and corridor gaps that lie near the chosen sites. It does not say planting there
// would cool, improve health or survive, and the sites are simulated.

export const IMPACT_STEPS = [10, 20, 50, 100];

const num = (n) => Math.round(n).toLocaleString("en-GB");
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v)}%` : "–");

/** The report's row for the first n sites, or null when the report has none. */
export function impactRow(report, n) {
  return report?.rows?.find((r) => r.n === n) ?? null;
}

/** Steps worth offering: IMPACT_STEPS that the report actually has, in order. */
export function availableSteps(report) {
  return IMPACT_STEPS.filter((n) => impactRow(report, n));
}

/** One sentence for the card, from the township-wide shares (the sober numbers, not the share of what is reachable). */
export function impactHeadline(report, n) {
  const r = impactRow(report, n);
  if (!r) return null;
  return `The first ${n} sites are within 50 m of about ${num(r.unshaded_path_m)} m of footpath where the satellite sees little tree cover (${pct(r.unshaded_path_pct_of_township)} of the township's), `
    + `and within 250 m of ${num(r.homes)} mapped homes (${pct(r.homes_pct_of_township)}).`;
}

/** The three tiles: [{ label, value, unit, note }] for the strip. */
export function impactTiles(report, n) {
  const r = impactRow(report, n);
  if (!r) return [];
  const t = report.totals, c = report.ceiling;
  return [
    { label: "Footpath with little tree cover", value: num(r.unshaded_path_m), unit: "m",
      note: `${pct(r.unshaded_path_pct_of_township)} of the township's ${num(t.unshaded_path_m)} m; ${pct(r.unshaded_path_pct_of_reachable)} of the ${num(c.unshaded_path_m)} m any site can reach` },
    { label: "Mapped homes", value: num(r.homes), unit: "",
      note: `${pct(r.homes_pct_of_township)} of ${num(t.homes)} mapped homes; ${pct(r.homes_pct_of_reachable)} of the ${num(c.homes)} any site can reach` },
    { label: "Corridor gaps (approximate)", value: num(r.gap_m), unit: "m",
      note: `${pct(r.gap_pct_of_corridor_gaps)} of about ${num(t.gap_m)} m of gap; ${pct(r.gap_pct_of_reachable)} of the ${num(c.gap_m)} m any site can reach` },
  ];
}

export const IMPACT_CAPTION = "This counts what lies near the sites. It does not show that planting there would cool anything, improve health or survive. "
  + "The sites are simulated, and the ranking uses the default weights, not your slider settings. Homes are the ones OpenStreetMap maps, so the count is a lower bound. "
  + "Most footpath in the data falls below the tree-cover threshold at 10 m (pavement and trees mix in one pixel), so the footpath figure is close to footpath near the sites.";
