"""The scoring model: three 0-100 scores per candidate site, and their weighted total.

Deliberately transparent. Every score is a weighted average of a handful of named transforms of
backend-measured features, so any number on the map traces back to its inputs in one step. There
are no fitted parameters, because there are no ground-truth labels to fit them to (see
docs/data-dictionary.md). The constants below are stated judgements, and ml/validation.py measures
how much the ranking moves when they change.

Two transforms are used, and which one applies is a rule, not a case-by-case choice:

* percentile rank (pct_rank) for features that only mean something relative to the other sites:
  surface temperature, greenness, built-up share. "Hotter than 90% of candidate sites" is a claim
  the data supports; "41.5 C" is not (Landsat thermal is about 100 m native, see the caveats).
* distance decay (decay) for features whose absolute value has physical meaning: metres to a
  corridor gap, to a park, to a footpath. A site 2 km from the corridor cannot help close it, so it
  must score near zero, not at its percentile among other far-away sites.

Redundant inputs are not stacked. On the current build (data_version 482cd831d34a),
corridor_gap_dist_m and dist_to_corridor_spine_m are rank-identical (Spearman 1.00), and so are
uncovered_path_length_50m and path_length_within_50m. One of each pair is used; adding the twin
would double its weight while looking like independent evidence.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# ---------------------------------------------------------------- component weights (within a score)
# Cooling: the hot, low-vegetation surroundings from the brief, measured over the 250 m disc around
# the cell rather than the cell itself - planting cools the neighbourhood, and a 30 m cell is
# smaller than a single Landsat thermal pixel.
COOLING_WEIGHTS = {"hot": 0.45, "bare": 0.30, "built": 0.25}
# Connectivity: closing gaps along the (approximate) Urban Biodiversity Corridor.
CONNECTIVITY_WEIGHTS = {"gap": 0.50, "park": 0.30, "inside": 0.20}
# Shade: unshaded walking route near the cell, then closeness to any path as a tie-breaker.
SHADE_WEIGHTS = {"unshaded": 0.70, "near": 0.30}

# ---------------------------------------------------------------- distance and length scales (metres)
# Decay scale for corridor gaps. Judgement: planting a few hundred metres from a gap can plausibly
# extend cover towards it; a kilometre away cannot. 400 m puts the median site (gap 756 m) at about
# 15/100, which honestly reflects that most candidate land is nowhere near the corridor.
GAP_SCALE_M = 400.0
PARK_SCALE_M = 400.0      # same reasoning for "stepping stone beside existing habitat"
PATH_SCALE_M = 150.0      # a cell more than 150 m from a path shades nobody walking
UNSHADED_CAP_M = 150.0    # unshaded path length that already earns full marks (75% of sites have <= 50 m)

SCORE_COLUMNS = ("score_cooling", "score_connectivity", "score_shade", "score_total")
COMPONENT_COLUMNS = ("hot", "bare", "built", "gap", "park", "inside", "unshaded", "near")

# Features the model actually reads. Anything else in the table is diagnostic only.
MODEL_FEATURES = (
    "lst_mean_250m", "ndvi_mean_250m", "built_up_frac_250m", "lst_valid_frac",
    "corridor_gap_dist_m", "dist_to_nearest_park_m", "in_corridor",
    "uncovered_path_length_50m", "dist_to_path_m",
)


def pct_rank(s: pd.Series, reference: pd.Series | None = None) -> pd.Series:
    """0-100 percentile rank. With a reference, rank against that distribution instead of s itself
    (used by the block-held-out check in ml/validation.py)."""
    if reference is None:
        return s.rank(pct=True, method="average") * 100.0
    ref = np.sort(reference.to_numpy(dtype=float))
    v = s.to_numpy(dtype=float)
    lo = np.searchsorted(ref, v, side="left")
    hi = np.searchsorted(ref, v, side="right")
    return pd.Series(100.0 * (lo + hi) / (2 * len(ref)), index=s.index)


def decay(metres: pd.Series, scale_m: float) -> pd.Series:
    """100 right next to the thing, falling smoothly to 0 with distance (1/e per scale_m)."""
    return 100.0 * np.exp(-metres.clip(lower=0) / scale_m)


def components(df: pd.DataFrame, reference: pd.DataFrame | None = None,
               gap_scale_m: float = GAP_SCALE_M, park_scale_m: float = PARK_SCALE_M,
               path_scale_m: float = PATH_SCALE_M, unshaded_cap_m: float = UNSHADED_CAP_M,
               shrink_gapfilled: bool = True) -> pd.DataFrame:
    """The eight named inputs, each on a 0-100 "more of this means plant here" scale.

    reference supplies the distribution for the percentile ranks (default: df itself).
    """
    ref = df if reference is None else reference
    out = pd.DataFrame(index=df.index)

    # --- cooling inputs
    hot = pct_rank(df["lst_mean_250m"], ref["lst_mean_250m"])
    if shrink_gapfilled:
        # About 18% of the area has no reliable Landsat pixel and was filled from neighbours within
        # 100 m. Pull the temperature term back towards the middle in proportion to how much of the
        # cell is real, so a gap-filled guess cannot by itself push a site to the top.
        hot = 50.0 + df["lst_valid_frac"].clip(0, 1) * (hot - 50.0)
    out["hot"] = hot
    out["bare"] = 100.0 - pct_rank(df["ndvi_mean_250m"], ref["ndvi_mean_250m"])
    out["built"] = pct_rank(df["built_up_frac_250m"], ref["built_up_frac_250m"])

    # --- connectivity inputs
    out["gap"] = decay(df["corridor_gap_dist_m"], gap_scale_m)
    out["park"] = decay(df["dist_to_nearest_park_m"], park_scale_m)
    out["inside"] = 100.0 * df["in_corridor"].astype(bool).astype(float)

    # --- shade inputs
    out["unshaded"] = 100.0 * (df["uncovered_path_length_50m"] / unshaded_cap_m).clip(upper=1.0)
    out["near"] = decay(df["dist_to_path_m"], path_scale_m)
    return out


def _blend(comp: pd.DataFrame, weights: dict) -> pd.Series:
    """Weighted average of named components. Weights are renormalised, so dropping one is safe."""
    used = {k: w for k, w in weights.items() if k in comp.columns and w > 0}
    total = sum(used.values())
    if total <= 0:
        return pd.Series(50.0, index=comp.index)      # nothing left to judge on: say "middle"
    return sum(comp[k] * (w / total) for k, w in used.items())


def score_sites(df: pd.DataFrame, weights: dict, *, reference: pd.DataFrame | None = None,
                cooling_weights: dict = COOLING_WEIGHTS,
                connectivity_weights: dict = CONNECTIVITY_WEIGHTS,
                shade_weights: dict = SHADE_WEIGHTS, **component_kwargs) -> pd.DataFrame:
    """site_id, the four scores and a unique rank. weights is the cooling/connectivity/shade mix.

    score_total is computed from the *rounded* components with normalised weights, which is exactly
    what backend.validate_scores re-checks and what the API weight sliders recompute.
    """
    comp = components(df, reference=reference, **component_kwargs)
    out = pd.DataFrame({"site_id": df["site_id"]}, index=df.index)
    out["score_cooling"] = _blend(comp, cooling_weights).round(1)
    out["score_connectivity"] = _blend(comp, connectivity_weights).round(1)
    out["score_shade"] = _blend(comp, shade_weights).round(1)

    total_w = sum(weights.values())
    if total_w <= 0:
        raise ValueError("weights must sum to more than 0")
    out["score_total"] = sum(out["score_" + k] * (w / total_w) for k, w in weights.items()).round(1)

    out = add_ranks(out)
    for c in SCORE_COLUMNS:                                  # the contract is 0-100, no blanks
        assert out[c].between(0, 100).all() and out[c].notna().all(), c + " left 0-100"
    return out


def add_ranks(scores: pd.DataFrame) -> pd.DataFrame:
    """rank 1 = plant first. Ties are broken by site_id, the same rule the API uses, so a live
    re-rank through ?w_cooling= reproduces our order instead of shuffling equal scores."""
    out = scores.sort_values(["score_total", "site_id"], ascending=[False, True]).copy()
    out["rank"] = np.arange(1, len(out) + 1)
    return out.sort_index()


def with_components(df: pd.DataFrame, weights: dict, **kwargs) -> pd.DataFrame:
    """Scores joined onto the features and the eight raw components, for inspection and the
    validation report. Never written to the API."""
    comp_kwargs = {k: v for k, v in kwargs.items() if k.endswith("_m") or k == "shrink_gapfilled"}
    comp = components(df, **comp_kwargs)
    scores = score_sites(df, weights, **kwargs).drop(columns=["site_id"])
    return pd.concat([df, comp.add_prefix("c_"), scores], axis=1)
