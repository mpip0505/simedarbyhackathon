"""Compute baseline/latest canopy % and mean LST over Elmina and cache them (plus small rasters).

Run:  python -m backend.gee.export              (stats + rasters)
      python -m backend.gee.export --no-rasters (stats only)
Writes backend/data/cache/summary.json (API contract), composite_stats.json, rasters/*.tif
"""
import argparse
import json
import urllib.request

from backend.config import BASELINE_PERIOD, CACHE_DIR, CANOPY_NDVI_THRESHOLD, CAVEATS, LATEST_PERIOD
from backend.gee.composites import canopy_mask, get_aoi, lst_composite, ndvi_composite
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
    c = canopy.reduceRegion(ee.Reducer.mean(), scale=NDVI_SCALE_M, **kw).getInfo()["CANOPY"]
    n = ndvi.reduceRegion(ee.Reducer.mean(), scale=NDVI_SCALE_M, **kw).getInfo()["NDVI"]
    t = lst.reduceRegion(ee.Reducer.mean(), scale=LST_SCALE_M, **kw).getInfo()["LST_C"]
    if c is None or t is None:
        raise RuntimeError(f"No valid pixels for {window}; widen the period")
    return {"canopy_pct": c * 100, "ndvi_mean": n, "mean_lst_c": t, "window": list(window)}


def _download(image, aoi, scale: int, path) -> None:
    url = image.getDownloadURL({"region": aoi, "scale": scale, "crs": "EPSG:4326", "format": "GEO_TIFF"})
    path.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, path)


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
    (CACHE_DIR / "composite_stats.json").write_text(json.dumps(stats, indent=1), encoding="utf-8")
    summary = build_summary(stats)
    (CACHE_DIR / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("baseline", "latest", "delta_canopy_pct_points", "delta_mean_lst_c")},
                     indent=1))

    if not args.no_rasters:
        for key, w in windows.items():
            _download(ndvi_composite(ee, aoi, *w).toFloat(), aoi, NDVI_SCALE_M, RASTER_DIR / f"ndvi_{key}.tif")
            _download(lst_composite(ee, aoi, *w, fill_gaps=True).toFloat(), aoi, LST_SCALE_M,
                      RASTER_DIR / f"lst_{key}.tif")
            print(f"saved rasters for {key}")


if __name__ == "__main__":
    main()
