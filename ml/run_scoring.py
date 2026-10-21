"""Score every candidate site and deliver the two files the API reads.

    python -m ml.run_scoring              # writes weights.json, then scores.geojson
    python -m ml.run_scoring --dry-run    # computes and prints, writes nothing

Order matters: weights.json goes first, because backend.ml_io.write_scores re-checks that
score_total equals the weighted components under whatever weights.json says.

Default weights (cooling 0.45, connectivity 0.30, shade 0.25) are the ML team default the
Frontend sliders start from (GET /weights). Reasoning is in docs/ml-model.md: heat is the
best-measured of the three benefits, and connectivity sits below the placeholder 0.35 because the
corridor is approximate, so that score carries the most uncertainty.

The four distance/length constants inside each score (how far a corridor gap or path still counts,
how much unshaded path already earns full marks) are judgement calls, not weights, so the live
`?w_cooling=` sliders in the API can't reach them - they only re-blend the three scores this script
already wrote. To test a different judgement call, override here and regenerate:

    python -m ml.run_scoring --gap-scale-m 200 --dry-run     # compare against the default 400
    python -m ml.run_scoring --no-shrink-gapfilled --dry-run # turn off the reliability discount

If the team wants these adjustable from the map itself (not just by re-running this script), that
needs a backend change (new query params alongside w_cooling/w_connectivity/w_shade) - ask Backend,
don't add it here.
"""
from __future__ import annotations

import argparse
import json

from backend import atomic
from backend.config import CACHE_DIR
from backend.ml_io import current_data_version, load_sites_df, write_scores

from ml.scoring_model import (GAP_SCALE_M, PARK_SCALE_M, PATH_SCALE_M, UNSHADED_CAP_M, score_sites)

DEFAULT_WEIGHTS = {"cooling": 0.45, "connectivity": 0.30, "shade": 0.25}
WEIGHTS_FILE = CACHE_DIR / "weights.json"


def write_weights(weights: dict = DEFAULT_WEIGHTS, path=WEIGHTS_FILE):
    """weights.json in the cache folder; the API serves it from GET /weights."""
    atomic.write_json(path, weights)
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="compute and print, write nothing")
    ap.add_argument("--strict", action="store_true", help="refuse to write on warnings too")
    ap.add_argument("--gap-scale-m", type=float, default=None,
                    help=f"corridor-gap decay scale, metres (default {GAP_SCALE_M:g})")
    ap.add_argument("--park-scale-m", type=float, default=None,
                    help=f"nearest-park decay scale, metres (default {PARK_SCALE_M:g})")
    ap.add_argument("--path-scale-m", type=float, default=None,
                    help=f"nearest-path decay scale, metres (default {PATH_SCALE_M:g})")
    ap.add_argument("--unshaded-cap-m", type=float, default=None,
                    help=f"unshaded path length that earns full marks, metres (default {UNSHADED_CAP_M:g})")
    ap.add_argument("--no-shrink-gapfilled", action="store_true",
                    help="disable the discount on mostly gap-filled temperature readings")
    a = ap.parse_args()

    overrides = {k: v for k, v in {
        "gap_scale_m": a.gap_scale_m, "park_scale_m": a.park_scale_m,
        "path_scale_m": a.path_scale_m, "unshaded_cap_m": a.unshaded_cap_m,
    }.items() if v is not None}
    if a.no_shrink_gapfilled:
        overrides["shrink_gapfilled"] = False

    df = load_sites_df()
    scores = score_sites(df, DEFAULT_WEIGHTS, **overrides)

    print(f"{len(scores)} sites scored on data_version {current_data_version()}")
    print("weights:", json.dumps(DEFAULT_WEIGHTS))
    if overrides:
        print("judgement-constant overrides (not the project default - compare, don't commit, unless "
              "the team agrees):", json.dumps(overrides))
    print(scores[["score_cooling", "score_connectivity", "score_shade", "score_total"]]
          .describe().round(1).T.to_string())
    print("\ntop 10 (rank 1 = plant first):")
    print(scores.sort_values("rank").head(10).to_string(index=False))

    if a.dry_run:
        print("\n--dry-run: nothing written")
        return

    print("\nwrote", write_weights())
    print("wrote", write_scores(scores, strict=a.strict))
    print("\nNow check:  python -m backend.validate_scores backend/data/cache/scores.geojson")
    print("then:       uvicorn backend.api.main:app --port 8000   and GET /meta  (score_source must be ml)")


if __name__ == "__main__":
    main()
