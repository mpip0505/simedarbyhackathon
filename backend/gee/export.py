"""Compute baseline/latest canopy % and mean LST over Elmina and cache them (plus small rasters).

Run:  python -m backend.gee.export              (stats + rasters)
      python -m backend.gee.export --no-rasters (stats only)
Writes backend/data/cache/summary.json (API contract), composite_stats.json, rasters/*.tif
"""
import argparse
import json
import time
import urllib.request

from backend import atomic
from backend.config import BASELINE_PERIOD, CACHE_DIR, CANOPY_NDVI_THRESHOLD, CAVEATS, LATEST_PERIOD
from backend.gee.safe import get_info
from backend.gee.composites import canopy_mask, get_aoi, lst_composite, lst_valid_mask, ndvi_composite
from backend.schema import Summary

RASTER_DIR = CACHE_DIR / "rasters"
NDVI_SCALE_M, LST_SCALE_M = 10, 30


def build_summary(stats: dict) -> dict:
    """Turn raw per-period stats into the /summary payload; pydantic rejects out-of-range values."""
    b, l = stats["baseline"], stats["latest"]

    def period(key, label, window):
        return {"label": label, "start": window[0], "end": window[1],
                "canopy_pct": round(stats[key]["canopy_pct"], 2), "mean_lst_c": round(stats[key]["mean_lst_c"], 2)}

    out = {
        "baseline": period("baseline", f"Baseline {BASELINE_PERIOD[0][:7]} to {BASELINE_PERIOD[1][:7]}", BASELINE_PERIOD),
        "latest": period("latest", f"Latest {LATEST_PERIOD[0][:7]} to {LATEST_PERIOD[1][:7]}", LATEST_PERIOD),
        "delta_canopy_pct_points": round(l["canopy_pct"] - b["canopy_pct"], 2),
        "delta_mean_lst_c": round(l["mean_lst_c"] - b["mean_lst_c"], 2),
        "caveats": CAVEATS,
    }
    return Summary(**out).model_dump()


def _stats_for(ee, aoi, window: tuple) -> dict:
    ndvi = ndvi_composite(ee, aoi, *window)
    lst = lst_composite(ee, aoi, *window)
    canopy = canopy_mask(ndvi)
    kw = dict(geometry=aoi, maxPixels=1e9, tileScale=4)
    c = get_info(canopy.reduceRegion(ee.Reducer.mean(), scale=NDVI_SCALE_M, **kw), "canopy mean")["CANOPY"]
    n = get_info(ndvi.reduceRegion(ee.Reducer.mean(), scale=NDVI_SCALE_M, **kw), "NDVI mean")["NDVI"]
    t = get_info(lst.reduceRegion(ee.Reducer.mean(), scale=LST_SCALE_M, **kw), "LST mean")["LST_C"]
    if c is None or t is None:
        raise RuntimeError(f"No valid pixels for {window}; widen the period")
    return {"canopy_pct": c * 100, "ndvi_mean": n, "mean_lst_c": t, "window": list(window)}


def _download(image, aoi, scale: int, path, attempts: int = 4) -> None:
    """Download a GeoTIFF with retries (Earth Engine sometimes answers 503). Writes to a temp file first so a
    failed download can never replace a good raster with a truncated one."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    for attempt in range(1, attempts + 1):
        try:
            url = image.getDownloadURL({"region": aoi, "scale": scale, "crs": "EPSG:4326", "format": "GEO_TIFF"})
            urllib.request.urlretrieve(url, tmp)
            tmp.replace(path)
            return
        except Exception as exc:  # urllib HTTPError, ee.EEException, network resets
            tmp.unlink(missing_ok=True)
            if attempt == attempts:
                raise RuntimeError(f"Could not download {path.name} after {attempts} attempts: {exc}") from exc
            print(f"  {path.name}: attempt {attempt} failed ({str(exc)[:60]}), retrying", flush=True)
            time.sleep(5 * attempt)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-rasters", action="store_true")
    args = ap.parse_args()

    import ee
    from backend.gee.auth import init
    init()
    aoi = get_aoi(ee)
    windows = {"baseline": BASELINE_PERIOD, "latest": LATEST_PERIOD}
    stats = {k: _stats_for(ee, aoi, w) for k, w in windows.items()}
    stats["canopy_ndvi_threshold"] = CANOPY_NDVI_THRESHOLD

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    atomic.write_json(CACHE_DIR / "composite_stats.json", stats, indent=1)
    summary = build_summary(stats)
    atomic.write_json(CACHE_DIR / "summary.json", summary, indent=1)
    print(json.dumps({k: summary[k] for k in ("baseline", "latest", "delta_canopy_pct_points", "delta_mean_lst_c")},
                     indent=1))

    if not args.no_rasters:
        for key, w in windows.items():
            _download(ndvi_composite(ee, aoi, *w).toFloat(), aoi, NDVI_SCALE_M, RASTER_DIR / f"ndvi_{key}.tif")
            _download(lst_composite(ee, aoi, *w, fill_gaps=True).toFloat(), aoi, LST_SCALE_M,
                      RASTER_DIR / f"lst_{key}.tif")
            _download(lst_valid_mask(ee, aoi, *w).toFloat(), aoi, LST_SCALE_M, RASTER_DIR / f"lst_valid_{key}.tif")
            print(f"saved rasters for {key}")


if __name__ == "__main__":
    main()
