import json
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from backend.api import store
from backend.api.main import app
from backend.build_cache import ORDER, plan_steps, update_sources_built
from backend.config import ATTRIBUTION
from backend.gee.series import year_windows

client = TestClient(app)
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 20


def site(i, lst, ndvi, gap, path):
    return {"type": "Feature", "geometry": None,
            "properties": {"site_id": f"S{i}", "source": "simulated", "area_m2": 900.0, "ndvi_mean": ndvi,
                           "lst_c_mean": lst, "canopy_pct_baseline": 0.0, "dist_to_path_m": path,
                           "path_length_within_50m": 1.0, "corridor_gap_flag": False, "corridor_gap_dist_m": gap}}


@pytest.fixture
def full_cache(tmp_path, monkeypatch):
    fc = lambda feats: json.dumps({"type": "FeatureCollection", "features": feats})
    (tmp_path / "sites.geojson").write_text(fc([site(1, 45, .1, 0, 5), site(2, 36, .7, 400, 400)]))
    (tmp_path / "corridor.geojson").write_text(fc([{"type": "Feature", "geometry": None, "properties": {}}]))
    (tmp_path / "series.json").write_text(json.dumps({"points": [{"label": "y1", "canopy_pct": 10}]}))
    (tmp_path / "overlays").mkdir()
    (tmp_path / "overlays" / "ndvi_latest.png").write_bytes(PNG)
    (tmp_path / "overlays" / "overlays.json").write_text(json.dumps(
        {"overlays": [{"name": "ndvi_latest", "url": "/layers/overlays/ndvi_latest.png"}]}))
    (tmp_path / "secret.png").write_bytes(b"nope")
    monkeypatch.setattr(store, "data_dir", lambda: tmp_path)
    store._parsed.clear()
    return tmp_path


def test_meta_has_attribution_and_build_time(full_cache):
    m = client.get("/meta").json()
    assert m["attribution"] == ATTRIBUTION and any("OpenStreetMap" in a for a in m["attribution"])
    assert m["generated_at"]  # falls back to the sites file mtime
    (full_cache / "build_info.json").write_text(json.dumps({"generated_at": "2026-10-21T00:00:00+00:00"}))
    assert client.get("/meta").json()["generated_at"] == "2026-10-21T00:00:00+00:00"


def test_series_overlays_and_png_served(full_cache):
    assert client.get("/summary/series").json()["points"][0]["label"] == "y1"
    assert client.get("/layers/overlays").json()["overlays"][0]["name"] == "ndvi_latest"
    r = client.get("/layers/overlays/ndvi_latest.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content == PNG


def test_overlay_names_are_whitelisted(full_cache):
    for bad in ("secret", "..%2Fsecret", "nope"):
        assert client.get(f"/layers/overlays/{bad}.png").status_code == 404


def test_missing_series_and_overlays_are_404_not_500(tmp_path, monkeypatch):
    (tmp_path / "sites.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": []}))
    monkeypatch.setattr(store, "data_dir", lambda: tmp_path)
    store._parsed.clear()
    assert client.get("/summary/series").status_code == 404
    assert client.get("/layers/overlays").status_code == 404


def test_weights_endpoint_and_file_override(full_cache):
    w = client.get("/weights").json()
    assert w["source"] == "config" and sum(w["default"].values()) == pytest.approx(1)
    (full_cache / "weights.json").write_text(json.dumps({"cooling": 2, "connectivity": 1, "shade": 1}))
    w = client.get("/weights").json()
    assert w["source"] == "file" and w["default"]["cooling"] == pytest.approx(0.5)
    (full_cache / "weights.json").write_text(json.dumps({"cooling": 1}))  # malformed: falls back to config
    assert client.get("/weights").json()["default"]["cooling"] == pytest.approx(0.4)


def test_weight_requests_do_not_leak_into_later_requests(full_cache):
    before = client.get("/sites").json()["features"]
    client.get("/sites?w_cooling=0&w_connectivity=0&w_shade=1")
    after = client.get("/sites").json()["features"]
    assert before == after


def test_cache_file_change_is_picked_up(full_cache):
    assert client.get("/meta").json()["site_count"] == 2
    fc = {"type": "FeatureCollection", "features": [site(1, 45, .1, 0, 5)]}
    import os, time
    time.sleep(0.01)
    (full_cache / "sites.geojson").write_text(json.dumps(fc))
    os.utime(full_cache / "sites.geojson", None)
    assert client.get("/meta").json()["site_count"] == 1


def test_build_plan_orders_and_skips():
    assert plan_steps() == ORDER
    assert "gee_export" not in plan_steps(skip_gee=True) and "osm_download" in plan_steps(skip_gee=True)
    off = plan_steps(offline=True)
    assert off == ["corridor", "overlays", "sites"]


def test_year_windows_are_consecutive_oct_to_sep():
    w = year_windows()
    assert len(w) == 5 and w[0][1:] == ("2021-10-01", "2022-09-30") and w[-1][1:] == ("2025-10-01", "2026-09-30")
    assert all(w[i][2] < w[i + 1][1] for i in range(4))


def test_api_does_not_import_earth_engine_or_osm_libs():
    code = ("import sys; import backend.api.main; "
            "bad = [m for m in ('ee', 'osmnx', 'osmium', 'rasterio') if m in sys.modules]; "
            "sys.exit(1 if bad else 0)")
    assert subprocess.run([sys.executable, "-c", code]).returncode == 0


def test_offline_rebuild_keeps_old_source_timestamps():
    now, old = "2026-10-21T01:00:00+00:00", "2026-10-20T10:00:00+00:00"
    prev = {"osm": old, "satellite": old}
    assert update_sources_built(prev, ["corridor", "sites"], now, {}) == prev                 # nothing downloaded
    assert update_sources_built(prev, ["gee_export"], now, {})["satellite"] == now            # satellite rebuilt
    assert update_sources_built({}, ["sites"], now, {"osm": "f1", "satellite": "f2"}) == {"osm": "f1", "satellite": "f2"}
    assert update_sources_built({}, ["sites"], now, {}) == {}                                  # unknown stays unknown
