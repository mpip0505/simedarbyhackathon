"""Build and cache the approximate corridor from the downloaded OSM parks.

Run:  python -m backend.osm.build_corridor
Writes backend/data/cache/corridor.geojson, corridor_spine.geojson, corridor_stats.json
"""
import json

import geopandas as gpd

from backend.config import CACHE_DIR
from backend.osm.corridor import build_corridor
from backend.osm.extract import OSM_DIR


def main() -> None:
    parks = gpd.read_file(OSM_DIR / "parks.geojson")
    if parks.empty:
        raise SystemExit("parks.geojson is empty: run backend.osm.from_pbf (or extract) first")
    out = build_corridor(parks)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / "corridor.geojson").write_text(json.dumps(out["corridor"]), encoding="utf-8")
    (CACHE_DIR / "corridor_spine.geojson").write_text(json.dumps(out["spine"]), encoding="utf-8")
    (CACHE_DIR / "corridor_stats.json").write_text(json.dumps(out["stats"], indent=1), encoding="utf-8")
    names = sorted({str(n) for n in parks["name"].dropna()}) if "name" in parks else []
    print(json.dumps(out["stats"], indent=1))
    print(f"{len(parks)} park features, {len(names)} named: {names[:15]}")


if __name__ == "__main__":
    main()
