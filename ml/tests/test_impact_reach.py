"""Tests for ml/impact_reach.py.   python -m pytest ml/tests -q

Reach is counted as a union: a point, home or gap that several chosen cells are near is counted once.
"""
import pytest
from shapely.geometry import Point, box

from ml.impact_reach import build, curve, measure, reached_buildings, reached_points, to_markdown


def cell(x, y, size=30):
    return box(x, y, x + size, y + size)


def test_overlapping_cells_count_a_nearby_point_once():
    points = [Point(15, 100)]                       # 70 m above two identical cells at y 0 to 30
    twin = [cell(0, 0), cell(0, 0)]
    assert reached_points(points, twin, 80).sum() == 1
    assert reached_points(points, [cell(0, 0)], 80).sum() == 1
    assert reached_points(points, twin, 10).sum() == 0


def test_identical_cells_reach_exactly_what_one_cell_reaches():
    cells = [cell(0, 0), cell(0, 0), cell(0, 0)]
    centres = [c.centroid for c in cells]
    pts = [Point(x, 10) for x in range(0, 200, 10)]
    homes = [box(60, 0, 70, 10), box(500, 500, 510, 510)]
    gaps = [Point(15, 40), Point(900, 900)]
    one = measure([0], cells, centres, pts, homes, gaps)
    three = measure([0, 1, 2], cells, centres, pts, homes, gaps)
    assert one == three and one["homes"] == 1


def test_buildings_far_away_are_not_reached():
    assert reached_buildings([box(1000, 1000, 1010, 1010)], [Point(0, 0)], 250).sum() == 0


def test_curve_is_monotone_and_the_last_row_equals_the_ceiling():
    cells = [cell(0, 0), cell(100, 0), cell(1000, 0)]
    centres = [c.centroid for c in cells]
    pts = [Point(x, 10) for x in range(0, 1200, 10)]
    homes = [box(110, 10, 120, 20), box(1010, 10, 1020, 20), box(5000, 5000, 5010, 5010)]
    gaps = [Point(15, 20), Point(1015, 20)]
    r = curve([0, 1, 2], cells, centres, pts, homes, gaps, steps=(1, 2))
    rows = r["rows"]
    assert [x["n"] for x in rows] == [1, 2, 3]
    for key in ("unshaded_path_m", "homes", "gap_m"):
        values = [x[key] for x in rows]
        assert values == sorted(values)
        assert values[-1] == r["ceiling"][key]
    assert r["ceiling"]["homes"] == 2 < r["totals"]["homes"] == 3        # a home no site is near is never counted as reached


@pytest.fixture(scope="module")
def real():
    return build()


def test_real_curve_never_exceeds_the_township_or_the_ceiling(real):
    t, c = real["totals"], real["ceiling"]
    for k in t:
        assert 0 < c[k] <= t[k]
    prev = None
    for row in real["rows"]:
        assert row["unshaded_path_m"] <= c["unshaded_path_m"] and row["homes"] <= c["homes"] and row["gap_m"] <= c["gap_m"]
        for k in ("unshaded_path_pct_of_township", "homes_pct_of_township", "gap_pct_of_corridor_gaps"):
            assert 0 <= row[k] <= 100
        if prev:
            assert row["unshaded_path_m"] >= prev["unshaded_path_m"] and row["homes"] >= prev["homes"] and row["gap_m"] >= prev["gap_m"]
        prev = row
    assert real["rows"][-1]["n"] == real["n_sites"]


def test_real_top_50_is_not_a_sum_of_per_site_numbers(real):
    """The early per-site sum for the top 50 was 17,102 m of footpath against a township total near 66,000 m of unshaded path;
    de-duplicated reach is far smaller than a naive sum because neighbouring cells share the same footpath."""
    row = next(x for x in real["rows"] if x["n"] == 50)
    assert row["unshaded_path_m"] < 17102


def test_the_report_labels_itself_reach_not_outcome_and_simulated(real):
    md = to_markdown(real)
    assert "REACH, not outcome" in md and "simulated" in md
    for banned in ("reduces heat", "carbon", "cooling by", "saves"):
        assert banned not in md.lower()


def test_the_analysis_is_deterministic(real):
    assert build() == real
