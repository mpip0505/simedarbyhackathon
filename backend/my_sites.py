"""Score your own candidate sites with the same measurements and the same scoring model, offline.

    python -m backend.my_sites my_sites.csv                 # writes my_sites_scored.csv and my_sites_scored.geojson next to it
    python -m backend.my_sites my_sites.csv --out some/dir

The input is a CSV with the columns `lat` and `lon` (decimal degrees, WGS84) and, optionally, `site_id` and `name`.
Each point becomes a 30 m cell centred on it, and goes through exactly the code that measures the simulated candidate
sites (backend.sites.generate.features_for_cells) on the cached satellite rasters and OpenStreetMap layers. The scoring
model (ml.scoring_model) then scores them against the **simulated Elmina candidate set**: "hotter than 90% of those
sites". The scores say how a point compares with that set, not how good it is in absolute terms.

A bad file is refused whole, with a line number for every problem (same rule as the field-sheet import). A point that is
outside the Elmina study area, or has no usable satellite data (water, cloud), is reported and not scored. A point on a
mapped building or road is scored but flagged. Needs the committed cache only: no Earth Engine and no internet.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, box

from backend import atomic
from backend.config import CACHE_DIR
from backend.ml_io import load_sites_df
from backend.osm.corridor import METRIC_CRS
from backend.sites import generate

MAX_POINTS = 2000
CELL_HALF_M = generate.CELL_M / 2
ID_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,39}$")
ON_BUILDING_M = generate.BUILDING_BUFFER_M
ON_ROAD_M = generate.ROAD_BUFFER_M
NOTE = ("Scores compare each point with the simulated Elmina candidate sites (percentile ranks), using the same measurements and scoring model. "
        "They are a screening aid, not an approval, and they say nothing about land ownership, tree health or what is already on the ground.")
SCORE_COLS = ["score_cooling", "score_connectivity", "score_shade", "score_total"]
FEATURE_COLS = ["lst_mean_250m", "ndvi_mean_250m", "uncovered_path_length_50m", "corridor_gap_dist_m", "dist_to_nearest_park_m", "lst_valid_frac"]


class SheetError(ValueError):
    """The file cannot be used; .problems holds one message per problem, each with its line number."""

    def __init__(self, problems):
        super().__init__("; ".join(problems))
        self.problems = problems


def safe_cell(value) -> str:
    """Text for a spreadsheet cell: a leading = + - @ (or tab or CR) would run as a formula in Excel, so it is neutralised."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def read_points(path: Path) -> list:
    """Rows of {id, name, lat, lon, line}. Raises SheetError listing every problem, or on an empty or oversized file."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        header = [h.strip().lower() for h in (reader.fieldnames or [])]
        if "lat" not in header or "lon" not in header:
            raise SheetError(["line 1: the file needs the columns lat and lon (decimal degrees)"])
        reader.fieldnames = header
        rows = list(reader)
    if not rows:
        raise SheetError(["the file has no rows"])
    if len(rows) > MAX_POINTS:
        raise SheetError([f"the file has {len(rows)} rows; the limit is {MAX_POINTS}"])
    problems, out, seen = [], [], set()
    for n, row in enumerate(rows, start=2):
        lat_s, lon_s = (row.get("lat") or "").strip(), (row.get("lon") or "").strip()
        try:
            lat, lon = float(lat_s), float(lon_s)
            if not (-90 <= lat <= 90 and -180 <= lon <= 180) or lat != lat or lon != lon:
                raise ValueError
        except ValueError:
            problems.append(f"line {n}: lat and lon must be numbers in decimal degrees (got {lat_s!r}, {lon_s!r})")
            continue
        sid = (row.get("site_id") or "").strip() or f"my-{n - 1:04d}"
        if not ID_OK.match(sid):
            problems.append(f"line {n}: site_id {sid!r} must be 1 to 40 letters, digits, dot, dash or underscore")
            continue
        if sid in seen:
            problems.append(f"line {n}: site_id {sid!r} appears twice")
            continue
        seen.add(sid)
        out.append({"id": sid, "name": (row.get("name") or "").strip()[:80], "lat": lat, "lon": lon, "line": n})
    if problems:
        raise SheetError(problems)
    return out


def score_points(points: list, layers: dict, rasters: dict, reference: pd.DataFrame, weights: dict) -> tuple:
    """(scored GeoDataFrame, skipped list of (id, reason)). Pure with respect to the cache: nothing is written."""
    from ml.scoring_model import score_sites

    study = layers["aoi"].to_crs(METRIC_CRS).geometry.union_all()
    pts_m = gpd.GeoSeries([Point(p["lon"], p["lat"]) for p in points], crs=4326).to_crs(METRIC_CRS)
    skipped, keep = [], []
    for i, (p, pt) in enumerate(zip(points, pts_m)):
        if not study.contains(pt):
            skipped.append((p["id"], "outside the Elmina study area"))
        else:
            keep.append(i)
    cells = [box(pts_m[i].x - CELL_HALF_M, pts_m[i].y - CELL_HALF_M, pts_m[i].x + CELL_HALF_M, pts_m[i].y + CELL_HALF_M) for i in keep]
    ids = [points[i]["id"] for i in keep]
    if not cells:
        return None, skipped
    gdf, kept = generate.features_for_cells(cells, layers, rasters, ids=ids, source="user_supplied")
    got = {ids[k] for k in kept}
    skipped += [(i, "no usable satellite data here (open water, cloud or outside the imagery)") for i in ids if i not in got]
    if not len(gdf):
        return None, skipped

    bld = layers["buildings"].to_crs(METRIC_CRS).geometry
    rds = layers["roads"].to_crs(METRIC_CRS).geometry
    bld_u, rds_u = bld.union_all(), rds.union_all()
    by_id = {p["id"]: (p, pts_m[i]) for i, p in enumerate(points)}
    flags, names, lats, lons = [], [], [], []
    for sid in gdf["site_id"]:
        p, pt = by_id[sid]
        f = []
        if pt.distance(bld_u) <= ON_BUILDING_M:
            f.append("point is on or beside a mapped building")
        if pt.distance(rds_u) <= ON_ROAD_M:
            f.append("point is on or beside a mapped road")
        if (gdf.loc[gdf["site_id"] == sid, "lst_valid_frac"].iloc[0] or 0) < 0.5:
            f.append("ground temperature here is mostly filled in from neighbours")
        flags.append("; ".join(f))
        names.append(p["name"]); lats.append(p["lat"]); lons.append(p["lon"])
    gdf["name"], gdf["lat"], gdf["lon"], gdf["flags"] = names, lats, lons, flags

    scores = score_sites(gdf.drop(columns="geometry"), weights, reference=reference)
    gdf = gdf.merge(scores[["site_id"] + SCORE_COLS + ["rank"]].rename(columns={"rank": "rank_in_your_list"}), on="site_id")
    ref = score_sites(reference, weights)
    # where the point would sit among the simulated sites, with the model's own tie rule (equal scores order by site_id)
    gdf["would_rank_among_simulated"] = [
        int(((ref["score_total"] > s) | ((ref["score_total"] == s) & (ref["site_id"] < sid))).sum()) + 1
        for sid, s in zip(gdf["site_id"], gdf["score_total"])]
    return gdf.sort_values("rank_in_your_list").reset_index(drop=True), skipped


def write_outputs(gdf, skipped: list, out_dir: Path, stem: str, n_simulated: int) -> tuple:
    cols = ["rank_in_your_list", "site_id", "name", "lat", "lon", *SCORE_COLS, "would_rank_among_simulated", *FEATURE_COLS, "flags"]
    table = gdf[cols].copy()
    for c in ("site_id", "name", "flags"):
        table[c] = table[c].map(safe_cell)
    table["would_rank_among_simulated"] = table["would_rank_among_simulated"].map(lambda r: f"{r} of {n_simulated + 1}")
    table["note"] = ""
    table.loc[0, "note"] = NOTE
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = atomic.write_csv(table, out_dir / f"{stem}_scored.csv", index=False)
    fc = json.loads(gdf[["site_id", "name", *SCORE_COLS, "rank_in_your_list", "would_rank_among_simulated", "flags", "geometry"]].to_json(drop_id=True))
    fc["note"] = NOTE
    fc["skipped"] = [{"site_id": i, "reason": r} for i, r in skipped]
    geo_path = atomic.write_json(out_dir / f"{stem}_scored.geojson", fc)
    return csv_path, geo_path


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", type=Path, help="CSV with lat, lon and optionally site_id, name")
    ap.add_argument("--out", type=Path, default=None, help="output folder (default: next to the input file)")
    a = ap.parse_args(argv)

    layers, rasters = generate.load_inputs()
    layers["aoi"] = gpd.read_file(generate.OSM_DIR / "aoi.geojson")
    try:
        points = read_points(a.csv)
    except SheetError as e:
        print(f"{a.csv} was not used. Nothing was scored.", file=sys.stderr)
        for m in e.problems:
            print("  -", m, file=sys.stderr)
        for src in rasters.values():
            src.close()
        return 1
    try:
        weights = json.loads((CACHE_DIR / "weights.json").read_text(encoding="utf-8"))
        weights = weights.get("default", weights)
        reference = load_sites_df()
        gdf, skipped = score_points(points, layers, rasters, reference, weights)
    finally:
        for src in rasters.values():
            src.close()
    for i, why in skipped:
        print(f"  not scored: {i}: {why}")
    if gdf is None:
        print("No point could be scored.", file=sys.stderr)
        return 1
    out_dir = a.out or a.csv.parent
    csv_path, geo_path = write_outputs(gdf, skipped, out_dir, a.csv.stem, len(reference))
    print(f"{len(gdf)} of {len(points)} points scored -> {csv_path}, {geo_path}")
    print(gdf[["rank_in_your_list", "site_id", "score_total", "would_rank_among_simulated"]].head(10).to_string(index=False))
    print(NOTE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
