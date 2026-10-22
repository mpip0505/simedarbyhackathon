# From ranking to decisions: intervention review, best-coverage rounds, maintenance readiness

Three additions that turn "where to look first" into decisions SDP can act on. Each one answers a question the ranking alone could not:

1. **What does this place actually need?** Protect, regenerate, plant for shade, or inspect first, in SDP's Avoid–Regenerate–Conserve terms.
2. **Which combination is best for the capacity we have?** A constraint-aware inspection round, compared side by side with the plain top-k.
3. **Who keeps the trees alive?** Six establishment and maintenance fields per site, all unknown until someone records them.

All numbers below come from the committed Elmina data (`data_version f12bc98c3fbd`, 564 simulated candidate sites) and the default weights.
They are screening numbers, not outcomes.

## 1. Intervention review (Avoid, Regenerate, Conserve)

Code: `frontend/js/intervention.js`. Shown in the site card ("What might this place need?") and editable per site in the Pilot plan.

The screen suggests one intervention per site from measured proxies. The first matching rule wins:

| Rule | Suggestion | SDP principle | Who must confirm |
|---|---|---|---|
| Ground heat mostly filled in from neighbours (`lst_valid_frac` < 0.5) | Inspect before deciding | Avoid | a field visit |
| Satellite greenness at or above the canopy threshold (`ndvi_mean` ≥ 0.6) | Protect existing vegetation | Conserve | an ecologist |
| Flagged within 50 m of a corridor gap | Regenerate habitat | Regenerate | an ecologist |
| Footpath with little tree cover within 50 m | Plant for pedestrian shade | Regenerate | the landscape team |
| None of the above | Inspect before deciding | Avoid | a field visit |

Other rules a site also meets are listed as well, so a planner can see when a place could serve two purposes.

**What it shows on Elmina:**

| | Protect | Regenerate | Plant for shade | Inspect |
|---|---|---|---|---|
| All 564 sites | 75 | 81 | 66 | 342 |
| Top 10 | 0 | 10 | 0 | 0 |
| Top 50 | 1 | 45 | 2 | 2 |

The model's top sites are almost all **corridor-gap restoration** candidates (Regenerate), not street planting. The screen also finds **75 sites where satellite already sees dense greenery**. Those should be checked before anything is planted there, because planting could disturb what already exists.

**Guard-rails.** The satellite proxy cannot tell tree maturity, native species or habitat quality. So the suggestion is labelled "Suggestion, not reviewed", the planner chooses the intervention themselves, and Protect or Regenerate raises a warning until a named reviewer and date are recorded. A site marked for planting while its chosen intervention is Protect is flagged as well. The chosen intervention, the reviewer and the screening suggestion are all in the plan CSV.

## 2. Best combination for your inspection capacity

Code: `frontend/js/optimizer.js`. Shown at the top of Pilot plan, step 1.

The top 10 scores sit side by side in one corridor-edge strip, so they reach much of the same footpath, homes and corridor gap. The optimizer is a greedy marginal-reach selector: it repeatedly picks the site that adds the most **not yet reached** footpath, homes or gap. It chooses only from the 100 highest-priority sites and leaves out sites the planner rejected. It reuses the per-site reach sets in `ml/reports/reach_sets.json`, so every footpath sample, home and gap sample is counted once. The ranking itself does not change.

**10 sites, all three objectives weighted equally:**

| Way to choose | Footpath with little tree cover | Mapped homes | Corridor gap | Average score |
|---|---|---|---|---|
| Ranked: top 10 | 2,120 m | 242 | 350 m | 86.2 |
| Spread out (≤ 3 per 250 m block) | 2,280 m | 242 | 410 m | 85.6 |
| **Best coverage** | **3,210 m (+51%)** | **262 (+8%)** | **1,030 m (+194%)** | 80.0 |

**25 sites, equally weighted:** footpath 3,230 m → 5,350 m (+66%), homes 243 → 407 (+67%), corridor gap 580 m → 1,450 m (+150%), and the average score drops from 84.0 to 75.8.

The planner can also optimise for one target alone. For 10 sites:

| Single target | Ranked top 10 | Best coverage |
|---|---|---|
| Footpath only | 2,120 m | 4,250 m (2.0×) |
| Homes only | 242 | 413 (1.7×) |
| Corridor gap only | 350 m | 1,050 m (3.0×) |

The trade-off is stated openly: the round gives up some average priority score to reach more distinct places. One button adds the chosen sites to the plan as *Needs inspection*, in batch "Coverage round".

**Guard-rails.** "Best" holds only against this proxy objective. Reach counts what lies near the sites, not shade delivered, survival or habitat value. For coverage objectives like this one, greedy selection is guaranteed to get within about 63% of the best possible set and is usually much closer. Nothing here is called environmentally optimal. If the reach data is stale or missing, no combination is offered.

## 3. Establishment and maintenance readiness

Code: `readiness()` in `frontend/js/plan.js`. Shown per site in the Pilot plan.

| Field | Starts as | Comes from |
|---|---|---|
| Species | Awaiting ecologist selection | planner entry |
| Soil and drainage | Not checked | the existing field check |
| Watering availability | Unknown | planner entry |
| Maintenance responsibility | Unassigned | planner entry |
| Establishment inspections | To be set by planner | planner entry |
| Survival observation | No field data | recorded tree inspections only |

No survival percentage is estimated. Most urban tree deaths happen in the early years after planting, so these records are what a real pilot would measure. A site marked Approved or Planted with no named maintainer is flagged. All six fields are in the plan CSV.

## Tests

- `frontend/tests/intervention-optimizer.test.mjs`: unit tests covering rule order, missing data, reviewer warnings, readiness unknowns, greedy correctness on a small hand-checked case, exclusions, stale data, spread-out and the CSV columns.
- `frontend/tools/smoke.mjs`: one browser check that drives the site card, the optimizer table and button, the intervention review and the readiness fields.

## Next, if selected for the Top 10

- Have an ecologist validate the intervention rules. Replace the NDVI-only "Protect" trigger with verified observations.
- Add real resource constraints to the optimizer (inspection days per area, budget per site type).
- Collect actual planting and survival records through the existing tree register.
- Build route-gap analysis between homes, schools, parks and transit, and run the OSM-only pipeline on a second township.
