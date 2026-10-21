"""The footpath greenness layer: classification arithmetic and the endpoint."""
import numpy as np
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import LineString

from backend import shade_paths as sp
from backend.api.main import app

client = TestClient(app)


def test_pieces_cut_long_lines_and_keep_short_ones_whole():
    assert len(sp.pieces(LineString([(0, 0), (60, 0)]))) == 1
    parts = sp.pieces(LineString([(0, 0), (500, 0)]))
    assert len(parts) == 10 and all(abs(p.length - 50) < 1e-6 for p in parts)
    assert sum(p.length for p in parts) == pytest.approx(500)


def test_measure_returns_mean_and_share_below_the_threshold():
    line = LineString([(0, 0), (40, 0)])
    mean, below = sp.measure(line, lambda pts: [0.2, 0.4, 0.7, 0.9][: len(pts)])
    assert mean == pytest.approx(np.mean([0.2, 0.4, 0.7, 0.9])) and below == 0.5
    assert sp.measure(line, lambda pts: [np.nan] * len(pts)) is None


def test_thirds_split_evenly_and_ties_go_low():
    labels = sp.thirds(list(range(9)))
    assert labels.count("least_green") == 3 and labels.count("greenest") == 3 and labels.count("middle") == 3
    assert labels[0] == "least_green" and labels[-1] == "greenest"
    assert set(sp.thirds([0.5] * 6)) == {"least_green"}


def test_the_endpoint_serves_labelled_lines_and_the_not_a_survey_note():
    r = client.get("/layers/paths/shade")
    assert r.status_code == 200
    body = r.json()
    assert "not a shade survey" in body["note"]
    assert len(body["features"]) > 100
    assert {f["properties"]["third"] for f in body["features"]} == set(sp.LABELS)
    assert all(f["geometry"]["type"] == "LineString" for f in body["features"][:50])


def test_generic_error_when_the_file_is_missing(monkeypatch):
    from backend.api import store
    monkeypatch.setattr(store, "load_paths_shade", lambda: None)
    r = client.get("/layers/paths/shade")
    assert r.status_code == 404 and "/" not in r.json()["detail"].replace("data set", "")
