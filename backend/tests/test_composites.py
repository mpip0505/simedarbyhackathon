import pytest

from backend.gee.composites import end_exclusive, st_dn_to_celsius
from backend.gee.export import build_summary


def test_end_exclusive_rolls_over_year_and_leap_day():
    assert end_exclusive("2022-12-31") == "2023-01-01"
    assert end_exclusive("2024-02-28") == "2024-02-29"


def test_landsat_scaling_gives_plausible_tropical_temperatures():
    # DN 44000 is a typical warm-surface value: 44000*0.00341802+149 = 299.39 K = 26.2 C
    assert st_dn_to_celsius(44000) == pytest.approx(26.24, abs=0.01)
    assert 20 < st_dn_to_celsius(45000) < 45


def _stats(c, t):
    return {"canopy_pct": c, "mean_lst_c": t, "ndvi_mean": 0.5, "window": []}


def test_build_summary_deltas_and_caveats():
    s = build_summary({"baseline": _stats(30.0, 33.0), "latest": _stats(32.5, 32.4)})
    assert s["delta_canopy_pct_points"] == 2.5 and s["delta_mean_lst_c"] == -0.6
    assert s["caveats"] and s["baseline"]["start"] < s["latest"]["start"]


def test_build_summary_rejects_impossible_canopy():
    with pytest.raises(Exception):
        build_summary({"baseline": _stats(130.0, 33.0), "latest": _stats(32.5, 32.4)})
