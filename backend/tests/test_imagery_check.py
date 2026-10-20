from datetime import datetime, timezone

from backend.gee.imagery_check import combo_verdict, monthly_counts, overall_verdict


def ms(y, m, d):
    return int(datetime(y, m, d, tzinfo=timezone.utc).timestamp() * 1000)


def test_monthly_counts_filters_cloudy_and_missing():
    times = [ms(2022, 1, 5), ms(2022, 1, 20), ms(2022, 2, 1), ms(2022, 2, 2)]
    assert monthly_counts(times, [10, 80, 40, None]) == {"2022-01": 1, "2022-02": 1}


def test_combo_verdict_thresholds():
    assert combo_verdict(0.99, 0.95) == "GO"
    assert combo_verdict(0.90, 0.50) == "GO_COMPOSITE"
    assert combo_verdict(0.50, 0.10) == "NO_GO"


def _s(f1, ft):
    return {"n_scenes": 10, "n_usable_scenes": 5, "frac_ge1": f1, "frac_ge_target": ft}


def test_overall_is_worst_case():
    res = {"baseline": {"sentinel2": _s(0.99, 0.95), "landsat8_9": _s(0.9, 0.4)},
           "latest": {"sentinel2": _s(0.99, 0.95), "landsat8_9": _s(0.99, 0.95)}}
    verdict, lines = overall_verdict(res)
    assert verdict == "GO_COMPOSITE" and len(lines) == 4
    res["latest"]["sentinel2"] = _s(0.3, 0.1)
    assert overall_verdict(res)[0] == "NO_GO"
