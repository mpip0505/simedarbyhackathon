// "Compare ways to choose the first sites": wording and rows for ml/reports/tradeoff.json (GET /ml/tradeoff). Pure functions, no DOM.
// A trade-off, never a league table: each list is good at what it aims for, and the planner chooses what matters.

export const TRADEOFF_STEPS = [20, 50];

export const METHOD_ORDER = ["heat_only", "canopy_gap_only", "heat_and_gap", "ours", "spread_out"];
export const METHOD_NAMES = {
  heat_only: "Hottest surroundings only",
  canopy_gap_only: "Least green surroundings only",
  heat_and_gap: "Heat and least green, equal weight",
  ours: "Our default weights",
  spread_out: "Spread out (default, at most 3 per block)",
};

export const MEASURES = [
  { key: "unshaded_path_m", pct: "unshaded_path_pct", label: "Footpath without tree cover", unit: "m" },
  { key: "homes", pct: "homes_pct", label: "Mapped homes", unit: "" },
  { key: "gap_m", pct: "gap_pct", label: "Corridor gap (approximate)", unit: "m" },
];

const num = (n) => Math.round(n).toLocaleString("en-GB");

/** Steps the report has, in order. */
export function tradeoffSteps(report) {
  return TRADEOFF_STEPS.filter((k) => report?.results?.[String(k)]);
}

/** Rows for one step: [{ key, name, areas, heat, measures: [{ label, value, pct, share }] }] where share is 0 to 1 against the largest value in that measure. */
export function tradeoffRows(report, k) {
  const block = report?.results?.[String(k)];
  if (!block) return [];
  const methods = METHOD_ORDER.map((m) => (m === "ours" ? report.ours ?? "ours" : m)).filter((m) => block[m]);
  const peak = Object.fromEntries(MEASURES.map((m) => [m.key, Math.max(...methods.map((x) => block[x][m.key]), 1)]));
  return methods.map((m, i) => ({
    key: METHOD_ORDER[i] ?? m,
    name: METHOD_NAMES[METHOD_ORDER[i]] ?? m,
    areas: block[m].areas,
    heat: Math.round(block[m].hotter_than_pct),
    measures: MEASURES.map((x) => ({ label: x.label, unit: x.unit, text: `${num(block[m][x.key])}${x.unit ? " " + x.unit : ""}`, pct: block[m][x.pct], share: block[m][x.key] / peak[x.key] })),
  }));
}

export const TRADEOFF_LEAD = "Pick the first sites by heat alone and you reach the hottest ground. Weigh footpath and corridor too, as our default does, and you reach more of those. The planner chooses.";
export const TRADEOFF_CAPTION = "Reach counts what lies near the first sites; it is not a benefit. The sites are simulated. The first three lists are simplified stand-ins for published approaches, built from our own data. "
  + "Our default weights favour footpath and corridor by design, so it reaching more of them is expected, not proof that it is better.";
