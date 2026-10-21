import copy
import json

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
import rasterio
from fastapi.testclient import TestClient
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from shapely.geometry import LineString, Point, box

from backend import ml_io
from backend.api import store
from backend.api.main import app
from backend.osm.corridor import METRIC_CRS
from backend.schema import SiteProperties
from backend.sites import generate as g
from backend.validate_scores import validate

client = TestClient(app)
LON0, LAT0 = 101.5, 3.2


# ---------- stable IDs, blocks, version ----------

def test_cell_ids_are_stable_when_the_land_grows():
    small, large = box(700020, 354000, 700200, 354150), box(699900, 353900, 700400, 354300)
    ids_small = {g.cell_id(c) for c in g.grid_cells(small)}
    ids_large = {g.cell_id(c) for c in g.grid_cells(large)}
    assert ids_small and ids_small <= ids_large       # same cell, same ID, regardless of surrounding land
    assert g.cell_id(box(700020, 354000, 700050, 354030)) == "ELM-23334-11800"


def test_block_id_groups_neighbouring_cells():
    assert g.block_id(Point(700010, 354010)) == g.block_id(Point(700100, 354100))
    assert g.block_id(Point(700010, 354010)) != g.block_id(Point(700300, 354010))


def test_data_version_is_deterministic_and_sensitive():
    feats = [{"properties": {"site_id": "A", "x": 1}, "geometry": {"type": "Point", "coordinates": [0, 0]}}]
    assert g.data_version(feats) == g.data_version(copy.deepcopy(feats))
    changed = copy.deepcopy(feats)
    changed[0]["properties"]["x"] = 2
    assert g.data_version(feats) != g.data_version(changed)


# ---------- surroundings sampler ----------

def raster(values, origin=(LON0, LAT0), px=0.0001):
    arr = np.array(values, dtype="float32")
    mem = MemoryFile()
    with mem.open(driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1, dtype="float32",
                  crs="EPSG:4326", transform=from_origin(origin[0], origin[1], px, px), nodata=-np.inf) as dst:
        dst.write(arr, 1)
    return mem.open()


def test_disc_mean_uses_only_pixels_inside_the_radius_and_skips_nodata():
    vals = np.full((200, 200), 10.0)
    vals[100, 100] = 90.0                 # hot pixel at the centre
    vals[0:20, 0:20] = 1000.0             # far corner, must be excluded
    vals[100, 110] = -np.inf              # nodata inside the disc, must be ignored
    src = raster(vals)
    lon, lat = LON0 + 100.5 * 0.0001, LAT0 - 100.5 * 0.0001
    near = g.disc_mean(src, lon, lat, 30)
    far = g.disc_mean(src, lon, lat, 250)
    assert 10 < near < 90 and near > far > 10 and far < 20
    assert g.disc_mean(src, 120.0, 10.0, 100) is None            # outside the raster


# ---------- end-to-end site build on synthetic data ----------

@pytest.fixture
def synthetic():
    ox, oy = gpd.GeoSeries([Point(LON0, LAT0)], crs=4326).to_crs(METRIC_CRS).iloc[0].coords[0]
    m = lambda geom_fn: gpd.GeoSeries([geom_fn], crs=METRIC_CRS).to_crs(4326)
    box_m = lambda x0, y0, x1, y1: box(ox + x0, oy + y0, ox + x1, oy + y1)
    line_m = lambda *pts: LineString([(ox + x, oy + y) for x, y in pts])
    gdf = lambda geoms, **cols: gpd.GeoDataFrame({**cols, "geometry": list(gpd.GeoSeries(geoms, crs=METRIC_CRS).to_crs(4326))}, crs=4326)

    layers = {
        "open_land": gdf([box_m(300, -600, 500, -400)]),
        "parks": gdf([box_m(0, -600, 200, -400)]),
        "corridor": gdf([box_m(-50, -650, 560, -350)]),
        "spine": gdf([line_m((200, -500), (300, -500))]),
        "buildings": gdf([box_m(520, -480, 540, -460), box_m(600, -480, 620, -460)], building=["house", "yes"]),
        "roads": gdf([line_m((-100, -700), (700, -700))]),
        "paths": gdf([line_m((400, -300), (400, -700))]),
    }
    n = 200
    ndvi = np.full((n, n), 0.3)
    ndvi[:, 0:20] = 0.8                         # western strip (0-220 m east of origin) is canopy
    lst = np.full((n, n), 40.0)
    valid = np.ones((n, n))
    rasters = {"ndvi_latest": raster(ndvi), "ndvi_baseline": raster(ndvi - 0.05), "lst_latest": raster(lst),
               "lst_baseline": raster(lst - 1), "lst_valid_latest": raster(valid)}
    return layers, rasters


