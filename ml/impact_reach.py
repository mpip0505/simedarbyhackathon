"""What the top-ranked sites REACH: unshaded footpath, mapped homes and corridor gaps, de-duplicated.

    python -m ml.impact_reach             # writes ml/reports/impact_reach.json and .md
    python -m ml.impact_reach --stdout    # prints the markdown, writes nothing

This is REACH, not OUTCOME. It counts how much of three things lies near the planting sites, using the same distances the site features
already use (footpath within 50 m of a cell, homes within 250 m of a cell's centre, a corridor gap within 50 m of a cell's centre).
It does not say planting there would cool anything, improve health, or that trees would survive. The sites are simulated.

Why a union and not a sum: neighbouring 30 m cells share the same footpath and the same homes. Adding per-site numbers counts them again
(an early sum of the top 50 gave 17,102 m of footpath against a township total near 30,000 m, which is not a usable figure). Here every
footpath point, home and gap point is counted at most once, however many chosen cells are near it.

Each row also carries a ceiling: the same measure for ALL candidate sites. The top N cannot reach more than the ceiling, so reading N
against it shows how much of what is reachable the first N sites cover.
"""
from __future__ import annotations

import argparse
import json

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from shapely import prepared
from shapely.geometry import Point
from shapely.ops import unary_union

from backend.config import CACHE_DIR, CANOPY_NDVI_THRESHOLD
from backend.ml_io import current_data_version, load_sites_df
from backend.osm.corridor import METRIC_CRS
from backend.osm.extract import OSM_DIR
from backend.sites.generate import (CONTEXT_RADII_M, GAP_FLAG_DIST_M, PATH_RADIUS_M, RASTER_DIR, RESIDENTIAL, SPINE_STEP_M,
                                    gap_points, line_points, sample_points)

from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import score_sites
from ml.uncertainty import REPORT_DIR

HOME_RADIUS_M = max(CONTEXT_RADII_M)
STEPS = (5, 10, 20, 50, 100, 200)
PATH_STEP_M = 10.0          # footpath is sampled every 10 m, the same as in backend.sites.generate


def reached_points(points: list, cells: list, radius_m: float) -> np.ndarray:
    """Boolean per point: is it within radius_m of any of the cells? Each point counts once however many cells are near."""
    if not cells or not points:
        return np.zeros(len(points), dtype=bool)
    zone = prepared.prep(unary_union([c.buffer(radius_m) for c in cells]))
    return np.array([zone.intersects(p) for p in points], dtype=bool)


def reached_buildings(buildings: list, centres: list, radius_m: float) -> np.ndarray:
    """Boolean per building: does it touch the disc of radius_m around any chosen cell centre?"""
    if not centres or not buildings:
        return np.zeros(len(buildings), dtype=bool)
    zone = prepared.prep(unary_union([c.buffer(radius_m) for c in centres]))
    return np.array([zone.intersects(b) for b in buildings], dtype=bool)


def measure(order: list[int], cells: list, centres: list, unshaded_pts: list, homes: list, gap_pts: list) -> dict:
    """Reach of the cells at positions `order` (a list of indexes into cells and centres)."""
    chosen_cells = [cells[i] for i in order]
    chosen_centres = [centres[i] for i in order]
    path = reached_points(unshaded_pts, chosen_cells, PATH_RADIUS_M)
    home = reached_buildings(homes, chosen_centres, HOME_RADIUS_M)
    gap = reached_points(gap_pts, chosen_centres, GAP_FLAG_DIST_M)     # centre-to-gap distance, as the corridor_gap_flag feature does
    return {"unshaded_path_m": float(path.sum() * PATH_STEP_M), "homes": int(home.sum()), "gap_m": float(gap.sum() * SPINE_STEP_M)}


def _pct(part: float, whole: float) -> float | None:
    return None if not whole else round(100.0 * part / whole, 1)


def curve(order: list[int], cells: list, centres: list, unshaded_pts: list, homes: list, gap_pts: list, steps=STEPS) -> dict:
    """Totals, the ceiling (all candidate sites) and one row per N of the top N sites in `order`."""
    totals = {"unshaded_path_m": float(len(unshaded_pts) * PATH_STEP_M), "homes": len(homes), "gap_m": float(len(gap_pts) * SPINE_STEP_M)}
    ceiling = measure(list(range(len(cells))), cells, centres, unshaded_pts, homes, gap_pts)
    rows = []
    for n in [s for s in steps if s < len(order)] + [len(order)]:
        m = measure(order[:n], cells, centres, unshaded_pts, homes, gap_pts)
        rows.append({
            "n": n, "area_m2": round(sum(cells[i].area for i in order[:n])),
            "unshaded_path_m": round(m["unshaded_path_m"]), "unshaded_path_pct_of_township": _pct(m["unshaded_path_m"], totals["unshaded_path_m"]),
            "unshaded_path_pct_of_reachable": _pct(m["unshaded_path_m"], ceiling["unshaded_path_m"]),
            "homes": m["homes"], "homes_pct_of_township": _pct(m["homes"], totals["homes"]), "homes_pct_of_reachable": _pct(m["homes"], ceiling["homes"]),
            "gap_m": round(m["gap_m"]), "gap_pct_of_corridor_gaps": _pct(m["gap_m"], totals["gap_m"]), "gap_pct_of_reachable": _pct(m["gap_m"], ceiling["gap_m"]),
        })
    return {"totals": {k: round(v) for k, v in totals.items()}, "ceiling": {k: round(v) for k, v in ceiling.items()}, "rows": rows}


