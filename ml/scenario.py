"""A planting-impact SCENARIO, deliberately not called a forecast or a prediction.

    python -m ml.scenario                   # top 50 ranked sites, 25-year horizon
    python -m ml.scenario --k 20 --years 15

Why this exists, and why it is not a time-series forecast
-----------------------------------------------------------
The backend's yearly series (`GET /summary/series`, `backend/data/cache/series.json`) is five
historical points, and the project already says plainly that the year-to-year noise in them (about
5 canopy points) is bigger than the signal - one year's 90% band spans 6.6% to 21.9% canopy. Fitting
a trend line through that and calling it a forecast would be a worse version of exactly the
overclaiming this project otherwise refuses to do.

What this module does instead: given a planting choice (plant the top K ranked sites), project a
plausible canopy trajectory for *that planted set only*, under a stated, visible growth assumption,
shown as a wide band across three scenarios (fast/default/slow), explicitly labelled a scenario. It
answers "what might this look like if it works", not "what will happen". Two things keep it honest:

1. The ceiling is **measured, today**, not invented: the canopy a planted site could plausibly reach
   is anchored to what Elmina's own existing OSM-mapped parks measure right now, using the exact
   same NDVI >= 0.6 definition as everywhere else in this project (`measure_park_canopy_ceiling`).
   On the current build this reads about 15% - notably not a lush fantasy number, which is itself an
   honest finding worth saying in the pitch: even Elmina's existing green space is mostly lawn and
   young landscaping, not closed tree canopy.
2. The *time* to approach that ceiling is the one number nobody can measure here - there is no field
   data on how fast a newly planted site in Elmina gains canopy - so it is kept as an explicit,
   named, swappable assumption (`GROWTH_SCENARIOS`), not dressed up as a citation. Replace it with
   real nursery or arborist input before using this for anything beyond an illustrative pitch chart.

What this module deliberately does NOT do: translate canopy into a temperature or carbon number.
That needs a calibrated local relationship between NDVI and cooling (or a carbon model) that this
project does not have - inventing one would be the same mistake as the forecast it is trying to
avoid. Scope stays at canopy percentage of the planted set only, not the whole township.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from backend.config import CACHE_DIR
from backend.ml_io import current_data_version, load_sites_df

from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import score_sites

REPORT_DIR = Path(__file__).resolve().parent / "reports"
PARKS_FILE = CACHE_DIR / "osm" / "parks.geojson"
NDVI_LATEST_RASTER = CACHE_DIR / "rasters" / "ndvi_latest.tif"
NDVI_CANOPY_THRESHOLD = 0.6     # same definition the whole project uses - see backend/config.py

# Years to close 90% of the gap to the ceiling. Not fitted, not cited - a named, swappable
# assumption. "default" is a mid-range guess for a medium-growth tropical shade tree in an urban
# setting; "fast"/"slow" bracket it. Change these the moment real horticultural input exists.
GROWTH_SCENARIOS = {"fast": 10.0, "default": 15.0, "slow": 20.0}


def measure_park_canopy_ceiling(parks_path: Path = PARKS_FILE, raster_path: Path = NDVI_LATEST_RASTER,
                                threshold: float = NDVI_CANOPY_THRESHOLD) -> float:
    """% of pixels inside Elmina's existing OSM-mapped parks with NDVI >= threshold, latest window.
    Measured, not assumed - the one anchor in this module that is not a stated guess. Needs
    geopandas + rasterio (ml/requirements.txt); not needed anywhere else in ml/, so imported here
    only, lazily, to keep that dependency out of the core scoring path.
    """
    import geopandas as gpd
    import rasterio
    from rasterio.mask import mask

    parks = gpd.read_file(parks_path)
    with rasterio.open(raster_path) as src:
        parks_proj = parks.to_crs(src.crs)
        geoms = [g.__geo_interface__ for g in parks_proj.geometry if g is not None and not g.is_empty]
        out_image, _ = mask(src, geoms, crop=True, nodata=np.nan, filled=True)
    valid = out_image[0]
    valid = valid[~np.isnan(valid)]
    if valid.size == 0:
        raise ValueError("no valid NDVI pixels found inside the park polygons - check the inputs")
    return round(float((valid >= threshold).mean()) * 100.0, 1)


def canopy_trajectory(start_pct: float, ceiling_pct: float, years: np.ndarray,
                      years_to_90pct: float) -> np.ndarray:
    """Exponential approach from start_pct to ceiling_pct, reaching 90% of the gap at
    years_to_90pct. A stated growth-curve *shape* (slow-start urban forestry patterns are commonly
    summarised this way), not a fitted model - see the module docstring."""
    years = np.asarray(years, dtype=float)
    tau = years_to_90pct / np.log(10)          # so exp(-years_to_90pct/tau) == 0.10
    frac = 1.0 - np.exp(-years / tau)
    return start_pct + (ceiling_pct - start_pct) * frac


def planting_scenario(k: int = 50, years: int = 25, weights: dict = None,
                      ceiling_pct: float = None) -> dict:
    """Project the average canopy_pct of the top-k ranked sites under each growth scenario, against
    a flat "do nothing" baseline at today's value. Scope is the planted set only - not a township
    figure."""
    df = load_sites_df()
    scores = score_sites(df, weights or DEFAULT_WEIGHTS)
    chosen = (df[["site_id", "canopy_pct_baseline"]].merge(scores[["site_id", "rank"]], on="site_id")
             .nsmallest(k, "rank"))
    start_pct = round(float(chosen["canopy_pct_baseline"].mean()), 1)
    ceiling = measure_park_canopy_ceiling() if ceiling_pct is None else ceiling_pct
    year_axis = list(range(0, years + 1))
    trajectories = {name: [round(v, 1) for v in canopy_trajectory(start_pct, ceiling, year_axis, y90)]
                    for name, y90 in GROWTH_SCENARIOS.items()}
    return {
        "data_version": current_data_version(), "k": k, "years": year_axis,
        "start_pct": start_pct, "ceiling_pct": ceiling,
        "ceiling_source": "measured today inside Elmina's existing OSM-mapped parks (NDVI >= 0.6, latest window)",
        "growth_scenarios_years_to_90pct": GROWTH_SCENARIOS,
        "do_nothing_pct": start_pct,
        "trajectories": trajectories,
        "end_of_horizon": {name: traj[-1] for name, traj in trajectories.items()},
    }


def to_markdown(r: dict) -> str:
    rows = [{"year": y, "do_nothing": r["do_nothing_pct"],
            **{name: traj[i] for name, traj in r["trajectories"].items()}}
           for i, y in enumerate(r["years"]) if y % 5 == 0 or y == r["years"][-1]]
    head = "| year | do_nothing | " + " | ".join(r["trajectories"]) + " |\n"
    head += "|---|---|" + "---|" * len(r["trajectories"]) + "\n"
    table = head + "".join(
        "| " + " | ".join(str(row[c]) for c in ["year", "do_nothing", *r["trajectories"]]) + " |\n"
        for row in rows)
    return "".join([
        "# Planting-impact scenario — NOT a forecast\n",
        f"Data version `{r['data_version']}`. Regenerate with `python -m ml.scenario --k {r['k']} "
        f"--years {r['years'][-1]}`.\n",
        "\n> **This is a scenario, not a prediction.** It shows what a plausible outcome could look "
        "like under a stated growth assumption we did not fit to any field data (none exists for "
        "Elmina) - it is not a trend fitted to the yearly series, which the project already says is "
        "noisier than its signal. Change the assumption, change the chart. It is also scoped to the "
        "*planted set's own average canopy*, not a township-wide figure, and it makes no claim about "
        "temperature or carbon - those need relationships this project has not measured.\n",
        f"\n## The one measured input\nCeiling = **{r['ceiling_pct']}%** canopy (NDVI >= 0.6) — "
        f"{r['ceiling_source']}. Notably modest: even Elmina's existing green space is mostly lawn "
        "and young landscaping, not closed tree canopy, which is itself worth saying rather than "
        "hiding behind a rosier assumption.\n",
        "\n## The one assumed input\nYears to close 90% of the gap to that ceiling: "
        + ", ".join(f"**{v:g} ({k})**" for k, v in r["growth_scenarios_years_to_90pct"].items())
        + ". Not fitted, not cited — a named, swappable assumption. Replace with real nursery/"
        "arborist input before using this for anything beyond an illustrative pitch chart.\n",
        f"\n## Top {r['k']} ranked sites, planted vs doing nothing — average canopy % over time\n",
        f"Today's average across the top {r['k']} sites: **{r['start_pct']}%**.\n\n",
        table,
        f"\nAt year {r['years'][-1]}: " + ", ".join(
            f"**{name}** reaches {v}%" for name, v in r["end_of_horizon"].items())
        + f", against {r['do_nothing_pct']}% doing nothing.\n",
    ])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--k", type=int, default=50, help="how many top-ranked sites are \"planted\" (default 50)")
    ap.add_argument("--years", type=int, default=25, help="scenario horizon in years (default 25)")
    a = ap.parse_args()

    report = planting_scenario(a.k, a.years)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "scenario.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    (REPORT_DIR / "scenario.md").write_text(to_markdown(report), encoding="utf-8")
    print("wrote", REPORT_DIR / "scenario.json")
    print("wrote", REPORT_DIR / "scenario.md")
    print(f"\nceiling (measured, Elmina parks today): {report['ceiling_pct']}%")
    print(f"top {a.k} sites today: {report['start_pct']}% average canopy")
    print(f"at year {a.years}: " + ", ".join(f"{k}={v}%" for k, v in report["end_of_horizon"].items()))


if __name__ == "__main__":
    main()
