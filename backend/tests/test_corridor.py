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
