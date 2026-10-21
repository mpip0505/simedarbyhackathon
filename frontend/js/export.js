// Exports for the planning team: a GeoJSON file they can open in GIS (QGIS, ArcGIS, geojson.io) and the rows of a printable
// planting brief. Pure functions, no DOM. Every export keeps the "simulated" and score-source labels, so a file passed
// around by email still says what it is.
import { centroid } from "./csv.js";
import { siteHeadline } from "./drivers.js";
import { conflictFor, CONFLICT_CAVEAT } from "./screening.js";

const KEEP = ["rank", "site_id", "score_total", "score_cooling", "score_connectivity", "score_shade", "origin", "area_m2", "source", "score_source"];

/** The ranked sites as a GeoJSON FeatureCollection with a plain-language note at the top. */
export function toGeoJson(features, { scoreSource = "unknown", dataVersion = null, plan = null, conflicts = null } = {}) {
  return {
    type: "FeatureCollection",
    name: "elmina-ranked-sites",
    note: "Example planting sites (simulated), not Sime Darby Property's list. A screening tool, not a tree count or a carbon figure."
      + (scoreSource === "ml" ? "" : " Scores are previews until the scoring model is connected."),
    score_source: scoreSource,
    data_version: dataVersion,
    ...(conflicts ? { conflict_note: CONFLICT_CAVEAT } : {}),
    features: features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        ...Object.fromEntries(KEEP.filter((k) => k in f.properties).map((k) => [k, f.properties[k]])),
        ...(conflicts ? { mapped_conflicts: conflictFor(conflicts, f.properties.site_id) } : {}),
        ...(plan?.get(f.properties.site_id) ? { plan_status: plan.get(f.properties.site_id).status, plan_note: plan.get(f.properties.site_id).note } : {}),
      },
    })),
  };
}

/** One row per site for the printed brief: where it is, how it scored and the one-sentence reason. */
export function briefRows(features, { n = 10, ctx, steadyOf = () => null } = {}) {
  return features.slice(0, n).map((f) => {
    const p = f.properties;
    const c = centroid(f.geometry);
    const steady = steadyOf(p.site_id);
    return {
      rank: p.rank,
      siteId: p.site_id,
      score: p.score_total,
      place: c ? `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}` : "",
      origin: p.origin === "corridor_edge" ? "Corridor edge" : "Open land",
      reason: siteHeadline(p, ctx),
      steady: steady ? steady.label : "",
    };
  });
}
