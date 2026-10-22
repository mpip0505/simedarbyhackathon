// "Which combination covers the most?": a constraint-aware shortlist for a fixed inspection capacity. Pure functions, no DOM.
// Taking the top k scores can pick sites that sit next to each other and reach the same footpath, homes and corridor gaps. This picks, one at a
// time, the site that adds the most NOT-yet-reached footpath, homes or gap (greedy marginal reach, over ml/reports/reach_sets.json), from the
// highest-priority sites only, leaving out sites the planner rejected. Greedy is within about 63% of the best possible set for this kind of
// coverage objective and is usually much closer; it is "best" only against this proxy objective, never environmentally optimal.
// The ranking itself is unchanged: this is a third way to choose a first round, beside Ranked and Spread out.

export const OBJECTIVES = [
  { key: "footpath", label: "Footpath with little tree cover", index: 0 },
  { key: "homes", label: "Mapped homes nearby", index: 1 },
  { key: "gaps", label: "Corridor gaps (approximate)", index: 2 },
  { key: "balanced", label: "All three, equally weighted", index: null },
];
export const CAPACITIES = [5, 10, 25, 50];
export const POOL = 100;            // choose among this many highest-priority sites, so priority still matters
export const MAX_PER_BLOCK = 3;     // the Spread out rule from ml/shortlist.py

const usable = (reachSets) => Boolean(reachSets?.sites && reachSets.stale === false);

/** The gain of adding one site's sets to what is already covered, for the objective. Balanced counts each kind as a share of its township total. */
function gain(sets, covered, objective, totals) {
  const fresh = [0, 1, 2].map((i) => { let n = 0; for (const x of sets[i]) if (!covered[i].has(x)) n += 1; return n; });
  if (objective === "balanced") {
    const denom = [totals.footpath_samples, totals.homes, totals.gap_samples];
    return fresh.reduce((a, n, i) => a + (denom[i] ? n / denom[i] : 0), 0);
  }
  return fresh[OBJECTIVES.find((o) => o.key === objective).index];
}

/**
 * Greedy best-coverage choice of k sites. ranked: features in current rank order; exclude: Set of site ids to leave out (rejected ones).
 * Returns { ids, gains, pool, short } or null when reach data is missing or stale. Ties go to the better-ranked site.
 * Once nothing new can be reached, the remaining picks follow rank order (gain 0), so k sites are always returned when the pool allows.
 */
export function bestCoverage(reachSets, ranked, k, objective = "balanced", { exclude = new Set(), pool = POOL } = {}) {
  if (!usable(reachSets)) return null;
  const candidates = ranked.map((f) => f.properties.site_id).filter((id) => !exclude.has(id) && reachSets.sites[id]).slice(0, pool);
  const covered = [new Set(), new Set(), new Set()];
  const ids = [], gains = [];
  const left = new Set(candidates);
  while (ids.length < k && left.size) {
    let best = null, bestGain = -1;
    for (const id of candidates) {                 // rank order, so the first of equal gains wins
      if (!left.has(id)) continue;
      const g = gain(reachSets.sites[id], covered, objective, reachSets.totals);
      if (g > bestGain) { best = id; bestGain = g; }
    }
    left.delete(best);
    ids.push(best);
    gains.push(bestGain);
    reachSets.sites[best].forEach((s, i) => { for (const x of s) covered[i].add(x); });
  }
  return { ids, gains, pool: candidates.length, short: ids.length < k };
}

/** The first k ranked sites, leaving out excluded ones. */
export function topRanked(ranked, k, exclude = new Set()) {
  return ranked.map((f) => f.properties.site_id).filter((id) => !exclude.has(id)).slice(0, k);
}

/** Spread out, as ml/shortlist.py does it: walk the rank order, skip a site once its 250 m block holds maxPerBlock picks. */
export function spreadOut(ranked, k, exclude = new Set(), maxPerBlock = MAX_PER_BLOCK) {
  const perBlock = new Map(), out = [];
  for (const f of ranked) {
    const { site_id: id, block_id: block } = f.properties;
    if (exclude.has(id)) continue;
    const n = perBlock.get(block) ?? 0;
    if (block && n >= maxPerBlock) continue;
    perBlock.set(block, n + 1);
    out.push(id);
    if (out.length >= k) break;
  }
  return out;
}

/** Mean score of the chosen sites, so the table can show what priority a choice gives up. */
export function meanScore(ids, byId) {
  const s = ids.map((id) => byId.get(id)?.properties.score_total).filter(Number.isFinite);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

/** "+42%" style change of a over b, or null when b is zero or either is missing. */
export function relativeGain(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return Math.round((100 * (a - b)) / b);
}
