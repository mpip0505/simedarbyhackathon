"""Approximate Urban Biodiversity Corridor from park polygons.

Method (a stand-in, not the official geometry): take the larger park polygons, join them with a
minimum spanning tree of shortest connecting lines (the "spine"), then buffer. If the team provides
backend/data/input/corridor_official.geojson, that file is used instead and flagged approximate=False.
"""
import json

import geopandas as gpd
import shapely
from shapely.geometry import mapping
from shapely.ops import unary_union

from backend.config import INPUT_DIR

METRIC_CRS = "EPSG:32648"  # UTM 48N, covers Selangor
OFFICIAL_FILE = INPUT_DIR / "corridor_official.geojson"


def spine_mst(polys: list) -> list:
    """Shortest connecting lines forming a minimum spanning tree over polygons (Prim)."""
    if len(polys) < 2:
        return []
    in_tree, lines = {0}, []
    while len(in_tree) < len(polys):
        best = None
        for i in in_tree:
            for j in range(len(polys)):
                if j in in_tree:
                    continue
                d = polys[i].distance(polys[j])
                if best is None or d < best[0]:
                    best = (d, i, j)
        _, i, j = best
        lines.append(shapely.shortest_line(polys[i], polys[j]))
        in_tree.add(j)
    return lines


def build_corridor(parks: gpd.GeoDataFrame, buffer_m: float = 40, min_area_m2: float = 5000) -> dict:
    """Returns {"corridor": GeoJSON FeatureCollection, "spine": GeoJSON FeatureCollection, "stats": dict}."""
    if OFFICIAL_FILE.exists():
        official = gpd.read_file(OFFICIAL_FILE).to_crs(4326)
        fc = json.loads(official.to_json())
        for f in fc["features"]:
            f["properties"] = {"name": "Urban Biodiversity Corridor (official)", "approximate": False}
        return {"corridor": fc, "spine": {"type": "FeatureCollection", "features": []},
                "stats": {"approximate": False, "source": str(OFFICIAL_FILE.name)}}

    m = parks.to_crs(METRIC_CRS)
    m = m[m.geometry.area >= min_area_m2]
    polys = [g for g in m.geometry.explode(index_parts=False) if g.geom_type == "Polygon" and g.area >= min_area_m2]
    if not polys:
        raise ValueError("No park polygons large enough to build a corridor")
    lines = spine_mst(polys)
    corridor_m = unary_union([*polys, *[ln.buffer(buffer_m) for ln in lines]]).buffer(buffer_m / 2)
    spine_len = sum(ln.length for ln in lines)

    def to_fc(geoms, props):
        g = gpd.GeoSeries(geoms, crs=METRIC_CRS).to_crs(4326)
        return {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": mapping(x), "properties": dict(props)} for x in g]}

    stats = {"approximate": True, "n_parks_used": len(polys), "spine_length_m": round(spine_len, 1),
             "buffer_m": buffer_m, "method": "MST of park polygons, buffered"}
    return {
        "corridor": to_fc([corridor_m], {"name": "Urban Biodiversity Corridor (APPROXIMATE, derived from OSM parks)",
                                         "approximate": True}),
        "spine": to_fc(lines, {"name": "corridor connector (APPROXIMATE)", "approximate": True}),
        "stats": stats,
    }
