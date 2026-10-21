"""ml/reach_sets.py: a union over per-site index lists must equal ml/impact_reach.py for the same sites."""
import pytest

from ml.impact_reach import build as build_reach
from ml.reach_sets import build


@pytest.fixture(scope="module")
def sets():
    return build()


def union_m(sets, ids):
    path, homes, gaps = set(), set(), set()
    for sid in ids:
        a, b, c = sets["sites"][sid]
        path.update(a); homes.update(b); gaps.update(c)
    step = sets["sample_step_m"]
    return {"unshaded_path_m": len(path) * step["footpath"], "homes": len(homes), "gap_m": len(gaps) * step["gap"]}


def test_every_site_has_three_sorted_unique_index_lists(sets):
    assert len(sets["sites"]) == sets["n_sites"] == 564
    t = sets["totals"]
    limits = (t["footpath_samples"], t["homes"], t["gap_samples"])
    for lists in sets["sites"].values():
        assert len(lists) == 3
        for idx, limit in zip(lists, limits):
            assert idx == sorted(set(idx)) and all(0 <= i < limit for i in idx)


def test_the_union_of_the_first_n_ranked_sites_equals_the_impact_report(sets):
    reach = build_reach()
    ranked = list(sets["sites"])          # built in default-ranking order
    for row in reach["rows"]:
        got = union_m(sets, ranked[: row["n"]])
        assert got["unshaded_path_m"] == row["unshaded_path_m"] or abs(got["unshaded_path_m"] - row["unshaded_path_m"]) <= 5
        assert got["homes"] == row["homes"]
        assert abs(got["gap_m"] - row["gap_m"]) <= 5


def test_a_union_is_not_a_sum(sets):
    ids = list(sets["sites"])[:50]
    summed = sum(len(sets["sites"][i][0]) for i in ids)
    unique = len({j for i in ids for j in sets["sites"][i][0]})
    assert unique < summed


def test_note_says_reach_not_benefit(sets):
    assert "Reach, not benefit" in sets["note"] and "simulated" in sets["note"]


def test_deterministic(sets):
    assert build() == sets
