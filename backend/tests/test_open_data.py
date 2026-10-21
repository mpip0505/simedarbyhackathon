"""The fallback builds from OSM layers only, without reading any satellite artifact."""
import json

import geopandas as gpd
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import LineString, box

from backend.open_data import build
from backend.osm.corridor import METRIC_CRS


def osm_fixture(directory):
    directory.mkdir(exist_ok=True)
    geoms = {"open_land": [box(300000, 330000, 300180, 330180)], "parks": [box(300200, 330000, 300300, 330100)],
             "roads": [LineString([(300000, 330000), (300180, 330000)])],
             "paths": [LineString([(300000, 330060), (300180, 330060)])], "buildings": [box(300060, 330060, 300090, 330090)]}
    for name, geometry in geoms.items():
        gpd.GeoDataFrame(geometry=geometry, crs=METRIC_CRS).to_crs(4326).to_file(directory / f"{name}.geojson", driver="GeoJSON")


def test_osm_only_build_is_deterministic_and_has_no_satellite_measurements(tmp_path):
    osm_fixture(tmp_path)
    r = build(tmp_path)
    assert r == build(tmp_path)
    assert r["source_mode"] == "osm-only"
    assert len(r["features"]) > 5
    assert len(r["input_hashes"]) == 5
    assert "not a shade survey" in r["note"]
    assert sorted(f["properties"]["rank"] for f in r["features"]) == list(range(1, len(r["features"]) + 1))
    for f in r["features"]:
        p = f["properties"]
        assert p["source"] == "simulated" and p["site_id"].startswith("OSM-")
        assert "lst_c_mean" not in p and "score_cooling" not in p and "score_shade" not in p
        assert p["conflicts"]["distances_m"]["building"] >= 0


def test_fallback_candidates_do_not_intersect_buildings_or_roads(tmp_path):
    osm_fixture(tmp_path)
    r = build(tmp_path)
    cells = gpd.GeoDataFrame.from_features(r["features"], crs=4326).to_crs(METRIC_CRS)
    for name in ("buildings", "roads"):
        layer = gpd.read_file(tmp_path / f"{name}.geojson").to_crs(METRIC_CRS).union_all()
        assert all(g.intersection(layer).area < 0.001 for g in cells.geometry) if name == "buildings" else all(g.intersection(layer).length < 0.001 for g in cells.geometry)


def test_missing_layers_are_a_clear_error(tmp_path):
    with pytest.raises(ValueError, match="Missing OSM layer"):
        build(tmp_path)


def test_absent_or_wrong_shape_fallback_artifact_is_404(tmp_path, monkeypatch):
    from backend.api import store
    from backend.api.main import app
    monkeypatch.setattr(store, "CACHE_DIR", tmp_path)
    store._parsed.clear()
    assert TestClient(app).get("/screening/open-data").status_code == 404
    (tmp_path / "open_data_sites.geojson").write_text("[]", encoding="utf-8")
    assert TestClient(app).get("/screening/open-data").status_code == 404


def test_fallback_endpoint_works_without_normal_sites_summary_or_scores(tmp_path, monkeypatch):
    from backend.api import store
    from backend.api.main import app
    osm = tmp_path / "osm"
    osm_fixture(osm)
    report = build(osm)
    (tmp_path / "open_data_sites.geojson").write_text(json.dumps(report), encoding="utf-8")
    monkeypatch.setattr(store, "CACHE_DIR", tmp_path)
    store._parsed.clear()
    r = TestClient(app).get("/screening/open-data")
    assert r.status_code == 200
    assert r.json()["source_mode"] == "osm-only" and r.json()["stale"] is False
    (osm / "paths.geojson").write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
    assert TestClient(app).get("/screening/open-data").json()["stale"] is True
