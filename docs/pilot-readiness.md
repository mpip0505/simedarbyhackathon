# From method pilot to township-wide rollout: what Sime Darby Property would need

Written for: the pitch writers, and anyone from Sime Darby Property who asks "could we use this?".
Honest short answer: **this is a screening tool, piloted on real Elmina data.** There are two different things that
word "pilot" could mean here, and they are at very different stages:
- **Pilot of the method** — done. The pipeline, corridor model and scoring ran end to end on real satellite imagery
  and real map data for a real township, not a toy example.
- **Pilot of real planting** — not yet. That needs Sime Darby Property's actual site list and some field validation,
  both scoped below. Until then it is not something to base a climate disclosure or a planting contract on.

## What exists today
- A repeatable pipeline: free Sentinel-2 and Landsat imagery in Google Earth Engine, OpenStreetMap paths/roads/parks,
  one command to rebuild (`python -m backend.build_cache`), tests, and a small API that serves ranked sites, a
  before/after summary and map layers.
- Site-level features for 564 **simulated** candidate cells: temperature, vegetation, surroundings, nearby walking
  routes without shade, distance to an **approximate** corridor, and a data-reliability flag per site.
- Checks that guard the numbers: an imagery go/no-go, a canopy-threshold sensitivity run, an independent comparison
  with ESA WorldCover and Dynamic World (see `backend/data/cache/crosscheck.json`), and a data version on every build.

## What it is not (say this before a judge does)
- Not Sime Darby Property's planting list: sites are simulated 30 m cells on OSM open land.
- Not the official corridor: it is built from OSM parks (about 2 km of spine against the stated 5 km).
- Not a tree count or carbon figure: canopy is a vegetation-index proxy, and it moves about 5 points between years.
- Not validated against ground truth: nobody on the team has field plots, a tree inventory or LiDAR.
- Temperature is for ranking, not quoting (Landsat thermal is about 100 m native; about 18% of the area is gap-filled).

## What piloting real planting would need, and what each changes in the backend
| Need | Why it matters | Backend change |
|---|---|---|
| **Their real planting-site list** (polygons or points, ideally with species and ERT flag) | The whole value is ranking *their* remaining sites, not our simulated ones | `--sites-file`: score a supplied list with the same features instead of generating cells; keep their IDs; drop the "simulated" label |
| **Ground truth** (tree inventory, field plots, drone or LiDAR canopy height) for a sample of Elmina | Without it we can only show our proxy agrees with other satellite maps, not that it is right. Needed to choose the canopy threshold defensibly | A calibration step: fit and report error of the proxy against the sample; replace the fixed NDVI threshold |
| **Official corridor polygon and precinct boundaries**, their own path/road GIS | Connectivity scoring currently inherits our approximation | Drop the polygon at `backend/data/input/corridor_official.geojson` (already supported); swap OSM paths for their layer |
| **A seasonal rerun** that someone owns | "Re-score every season at near-zero cost" is the core claim; it needs scheduling, not a laptop | Scheduled job (cloud or on-prem), results archive, per-build data version (already stamped), failure alerts |
| **Earth Engine licensing** | Our registration is *noncommercial* and says no payment is received for the work. A paid pilot or an internal commercial use changes that | Move to a commercial Earth Engine plan, or replace Earth Engine with a Sentinel Hub / open-data pipeline |
| **Hosting, access control, audit trail** | A real user needs a stable URL, logins, and a record of which data version produced which number | Deploy behind authentication; keep the request and build logs the API already writes; store each build immutably |
| **Methodology review by their sustainability and assurance people** | Disclosure-grade numbers need a reviewed method, uncertainty ranges and sign-off | Publish the method and its sensitivity (largely written: README, data dictionary, `canopy_sensitivity.json`); add uncertainty bands to every reported figure |
| **Planting realities we do not model** | Soil, species suitability, irrigation, land ownership, construction schedule (some "brownfield" in OSM may be about to be built on), cost per site | Extra layers and a feasibility filter before ranking; a site-status field they maintain |

