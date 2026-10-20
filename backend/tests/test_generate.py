import geopandas as gpd
import numpy as np
import pytest
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from shapely.geometry import LineString, box

from backend.osm.corridor import METRIC_CRS
from backend.sites import generate as g


def test_grid_cells_are_deterministic_disjoint_and_inside_land():
    land = box(120, 120, 420, 270)  # aligned to the fixed 30 m grid
    a, b = g.grid_cells(land), g.grid_cells(land)
    assert [c.bounds for c in a] == [c.bounds for c in b]
    assert len(a) == 10 * 5  # 300 m x 150 m of 30 m cells
    assert all(land.contains(c) or c.intersection(land).area >= 0.8 * c.area for c in a)
    assert all(not x.overlaps(y) for i, x in enumerate(a) for y in a[i + 1:])


def test_grid_cells_drop_slivers():
    land = box(0, 0, 30, 20)  # only 67% of one cell, below the 80% cover rule
    assert g.grid_cells(land) == []


def test_candidate_land_excludes_buildings_roads_and_parks():
    open_land = [box(0, 0, 200, 200)]
    buildings = gpd.GeoSeries([box(50, 50, 80, 80)])
    roads = gpd.GeoSeries([LineString([(0, 150), (200, 150)])])
    parks = [box(150, 0, 200, 60)]
    corridor = [box(0, 0, 200, 200)]
    land, open_part = g.candidate_land(open_land, parks, corridor, buildings, roads)
    assert not land.intersects(box(55, 55, 75, 75))                # building footprint removed
    assert not land.intersects(box(10, 145, 190, 155))             # road plus buffer removed
    assert open_part.area >= land.area - 1e-6                      # here open land covers all of it


def raster(values, origin=(101.5, 3.2), px=0.001):
    arr = np.array(values, dtype="float32")
    mem = MemoryFile()
    with mem.open(driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1, dtype="float32",
                  crs="EPSG:4326", transform=from_origin(origin[0], origin[1], px, px), nodata=-np.inf) as dst:
        dst.write(arr, 1)
    return mem.open()


def test_zonal_means_and_skips_nodata():
    src = raster([[0.2, 0.4, -np.inf], [0.6, 0.8, -np.inf]])
    inside = box(101.5, 3.198, 101.502, 3.2)         # the four valid pixels
    nodata_only = box(101.502, 3.198, 101.503, 3.2)  # the -inf column
    assert g.zonal(src, [inside, nodata_only], np.mean) == [pytest.approx(0.5), None]


def test_gap_points_only_where_ndvi_is_low():
    # 1 row of pixels west to east: green, green, bare, bare. Spine runs along the row.
    src = raster([[0.8, 0.8, 0.1, 0.1]], px=0.001)
    line_4326 = gpd.GeoSeries([LineString([(101.5005, 3.1995), (101.5035, 3.1995)])], crs=4326)
    line_m = list(line_4326.to_crs(METRIC_CRS))
    pts = g.gap_points(line_m, src, step_m=20)
    assert pts, "expected gap points on the bare half"
    lons = [p for p in gpd.GeoSeries(pts, crs=METRIC_CRS).to_crs(4326).x]
    assert min(lons) >= 101.502 - 1e-4  # nothing flagged on the green half
