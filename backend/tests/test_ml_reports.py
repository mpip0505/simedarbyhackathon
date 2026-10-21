"""The /ml/* endpoints: ML's extra evidence (uncertainty, shortlist, scenario) served beside the ranking."""
import json

import pytest
from fastapi.testclient import TestClient

from backend import atomic
from backend.api import store
from backend.api.main import app

client = TestClient(app)
CSV_HEAD = "site_id,baseline_rank,baseline_score,score_median,score_p05,score_p95,rank_median,rank_p05,rank_p95,topk_frequency\n"


@pytest.fixture
def reports(tmp_path, monkeypatch):
    data, ml = tmp_path / "cache", tmp_path / "reports"
    data.mkdir(), ml.mkdir()
    atomic.write_json(data / "sites.geojson", {"type": "FeatureCollection", "features": [], "data_version": "v1"})
    monkeypatch.setattr(store, "data_dir", lambda: data)
    monkeypatch.setattr(store, "data_mode", lambda: "cache")
    monkeypatch.setattr(store, "ml_reports_dir", lambda: ml)
    store._parsed.clear()
    store._csv_cache.clear()
    return ml


def test_missing_reports_are_404(reports):
    for name in ("uncertainty", "shortlist", "scenario", "impact", "tradeoff", "reach-sets"):
        assert client.get(f"/ml/{name}").status_code == 404


def test_uncertainty_joins_headline_and_per_site_rows(reports):
    atomic.write_json(reports / "uncertainty.json", {"data_version": "v1", "draws": 2000, "k": 20,
                                                     "robust_top_k": {"threshold": 0.8, "count_within_baseline_top_k": 14},
                                                     "boundary_sites": {"range": [0.2, 0.8]}})
    (reports / "uncertainty_sites.csv").write_text(CSV_HEAD + "ELM-1,1,92.5,92.6,90.6,94.4,1,1,1,1.0\n")
    r = client.get("/ml/uncertainty")
    assert r.status_code == 200
    body = r.json()
    assert body["stale"] is False and body["robust_count"] == 14 and body["boundary_range"] == [0.2, 0.8]
    assert body["sites"]["ELM-1"] == {"baseline_rank": 1, "rank_median": 1, "rank_p05": 1, "rank_p95": 1,
                                      "score_median": 92.6, "score_p05": 90.6, "score_p95": 94.4, "topk_frequency": 1.0}


def test_malformed_uncertainty_csv_is_404_not_500(reports):
    atomic.write_json(reports / "uncertainty.json", {"data_version": "v1"})
    (reports / "uncertainty_sites.csv").write_text("site_id,rank_p05\nELM-1,x\n")
    assert client.get("/ml/uncertainty").status_code == 404


def test_reports_on_other_data_are_flagged_stale(reports):
    atomic.write_json(reports / "scenario.json", {"data_version": "old", "k": 50})
    atomic.write_json(reports / "shortlist.json", {"data_version": "v1", "diversified_sites": []})
    atomic.write_json(reports / "impact_reach.json", {"data_version": "old", "rows": []})
    assert client.get("/ml/impact").json()["stale"] is True
    assert client.get("/ml/scenario").json()["stale"] is True
    assert client.get("/ml/shortlist").json()["stale"] is False


def test_invalid_json_report_is_404(reports):
    (reports / "scenario.json").write_text("{not json")
    assert client.get("/ml/scenario").status_code == 404


def test_mock_mode_serves_no_ml_reports(reports, monkeypatch):
    atomic.write_json(reports / "scenario.json", {"data_version": "v1"})
    monkeypatch.setattr(store, "data_mode", lambda: "mock")
    assert client.get("/ml/scenario").status_code == 404


def test_committed_reports_match_the_committed_data():
    """The reports in ml/reports were computed on the data the API serves (else re-run the ML scripts)."""
    store._parsed.clear()
    for name in ("uncertainty", "shortlist", "scenario", "impact", "tradeoff", "reach-sets"):
        r = client.get(f"/ml/{name}")
        assert r.status_code == 200 and r.json()["stale"] is False, name
    sites = {f["properties"]["site_id"] for f in client.get("/sites").json()["features"]}
    assert set(client.get("/ml/uncertainty").json()["sites"]) == sites
    assert {s["site_id"] for s in client.get("/ml/shortlist").json()["diversified_sites"]} <= sites