def test_build_sites_end_to_end_on_synthetic_data(synthetic):
    layers, rasters = synthetic
    sites = g.build_sites(layers, rasters)
    assert len(sites) > 10
    assert sites["site_id"].is_unique and sites["site_id"].str.startswith("ELM-").all()
    g.validate(sites)                                           # every row fits the SiteProperties schema
    props = sites.drop(columns="geometry").iloc[0]
    for field in ("lst_mean_250m", "built_up_frac_250m", "uncovered_path_length_50m", "lst_valid_frac",
                  "dist_to_corridor_spine_m", "block_id", "ndvi_change", "residential_buildings_within_250m"):
        assert field in sites.columns
    assert (sites["lst_valid_frac"] == 1).all()
    assert sites["lst_change_c"].round(2).eq(1.0).all()         # lst_latest minus lst_baseline was 1 degree
    assert sites["in_corridor"].any()
    # only one of the two nearby buildings is a house; the other is untyped ("yes")
    assert sites["residential_buildings_within_250m"].max() <= sites["buildings_within_250m"].max()
    assert sites["buildings_within_250m"].max() == 2 and sites["residential_buildings_within_250m"].max() == 1
    # sites near the path see uncovered path (the path is at NDVI 0.3, below the canopy threshold)
    near = sites[sites["dist_to_path_m"] < 40]
    assert len(near) and (near["uncovered_path_length_50m"] > 0).all() and (near["path_canopy_frac_50m"] == 0).all()


def test_path_under_full_canopy_counts_as_covered(synthetic):
    layers, rasters = synthetic
    rasters["ndvi_latest"] = raster(np.full((200, 200), 0.8))
    near = g.build_sites(layers, rasters).query("dist_to_path_m < 40")
    assert len(near) and (near["uncovered_path_length_50m"] == 0).all() and (near["path_canopy_frac_50m"] == 1).all()


def test_uncovered_path_never_exceeds_the_path_length(synthetic):
    layers, rasters = synthetic
    for ndvi_value in (0.3, 0.55, 0.8):                       # no canopy, partly, fully covered
        rasters["ndvi_latest"] = raster(np.full((200, 200), ndvi_value))
        sites = g.build_sites(layers, rasters)
        assert (sites["uncovered_path_length_50m"].dropna() <= sites["path_length_within_50m"] + 1e-9).all()


def test_uncovered_path_is_the_path_length_times_the_uncovered_share(synthetic):
    layers, rasters = synthetic
    bare = g.build_sites(layers, rasters).query("path_length_within_50m > 0")      # path at NDVI 0.3 is all uncovered
    assert len(bare) and (bare["uncovered_path_length_50m"] == bare["path_length_within_50m"]).all()
    rasters["ndvi_latest"] = raster(np.full((200, 200), 0.8))
    shaded = g.build_sites(layers, rasters).query("path_length_within_50m > 0")
    assert (shaded["uncovered_path_length_50m"] == 0).all() and (shaded["path_canopy_frac_50m"] == 1).all()


def test_real_sites_have_consistent_path_features():
    """Guards the committed data: a site can never have more uncovered path than path (this once reported 490 of 469 m)."""
    import pandas as pd
    from backend.config import CACHE_DIR
    df = pd.read_csv(CACHE_DIR / "site_features.csv")
    assert (df["uncovered_path_length_50m"].dropna() <= df["path_length_within_50m"] + 1e-6).all()
    assert (df.loc[df["path_length_within_50m"] == 0, "uncovered_path_length_50m"] == 0).all()
    assert df["path_canopy_frac_50m"].dropna().between(0, 1).all()


def test_build_sites_is_deterministic(synthetic):
    layers, rasters = synthetic
    a, b = g.build_sites(layers, rasters), g.build_sites(layers, rasters)
    assert g.data_version(g.to_feature_collection(a)["features"]) == g.data_version(g.to_feature_collection(b)["features"])


def test_flat_table_has_lon_lat_and_no_geometry(synthetic):
    sites = g.build_sites(*synthetic)
    df = g.flat_table(sites)
    assert "geometry" not in df.columns and df["lon"].between(101.4, 101.6).all() and df["lat"].between(3.1, 3.3).all()
    assert list(df.columns[:3]) == ["site_id", "lon", "lat"]


# ---------- scores validator and writer ----------

def sites_fc(ids=("A", "B", "C"), version="v1"):
    return {"type": "FeatureCollection", "data_version": version,
            "features": [{"type": "Feature", "geometry": None, "properties": {"site_id": i}} for i in ids]}


def score(sid, total, rank, **over):
    p = {"site_id": sid, "score_cooling": total, "score_connectivity": total, "score_shade": total,
         "score_total": total, "rank": rank}
    p.update(over)
    return {"type": "Feature", "geometry": None, "properties": p}


def scores_fc(feats, version="v1"):
    return {"type": "FeatureCollection", "data_version": version, "features": feats}


def test_valid_scores_pass_with_no_errors_or_warnings():
    errors, warnings = validate(scores_fc([score("A", 90, 1), score("B", 50, 2), score("C", 10, 3)]), sites_fc())
    assert errors == [] and warnings == []


