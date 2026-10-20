"""Go/no-go check: is there enough cloud-free Sentinel-2 and Landsat imagery over Elmina?

Run:  python -m backend.gee.imagery_check
Writes backend/data/cache/imagery_check.json and imagery_check.txt (paste the .txt to the team).
"""
import json
from collections import Counter
from datetime import datetime, timezone

from backend.gee.composites import end_exclusive, get_aoi, landsat_clear, sentinel2_clear
from backend.config import BASELINE_PERIOD, CACHE_DIR, ELMINA_BBOX, LATEST_PERIOD

TARGET_CLEAR_OBS = 3      # clear observations per pixel we want for a stable median
COMPOSITE_OK = 0.90       # share of AOI with >= TARGET_CLEAR_OBS clear obs -> plain GO
MIN_COVER_ANY = 0.80      # share of AOI with >= 1 clear obs, below this -> NO-GO
MAX_SCENE_CLOUD = 40      # scene-level cloud % used only for the "usable scenes" count
RANK = {"GO": 0, "GO_COMPOSITE": 1, "NO_GO": 2}


def monthly_counts(times_ms: list, clouds: list, max_cloud: float = MAX_SCENE_CLOUD) -> dict:
    """Scenes per YYYY-MM whose scene-level cloud % is <= max_cloud (missing cloud counts as unusable)."""
    c = Counter()
    for t, cloud in zip(times_ms, clouds):
        if cloud is not None and cloud <= max_cloud:
            c[datetime.fromtimestamp(t / 1000, tz=timezone.utc).strftime("%Y-%m")] += 1
    return dict(sorted(c.items()))


def combo_verdict(frac_ge1: float, frac_ge_target: float) -> str:
    if frac_ge_target >= COMPOSITE_OK:
        return "GO"
    if frac_ge1 >= MIN_COVER_ANY:
        return "GO_COMPOSITE"
    return "NO_GO"


def overall_verdict(results: dict) -> tuple[str, list]:
    """Worst verdict across every period x sensor, plus a line per combination."""
    lines, worst = [], "GO"
    for period, sensors in results.items():
        for sensor, s in sensors.items():
            v = combo_verdict(s["frac_ge1"], s["frac_ge_target"])
            s["verdict"] = v
            lines.append(f"{period:8s} {sensor:11s} scenes={s['n_scenes']:3d} usable(<= {MAX_SCENE_CLOUD}% cloud)="
                         f"{s['n_usable_scenes']:3d} cover>=1 obs={s['frac_ge1']:.0%} "
                         f"cover>={TARGET_CLEAR_OBS} obs={s['frac_ge_target']:.0%} -> {v}")
            if RANK[v] > RANK[worst]:
                worst = v
    return worst, lines


def _measure(ee, aoi, coll, band: str, start: str, end: str, cloud_prop: str) -> dict:
    """Scene counts (one getInfo) and per-pixel clear-observation coverage (one getInfo)."""
    info = coll.aggregate_array("system:time_start").getInfo(), coll.aggregate_array(cloud_prop).getInfo()
    count = coll.select(band).count()  # masked pixels are not counted
    cover = ee.Image.cat(count.gte(1).rename("ge1"), count.gte(TARGET_CLEAR_OBS).rename("ge_t")).reduceRegion(
        ee.Reducer.mean(), aoi, scale=30, bestEffort=True, maxPixels=1e9, tileScale=4).getInfo()
    monthly = monthly_counts(*info)
    return {"n_scenes": len(info[0]), "n_usable_scenes": sum(monthly.values()), "monthly_usable": monthly,
            "frac_ge1": cover.get("ge1") or 0.0, "frac_ge_target": cover.get("ge_t") or 0.0}


def run() -> dict:
    import ee
    from backend.gee.auth import init
    init()
    aoi = get_aoi(ee)
    results = {}
    for label, (start, end) in (("baseline", BASELINE_PERIOD), ("latest", LATEST_PERIOD)):
        end_excl = end_exclusive(end)
        results[label] = {
            "sentinel2": _measure(ee, aoi, sentinel2_clear(ee, aoi, start, end_excl), "B8", start, end_excl,
                                  "CLOUDY_PIXEL_PERCENTAGE"),
            "landsat8_9": _measure(ee, aoi, landsat_clear(ee, aoi, start, end_excl), "ST_B10", start, end_excl,
                                   "CLOUD_COVER"),
        }
    return results


def report(results: dict) -> str:
    verdict, lines = overall_verdict(results)
    text = {
        "GO": "GO: enough clear observations for stable composites.",
        "GO_COMPOSITE": "GO WITH MULTI-DATE COMPOSITES: single scenes are too cloudy, but pooled dates cover the area. "
                        "Use median composites and say so in the pitch.",
        "NO_GO": "NO-GO for at least one period/sensor: coverage too low. Widen the date window or change period.",
    }[verdict]
    return "\n".join([
        f"Imagery check for AOI {ELMINA_BBOX} (OSM Elmina area bounds)",
        f"Baseline {BASELINE_PERIOD}, latest {LATEST_PERIOD}",
        f"Pixel masks: Sentinel-2 Cloud Score+ cs_cdf>=0.6; Landsat QA_PIXEL cloud/shadow/cirrus + confidence bits, ST_QA <= 4 K.",
        "", *lines, "", text])


def main() -> None:
    results = run()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / "imagery_check.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
    text = report(results)
    (CACHE_DIR / "imagery_check.txt").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
