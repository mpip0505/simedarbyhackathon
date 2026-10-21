"""Loads site/corridor/summary files. Prefers real cached data, falls back to mock.

Sites are completed on load: missing ML fields become null, backend/data/cache/scores.geojson (from ML)
is merged if it passes validation, and anything still unscored gets a labelled placeholder score.

Resilience rules (the API must keep answering during a recorded demo):
- a bad or half-written scores file is ignored and reported (`scores_error`), never fatal;
- if a file turns unreadable after a good read, the last good copy keeps being served;
- an incomplete cache folder falls back to mock data, loudly (logged), not silently;
- only when there has never been a good copy does a caller get `DataUnavailable` (the API answers 503).
Parsed files are cached by modification time, and every caller gets its own copy.
"""
import copy
import csv
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend import validate_scores
from backend.api import scoring
from backend.config import CACHE_DIR, DEFAULT_WEIGHTS, ML_REPORTS_DIR, MOCK_DIR
from backend.provenance import inputs_stale

log = logging.getLogger("backend.store")

REQUIRED_FILES = ("sites.geojson", "corridor.geojson", "summary.json")
_parsed: dict = {}   # path -> (mtime_ns, parsed json)
_warned: set = set()  # log each distinct problem once, not on every request


class DataUnavailable(Exception):
    """A required data file is missing or unreadable and no earlier good copy exists."""


def details_enabled() -> bool:
    """Public responses carry generic messages only. Set API_EXPOSE_DETAILS=1 (local debugging) to include the
    detailed reasons; they are always written to the server log either way."""
    return os.environ.get("API_EXPOSE_DETAILS", "").lower() in ("1", "true", "yes")


def _warn_once(key: str, message: str, *args) -> None:
    if key not in _warned:
        _warned.add(key)
        log.warning(message, *args)


def data_dir() -> Path:
    """The cache folder if it is complete, otherwise the mock folder (logged once, not silent)."""
    missing = [f for f in REQUIRED_FILES if not (CACHE_DIR / f).exists()]
    if not missing:
        return CACHE_DIR
    if (CACHE_DIR / "sites.geojson").exists():
        _warn_once("incomplete-cache", "cache folder is incomplete (missing %s): serving MOCK data", ", ".join(missing))
    return MOCK_DIR


def data_mode() -> str:
    return "mock" if data_dir() == MOCK_DIR else "cache"


def read_json(path: Path):
    """Parsed JSON, re-read only when the file changes. Returns a deep copy the caller may mutate.
    If the file becomes unreadable, the last good parse is served; DataUnavailable only if there never was one."""
    last = _parsed.get(path)
    try:
        mtime = path.stat().st_mtime_ns
        if last is None or last[0] != mtime:
            parsed = json.loads(path.read_text(encoding="utf-8"))
            last = _parsed[path] = (mtime, parsed)
    except (OSError, ValueError) as exc:
        reason = "missing" if isinstance(exc, FileNotFoundError) else "invalid JSON" if isinstance(exc, ValueError) else "unreadable"
        if last is None:
            log.error("cannot read %s (%s): %s", path, reason, exc)      # full path and OS detail stay in the log
            raise DataUnavailable(f"{path.name} is {reason}") from exc  # the message carries a file name and reason only
        _warn_once(f"stale-{path}-{exc}", "%s is unreadable now (%s): serving the last good copy", path.name, exc)
    return copy.deepcopy(last[1])


def _load(name: str) -> dict:
    return read_json(data_dir() / name)


def default_weights() -> dict:
    """weights.json in the data folder (written by ML) wins over the config default."""
    f = data_dir() / "weights.json"
    if f.exists():
        try:
            w = read_json(f)
            if set(w) == set(DEFAULT_WEIGHTS) and all(v >= 0 for v in w.values()) and sum(w.values()) > 0:
                return scoring.normalise_weights(w)
            _warn_once("bad-weights", "weights.json ignored: needs keys %s with non-negative values", sorted(DEFAULT_WEIGHTS))
        except (DataUnavailable, TypeError, AttributeError):
            _warn_once("bad-weights", "weights.json ignored: not a valid JSON object of numbers")
    return scoring.normalise_weights(DEFAULT_WEIGHTS)


def weights_source() -> str:
    f = data_dir() / "weights.json"
    return "file" if f.exists() and default_weights() != scoring.normalise_weights(DEFAULT_WEIGHTS) else "config"