def _load_inputs():
    """Cells and centres (metric CRS, in default-ranking order) and the three things to reach."""
    df = load_sites_df()
    order_ids = score_sites(df, DEFAULT_WEIGHTS).sort_values("rank")["site_id"].tolist()
    sites = gpd.read_file(CACHE_DIR / "sites.geojson").set_index("site_id").to_crs(METRIC_CRS)
    cells = [sites.geometry[i] for i in order_ids]
    centres = [c.centroid for c in cells]

    paths = gpd.read_file(OSM_DIR / "paths.geojson").to_crs(METRIC_CRS).geometry
    with rasterio.open(RASTER_DIR / "ndvi_latest.tif") as ndvi:
        pts = line_points(list(paths), PATH_STEP_M)
        vals = sample_points(ndvi, pts)
        unshaded = [p for p, v in zip(pts, vals) if np.isfinite(v) and v < CANOPY_NDVI_THRESHOLD]
        below_pct = 100.0 * len(unshaded) / max(1, int(np.isfinite(vals).sum()))
        spine = list(gpd.read_file(CACHE_DIR / "corridor_spine.geojson").to_crs(METRIC_CRS).geometry)
        gaps = gap_points(spine, ndvi)
    bld = gpd.read_file(OSM_DIR / "buildings.geojson").to_crs(METRIC_CRS)
    homes = [g for g, t in zip(bld.geometry, bld["building"]) if t in RESIDENTIAL]
    return order_ids, cells, centres, unshaded, homes, gaps, below_pct


def build() -> dict:
    order_ids, cells, centres, unshaded, homes, gaps, below_pct = _load_inputs()
    result = curve(list(range(len(cells))), cells, centres, unshaded, homes, gaps)
    return {
        "data_version": current_data_version(), "n_sites": len(cells), "ranking": "ML default weights",
        "weights": DEFAULT_WEIGHTS, "canopy_ndvi_threshold": CANOPY_NDVI_THRESHOLD, "path_samples_below_threshold_pct": round(below_pct),
        "definitions": {
            "unshaded_path_m": f"OpenStreetMap footpath (sampled every {PATH_STEP_M:.0f} m) whose latest greenness is below {CANOPY_NDVI_THRESHOLD}, within {PATH_RADIUS_M} m of a chosen site. About, to the nearest 10 m. About {round(below_pct)}% of all footpath samples fall below that threshold (a 10 m pixel mixes pavement with any trees beside it), so this is close to 'footpath near the sites' and is a satellite proxy, not a shade survey.",
            "homes": f"Mapped residential buildings touching a {HOME_RADIUS_M} m circle around a chosen site's centre. OpenStreetMap under-maps some areas, so this is a lower bound.",
            "gap_m": f"Corridor spine (approximate) with greenness below the gap threshold, within {GAP_FLAG_DIST_M} m of a chosen site's centre. About, to the nearest 10 m.",
        },
        "note": "REACH, not outcome. It counts what lies near the sites; it does not show planting there would cool, improve health or survive. The sites are simulated. "
                "Every footpath point, home and gap point is counted once, however many chosen sites are near it.",
        **result,
    }


def to_markdown(r: dict) -> str:
    t, c = r["totals"], r["ceiling"]
    lines = [
        "# What the top sites reach", f"Generated on data_version `{r['data_version']}`, {r['n_sites']} simulated sites, ranked with the ML default weights. Regenerate with `python -m ml.impact_reach`.", "",
        f"> {r['note']}", "",
        "## Totals in the township (from our data)",
        f"- Footpath with little tree cover (satellite): about **{t['unshaded_path_m']:,} m**; **{c['unshaded_path_m']:,} m** of it is within reach of at least one candidate site.",
        f"- Mapped homes: **{t['homes']:,}**; **{c['homes']:,}** are within 250 m of at least one candidate site.",
        f"- Corridor gaps (approximate corridor): about **{t['gap_m']:,} m**; **{c['gap_m']:,} m** of it is within 50 m of at least one candidate site.", "",
        "## What the first N sites reach", "",
        "| N sites | planting area (m²) | footpath with little tree cover (m) | % of reachable | homes | % of reachable | corridor gap (m) | % of reachable |", "|---|---|---|---|---|---|---|---|",
        *[f"| {x['n']} | {x['area_m2']:,} | {x['unshaded_path_m']:,} | {x['unshaded_path_pct_of_reachable']}% | {x['homes']:,} | {x['homes_pct_of_reachable']}% | {x['gap_m']:,} | {x['gap_pct_of_reachable']}% |" for x in r["rows"]], "",
        "## Definitions", *[f"- **{k}**: {v}" for k, v in r["definitions"].items()], "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--stdout", action="store_true", help="print the report, write nothing")
    args = ap.parse_args()
    result = build()
    md = to_markdown(result)
    if args.stdout:
        print(md)
        return
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "impact_reach.json").write_text(json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    (REPORT_DIR / "impact_reach.md").write_text(md, encoding="utf-8")
    print(f"wrote {REPORT_DIR / 'impact_reach.md'}")


if __name__ == "__main__":
    main()
