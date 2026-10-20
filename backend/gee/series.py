"""Yearly canopy and surface-temperature series for the "over time" chart.

Run:  python -m backend.gee.series
Writes backend/data/cache/series.json. Years run October to September (matching the report windows).
Canopy comes with a low/high band from the NDVI 0.7 / 0.5 thresholds, because the proxy is threshold-sensitive.
"""
import json
from datetime import date

from backend.config import CACHE_DIR, CANOPY_NDVI_THRESHOLD
from backend.gee.composites import (canopy_mask, end_exclusive, get_aoi, landsat_clear, lst_composite,
                                    ndvi_composite)

FIRST_START = date(2021, 10, 1)  # Landsat 9 starts late 2021
N_YEARS = 5
BAND = (0.7, 0.5)  # (low canopy, high canopy)


def year_windows(first_start: date = FIRST_START, n: int = N_YEARS) -> list:
    """Consecutive Oct-Sep windows as (label, start, end) with ISO dates, end inclusive."""
    out = []
    for i in range(n):
        s = date(first_start.year + i, first_start.month, first_start.day)
        e = date(s.year + 1, s.month, s.day).fromordinal(date(s.year + 1, s.month, s.day).toordinal() - 1)
        out.append((f"{s.year}-{s.month:02d} to {e.year}-{e.month:02d}", s.isoformat(), e.isoformat()))
    return out


def run() -> list:
    import ee
    from backend.gee.auth import init
    init()
    aoi = get_aoi(ee)
    pts = []
    for label, start, end in year_windows():
        ndvi = ndvi_composite(ee, aoi, start, end)
        thresholds = (CANOPY_NDVI_THRESHOLD, *BAND)
        bands = [canopy_mask(ndvi, t).rename(f"c{round(t * 100)}") for t in thresholds]
        kw = dict(geometry=aoi, maxPixels=1e9, tileScale=4)
        c = ee.Image.cat(bands).reduceRegion(ee.Reducer.mean(), scale=10, **kw).getInfo()
        lst = lst_composite(ee, aoi, start, end)
        t = lst.reduceRegion(ee.Reducer.mean(), scale=30, **kw).getInfo()["LST_C"]
        obs = landsat_clear(ee, aoi, start, end_exclusive(end)).select("ST_B10").count().reduceRegion(
            ee.Reducer.mean(), scale=30, **kw).getInfo()["ST_B10"]
        pts.append({"label": label, "start": start, "end": end,
                    "canopy_pct": round(c[f"c{round(CANOPY_NDVI_THRESHOLD * 100)}"] * 100, 2),
                    "canopy_pct_low": round(c[f"c{round(BAND[0] * 100)}"] * 100, 2),
                    "canopy_pct_high": round(c[f"c{round(BAND[1] * 100)}"] * 100, 2),
                    "mean_lst_c": None if t is None else round(t, 2),
                    "lst_clear_obs_per_pixel": round(obs, 1)})
        print(pts[-1])
    return pts


def main() -> None:
    pts = run()
    out = {"canopy_ndvi_threshold": CANOPY_NDVI_THRESHOLD, "canopy_band_thresholds": list(BAND),
           "note": "Single-year values are noisy: canopy moves about 5 points year to year and single-year Landsat "
                   "has few clear observations. Read the trend, not individual points.", "points": pts}
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / "series.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
