"""Download Elmina's OSM data from the official OSM map API (one small request, no Overpass needed).

Run:  python -m backend.osm.fetch_api
Saves backend/data/raw_osm/elmina_api.osm, which backend.osm.from_pbf then clips into layers.
Fair use: a single request for a ~4 km x 6 km box, identified with a User-Agent.
"""
import requests

from backend import atomic
from backend.config import BACKEND_DIR, ELMINA_BBOX
from backend.retry import retry
from backend.osm.extract import OSM_DIR

RAW_DIR = BACKEND_DIR / "data" / "raw_osm"
OUT_FILE = RAW_DIR / "elmina_api.osm"
URL = "https://api.openstreetmap.org/api/0.6/map"
HEADERS = {"User-Agent": "elmina-canopy-hackathon/0.1 (student project)"}
MAX_AREA_DEG2 = 0.25  # the API refuses larger boxes


def bbox_for_request() -> tuple:
    """The OSM Elmina polygon's bounds if Batch 2 saved it, otherwise the configured bounding box."""
    aoi = OSM_DIR / "aoi.geojson"
    if aoi.exists():
        import geopandas as gpd
        return tuple(gpd.read_file(aoi).total_bounds)
    return ELMINA_BBOX


def check_bbox(bbox: tuple) -> None:
    w, s, e, n = bbox
    if not (w < e and s < n):
        raise ValueError(f"Invalid bbox {bbox}")
    if (e - w) * (n - s) > MAX_AREA_DEG2:
        raise ValueError(f"bbox {bbox} is larger than the API limit of {MAX_AREA_DEG2} square degrees")


def main() -> None:
    bbox = bbox_for_request()
    check_bbox(bbox)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    def get():
        resp = requests.get(URL, params={"bbox": ",".join(f"{x:.5f}" for x in bbox)}, headers=HEADERS, timeout=180)
        if resp.status_code == 400:
            raise SystemExit("OSM API refused the box (too many nodes). Split the bbox into tiles.")  # not retried
        resp.raise_for_status()
        return resp

    r = retry(get, what="OSM map API download", wait=10)
    atomic.write_bytes(OUT_FILE, r.content)
    print(f"saved {len(r.content) / 1e6:.1f} MB to {OUT_FILE}")


if __name__ == "__main__":
    main()
