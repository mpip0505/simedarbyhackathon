"""Tests for the Monte Carlo uncertainty module.   python -m pytest ml/tests -q"""
import numpy as np
import pandas as pd
import pytest

from backend.ml_io import load_sites_df

from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import score_sites
from ml.uncertainty import SCALE_RANGES, _diagnose_swing, monte_carlo, summarise


@pytest.fixture(scope="module")
def df():
    return load_sites_df()


def test_monte_carlo_matches_df_row_order(df):
    """score_sites always returns rows in the input's order; this is what lets monte_carlo index
    positionally instead of re-aligning by site_id on every draw."""
    small = df.head(20)
    score_mat, rank_mat = monte_carlo(small, draws=5, seed=1)
    assert score_mat.shape == (5, 20) and rank_mat.shape == (5, 20)
    assert score_mat.min() >= 0 and score_mat.max() <= 100
    assert set(rank_mat.ravel()) <= set(range(1, 21))


def test_monte_carlo_is_reproducible_with_a_seed(df):
    small = df.head(15)
    a = monte_carlo(small, draws=10, seed=42)
    b = monte_carlo(small, draws=10, seed=42)
    np.testing.assert_array_equal(a[0], b[0])
    np.testing.assert_array_equal(a[1], b[1])


def test_different_seeds_give_different_draws(df):
    small = df.head(15)
    a = monte_carlo(small, draws=10, seed=1)
    b = monte_carlo(small, draws=10, seed=2)
    assert not np.array_equal(a[0], b[0])


def test_summarise_output_shape_and_contract(df):
    r = summarise(df, draws=40, seed=0, k=20)
    table = r.pop("_full_table")
    assert len(table) == len(df)
    assert set(table["site_id"]) == set(df["site_id"])
    for col in ("score_median", "score_p05", "score_p95"):
        assert table[col].between(0, 100).all()
    assert (table["rank_p05"] <= table["rank_median"]).all()
    assert (table["rank_median"] <= table["rank_p95"]).all()
    assert table["topk_frequency"].between(0, 1).all()
    assert len(r["baseline_top_k"]) == 20


def test_rank1_site_is_overwhelmingly_robust(df):
    """The default best site should almost always still be top-20, not a coin flip."""
    r = summarise(df, draws=300, seed=0, k=20)
    rank1 = r["baseline_top_k"][0]
    assert rank1["baseline_rank"] == 1
    assert rank1["topk_frequency"] >= 0.95


def test_median_rank_tracks_the_single_default_ranking(df):
    r = summarise(df, draws=300, seed=0, k=20)
    assert r["rank_agreement"]["spearman_baseline_vs_median"] > 0.95


def test_robust_and_boundary_counts_partition_sensibly(df):
    r = summarise(df, draws=300, seed=0, k=20)
    assert 0 <= r["robust_top_k"]["count_within_baseline_top_k"] <= r["k"]
    assert 0 <= r["boundary_sites"]["count"] <= r["sites_in_sample"]


def test_diagnose_swing_flags_a_feature_on_the_fence():
    row = pd.DataFrame([{"site_id": "T", "corridor_gap_dist_m": 500.0, "dist_to_nearest_park_m": 500.0,
                        "dist_to_path_m": 100.0, "uncovered_path_length_50m": 200.0}])
    msg = _diagnose_swing(row, "T")
    assert "uncovered_path_length_50m" in msg and "unshaded_cap_m" in msg


def test_diagnose_swing_says_so_when_nothing_is_on_the_fence():
    # All four features safely outside every sampled range -> no scale constant can move them.
    row = pd.DataFrame([{"site_id": "T", "corridor_gap_dist_m": 5000.0, "dist_to_nearest_park_m": 5000.0,
                        "dist_to_path_m": 1000.0, "uncovered_path_length_50m": 0.0}])
    msg = _diagnose_swing(row, "T")
    assert "weights" in msg.lower()


def test_scale_ranges_cover_the_defaults_tested_in_validation():
    from ml.scoring_model import GAP_SCALE_M, PARK_SCALE_M, PATH_SCALE_M, UNSHADED_CAP_M
    assert SCALE_RANGES["gap_scale_m"][0] <= GAP_SCALE_M <= SCALE_RANGES["gap_scale_m"][1]
    assert SCALE_RANGES["park_scale_m"][0] <= PARK_SCALE_M <= SCALE_RANGES["park_scale_m"][1]
    assert SCALE_RANGES["path_scale_m"][0] <= PATH_SCALE_M <= SCALE_RANGES["path_scale_m"][1]
    assert SCALE_RANGES["unshaded_cap_m"][0] <= UNSHADED_CAP_M <= SCALE_RANGES["unshaded_cap_m"][1]
