// "What drives this site's rank": weighted contributions, one-line reasons and plain-language notes built from
// measured fields. Pure functions, no DOM: a redesigned interface can reuse this file unchanged.
import { normaliseWeights } from "./weights.js";
import { fmt, fmtC, fmtMetres, percentBelow } from "./scale.js";

export const SCORE_LABELS = {
  cooling: "Heat relief",
  connectivity: "Links green areas",
  shade: "Shade for walkers",
};
export const SCORE_HINTS = {
  cooling: "Favours hot, bare areas",
  connectivity: "Closes gaps in the green corridor",
  shade: "Adds shade along footpaths",
};
const NOTABLE = 66; // a site counts as "hot" or "bare" when it beats this share of the other sites
export const MOSTLY_ESTIMATED = 0.5; // below this share of measured ground heat, a site's temperature is mostly filled in from neighbours

/** The three scores with their weight share and points contributed to the total, largest contribution first. */
export function contributions(props, weights) {
  const w = normaliseWeights(weights);
  return ["cooling", "connectivity", "shade"]
    .map((key) => {
      const score = props[`score_${key}`];
      return { key, label: SCORE_LABELS[key], score, share: w[key], points: score * w[key] };
    })
    .sort((a, b) => b.points - a.points);
}

/** Reference values from all loaded sites, so notes can say "hotter than 87% of sites". */
export function buildContext(features) {
  const col = (name) => features.map((f) => f.properties[name]).filter(Number.isFinite);
  return { lst250: col("lst_mean_250m"), ndvi250: col("ndvi_mean_250m") };
}

const hotterThan = (p, ctx) => (Number.isFinite(p.lst_mean_250m) ? percentBelow(ctx.lst250, p.lst_mean_250m) : null);
const lessGreenThan = (p, ctx) =>
  Number.isFinite(p.ndvi_mean_250m) ? percentBelow(ctx.ndvi250.map((x) => -x), -p.ndvi_mean_250m) : null;

/** A short phrase (a few words) for the list: why this site ranks where it does, from its strongest score. */
export function mainReason(p, weights, ctx) {
  const top = contributions(p, weights)[0].key;
  if (top === "cooling") {
    const hot = hotterThan(p, ctx) >= NOTABLE, bare = lessGreenThan(p, ctx) >= NOTABLE;
    return hot && bare ? "hot and bare around it" : hot ? "hot surroundings" : "bare surroundings";
  }
  if (top === "connectivity") return p.corridor_gap_flag ? "next to a gap in the approximate corridor" : "close to the approximate corridor";
  return p.uncovered_path_length_50m > 0 ? "unshaded footpath nearby" : "walkers nearby";
}

/** One sentence for the site card, from what is actually notable about the site. */
export function siteHeadline(p, ctx) {
  const facts = [];
  const hot = hotterThan(p, ctx) >= NOTABLE, bare = lessGreenThan(p, ctx) >= NOTABLE;
  if (hot && bare) facts.push("hot, bare surroundings");
  else if (hot) facts.push("hot surroundings");
  else if (bare) facts.push("little greenery around it");
  if (p.uncovered_path_length_50m > 0) facts.push("a footpath with no shade");
  if (p.corridor_gap_flag) facts.push("right next to a gap in the approximate corridor");
  else if (Number.isFinite(p.corridor_gap_dist_m) && p.corridor_gap_dist_m <= 150) facts.push("close to a gap in the approximate corridor");
  if (!facts.length) return "A moderate fit: nothing stands out on heat, shade or the corridor.";
  const text = facts.length === 1 ? facts[0] : `${facts.slice(0, -1).join(", ")} and ${facts.at(-1)}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * Plain-language notes about one site. Returns { notes: string[], warnings: string[] }.
 * Wording is deliberately modest: temperatures are for ranking only and the corridor is approximate.
 */
export function driverNotes(p, ctx) {
  const notes = [];
  const warnings = [];

  if (Number.isFinite(p.lst_mean_250m)) {
    notes.push(`Surroundings are hotter than ${hotterThan(p, ctx)}% of sites (250 m average ${fmtC(p.lst_mean_250m)}).`);
  }
  if (Number.isFinite(p.ndvi_mean_250m)) {
    notes.push(`Surroundings are less green than ${lessGreenThan(p, ctx)}% of sites (greenness ${fmt(p.ndvi_mean_250m, 2)}).`);
  }

  const pathLen = p.path_length_within_50m;
  if (!(pathLen > 0)) {
    notes.push(`No mapped walking path within 50 m (nearest ${fmtMetres(p.dist_to_path_m)}).`);
  } else if (p.uncovered_path_length_50m > 0) {
    notes.push(`${fmtMetres(p.uncovered_path_length_50m)} of the ${fmtMetres(pathLen)} of nearby path has no shade.`);
  } else {
    notes.push(`The ${fmtMetres(pathLen)} of nearby path already has shade.`);
  }

  if (p.corridor_gap_flag) {
    notes.push(`Next to a gap in the approximate corridor (${fmtMetres(p.corridor_gap_dist_m)} away).`);
  } else {
    notes.push(`Nearest corridor gap is ${fmtMetres(p.corridor_gap_dist_m)} away (the corridor is approximate).`);
  }

  if (p.residential_buildings_within_250m > 0) {
    notes.push(`${p.residential_buildings_within_250m} homes within 250 m.`);
  } else if (p.buildings_within_250m > 0) {
    notes.push(`${p.buildings_within_250m} buildings within 250 m.`);
  } else {
    notes.push("No mapped buildings within 250 m (OpenStreetMap may under-map this area).");
  }

  if (Number.isFinite(p.lst_valid_frac) && p.lst_valid_frac < MOSTLY_ESTIMATED) {
    warnings.push(`Ground heat here is mostly estimated from nearby pixels (${Math.round(p.lst_valid_frac * 100)}% measured).`);
  }
  return { notes, warnings };
}
