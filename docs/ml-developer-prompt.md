# Prompt for the ML developer

Written for: the ML developer on the team, and the AI assistant they paste this into. Everything below is verified
against the repository as committed. Paste from the line "You are helping..." to the end.

---

You are helping the ML developer on a student team building a hackathon prototype in about 2 weeks.

CONTEXT
- Hackathon: Sime Darby Property "Township of Tomorrow", Planet (biodiversity) track. Judged on innovation, original
  thinking, design, business viability, technical execution and fit to the theme. The pitch splits into "Mechanism"
  (the solution and its value) and "Enabler" (how technology makes it work).
- The idea: a **canopy prioritiser** for City of Elmina (Selangor). It ranks where to plant trees first, on three things:
  cooling benefit, habitat connectivity along the Urban Biodiversity Corridor, and shade on walking routes.
- It is a **screening tool**, not disclosure-grade evidence. Say so in anything you write.
- The team has three roles: Backend (done, below), ML (you), Frontend (builds the map against the same API).
- Repository: this repo. Python 3.12. Run `pip install -r backend/requirements.txt`.

WHAT THE BACKEND ALREADY DOES (all tested: 138 tests pass; a full rebuild from scratch reproduces the data exactly)
- Builds cloud-masked Sentinel-2 NDVI and Landsat 8/9 surface-temperature composites over Elmina in Google Earth Engine
  (two-year median windows: baseline 2021-10 to 2023-09, latest 2024-10 to 2026-09).
- Pulls paths, roads, parks, open land and buildings from OpenStreetMap, and builds an **approximate** corridor.
- Generates **564 simulated candidate sites** (30 m cells on open land and corridor land). They are NOT Sime Darby
  Property's real planting list. All carry `source: "simulated"`.
- Measures about 30 features per site and serves everything through a FastAPI service with a fixed data contract.
- **Already computed, do not recompute:** baseline and latest canopy % and mean temperature (`GET /summary`), yearly
  series (`GET /summary/series`), and before/after map overlays. Those are backend deliverables.

WHAT YOU RECEIVE
Load the table with:
```python
from backend.ml_io import load_sites_df
df = load_sites_df()      # 564 rows, one per site. Read docs/data-dictionary.md for every column.
```
Feature groups (units, ranges and cautions are in `docs/data-dictionary.md`):
- Identity: `site_id` (stable across rebuilds), `lon`, `lat`, `origin`, `block_id` (250 m spatial block), `area_m2`.
- On the site: `ndvi_mean`, `lst_c_mean`, `canopy_pct_baseline`, `lst_valid_frac` (share of the temperature that is real
  rather than gap-filled).
