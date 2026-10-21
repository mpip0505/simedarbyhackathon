# Commercial case: who it is for, what it costs to repeat, and where it could scale

Written for: the pitch writers (the Commercial and Value Multiplication criterion) and any Sime Darby Property reader who asks "what would it take to use this
beyond Elmina?". **Everything marked (hypothesis) is our expectation, not a finding.** There is no revenue figure, cost saving or price here, because nothing in
our data or research supports one. Developer targets are quoted from [pitch-fact-check.md](pitch-fact-check.md) and attributed to the developer.

## The one-paragraph case
Sime Darby Property states it plans to plant very large numbers of trees across its townships (a stated target of 50,000 endangered trees by 2030, a 5 km corridor in City of
Elmina, and per its own press material several ecological corridors). Deciding **where to plant first** is repeated every season and, as far as we found, there is no
published method for doing it at planting-site scale in a cloudy tropical township. This tool gives the planting and sustainability teams an explained, re-runnable shortlist from
free data. The value multiplies because the same pipeline and the same screens can be re-run for another township or another question, **after a defined amount of adaptation work (below)**.

## Who it is for (hypothesis, to be confirmed with Sime Darby Property mentors)
**Proposed first customer: Sime Darby Property's City of Elmina landscape operations team**, with its sustainability team as reporting partner. Offer a bounded pilot: real sites and GIS, a sampled field inspection, comparison with the current shortlisting process, and records of time, feasibility, route shade and survival. This is a prospect, not a paying customer or agreed pilot; a named contact, budget owner and interview are still missing.

| Role | What they do today (assumed) | What the tool changes | What we do not know |
|---|---|---|---|
| Landscape and planting team | choose planting sites by site knowledge and schedule | an explained, ranked shortlist with adjustable priorities; GIS and print exports | how sites are chosen now, and how long it takes |
| Sustainability and reporting team | report planting and biodiversity progress | a documented method and honest limits that supports reporting | which reports, and what evidence they require |
| Township management | decide where to pilot, and communicate with residents | a way to compare options and show reasons | budget ownership |
| Residents and walkers | use footpaths and parks | the shade score targets unshaded footpaths | nothing until trees are planted and survive |

## Where else the same pipeline could be used (hypotheses, each needs extra data)
1. **More townships.** Same free data and pipeline, see "What repeating it needs".
2. **Shade and walkability.** The shade score and the footpath reach numbers already point at unshaded walking routes; the developer's own material mentions a 90 km walking and cycling track in Elmina.
3. **Corridor monitoring.** Re-running each season tracks corridor gaps against an official corridor outline (we use an approximation).
4. **Maintenance and survival checks.** The same ranked list can drive where to inspect first after planting. This needs field survival data we do not have.
5. **Other cooling or shade assets** (for example, where to place shaded seating or planting around schools). Not built, not evaluated.

## What repeating it for another township needs
Measured on Elmina: the full data rebuild (`python -m backend.build_cache`) took about 4 minutes and reproduced the committed data exactly. **That is compute time, not adaptation time.**
An audit of the code (22 October 2026) found Elmina is built in at these points, so another township is **not** a one-line change:
| Where | What is Elmina-specific | What to change |
|---|---|---|
| `backend/config.py` | `ELMINA_BBOX` (also used by `gee/composites.py`, `gee/imagery_check.py`, `osm/fetch_api.py`, `osm/from_pbf.py`) and the cache folder `CACHE_DIR` | make the area and output folder settings; keep Elmina as the default |
| `backend/osm/extract.py` | the OpenStreetMap place name used to fetch the boundary | take a place name or a boundary file |
| `backend/sites/generate.py` | site IDs start with `ELM-` | use a township prefix |
| `backend/config.py` caveats and `docs/` | the cross-check sentence quotes Elmina's numbers (28%, 7% to 4%, 10%) | regenerate the cross-check and rewrite the sentence per township |
| `backend/osm/corridor.py` | the corridor is built from OpenStreetMap parks; it is an approximation | use the official corridor polygon if the developer supplies one (already supported as `backend/data/input/corridor_official.geojson`) |
| frontend copy | headline and labels name City of Elmina | make the township name a setting |
Our estimate, not measured: **about one to two days of careful engineering plus a test run** for the first additional township, then much less for each after, because the
OpenStreetMap fetch and the cloud-masked composites are the same. The free map-data service we used was unreliable on busy days, so allow retries. **This has not been run on any other township.**

## Cost drivers (what money and people would go into)
- **People:** a developer to adapt and maintain it, and someone from the planting team to use it and own the field checks. This is the main cost.
- **Field checks:** a sample of plots (the first thing we would ask for) and survival counts after planting.
- **Imagery and map data:** free (Sentinel-2, Landsat, OpenStreetMap) at the volumes used here.
- **Hosting:** a free tier is enough for a demo (`render.yaml`); production would need access control and an audit trail (see [pilot-readiness.md](pilot-readiness.md)).

## The licensing point, stated openly
Our Google Earth Engine registration is **noncommercial**, and says no payment is received for the work. A paid pilot or internal commercial use by a company changes that:
Google's current commercial terms would need to be checked and a commercial plan taken, **or** the imagery step moved to an open-data pipeline (Sentinel-2 and Landsat are both
free to download from their providers). Replacing the full satellite method would require rewriting `backend/gee/` and re-checking results; that replacement is not built. A reduced **OSM-only fallback is now runnable** (`python -m backend.open_data`, `/app/open-data.html`): it constructs candidates and ranks footpath/park proximity without any Earth Engine artifact or credential. It has no heat or actual-shade measurement. See [assessment-response.md](assessment-response.md) for its method, hashes, downloads and the remaining licensing distinction.

## Business-model hypotheses, and what would test them
| Hypothesis | Test |
|---|---|
| A sustainability or landscape budget funds an internal tool | ask the mentors who owns that budget and how decisions are made today |
| Re-running each season is cheaper than an ad hoc process | compare our time per shortlist with their current process (we do not know theirs) |
| Other townships would use the same method | run the adaptation above on one more township and see what breaks |
| The ranking points at real shade gaps | the field check in [pilot-readiness.md](pilot-readiness.md) |

## What we are not claiming
No revenue, price, cost saving, carbon or health figure. No claim that another township works without adaptation. No claim that the ranking is correct (there is no ground truth).
Reach numbers ([ml/reports/impact_reach.md](../ml/reports/impact_reach.md)) show what lies near the sites, not a benefit.
