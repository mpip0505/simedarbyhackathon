"""Tests for the planting-impact scenario module.   python -m pytest ml/tests -q"""
import numpy as np
import pytest

from ml.scenario import (GROWTH_SCENARIOS, canopy_trajectory, measure_park_canopy_ceiling,
                         planting_scenario)


def test_trajectory_starts_exactly_at_start_pct():
    traj = canopy_trajectory(start_pct=5.0, ceiling_pct=20.0, years=[0, 1, 2], years_to_90pct=15.0)
    assert traj[0] == pytest.approx(5.0)


def test_trajectory_reaches_90_percent_of_the_gap_at_years_to_90pct():
    start, ceiling, y90 = 2.0, 22.0, 15.0
    traj = canopy_trajectory(start, ceiling, [y90], y90)
    expected = start + 0.9 * (ceiling - start)
    assert traj[0] == pytest.approx(expected, rel=1e-6)


def test_trajectory_is_monotonic_increasing_towards_a_higher_ceiling():
    traj = canopy_trajectory(0.0, 15.0, np.arange(0, 26), 15.0)
    assert (np.diff(traj) >= 0).all()
    assert traj[-1] < 15.0          # approaches but never reaches the ceiling in finite time


def test_trajectory_moves_towards_a_lower_ceiling_too():
    """The formula is symmetric: a start above the ceiling should fall, not just rise."""
    traj = canopy_trajectory(30.0, 10.0, np.arange(0, 26), 15.0)
    assert (np.diff(traj) <= 0).all()
    assert traj[-1] > 10.0


def test_trajectory_is_flat_when_start_equals_ceiling():
    traj = canopy_trajectory(12.0, 12.0, [0, 5, 50], 15.0)
    np.testing.assert_allclose(traj, 12.0)


def test_measure_park_canopy_ceiling_is_sane_and_reproducible():
    a = measure_park_canopy_ceiling()
    b = measure_park_canopy_ceiling()
    assert a == b                  # static committed files -> deterministic
    assert 0.0 < a < 100.0          # a real fraction of real pixels, not a placeholder


def test_planting_scenario_output_contract():
    r = planting_scenario(k=20, years=10)
    assert r["k"] == 20 and r["years"] == list(range(11))
    assert set(r["trajectories"]) == set(GROWTH_SCENARIOS)
    for name, traj in r["trajectories"].items():
        assert len(traj) == 11
        assert traj[0] == pytest.approx(r["start_pct"], abs=0.05)
        assert all(0 <= v <= 100 for v in traj)
    assert r["do_nothing_pct"] == r["start_pct"]


def test_fast_scenario_moves_at_least_as_fast_as_slow():
    """fast has the smallest years_to_90pct, so at any shared year it should be at least as close
    to the ceiling as slow and default - sanity-checks the three scenarios aren't mislabelled."""
    r = planting_scenario(k=20, years=12)
    ceiling = r["ceiling_pct"]
    for y in (3, 6, 12):
        fast, default, slow = (r["trajectories"][name][y] for name in ("fast", "default", "slow"))
        if ceiling >= r["start_pct"]:
            assert fast >= default >= slow
        else:
            assert fast <= default <= slow


def test_more_years_never_moves_further_from_the_ceiling():
    r = planting_scenario(k=20, years=30)
    ceiling = r["ceiling_pct"]
    for traj in r["trajectories"].values():
        gap = [abs(ceiling - v) for v in traj]
        assert all(a >= b - 1e-9 for a, b in zip(gap, gap[1:]))   # non-increasing distance to ceiling


def test_scenario_never_claims_a_temperature_or_carbon_number():
    r = planting_scenario(k=10, years=5)
    blob = str(r).lower()
    assert "celsius" not in blob and "carbon" not in blob and "co2" not in blob and "degc" not in blob
