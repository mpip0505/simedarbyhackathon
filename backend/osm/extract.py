"""Pull Elmina paths, roads, parks, open land and buildings from OpenStreetMap (free, via Overpass).

Run:  python -m backend.osm.extract            (uses files already downloaded)
      python -m backend.osm.extract --refresh  (re-download everything)
Each layer is cached to backend/data/cache/osm/<layer>.geojson so one slow query is never repeated.
"""
import argparse
import json
import time

import geopandas as gpd
import osmnx as ox

from backend import atomic
from backend.config import CACHE_DIR

OSM_DIR = CACHE_DIR / "osm"
PLACE = "Elmina, Shah Alam, Selangor, Malaysia"  # resolves to the Elmina area polygon in OSM
OVERPASS_URLS = ["https://overpass-api.de/api", "https://overpass.kumi.systems/api",
                 "https://overpass.private.coffee/api"]
MAX_ATTEMPTS = 6

LAYERS = {
    "parks": {"leisure": ["park", "garden", "nature_reserve", "playground"]},
    "open_land": {"landuse": ["grass", "meadow", "brownfield", "greenfield", "recreation_ground"],
                  "natural": ["grassland", "scrub"]},
    "paths": {"highway": ["footway", "path", "cycleway", "pedestrian"]},
    "roads": {"highway": ["residential", "tertiary", "secondary", "primary", "trunk", "unclassified", "service"]},
    "buildings": {"building": True},
}
KEEP_COLS = ["name", "leisure", "landuse", "natural", "highway", "building", "geometry"]


def _clean(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf.reset_index(drop=True)
    cols = [c for c in KEEP_COLS if c in gdf.columns]
    return gdf[cols].copy()


def area_polygon():
    return ox.geocode_to_gdf(PLACE).geometry.iloc[0]


def fetch_layer(name: str, polygon, refresh: bool = False) -> gpd.GeoDataFrame:
    path = OSM_DIR / f"{name}.geojson"
    if path.exists() and not refresh:
        return gpd.read_file(path)
    OSM_DIR.mkdir(parents=True, exist_ok=True)
    last = None
    for attempt in range(MAX_ATTEMPTS):
        ox.settings.overpass_url = OVERPASS_URLS[attempt % len(OVERPASS_URLS)]
        try:
            # bbox queries are far lighter on Overpass than the detailed polygon outline; clip afterwards
            raw = ox.features_from_bbox(bbox=polygon.bounds, tags=LAYERS[name])
            gdf = _clean(raw[raw.intersects(polygon)])
            break
        except Exception as exc:  # Overpass often answers 502/504 under load
            last = exc
            print(f"  {name}: attempt {attempt + 1} failed on {ox.settings.overpass_url}: {str(exc)[:80]}")
            time.sleep(5)
    else:
        raise RuntimeError(f"Could not download OSM layer '{name}': {last}")
    atomic.write_geodataframe(gdf, path)
    return gdf


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    ox.settings.requests_timeout = 60  # fail fast, then rotate to the next mirror
    poly = area_polygon()
    OSM_DIR.mkdir(parents=True, exist_ok=True)
    atomic.write_geodataframe(gpd.GeoSeries([poly], crs=4326), OSM_DIR / "aoi.geojson")
    summary = {"place": PLACE, "bbox_wsen": [round(x, 5) for x in poly.bounds], "layers": {}}
    for name in LAYERS:
        gdf = fetch_layer(name, poly, args.refresh)
        summary["layers"][name] = len(gdf)
        print(f"{name}: {len(gdf)} features")
    atomic.write_json(OSM_DIR / "summary.json", summary, indent=1)


if __name__ == "__main__":
    main()
