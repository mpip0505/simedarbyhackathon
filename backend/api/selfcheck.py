"""Deep health check: do the data files exist, parse, and match the contract?

Run at API startup (logged) and on GET /health/deep. Never raises; problems are returned as text.
Run by hand:  python -m backend.api.selfcheck
"""
import json
import sys
from datetime import datetime, timezone

from backend.api import store
from backend.schema import SiteProperties, Summary

MAX_REPORTED = 3  # list at most this many schema errors, then a count


def check() -> dict:
    """Returns {ok, data_mode, site_count, problems[], warnings[], checked_at}. `ok` is False if there are problems."""
    problems, warnings = [], []
    d = store.data_dir()
    mode = store.data_mode()
    site_count = 0

    if mode == "mock":
        missing = [f for f in store.REQUIRED_FILES if not (store.CACHE_DIR / f).exists()]
        warnings.append("serving MOCK data" + (f" (cache folder is missing: {', '.join(missing)})"
                                               if (store.CACHE_DIR / "sites.geojson").exists() else
                                               " (no cached sites.geojson yet: run python -m backend.build_cache)"))

    loaded = {}
    for name in store.REQUIRED_FILES:
        try:
            loaded[name] = store.read_json(d / name)
        except store.DataUnavailable as exc:
            problems.append(str(exc))

    if "sites.geojson" in loaded:
        feats = loaded["sites.geojson"].get("features") or []
        site_count = len(feats)
        if not feats:
            problems.append("sites.geojson has no features")
        bad, ids = [], set()
        for f in feats:
            props = f.get("properties") or {}
            sid = props.get("site_id")
            if sid in ids:
                bad.append(f"duplicate site_id {sid}")
            ids.add(sid)
            try:
                SiteProperties(**props)
            except Exception as exc:
                bad.append(f"{sid}: {str(exc).splitlines()[0]}")
        if bad:
            problems.append(f"{len(bad)} site(s) break the data contract, e.g. " + "; ".join(bad[:MAX_REPORTED]))
        if "data_version" not in loaded["sites.geojson"] and mode == "cache":
            warnings.append("sites.geojson has no data_version (rebuild with python -m backend.sites.generate)")
    if "corridor.geojson" in loaded and not (loaded["corridor.geojson"].get("features")):
        problems.append("corridor.geojson has no features")
    if "summary.json" in loaded:
        try:
            Summary(**loaded["summary.json"])
        except Exception as exc:
            problems.append(f"summary.json breaks the data contract: {str(exc).splitlines()[0]}")

    if not problems:
        try:
            status = store.scores_status()
            if status["scores_error"]:
                warnings.append(status["scores_error"])
            elif status["scores_stale"]:
                warnings.append("ML scores were computed on older data (scores_stale): re-run scoring")
        except Exception as exc:
            problems.append(f"could not load sites with scores: {exc}")

    for name, loader in (("series.json", store.load_series), ("overlays/overlays.json", store.load_overlays)):
        if mode == "cache" and loader() is None:
            warnings.append(f"{name} is missing: the before/after view will have no data (python -m backend.build_cache)")
    index = store.load_overlays() if mode == "cache" else None
    for o in (index or {}).get("overlays", []):
        if store.overlay_file(o["name"]) is None or not store.overlay_file(o["name"]).exists():
            warnings.append(f"overlay image missing: {o['name']}.png")

    return {"ok": not problems, "data_mode": mode, "site_count": site_count, "problems": problems,
            "warnings": warnings, "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def public_view(result: dict, details: bool = None) -> dict:
    """What an HTTP client may see: pass/fail and counts. The problem and warning text (file names, validation
    messages) is included only when API_EXPOSE_DETAILS is set; it is always in the server log and the CLI output."""
    details = store.details_enabled() if details is None else details
    out = {k: result[k] for k in ("ok", "data_mode", "site_count", "checked_at")}
    out["problem_count"], out["warning_count"] = len(result["problems"]), len(result["warnings"])
    if details:
        out["problems"], out["warnings"] = result["problems"], result["warnings"]
    elif result["problems"] or result["warnings"]:
        out["detail"] = "Details are in the server log and in: python -m backend.api.selfcheck"
    return out


if __name__ == "__main__":
    result = check()
    print(json.dumps(result, indent=1))
    sys.exit(0 if result["ok"] else 1)
