"""Tests for the ML scoring model.   python -m pytest ml/tests -q

These check the contract the API relies on and the sign of every term. They cannot check that the
ranking is right: there are no labels.
"""
import json

import numpy as np
import pandas as pd
import pytest

from backend.config import CACHE_DIR
from backend.ml_io import load_sites_df, scores_to_feature_collection, write_scores
from backend.validate_scores import validate

from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import (COMPONENT_COLUMNS, SCORE_COLUMNS, add_ranks, components, decay,
                              pct_rank, score_sites)


@pytest.fixture(scope="module")
def df():
    return load_sites_df()


@pytest.fixture(scope="module")
def scores(df):
    return score_sites(df, DEFAULT_WEIGHTS)


def _row(**overrides):
    """One synthetic site with mid-range values, for one-feature-at-a-time checks."""
    base = {"site_id": "T-1", "lst_mean_250m": 41.0, "ndvi_mean_250m": 0.34, "built_up_frac_250m": 0.05,
            "lst_valid_frac": 1.0, "corridor_gap_dist_m": 500.0, "dist_to_nearest_park_m": 500.0,
            "in_corridor": False, "uncovered_path_length_50m": 50.0, "dist_to_path_m": 100.0}
    base.update(overrides)
    return base


def _pair(field, low, high):
    """Two sites differing only in `field`; returns their components."""
    pair = pd.DataFrame([_row(site_id="LOW", **{field: low}), _row(site_id="HIGH", **{field: high})])
    return components(pair).set_index(pair["site_id"])


# --------------------------------------------------------------------------- output contract
def test_shape_and_columns(df, scores):
    assert len(scores) == len(df)
    assert list(scores.columns) == ["site_id", *SCORE_COLUMNS, "rank"]
    assert scores["site_id"].is_unique


def test_scores_are_0_to_100_with_no_blanks(scores):
    for c in SCORE_COLUMNS:
        assert scores[c].notna().all()
        assert scores[c].between(0, 100).all()


def test_ranks_are_unique_consecutive_and_agree_with_total(scores):
    assert sorted(scores["rank"]) == list(range(1, len(scores) + 1))
    ordered = scores.sort_values("rank")["score_total"].to_numpy()
    assert (np.diff(ordered) <= 0).all(), "rank order must not contradict score_total"


def test_total_matches_the_weighted_components(scores):
    w = DEFAULT_WEIGHTS
    expected = sum(scores["score_" + k] * v / sum(w.values()) for k, v in w.items())
    # backend.validate_scores allows 0.6; rounding the components first costs at most half that.
    assert (expected - scores["score_total"]).abs().max() <= 0.3


def test_backend_validator_accepts_the_output(df, scores, tmp_path):
    sites = json.loads((CACHE_DIR / "sites.geojson").read_text(encoding="utf-8"))
    fc = scores_to_feature_collection(scores, sites["data_version"])
    errors, warnings = validate(fc, sites, DEFAULT_WEIGHTS)
    assert errors == [] and warnings == []


def test_write_scores_round_trip_leaves_the_cache_alone(scores, tmp_path):
    out = write_scores(scores, path=tmp_path / "scores.geojson")
    fc = json.loads(out.read_text(encoding="utf-8"))
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == len(scores)
    assert fc["data_version"] and fc["features"][0]["properties"]["site_id"].startswith("ELM-")


# --------------------------------------------------------------------------- transforms
def test_pct_rank_spans_the_range_and_is_monotone():
    r = pct_rank(pd.Series([1.0, 2.0, 3.0, 4.0]))
    assert r.is_monotonic_increasing and 0 < r.min() and r.max() <= 100


def test_pct_rank_against_a_reference_distribution():
    ref = pd.Series(np.arange(100, dtype=float))
    assert pct_rank(pd.Series([-5.0]), ref).iloc[0] == 0.0          # below everything seen
    assert pct_rank(pd.Series([500.0]), ref).iloc[0] == 100.0       # above everything seen
    assert 45 <= pct_rank(pd.Series([50.0]), ref).iloc[0] <= 55


def test_decay_is_100_at_zero_and_falls_to_1_over_e():
    d = decay(pd.Series([0.0, 400.0, 1e6]), 400.0)
    assert d.iloc[0] == 100.0
    assert d.iloc[1] == pytest.approx(100 / np.e, abs=0.01)
    assert d.iloc[2] == pytest.approx(0.0, abs=1e-6)