def _scores_state(sites: dict) -> tuple:
    """(accepted scores or None, error text or None). Never raises: a bad ML file must not break the API."""
    f = data_dir() / "scores.geojson"
    if not f.exists():
        return None, None
    try:
        scores = read_json(f)
        errors, _ = validate_scores.validate(scores, sites)
    except Exception as exc:  # deliberately broad: ANY malformed file must degrade to placeholders, never a 500
        detail = f"scores.geojson ignored: could not be read or checked ({type(exc).__name__}: {exc})"
        public = "scores.geojson could not be read or checked"
    else:
        if not errors:
            return scores, None
        detail = f"scores.geojson ignored: {len(errors)} problem(s), first: {errors[0]}"
        public = f"scores.geojson was rejected ({len(errors)} problem(s))"
    _warn_once(f"scores-{detail}", "%s (serving placeholder scores)", detail)   # full reason: log only
    public += "; placeholder scores are being served. Run python -m backend.validate_scores for details."
    return None, detail if details_enabled() else public


def load_sites() -> dict:
    """Sites with ML fields, merged ML scores (if valid), placeholders for the rest, and ranks.
    The returned dict also carries `_scores`: {scores_data_version, scores_stale, scores_error}."""
    data = _load("sites.geojson")
    feats = data["features"]
    for f in feats:
        for k in scoring.ML_FIELDS:
            f["properties"].setdefault(k, None)
        f["properties"].setdefault("score_source", "mock" if data_mode() == "mock" else None)
    scores, error = _scores_state(data)
    status = {"scores_data_version": None, "scores_stale": None, "scores_error": error}
    if scores is not None:
        sv, cv = scores.get("data_version"), data.get("data_version")
        status.update(scores_data_version=sv, scores_stale=None if sv is None or cv is None else sv != cv)
        scoring.merge_ml_scores(feats, scores)
    scoring.fill_placeholders(feats, default_weights())
    if any(f["properties"]["rank"] is None for f in feats):
        scoring.assign_ranks(feats)
    data["_scores"] = status
    return data


def scores_status(data: dict = None) -> dict:
    return (data or load_sites())["_scores"]


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
        try:
            return read_json(info).get("generated_at")
        except DataUnavailable:
            pass
    return datetime.fromtimestamp((data_dir() / "sites.geojson").stat().st_mtime, tz=timezone.utc).isoformat(
        timespec="seconds")


def sources_built() -> Optional[dict]:
    info = data_dir() / "build_info.json"
    if data_mode() != "cache" or not info.exists():
        return None
    try:
        return read_json(info).get("sources_built")
    except DataUnavailable:
        return None


def load_corridor() -> dict:
    return _load("corridor.geojson")


def load_summary() -> dict:
    return _load("summary.json")


def _optional(path: Path):
    if not path.exists():
        return None
    try:
        return read_json(path)
    except DataUnavailable:
        return None


OSM_LAYERS = ("buildings", "roads", "paths", "parks", "open_land")  # whitelist for the offline basemap


def load_osm_layer(name: str) -> Optional[dict]:
    """A cached OpenStreetMap layer for the offline basemap; None if the name is not whitelisted or absent."""
    if name not in OSM_LAYERS:
        return None
    return _optional(data_dir() / "osm" / f"{name}.geojson")


def load_spine() -> Optional[dict]:
    return _optional(data_dir() / "corridor_spine.geojson")


def load_paths_shade() -> Optional[dict]:
    """Footpath pieces labelled by relative greenness (thirds), for a map layer. Satellite proxy, not a shade survey."""
    return _optional(data_dir() / "paths_shade.geojson")


def load_conflicts() -> Optional[dict]:
    if data_mode() != "cache":
        return None
    report = _optional(CACHE_DIR / "conflicts.json")
    if not isinstance(report, dict) or not isinstance(report.get("sites"), dict):
        return None
    current, version = _load("sites.geojson").get("data_version"), report.get("data_version")
    sources = inputs_stale(CACHE_DIR / "osm", report.get("input_hashes", {}))
    if sources is True or (current and version and version != current):
        report["stale"] = True
    elif not current or not version:
        report["stale"] = None
    else:
        report["stale"] = sources
    return report


def load_open_data() -> Optional[dict]:
    # Independent of data_dir(): no normal sites, summary, corridor or scores required.
    report = _optional(CACHE_DIR / "open_data_sites.geojson")
    if not isinstance(report, dict) or report.get("source_mode") != "osm-only" or not isinstance(report.get("features"), list):
        return None
    report["stale"] = inputs_stale(CACHE_DIR / "osm", report.get("input_hashes", {}))
    return report


