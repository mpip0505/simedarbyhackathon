"""Generate frontend/tests/fixtures/retotal_cases.json from the BACKEND scoring code.

The browser re-ranks sites when a weight slider moves (frontend/js/weights.js). That code must give exactly the
same totals and ranks as the API's `?w_cooling=...` re-ranking. This file records what the backend returns for a
set of cases (including exact rounding ties and equal totals); the Node test replays them against the JavaScript.

Run:  python -m backend.scripts.make_frontend_fixture        (a pytest checks the committed file is current)
"""
import copy
import random

from backend import atomic
from backend.api import scoring
from backend.config import BACKEND_DIR

FIXTURE = BACKEND_DIR.parent / "frontend" / "tests" / "fixtures" / "retotal_cases.json"


def site(site_id, cooling, connectivity, shade):
    return {"site_id": site_id, "score_cooling": cooling, "score_connectivity": connectivity, "score_shade": shade,
            "score_total": 0.0, "rank": None}


def feature(props):
    return {"type": "Feature", "geometry": None, "properties": dict(props)}


def build_cases() -> list:
    rng = random.Random(2026)
    random_sites = [site(f"R{i:03d}", round(rng.uniform(0, 100), 1), round(rng.uniform(0, 100), 1),
                         round(rng.uniform(0, 100), 1)) for i in range(60)]
    ties = [  # exact binary ties after weighting, and sites that end up with identical totals
        site("T1", 72.5, 72.5, 72.0), site("T2", 72.5, 72.5, 72.0), site("T3", 10.0, 10.0, 10.0),
        site("T0", 72.5, 72.5, 72.0), site("T4", 0.5, 0.5, 0.5), site("T5", 100.0, 100.0, 100.0),
        site("T6", 33.3, 33.3, 33.4), site("T7", 0.0, 0.0, 0.0), site("T8", 12.5, 37.5, 62.5),
        # with weights 0.5 / 0.5 / 0 these totals are EXACT ties at one decimal: Python rounds half to even
        # (72.25 -> 72.2, 72.75 -> 72.8, 0.25 -> 0.2, 0.75 -> 0.8) while Math.round / toFixed round half up
        site("E1", 72.5, 72.0, 10.0), site("E2", 73.5, 72.0, 10.0), site("E3", 0.5, 0.0, 0.0), site("E4", 1.5, 0.0, 0.0),
    ]
    weight_sets = [
        {"cooling": 0.4, "connectivity": 0.35, "shade": 0.25},      # the placeholder defaults
        {"cooling": 1, "connectivity": 1, "shade": 1},
        {"cooling": 0.5, "connectivity": 0.25, "shade": 0.25},      # produces exact x.x5 ties
        {"cooling": 1, "connectivity": 0, "shade": 0},
        {"cooling": 0, "connectivity": 1, "shade": 0},
        {"cooling": 0, "connectivity": 0, "shade": 1},
        {"cooling": 70, "connectivity": 20, "shade": 10},
        {"cooling": 0.15, "connectivity": 0.15, "shade": 0.7},      # 0.15 is not exactly representable
        {"cooling": 3, "connectivity": 7, "shade": 11},
        {"cooling": 0.5, "connectivity": 0.5, "shade": 0},          # exact x.x5 ties (see the E sites)
    ]
    cases = []
    for name, sites in (("random", random_sites), ("ties", ties)):
        for weights in weight_sets:
            feats = [feature(s) for s in sites]
            scoring.retotal(feats, copy.deepcopy(weights))
            ordered = sorted(feats, key=lambda f: f["properties"]["rank"])
            cases.append({"name": name, "weights": weights, "sites": sites,
                          "expected": [[f["properties"]["site_id"], f["properties"]["score_total"],
                                        f["properties"]["rank"]] for f in ordered]})
    return cases


def build_round_cases() -> list:
    """[value, python round(value, 1)] for exact ties, near-ties (0.15 is stored just below) and random floats."""
    rng = random.Random(7)
    values = [k / 20.0 for k in range(0, 2001)]                        # every x.x0 and x.x5, incl. exact binary ties
    values += [round(rng.uniform(0, 100), rng.randint(2, 9)) for _ in range(600)]
    values += [0.0, -0.0, 100.0, 99.95, 99.949999999, 72.375, 0.05, 0.45, 2.675, 1e-9]
    return [[v, round(v, 1)] for v in values]


def main() -> None:
    atomic.write_json(FIXTURE, {"generated_by": "backend/scripts/make_frontend_fixture.py", "cases": build_cases(),
                                "round_cases": build_round_cases()})
    print(f"wrote {FIXTURE}")


if __name__ == "__main__":
    main()
