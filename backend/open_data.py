"""Earth Engine independent, OSM-only candidate screening.

`python -m backend.open_data` reads only the five OSM GeoJSON layers and writes open_data_sites.geojson.
It does not read satellite-derived candidates, rasters, heat, canopy, scores or the cached corridor.
"""
import argparse
import hashlib
import json
from pathlib import Path

import geopandas as gpd
from shapely.ops import unary_union

from backend import atomic
from backend.config import CACHE_DIR
from backend.conflicts import NOTE as CONFLICT_NOTE, screen_site
from backend.osm.corridor import METRIC_CRS
from backend.provenance import file_hashes
from backend.sites.generate import BUILDING_BUFFER_M, ROAD_BUFFER_M, candidate_land, grid_cells

LAYERS = ("open_land", "parks", "roads", "buildings", "paths")
NOTE = ("OSM-only screening of simulated 30 m cells, not a planting approval and not a shade survey. "
        "Ranks use footpath and park proximity only. Heat, existing tree cover, actual shade, utilities, soil, ownership and species suitability are unknown. "
        "Scores cannot be compared with the satellite model. Mapping gaps can omit land, buildings and paths.")


def build(osm_dir: Path) -> dict:
    layers = {}
    for name in LAYERS:
        path = osm_dir / f"{name}.geojson"
        if not path.exists():
            raise ValueError(f"Missing OSM layer: {name}.geojson")
        layer = gpd.read_file(path)
        if layer.crs is None:
            raise ValueError(f"OSM layer {name} has no CRS")
        layer = layer.to_crs(METRIC_CRS)
        if layer.empty or layer.geometry.isna().any() or not layer.geometry.is_valid.all():
            raise ValueError(f"OSM layer {name} is empty or has invalid geometry; no ranking produced")
        layers[name] = layer.geometry
    parks = unary_union(layers["parks"])
    # No corridor is needed: this fallback screens mapped open land only.
    land, _ = candidate_land(layers["open_land"], layers["parks"], [], layers["buildings"], layers["roads"])
    land = land.difference(parks)
    if land.is_empty:
        raise ValueError("No OSM open land remains after mapped exclusions")
    cells = grid_cells(land)
    # Candidate coverage alone allows up to 20% outside plantable land. Exclude any actual road/building overlap as well.
    excluded = unary_union([*layers["buildings"].buffer(BUILDING_BUFFER_M), *layers["roads"].buffer(ROAD_BUFFER_M)])
    cells = [c for c in cells if not c.intersects(excluded) and not c.intersects(parks)]
    if not cells:
        raise ValueError("No full 30 m cells remain after mapped exclusions")
    roads, buildings, paths = ([unary_union(layers[n])] for n in ("roads", "buildings", "paths"))
    rows = []
    for cell in cells:
        ctr = cell.centroid
        path_distance, park_distance = ctr.distance(paths[0]), ctr.distance(parks)
        path_score = 100 / (1 + path_distance / 50)
        park_score = 100 / (1 + park_distance / 250)
        x, y, _, _ = cell.bounds
        rows.append({"site_id": f"OSM-{round(x / 30)}-{round(y / 30)}", "source": "simulated", "area_m2": round(cell.area),
                     "path_distance_m": round(path_distance, 1), "park_distance_m": round(park_distance, 1),
                     "score_path_proximity": round(path_score, 1), "score_park_proximity": round(park_score, 1),
                     "screening_score": round(0.6 * path_score + 0.4 * park_score, 1),
                     "conflicts": screen_site(cell, roads, buildings, paths), "geometry": cell})
    rows.sort(key=lambda r: (-r["screening_score"], r["site_id"]))
    for i, row in enumerate(rows):
        row["rank"] = i + 1
    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs=METRIC_CRS).to_crs(4326)
    fc = json.loads(gdf.to_json(drop_id=True))
    hashes = file_hashes(osm_dir, [f"{name}.geojson" for name in LAYERS])
    version = hashlib.sha256(json.dumps({"features": fc["features"], "input_hashes": hashes}, sort_keys=True).encode()).hexdigest()[:12]
    return {**fc, "source_mode": "osm-only", "data_version": version, "input_hashes": hashes,
            "method": {"weights": {"footpath_proximity": 0.6, "park_proximity": 0.4},
                       "formula": "100/(1+distance/scale), scales 50 m for paths and 250 m for parks; weighted sum; ties by site ID",
                       "exclusion_buffers_m": {"road_centre_line": ROAD_BUFFER_M, "building": BUILDING_BUFFER_M},
                       "buffers_note": "Prototype screening choices, not legal setbacks"},
            "attribution": "Map data © OpenStreetMap contributors, ODbL 1.0",
            "license_url": "https://www.openstreetmap.org/copyright", "note": NOTE, "conflict_note": CONFLICT_NOTE}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--osm-dir", type=Path, default=CACHE_DIR / "osm")
    ap.add_argument("--output", type=Path, default=CACHE_DIR / "open_data_sites.geojson")
    args = ap.parse_args()
    data = build(args.osm_dir)
    atomic.write_json(args.output, data)
    print(f"{len(data['features'])} OSM-only simulated candidates, version {data['data_version']} -> {args.output}")


if __name__ == "__main__":
    main()
