"""Loads site/corridor/summary files. Prefers real cached data, falls back to mock.

Sites are completed on load: missing ML fields become null, backend/data/cache/scores.geojson (from ML)
is merged if present, and anything still unscored gets a labelled placeholder score.
Parsed files are cached by modification time, and every caller gets its own copy.
"""
import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.api import scoring
from backend.config import CACHE_DIR, DEFAULT_WEIGHTS, MOCK_DIR

_parsed: dict = {}  # path -> (mtime_ns, parsed json)


def data_dir() -> Path:
    return CACHE_DIR if (CACHE_DIR / "sites.geojson").exists() else MOCK_DIR


def data_mode() -> str:
    return "mock" if data_dir() == MOCK_DIR else "cache"


def read_json(path: Path):
    """Parsed JSON, re-read only when the file changes. Returns a deep copy the caller may mutate."""
    mtime = path.stat().st_mtime_ns
    hit = _parsed.get(path)
    if hit is None or hit[0] != mtime:
        hit = (mtime, json.loads(path.read_text(encoding="utf-8")))
        _parsed[path] = hit
    return copy.deepcopy(hit[1])


def _load(name: str) -> dict:
    return read_json(data_dir() / name)


def default_weights() -> dict:
    """weights.json in the data folder (written by ML) wins over the config default."""
    f = data_dir() / "weights.json"
    if f.exists():
        w = read_json(f)
        if set(w) == set(DEFAULT_WEIGHTS) and all(v >= 0 for v in w.values()) and sum(w.values()) > 0:
            return scoring.normalise_weights(w)
    return scoring.normalise_weights(DEFAULT_WEIGHTS)


def weights_source() -> str:
    return "file" if (data_dir() / "weights.json").exists() else "config"


def load_sites() -> dict:
    data = _load("sites.geojson")
    feats = data["features"]
    for f in feats:
        for k in scoring.ML_FIELDS:
            f["properties"].setdefault(k, None)
        f["properties"].setdefault("score_source", "mock" if data_mode() == "mock" else None)
    scores_file = data_dir() / "scores.geojson"
    if scores_file.exists():
        scoring.merge_ml_scores(feats, read_json(scores_file))
    scoring.fill_placeholders(feats, default_weights())
    if any(f["properties"]["rank"] is None for f in feats):
        scoring.assign_ranks(feats)
    return data


def score_source(features: list) -> str:
    sources = {f["properties"].get("score_source") for f in features}
    for s in ("placeholder", "mock"):
        if s in sources:
            return s
    return "ml"


def generated_at() -> Optional[str]:
    """build_info.json timestamp if present, else the sites file's modification time; None for mock."""
    if data_mode() == "mock":
        return None
    info = data_dir() / "build_info.json"
    if info.exists():
        return read_json(info).get("generated_at")
    return datetime.fromtimestamp((data_dir() / "sites.geojson").stat().st_mtime, tz=timezone.utc).isoformat(
        timespec="seconds")


def sources_built() -> Optional[dict]:
    info = data_dir() / "build_info.json"
    return read_json(info).get("sources_built") if info.exists() and data_mode() == "cache" else None


def load_corridor() -> dict:
    return _load("corridor.geojson")


def load_summary() -> dict:
    return _load("summary.json")


def load_series() -> Optional[dict]:
    f = data_dir() / "series.json"
    return read_json(f) if f.exists() else None


def load_overlays() -> Optional[dict]:
    f = data_dir() / "overlays" / "overlays.json"
    return read_json(f) if f.exists() else None


def overlay_file(name: str) -> Optional[Path]:
    """Path of a rendered overlay PNG, only for names listed in overlays.json (blocks path tricks)."""
    index = load_overlays()
    if index and name in {o["name"] for o in index["overlays"]}:
        return data_dir() / "overlays" / f"{name}.png"
    return None
