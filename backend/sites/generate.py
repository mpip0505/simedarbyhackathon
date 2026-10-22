"""Generate SIMULATED candidate planting sites for Elmina and attach the measured features.

Candidates are 30 m grid cells on (a) OSM open land and (b) corridor land that is not already park,
minus buildings and roads. They are NOT Sime Darby Property's real site list.

Run:  python -m backend.sites.generate
Needs: Batch 2 OSM layers + corridor, Batch 3 rasters. Writes backend/data/cache/sites.geojson and site_features.csv
Site IDs come from the grid position, so they stay the same across rebuilds. `data_version` (a hash of every
site and feature) lets ML scores say which build they were computed on.
"""
import hashlib
import json
import math

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import from_bounds
from shapely.geometry import MultiPoint, Point, box
from shapely.ops import unary_union

from backend import atomic
from backend.config import CACHE_DIR, CANOPY_NDVI_THRESHOLD
from backend.osm.corridor import METRIC_CRS
from backend.osm.extract import OSM_DIR
from backend.schema import SiteProperties

CELL_M = 30
BLOCK_M = 250              # spatial block size for cross-validation (neighbouring cells are correlated)
MIN_COVER = 0.8            # cell must be at least this much candidate land
BUILDING_BUFFER_M = 3
ROAD_BUFFER_M = 8
PATH_RADIUS_M = 50
CONTEXT_RADII_M = (100, 250)
GAP_NDVI = 0.5             # spine points with NDVI below this count as a corridor gap
GAP_FLAG_DIST_M = 50
SPINE_STEP_M = 10
MIN_PLANTABLE_NDVI = 0.0
RESIDENTIAL = {"house", "terrace", "detached", "semidetached_house", "apartments", "residential", "bungalow",
               "dormitory"}
RASTER_DIR = CACHE_DIR / "rasters"
M_PER_DEG = 111_320.0


# ---------- candidate land and grid ----------

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


def cell_id(cell, cell_m: float = CELL_M) -> str:
    """Stable ID from the cell's position on the fixed metric grid (same cell, same ID, every rebuild)."""
    minx, miny, _, _ = cell.bounds
    return f"ELM-{round(minx / cell_m)}-{round(miny / cell_m)}"


def block_id(point, block_m: float = BLOCK_M) -> str:
    return f"B{math.floor(point.x / block_m)}-{math.floor(point.y / block_m)}"


# ---------- raster sampling ----------

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


def disc_mean(src, lon: float, lat: float, radius_m: float):
    """Mean of finite raster pixels whose centres lie within radius_m of a point; None if there are none."""
    dlat = radius_m / M_PER_DEG
    dlon = radius_m / (M_PER_DEG * math.cos(math.radians(lat)))
    w = from_bounds(lon - dlon, lat - dlat, lon + dlon, lat + dlat, src.transform).round_offsets().round_lengths()
    arr = src.read(1, window=w, boundless=True, fill_value=np.nan)
    if arr.size == 0:
        return None
    wt = src.window_transform(w)
    rows, cols = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
    xs, ys = wt.c + wt.a * (cols + 0.5), wt.f + wt.e * (rows + 0.5)
    dx, dy = (xs - lon) * M_PER_DEG * math.cos(math.radians(lat)), (ys - lat) * M_PER_DEG
    vals = arr[(dx ** 2 + dy ** 2 <= radius_m ** 2) & np.isfinite(arr)]
    return float(vals.mean()) if vals.size else None


def sample_points(src, points_m) -> np.ndarray:
    """Raster value (band 1) at points given in metric CRS; NaN where there is no data."""
    if not len(points_m):
        return np.array([])
    ll = gpd.GeoSeries(points_m, crs=METRIC_CRS).to_crs(4326)
    vals = np.array([v[0] for v in src.sample(zip(ll.x, ll.y))], dtype="float64")
    vals[~np.isfinite(vals)] = np.nan
    return vals


def line_points(lines_m, step_m: float = SPINE_STEP_M) -> list:
    return [line.interpolate(d) for line in lines_m for d in np.arange(0, line.length, step_m)]


def gap_points(spine_lines_m, ndvi_src, step_m: float = SPINE_STEP_M, gap_ndvi: float = GAP_NDVI) -> list:
    """Points along the corridor spine where latest NDVI is below gap_ndvi (clear data only)."""
    pts = line_points(spine_lines_m, step_m)
    vals = sample_points(ndvi_src, pts)
    return [p for p, v in zip(pts, vals) if np.isfinite(v) and v < gap_ndvi]


# ---------- building the site table ----------

def _rnd(v, n=2):
    return None if v is None or not np.isfinite(v) else round(float(v), n)


