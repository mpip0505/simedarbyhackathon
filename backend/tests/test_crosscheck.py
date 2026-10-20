import pytest

from backend.gee.crosscheck import agreement_metrics, best_threshold


def test_perfect_agreement():
    m = agreement_metrics(tp=50, fp=0, fn=0, tn=50)
    assert m["agreement"] == m["precision"] == m["recall"] == m["f1"] == m["kappa"] == 1.0
    assert m["ours_canopy_pct"] == m["reference_tree_pct"] == 50.0 and m["pixels"] == 100


def test_known_confusion_matrix():
    # 40 true positives, 10 false positives, 20 false negatives, 30 true negatives
    m = agreement_metrics(40, 10, 20, 30)
    assert m["precision"] == pytest.approx(0.8) and m["recall"] == pytest.approx(0.667, abs=1e-3)
    assert m["f1"] == pytest.approx(0.727, abs=1e-3) and m["agreement"] == pytest.approx(0.7)
    assert m["ours_canopy_pct"] == pytest.approx(50.0) and m["reference_tree_pct"] == pytest.approx(60.0)
    # kappa by hand: observed 0.7, expected (50*60 + 50*40)/100^2 = 0.5, so (0.7-0.5)/(1-0.5) = 0.4
    assert m["kappa"] == pytest.approx(0.4)


def test_agreement_no_better_than_chance_has_zero_kappa():
    # ours says tree for half the pixels, reference for half, independently: 25 in each cell
    assert agreement_metrics(25, 25, 25, 25)["kappa"] == pytest.approx(0.0)


def test_total_disagreement_is_negative_kappa():
    assert agreement_metrics(0, 50, 50, 0)["kappa"] == pytest.approx(-1.0)


def test_undefined_ratios_are_none_not_zero():
    no_ours = agreement_metrics(0, 0, 30, 70)               # we call nothing canopy
    assert no_ours["precision"] is None and no_ours["recall"] == 0 and no_ours["f1"] is None
    no_ref = agreement_metrics(0, 30, 0, 70)                # the reference has no trees at all
    assert no_ref["recall"] is None and no_ref["precision"] == 0
    all_same = agreement_metrics(100, 0, 0, 0)              # one class only: kappa undefined
    assert all_same["kappa"] is None and all_same["agreement"] == 1.0


def test_no_pixels_is_an_error_not_a_silent_zero():
    with pytest.raises(ValueError, match="no pixels"):
        agreement_metrics(0, 0, 0, 0)


def test_best_threshold_averages_f1_over_windows_and_references():
    def m(f1):
        return {"f1": f1}
    results = {
        "baseline": {"wc": {"0.5": m(0.5), "0.6": m(0.7), "0.7": m(0.4)}, "dw": {"0.5": m(0.6), "0.6": m(0.8), "0.7": m(0.2)}},
        "latest": {"wc": {"0.5": m(0.4), "0.6": m(0.6), "0.7": m(None)}},
    }
    out = best_threshold(results)
    assert out["best"] == "0.6" and out["mean_f1_by_threshold"]["0.6"] == pytest.approx(0.7)
    assert out["mean_f1_by_threshold"]["0.7"] == pytest.approx(0.3)   # the None F1 is skipped, not counted as 0


def test_best_threshold_with_no_scores():
    assert best_threshold({"baseline": {"wc": {"0.6": {"f1": None}}}}) == {"mean_f1_by_threshold": {}, "best": None}
