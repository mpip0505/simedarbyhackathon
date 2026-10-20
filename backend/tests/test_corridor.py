import geopandas as gpd
import pytest
from shapely.geometry import box, shape

from backend.osm import corridor as c


def parks_gdf():
    # three ~300 m squares in metric space, then converted to lon/lat
    geoms = [box(700000, 354000, 700300, 354300), box(700600, 354000, 700900, 354300),
             box(700000, 354900, 700300, 355200), box(0, 0, 10, 10)]  # last one is too small
    return gpd.GeoDataFrame(geometry=geoms, crs=c.METRIC_CRS).to_crs(4326)


@pytest.fixture(autouse=True)
def no_official(monkeypatch, tmp_path):
    monkeypatch.setattr(c, "OFFICIAL_FILE", tmp_path / "missing.geojson")


def test_spine_connects_all_polygons_with_n_minus_1_lines():
    polys = list(parks_gdf().to_crs(c.METRIC_CRS).geometry)[:3]
    lines = c.spine_mst(polys)
    assert len(lines) == 2
    assert sorted(round(l.length) for l in lines) == [300, 600]


def test_build_corridor_is_valid_connected_and_flagged_approximate():
    out = c.build_corridor(parks_gdf())
    assert out["stats"]["approximate"] is True and out["stats"]["n_parks_used"] == 3
    geom = shape(out["corridor"]["features"][0]["geometry"])
    assert geom.is_valid and geom.geom_type == "Polygon"  # connectors merged parks into one polygon
    assert out["corridor"]["features"][0]["properties"]["approximate"] is True
    assert len(out["spine"]["features"]) == 2
    assert all(-180 <= x <= 180 for x, _ in geom.exterior.coords)  # lon/lat output


def test_no_large_parks_raises():
    tiny = gpd.GeoDataFrame(geometry=[box(0, 0, 10, 10)], crs=c.METRIC_CRS).to_crs(4326)
    with pytest.raises(ValueError):
        c.build_corridor(tiny)


def test_official_override(monkeypatch, tmp_path):
    f = tmp_path / "official.geojson"
    gpd.GeoDataFrame(geometry=[box(101.5, 3.2, 101.51, 3.21)], crs=4326).to_file(f, driver="GeoJSON")
    monkeypatch.setattr(c, "OFFICIAL_FILE", f)
    out = c.build_corridor(parks_gdf())
    assert out["stats"]["approximate"] is False
    assert out["corridor"]["features"][0]["properties"]["approximate"] is False


# ---- network routing ----
from shapely.geometry import LineString  # noqa: E402


def two_parks(gap_x):
    """Two 300 m parks; the second starts gap_x metres east of the first (metric coordinates)."""
    return [box(0, 0, 300, 300), box(300 + gap_x, 0, 600 + gap_x, 300)]


def test_route_follows_an_l_shaped_road_instead_of_the_straight_line():
    polys = [box(0, 0, 100, 100), box(500, 400, 600, 500)]  # diagonal neighbours, straight gap ~566 m
    road = [LineString([(100, 50), (550, 50)]), LineString([(550, 50), (550, 400)])]  # east then north
    lines, counts = c.route_spine(polys, c.build_graph([], road))
    assert counts["routed_on_network"] == 1 and counts["straight_fallback"] == 0
    assert lines[0].length > polys[0].distance(polys[1]) * 1.05      # longer than straight: it bends
    assert lines[0].distance(shapely_point(550, 200)) < 1            # passes along the northbound road


def shapely_point(x, y):
    from shapely.geometry import Point
    return Point(x, y)


def test_far_parks_are_not_linked():
    lines, counts = c.route_spine(two_parks(c.MAX_LINK_M + 500), None)
    assert lines == [] and counts["unlinked_far"] == 1


def test_adjacent_parks_join_directly_without_routing():
    polys = two_parks(40)
    graph = c.build_graph([LineString([(0, 150), (900, 150)])])
    lines, counts = c.route_spine(polys, graph)
    assert counts["direct_adjacent"] == 1 and counts["routed_on_network"] == 0
    assert lines[0].length == pytest.approx(40)


def test_disconnected_network_falls_back_to_straight_and_counts_it():
    polys = [box(0, 0, 100, 100), box(500, 0, 600, 100)]
    graph = c.build_graph([LineString([(0, 500), (50, 500)]), LineString([(550, 500), (600, 500)])])  # two islands
    lines, counts = c.route_spine(polys, graph)
    assert counts["straight_fallback"] == 1 and lines[0].length == pytest.approx(400)


def test_build_corridor_reports_connector_counts():
    gdf = gpd.GeoDataFrame(geometry=two_parks(500), crs=c.METRIC_CRS).to_crs(4326)
    out = c.build_corridor(gdf, paths=gpd.GeoDataFrame(geometry=[], crs=4326))
    assert out["stats"]["connectors"]["straight_fallback"] == 1 and out["stats"]["max_link_m"] == c.MAX_LINK_M
