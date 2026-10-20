"""Generate the hand-sized MOCK data so Frontend and ML can start on day 1.

Run:  python -m backend.scripts.make_mock
Everything here is invented placeholder data (source = "mock"), not satellite output.
"""
import json
import math
import random

from backend import atomic
from backend.config import CAVEATS, DEFAULT_WEIGHTS, ELMINA_BBOX, MOCK_DIR

N_SITES = 15
SIDE_M = 40.0


def square(lon: float, lat: float, side_m: float) -> list:
    dlat = side_m / 111_320 / 2
    dlon = side_m / (111_320 * math.cos(math.radians(lat))) / 2
    ring = [(lon - dlon, lat - dlat), (lon + dlon, lat - dlat), (lon + dlon, lat + dlat),
            (lon - dlon, lat + dlat), (lon - dlon, lat - dlat)]
    return [[[round(x, 6), round(y, 6)] for x, y in ring]]


def main() -> None:
    rng = random.Random(42)
    w, s, e, n = ELMINA_BBOX
    features = []
    for i in range(N_SITES):
        lon = w + (e - w) * (0.15 + 0.7 * rng.random())
        lat = s + (n - s) * (0.15 + 0.7 * rng.random())
        ndvi = round(rng.uniform(0.15, 0.7), 3)
        lst = round(rng.uniform(29.0, 38.0), 1)
        dist_path = round(rng.uniform(2, 180), 1)
        gap = rng.random() < 0.4
        cooling = round(min(100, max(0, (lst - 28) * 9 + (0.7 - ndvi) * 40)), 1)
        connect = round(rng.uniform(55, 95) if gap else rng.uniform(5, 50), 1)
        shade = round(max(0, 100 - dist_path * 0.5 - rng.uniform(0, 20)), 1)
        total = round(cooling * DEFAULT_WEIGHTS["cooling"] + connect * DEFAULT_WEIGHTS["connectivity"]
                      + shade * DEFAULT_WEIGHTS["shade"], 1)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": square(lon, lat, SIDE_M)},
            "properties": {
                "site_id": f"MOCK-{i + 1:03d}", "source": "mock", "area_m2": SIDE_M * SIDE_M,
                "ndvi_mean": ndvi, "lst_c_mean": lst, "canopy_pct_baseline": round(max(0, ndvi - 0.2) * 150, 1),
                "dist_to_path_m": dist_path, "path_length_within_50m": round(rng.uniform(0, 140), 1),
                "corridor_gap_flag": gap, "corridor_gap_dist_m": round(rng.uniform(0, 60), 1) if gap else 0.0,
                "score_cooling": cooling, "score_connectivity": connect, "score_shade": shade,
                "score_total": total, "rank": None,
            },
        })
    features.sort(key=lambda f: -f["properties"]["score_total"])
    for r, f in enumerate(features, start=1):
        f["properties"]["rank"] = r

    cx, cy = (w + e) / 2, (s + n) / 2
    corridor = {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [[
            [round(cx - 0.020, 6), round(cy - 0.004, 6)], [round(cx + 0.020, 6), round(cy - 0.004, 6)],
            [round(cx + 0.020, 6), round(cy + 0.004, 6)], [round(cx - 0.020, 6), round(cy + 0.004, 6)],
            [round(cx - 0.020, 6), round(cy - 0.004, 6)]]]},
        "properties": {"name": "Urban Biodiversity Corridor (MOCK, not real geometry)", "approximate": True},
    }]}

    summary = {
        "baseline": {"label": "Baseline (MOCK)", "start": "2022-01-01", "end": "2022-12-31",
                     "canopy_pct": 31.0, "mean_lst_c": 33.4},
        "latest": {"label": "Latest (MOCK)", "start": "2025-01-01", "end": "2025-12-31",
                   "canopy_pct": 34.5, "mean_lst_c": 33.0},
        "delta_canopy_pct_points": 3.5, "delta_mean_lst_c": -0.4, "caveats": CAVEATS,
    }

    MOCK_DIR.mkdir(parents=True, exist_ok=True)
    atomic.write_json(MOCK_DIR / "sites.geojson", {"type": "FeatureCollection", "features": features}, indent=1)
    atomic.write_json(MOCK_DIR / "corridor.geojson", corridor, indent=1)
    atomic.write_json(MOCK_DIR / "summary.json", summary, indent=1)
    print(f"Wrote {len(features)} mock sites to {MOCK_DIR}")


if __name__ == "__main__":
    main()