def test_every_component_is_within_0_to_100(df):
    comp = components(df)
    assert list(comp.columns) == list(COMPONENT_COLUMNS)
    assert comp.notna().all().all()
    assert comp.min().min() >= 0 and comp.max().max() <= 100


# --------------------------------------------------------------------------- signs
@pytest.mark.parametrize("field,low,high,component,expect_higher", [
    ("lst_mean_250m", 38.0, 46.0, "hot", "HIGH"),              # hotter surroundings -> plant here
    ("ndvi_mean_250m", 0.15, 0.50, "bare", "LOW"),             # greener already -> less need
    ("built_up_frac_250m", 0.0, 0.30, "built", "HIGH"),        # more people to shade
    ("corridor_gap_dist_m", 20.0, 2000.0, "gap", "LOW"),       # nearer a corridor gap
    ("dist_to_nearest_park_m", 20.0, 2000.0, "park", "LOW"),   # nearer existing habitat
    ("uncovered_path_length_50m", 0.0, 300.0, "unshaded", "HIGH"),   # more unshaded walking route
    ("dist_to_path_m", 10.0, 600.0, "near", "LOW"),            # nearer a footpath
])
def test_component_points_the_right_way(field, low, high, component, expect_higher):
    comp = _pair(field, low, high)
    winner = "HIGH" if comp.loc["HIGH", component] > comp.loc["LOW", component] else "LOW"
    assert winner == expect_higher


def test_in_corridor_raises_connectivity():
    pair = pd.DataFrame([_row(site_id="OUT", in_corridor=False), _row(site_id="IN", in_corridor=True)])
    s = score_sites(pair, DEFAULT_WEIGHTS).set_index("site_id")
    assert s.loc["IN", "score_connectivity"] > s.loc["OUT", "score_connectivity"]


def test_gapfilled_temperature_is_pulled_towards_the_middle():
    # Needs cooler company, so that "hot" is genuinely above the middle and has somewhere to fall to.
    pair = pd.DataFrame([_row(site_id="COOL-1", lst_mean_250m=37.0), _row(site_id="COOL-2", lst_mean_250m=38.0),
                         _row(site_id="REAL", lst_mean_250m=50.0, lst_valid_frac=1.0),
                         _row(site_id="FILLED", lst_mean_250m=50.0, lst_valid_frac=0.1)])
    comp = components(pair).set_index(pair["site_id"])
    assert comp.loc["REAL", "hot"] > comp.loc["FILLED", "hot"] > 50.0
    off = components(pair, shrink_gapfilled=False).set_index(pair["site_id"])
    assert off.loc["REAL", "hot"] == off.loc["FILLED", "hot"]      # shrinkage is the only difference


# --------------------------------------------------------------------------- robustness
def test_dropping_a_component_renormalises_instead_of_sinking_the_score(df):
    full = score_sites(df, DEFAULT_WEIGHTS)
    without_hot = score_sites(df, DEFAULT_WEIGHTS, cooling_weights={"bare": 0.30, "built": 0.25})
    assert without_hot["score_cooling"].between(0, 100).all()
    assert abs(without_hot["score_cooling"].mean() - full["score_cooling"].mean()) < 15


def test_zero_weights_are_refused(df):
    with pytest.raises(ValueError):
        score_sites(df, {"cooling": 0, "connectivity": 0, "shade": 0})


def test_scoring_is_deterministic(df):
    a, b = score_sites(df, DEFAULT_WEIGHTS), score_sites(df, DEFAULT_WEIGHTS)
    pd.testing.assert_frame_equal(a, b)


def test_ties_are_broken_by_site_id_like_the_api_does():
    tied = pd.DataFrame({"site_id": ["ELM-b", "ELM-a"], "score_total": [50.0, 50.0]})
    ranked = add_ranks(tied).set_index("site_id")
    assert ranked.loc["ELM-a", "rank"] == 1 and ranked.loc["ELM-b", "rank"] == 2


def test_model_reads_no_diagnostic_only_columns(df):
    """ndvi_change, lst_change_c and the baseline fields are flagged "do not score on these"."""
    banned = ["ndvi_change", "lst_change_c", "ndvi_mean_baseline", "lst_c_mean_baseline"]
    stripped = df.drop(columns=banned)
    pd.testing.assert_frame_equal(score_sites(stripped, DEFAULT_WEIGHTS), score_sites(df, DEFAULT_WEIGHTS))
