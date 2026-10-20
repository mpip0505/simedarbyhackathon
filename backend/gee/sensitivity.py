"""How fragile is the canopy proxy? Canopy % across NDVI thresholds and window lengths.

Run:  python -m backend.gee.sensitivity
Writes backend/data/cache/canopy_sensitivity.json and prints a table to quote a range from.
"""
import json

from backend import atomic
from backend.config import BASELINE_PERIOD, CACHE_DIR, LATEST_PERIOD
from backend.gee.safe import get_info
from backend.gee.composites import get_aoi, ndvi_composite

THRESHOLDS = (0.5, 0.6, 0.7)
# Two-year windows (the ones we report) and the four one-year halves they are made of.
WINDOWS = {
    "baseline_24m": BASELINE_PERIOD,
    "baseline_yr1": ("2021-10-01", "2022-09-30"),
    "baseline_yr2": ("2022-10-01", "2023-09-30"),
    "latest_24m": LATEST_PERIOD,
    "latest_yr1": ("2024-10-01", "2025-09-30"),
    "latest_yr2": ("2025-10-01", "2026-09-30"),
}


def spread(results: dict, threshold: str, prefix: str) -> dict:
    """Min, max and range of canopy % at one threshold across windows whose name starts with prefix."""
    vals = [r[threshold] for name, r in results.items() if name.startswith(prefix)]
    return {"min": min(vals), "max": max(vals), "range_pts": round(max(vals) - min(vals), 2)}


def run() -> dict:
    import ee
    from backend.gee.auth import init
    init()
    aoi = get_aoi(ee)
    out = {}
    for name, window in WINDOWS.items():
        ndvi = ndvi_composite(ee, aoi, *window)
        bands = [ndvi.gte(t).updateMask(ndvi.mask()).rename(f"t{round(t * 100)}") for t in THRESHOLDS]
        res = get_info(ee.Image.cat(bands).reduceRegion(ee.Reducer.mean(), aoi, 10, maxPixels=1e9, tileScale=4),
                       f"sensitivity {name}")
        out[name] = {str(t): round(res[f"t{round(t * 100)}"] * 100, 2) for t in THRESHOLDS}
    return out


def main() -> None:
    results = run()
    summary = {t: {"baseline": spread(results, t, "baseline"), "latest": spread(results, t, "latest")}
               for t in map(str, THRESHOLDS)}
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    atomic.write_json(CACHE_DIR / "canopy_sensitivity.json", {"canopy_pct": results, "spread": summary}, indent=1)
    print(f"{'window':14s}" + "".join(f"NDVI>={t:<6}" for t in THRESHOLDS))
    for name, r in results.items():
        print(f"{name:14s}" + "".join(f"{r[str(t)]:<12.1f}" for t in THRESHOLDS))
    print("\nspread across windows (percentage points):")
    for t, s in summary.items():
        print(f"  NDVI>={t}: baseline {s['baseline']['range_pts']}, latest {s['latest']['range_pts']}")


if __name__ == "__main__":
    main()