def build_sites(layers: dict, rasters: dict) -> gpd.GeoDataFrame:
    """layers: GeoDataFrames (EPSG:4326) named open_land, parks, corridor, spine, buildings, roads, paths.
    rasters: open rasterio datasets named ndvi_latest, ndvi_baseline, lst_latest, lst_baseline, lst_valid_latest.
    Returns a GeoDataFrame (EPSG:4326) of simulated sites with all measured features."""
    to_m = lambda name: layers[name].to_crs(METRIC_CRS).geometry
    land, open_part = candidate_land(to_m("open_land"), to_m("parks"), to_m("corridor"), to_m("buildings"),
                                     to_m("roads"))
    cells = grid_cells(land)
    gdf, _ = features_for_cells(cells, layers, rasters, open_part=open_part)
    return gdf


def features_for_cells(cells: list, layers: dict, rasters: dict, *, open_part=None, ids: list | None = None,
                       source: str = "simulated") -> tuple:
    """Measure the features of each cell (shapely polygons in METRIC_CRS) exactly as for the simulated sites.

    Returns (GeoDataFrame, kept): kept lists the index of every input cell that got a row, so a caller who supplied the
    cells can say which ones had no usable satellite data. open_part decides `origin` (None leaves it unset); ids
    replaces the grid-position site ids; source labels the rows. build_sites calls this, so the simulated sites and any
    user-supplied sites go through one code path."""
    to_m = lambda name: layers[name].to_crs(METRIC_CRS).geometry
    cells_4326 = list(gpd.GeoSeries(cells, crs=METRIC_CRS).to_crs(4326))

    ndvi = zonal(rasters["ndvi_latest"], cells_4326, np.mean)
    ndvi_b = zonal(rasters["ndvi_baseline"], cells_4326, np.mean)
    lst = zonal(rasters["lst_latest"], cells_4326, np.mean)
    lst_b = zonal(rasters["lst_baseline"], cells_4326, np.mean)
    valid = zonal(rasters["lst_valid_latest"], cells_4326, np.mean)
    canopy = zonal(rasters["ndvi_baseline"], cells_4326, lambda v: 100.0 * float(np.mean(v >= CANOPY_NDVI_THRESHOLD)))

    paths_m = list(to_m("paths"))
    path_union = unary_union(paths_m) if paths_m else None
    spine_m = list(to_m("spine"))
    gaps = gap_points(spine_m, rasters["ndvi_latest"])
    gap_geom = MultiPoint(gaps) if gaps else None
    spine_union = unary_union(spine_m) if spine_m else None
    park_union = unary_union(list(to_m("parks")))
    corridor_union = unary_union(list(to_m("corridor")))

    # path sample points with a "covered by canopy" flag, for the shade features
    p_pts = line_points(paths_m)
    p_ndvi = sample_points(rasters["ndvi_latest"], p_pts)
    keep = np.isfinite(p_ndvi)
    p_pts, p_covered = [p for p, k in zip(p_pts, keep) if k], p_ndvi[keep] >= CANOPY_NDVI_THRESHOLD
    p_tree = gpd.GeoSeries(p_pts, crs=METRIC_CRS).sindex if p_pts else None

    bld = to_m("buildings").reset_index(drop=True)
    bld_types = layers["buildings"]["building"].reset_index(drop=True)
    b_tree = bld.sindex

    rows, kept = [], []
    for i, (cell, g4326, n, nb, t, tb, v, c) in enumerate(zip(cells, cells_4326, ndvi, ndvi_b, lst, lst_b, valid, canopy)):
        if n is None or t is None or c is None:
            continue  # no clear satellite data over this cell
        if n < MIN_PLANTABLE_NDVI:
            continue  # negative NDVI is typically open water, not plantable
        ctr = cell.centroid
        lon, lat = g4326.centroid.x, g4326.centroid.y
        zone = cell.buffer(PATH_RADIUS_M)
        near_len = zone.intersection(path_union).length if path_union is not None else 0.0
        if p_tree is not None:
            idx = p_tree.query(zone, predicate="intersects")
            n_pts, n_cov = len(idx), int(p_covered[idx].sum())
        else:
            n_pts = n_cov = 0
        # share of the nearby path with canopy, from the 10 m sample points; the uncovered LENGTH is that share applied
        # to the exact path length, so it can never exceed path_length_within_50m (counting points x 10 m could)
        canopy_frac = n_cov / n_pts if n_pts else None
        uncovered = 0.0 if near_len == 0 else (near_len * (1 - canopy_frac) if canopy_frac is not None else None)
        disc = ctr.buffer(max(CONTEXT_RADII_M))
        bi = b_tree.query(disc, predicate="intersects")
        b_area = sum(bld.iloc[i].intersection(disc).area for i in bi)
        row = {
            "source": source,
            "origin": None if open_part is None else ("open_land" if ctr.within(open_part) else "corridor_edge"),
            "area_m2": round(cell.area, 1),
            "ndvi_mean": _rnd(n, 3), "lst_c_mean": _rnd(t), "canopy_pct_baseline": _rnd(c, 1),
            "ndvi_mean_baseline": _rnd(nb, 3), "lst_c_mean_baseline": _rnd(tb),
            "ndvi_change": _rnd(None if nb is None else n - nb, 3),
            "lst_change_c": _rnd(None if tb is None else t - tb),
            "lst_valid_frac": _rnd(v, 2),
            "dist_to_path_m": _rnd(ctr.distance(path_union) if path_union is not None else 9999.0, 1),
            "path_length_within_50m": _rnd(near_len, 1),
            "uncovered_path_length_50m": _rnd(uncovered, 1),
            "path_canopy_frac_50m": _rnd(canopy_frac, 2),
            "corridor_gap_flag": bool(gap_geom is not None and ctr.distance(gap_geom) <= GAP_FLAG_DIST_M),
            "corridor_gap_dist_m": _rnd(ctr.distance(gap_geom) if gap_geom is not None else 9999.0, 1),
            "dist_to_corridor_spine_m": _rnd(ctr.distance(spine_union) if spine_union is not None else 9999.0, 1),
            "dist_to_nearest_park_m": _rnd(ctr.distance(park_union), 1),
            "in_corridor": bool(ctr.within(corridor_union)),
            "buildings_within_250m": int(len(bi)),
            "residential_buildings_within_250m": int(sum(bld_types.iloc[i] in RESIDENTIAL for i in bi)),
            "built_up_frac_250m": _rnd(b_area / disc.area, 3),
            "block_id": block_id(ctr),
            "_id": cell_id(cell) if ids is None else ids[i], "geometry": g4326,
        }
        for r in CONTEXT_RADII_M:
            row[f"lst_mean_{r}m"] = _rnd(disc_mean(rasters["lst_latest"], lon, lat, r))
            row[f"ndvi_mean_{r}m"] = _rnd(disc_mean(rasters["ndvi_latest"], lon, lat, r), 3)
        rows.append(row)
        kept.append(i)
    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs=4326)
    if len(gdf):
        gdf.insert(0, "site_id", gdf.pop("_id"))
    return gdf, kept


