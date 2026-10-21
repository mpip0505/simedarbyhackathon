"""Tests for ml/method_agreement.py.   python -m pytest ml/tests -q

The stand-in methods are simplified, so these check the arithmetic and the labelling, not that any method is right.
"""
import pandas as pd
import pytest

from backend.ml_io import load_sites_df
from ml.method_agreement import METHODS, OURS, TOP_K, analyse, method_scores, to_markdown, top_sites
from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import score_sites


@pytest.fixture(scope="module")
def df():
    return load_sites_df()


@pytest.fixture(scope="module")
def result(df):
    return analyse(df, steady_ids={df["site_id"].iloc[0]})


def test_every_method_scores_every_site_between_0_and_100(df):
    sc = method_scores(df)
    assert list(sc.columns) == list(METHODS)
    assert len(sc) == len(df)
    assert sc.notna().all().all() and sc.min().min() >= 0 and sc.max().max() <= 100


def test_our_column_is_the_real_default_ranking(df, result):
    real = score_sites(df, DEFAULT_WEIGHTS)
    expected = top_sites(real["score_total"], real["site_id"], TOP_K)
    assert result["top_sites"][OURS] == expected


def test_overlap_is_symmetric_with_k_on_the_diagonal_and_within_bounds(result):
    names = list(result["methods"])
    for a in names:
        assert result["top_overlap"][a][a] == TOP_K
        for b in names:
            assert result["top_overlap"][a][b] == result["top_overlap"][b][a]
            assert 0 <= result["top_overlap"][a][b] <= TOP_K


def test_spearman_is_one_on_the_diagonal_and_symmetric(result):
    names = list(result["methods"])
    for a in names:
        assert result["spearman"][a][a] == pytest.approx(1.0)
        for b in names:
            assert result["spearman"][a][b] == pytest.approx(result["spearman"][b][a])
            assert -1.0 <= result["spearman"][a][b] <= 1.0


def test_ties_break_by_site_id():
    ids = pd.Series(["b", "a", "c"])
    assert top_sites(pd.Series([1.0, 1.0, 0.5]), ids, 2) == ["a", "b"]


def test_the_report_says_these_are_stand_ins_and_agreement_is_not_accuracy(result):
    md = to_markdown(result)
    assert "simplified stand-ins" in md
    assert "Agreement is not accuracy" in md
    assert "ground-truth" in md


def test_the_analysis_is_deterministic(df):
    assert analyse(df) == analyse(df)
