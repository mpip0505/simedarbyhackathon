"""Helpers for the ML teammate: load the site table, write a validated scores file.

    from backend.ml_io import load_sites_df, write_scores
    df = load_sites_df()                       # one row per site, features as columns (pandas)
    ... compute score_cooling, score_connectivity, score_shade, score_total (0-100), rank (1 = plant first) ...
    write_scores(df)                           # df needs site_id + those five columns

write_scores checks the file (backend.validate_scores) and refuses to write one the API would mis-merge.
`python -m backend.ml_io --example` prints a tiny example file.
"""
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

from backend import atomic
from backend.config import CACHE_DIR
from backend.validate_scores import SCORE_FIELDS, validate

SITES_FILE = CACHE_DIR / "sites.geojson"
TABLE_FILE = CACHE_DIR / "site_features.csv"
SCORES_FILE = CACHE_DIR / "scores.geojson"
OUT_COLUMNS = ("site_id", *SCORE_FIELDS, "rank")


def _read_sites(path: Path = SITES_FILE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def current_data_version(path: Path = SITES_FILE) -> str:
    return _read_sites(path)["data_version"]


def load_sites_df(path: Path = TABLE_FILE) -> pd.DataFrame:
    """The flat feature table: site_id, lon, lat and every measured feature. Columns are explained in
    docs/data-dictionary.md. Use block_id to split train/test or folds (neighbouring cells are correlated)."""
    return pd.read_csv(path)


def load_sites_gdf(path: Path = SITES_FILE) -> gpd.GeoDataFrame:
    return gpd.read_file(path)


def scores_to_feature_collection(df: pd.DataFrame, data_version: str) -> dict:
    missing = [c for c in OUT_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"scores table is missing columns: {missing}")
    feats = []
    for rec in df[list(OUT_COLUMNS)].to_dict("records"):
        props = {"site_id": str(rec["site_id"])}
        props.update({f: None if pd.isna(rec[f]) else float(rec[f]) for f in SCORE_FIELDS})
        props["rank"] = None if pd.isna(rec["rank"]) else int(rec["rank"])
        feats.append({"type": "Feature", "geometry": None, "properties": props})
    return {"type": "FeatureCollection", "data_version": data_version, "features": feats}


def write_scores(df: pd.DataFrame, path: Path = SCORES_FILE, sites_path: Path = SITES_FILE,
                 strict: bool = False) -> Path:
    """Validate and write scores for the current sites. Raises ValueError listing every problem found.
    With strict=True, warnings (stale version, unscored sites) also stop the write."""
    sites = _read_sites(sites_path)
    fc = scores_to_feature_collection(df, sites["data_version"])
    weights_file = sites_path.parent / "weights.json"
    weights = json.loads(weights_file.read_text()) if weights_file.exists() else None
    errors, warnings = validate(fc, sites, weights)
    if errors or (strict and warnings):
        raise ValueError("scores not written:\n  " + "\n  ".join(errors + (warnings if strict else [])))
    atomic.write_json(path, fc)
    for w in warnings:
        print("WARNING:", w)
    return path


def example_scores(n: int = 3) -> dict:
    """A tiny valid example built from the first n current sites (not real scores)."""
    sites = _read_sites()
    rows = [{"site_id": f["properties"]["site_id"], "score_cooling": 80 - 10 * i, "score_connectivity": 70 - 10 * i,
             "score_shade": 60 - 10 * i, "score_total": 72 - 10 * i, "rank": i + 1}
            for i, f in enumerate(sites["features"][:n])]
    return scores_to_feature_collection(pd.DataFrame(rows), sites["data_version"])


if __name__ == "__main__":
    import sys
    print(json.dumps(example_scores(), indent=1) if "--example" in sys.argv else __doc__)