@pytest.mark.parametrize("feats, fragment", [
    ([score("Z", 50, 1)], "not a current site"),
    ([score("A", 120, 1)], "outside 0-100"),
    ([score("A", None, 1)], "finite number"),
    ([score("A", float("nan"), 1)], "finite number"),
    ([score("A", 50, 0)], "rank must be an integer"),
    ([score("A", 50, 1), score("B", 40, 1)], "not unique"),
    ([score("A", 50, 1), score("A", 50, 2)], "more than once"),
    ([score("A", 10, 1), score("B", 90, 2)], "rank order disagrees"),
])
def test_validator_catches_each_problem(feats, fragment):
    errors, _ = validate(scores_fc(feats), sites_fc())
    assert any(fragment in e for e in errors), errors


def test_validator_warnings_for_missing_sites_stale_version_and_weights():
    _, warnings = validate(scores_fc([score("A", 90, 1)], version="old"), sites_fc(version="new"))
    assert any("no ML score" in w for w in warnings) and any("re-run scoring" in w for w in warnings)
    _, warnings = validate({"type": "FeatureCollection", "features": [score("A", 90, 1)]}, sites_fc())
    assert any("no data_version" in w for w in warnings)
    w = {"cooling": 1, "connectivity": 1, "shade": 1}
    bad = score("A", 90, 1, score_cooling=0, score_connectivity=0, score_shade=0)
    _, warnings = validate(scores_fc([bad, score("B", 50, 2), score("C", 10, 3)]), sites_fc(), w)
    assert any("does not match the weighted components" in x for x in warnings)


def test_validator_rejects_a_non_featurecollection():
    assert validate({"type": "Feature"}, sites_fc())[0]


def test_write_scores_round_trip_and_refusal(tmp_path):
    sites_path = tmp_path / "sites.geojson"
    sites_path.write_text(json.dumps(sites_fc()))
    df = pd.DataFrame({"site_id": ["A", "B", "C"], "score_cooling": [90, 50, 10], "score_connectivity": [90, 50, 10],
                       "score_shade": [90, 50, 10], "score_total": [90, 50, 10], "rank": [1, 2, 3]})
    out = ml_io.write_scores(df, path=tmp_path / "scores.geojson", sites_path=sites_path)
    saved = json.loads(out.read_text())
    assert saved["data_version"] == "v1" and len(saved["features"]) == 3
    assert saved["features"][0]["properties"]["rank"] == 1 and saved["features"][0]["geometry"] is None
    with pytest.raises(ValueError, match="outside 0-100"):
        ml_io.write_scores(df.assign(score_total=[190, 50, 10]), path=tmp_path / "bad.geojson", sites_path=sites_path)
    assert not (tmp_path / "bad.geojson").exists()
    with pytest.raises(ValueError, match="missing columns"):
        ml_io.write_scores(df.drop(columns="rank"), path=tmp_path / "x.geojson", sites_path=sites_path)
    with pytest.raises(ValueError, match="no ML score"):
        ml_io.write_scores(df.iloc[:2], path=tmp_path / "y.geojson", sites_path=sites_path, strict=True)


# ---------- API: data version and stale flag ----------

def site_feature(i):
    return {"type": "Feature", "geometry": None,
            "properties": {"site_id": f"S{i}", "source": "simulated", "area_m2": 900.0, "ndvi_mean": 0.3,
                           "lst_c_mean": 40.0 + i, "canopy_pct_baseline": 0.0, "dist_to_path_m": 10.0 * i,
                           "path_length_within_50m": 1.0, "corridor_gap_flag": False, "corridor_gap_dist_m": 5.0 * i}}


@pytest.fixture
def cache(tmp_path, monkeypatch):
    fc = {"type": "FeatureCollection", "data_version": "v-now", "features": [site_feature(1), site_feature(2)]}
    (tmp_path / "sites.geojson").write_text(json.dumps(fc))
    (tmp_path / "corridor.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": None, "properties": {}}]}))
    monkeypatch.setattr(store, "data_dir", lambda: tmp_path)
    store._parsed.clear()
    return tmp_path


def test_meta_reports_data_version_and_unknown_staleness_without_ml_scores(cache):
    m = client.get("/meta").json()
    assert m["data_version"] == "v-now" and m["scores_stale"] is None and m["scores_data_version"] is None


@pytest.mark.parametrize("version, stale", [("v-now", False), ("v-old", True), (None, None)])
def test_meta_flags_stale_ml_scores(cache, version, stale):
    fc = {"type": "FeatureCollection", "features": [score("S1", 80, 1), score("S2", 20, 2)]}
    if version:
        fc["data_version"] = version
    (cache / "scores.geojson").write_text(json.dumps(fc))
    m = client.get("/meta").json()
    assert m["scores_stale"] is stale and m["scores_data_version"] == version and m["score_source"] == "ml"


def test_new_features_are_served_and_old_data_still_validates():
    props = site_feature(1)["properties"]
    SiteProperties(**props)
    SiteProperties(**props, lst_mean_250m=41.5, built_up_frac_250m=0.1, block_id="B1-2", in_corridor=True)
    with pytest.raises(Exception):
        SiteProperties(**props, built_up_frac_250m=3)
