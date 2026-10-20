"""Generate SIMULATED candidate planting sites for Elmina and attach the measured features.

Candidates are 30 m grid cells on (a) OSM open land and (b) corridor land that is not already park,
minus buildings and roads. They are NOT Sime Darby Property's real site list.

Run:  python -m backend.sites.generate
Needs: Batch 2 OSM layers + corridor, Batch 3 rasters. Writes backend/data/cache/sites.geojson
"""
import json
import math

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from shapely.geometry import MultiPoint, Point, box
from shapely.ops import unary_union

from backend.config import CACHE_DIR, CANOPY_NDVI_THRESHOLD
from backend.osm.corridor import METRIC_CRS
from backend.osm.extract import OSM_DIR
from backend.schema import SiteProperties

CELL_M = 30
MIN_COVER = 0.8            # cell must be at least this much candidate land
BUILDING_BUFFER_M = 3
ROAD_BUFFER_M = 8
PATH_RADIUS_M = 50
GAP_NDVI = 0.5             # spine points with NDVI below this count as a corridor gap
GAP_FLAG_DIST_M = 50
MIN_PLANTABLE_NDVI = 0.0
SPINE_STEP_M = 10
RASTER_DIR = CACHE_DIR / "rasters"


def candidate_land(open_land, parks, corridor, buildings, roads):
    """Returns (all candidate land, open-land part), geometries in metric CRS."""
    excl = unary_union([*buildings.buffer(BUILDING_BUFFER_M), *roads.buffer(ROAD_BUFFER_M)])
    open_part = unary_union(list(open_land)).difference(excl)
    corridor_part = unary_union(list(corridor)).difference(unary_union(list(parks))).difference(excl)
    return unary_union([open_part, corridor_part]), open_part


def grid_cells(land, cell_m: float = CELL_M, min_cover: float = MIN_COVER) -> list:
    """Axis-aligned cells (metric CRS) that are mostly inside `land`, in deterministic order."""
    minx, miny, maxx, maxy = land.bounds
    x0, y0 = math.floor(minx / cell_m) * cell_m, math.floor(miny / cell_m) * cell_m  # fixed grid origin
    cells, x = [], x0
    while x < maxx:
        y = y0
        while y < maxy:
            c = box(x, y, x + cell_m, y + cell_m)
            if c.intersects(land) and c.intersection(land).area >= min_cover * c.area:
                cells.append(c)
            y += cell_m
        x += cell_m
    return cells


def window_values(src, geom_4326, band=1) -> np.ndarray:
    """Finite pixel values of a raster inside the bounds of a (small) geometry."""
    w = from_bounds(*geom_4326.bounds, transform=src.transform)
    arr = src.read(band, window=w.round_offsets().round_lengths(), boundless=True, fill_value=np.nan)
    return arr[np.isfinite(arr)]


def zonal(src, geoms_4326, stat) -> list:
    out = []
    for g in geoms_4326:
        v = window_values(src, g)
        out.append(stat(v) if v.size else None)
    return out


def gap_points(spine_lines_m, ndvi_src, step_m: float = SPINE_STEP_M, gap_ndvi: float = GAP_NDVI) -> list:
    """Points along the corridor spine where latest NDVI is below gap_ndvi (clear data only)."""
    pts = []
    for line in spine_lines_m:
        for d in np.arange(0, line.length, step_m):
            p = line.interpolate(d)
            lon, lat = gpd.GeoSeries([p], crs=METRIC_CRS).to_crs(4326).iloc[0].coords[0]
            row, col = ndvi_src.index(lon, lat)
            if 0 <= row < ndvi_src.height and 0 <= col < ndvi_src.width:
                v = ndvi_src.read(1, window=((row, row + 1), (col, col + 1)))[0, 0]
                if np.isfinite(v) and v < gap_ndvi:
                    pts.append(p)
    return pts


def build_sites(open_land, parks, corridor, spine, buildings, roads, paths, ndvi_latest, lst_latest, ndvi_baseline):
    """All inputs are GeoDataFrames (4326) or open rasterio datasets. Returns a GeoDataFrame (4326)."""
    to_m = lambda g: g.to_crs(METRIC_CRS).geometry
    land, open_part = candidate_land(to_m(open_land), to_m(parks), to_m(corridor), to_m(buildings), to_m(roads))
    cells = grid_cells(land)
    cells_4326 = list(gpd.GeoSeries(cells, crs=METRIC_CRS).to_crs(4326))

    ndvi = zonal(ndvi_latest, cells_4326, np.mean)
    lst = zonal(lst_latest, cells_4326, np.mean)
    canopy = zonal(ndvi_baseline, cells_4326, lambda v: 100.0 * float(np.mean(v >= CANOPY_NDVI_THRESHOLD)))

    path_union = unary_union(list(to_m(paths))) if len(paths) else None
    gaps = gap_points(list(to_m(spine)), ndvi_latest)
    gap_geom = MultiPoint(gaps) if gaps else None

    rows = []
    for cell, g4326, n, t, c in zip(cells, cells_4326, ndvi, lst, canopy):
        if n is None or t is None or c is None:
            continue  # no clear satellite data over this cell
        if n < MIN_PLANTABLE_NDVI:
            continue  # negative NDVI is typically open water, not plantable
        ctr = cell.centroid
        d_path = ctr.distance(path_union) if path_union is not None else 9999.0
        near_len = cell.buffer(PATH_RADIUS_M).intersection(path_union).length if path_union is not None else 0.0
        d_gap = ctr.distance(gap_geom) if gap_geom is not None else 9999.0
        rows.append({
            "source": "simulated",
            "origin": "open_land" if ctr.within(open_part) else "corridor_edge",
            "area_m2": round(cell.area, 1), "ndvi_mean": round(float(n), 3), "lst_c_mean": round(float(t), 2),
            "canopy_pct_baseline": round(float(c), 1), "dist_to_path_m": round(float(d_path), 1),
            "path_length_within_50m": round(float(near_len), 1),
            "corridor_gap_flag": bool(d_gap <= GAP_FLAG_DIST_M), "corridor_gap_dist_m": round(float(d_gap), 1),
            "geometry": g4326,
        })
    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)
    gdf.insert(0, "site_id", [f"ELM-{i + 1:04d}" for i in range(len(gdf))])
    return gdf


def validate(gdf) -> None:
    for rec in gdf.drop(columns="geometry").to_dict("records"):
        SiteProperties(**rec)


def main() -> None:
    read = lambda n: gpd.read_file(OSM_DIR / f"{n}.geojson")
    spine = gpd.read_file(CACHE_DIR / "corridor_spine.geojson")
    with rasterio.open(RASTER_DIR / "ndvi_latest.tif") as nl, rasterio.open(RASTER_DIR / "lst_latest.tif") as ll, \
            rasterio.open(RASTER_DIR / "ndvi_baseline.tif") as nb:
        gdf = build_sites(read("open_land"), read("parks"), gpd.read_file(CACHE_DIR / "corridor.geojson"), spine,
                          read("buildings"), read("roads"), read("paths"), nl, ll, nb)
    validate(gdf)
    (CACHE_DIR / "sites.geojson").write_text(gdf.to_json(drop_id=True), encoding="utf-8")
    print(f"{len(gdf)} simulated sites -> {CACHE_DIR / 'sites.geojson'}")
    print(gdf.groupby("origin").size().to_dict(), "| gap-flagged:", int(gdf["corridor_gap_flag"].sum()))
    print(gdf[["ndvi_mean", "lst_c_mean", "canopy_pct_baseline", "dist_to_path_m"]].describe().round(2).to_string())


if __name__ == "__main__":
    main()
