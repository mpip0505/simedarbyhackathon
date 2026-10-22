# Developer guide

Written for: an engineer or a technical judge who wants to run, rebuild or extend the project. The overview, purpose and user flow are in the [README](../README.md); every limit is in [limitations.md](limitations.md).
The API serves the committed files in `backend/data/cache/`; the web app in `frontend/` is plain HTML, JavaScript and Leaflet with no build step.

## Run it
New: **resident shade-exposure scenarios**, a **siting screen** (mapped roads, buildings and footpaths near a site; not wildlife), and an **OSM-only licence fallback** (a proximity screen on open map data, not a second model). See [methods and demo sequence](assessment-response.md). The fallback opens at `/app/open-data.html`; its candidate rebuild needs no Earth Engine data or credentials.

Needs Python 3.12. The demo runs **offline**: no Earth Engine login and no internet.
```bash
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --port 8000
```
Open http://localhost:8000/ for the web app (map, top sites, sliders, site card, before/after view; the component page is at `/app/styleguide.html`) or
http://localhost:8000/docs for the interactive API. The API serves the committed files in
`backend/data/cache/`; if that folder is incomplete it says so in the log and serves invented mock data
(`GET /meta` reports `data_mode`).

```bash
curl "localhost:8000/sites?limit=3"                                   # top 3 ranked sites (GeoJSON)
curl "localhost:8000/sites?w_cooling=0&w_connectivity=0&w_shade=1"    # re-rank live with different weights
curl localhost:8000/summary                                           # before/after canopy and temperature
curl localhost:8000/health/deep                                       # checks every data file against the contract
```

## How it works
```
 Sentinel-2 (NDVI)  ─┐                          ┌─> composites + rasters ─┐
 Landsat 8/9 (LST)  ─┼─ Google Earth Engine ────┤                         │
                     │   cloud-masked medians   └─> baseline/latest stats ┤
 OpenStreetMap ──────┴─> paths, roads, parks, buildings ──> approximate    ├─> simulated candidate sites
                                                            corridor ──────┘   + measured features
                                                                                     │
                       ML teammate: scores.geojson ──(validated, versioned)──────────┤
                                                                                     v
                                                         FastAPI  ──>  Frontend map and report view
```
1. **Imagery.** Sentinel-2 NDVI and Landsat 8/9 surface temperature, each a per-pixel **median of cloud-masked scenes**
   over two-year windows (baseline 2021-10 to 2023-09, latest 2024-10 to 2026-09). Tropical cloud makes single scenes
   unusable, so pooling dates is the method, and we say so. Go/no-go result: `backend/data/cache/imagery_check.txt`.
2. **Map data.** Paths, roads, parks, open land and buildings from OpenStreetMap, clipped to the Elmina boundary.
3. **Corridor.** An **approximate** Urban Biodiversity Corridor: the 9 largest OSM parks joined along footpaths and
   roads where a sensible route exists. Drop the official polygon at `backend/data/input/corridor_official.geojson`
   to replace it.
4. **Candidate sites.** 30 m grid cells on open land and non-park corridor land, minus buildings and roads, labelled
   `simulated` (564 sites). Each carries about 30 measured features (see the [data dictionary](data-dictionary.md)):
   temperature, vegetation, surroundings, unshaded nearby walking routes, corridor distances, a reliability flag.
5. **Scores.** The ML teammate delivers `scores.geojson` (**done**: `score_source: "ml"`). Before delivery, and for
   any site ML did not score, the API serves a clearly labelled **placeholder** instead; it is never presented as the model.
6. **API.** Ranked sites, one site's detail, a before/after summary, yearly series, map overlays, health checks.

## API
All endpoints are `GET`. Errors are small JSON bodies with a `request_id` (also in the `X-Request-ID` header).