def validate(gdf) -> None:
    for rec in gdf.drop(columns="geometry").to_dict("records"):
        SiteProperties(**{k: (None if isinstance(v, float) and np.isnan(v) else v) for k, v in rec.items()})
    if gdf["site_id"].duplicated().any():
        raise ValueError("duplicate site_id")


def data_version(features: list) -> str:
    """Short hash of every site (id, geometry, features). Same data in, same version out."""
    canon = json.dumps([[f["properties"], f["geometry"]] for f in features], sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(canon.encode("utf-8")).hexdigest()[:12]


def to_feature_collection(gdf) -> dict:
    fc = json.loads(gdf.to_json(drop_id=True))
    fc["data_version"] = data_version(fc["features"])
    return fc


def flat_table(gdf) -> pd.DataFrame:
    """One row per site, no geometry, with centroid lon/lat: easy to load in pandas."""
    cent = gdf.to_crs(METRIC_CRS).geometry.centroid.to_crs(4326)  # centroid in metres, not degrees
    df = gdf.drop(columns="geometry").copy()
    df.insert(1, "lon", cent.x.round(6))
    df.insert(2, "lat", cent.y.round(6))
    return df


def load_inputs() -> tuple:
    """The cached OSM layers (GeoDataFrames) and opened rasters the feature measurement needs. Close the rasters when done."""
    read = lambda n: gpd.read_file(OSM_DIR / f"{n}.geojson")
    layers = {n: read(n) for n in ("open_land", "parks", "buildings", "roads", "paths")}
    layers["corridor"] = gpd.read_file(CACHE_DIR / "corridor.geojson")
    layers["spine"] = gpd.read_file(CACHE_DIR / "corridor_spine.geojson")
    names = ("ndvi_latest", "ndvi_baseline", "lst_latest", "lst_baseline", "lst_valid_latest")
    return layers, {n: rasterio.open(RASTER_DIR / f"{n}.tif") for n in names}


def main() -> None:
    layers, opened = load_inputs()
    try:
        gdf = build_sites(layers, opened)
    finally:
        for src in opened.values():
            src.close()
    validate(gdf)
    fc = to_feature_collection(gdf)
    atomic.write_json(CACHE_DIR / "sites.geojson", fc)
    atomic.write_csv(flat_table(gdf), CACHE_DIR / "site_features.csv", index=False)
    print(f"{len(gdf)} simulated sites, data_version {fc['data_version']} -> {CACHE_DIR / 'sites.geojson'}")
    print(gdf.groupby("origin").size().to_dict(), "| gap-flagged:", int(gdf["corridor_gap_flag"].sum()),
          "| lst_valid_frac < 0.5:", int((gdf["lst_valid_frac"] < 0.5).sum()))
    cols = ["ndvi_mean", "lst_c_mean", "lst_mean_250m", "built_up_frac_250m", "uncovered_path_length_50m",
            "lst_valid_frac", "dist_to_corridor_spine_m"]
    print(gdf[cols].describe().round(2).to_string())


if __name__ == "__main__":
    main()
