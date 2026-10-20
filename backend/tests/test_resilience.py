import json
import logging
import os
import threading
import time

import geopandas as gpd
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from shapely.geometry import Point

from backend import atomic
from backend.api import selfcheck, store
from backend.api.main import app

client = TestClient(app)


def site(i, **over):
    p = {"site_id": f"S{i}", "source": "simulated", "area_m2": 900.0, "ndvi_mean": 0.3, "lst_c_mean": 40.0 + i,
         "canopy_pct_baseline": 0.0, "dist_to_path_m": 10.0 * i, "path_length_within_50m": 1.0,
         "corridor_gap_flag": False, "corridor_gap_dist_m": 5.0 * i}
    p.update(over)
    return {"type": "Feature", "geometry": None, "properties": p}


SUMMARY = {"baseline": {"label": "b", "start": "2021-10-01", "end": "2023-09-30", "canopy_pct": 9.0, "mean_lst_c": 38.0},
           "latest": {"label": "l", "start": "2024-10-01", "end": "2026-09-30", "canopy_pct": 10.0, "mean_lst_c": 41.0},
           "delta_canopy_pct_points": 1.0, "delta_mean_lst_c": 3.0, "caveats": ["x"]}


def fc(features, **extra):
    return {"type": "FeatureCollection", **extra, "features": features}


def score(sid, total, rank, **over):
    p = {"site_id": sid, "score_cooling": total, "score_connectivity": total, "score_shade": total,
         "score_total": total, "rank": rank}
    p.update(over)
    return {"type": "Feature", "geometry": None, "properties": p}


@pytest.fixture
def cache(tmp_path, monkeypatch):
    atomic.write_json(tmp_path / "sites.geojson", fc([site(1), site(2), site(3)], data_version="v1"))
    atomic.write_json(tmp_path / "corridor.geojson", fc([{"type": "Feature", "geometry": None, "properties": {}}]))
    atomic.write_json(tmp_path / "summary.json", SUMMARY)
    monkeypatch.setattr(store, "data_dir", lambda: tmp_path)
    store._parsed.clear()
    store._warned.clear()
    return tmp_path


# ---------- atomic writes ----------

def test_atomic_write_leaves_no_temp_files(tmp_path):
    atomic.write_json(tmp_path / "a.json", {"x": 1})
    atomic.write_text(tmp_path / "b.txt", "hi")
    atomic.write_bytes(tmp_path / "c.bin", b"\x00\x01")
    assert json.loads((tmp_path / "a.json").read_text()) == {"x": 1}
    assert sorted(p.name for p in tmp_path.iterdir()) == ["a.json", "b.txt", "c.bin"]


def test_failed_swap_keeps_the_old_file_and_cleans_up(tmp_path, monkeypatch):
    target = tmp_path / "a.json"
    atomic.write_json(target, {"v": "old"})

    def boom(src, dst):
        raise OSError("disk full")
    monkeypatch.setattr(atomic.os, "replace", boom)
    with pytest.raises(OSError):
        atomic.write_json(target, {"v": "new"})
    assert json.loads(target.read_text()) == {"v": "old"}
    assert [p.name for p in tmp_path.iterdir()] == ["a.json"]


def test_failure_while_writing_never_touches_the_old_file(tmp_path):
    target = tmp_path / "a.json"
    atomic.write_json(target, {"v": "old"})
    with pytest.raises(TypeError):
        atomic.write_json(target, {"v": object()})  # not serialisable
    assert json.loads(target.read_text()) == {"v": "old"} and [p.name for p in tmp_path.iterdir()] == ["a.json"]


def test_reader_never_sees_a_partial_file_while_writer_swaps(tmp_path):
    target = tmp_path / "big.json"
    atomic.write_json(target, {"n": 0, "pad": "x" * 200_000})
    stop, failures, writer_errors = threading.Event(), [], []

    def reader():
        while not stop.is_set():
            try:
                json.loads(target.read_text(encoding="utf-8"))
            except FileNotFoundError:
                failures.append("missing")
            except ValueError as exc:
                failures.append(f"partial: {exc}")
            except PermissionError:
                pass  # Windows may refuse an open during the swap instant; not a partial read

    t = threading.Thread(target=reader)
    t.start()
    try:
        for i in range(60):
            try:
                atomic.write_json(target, {"n": i, "pad": "y" * (150_000 + (i % 2) * 100_000)})
            except Exception as exc:
                writer_errors.append(exc)
    finally:
        stop.set()
        t.join()
    assert failures == [] and writer_errors == []