| Endpoint | Returns |
|---|---|
| `/sites?min_score=&limit=&w_cooling=&w_connectivity=&w_shade=` | Ranked GeoJSON FeatureCollection. Any weight re-totals and re-ranks live (weights are normalised). All-zero weights give 422. |
| `/sites/{site_id}` | One site, or 404 |
| `/summary` | Baseline vs latest canopy % and mean temperature, deltas, caveats |
| `/summary/series` | Yearly canopy (with a low/high band) and temperature for an "over time" chart |
| `/layers/corridor` | Approximate corridor polygon |
| `/layers/overlays` and `/layers/overlays/{name}.png` | Before/after NDVI and temperature images with map bounds and a shared colour range |
| `/weights` | Default weights the sliders should start from |
| `/ml/uncertainty` | Per-site rank and score range across ML's 2000-draw Monte Carlo (from `ml/reports/`), plus the robust/boundary thresholds |
| `/ml/shortlist` | ML's spread-out top 20 (at most 3 per 250 m block) for "where to start" |
| `/ml/scenario` | ML's planting-impact scenario: three named growth assumptions, measured ceiling. Not a forecast |
| `/meta` | Data mode, `score_source` (`ml`, `placeholder`, `mock`), `scores_stale`, `scores_error`, data version, build times, attribution, caveats |
| `/health` and `/health/deep` | Liveness; and a full data check (200 sound, 503 otherwise; counts only, details in the server log) |

Field-by-field contract: [docs/data-contract.md](data-contract.md).

## Rebuilding the data
The additions can be rebuilt separately:
```bash
python -m backend.conflicts   # the siting screen: existing site geometries + cached OSM; preserves scores
python -m backend.open_data   # ONLY cached OSM; constructs a separate candidate list
python -m backend.my_sites your_points.csv   # scores your own lat/lon points with the same measurements and model (docs/bring-your-own-sites.md)
```

```bash
python -m backend.build_cache --offline    # corridor, overlays, sites from cached OSM + rasters (no network)
python -m backend.build_cache --skip-gee   # also re-downloads OpenStreetMap
python -m backend.build_cache              # everything, including Earth Engine (about 4 minutes)
```
The full run needs a one-time Earth Engine login and a Cloud project registered for Earth Engine:
```bash
earthengine authenticate
export GEE_PROJECT=<your-project-id>       # PowerShell: $env:GEE_PROJECT = "<your-project-id>"
```
Steps run in order and stop at the first failure: OSM download, OSM layers, corridor, Earth Engine composites and
summary, yearly series, canopy sensitivity, independent cross-check, map overlays, candidate sites.
Builds are deterministic: a full rebuild from a fresh download reproduced the committed data exactly (same
`data_version`, same 564 site IDs, same numbers). Network calls retry transient failures, and
`backend/data/cache/build_info.json` records when OSM and satellite data were really fetched.

## The scoring model (`ml/`)
**Status: delivered.** The brief was [docs/data-dictionary.md](data-dictionary.md) and
[docs/ml-developer-prompt.md](ml-developer-prompt.md); the delivered model, validation and write-up live in
[`ml/`](../ml/), start there (`ml/README.md`) to rerun or extend it. Summary:

- **Scoring code:** [`ml/scoring_model.py`](../ml/scoring_model.py), three 0-100 scores (cooling, connectivity, shade)
  from eight named, transparent inputs; no fitted parameters (there are no labels to fit to).
- **Delivery:** `python -m ml.run_scoring` writes `weights.json` then `scores.geojson` via the interface below;
  `python -m backend.validate_scores backend/data/cache/scores.geojson` confirms it.
  ```python
  from backend.ml_io import load_sites_df, write_scores
  df = load_sites_df()     # one row per site: surroundings, shade, corridor, reliability, block_id, ...
  # compute score_cooling, score_connectivity, score_shade, score_total (0-100) and rank (1 = plant first)
  write_scores(df_scores)  # validates, stamps the data version, writes backend/data/cache/scores.geojson
  ```
