"""Offline fallback for Overpass: clip a downloaded OSM .pbf to Elmina and write the same layer files.

Run:  python -I -m backend.osm.from_pbf [--pbf backend/data/raw_osm/malaysia.osm.pbf]
Output matches backend.osm.extract: backend/data/cache/osm/<layer>.geojson + summary.json.
The .pbf is downloaded data, so it is only ever read, never executed.
"""
import argparse
import json
from pathlib import Path

import geopandas as gpd
import osmium
import shapely
from shapely.geometry import box

from backend import atomic
from backend.config import BACKEND_DIR, ELMINA_BBOX
from backend.osm.extract import KEEP_COLS, LAYERS, OSM_DIR

DEFAULT_PBF = BACKEND_DIR / "data" / "raw_osm" / "malaysia.osm.pbf"
KEYS = sorted({k for tags in LAYERS.values() for k in tags})
POLYGON_LAYERS = {"parks", "open_land", "buildings"}
LINE_LAYERS = {"paths", "roads"}


def classify(tags: dict, is_area: bool) -> str | None:
    """Which layer an OSM object belongs to, using the same tag lists as the Overpass extractor."""
    for layer, wanted in LAYERS.items():
        if (layer in POLYGON_LAYERS) != is_area:
            continue
        for key, values in wanted.items():
            v = tags.get(key)
            if v is not None and (values is True or v in values):
                return layer
    return None


def _in_bbox(nodes, bbox) -> bool:
    w, s, e, n = bbox
    return any(nd.location.valid() and w <= nd.lon <= e and s <= nd.lat <= n for nd in nodes)


def read_layers(pbf: Path, aoi, bbox=ELMINA_BBOX) -> dict:
    """Single pass over the file; returns {layer: GeoDataFrame} clipped to the AOI polygon."""
    wkb = osmium.geom.WKBFactory()
    rows = {name: [] for name in LAYERS}
    fp = osmium.FileProcessor(pbf).with_locations().with_areas().with_filter(osmium.filter.KeyFilter(*KEYS))
    for obj in fp:
        if obj.is_area():
            layer = classify(dict(obj.tags), True)
            if layer is None or not any(_in_bbox(ring, bbox) for ring in obj.outer_rings()):
                continue
            geom = shapely.from_wkb(bytes.fromhex(wkb.create_multipolygon(obj)))
        elif obj.is_way() and not obj.is_closed():
            layer = classify(dict(obj.tags), False)
            if layer is None or not _in_bbox(obj.nodes, bbox):
                continue
            geom = shapely.from_wkb(bytes.fromhex(wkb.create_linestring(obj)))
        else:
            continue
        if geom.intersects(aoi):
            rows[layer].append({**{k: obj.tags.get(k) for k in KEEP_COLS if k != "geometry"}, "geometry": geom})
    return {name: gpd.GeoDataFrame(r, geometry="geometry", crs=4326) if r else
            gpd.GeoDataFrame({c: [] for c in KEEP_COLS if c != "geometry"}, geometry=[], crs=4326)
            for name, r in rows.items()}


def load_aoi():
    path = OSM_DIR / "aoi.geojson"
    if path.exists():
        return gpd.read_file(path).geometry.iloc[0]
    return box(*ELMINA_BBOX)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", type=Path, default=DEFAULT_PBF)
    args = ap.parse_args()
    aoi = load_aoi()
    layers = read_layers(args.pbf, aoi)
    OSM_DIR.mkdir(parents=True, exist_ok=True)
    summary = {"place": "Elmina (clipped from " + args.pbf.name + ")", "bbox_wsen": [round(x, 5) for x in aoi.bounds],
               "layers": {}}
    for name, gdf in layers.items():
        atomic.write_geodataframe(gdf, OSM_DIR / f"{name}.geojson")
        summary["layers"][name] = len(gdf)
        print(f"{name}: {len(gdf)} features")
    atomic.write_json(OSM_DIR / "summary.json", summary, indent=1)


if __name__ == "__main__":
    main()
