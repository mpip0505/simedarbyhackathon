"""Mapped planting conflicts: geometry heuristics for field review, never a safety clearance.

Run `python -m backend.conflicts` after the sites/OSM build. No changes to scores or the sites data version.
"""
import json

import geopandas as gpd
from shapely.ops import unary_union

from backend import atomic
from backend.config import CACHE_DIR
from backend.osm.corridor import METRIC_CRS
from backend.provenance import file_hashes

THRESHOLDS_M = {"road_edge": 15, "building_edge": 10, "path_overlap": 0}
NOTE = ("Mapped geometry triggers for field review, not an approval or a legal setback check. "
        "Distances are from the edge of a simulated 30 m cell; the final tree position is unknown. "
        "OSM roads are centre lines, not kerbs. No mapped trigger does not establish safety. "
        "Utilities, overhead wires, sight lines, ownership, drainage and species/root clearances remain unknown until checked on site.")


def screen_site(cell, roads, buildings, paths) -> dict:
    """Inputs use metres in the same projected CRS; None/empty geometry means coverage unknown."""
    flags, unknown, distances = [], [], {}
    specs = [("road", roads, "road-edge", "Near a mapped road centre line: check road edge, sight lines and setbacks", 15),
             ("building", buildings, "building-edge", "Near a mapped building: check canopy and root clearance", 10),
             ("path", paths, "path-overlap", "Cell overlaps a mapped footpath: keep walking access clear", 0)]
    for key, geoms, code, label, threshold in specs:
        geoms = [] if geoms is None else [g for g in geoms if g is not None and not g.is_empty]
        if not geoms:
            unknown.append(key)
            distances[key] = None
            continue
        merged = geoms[0] if len(geoms) == 1 else unary_union(geoms)
        distance = float(cell.distance(merged))
        distances[key] = round(distance, 1)
        if distance <= threshold:
            flags.append({"code": code, "label": label, "distance_m": round(distance, 1)})
    return {"state": "review" if flags else "unknown" if unknown else "no-trigger", "flags": flags,
            "unknown_layers": unknown, "distances_m": distances}


def build_report(sites, layers: dict, data_version: str) -> dict:
    metric = sites.to_crs(METRIC_CRS)
    # Unite once per layer, rather than repeating that work for each site.
    geoms = {key: None if layers.get(key) is None else [layers[key].to_crs(METRIC_CRS).geometry.union_all()]
             for key in ("roads", "buildings", "paths")}
    result = {r.site_id: screen_site(r.geometry, geoms["roads"], geoms["buildings"], geoms["paths"]) for r in metric.itertuples()}
    return {"data_version": data_version, "thresholds_m": THRESHOLDS_M, "note": NOTE, "sites": result}


def main() -> None:
    osm = CACHE_DIR / "osm"
    layers = {key: gpd.read_file(osm / f"{key}.geojson") if (osm / f"{key}.geojson").exists() else None
              for key in ("roads", "buildings", "paths")}
    sites_file = CACHE_DIR / "sites.geojson"
    version = json.loads(sites_file.read_text(encoding="utf-8")).get("data_version")
    report = build_report(gpd.read_file(sites_file), layers, version)
    report["input_hashes"] = file_hashes(osm, [f"{key}.geojson" for key, value in layers.items() if value is not None])
    atomic.write_json(CACHE_DIR / "conflicts.json", report)
    counts = {state: sum(r["state"] == state for r in report["sites"].values()) for state in ("review", "unknown", "no-trigger")}
    print(f"Mapped conflict screen: {counts}")


if __name__ == "__main__":
    main()
