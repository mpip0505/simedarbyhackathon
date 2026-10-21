"""The browser re-ranks sites with frontend/js/weights.js, which must agree exactly with backend/api/scoring.py.
The Node test replays frontend/tests/fixtures/retotal_cases.json against the JavaScript. These tests make sure that
fixture still describes what the BACKEND does today, so the two languages cannot drift apart unnoticed."""
import json

from backend.scripts import make_frontend_fixture as fx


def committed():
    return json.loads(fx.FIXTURE.read_text(encoding="utf-8"))


def test_fixture_matches_what_the_backend_computes_now():
    regenerated = json.loads(json.dumps(fx.build_cases()))
    assert committed()["cases"] == regenerated, (
        "backend/api/scoring.py no longer matches frontend/tests/fixtures/retotal_cases.json. "
        "Run: python -m backend.scripts.make_frontend_fixture, then update frontend/js/weights.js if node --test fails.")


def test_rounding_cases_match_pythons_round():
    for value, expected in committed()["round_cases"]:
        assert round(value, 1) == expected


def test_fixture_covers_the_hard_cases():
    cases = committed()["cases"]
    names = {c["name"] for c in cases}
    assert names == {"random", "ties"} and len(cases) >= 20
    tie_totals = {row[0]: row[1] for c in cases if c["name"] == "ties" and c["weights"] == {"cooling": 0.5, "connectivity": 0.5, "shade": 0}
                  for row in c["expected"]}
    assert tie_totals["E1"] == 72.2 and tie_totals["E3"] == 0.2          # exact ties round half to even, not half up
    assert len(committed()["round_cases"]) > 2500


def test_every_site_in_every_case_gets_a_unique_rank():
    for case in committed()["cases"]:
        ranks = [row[2] for row in case["expected"]]
        assert ranks == list(range(1, len(ranks) + 1))