def load_crosscheck() -> Optional[dict]:
    """The independent canopy cross-check, trimmed to the threshold in use: one row per window and reference map."""
    raw = _optional(data_dir() / "crosscheck.json")
    if raw is None:
        return None
    t = str(raw.get("canopy_ndvi_threshold_in_use"))
    rows = []
    for window, refs in raw.get("results", {}).items():
        for ref, by_threshold in refs.items():
            m = by_threshold.get(t)
            if m:
                rows.append({"window": window, "reference": ref, "reference_tree_pct": m["reference_tree_pct"],
                             "ours_canopy_pct": m["ours_canopy_pct"], "precision": m["precision"],
                             "recall": m["recall"], "f1": m["f1"]})
    return {"ndvi_threshold": raw.get("canopy_ndvi_threshold_in_use"), "rows": rows,
            "mean_f1_by_threshold": raw.get("threshold_comparison", {}).get("mean_f1_by_threshold"),
            "caveat": raw.get("caveat")}


def load_series() -> Optional[dict]:
    return _optional(data_dir() / "series.json")


def load_overlays() -> Optional[dict]:
    return _optional(data_dir() / "overlays" / "overlays.json")


def overlay_file(name: str) -> Optional[Path]:
    """Path of a rendered overlay PNG, only for names listed in overlays.json (blocks path tricks)."""
    index = load_overlays()
    if index and name in {o["name"] for o in index["overlays"]}:
        return data_dir() / "overlays" / f"{name}.png"
    return None


# ---- ML reports (ml/reports/): extra evidence beside the scores, never needed to rank ----
# They describe the cached real data, so mock mode has none. Each carries `stale`: true when it was computed on a
# different data_version than the sites being served (re-run the ML scripts).

def ml_reports_dir() -> Path:
    return ML_REPORTS_DIR


def _ml_report(name: str) -> Optional[dict]:
    if data_mode() == "mock":
        return None
    report = _optional(ml_reports_dir() / name)
    if report is None:
        return None
    current = _load("sites.geojson").get("data_version")
    rv = report.get("data_version")
    report["stale"] = None if rv is None or current is None else rv != current
    return report


_UNCERTAINTY_FIELDS = {"baseline_rank": int, "rank_median": int, "rank_p05": int, "rank_p95": int,
                       "score_median": float, "score_p05": float, "score_p95": float, "topk_frequency": float}
_csv_cache: dict = {}   # path -> (mtime_ns, rows)


def _uncertainty_rows(path: Path) -> Optional[dict]:
    """site_id -> range numbers from uncertainty_sites.csv; None if missing or malformed (logged once)."""
    try:
        mtime = path.stat().st_mtime_ns
    except OSError:
        return None
    last = _csv_cache.get(path)
    if last is None or last[0] != mtime:
        try:
            with path.open(newline="", encoding="utf-8") as fh:
                rows = {r["site_id"]: {k: cast(r[k]) for k, cast in _UNCERTAINTY_FIELDS.items()} for r in csv.DictReader(fh)}
        except (OSError, KeyError, ValueError, TypeError) as exc:
            _warn_once(f"uncertainty-{exc}", "%s ignored: %s", path.name, exc)
            return None
        last = _csv_cache[path] = (mtime, rows)
    return copy.deepcopy(last[1])


def load_uncertainty() -> Optional[dict]:
    """How much each site's rank moves across ML's Monte Carlo over weights and judgement constants."""
    report = _ml_report("uncertainty.json")
    if report is None:
        return None
    sites = _uncertainty_rows(ml_reports_dir() / "uncertainty_sites.csv")
    if sites is None:
        return None
    return {"data_version": report.get("data_version"), "stale": report["stale"], "draws": report.get("draws"),
            "k": report.get("k"), "robust_threshold": report.get("robust_top_k", {}).get("threshold"),
            "robust_count": report.get("robust_top_k", {}).get("count_within_baseline_top_k"),
            "boundary_range": report.get("boundary_sites", {}).get("range"),
            "spearman": report.get("rank_agreement", {}).get("spearman_baseline_vs_median"),
            "sampled": report.get("sampled"), "sites": sites}


def load_shortlist() -> Optional[dict]:
    """ML's spread-out top N (capped per 250 m block), for "where to start" rather than the strict ranking."""
    return _ml_report("shortlist.json")


def load_scenario() -> Optional[dict]:
    """ML's planting-impact scenario: labelled assumptions, not a forecast."""
    return _ml_report("scenario.json")


def load_impact() -> Optional[dict]:
    """What the top N sites reach (unshaded footpath, mapped homes, corridor gaps), de-duplicated. Reach, not outcome."""
    return _ml_report("impact_reach.json")


def load_reach_sets() -> Optional[dict]:
    """For every site, which footpath samples, homes and corridor-gap samples it reaches, so a browser can take the union for any shortlist."""
    return _ml_report("reach_sets.json")


def load_tradeoff() -> Optional[dict]:
    """The first 20 and 50 sites chosen five ways, with what each reaches. A trade-off, not a league table."""
    return _ml_report("tradeoff.json")
