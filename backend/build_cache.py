"""Rebuild every cached file the API serves, in the right order.

Run:  python -m backend.build_cache                 # everything (needs Earth Engine login + internet)
      python -m backend.build_cache --skip-gee      # reuse cached rasters (internet for OSM only)
      python -m backend.build_cache --offline       # reuse cached OSM + rasters: rebuild corridor/sites only
Stops at the first failing step and says which one.
"""
import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone

from backend import atomic
from backend.config import BASELINE_PERIOD, CACHE_DIR, LATEST_PERIOD

STEPS = {
    "osm_download": ("backend.osm.fetch_api", "download OSM data"),
    "osm_layers": ("backend.osm.from_pbf --pbf backend/data/raw_osm/elmina_api.osm", "clip OSM into layers"),
    "corridor": ("backend.osm.build_corridor", "build approximate corridor"),
    "gee_export": ("backend.gee.export", "NDVI/LST composites, summary, rasters (Earth Engine)"),
    "series": ("backend.gee.series", "yearly canopy/LST series (Earth Engine)"),
    "sensitivity": ("backend.gee.sensitivity", "canopy threshold sensitivity (Earth Engine)"),
    "crosscheck": ("backend.gee.crosscheck", "canopy cross-check vs WorldCover and Dynamic World (Earth Engine)"),
    "overlays": ("backend.overlays", "map overlay images from rasters"),
    "sites": ("backend.sites.generate", "generate simulated candidate sites"),
}
ORDER = ["osm_download", "osm_layers", "corridor", "gee_export", "series", "sensitivity", "crosscheck", "overlays", "sites"]


def plan_steps(skip_gee: bool = False, offline: bool = False) -> list:
    """Step names to run. offline implies skipping both downloads (OSM and Earth Engine)."""
    skip = set()
    if skip_gee or offline:
        skip |= {"gee_export", "series", "sensitivity", "crosscheck"}
    if offline:
        skip |= {"osm_download", "osm_layers"}
    return [s for s in ORDER if s not in skip]


def update_sources_built(prev: dict, ran: list, now: str, fallback: dict) -> dict:
    """When each data source was really built. A skipped download keeps its previous timestamp
    (or the file's modification time if there was none), so an offline rebuild never claims fresh data."""
    built = dict(prev)
    for source, step in (("osm", "osm_download"), ("satellite", "gee_export")):
        if step in ran:
            built[source] = now
        elif source not in built and fallback.get(source):
            built[source] = fallback[source]
    return built


def _mtime_iso(path):
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-gee", action="store_true")
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    ran = []
    for name in plan_steps(args.skip_gee, args.offline):
        cmd, label = STEPS[name]
        print(f"\n=== {name}: {label}", flush=True)
        t = time.time()
        if subprocess.run([sys.executable, "-m", *cmd.split()]).returncode != 0:
            raise SystemExit(f"Step '{name}' failed. Fix it, then re-run (finished steps are cached).")
        ran.append({"step": name, "seconds": round(time.time() - t, 1)})
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    info_file = CACHE_DIR / "build_info.json"
    prev = json.loads(info_file.read_text(encoding="utf-8")).get("sources_built", {}) if info_file.exists() else {}
    fallback = {"osm": _mtime_iso(CACHE_DIR / "osm" / "summary.json"), "satellite": _mtime_iso(CACHE_DIR / "summary.json")}
    info = {"generated_at": now, "sources_built": update_sources_built(prev, [r["step"] for r in ran], now, fallback),
            "periods": {"baseline": BASELINE_PERIOD, "latest": LATEST_PERIOD}, "steps": ran}
    atomic.write_json(CACHE_DIR / "build_info.json", info, indent=1)
    print("\nDone. Start the API:  uvicorn backend.api.main:app --port 8000")


if __name__ == "__main__":
    main()
