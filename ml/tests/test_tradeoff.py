"""Tests for ml/tradeoff.py.   python -m pytest ml/tests -q"""
import pytest

from backend.ml_io import load_sites_df
from ml.impact_reach import build as build_reach
from ml.tradeoff import LABELS, OURS, SPREAD, STEPS, build, pick_lists, to_markdown


@pytest.fixture(scope="module")
def result():
    return build()


def test_every_step_has_every_method_with_the_right_number_of_sites(result):
    for k in STEPS:
        rows = result["results"][str(k)]
        assert set(rows) == set(LABELS)
        assert all(r["n"] == k for r in rows.values())


def test_our_row_matches_the_impact_reach_report(result):
    reach = {r["n"]: r for r in build_reach()["rows"]}
    for k in STEPS:
        ours, ref = result["results"][str(k)][OURS], reach[k]
        assert (ours["unshaded_path_m"], ours["homes"], ours["gap_m"]) == (ref["unshaded_path_m"], ref["homes"], ref["gap_m"])


def test_spread_out_covers_at_least_as_many_areas_as_the_strict_ranking(result):
    for k in STEPS:
        rows = result["results"][str(k)]
        assert rows[SPREAD]["areas"] >= rows[OURS]["areas"]


def test_values_are_sensible(result):
    for k in STEPS:
        for r in result["results"][str(k)].values():
            assert 0 <= r["unshaded_path_pct"] <= 100 and 0 <= r["homes_pct"] <= 100 and 0 <= r["gap_pct"] <= 100
            assert 0 <= r["hotter_than_pct"] <= 100 and 1 <= r["areas"] <= k


def test_the_heat_only_list_is_hotter_than_ours(result):
    for k in STEPS:
        rows = result["results"][str(k)]
        assert rows["heat_only"]["hotter_than_pct"] > rows[OURS]["hotter_than_pct"]


def test_pick_lists_are_unique_site_ids():
    for ids in pick_lists(load_sites_df(), 20).values():
        assert len(ids) == len(set(ids)) == 20


def test_the_report_says_trade_off_not_league_table_and_makes_no_benefit_claim(result):
    md = to_markdown(result)
    assert "trade-off, not a league table" in md and "simulated" in md
    for banned in ("better than", "best ", "cooler", "carbon", "saves"):
        assert banned not in md.lower()


def test_deterministic(result):
    assert build() == result
