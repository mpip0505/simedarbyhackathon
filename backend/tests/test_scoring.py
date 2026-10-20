import pytest

from backend.api import scoring


def feat(site_id, lst, ndvi, gap, path, **scores):
    props = {"site_id": site_id, "lst_c_mean": lst, "ndvi_mean": ndvi, "corridor_gap_dist_m": gap,
             "dist_to_path_m": path, "score_cooling": None, "score_connectivity": None, "score_shade": None,
             "score_total": None, "rank": None, "score_source": None}
    props.update(scores)
    return {"type": "Feature", "geometry": None, "properties": props}


def test_normalise_weights_and_rejects_zero():
    assert scoring.normalise_weights({"a": 2, "b": 2}) == {"a": 0.5, "b": 0.5}
    with pytest.raises(ValueError):
        scoring.normalise_weights({"a": 0, "b": 0})


def test_placeholder_prefers_hot_bare_close_to_gap_and_path():
    good = feat("A", lst=45, ndvi=0.1, gap=0, path=0)
    bad = feat("B", lst=35, ndvi=0.7, gap=500, path=500)
    feats = [good, bad]
    scoring.fill_placeholders(feats)
    assert good["properties"]["score_total"] > bad["properties"]["score_total"]
    assert good["properties"]["score_source"] == "placeholder"
    assert bad["properties"]["score_connectivity"] == 0 and bad["properties"]["score_shade"] == 0


def test_placeholder_handles_identical_values_and_skips_scored():
    scored = feat("S", 40, 0.3, 10, 10, score_total=77.0, score_source="ml")
    same1, same2 = feat("X", 40, 0.3, 10, 10), feat("Y", 40, 0.3, 10, 10)
    scoring.fill_placeholders([scored, same1, same2])
    assert scored["properties"]["score_total"] == 77.0 and scored["properties"]["score_source"] == "ml"
    assert same1["properties"]["score_total"] == same2["properties"]["score_total"]


def test_merge_ml_scores_overrides_only_matching_scored_sites():
    a, b = feat("A", 40, 0.3, 10, 10), feat("B", 40, 0.3, 10, 10)
    ml = {"features": [{"properties": {"site_id": "A", "score_cooling": 90, "score_connectivity": 80,
                                       "score_shade": 70, "score_total": 82.5, "rank": 1}},
                       {"properties": {"site_id": "B", "score_total": None}}]}
    scoring.merge_ml_scores([a, b], ml)
    assert a["properties"]["score_source"] == "ml" and a["properties"]["rank"] == 1
    assert b["properties"]["score_source"] is None


def test_retotal_changes_ranking_with_weights():
    hot = feat("HOT", 0, 0, 0, 0, score_cooling=100, score_connectivity=0, score_shade=0, score_total=0)
    link = feat("LINK", 0, 0, 0, 0, score_cooling=0, score_connectivity=100, score_shade=0, score_total=0)
    feats = [hot, link]
    scoring.retotal(feats, {"cooling": 1, "connectivity": 0, "shade": 0})
    assert hot["properties"]["rank"] == 1 and hot["properties"]["score_total"] == 100
    scoring.retotal(feats, {"cooling": 0, "connectivity": 1, "shade": 0})
    assert link["properties"]["rank"] == 1
