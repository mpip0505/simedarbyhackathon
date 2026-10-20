"""Check an ML scores file before it goes into the API.

Run:  python -m backend.validate_scores backend/data/cache/scores.geojson [--strict]
Exit code 1 on errors (or on warnings with --strict). Used by backend.ml_io.write_scores too.
"""
import argparse
import json
import math
import sys
from pathlib import Path

from backend.config import CACHE_DIR

SCORE_FIELDS = ("score_cooling", "score_connectivity", "score_shade", "score_total")
TOTAL_TOLERANCE = 0.6      # allowed gap between score_total and the weighted components (rounding)


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate(scores: dict, sites: dict, weights: dict = None) -> tuple:
    """Returns (errors, warnings), each a list of readable strings. Never raises on bad content."""
    errors, warnings = [], []
    if scores.get("type") != "FeatureCollection" or not isinstance(scores.get("features"), list):
        return ["scores file must be a GeoJSON FeatureCollection"], []

    site_ids = {f["properties"]["site_id"] for f in sites["features"]}
    seen, rows = set(), []
    for k, f in enumerate(scores["features"]):
        p = f.get("properties") or {}
        sid = p.get("site_id")
        if sid is None:
            errors.append(f"feature {k}: missing site_id")
            continue
        if sid in seen:
            errors.append(f"{sid}: appears more than once")
        seen.add(sid)
        if sid not in site_ids:
            errors.append(f"{sid}: not a current site (IDs come from sites.geojson)")
        for field in SCORE_FIELDS:
            v = p.get(field)
            if not _is_number(v):
                errors.append(f"{sid}: {field} must be a finite number, got {v!r}")
            elif not 0 <= v <= 100:
                errors.append(f"{sid}: {field}={v} is outside 0-100")
        r = p.get("rank")
        if isinstance(r, bool) or not isinstance(r, int) or r < 1:
            errors.append(f"{sid}: rank must be an integer >= 1, got {r!r}")
        rows.append((sid, p))

    missing = site_ids - seen
    if missing:
        warnings.append(f"{len(missing)} of {len(site_ids)} sites have no ML score and will keep placeholder scores")

    ranked = [p for _, p in rows if isinstance(p.get("rank"), int) and _is_number(p.get("score_total"))]
    ranks = [p["rank"] for p in ranked]
    if len(ranks) != len(set(ranks)):
        errors.append("ranks are not unique")
    ranked.sort(key=lambda p: p["rank"])
    for a, b in zip(ranked, ranked[1:]):
        if b["score_total"] > a["score_total"]:
            errors.append(f"rank order disagrees with score_total ({a['site_id']} rank {a['rank']} scores "
                          f"{a['score_total']} but {b['site_id']} rank {b['rank']} scores {b['score_total']})")
            break

    if weights:
        total_w = sum(weights.values())
        for sid, p in rows:
            if not all(_is_number(p.get(f"score_{k}")) for k in weights) or not _is_number(p.get("score_total")):
                continue
            expected = sum(p[f"score_{k}"] * w / total_w for k, w in weights.items())
            if abs(expected - p["score_total"]) > TOTAL_TOLERANCE:
                warnings.append(f"{sid}: score_total {p['score_total']} does not match the weighted components "
                                f"({expected:.1f}) under weights.json")
                break

    sv, cv = scores.get("data_version"), sites.get("data_version")
    if sv is None:
        warnings.append(f"scores file has no data_version, so staleness cannot be checked (current is {cv})")
    elif cv is not None and sv != cv:
        warnings.append(f"scores were computed on data_version {sv} but the sites are now {cv}: re-run scoring")
    return errors, warnings


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("scores", type=Path)
    ap.add_argument("--sites", type=Path, default=CACHE_DIR / "sites.geojson")
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    a = ap.parse_args()
    weights_file = a.sites.parent / "weights.json"
    weights = json.loads(weights_file.read_text()) if weights_file.exists() else None
    errors, warnings = validate(json.loads(a.scores.read_text(encoding="utf-8")),
                                json.loads(a.sites.read_text(encoding="utf-8")), weights)
    for w in warnings:
        print("WARNING:", w)
    for e in errors:
        print("ERROR:  ", e)
    bad = bool(errors) or (a.strict and bool(warnings))
    print("FAILED" if bad else "OK", f"({len(errors)} errors, {len(warnings)} warnings)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
