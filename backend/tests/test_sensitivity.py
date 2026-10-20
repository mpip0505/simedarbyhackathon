from backend.gee.sensitivity import spread


def test_spread_groups_by_prefix():
    res = {"baseline_24m": {"0.6": 10.0}, "baseline_yr1": {"0.6": 8.0}, "latest_24m": {"0.6": 20.0}}
    assert spread(res, "0.6", "baseline") == {"min": 8.0, "max": 10.0, "range_pts": 2.0}
    assert spread(res, "0.6", "latest")["range_pts"] == 0.0
