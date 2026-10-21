"""The field verification kit. Observations here are SYNTHETIC test fixtures made inside the tests; no field data is shipped or invented as real."""
import io

import pandas as pd
import pytest

from backend import field_checks as fc
from backend.scripts.field_sheet import ranked_table


def table(n=200):
    return pd.DataFrame({"site_id": [f"S{i:03d}" for i in range(n)], "lat": [3.17 + i * 1e-4 for i in range(n)], "lon": [101.5 + i * 1e-4 for i in range(n)],
                         "rank": list(range(1, n + 1)), "path_length_within_50m": [0 if i % 5 == 0 else 40.0 for i in range(n)]})


def test_sample_is_seeded_balanced_and_only_footpath_sites():
    t = table()
    a, b = fc.pick_sample(t, 15, seed=7), fc.pick_sample(t, 15, seed=7)
    assert a.equals(b)
    assert fc.pick_sample(t, 15, seed=8)["site_id"].tolist() != a["site_id"].tolist()
    assert (a["group"] == "high").sum() == 15 and (a["group"] == "low").sum() == 15
    with_path = set(t.loc[t["path_length_within_50m"] > 0, "site_id"])
    assert set(a["site_id"]) <= with_path
    assert a[a["group"] == "high"]["rank"].max() <= 50 + 12          # high group comes from the top 50 of the footpath pool
    assert a[a["group"] == "low"]["rank"].min() > 100                # low group from the lower half of the pool


def test_too_small_a_pool_is_refused():
    with pytest.raises(ValueError, match="need at least"):
        fc.pick_sample(table(30), 15)


def test_the_blank_sheet_is_blind():
    sheet = fc.blank_sheet(fc.pick_sample(table(), 15))
    assert list(sheet.columns) == fc.SHEET_COLUMNS
    assert not {"rank", "group", "score_total"} & set(sheet.columns)
    html = fc.sheet_html(sheet)
    assert "rank" not in html.lower().replace("ranking", "") and "score" not in html.lower().replace("do not look up the site's score", "")


def test_the_html_escapes_site_ids():
    sheet = fc.blank_sheet(pd.DataFrame({"site_id": ["<img src=x onerror=1>"], "lat": [3.1], "lon": [101.5], "rank": [1], "group": ["high"]}))
    assert "<img" not in fc.sheet_html(sheet)


def csv_text(rows):
    df = pd.DataFrame(rows, columns=fc.SHEET_COLUMNS).fillna("")
    return df.to_csv(index=False)


def row(site, shade="none", canopy="none", use="yes"):
    return {"site_id": site, "lat": 3.1, "lon": 101.5, "shade_on_path": shade, "canopy_class": canopy, "path_in_use": use}


def test_validation_names_the_row_and_the_problem():
    ids = {"A", "B"}
    bad = csv_text([row("A", shade="maybe"), row("A"), row("Z"), row("B", canopy="")])
    with pytest.raises(fc.FieldCheckError) as e:
        fc.validate(fc.read_sheet(bad), ids)
    msg = str(e.value)
    assert "row 2: shade_on_path 'maybe'" in msg and "appears more than once" in msg and "unknown site_id 'Z'" in msg and "row 5: canopy_class is empty" in msg


def test_a_missing_column_is_reported():
    with pytest.raises(fc.FieldCheckError, match="missing column"):
        fc.read_sheet("site_id,lat\nA,1\n")


def test_summary_on_synthetic_observations_where_the_ranking_agrees_with_the_field():
    ranks = pd.Series({f"S{i}": i for i in range(1, 21)})
    rows = [row(f"S{i}", shade="none" if i <= 10 else "full", canopy="none" if i <= 10 else "dense", use="yes" if i % 2 else "no") for i in range(1, 21)]
    s = fc.summarise(fc.validate(fc.read_sheet(csv_text(rows)), set(ranks.index)), ranks)
    assert s.n == 20 and s.rows["high"]["no_shade_pct"] == 100.0 and s.rows["low"]["no_shade_pct"] == 0.0
    assert s.spearman < -0.8 and s.enough
    assert "negative" in fc.report(s)


def test_a_small_sample_is_flagged_not_over_read():
    ranks = pd.Series({f"S{i}": i for i in range(1, 7)})
    rows = [row(f"S{i}", shade="none" if i <= 3 else "full") for i in range(1, 7)]
    s = fc.summarise(fc.validate(fc.read_sheet(csv_text(rows)), set(ranks.index)), ranks)
    assert not s.enough and "Too few sites to read" in fc.report(s)


def test_the_report_does_not_overclaim():
    ranks = pd.Series({f"S{i}": i for i in range(1, 21)})
    rows = [row(f"S{i}", shade="partial") for i in range(1, 21)]
    text = fc.report(fc.summarise(fc.validate(fc.read_sheet(csv_text(rows)), set(ranks.index)), ranks)).lower()
    assert "cannot show the ranking is right" in text
    for banned in ("proves", "validated", "accurate", "carbon"):
        assert banned not in text


def test_the_real_ranked_table_has_footpath_sites_to_sample():
    sample = fc.pick_sample(ranked_table(), 15)
    assert len(sample) == 30 and sample["site_id"].is_unique
