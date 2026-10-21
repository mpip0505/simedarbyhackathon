// Plain wording for the ML team's extra evidence (/ml/uncertainty, /ml/shortlist, /ml/scenario). Pure functions, no DOM.
// None of these are needed to rank: when a report is missing the screen simply leaves that part out.
import { fmt, fmtPct } from "./scale.js";

const count = (n) => Number(n).toLocaleString("en-GB");

/**
 * How steady one site's rank is across the ML Monte Carlo (many plausible weightings and model settings).
 * Returns null when there is no report or no row for the site, else { kind, label, chip, detail }.
 * kind: "steady" (in the top k in at least the robust share of draws), "fence" (inside the boundary range) or "rare".
 */
export function steadiness(uncertainty, siteId) {
  const row = uncertainty?.sites?.[siteId];
  if (!row || !Number.isFinite(row.topk_frequency)) return null;
  const k = uncertainty.k ?? 20;
  const robust = uncertainty.robust_threshold ?? 0.8;
  const low = uncertainty.boundary_range?.[0] ?? 0.2;
  const share = row.topk_frequency;
  const kind = share >= robust ? "steady" : share >= low ? "fence" : "rare";
  const label = { steady: `Steady top-${k} pick`, fence: `On the fence for the top ${k}`, rare: `Rarely in the top ${k}` }[kind];
  const chip = { steady: "chip chip-ok", fence: "chip chip-warn", rare: "chip chip-dot" }[kind];
  const range = row.rank_p05 === row.rank_p95 ? `#${row.rank_p05} every time` : `between #${row.rank_p05} and #${row.rank_p95}`;
  const detail = `Across ${count(uncertainty.draws ?? 0)} plausible weightings and model settings it ranked ${range}`
    + ` (typically #${row.rank_median}), and was in the top ${k} in ${fmtPct(100 * share, 0)} of them.`;
  return { kind, label, chip, detail, row };
}

/** One sentence for the strip / list: how many of the default top k are steady. */
export function steadySummary(uncertainty) {
  if (!uncertainty || !Number.isFinite(uncertainty.robust_count)) return null;
  return `${uncertainty.robust_count} of the top ${uncertainty.k ?? 20} stay there in at least ${fmtPct(100 * (uncertainty.robust_threshold ?? 0.8), 0)} of ${count(uncertainty.draws ?? 0)} plausible settings.`;
}

/** The shortlist's sites, in its order, as the current features (sites the page does not know are dropped). */
export function shortlistRows(shortlist, byId) {
  return (shortlist?.diversified_sites ?? []).map((s) => byId.get(s.site_id)).filter(Boolean);
}

/** The note under the list when the spread-out shortlist is on. */
export function shortlistNote(shortlist) {
  if (!shortlist?.diversified || !shortlist?.raw_top_k) return "";
  const { raw_top_k: raw, diversified: div } = shortlist;
  return `The top ${div.n} with at most ${shortlist.max_per_block} per 250 m block, so a first round reaches ${div.distinct_blocks} areas `
    + `instead of ${raw.distinct_blocks}. It gives up ${fmt(shortlist.score_given_up)} point of average score.`;
}

/**
 * Lines for the scenario chart: [{ key, label, values }] in drawing order, plus the axis maximum.
 * The scenario is the planted sites' own average canopy under named growth assumptions, never a forecast.
 */
export function scenarioSeries(scenario) {
  const years = scenario?.years ?? [];
  const t = scenario?.trajectories ?? {};
  if (years.length < 2 || !t.default) return null;
  const lines = [
    { key: "nothing", label: "Doing nothing", values: years.map(() => scenario.do_nothing_pct) },
    ...["slow", "default", "fast"].filter((k) => t[k]?.length === years.length).map((k) => ({
      key: k,
      label: `${k === "default" ? "Middle" : k[0].toUpperCase() + k.slice(1)} growth (90% of the way in ${fmt(scenario.growth_scenarios_years_to_90pct?.[k], 0)} years)`,
      values: t[k],
    })),
  ];
  const vmax = Math.max(scenario.ceiling_pct ?? 0, ...lines.flatMap((l) => l.values));
  return { years, lines, vmax };
}

/** The scenario headline: where the middle assumption ends up against doing nothing. */
export function scenarioHeadline(scenario) {
  const end = scenario?.end_of_horizon?.default;
  const years = scenario?.years ?? [];
  if (!Number.isFinite(end) || !years.length) return "";
  return `Planting the top ${scenario.k} sites could take their tree cover from ${fmtPct(scenario.start_pct)} to about ${fmtPct(end)} in `
    + `${years[years.length - 1]} years, if trees grow at the middle speed. Doing nothing leaves it at ${fmtPct(scenario.do_nothing_pct)}.`;
}
