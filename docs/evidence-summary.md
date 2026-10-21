# Evidence summary: what we checked, what we did not

Written for: judges and mentors reading the "Team, Evidence and Pitch Quality" criterion, and anyone asking "how do you know?". One page. Every figure comes from a file in this
repository (named in the last column) so it can be re-run. **The short answer: we checked consistency and robustness thoroughly, and we have no ground truth.**

## What we did
| Check | Result | Where |
|---|---|---|
| **Imagery go/no-go** before building anything: are there enough clear satellite looks through tropical cloud? | GO for both periods and both satellites (for example only 27 of 144 Sentinel-2 scenes in the baseline were under 40% cloud, yet every pixel had at least 3 clear looks) | `backend/data/cache/imagery_check.txt` |
| **Canopy threshold sensitivity**: how much does the answer depend on the NDVI cut-off? | a lot: about 18%, 10% and 3% canopy at 0.5, 0.6 and 0.7; year-to-year swing about 5 points. So we rank sites and do not quote a canopy percentage | `backend/data/cache/canopy_sensitivity.json` |
| **Independent cross-check** against two other satellite maps | the maps disagree with each other: ESA WorldCover about 28%, Dynamic World about 7% falling to 4%, ours about 10%. Best average agreement at 0.6 (F1 0.51, against 0.47 at 0.5 and 0.32 at 0.7) | `backend/data/cache/crosscheck.json` |
| **Rank steadiness**: does the top of the list survive plausible changes to weights and judgement constants? | 14 of the top 20 stay in the top 20 in at least 80% of 2,000 settings; rank correlation between baseline and median ranking 0.999 | `ml/reports/uncertainty.md` |
| **Scoring model checks**: direction, weight stability, leave-one-input-out, block hold-out, reliability of the temperature input | see the report (it states that none of this proves the ranking is right) | `ml/reports/validation.md` |
| **Method agreement**: how do simplified versions of published approaches compare with ours? | a heat-only ranking and ours share none of their top 20 sites; equal weights and ours share 18 of 20 | `ml/reports/method_agreement.md` |
| **What the top sites reach**, de-duplicated | the first 50 sites are within 50 m of about 5,400 m of footpath where the satellite sees little tree cover (8% of the township's) and within 250 m of 349 of 968 mapped homes | `ml/reports/impact_reach.md` |
| **Prior art and fact-check** | what other prioritisers do and what is proven; outside claims checked, two softened | `docs/prior-art.md`, `docs/pitch-fact-check.md` |
| **Reproducibility** | a full data rebuild took about 4 minutes and reproduced the committed data exactly; every build carries a data version, and scores computed on older data are flagged | `backend/build_cache.py`, `docs/team-handoff.md` |
| **Automated tests** | 284 backend and ML tests, 121 frontend unit tests, and a 38-check browser test that includes an accessibility scan and a hostile-data security test | `backend/tests`, `ml/tests`, `frontend/tests`, `frontend/tools/smoke.mjs` |

## What we did not do
- **No ground truth.** No tree inventory, LiDAR, drone survey or field plots. Nothing above shows the ranking is correct; it shows it is consistent and stable.
- **No real planting-site list.** The 564 sites are simulated 30 m cells on open land, and every screen says so.
- **No measured benefit.** The reach numbers count what lies near the sites; they are not cooling, health, survival or carbon results.
- **No second township.** Nothing has been run outside Elmina ([commercial-case.md](commercial-case.md) lists what would change).
- **The field check has not been run.** The kit exists and is tested on synthetic answers inside the tests (no real or invented field data is stored here).

## How the field check closes the gap
`python -m backend.scripts.field_sheet` makes a blind sheet (place only, no rank or score) for 15 high-ranked and 15 lower-ranked sites that have a footpath nearby, ready to print
(a blank example is in [field-check/](field-check/)). After one walk, `python -m backend.scripts.import_field_checks <completed sheet>` reports how often the better-ranked half was seen to lack shade,
compared with the worse-ranked half. It flags samples that are too small to read and says plainly that it cannot show the ranking is right. The first thing we would ask
Sime Darby Property for is a few hours of an assistant's time to walk it.