def test_geodataframe_csv_and_image_writers_round_trip(tmp_path):
    gdf = gpd.GeoDataFrame({"name": ["a"]}, geometry=[Point(101.5, 3.2)], crs=4326)
    atomic.write_geodataframe(gdf, tmp_path / "p.geojson")
    atomic.write_csv(pd.DataFrame({"a": [1, 2]}), tmp_path / "t.csv", index=False)
    atomic.write_image(Image.new("RGBA", (2, 2), (1, 2, 3, 255)), tmp_path / "i.png")
    assert gpd.read_file(tmp_path / "p.geojson").iloc[0]["name"] == "a"
    text = (tmp_path / "p.geojson").read_text()
    assert '"name": "p"' in text and ".tmp" not in text          # no temp-file name or process id in the output
    atomic.write_geodataframe(gdf, tmp_path / "p.geojson")
    assert (tmp_path / "p.geojson").read_text() == text         # rewriting identical data gives identical bytes
    assert pd.read_csv(tmp_path / "t.csv")["a"].tolist() == [1, 2]
    assert Image.open(tmp_path / "i.png").size == (2, 2)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["i.png", "p.geojson", "t.csv"]


# ---------- reading: last good copy ----------

def bump(path):
    t = time.time() + 5
    os.utime(path, (t, t))


def test_corrupt_file_after_a_good_read_serves_the_last_good_copy(cache):
    assert client.get("/meta").json()["site_count"] == 3
    (cache / "sites.geojson").write_text('{"type": "FeatureColl')   # truncated, as a crashed writer would leave it
    bump(cache / "sites.geojson")
    r = client.get("/sites")
    assert r.status_code == 200 and len(r.json()["features"]) == 3


def test_deleted_file_after_a_good_read_serves_the_last_good_copy(cache):
    client.get("/sites")
    (cache / "sites.geojson").unlink()
    assert client.get("/sites").status_code == 200


def test_never_readable_file_gives_a_clean_503_with_request_id(cache):
    (cache / "sites.geojson").write_text("not json at all")
    r = client.get("/sites")
    body = r.json()
    assert r.status_code == 503 and body["error"] == "data_unavailable"
    assert body["request_id"] == r.headers["X-Request-ID"] and "Traceback" not in r.text


# ---------- a bad ML scores file must never break the API ----------

BAD_SCORES = {
    "truncated json": '{"type": "FeatureCollection", "features": [{"type": "Fea',
    "a list not an object": "[1, 2, 3]",
    "features not a list": json.dumps({"type": "FeatureCollection", "features": "oops"}),
    "missing site_id": json.dumps(fc([{"type": "Feature", "geometry": None, "properties": {"score_total": 5}}])),
    "string score": json.dumps(fc([score("S1", "high", 1)])),
    "out of range": json.dumps(fc([score("S1", 250, 1)])),
    "unknown site id": json.dumps(fc([score("NOPE", 50, 1)])),
    "null score": json.dumps(fc([score("S1", None, 1)])),
    "duplicate rank": json.dumps(fc([score("S1", 90, 1), score("S2", 80, 1), score("S3", 70, 3)])),
    "empty file": "",
}


@pytest.mark.parametrize("name", list(BAD_SCORES))
def test_bad_scores_file_is_ignored_and_reported_not_fatal(cache, name, caplog):
    (cache / "scores.geojson").write_text(BAD_SCORES[name], encoding="utf-8")
    with caplog.at_level(logging.WARNING, logger="backend"):
        r = client.get("/sites")
        meta = client.get("/meta").json()
    assert r.status_code == 200 and len(r.json()["features"]) == 3
    assert {f["properties"]["score_source"] for f in r.json()["features"]} == {"placeholder"}
    assert meta["score_source"] == "placeholder" and meta["scores_error"]
    assert "scores.geojson ignored" in caplog.text
    assert client.get("/sites/S1").status_code == 200 and client.get("/health/deep").status_code == 200


def test_scores_file_recovers_when_fixed(cache):
    (cache / "scores.geojson").write_text("garbage")
    assert client.get("/meta").json()["scores_error"]
    atomic.write_json(cache / "scores.geojson",
                      fc([score("S1", 90, 1), score("S2", 50, 2), score("S3", 10, 3)], data_version="v1"))
    meta = client.get("/meta").json()
    assert meta["scores_error"] is None and meta["score_source"] == "ml" and meta["scores_stale"] is False
    assert [f["properties"]["site_id"] for f in client.get("/sites").json()["features"]] == ["S1", "S2", "S3"]


