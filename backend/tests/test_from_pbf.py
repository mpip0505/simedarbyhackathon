import osmium
import pytest
from shapely.geometry import box

from backend.osm.from_pbf import classify, read_layers

W, S, E, N = 101.50, 3.18, 101.52, 3.20
AOI = box(W, S, E, N)


def test_classify_matches_layer_definitions():
    assert classify({"leisure": "park"}, True) == "parks"
    assert classify({"landuse": "grass"}, True) == "open_land"
    assert classify({"building": "yes"}, True) == "buildings"
    assert classify({"highway": "footway"}, False) == "paths"
    assert classify({"highway": "residential"}, False) == "roads"
    assert classify({"highway": "footway"}, True) is None   # a closed footway is not a polygon layer
    assert classify({"leisure": "pitch"}, True) is None


@pytest.fixture
def tiny_pbf(tmp_path):
    path = tmp_path / "tiny.osm.pbf"
    w = osmium.SimpleWriter(str(path))
    pts = {1: (W + 0.005, S + 0.005), 2: (W + 0.010, S + 0.005), 3: (W + 0.010, S + 0.010),
           4: (W + 0.005, S + 0.010), 5: (W + 0.005, S + 0.005 + 1e-9),
           6: (W + 0.002, S + 0.002), 7: (W + 0.004, S + 0.002),
           8: (120.0, 10.0), 9: (120.001, 10.0)}  # 8, 9 are far outside the AOI
    for i, (lon, lat) in pts.items():
        w.add_node(osmium.osm.mutable.Node(id=i, location=(lon, lat)))
    w.add_way(osmium.osm.mutable.Way(id=10, nodes=[1, 2, 3, 4, 1], tags={"leisure": "park", "name": "Test Park"}))
    w.add_way(osmium.osm.mutable.Way(id=11, nodes=[6, 7], tags={"highway": "footway"}))
    w.add_way(osmium.osm.mutable.Way(id=12, nodes=[8, 9], tags={"highway": "footway"}))
    w.close()
    return path


def test_read_layers_clips_to_aoi_and_sorts_into_layers(tiny_pbf):
    layers = read_layers(tiny_pbf, AOI, bbox=(W, S, E, N))
    assert len(layers["parks"]) == 1 and layers["parks"].iloc[0]["name"] == "Test Park"
    assert len(layers["paths"]) == 1          # the footway outside the AOI is dropped
    assert len(layers["roads"]) == 0 and len(layers["buildings"]) == 0
    assert layers["parks"].geometry.iloc[0].geom_type in ("Polygon", "MultiPolygon")
