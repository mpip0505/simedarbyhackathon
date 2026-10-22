"""Bring your own sites: the file is refused whole when wrong, spreadsheet-safe on the way out, and scoring a simulated site's own
centre reproduces that site's committed scores (so user-supplied points really go through the same measurement and model)."""
import json

import geopandas as gpd
import pytest

from backend import my_sites
from backend.config import CACHE_DIR
from backend.ml_io import load_sites_df
from backend.sites import generate


def write(tmp_path, text):
    p = tmp_path / "pts.csv"
    p.write_text(text, encoding="utf-8")
    return p


def problems(tmp_path, text):
    with pytest.raises(my_sites.SheetError) as e:
        my_sites.read_points(write(tmp_path, text))
    return e.value.problems


def test_a_good_file_reads_and_numbers_missing_ids(tmp_path):
    pts = my_sites.read_points(write(tmp_path, "lat,lon,name\n3.1,101.5,A\n3.2,101.6,\n"))
    assert [p["id"] for p in pts] == ["my-0001", "my-0002"] and pts[0]["name"] == "A"


def test_every_problem_is_listed_with_its_line_and_the_file_is_refused_whole(tmp_path):
    msgs = problems(tmp_path, "site_id,lat,lon\nok,3.1,101.5\nbad id!,3.1,101.5\ndup,3.1,101.5\ndup,3.1,101.5\nx,abc,101.5\ny,95,101.5\n")
    text = "\n".join(msgs)
    assert "line 3" in text and "line 5" in text and "appears twice" in text and "line 6" in text and "line 7" in text
    assert len(msgs) == 4


def test_missing_columns_empty_and_oversized_files_are_refused(tmp_path):
    assert "lat and lon" in problems(tmp_path, "site_id,x\na,1\n")[0]
    assert "no rows" in problems(tmp_path, "lat,lon\n")[0]
    big = "lat,lon\n" + "3.1,101.5\n" * (my_sites.MAX_POINTS + 1)
    assert "limit" in problems(tmp_path, big)[0]


def test_text_that_would_run_as_a_formula_is_neutralised():
    for bad in ("=1+1", "+cmd", "-2", "@sum", "\tx"):
        assert my_sites.safe_cell(bad).startswith("'")
    assert my_sites.safe_cell("plain") == "plain" and my_sites.safe_cell(None) == ""


def _flat(coords):
    """Every number in a GeoJSON coordinate array, in order."""
    if isinstance(coords, (int, float)):
        return [coords]
    return [n for part in coords for n in _flat(part)]


def test_building_the_simulated_sites_is_unchanged_by_the_shared_code_path():
    """Same sites, same numbers, same shapes. The shapes are compared to a nano-degree (about 0.1 mm), not bit for bit:
    GEOS builds on different machines return the same polygon with its last float digits differing (27 of 564 sites
    differ this way between Windows, macOS and Linux), which changes the hash in `data_version` without changing any site.
    So this does not compare the hash. If it fails, a site, a property or a shape really changed."""
    layers, rasters = generate.load_inputs()
    try:
        fc = generate.to_feature_collection(generate.build_sites(layers, rasters))
    finally:
        for s in rasters.values():
            s.close()
    committed = json.loads((CACHE_DIR / "sites.geojson").read_text(encoding="utf-8"))
    fresh = {f["properties"]["site_id"]: f for f in fc["features"]}
    old = {f["properties"]["site_id"]: f for f in committed["features"]}
    assert fresh.keys() == old.keys()
    for site_id, f in fresh.items():
        assert f["properties"] == old[site_id]["properties"], site_id
        a, b = _flat(f["geometry"]["coordinates"]), _flat(old[site_id]["geometry"]["coordinates"])
        assert len(a) == len(b) and all(abs(x - y) <= 1e-9 for x, y in zip(a, b)), site_id


def test_a_simulated_sites_own_centre_scores_exactly_as_committed_and_outside_points_are_skipped():
    df = load_sites_df()
    committed = {f["properties"]["site_id"]: f["properties"] for f in json.loads((CACHE_DIR / "scores.geojson").read_text(encoding="utf-8"))["features"]}
    picked = df.sort_values("site_id").iloc[::150].head(4)
    pts = [{"id": r.site_id, "name": "", "lat": r.lat, "lon": r.lon, "line": 0} for r in picked.itertuples()]
    pts.append({"id": "far", "name": "", "lat": 3.5, "lon": 101.0, "line": 0})
    layers, rasters = generate.load_inputs()
    layers["aoi"] = gpd.read_file(generate.OSM_DIR / "aoi.geojson")
    weights = json.loads((CACHE_DIR / "weights.json").read_text(encoding="utf-8"))
    try:
        gdf, skipped = my_sites.score_points(pts, layers, rasters, df, weights.get("default", weights))
    finally:
        for s in rasters.values():
            s.close()
    assert skipped == [("far", "outside the Elmina study area")]
    assert len(gdf) == 4
    for r in gdf.itertuples():
        assert r.score_total == committed[r.site_id]["score_total"]
        assert r.would_rank_among_simulated == committed[r.site_id]["rank"]


def test_the_command_line_writes_both_files_and_refuses_a_bad_file(tmp_path, capsys):
    good = write(tmp_path, (CACHE_DIR.parent.parent.parent / "docs" / "examples" / "my_sites_example.csv").read_text(encoding="utf-8"))
    assert my_sites.main([str(good)]) == 0
    assert (tmp_path / "pts_scored.csv").exists() and (tmp_path / "pts_scored.geojson").exists()
    header = (tmp_path / "pts_scored.csv").read_text(encoding="utf-8").splitlines()[0]
    assert "score_total" in header and "would_rank_among_simulated" in header and "note" in header
    bad = write(tmp_path, "lat,lon\nnope,1\n")
    assert my_sites.main([str(bad)]) == 1
    assert "Nothing was scored" in capsys.readouterr().err