def test_partial_ml_file_keeps_placeholders_for_unscored_sites(cache):
    atomic.write_json(cache / "scores.geojson", fc([score("S1", 90, 1)], data_version="v1"))
    feats = {f["properties"]["site_id"]: f["properties"] for f in client.get("/sites").json()["features"]}
    assert feats["S1"]["score_source"] == "ml" and feats["S2"]["score_source"] == "placeholder"
    assert client.get("/meta").json()["score_source"] == "placeholder"   # mixed sets are reported conservatively


def test_malformed_weights_file_falls_back_to_config(cache):
    for text in ('{"cooling": 1}', "[1,2]", "nonsense", '{"cooling": "a", "connectivity": 1, "shade": 1}'):
        (cache / "weights.json").write_text(text)
        store._parsed.clear()
        r = client.get("/weights")
        assert r.status_code == 200 and r.json()["source"] == "config" and sum(r.json()["default"].values()) == pytest.approx(1)
        assert client.get("/sites").status_code == 200


# ---------- unexpected errors ----------

def test_unexpected_error_returns_small_json_without_leaking_details(cache, monkeypatch, caplog):
    def explode():
        raise RuntimeError("secret internal path C:/Users/x/boom")
    monkeypatch.setattr(store, "load_corridor", explode)
    with caplog.at_level(logging.ERROR, logger="backend"):
        r = client.get("/layers/corridor")
    assert r.status_code == 500 and r.json()["error"] == "internal_error"
    assert "secret" not in r.text and "Traceback" not in r.text
    assert r.json()["request_id"] == r.headers["X-Request-ID"]
    assert "secret internal path" in caplog.text            # the detail goes to the log, not the client
    assert client.get("/health").status_code == 200          # and the server keeps working


def test_every_response_carries_a_request_id(cache):
    ids = {client.get(p).headers["X-Request-ID"] for p in ("/health", "/sites", "/sites/NOPE", "/nope")}
    assert len(ids) == 4 and all(len(i) == 8 for i in ids)


# ---------- incomplete cache and startup checks ----------

def test_incomplete_cache_falls_back_to_mock_loudly(tmp_path, monkeypatch, caplog):
    atomic.write_json(tmp_path / "sites.geojson", fc([site(1)]))          # sites exist, corridor + summary do not
    monkeypatch.setattr(store, "CACHE_DIR", tmp_path)
    store._warned.clear()
    with caplog.at_level(logging.WARNING, logger="backend"):
        assert store.data_dir() == store.MOCK_DIR and store.data_mode() == "mock"
        store.data_dir()
    assert caplog.text.count("cache folder is incomplete") == 1           # logged once, not on every request
    assert "corridor.geojson" in caplog.text and "summary.json" in caplog.text


def test_complete_cache_is_used(tmp_path, monkeypatch):
    for name in store.REQUIRED_FILES:
        atomic.write_json(tmp_path / name, {})
    monkeypatch.setattr(store, "CACHE_DIR", tmp_path)
    assert store.data_dir() == tmp_path and store.data_mode() == "cache"


def test_selfcheck_passes_on_a_sound_cache(cache):
    result = selfcheck.check()
    assert result["ok"] and result["problems"] == [] and result["site_count"] == 3
    assert client.get("/health/deep").status_code == 200


def test_selfcheck_reports_contract_violations_and_missing_files(cache):
    atomic.write_json(cache / "sites.geojson", fc([site(1), site(2, ndvi_mean=5), site(1)], data_version="v1"))
    result = selfcheck.check()
    assert not result["ok"] and any("break the data contract" in p for p in result["problems"])
    assert any("duplicate site_id" in p for p in result["problems"])
    (cache / "corridor.geojson").unlink()
    store._parsed.clear()
    r = client.get("/health/deep")
    assert r.status_code == 503 and any("corridor.geojson" in p for p in r.json()["problems"])


def test_selfcheck_warns_about_bad_scores_without_failing(cache):
    (cache / "scores.geojson").write_text("garbage")
    result = selfcheck.check()
    assert result["ok"] and any("scores.geojson ignored" in w for w in result["warnings"])


def test_startup_logs_what_is_being_served(cache, caplog):
    with caplog.at_level(logging.INFO, logger="backend"):
        with TestClient(app) as c:
            assert c.get("/health").status_code == 200
    assert "startup: data_mode=cache sites=3 ok=True" in caplog.text


def test_real_cache_passes_the_deep_check():
    """Guards the committed data: if someone commits a broken cache, this fails."""
    store._parsed.clear()
    result = selfcheck.check()
    assert result["ok"], result["problems"]
