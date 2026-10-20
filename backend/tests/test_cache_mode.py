import json

import pytest
from fastapi.testclient import TestClient

from backend.api import store
from backend.api.main import app
from backend.schema import SiteProperties

client = TestClient(app)


def site(i, lst, ndvi, gap, path):
    return {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[101.5, 3.2], [101.5001, 3.2],
            [101.5001, 3.2001], [101.5, 3.2]]]},
            "properties": {"site_id": f"ELM-{i}", "source": "simulated", "origin": "open_land", "area_m2": 900.0,
                           "ndvi_mean": ndvi, "lst_c_mean": lst, "canopy_pct_baseline": 0.0,
                           "dist_to_path_m": path, "path_length_within_50m": 10.0,
                           "corridor_gap_flag": gap < 50, "corridor_gap_dist_m": gap}}


@pytest.fixture
def cache_dir(tmp_path, monkeypatch):
    sites = [site(1, 45, 0.1, 0, 5), site(2, 36, 0.7, 400, 400), site(3, 40, 0.3, 100, 100)]
    (tmp_path / "sites.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": sites}))
    (tmp_path / "corridor.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": None, "properties": {"approximate": True}}]}))
    monkeypatch.setattr(store, "data_dir", lambda: tmp_path)
    return tmp_path


def test_cache_without_ml_scores_serves_labelled_placeholder(cache_dir):
    body = client.get("/sites").json()["features"]
    assert [f["properties"]["rank"] for f in body] == [1, 2, 3]
    assert body[0]["properties"]["site_id"] == "ELM-1"
    assert all(f["properties"]["score_source"] == "placeholder" for f in body)
    for f in body:
        SiteProperties(**f["properties"])
    meta = client.get("/meta").json()
    assert meta["data_mode"] == "cache" and meta["score_source"] == "placeholder"


def test_ml_scores_file_takes_over(cache_dir):
    ml = [{"type": "Feature", "geometry": None, "properties": {
        "site_id": f"ELM-{i}", "score_cooling": 10 * i, "score_connectivity": 10 * i, "score_shade": 10 * i,
        "score_total": 10.0 * i, "rank": 4 - i}} for i in (1, 2, 3)]
    (cache_dir / "scores.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": ml}))
    body = client.get("/sites").json()["features"]
    assert [f["properties"]["site_id"] for f in body] == ["ELM-3", "ELM-2", "ELM-1"]
    assert {f["properties"]["score_source"] for f in body} == {"ml"}
    assert client.get("/meta").json()["score_source"] == "ml"


def test_weight_params_re_rank_and_validate(cache_dir):
    default = [f["properties"]["site_id"] for f in client.get("/sites").json()["features"]]
    shade_only = client.get("/sites?w_cooling=0&w_connectivity=0&w_shade=1").json()["features"]
    assert shade_only[0]["properties"]["site_id"] == "ELM-1"  # closest to a path
    assert shade_only[0]["properties"]["score_total"] == shade_only[0]["properties"]["score_shade"]
    assert default[0] == "ELM-1"
    assert client.get("/sites?w_cooling=0&w_connectivity=0&w_shade=0").status_code == 422
    assert client.get("/sites?w_shade=-1").status_code == 422
