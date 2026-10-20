"""Approximate Urban Biodiversity Corridor from park polygons.

Method (a stand-in, not the official geometry): take the larger park polygons, choose which pairs to join with a
minimum spanning tree, then connect each pair along the real footpath/road network (shortest route, footpaths
preferred) so the "spine" runs where trees could actually be planted. Parks closer than 100 m are joined directly.
Parks more than 1 km apart are NOT linked (a spanning tree would otherwise force a long straight link across
built-up land). If a pair has no sensible route (more than 3x the straight distance) a straight line is used and
counted in the stats. The spine is buffered to make the corridor. If the team provides backend/data/input/corridor_official.geojson, that file is
used instead and flagged approximate=False.
"""
import json

import geopandas as gpd
import networkx as nx
import numpy as np
import shapely
from shapely.geometry import LineString, Point, mapping
from shapely.ops import unary_union

from backend.config import INPUT_DIR

METRIC_CRS = "EPSG:32648"  # UTM 48N, covers Selangor
OFFICIAL_FILE = INPUT_DIR / "corridor_official.geojson"
ROAD_PENALTY = 1.5     # roads cost this much more than footpaths, so routes prefer walking paths
MAX_DETOUR = 3.0       # a network route longer than this multiple of the straight distance is rejected
MAX_LINK_M = 1000      # parks further apart than this are left unlinked
ADJACENT_M = 100       # parks closer than this are joined by a direct line, no routing


def mst_pairs(polys: list) -> list:
    """Index pairs (i, j) forming a minimum spanning tree over polygons (Prim, by polygon-to-polygon distance)."""
    if len(polys) < 2:
        return []
    in_tree, pairs = {0}, []
    while len(in_tree) < len(polys):
        best = None
        for i in in_tree:
            for j in range(len(polys)):
                if j in in_tree:
                    continue
                d = polys[i].distance(polys[j])
                if best is None or d < best[0]:
                    best = (d, i, j)
        _, i, j = best
        pairs.append((i, j))
        in_tree.add(j)
    return pairs


def spine_mst(polys: list) -> list:
    """Straight shortest connecting lines for the MST pairs (used when no network is available)."""
    return [shapely.shortest_line(polys[i], polys[j]) for i, j in mst_pairs(polys)]


def build_graph(paths: list, roads: list = ()) -> nx.Graph:
    """Graph whose nodes are line vertices (0.01 m grid) and edges are line segments, weighted by length."""
    g = nx.Graph()
    for lines, factor in ((paths, 1.0), (roads, ROAD_PENALTY)):
        for geom in lines:
            for line in getattr(geom, "geoms", [geom]):
                if line.geom_type != "LineString":
                    continue
                pts = [(round(x, 2), round(y, 2)) for x, y in line.coords]
                for a, b in zip(pts, pts[1:]):
                    w = Point(a).distance(Point(b)) * factor
                    if a != b and (not g.has_edge(a, b) or g[a][b]["weight"] > w):
                        g.add_edge(a, b, weight=w)
    return g


def _nearest_node(g: nx.Graph, nodes: np.ndarray, poly):
    d = shapely.distance(shapely.points(nodes), poly)
    return tuple(nodes[int(np.argmin(d))])


def link_pairs(polys: list) -> tuple:
    """MST pairs split into (linked, unlinked_far) using MAX_LINK_M."""
    linked, far = [], []
    for i, j in mst_pairs(polys):
        (linked if polys[i].distance(polys[j]) <= MAX_LINK_M else far).append((i, j))
    return linked, far


def route_spine(polys: list, graph: nx.Graph = None) -> tuple:
    """Connect linkable MST pairs. Returns (lines, counts) with counts of routed / direct / fallback / unlinked."""
    linked, far = link_pairs(polys)
    counts = {"routed_on_network": 0, "direct_adjacent": 0, "straight_fallback": 0, "unlinked_far": len(far)}
    nodes = np.array(list(graph.nodes)) if graph is not None and graph.number_of_nodes() else None
    lines = []
    for i, j in linked:
        straight = shapely.shortest_line(polys[i], polys[j])
        if nodes is None:
            lines.append(straight)
            counts["straight_fallback"] += 1
            continue
        if straight.length <= ADJACENT_M:
            lines.append(straight)
            counts["direct_adjacent"] += 1
            continue
        a, b = _nearest_node(graph, nodes, polys[i]), _nearest_node(graph, nodes, polys[j])
        try:
            route = LineString([straight.coords[0], *nx.shortest_path(graph, a, b, weight="weight"), straight.coords[-1]])
            if route.length > MAX_DETOUR * straight.length:
                raise nx.NetworkXNoPath
            lines.append(route)
            counts["routed_on_network"] += 1
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            lines.append(straight)
            counts["straight_fallback"] += 1
    return lines, counts


def build_corridor(parks: gpd.GeoDataFrame, buffer_m: float = 40, min_area_m2: float = 5000,
                   paths: gpd.GeoDataFrame = None, roads: gpd.GeoDataFrame = None) -> dict:
    """Returns {"corridor": GeoJSON FeatureCollection, "spine": GeoJSON FeatureCollection, "stats": dict}."""
    if OFFICIAL_FILE.exists():
        official = gpd.read_file(OFFICIAL_FILE).to_crs(4326)
        fc = json.loads(official.to_json())
        for f in fc["features"]:
            f["properties"] = {"name": "Urban Biodiversity Corridor (official)", "approximate": False}
        return {"corridor": fc, "spine": {"type": "FeatureCollection", "features": []},
                "stats": {"approximate": False, "source": str(OFFICIAL_FILE.name)}}

    m = parks.to_crs(METRIC_CRS)
    m = m[m.geometry.area >= min_area_m2]
    polys = [g for g in m.geometry.explode(index_parts=False) if g.geom_type == "Polygon" and g.area >= min_area_m2]
    if not polys:
        raise ValueError("No park polygons large enough to build a corridor")
    graph = None
    if paths is not None or roads is not None:
        net = lambda g: [] if g is None else list(g.to_crs(METRIC_CRS).geometry)
        graph = build_graph(net(paths), net(roads))
    lines, counts = route_spine(polys, graph)
    corridor_m = unary_union([*polys, *[ln.buffer(buffer_m) for ln in lines]]).buffer(buffer_m / 2)
    spine_len = sum(ln.length for ln in lines)

    def to_fc(geoms, props):
        g = gpd.GeoSeries(geoms, crs=METRIC_CRS).to_crs(4326)
        return {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": mapping(x), "properties": dict(props)} for x in g]}

    stats = {"approximate": True, "n_parks_used": len(polys), "spine_length_m": round(spine_len, 1),
             "buffer_m": buffer_m,
             "connectors": counts, "max_link_m": MAX_LINK_M,
             "method": "MST of park polygons, joined along footpath/road network, buffered"}
    return {
        "corridor": to_fc([corridor_m], {"name": "Urban Biodiversity Corridor (APPROXIMATE, derived from OSM parks)",
                                         "approximate": True}),
        "spine": to_fc(lines, {"name": "corridor connector (APPROXIMATE)", "approximate": True}),
        "stats": stats,
    }
