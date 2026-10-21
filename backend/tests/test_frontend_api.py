import json

import pytest
from fastapi.testclient import TestClient

from backend import atomic
from backend.api import main, store
from backend.api.main import app

client = TestClient(app)


def fc(features):
    return {"type": "FeatureCollection", "features": features}


POLY = {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[101.5, 3.2], [101.51, 3.2], [101.51, 3.21], [101.5, 3.2]]]},
        "properties": {"name": "x"}}
CROSSCHECK = {
    "canopy_ndvi_threshold_in_use": 0.6, "dynamic_world_tree_probability": 0.5,
    "results": {
        "baseline": {"esa_worldcover_2021": {
            "0.5": {"reference_tree_pct": 27.0, "ours_canopy_pct": 17.0, "precision": 0.1, "recall": 0.2, "f1": 0.3},
            "0.6": {"reference_tree_pct": 27.68, "ours_canopy_pct": 9.62, "precision": 0.865, "recall": 0.301, "f1": 0.446}}},
        "latest": {"dynamic_world_same_window": {
            "0.6": {"reference_tree_pct": 4.43, "ours_canopy_pct": 10.4, "precision": 0.381, "recall": 0.894, "f1": 0.534}}}},
    "threshold_comparison": {"mean_f1_by_threshold": {"0.5": 0.466, "0.6": 0.509}, "best": "0.6"},
    "caveat": "satellite maps, not field truth"}


@pytest.fixture
def cache(tmp_path, monkeypatch):
    atomic.write_json(tmp_path / "sites.geojson", fc([]))
    (tmp_path / "osm").mkdir()
    atomic.write_json(tmp_path / "osm" / "parks.geojson", fc([POLY]))
    atomic.write_json(tmp_path / "osm" / "secret.geojson", fc([POLY]))        # present on disk but not whitelisted
    atomic.write_json(tmp_path / "corridor_spine.geojson", fc([POLY]))
    atomic.write_json(tmp_path / "crosscheck.json", CROSSCHECK)
    monkeypatch.setattr(store, "data_dir", lambda: tmp_path)
    store._parsed.clear()
    return tmp_path


# ---------- offline basemap layers ----------

def test_osm_layer_is_served(cache):
    r = client.get("/layers/osm/parks")
    assert r.status_code == 200 and r.json()["features"][0]["properties"]["name"] == "x"


@pytest.mark.parametrize("name", ["secret", "sites", "..", "nope", "BUILDINGS", "parks.geojson"])
def test_osm_layer_names_are_whitelisted(cache, name):
    r = client.get(f"/layers/osm/{name}")
    assert r.status_code == 404 and str(cache) not in r.text


def test_whitelisted_layer_that_is_missing_is_404_not_500(cache):
    assert client.get("/layers/osm/buildings").status_code == 404


def test_traversal_through_the_layer_name_is_blocked(cache):
    for bad in ("..%2f..%2fsites", "%2e%2e/%2e%2e/sites", "parks%00"):
        assert client.get(f"/layers/osm/{bad}").status_code in (404, 422)


def test_spine_and_crosscheck_are_served(cache):
    assert client.get("/layers/corridor/spine").json()["features"]
    assert client.get("/summary/crosscheck").status_code == 200


def test_crosscheck_is_trimmed_to_the_threshold_in_use(cache):
    body = client.get("/summary/crosscheck").json()
    assert body["ndvi_threshold"] == 0.6 and len(body["rows"]) == 2           # the 0.5 row is not included
    assert {r["reference"] for r in body["rows"]} == {"esa_worldcover_2021", "dynamic_world_same_window"}
    assert body["rows"][0] == {"window": "baseline", "reference": "esa_worldcover_2021", "reference_tree_pct": 27.68,
                               "ours_canopy_pct": 9.62, "precision": 0.865, "recall": 0.301, "f1": 0.446}
    assert body["mean_f1_by_threshold"]["0.6"] == 0.509 and "field truth" in body["caveat"]


def test_mock_mode_has_no_basemap_spine_or_crosscheck(monkeypatch):
    monkeypatch.setattr(store, "data_dir", lambda: store.MOCK_DIR)
    store._parsed.clear()
    for path in ("/layers/osm/parks", "/layers/corridor/spine", "/summary/crosscheck"):
        r = client.get(path)
        assert r.status_code == 404 and "Traceback" not in r.text


# ---------- the real cached data ----------

def test_real_cache_serves_every_basemap_layer():
    store._parsed.clear()
    counts = {n: len(client.get(f"/layers/osm/{n}").json()["features"]) for n in store.OSM_LAYERS}
    assert counts == {"buildings": 1189, "roads": 949, "paths": 361, "parks": 17, "open_land": 25}


def test_real_crosscheck_has_a_row_per_window_and_reference():
    body = client.get("/summary/crosscheck").json()
    assert len(body["rows"]) == 4 and body["ndvi_threshold"] == 0.6
    assert {(r["window"], r["reference"]) for r in body["rows"]} == {
        (w, r) for w in ("baseline", "latest") for r in ("esa_worldcover_2021", "dynamic_world_same_window")}


def test_real_spine_is_served():
    assert len(client.get("/layers/corridor/spine").json()["features"]) >= 1


# ---------- root redirect and the bundled web app ----------

def test_root_redirects_to_the_app_when_it_exists():
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/app/"


def test_root_redirects_to_the_docs_without_a_frontend(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "FRONTEND_DIR", tmp_path / "missing")
    assert client.get("/", follow_redirects=False).headers["location"] == "/docs"


def test_web_app_index_and_modules_are_served_with_the_right_types():
    page = client.get("/app/")
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]
    assert "Elmina" in page.text
    js = client.get("/app/js/main.js")
    assert js.status_code == 200 and "javascript" in js.headers["content-type"]
    assert client.get("/app/vendor/leaflet/leaflet.js").status_code == 200
    assert "css" in client.get("/app/css/app.css").headers["content-type"]


@pytest.mark.parametrize("path", ["/app/%2e%2e/backend/config.py", "/app/..%2fbackend%2fconfig.py",
                                  "/app/../backend/config.py", "/app/%2e%2e/%2e%2e/README.md"])
def test_web_app_cannot_serve_files_outside_the_frontend_folder(path):
    r = client.get(path)
    assert r.status_code in (404, 400) and "CAVEATS" not in r.text and "simedarbyhackathon" not in r.text


def test_every_local_script_and_style_the_page_loads_exists():
    import re
    html = client.get("/app/").text
    refs = re.findall(r'(?:src|href)="((?!https?:|#|data:)[^"]+)"', html)
    assert refs, "page references no local files?"
    for ref in refs:
        assert client.get("/app/" + ref.lstrip("./")).status_code == 200, f"{ref} is referenced but not served"