- **Validation (no ground truth, so "consistent and stable", never "correct"):** `python -m ml.validation`,
  direction check, weight-stability under random and slider-realistic draws, leave-one-input-out, spatial block
  hold-out, reliability of gap-filled temperature, shortlist concentration, redundant-feature check.
  `python -m ml.uncertainty` goes further: a 2000-draw Monte Carlo over the weights *and* the model's judgement
  constants at once, reporting a score and rank range per site, not one deterministic number. Reports:
  [`ml/reports/`](../ml/reports/).
- **Pitch tools:** `python -m ml.shortlist` produces a spread-out top-20 (capped per 250 m block) for a slide that
  reads as "a few priority areas", separate from the live-ranked map. `python -m ml.scenario` produces a labelled
  planting-impact **scenario** (explicitly not a forecast, the yearly series is too thin and noisy to fit a trend
  through honestly), anchored to canopy measured today inside Elmina's own parks. Plain-language write-up for
  judges/slides: [docs/ml-model.md](ml-model.md).
- Tests: `python -m pytest ml/tests -q`.
- Split train/test by `block_id` (neighbouring cells are correlated). Site IDs are stable across rebuilds.
- **There are no ground-truth labels.** Validation can only check consistency, not that the ranking is right.

## The web app
A working dashboard lives in `frontend/` (plain HTML, JavaScript and Leaflet, no build step, works offline). A sidebar and a top
bar frame three views. **Plant first**: a strip of figures, the map with numbered badges on the top five sites, "What matters most?"
sliders that re-rank live, "Top sites" with a one-sentence reason per site, and a site card that explains the rank. **Before and
after**: the two periods side by side with honest verdicts, an independent-map comparison and year-by-year charts. **Pilot plan**: the planner's
own shortlist, field checks, inspection batches, field-sheet import, phases, resource scenarios, tree records and recorded survival (see below). The look is the
Canopy dashboard system in `css/app.css`, and it can be replaced without touching the logic.
- **From ranking to decisions:** [docs/decision-support.md](decision-support.md). It covers the SDP Avoid–Regenerate–Conserve intervention
  suggestion (site card and Pilot plan), the best-coverage inspection round (+51% footpath, about 3× corridor gap versus the top 10), and
  maintenance-readiness fields per site.
