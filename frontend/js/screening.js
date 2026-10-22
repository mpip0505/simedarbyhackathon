// The siting screen: map-based triggers stay separate from a person's checks. A missing map record never means nothing to review.
import { centroid } from "./csv.js";
import { safeCell } from "./plan.js";

export const CONFLICT_CAVEAT = "Mapped triggers for field review, not an approval or legal setback check. It looks only at mapped roads, buildings and footpaths (for tree-fall, clearance and access review). It does not assess wildlife: no forest-edge layer is mapped, and that would need an ecologist. No mapped trigger does not establish safety. Utilities, overhead wires, sight lines, ownership, drainage and species/root clearances still need field checks.";
export function conflictFor(report, id) {
  if (!report || report.stale !== false || !report.sites?.[id]) return { state: "unknown", flags: [], unknown_layers: ["road", "building", "path"], distances_m: {}, note: report?.stale ? "Map screen is from older inputs; rebuild it." : "Current siting screen unavailable." };
  return report.sites[id];
}

export function conflictRows(features, report) {
  return features.map((f) => {
    const p = f.properties, c = conflictFor(report, p.site_id);
    return { site_id: safeCell(p.site_id), source: p.source ?? "simulated", map_state: c.state, flags: c.flags.map((x) => x.code).join("; "),
      road_edge_distance_m: c.distances_m.road, building_edge_distance_m: c.distances_m.building, path_distance_m: c.distances_m.path,
      unknown_layers: c.unknown_layers.join("; "), data_version: report?.data_version ?? "", caveat: CONFLICT_CAVEAT };
  });
}

export function openDataRows(report) {
  return (report?.features ?? []).map((f) => {
    const p = f.properties, c = centroid(f.geometry);
    return { site_id: safeCell(p.site_id), source: "simulated", source_mode: "osm-only", rank: p.rank, screening_score: p.screening_score,
      path_distance_m: p.path_distance_m, park_distance_m: p.park_distance_m, lat: c?.lat, lon: c?.lon,
      siting_screen: p.conflicts?.flags?.map((x) => x.code).join("; ") ?? "unknown", data_version: report.data_version,
      source_verification: report.stale === false ? "current" : report.stale === true ? "stale" : "unavailable",
      method: JSON.stringify(report.method), input_hashes: JSON.stringify(report.input_hashes), attribution: safeCell(report.attribution),
      caveat: safeCell(`${report.note} ${report.conflict_note ?? ""}`) };
  });
}
