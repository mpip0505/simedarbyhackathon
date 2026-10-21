# ML layer: site scoring

Turns the backend's feature table into the two files the API reads. Owned by the ML role; it reads
backend data and writes only `scores.geojson` and `weights.json`, both through `backend.ml_io`.

Plain-language explanation for the pitch: [`docs/ml-model.md`](../docs/ml-model.md).
Evidence: [`reports/validation.md`](reports/validation.md).

## Run it

```bash
pip install -r backend/requirements.txt
pip install -r ml/requirements.txt               # scipy and scikit-learn, used by the validation only
python -m ml.run_scoring                         # -> backend/data/cache/weights.json, scores.geojson
python -m backend.validate_scores backend/data/cache/scores.geojson     # must print OK
python -m ml.validation                          # -> ml/reports/validation.{json,md}
python -m pytest ml/tests -q                     # 24 tests
```

Then confirm the API picked it up:

```bash
uvicorn backend.api.main:app --port 8000
curl localhost:8000/meta      # score_source: "ml", scores_error: null, scores_stale: false
curl localhost:8000/weights   # {"default": {...}, "source": "file"}
curl "localhost:8000/sites?limit=5"
curl "localhost:8000/sites?w_cooling=1&w_connectivity=0&w_shade=0"      # re-ranks live
```

`python -m ml.run_scoring --dry-run` computes and prints without writing anything.
`python -m ml.validation --draws 500` runs the weight sample faster.

### For the pitch: a spread-out shortlist

The raw top 20 by `score_total` is six 250 m blocks, almost one contiguous strip (see
`ml/reports/validation.md` section 7). `rank` can't be reordered for spread inside `scores.geojson`
itself - the API's weight sliders retotal and re-rank live from the stored scores, and
`backend.validate_scores` requires rank to strictly track `score_total`, so decoupling them there
would break the first time someone moves a slider. Instead, a separate presentation artifact:

```bash
python -m ml.shortlist                       # k=20, max 3 sites per 250 m block
python -m ml.shortlist --k 15 --max-per-block 2
```

Writes `reports/shortlist.md` and `.json`: the same top sites, capped per block, with the
score trade-off made explicit (currently: 6 blocks -> 10 blocks, largest block's share 35% -> 15%,
for 1.0 point of average `score_total`). Use this for "where to start" slides; use the live map
(`scores.geojson` via the API) for the actual ranking.

### How much does the ranking depend on our judgement calls?

```bash
python -m ml.uncertainty                 # 2000 draws -> reports/uncertainty.{md,json,sites.csv}
python -m ml.uncertainty --draws 500      # faster
```

Draws many plausible weight sets *and* distance/length constants at once (not one at a time, like
`ml.validation`'s sensitivity section), rescoring every site under each, then reports per site: a
score range, a rank range, and the share of draws it stays in the top 20. Current headline: the
single default ranking's median across 2000 draws agrees at **Spearman 0.999**, rank 1 is in the
top 20 100% of the time, but **13 of the default top 20** clear the "robust" bar (>= 80% of draws) -
the rest are plausible, not guaranteed, and the report says which ones and why (one site's good
shade score turns out to hinge entirely on where `unshaded_cap_m` happens to land). Use this for the
"how sure are we" slide; use `ml.validation` for the one-at-a-time sensitivity breakdown.

### Comparing judgement calls

The decay scales and the gap-fill discount inside each score are judgement calls, not weights, so
they are not reachable from the API's `?w_cooling=` sliders. Compare alternatives before committing
one, instead of just asserting it in the docs:

```bash
python -m ml.run_scoring --gap-scale-m 200 --dry-run        # vs the default 400
python -m ml.run_scoring --no-shrink-gapfilled --dry-run    # turn off the reliability discount
```

If the team wants these live-adjustable from the map (not just via this script), that is a backend
change - a new query param alongside `w_cooling`/`w_connectivity`/`w_shade` - ask Backend rather than
trying to reach into the API from here.

## Files

| Path | What |
|---|---|
| `scoring_model.py` | the model: eight named inputs on a 0-100 scale, three scores, the total, ranks |
| `run_scoring.py` | default weights, and delivery of the two files (weights first - the validator reads them) |
| `validation.py` | eight consistency and stability checks, rendered to `reports/validation.md` |
| `tests/test_scoring_model.py` | output contract, transform behaviour, and the sign of every term |
| `shortlist.py` | spread-out top-N for the pitch, separate from the scored/ranked file |
| `uncertainty.py` | Monte Carlo over weights + judgement constants: a range per site, not one number |
| `reports/` | generated; regenerate with `ml.validation` / `ml.shortlist` / `ml.uncertainty` |

## The model in six lines

Each score is a weighted average of named inputs, each already turned into "0-100, more means plant
here". Percentile ranks are used for values that only mean something relative to other sites
(temperature, greenness, built-up share); distance decays for values with absolute physical meaning
(metres to a corridor gap, a park, a path). Nothing is fitted - there are no labels to fit to.
Temperature is discounted where the satellite pixel was gap-filled. Rank-identical feature pairs are
used once, not twice. Ties in `score_total` break by `site_id`, the same rule the API uses, so a
live re-rank through `?w_cooling=` reproduces our order instead of shuffling equal scores.

Default weights: cooling 0.45, connectivity 0.30, shade 0.25. Reasoning in
[`docs/ml-model.md`](../docs/ml-model.md#the-default-weights-and-why).

## If the backend rebuilds its data

`GET /meta` shows `scores_stale: true` and the scores keep the old `data_version`. Re-run
`python -m ml.run_scoring` and `python -m ml.validation`. Site IDs are stable across rebuilds, so
the top of the list should look familiar; if it does not, something changed upstream - ask Backend.

## Notes for the team

- **Frontend:** nothing to change. `score_total`, the three components and `rank` arrive in the same
  fields as the placeholder did; `/meta.score_source` now reads `ml`, so the placeholder badge
  should disappear on its own. Sliders start from `/weights`, which now serves our defaults
  (`source: "file"`).
- **Backend:** two things found while scoring, neither worked around in our code.
  1. `corridor_gap_dist_m` and `dist_to_corridor_spine_m` are rank-identical (Spearman 1.00, 142 of
     564 rows byte-identical), and so are `uncovered_path_length_50m` and `path_length_within_50m`.
     Both pairs are documented as separate features; they carry one signal each in this build.
  2. `backend/tests/test_retry.py` fails at collection on Python 3.11 (`KeyError: 'file'` while
     pytest builds parametrize IDs from the `urllib.error.HTTPError` instance). The other 140 tests
     pass. The README asks for 3.12, so this is likely version-specific and not a retry-logic bug.