- Surroundings (the brief's "hot, low-vegetation surroundings"): `lst_mean_100m`, `lst_mean_250m`, `ndvi_mean_100m`,
  `ndvi_mean_250m`, `buildings_within_250m`, `residential_buildings_within_250m`, `built_up_frac_250m`.
- Walking routes: `dist_to_path_m`, `path_length_within_50m`, `uncovered_path_length_50m` (nearby path with no canopy),
  `path_canopy_frac_50m` (blank when no path is within 50 m).
- Corridor: `corridor_gap_flag`, `corridor_gap_dist_m`, `dist_to_corridor_spine_m`, `dist_to_nearest_park_m`, `in_corridor`.
- Diagnostic only, **do not score on these**: `ndvi_change`, `lst_change_c`, `ndvi_mean_baseline`,
  `lst_c_mean_baseline` (the baseline has haze artefacts: cold pixels and +15 C extremes).

YOUR JOB
1. Build three scores, each 0 to 100: **cooling benefit**, **habitat connectivity** (gaps along the corridor), and
   **shade on walking routes**.
2. Combine them into `score_total` (0 to 100) with clear, adjustable weights. Choose the default weights and say why.
   Write them to `backend/data/cache/weights.json` as `{"cooling": .., "connectivity": .., "shade": ..}` so the
   Frontend sliders start from your default (`GET /weights`). Placeholder defaults today are 0.40 / 0.35 / 0.25.
3. Give every site a unique integer `rank` (1 = plant first) that agrees with the `score_total` order.
4. Validate (see below) and test how stable the ranking is under different weights.
5. Document the limits and write a plain-language explanation of how the scores are computed, for the pitch.

DELIVERY (exact interface)
```python
from backend.ml_io import write_scores
# df_scores needs exactly these columns, one row per site:
# site_id, score_cooling, score_connectivity, score_shade, score_total, rank
write_scores(df_scores)   # validates, stamps the data version, writes backend/data/cache/scores.geojson
```
- Check a file by hand: `python -m backend.validate_scores backend/data/cache/scores.geojson`. Example format:
  `docs/scores.example.geojson`.
- The API merges your file by `site_id` and flips `score_source` from `"placeholder"` to `"ml"`. Confirm with
  `GET /meta` after writing: `score_source` should be `ml`, `scores_error` null and `scores_stale` false.
- A bad file never breaks the API; it is ignored and reported in `/meta.scores_error`. Always check `/meta`.
- If the backend rebuilds with different data, `/meta.scores_stale` turns true: re-score.

SMALLEST VERSION THAT WORKS FIRST (suggestion, your call)
Transparent percentile-rank scores, no black box. For example: cooling from `lst_mean_250m` (high is better),
`ndvi_mean_250m` (low is better) and `built_up_frac_250m`; connectivity from `corridor_gap_dist_m` (small is better) and
`in_corridor`; shade from `uncovered_path_length_50m` (more unshaded path is better) and `path_length_within_50m`.
Convert each input to a 0 to 100 percentile rank, average within a score, then weight. Only add complexity if you can
explain it to a judge in one sentence. Optional: down-weight sites with low `lst_valid_frac`.

VALIDATION THAT FITS THE DATA
- **There are no ground-truth labels.** Validation can only check internal consistency and stability. Never claim the
  ranking is "correct" or "accurate". Say "consistent" and "stable".
- Direction check: top-decile sites should be hotter and less vegetated than bottom-decile sites. Note this is partly
  true by construction, because the scores are built from those features.
- Weight stability: draw many random weight sets (for example a Dirichlet sample), then report rank correlation with
  the default ranking, overlap of the top 20, and each site's rank range.
- Leave-features-out: drop each feature group in turn and report how much the ranking moves.
- Spatial robustness: **split or group by `block_id`** (for example `GroupKFold`). Neighbouring 30 m cells are strongly
  correlated, so random splits overstate stability.
- Reliability: compare the ranking with and without sites that have `lst_valid_frac` below 0.5 (93 sites).

THINGS YOU MUST KNOW (honest limits that affect your scores)
- Sites are simulated; the corridor is approximate (about 2 km of spine against the stated 5 km; one park unlinked), so
  connectivity inherits that. Only about 16% of sites are within 50 m of a corridor gap, so connectivity is skewed.
- Temperature is ranking-grade: Landsat thermal is about 100 m native, and about 18% of the area is gap-filled.
- Canopy % is a vegetation-index proxy, not a tree count. Independent maps disagree about the amount (ESA WorldCover
  about 28%, Dynamic World about 4% to 7%, our proxy about 10%) and none supports a trend. Do not present canopy change
  as growth.
- OpenStreetMap undertags undeveloped land in the west and buildings in the south-east, so `built_up_frac_250m` is a
  lower bound there.
- `path_canopy_frac_50m` is blank (not zero) when there is no path within 50 m.

RULES
- Be honest about limits. Do not invent data, citations or statistics. If unsure, say so.
- Give working, runnable code with brief comments, and tell me exactly how to run it.
- Keep it simple enough to finish in the time. Suggest the smallest version that works first.
- Ask me before assuming anything about data we do not have.
- Do not edit backend code or the committed data files. Write only `scores.geojson` and `weights.json` through
  `backend.ml_io`, and report any backend bug or data oddity to the Backend developer instead of working around it.

DELIVERABLES AND DATES (from the team plan)
- Day 6: first scoring version (it can be rough, but it must pass `validate_scores`).
- Day 10: final ranking with validation and the weight-stability analysis.
- Day 12: plain-language explanation of how the scores are computed, for the pitch.

CHECKLIST BEFORE YOU HAND BACK
- `python -m backend.validate_scores backend/data/cache/scores.geojson` prints OK.
- `GET /meta` shows `score_source: "ml"`, `scores_error: null`, `scores_stale: false`.
- `GET /sites?limit=5` shows your top sites, and changing `?w_cooling=` re-ranks them sensibly.
- Your write-up states: how each score is computed, the default weights and why, what the validation shows, and the
  limits above, in plain language.

Prompt line: "Help me with the ML and scoring: a transparent site-scoring model combining cooling, corridor connectivity and
shade on walking routes from the feature table in docs/data-dictionary.md, adjustable weights, a validation and weight
stability analysis that is honest about having no ground truth, and output through backend.ml_io.write_scores."