## How a real pilot would measure benefit (what we would measure, not what we have)
Today the project measures **reach** (what lies near the sites), not **benefit**. [ml/reports/impact_reach.md](../ml/reports/impact_reach.md) gives the starting point
from our own data (simulated sites, ML default ranking, every footpath point, home and gap counted once). A pilot on real planting turns that into evidence:

| What to measure | Baseline today (our data) | How a pilot would measure it | When |
|---|---|---|---|
| Footpath with little tree cover near planted sites | about 65,900 m township-wide (latest greenness below 0.6); the first 50 sites are within 50 m of about 5,400 m of it | re-run the same count on new imagery, and walk a sample of those paths to check shade on the ground | each season; field check at 6 and 12 months |
| Planted-tree survival | none (no planting data) | count live and dead trees at the planted sites at 6, 12 and 24 months, including after any maintenance guarantee ends | 6, 12, 24 months |
| Tree cover at the planted sites | the sites' own baseline canopy proxy (a vegetation-index estimate, not a tree count) | a field or drone sample of canopy at a set of planted and unplanted sites | 12 and 24 months |
| Whether the ranking points at real shade gaps | none (no ground truth) | a field sheet for top and bottom ranked sites (`backend/scripts/field_sheet.py`, planned) compared with the ranking | before planting |
| Corridor gaps closed | about 1,650 m of approximate corridor below the gap greenness threshold; the first 50 sites are within 50 m of about 1,150 m of it | re-count gaps on new imagery against the official corridor polygon | each season |

No targets are set here, because nothing in our data supports a number; the developer's own targets (for example 50,000 endangered trees by 2030) are theirs to set against.

## What we would honestly say to the judges
1. We piloted the method end to end on real free data for a real township, and we know exactly where it is weak.
2. The ranking is useful for *where to look first*; the before/after view is a demonstration, not a measurement of
   growth (the change we detect is smaller than year-to-year noise).
3. Piloting real planting is small and concrete from here: their site list plus one afternoon of field plots turns
   a screening tool into something they can test against their own records.

## Questions only Sime Darby Property can answer
- Is there a site list or planting schedule (polygons, species, status) that could be shared for a pilot?
- Is there any tree inventory, LiDAR or drone survey of Elmina?
- Which disclosure or internal report would use these numbers, and what level of evidence does it require?
- Where must the data and the service live (their cloud, ours, on-premise)?

## What the app now supports for a pilot (and what it still needs)
New since the 70/100 assessment: siting-screen triggers (mapped roads, buildings and footpaths; not wildlife) are visible independently of the five human field checks; step 3 adds an explicit-assumption resident shade-exposure scenario; and an OSM-only fallback supports reduced screening without Earth Engine. Methods, commands and evidence gaps are in [assessment-response.md](assessment-response.md). No field outcome or species match is claimed.

The **Pilot plan** view lets a planner run the loop with their own entries: shortlist, five field checks per site, inspection batches, a blind field sheet out and the completed sheet back (compared with the model, then keep or reject with a reason and next-ranked replacements), phases from the planner's own capacity and costs, the unique reach of the shortlist, a work schedule, tree records and recorded survival among inspected trees.
What it deliberately does not do: inspect, verify or approve anything; share records between people (browser storage on one device); keep an authenticated shared audit trail; manage logins; recommend species; or estimate costs from assumed local rates. A real pilot would add shared, audited storage first, then the developer's own site list and species guidance. A protocol for a first usability test is in [usability-test-protocol.md](usability-test-protocol.md); no results exist yet.

## Reproducible review loop

The local prototype now preserves a frozen original ranking, attributable CSV previews/import archives, evidence-gated statuses, durable issue/rejection eligibility, linked replacements and seeded baseline comparisons. See [validate-review-replan.md](validate-review-replan.md). Its local event history is editable and is not a shared authenticated audit trail. Human fieldwork, independent sessions, authorised suitability decisions and subsequent planting outcomes remain outstanding.
