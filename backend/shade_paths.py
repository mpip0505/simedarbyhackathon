"""Footpaths by how green they are along their length, as map pieces.

    python -m backend.shade_paths             # writes backend/data/cache/paths_shade.geojson

Each OpenStreetMap footpath is cut into pieces of about 50 m. For every piece, the latest satellite greenness (NDVI) is sampled every 10 m along it and averaged.
Pieces are then split into thirds RELATIVE to this township's footpaths: "least_green", "middle" and "greenest".

Why relative: at 10 m, most footpath samples fall below the canopy threshold we use elsewhere (a path pixel mixes pavement with any trees beside it, and NDVI over
pavement is low), so an absolute "shaded or not" labelling would paint almost every path the same colour and would claim more than a 10 m satellite pixel can show.
The thirds show where paths are comparatively bare or comparatively green. Each piece also carries `unshaded_frac`, the absolute share of its samples below the threshold.
This is a satellite proxy for tree cover along the path, NOT a shade survey.
"""
from __future__ import annotations

import json

import geopandas as gpd
import numpy as np
import rasterio
from shapely.geometry import LineString, MultiLineString, mapping
from shapely.ops import substring

from backend import atomic
from backend.config import CACHE_DIR, CANOPY_NDVI_THRESHOLD
from backend.osm.corridor import METRIC_CRS
from backend.osm.extract import OSM_DIR
from backend.sites.generate import RASTER_DIR, sample_points

PIECE_M = 50.0
STEP_M = 10.0
LABELS = ("least_green", "middle", "greenest")


def pieces(line: LineString, piece_m: float = PIECE_M) -> list[LineString]:
    """Cut a line into pieces of about piece_m (a line up to 1.5 pieces long stays whole, so no tiny remainder)."""
    if line.length <= piece_m * 1.5:
        return [line]
    n = int(round(line.length / piece_m))
    edges = np.linspace(0.0, line.length, n + 1)
    return [substring(line, a, b) for a, b in zip(edges[:-1], edges[1:])]


def measure(line: LineString, greenness_at) -> tuple[float, float] | None:
    """(mean greenness, share of samples below the canopy threshold) along one piece, or None when no clear satellite value lies along it."""
    pts = [line.interpolate(d) for d in np.arange(0.0, max(line.length, STEP_M / 2), STEP_M)] or [line.interpolate(0.0)]
    vals = np.asarray(greenness_at(pts), dtype="float64")
    vals = vals[np.isfinite(vals)]
    if vals.size == 0:
        return None
    return float(vals.mean()), float((vals < CANOPY_NDVI_THRESHOLD).mean())


def thirds(means: list[float]) -> list[str]:
    """Label each value by which third of all values it falls in (ties go to the lower third, so the split is stable)."""
    lo, hi = np.percentile(means, [100 / 3, 200 / 3])
    return [LABELS[0] if m <= lo else LABELS[2] if m > hi else LABELS[1] for m in means]


def build() -> dict:
    paths = gpd.read_file(OSM_DIR / "paths.geojson").to_crs(METRIC_CRS).geometry
    pieces_out = []
    with rasterio.open(RASTER_DIR / "ndvi_latest.tif") as ndvi:
        sample = lambda pts: sample_points(ndvi, pts)
        for geom in paths:
            for line in (geom.geoms if isinstance(geom, MultiLineString) else [geom]):
                if not isinstance(line, LineString) or line.length < 1:
                    continue
                for piece in pieces(line):
                    got = measure(piece, sample)
                    if got is not None:
                        pieces_out.append((piece, got[0], got[1]))
    labels = thirds([m for _, m, _ in pieces_out])
    gdf = gpd.GeoDataFrame({"geom": [p for p, _, _ in pieces_out], "mean_ndvi": [round(m, 3) for _, m, _ in pieces_out],
                            "unshaded_frac": [round(f, 2) for _, _, f in pieces_out], "third": labels,
                            "length_m": [round(p.length) for p, _, _ in pieces_out]}, geometry="geom", crs=METRIC_CRS).to_crs(4326)
    feats = []
    for row in gdf.itertuples():
        g = mapping(row.geom)
        feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[round(x, 6), round(y, 6)] for x, y in g["coordinates"]]},
                      "properties": {"third": row.third, "mean_ndvi": row.mean_ndvi, "unshaded_frac": row.unshaded_frac, "length_m": row.length_m}})
    return {
        "type": "FeatureCollection",
        "note": "Greenness along OpenStreetMap footpaths in pieces of about 50 m, split into thirds relative to this township's paths. A satellite proxy for tree cover on the path, not a shade survey.",
        "canopy_ndvi_threshold": CANOPY_NDVI_THRESHOLD,
        "features": feats,
    }


def main() -> None:
    data = build()
    atomic.write_json(CACHE_DIR / "paths_shade.geojson", data)
    metres, below = {}, 0
    total = 0
    for f in data["features"]:
        p = f["properties"]
        metres[p["third"]] = metres.get(p["third"], 0) + p["length_m"]
        total += p["length_m"]
        below += p["length_m"] * p["unshaded_frac"]
    print(f"{len(data['features'])} pieces -> {CACHE_DIR / 'paths_shade.geojson'}; metres by third: {metres}; share of samples below the canopy threshold: {100 * below / total:.0f}%")


if __name__ == "__main__":
    main()
