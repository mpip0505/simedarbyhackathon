"""Geometry fixtures test screening heuristics, never legal setback or planting approval."""
import geopandas as gpd
import json
from fastapi.testclient import TestClient
from shapely.geometry import LineString, box

from backend.conflicts import screen_site, build_report
from backend.osm.corridor import METRIC_CRS


def test_conflicts_use_polygon_edges_and_report_each_mapped_trigger():
    cell = box(0, 0, 30, 30)
    r = screen_site(cell, [LineString([(40, -100), (40, 100)])], [box(-15, 0, -5, 20)], [LineString([(0, 15), (30, 15)])])
    assert r["state"] == "review"
    assert {f["code"] for f in r["flags"]} == {"road-edge", "building-edge", "path-overlap"}
    assert r["distances_m"]["road"] == 10


def test_empty_or_missing_layers_are_unknown_and_never_safe():
    cell = box(0, 0, 30, 30)
    r = screen_site(cell, None, [], [])
    assert r["state"] == "unknown" and len(r["unknown_layers"]) == 3
    far = [box(1000, 1000, 1020, 1020)]
    r = screen_site(cell, far, far, [LineString([(1000, 0), (1000, 100)])])
    assert r["state"] == "no-trigger"
    assert "safe" not in r["state"]


def test_report_preserves_ids_and_version_without_changing_scores():
    sites = gpd.GeoDataFrame({"site_id": ["S"], "geometry": [box(0, 0, 30, 30)]}, crs=METRIC_CRS)
    line = gpd.GeoDataFrame(geometry=[LineString([(40, -50), (40, 50)])], crs=METRIC_CRS)
    report = build_report(sites.to_crs(4326), {"roads": line, "buildings": None, "paths": None}, "v1")
    assert report["data_version"] == "v1"
    assert report["sites"]["S"]["state"] == "review"
    assert "not an approval" in report["note"]
    assert report["thresholds_m"] == {"road_edge": 15, "building_edge": 10, "path_overlap": 0}


def test_conflict_freshness_requires_a_site_version_and_unknown_artifacts_degrade(tmp_path, monkeypatch):
    from backend.api import store
    from backend.api.main import app
    from backend.provenance import file_hashes
    monkeypatch.setattr(store, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(store, "data_mode", lambda: "cache")
    monkeypatch.setattr(store, "_load", lambda _: {})
    osm = tmp_path / "osm"
    osm.mkdir()
    (osm / "roads.geojson").write_text("{}", encoding="utf-8")
    path = tmp_path / "conflicts.json"
    path.write_text(json.dumps({"sites": {}, "input_hashes": file_hashes(osm, ["roads.geojson"])}), encoding="utf-8")
    store._parsed.clear()
    assert store.load_conflicts()["stale"] is None
    path.write_text("[]", encoding="utf-8")
    store._parsed.clear()
    assert TestClient(app).get("/screening/conflicts").status_code == 404
