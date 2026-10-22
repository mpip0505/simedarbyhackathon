import pytest
from fastapi.testclient import TestClient

from backend.api import store
from backend.api.main import app
from backend.config import MOCK_DIR
from backend.schema import SiteProperties

client = TestClient(app)


@pytest.fixture(autouse=True)
def use_mock_data(monkeypatch):
    monkeypatch.setattr(store, "data_dir", lambda: MOCK_DIR)  # keep these tests independent of the cache


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_sites_are_ranked_and_schema_valid():
    body = client.get("/sites").json()
    feats = body["features"]
    assert body["type"] == "FeatureCollection" and len(feats) >= 10
    for f in feats:
        SiteProperties(**f["properties"])
        assert f["geometry"]["type"] == "Polygon"
    ranks = [f["properties"]["rank"] for f in feats]
    assert ranks == sorted(ranks)
    scores = [f["properties"]["score_total"] for f in feats]
    assert scores == sorted(scores, reverse=True)


def test_sites_limit_and_min_score():
    assert len(client.get("/sites?limit=3").json()["features"]) == 3
    top = client.get("/sites?limit=1").json()["features"][0]["properties"]["score_total"]
    got = client.get(f"/sites?min_score={top}").json()["features"]
    assert got and all(f["properties"]["score_total"] >= top for f in got)


def test_sites_rejects_bad_params():
    assert client.get("/sites?min_score=500").status_code == 422
    assert client.get("/sites?limit=0").status_code == 422


def test_site_detail_and_404():
    first = client.get("/sites?limit=1").json()["features"][0]
    sid = first["properties"]["site_id"]
    assert client.get(f"/sites/{sid}").json() == first
    assert client.get("/sites/NOPE").status_code == 404


def test_summary_shape():
    s = client.get("/summary").json()
    assert {"baseline", "latest", "delta_canopy_pct_points", "delta_mean_lst_c", "caveats"} <= s.keys()
    assert s["caveats"]


def test_corridor_and_meta():
    assert client.get("/layers/corridor").json()["features"]
    m = client.get("/meta").json()
    assert m["data_mode"] == "mock" and m["score_source"] == "mock" and m["corridor_approximate"] is True
    assert any("SIMULATED" in c for c in m["caveats"])


def test_schema_rejects_out_of_range():
    with pytest.raises(Exception):
        SiteProperties(site_id="x", source="mock", area_m2=1, ndvi_mean=2, lst_c_mean=30,
                       canopy_pct_baseline=10, dist_to_path_m=1, path_length_within_50m=1,
                       corridor_gap_flag=False, corridor_gap_dist_m=0)


def test_meta_names_the_corridor_in_use():
    from backend.api.main import corridor_source
    approx = [{"properties": {"approximate": True}}]
    official = [{"properties": {"approximate": False}}]
    assert "approximate" in corridor_source(approx) and "OpenStreetMap" in corridor_source(approx)
    assert corridor_source(official) == "official polygon supplied"
    assert "approximate" in client.get("/meta").json()["corridor_source"]


def test_cors_is_open_by_default_and_restrictable():
    from backend.api.main import cors_origins
    assert cors_origins(None) == ["*"] and cors_origins("  ") == ["*"]
    assert cors_origins("https://a.example, https://b.example") == ["https://a.example", "https://b.example"]
