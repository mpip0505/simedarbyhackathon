# How the site scores are computed

Plain-language explanation of the ML layer, for the pitch and for anyone reading the map. Technical
detail is in `ml/scoring_model.py`; the measured evidence is in
[`ml/reports/validation.md`](../ml/reports/validation.md).

## In one paragraph

Every one of the 564 candidate cells gets three scores out of 100 — **cooling benefit**, **habitat
connectivity** and **shade on walking routes** — and a weighted total that sorts the map. Each score
is a plain weighted average of a few satellite and map measurements of that cell's surroundings. No
model is trained, because there is nothing to train it on: Elmina has no tree inventory, no LiDAR
and no field plots, so there are no right answers to learn from. That is a deliberate choice, not a
shortcut — a fitted model would invent confidence we cannot back. What we can defend is that every
number on the map traces back to a measurement in one step, and that the ranking barely moves when
we change the judgement calls inside it.

**What it answers:** "where should a planting team look first?" **What it does not answer:** "how
many trees", "how many degrees cooler", or "is this site better than that one" for two sites a few
ranks apart.

## The three scores

Each score is a weighted average of inputs that have already been put on a 0–100 "more of this
means plant here" scale.

| Score | Input | Weight | Plain meaning |
|---|---|---|---|
| **Cooling** | `lst_mean_250m` | 0.45 | how hot the 250 m neighbourhood is, compared with other candidate sites |
| | `ndvi_mean_250m` | 0.30 | how little greenery is there already (less greenery, higher score) |
| | `built_up_frac_250m` | 0.25 | how built-up it is — a proxy for people who would feel the shade |
| **Connectivity** | `corridor_gap_dist_m` | 0.50 | how close it is to a bare gap in the biodiversity corridor |
| | `dist_to_nearest_park_m` | 0.30 | how close it is to existing habitat, so planting extends it |
| | `in_corridor` | 0.20 | whether the cell is inside the corridor at all |
| **Shade** | `uncovered_path_length_50m` | 0.70 | how much footpath within 50 m has no canopy over it today |
| | `dist_to_path_m` | 0.30 | how close it is to any footpath |

Two transforms turn a measurement into a 0–100 input, and which one applies is a rule, not a
case-by-case choice:

- **Percentile rank** — for temperature, greenness and built-up share. The honest claim is "hotter
  than 90% of candidate sites"; "41.5 °C" is not, because Landsat thermal is about 100 m native.
- **Distance decay** — for metres to a corridor gap, a park or a path: full marks next to it, falling
  smoothly to near zero a few hundred metres away. A site 2 km from the corridor cannot help close
  it, so it scores near zero rather than at its percentile among other far-away sites.

Two extra honesty rules are built in:

- **Gap-filled temperature is discounted.** About 18% of Elmina has no reliable Landsat pixel, and
  those cells were filled from neighbours. Where a cell's temperature is mostly filled, the
  temperature term is pulled back toward the middle, so a guessed pixel cannot by itself win a
  site the top rank. Result: **none of the top 20 sites** rests on mostly gap-filled temperature.
- **No signal is counted twice.** `uncovered_path_length_50m` and `path_length_within_50m` are
  rank-identical in this data (Spearman 1.00), as are `corridor_gap_dist_m` and
  `dist_to_corridor_spine_m`. Using both of a pair would double one input's weight while looking
  like independent evidence, so only one of each is used.

## The default weights, and why

**Cooling 0.45, connectivity 0.30, shade 0.25.** The sliders in the map start here (`GET /weights`),
and any judge or planner can move them and watch the ranking change live.

- **Cooling is highest** because surface temperature is the best-measured of the three benefits:
  it comes from Landsat thermal bands pooled over two years, independent of how well OpenStreetMap
  happens to map Elmina.
- **Connectivity is deliberately below the backend's 0.35 placeholder** because it is the least
  certain input. The corridor is approximate — about 2 km of connecting spine against the stated
  5 km, with one park left unlinked — so we are unwilling to let it drive nearly as much of the
  ranking as heat does.
- **Shade is lowest** not because walkability matters least, but because the input is close to
  binary: 72% of candidate cells have no unshaded footpath within 50 m at all, so the score mostly
  separates "near a path" from "not near a path".

These are stated judgements, not fitted values. That is why the next section measures what happens
when they are wrong.

## What the validation shows

There are no labels, so none of this shows the ranking is **correct**. It shows the ranking is
**consistent** with the features it is built from and **stable** under the choices we had to make.
Full report: [`ml/reports/validation.md`](../ml/reports/validation.md).