- **Design system:** [docs/design-system.md](design-system.md) (tokens, components, layout, accessibility) and the live
  component page `frontend/styleguide.html` (http://localhost:8000/app/styleguide.html).
- **Designer brief:** [docs/frontend.md](frontend.md) (components, data sources, what must stay).
- **UX direction (what the client should see and do):** [docs/ux-wireframe.md](ux-wireframe.md), the earlier map-first wireframe with the user journey, plain wording and states.
- **API contract it is built on:** [docs/team-handoff.md](team-handoff.md) section 3.
- Reuse `frontend/js/weights.js`, `drivers.js`, `scale.js`, `report-logic.js` and `csv.js` unchanged; they are tested, and
  `weights.js` is checked against the Python backend so slider re-ranking always matches the API.
- **ML evidence in the UI** (shown only when `score_source` is `ml`; each `/ml/*` report carries `stale`): a green tick beside
  steady top-20 sites and a "How steady is this rank?" range on the site card (`/ml/uncertainty`), a **Ranked / Spread out**
  switch on Top sites (`/ml/shortlist`), and a "Looking ahead" scenario chart on Before and after, labelled "Scenario, not a
  forecast" (`/ml/scenario`). Re-run `python -m ml.uncertainty`, `ml.shortlist` and `ml.scenario` after a data rebuild.
- Always show the "simulated sites" label, the caveats and attribution from `/meta`, and a badge when `score_source` is not `ml`.

**Nothing to change now that ML has delivered**: the API contract is identical whether `score_source` is
`placeholder` or `ml` (same fields, same types, always pre-sorted by `rank`); only the values and `score_source`
change. The one visible difference: `/weights` now returns the ML default (0.45 / 0.30 / 0.25) instead of the
backend's config placeholder (0.40 / 0.35 / 0.25), so sliders should start from a slightly different position.

### For the planning team: exports, print and accessibility
- **Download ranked list** (CSV), **Map file for GIS** (GeoJSON, opens in QGIS, ArcGIS or geojson.io) and **Print planting brief** (top 10 sites with
  a one-sentence reason, score steadiness, location, the limits and credits; print or save as PDF). Every export keeps the "simulated" label and the score source.
- **Accessibility:** skip link, keyboard-operable map list and site card, visible focus, high-contrast (forced-colors) support, reduced motion respected,
  colour-blind-safe ramp. The smoke test runs **axe-core (WCAG 2.2 A and AA rules)** on both views and finds no violations. That is an automated scan,
  which catches only part of the problems: say "axe-clean, keyboard-tested", not "WCAG compliant", until someone has also tested with a screen reader.
- **Pilot plan (the step after export).** A third view that turns the shortlist into a work package, all as the planner's own record, saved in this browser only: (1) add sites to a planting plan and record five **field-feasibility checks** per site (land access, utilities, space and soil, maintenance access, existing trees), each Not checked until a person sets it, kept separate from the priority score; (2) give sites a status and an inspection batch, download a **blind field sheet** (place only), and **import the completed sheet** back: every row is checked and a bad file is refused whole, each observation is compared with the model (agree or differ, one visit, not validation), and the planner keeps or rejects the site, with a reason, and can add the next-ranked alternatives; (3) group approved sites into planting phases, enter your own inspections per day, trees per site and costs (nothing is assumed), see the **unique reach** of the shortlist and download a work schedule; (4) once a person marks a site Planted, record each tree and its follow-up inspections: a maintenance schedule and **recorded survival among inspected trees** (a tree with no inspection is never counted as surviving; with no records it says No field data). The tool does not inspect, approve or plant anything and there are no logins or shared records. See [docs/pitch/user-flow.md](pitch/user-flow.md) and [docs/usability-test-protocol.md](usability-test-protocol.md) (a protocol to run, not results).
- **Timed shade walks (fill the exposure baseline).** In the Pilot plan's resident shade-exposure panel: download a blank walk sheet, walk routes with a stopwatch, import the completed sheet and use the pooled share as the *current* shade share (at least 5 walks on 2 routes; scenario and population inputs stay your own). Protocol: [docs/shade-walk-protocol.md](shade-walk-protocol.md). No walks have been done yet; the example file is synthetic.
- **Easier to use:** a 7-step guided tour ("Take the tour"), **Read aloud** on the site card (the browser's own voice, nothing sent anywhere), a **high-contrast** mode, and **Copy link to this view** (slider weights and the selected site are kept in the address, validated when a link is opened).
- **Hosting a live demo:** `Dockerfile` and `render.yaml` serve the app and API from the committed data using only `backend/requirements-serve.txt`
  (FastAPI, Uvicorn, Pydantic). Locally: `docker build -t elmina-canopy .` then `docker run --rm -p 8000:8000 elmina-canopy`. On Render: New, Blueprint, pick this repo.
  The free plan sleeps when idle (first load can take about a minute), so open the link before presenting and keep the recorded video as a fallback.
  The serve-only dependency set was checked in a clean virtual environment; the Docker image itself has not been built here (Docker is not installed on this machine).

## Reliability
- **Offline by design.** The demo needs only the committed cache. The API never imports Earth Engine or OSM libraries
  (a test enforces it).
- **Atomic writes.** Every cache file is written to a temp file and swapped in, so a reader never sees a half-written
  file. (Verified: plain writes produced corrupt reads in a race test; the atomic version produced none.)
- **Graceful degradation.** A bad ML file is ignored; an unreadable file after a good read keeps serving the last good
  copy; an incomplete cache falls back to mock data loudly; unexpected errors return small JSON, not stack traces.
- **Self-check.** The API checks every data file against the contract at startup (logged) and on `/health/deep`
  (pass/fail and counts; reasons in the log).
- **Logging.** One line per request and per fallback decision (`LOG_LEVEL` sets the level).
- **Stale-score detection.** Scores carry the data version they were computed on; `/meta.scores_stale` flags a mismatch.

## Security notes
- **Read-only.** Every endpoint is `GET`. The API serves data derived from public sources; no secrets live in the repo
  (the Earth Engine project ID is an environment variable, `GEE_PROJECT`).
- **Generic public errors.** Responses never contain file paths, exception text or validation details. Clients see
  messages such as "Required data is not available right now" and counts from `/health/deep`; the full reason goes to the
  server log. For local debugging only, set `API_EXPOSE_DETAILS=1` to include the reasons in responses. Never set it on a
  shared or hosted deployment. Treat logs as internal: they contain local file paths.
- **The web app treats API text as data.** It never builds HTML from API values (Leaflet tooltips get DOM nodes, not strings),
  and its `?api=` override only accepts localhost or its own origin. A hostile-API test in a real browser enforces both.
- **No authentication; CORS open by default.** That is deliberate for a localhost demo. For a hosted copy, set `CORS_ORIGINS` to the site's own address
  (a comma-separated list; for example `CORS_ORIGINS=https://your-service.onrender.com`), leave `API_EXPOSE_DETAILS` unset, and keep `/health/deep` internal.
  A public demo with committed, public-source data needs no login; anything holding private data would need authentication and rate limiting first.

## Testing and CI
```bash
python -m pytest backend/tests ml/tests -q # no Earth Engine or network needed
node --test "frontend/tests/*.test.mjs"    # frontend unit tests (Node 22, no dependencies)
node frontend/tools/smoke.mjs              # real Chrome/Edge drives the web app (API must be running)
python tools/project_status.py --check     # the test, check and view counts are measured, not typed: see docs/status.md
(cd frontend && npm install)                # once, to switch on the axe-core accessibility scan inside the smoke test
python -m backend.api.selfcheck            # deep check of the committed data
python -m backend.scripts.qa_plot          # draws docs/qa-map.png: sites, corridor, parks, paths, buildings
```
Current counts of tests, browser checks and views are in [docs/status.md](status.md), generated by `tools/project_status.py` so they cannot drift from the code.
GitHub Actions (`.github/workflows/tests.yml`) runs the backend and scoring-model tests, the frontend unit tests, the data check and the status check on every push and pull request
(the browser test needs Chrome and a running API, so it is run locally). Live Earth Engine steps cannot run in CI;
they are exercised by `python -m backend.build_cache` with your login.

## Repository layout
| Path | What |
|---|---|
| `backend/api/` | FastAPI app, data store, score merge and weights, self-check |
| `backend/gee/` | Earth Engine: imagery check, composites, summary, yearly series, sensitivity, cross-check |
| `backend/osm/` | OpenStreetMap download, clipping into layers, approximate corridor |
| `backend/sites/` | Simulated candidate-site generator and feature extraction |
| `backend/ml_io.py`, `backend/validate_scores.py` | ML hand-off: feature table in, validated scores out |
| `backend/build_cache.py` | One-command rebuild |
| `backend/atomic.py`, `retry.py`, `logging_config.py` | Atomic writes, transient-failure retries, logging |
| `backend/data/cache/` | Generated files the API serves (committed so the demo works offline), including ML's `scores.geojson`, `weights.json` |
| `backend/data/mock/` | Invented placeholder data for development |
| `frontend/` | Web app (sidebar dashboard with three views: Plant first, Before and after, Pilot plan), design-system style guide, Leaflet and fonts bundled, unit tests and a browser smoke test |
| `backend/tests/` | Test suite |
| `docs/` | Data contract, data dictionary, team handoff, ML prompt, design system, frontend brief and wireframe, UX wireframe, pitch fact-check, judge Q&A, pilot-readiness, QA map |

## Validate, review and replan

Pilot plan now freezes original ranks/weights/data, exports attributable blind sheets, previews imports, gates statuses on inspection and human review, tracks replacements and compares equal-size baselines including seeded random selections. Workflow, CSV compatibility and evidence limits: [docs/validate-review-replan.md](validate-review-replan.md). Your intervention, maintenance-readiness and best-coverage features remain available. No real field or independent-user results are claimed.
