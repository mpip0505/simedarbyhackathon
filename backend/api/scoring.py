"""Merge ML scores, fill a clearly labelled placeholder when they are missing, re-total with weights.

The placeholder is NOT the ML model. It is a simple stand-in so the map is usable before ML delivers:
each component is a 0-100 transform of one backend-measured field, and weights are DEFAULT_WEIGHTS.
"""
from backend.config import DEFAULT_WEIGHTS

ML_FIELDS = ("score_cooling", "score_connectivity", "score_shade", "score_total", "rank")
PLACEHOLDER_RANGE_M = 200  # distance at which proximity scores reach 0


def _minmax(values: list) -> list:
    lo, hi = min(values), max(values)
    return [50.0 if hi == lo else (v - lo) / (hi - lo) for v in values]


def normalise_weights(weights: dict) -> dict:
    total = sum(weights.values())
    if total <= 0:
        raise ValueError("weights must sum to more than 0")
    return {k: v / total for k, v in weights.items()}


def total_score(cooling: float, connectivity: float, shade: float, weights: dict) -> float:
    w = normalise_weights(weights)
    return round(cooling * w["cooling"] + connectivity * w["connectivity"] + shade * w["shade"], 1)


def fill_placeholders(features: list, weights: dict = None) -> None:
    """In place: features whose score_total is None get placeholder scores and score_source='placeholder'."""
    todo = [f for f in features if f["properties"].get("score_total") is None]
    if not todo:
        return
    lst = _minmax([f["properties"]["lst_c_mean"] for f in todo])
    ndvi = _minmax([f["properties"]["ndvi_mean"] for f in todo])
    for f, hot, green in zip(todo, lst, ndvi):
        p = f["properties"]
        p["score_cooling"] = round(100 * (0.5 * hot + 0.5 * (1 - green)), 1)
        p["score_connectivity"] = round(100 * (1 - min(p["corridor_gap_dist_m"], PLACEHOLDER_RANGE_M) / PLACEHOLDER_RANGE_M), 1)
        p["score_shade"] = round(100 * (1 - min(p["dist_to_path_m"], PLACEHOLDER_RANGE_M) / PLACEHOLDER_RANGE_M), 1)
        p["score_total"] = total_score(p["score_cooling"], p["score_connectivity"], p["score_shade"], weights or DEFAULT_WEIGHTS)
        p["rank"] = None
        p["score_source"] = "placeholder"


def merge_ml_scores(features: list, scores: dict) -> None:
    """In place: scores is a GeoJSON FeatureCollection whose properties carry site_id + ML fields."""
    by_id = {f["properties"]["site_id"]: f["properties"] for f in scores["features"]}
    for f in features:
        s = by_id.get(f["properties"]["site_id"])
        if s and s.get("score_total") is not None:
            f["properties"].update({k: s.get(k) for k in ML_FIELDS})
            f["properties"]["score_source"] = "ml"


def assign_ranks(features: list) -> None:
    """Rank 1 = highest score_total; ties broken by site_id so output is stable."""
    order = sorted(features, key=lambda f: (-f["properties"]["score_total"], f["properties"]["site_id"]))
    for i, f in enumerate(order, start=1):
        f["properties"]["rank"] = i


def retotal(features: list, weights: dict) -> None:
    """In place: recompute score_total from the three components with new weights, then re-rank."""
    for f in features:
        p = f["properties"]
        p["score_total"] = total_score(p["score_cooling"], p["score_connectivity"], p["score_shade"], weights)
    assign_ranks(features)