| Question | Answer |
|---|---|
| Do the top sites look like the brief's targets? | Top decile vs bottom decile: 42.4 °C vs 39.2 °C, NDVI 0.31 vs 0.44, 26 vs 0 homes within 250 m, 61 m vs 1277 m from a corridor gap, 342 m vs 0 m of unshaded path. Every term points the right way — but partly **true by construction**, since the scores are built from these features. |
| Does the ranking survive moving the sliders? | Sliders nudged around the default: rank correlation **0.99**, **18 of the top 20** unchanged. Any weights at all, including switching a whole score off: median **0.92**, and in the worst draw only **1 of 20** survives. |
| Does it depend on which neighbourhoods are in the sample? | Refitting on 4/5 of the 250 m blocks and scoring the held-out blocks (GroupKFold, so neighbouring cells stay together): **0.997**. |
| Does any single input carry it? | Dropping each of the eight inputs in turn: worst case **0.95** (surrounding temperature), everything else ≥ 0.96. |
| Do the judgement constants matter? | Re-running with decay scales, caps and the gap-fill discount changed: **≥ 0.986** in every case. |
| Does unreliable temperature reach the top? | **0 of the top 20** sites have mostly gap-filled temperature. |
| How much does the *whole* ranking depend on our judgement calls at once? | 2000 Monte Carlo draws over the weights and all four distance/length constants together: median-rank agreement with the single default ranking is **Spearman 0.999**, the #1 site is in the top 20 in 100% of draws, but only **13 of the default top 20** clear an 80%-of-draws "robust" bar. The rest are plausible, not guaranteed — `ml/reports/uncertainty.md` lists which, and why (see below). |

The honest headline: **the shortlist is robust to how we weigh the three benefits, but it is not
robust to deciding that only one of them matters.** If a planner cares purely about habitat
connectivity, they get a substantially different list — and the sliders are there precisely so that
choice is visible instead of hidden inside the model.

A second, specific thing the uncertainty run caught: the sites ranked 15–20 are mostly "boundary"
cases (in the top 20 well under half the time) rather than nearly as solid as ranks 1–9. One of
them, ranked 13 by default, turned out to be fragile for an identifiable reason — its one nearby
unshaded footpath (170 m) happens to sit almost exactly on the length we treat as "enough to earn
full marks," so a slightly different cutoff flips it between rank 12 and rank 49. Its two
neighbours in the list have unshaded paths long enough that no reasonable cutoff would change their
score. That's the kind of thing a single deterministic number hides and a distribution catches.
**Say "top 10, high confidence" and "11–20, good candidates" in the pitch, not one flat list of 20.**

## Limits to state out loud

- **No ground truth.** Nothing here is validated against planted trees, measured temperature or a
  habitat survey. It is a screening tool: it says where to look first, not what will happen.
- **The sites are simulated.** 30 m cells on OpenStreetMap open land, not Sime Darby Property's
  planting list. Swap in the real list and the same scoring runs unchanged.
- **The shortlist is spatially clustered.** The top 20 by score falls in 6 distinct 250 m blocks
  and is entirely corridor-edge cells; the largest single block holds 35% of it. Present the top 20
  as a handful of planting *areas*, not twenty independent sites — or use the diversified version
  (`python -m ml.shortlist`), which caps picks per block and spreads the same shortlist across 10
  blocks for 1 point of average score. That script is a separate presentation artifact; the live map
  still ranks by the uncapped `score_total`, because the weight sliders need that order to retotal
  correctly.
- **Connectivity is skewed by the approximate corridor.** The corridor-gap input is near zero for
  43% of cells and the connectivity score itself for 26%, simply because most candidate land is
  nowhere near the corridor (median distance to a gap: 756 m). That is a property of the data, not
  a modelling choice — the connectivity slider mostly reorders the minority of sites near the
  corridor.
- **Temperature ranks sites, it does not measure them.** About 100 m native resolution, pooled over
  a two-year window. Never quote a site temperature from this map.
- **Canopy is an NDVI proxy, not a tree count.** Independent maps disagree about Elmina's canopy by
  a factor of several (ESA WorldCover ~28%, Dynamic World ~4–7%, our proxy ~10%), and none supports
  a direction of change. The scores use current canopy as a *need* indicator only; they make no
  claim about canopy growth.
- **OpenStreetMap coverage is uneven.** Undeveloped land in the west and buildings in the south-east
  are under-mapped, so `built_up_frac_250m` is a lower bound there and those sites' cooling scores
  are, if anything, too low.

## Is there a prediction for the future?

No, deliberately not — see [judge-qa.md Q18a](judge-qa.md) for the short version. The yearly series
has only five historical points with more noise than signal, so fitting a trend and calling it a
forecast would undercut the honesty this whole write-up is built on. `python -m ml.scenario`
produces something narrower and defensible instead: a labelled **scenario** — if the top-ranked
sites are planted, a plausible canopy trajectory for that planted set, under a named growth-speed
assumption we did not fit to anything (no field data exists), anchored to one real measurement
(canopy already inside Elmina's existing parks, ~15% today, same NDVI definition as everywhere
else). It stays scoped to canopy percentage; it does not translate into temperature or carbon,
because this project has no calibrated relationship to do that honestly. Report:
[`ml/reports/scenario.md`](../ml/reports/scenario.md).

## Reproducing it

```bash
python -m ml.run_scoring                  # writes weights.json, then scores.geojson
python -m backend.validate_scores backend/data/cache/scores.geojson      # must print OK
python -m ml.validation                   # regenerates ml/reports/validation.{json,md}
python -m ml.uncertainty                  # regenerates ml/reports/uncertainty.{json,md} + sites.csv
python -m ml.shortlist                    # a spread-out top 20 for the pitch slide
python -m ml.scenario                     # a labelled planting scenario, not a forecast
python -m pytest ml/tests -q              # 45 tests on the model contract and the sign of every term
```

Scores are stamped with the backend's `data_version`. If the backend rebuilds its data,
`GET /meta` reports `scores_stale: true` and `python -m ml.run_scoring` needs re-running.
