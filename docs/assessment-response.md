# Response to the 70/100 assessment

The supplied assessment is the working baseline, not a predicted judging score. These changes address software gaps. Real field outcomes, usability results, registration and team details have not been supplied; the user asked to skip those submission details.

| Assessment gap | Now available | Evidence still needed |
|---|---|---|
| Resident shade exposure | Pilot plan step 3: unshaded person-minutes per day from unique building reach and explicit population, walking and shade assumptions; CSV includes assumptions and horizon | Timed shade walks, route-use counts and occupancy data; repeat comparable visits after planting |
| Siting screen (formerly called conflict screening) | Road/building proximity and footpath-overlap triggers on site cards and Pilot plan; siting-flag-only filter; CSV and GeoJSON exports | Utilities, wires, sight lines, actual setbacks, soil, access and species/root requirements |
| Earth Engine dependency | OSM-only candidate generator, independent endpoint and page, source hashes, CSV/GeoJSON | Full satellite workflow's commercial eligibility and terms remain a separate decision |
| First customer | Proposed first customer: Sime Darby Property's Elmina landscape operations team; sustainability team as reporting partner | Named individual, budget owner, interview and pilot agreement; no customer commitment exists |
| Headline cost/tree numbers | Existing planner-entered capacity, trees/site and costs | Actual layout and quotations; no local rate or one-tree-per-cell assumption is inserted |

## Resident exposure calculation

Location: **Pilot plan → 3 Plan the work → Resident shade exposure: scenario**. Uses the active shortlist, rejected sites excluded:

`daily unshaded person-minutes = unique mapped residential buildings × assumed residents per building × daily walker share × route minutes per walker × (1 − shaded share of walking time)`

Calculate with the current and scenario shade shares, holding population and walking time constant. The difference can be zero or negative. Every input starts empty; a source/basis and a time horizon are required. Inputs stay on this device in a separate browser key. CSV preserves assumptions, horizon and caveats.

The source records **buildings, not households**; apartments and missing OSM buildings prevent a measured population count. Near a site does not establish route use. Shade fractions refer to walking time in shade, not NDVI canopy fractions. This is neither a forecast nor a measured benefit and cannot establish cooling or health effects. Missing/stale reach or missing site coverage prevents calculation.

To collect evidence later, record route, date/time, weather, walking duration and shaded minutes; label resident/proxy participants and retain raw notes. Compare comparable visits. No such visits are claimed here.

## Siting screen

What it flags: **mapped roads, buildings and footpaths near a candidate site**, for tree-fall, clearance and access review. It is **not** a wildlife-conflict assessment: no forest-edge layer is mapped, and that would need an ecologist. (It was first called a "conflict" screen; that word suggests wildlife, so every user-visible label now says siting screen. The module, file and endpoint names `conflicts` are unchanged.)

Build: `python -m backend.conflicts`; API: `GET /screening/conflicts`.

Distances use UTM metres from the **candidate polygon edge**. Review triggers: within 15 m of a road centre line, within 10 m of a building, or any footpath intersection. These are prototype choices, not legal setbacks. A 30 m cell does not specify the tree's final position.

States: `review` (mapped trigger), `unknown` (map layer unavailable), `no-trigger` (no trigger in the available map). No state means safe to plant. Human field checks remain independent and start Not checked. Scores/ranks stay unchanged. Missing/stale reports show unknown. Site version and OSM SHA-256 hashes detect changed inputs. Exports retain caveats.

## Runnable OSM-only fallback

Build: `python -m backend.open_data`. Reads **only** five OSM layers: open land, parks, roads, buildings and paths. It constructs its own simulated 30 m cells; it does not load satellite-derived candidates, the cached corridor, rasters, scores or Earth Engine credentials.

It excludes parks and road/building buffers, then discards full cells touching those exclusions. Buffers of 8 m from road centre lines and 3 m from buildings are inherited prototype choices, not legal requirements. Unmapped water or obstacles still need inspection.

Rank = 60% footpath proximity + 40% park proximity. Each uses `100 / (1 + distance / scale)` with scales of 50 m and 250 m respectively. Ties break by site ID. This is a proximity ranking; heat, canopy, actual shade and species suitability are unknown.

Open **`/app/open-data.html`**, linked from Pilot plan and the API error screen. This page and `GET /screening/open-data` work without the normal satellite sites, summary or scores. It shows the first ten candidates, an offline map, method and freshness status, and downloads the full list. Changed source hashes show stale; missing source files make freshness unknown. Downloads retain status and provenance. Invalid/missing source layers stop rebuilds and preserve the previous artifact.

OpenStreetMap's [copyright and licence page](https://www.openstreetmap.org/copyright) describes ODbL obligations. Google's [Earth Engine access documentation](https://developers.google.com/earth-engine/guides/access) distinguishes commercial/noncommercial registration. The OSM-only path removes the Earth Engine compute dependency for this reduced use case; it does not settle the satellite path's commercial eligibility.

## Demo sequence

1. Plant first: enable **Show sites with a siting flag only**, open a site and explain why a high score still needs inspection.
2. Pilot plan: shortlist sites, retain the independent field checks, then enter sourced exposure assumptions in step 3. State the horizon and that this is a scenario.
3. Download the exposure and siting-screen CSVs. Open the OSM-only page and show its independent method and provenance.
4. Ask for an Elmina landscape-team pilot with real sites, GIS, timed walks and a named budget owner. No field result, customer sale or increased judging score is claimed.

## Verification and maintenance

Run from the repository root:

```bash
python -m pytest backend/tests ml/tests -q
node --test "frontend/tests/*.test.mjs"
python -m backend.api.selfcheck
```

For browser checks, start the API (`python -m uvicorn backend.api.main:app --port 8765`) and run:

```bash
node frontend/tools/smoke.mjs http://127.0.0.1:8765
```

Verified for this change **on 2026-10-22** (a dated record; current counts are in [status.md](status.md)): **301 Python tests, 166 frontend tests and 43 browser checks passed**. Browser coverage includes desktop/mobile layout, accessibility scans, exports, saved exposure inputs, missing/unverifiable reports, and API-origin preservation when navigating to the fallback. Both artifact generators reproduced identical output from the committed inputs: 136 mapped-trigger sites and 518 independent OSM-only candidates.

Rebuild the siting-screen report after changing satellite-site geometries or OSM layers; rebuild the fallback after changing OSM layers. Both commands also run at the end of `backend.build_cache`. The Docker image now includes `ml/reports`, which supplies reach data; container packaging was inspected, but no Docker build was run because the CLI was unavailable. These checks establish software behavior, not field effectiveness.
