# Elmina Canopy Prioritiser: backend

A geospatial screening tool that ranks where to plant trees first in **City of Elmina (Selangor)** and shows a
before/after view of vegetation and surface temperature. Built for the Sime Darby Property *Township of Tomorrow*
hackathon (Planet / biodiversity track).

This repository is the **backend**: satellite and map data in, a small tested API out, plus a **web app** in
`frontend/` that proves the API end to end. The scoring model (ML) and the final interface design are built by teammates
against the API and data contract described here.

**ML status: delivered.** `score_source` in `/meta` is `ml`. The scoring code, validation and the plain-language
write-up live in [`ml/`](ml/) and [docs/ml-model.md](docs/ml-model.md) — see [For the ML teammate](#for-the-ml-teammate)
below for the rest of the trail.

> **Status: pilot of the method on real Elmina data** — not yet a pilot of real planting. The pipeline, corridor and
> scoring run end to end on real satellite and map data for a real township; that is what has been piloted. It ranks
> where to look first. It is **not** a tree count, a carbon figure or disclosure-grade evidence. The candidate sites
> are **simulated** (we do not have Sime Darby Property's real planting list) — piloting *real planting* needs that
> list plus field plots, both scoped in [pilot-readiness.md](docs/pilot-readiness.md). Read
> [Limitations](#limitations-read-this-before-quoting-any-number) before quoting any number.

## Contents
[Quick start](#quick-start) · [How it works](#how-it-works) · [API](#api) · [Rebuilding the data](#rebuilding-the-data) ·
[For the ML teammate](#for-the-ml-teammate) · [Web app and the designer](#web-app-and-the-designer) ·
[Reliability](#reliability) · [Testing and CI](#testing-and-ci) · [Repository layout](#repository-layout) ·
[Limitations](#limitations-read-this-before-quoting-any-number) · [Data credits](#data-credits)

## Quick start
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
   `simulated` (564 sites). Each carries about 30 measured features (see the [data dictionary](docs/data-dictionary.md)):
   temperature, vegetation, surroundings, unshaded nearby walking routes, corridor distances, a reliability flag.
5. **Scores.** The ML teammate delivers `scores.geojson` (**done** — `score_source: "ml"`). Before delivery, and for
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

Field-by-field contract: [docs/data-contract.md](docs/data-contract.md).

## Rebuilding the data
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

## For the ML teammate
**Status: delivered.** The brief was [docs/data-dictionary.md](docs/data-dictionary.md) and
[docs/ml-developer-prompt.md](docs/ml-developer-prompt.md); the delivered model, validation and write-up live in
[`ml/`](ml/) — start there (`ml/README.md`) to rerun or extend it. Summary:

- **Scoring code:** [`ml/scoring_model.py`](ml/scoring_model.py) — three 0-100 scores (cooling, connectivity, shade)
  from eight named, transparent inputs; no fitted parameters (there are no labels to fit to).
- **Delivery:** `python -m ml.run_scoring` writes `weights.json` then `scores.geojson` via the interface below;
  `python -m backend.validate_scores backend/data/cache/scores.geojson` confirms it.
  ```python
  from backend.ml_io import load_sites_df, write_scores
  df = load_sites_df()     # one row per site: surroundings, shade, corridor, reliability, block_id, ...
  # compute score_cooling, score_connectivity, score_shade, score_total (0-100) and rank (1 = plant first)
  write_scores(df_scores)  # validates, stamps the data version, writes backend/data/cache/scores.geojson
  ```
- **Validation (no ground truth, so "consistent and stable", never "correct"):** `python -m ml.validation` —
  direction check, weight-stability under random and slider-realistic draws, leave-one-input-out, spatial block
  hold-out, reliability of gap-filled temperature, shortlist concentration, redundant-feature check.
  `python -m ml.uncertainty` goes further: a 2000-draw Monte Carlo over the weights *and* the model's judgement
  constants at once, reporting a score and rank range per site, not one deterministic number. Reports:
  [`ml/reports/`](ml/reports/).
- **Pitch tools:** `python -m ml.shortlist` produces a spread-out top-20 (capped per 250 m block) for a slide that
  reads as "a few priority areas", separate from the live-ranked map. `python -m ml.scenario` produces a labelled
  planting-impact **scenario** (explicitly not a forecast — the yearly series is too thin and noisy to fit a trend
  through honestly), anchored to canopy measured today inside Elmina's own parks. Plain-language write-up for
  judges/slides: [docs/ml-model.md](docs/ml-model.md).
- 45 tests: `python -m pytest ml/tests -q`.
- Split train/test by `block_id` (neighbouring cells are correlated). Site IDs are stable across rebuilds.
- **There are no ground-truth labels.** Validation can only check consistency, not that the ranking is right.

## Web app and the designer
A working dashboard lives in `frontend/` (plain HTML, JavaScript and Leaflet, no build step, works offline). A sidebar and a top
bar frame two views. **Plant first**: a strip of figures, the map with numbered badges on the top five sites, "What matters most?"
sliders that re-rank live, "Top sites" with a one-sentence reason per site, and a site card that explains the rank. **Before and
after**: the two periods side by side with honest verdicts, an independent-map comparison and year-by-year charts. The look is the
Canopy dashboard system in `css/app.css`, and it can be replaced without touching the logic.
- **Design system:** [docs/design-system.md](docs/design-system.md) (tokens, components, layout, accessibility) and the live
  component page `frontend/styleguide.html` (http://localhost:8000/app/styleguide.html).
- **Designer brief:** [docs/frontend.md](docs/frontend.md) (components, data sources, what must stay).
- **UX direction (what the client should see and do):** [docs/ux-wireframe.md](docs/ux-wireframe.md), the earlier map-first wireframe with the user journey, plain wording and states.
- **API contract it is built on:** [docs/team-handoff.md](docs/team-handoff.md) section 3.
- Reuse `frontend/js/weights.js`, `drivers.js`, `scale.js`, `report-logic.js` and `csv.js` unchanged; they are tested, and
  `weights.js` is checked against the Python backend so slider re-ranking always matches the API.
- **ML evidence in the UI** (shown only when `score_source` is `ml`; each `/ml/*` report carries `stale`): a green tick beside
  steady top-20 sites and a "How steady is this rank?" range on the site card (`/ml/uncertainty`), a **Ranked / Spread out**
  switch on Top sites (`/ml/shortlist`), and a "Looking ahead" scenario chart on Before and after, labelled "Scenario, not a
  forecast" (`/ml/scenario`). Re-run `python -m ml.uncertainty`, `ml.shortlist` and `ml.scenario` after a data rebuild.
- Always show the "simulated sites" label, the caveats and attribution from `/meta`, and a badge when `score_source` is not `ml`.

**Nothing to change now that ML has delivered** — the API contract is identical whether `score_source` is
`placeholder` or `ml` (same fields, same types, always pre-sorted by `rank`); only the values and `score_source`
change. The one visible difference: `/weights` now returns the ML default (0.45 / 0.30 / 0.25) instead of the
backend's config placeholder (0.40 / 0.35 / 0.25), so sliders should start from a slightly different position.

### For the planning team: exports, print and accessibility
- **Download ranked list** (CSV), **Map file for GIS** (GeoJSON, opens in QGIS, ArcGIS or geojson.io) and **Print planting brief** (top 10 sites with
  a one-sentence reason, score steadiness, location, the limits and credits; print or save as PDF). Every export keeps the "simulated" label and the score source.
- **Accessibility:** skip link, keyboard-operable map list and site card, visible focus, high-contrast (forced-colors) support, reduced motion respected,
  colour-blind-safe ramp. The smoke test runs **axe-core (WCAG 2.2 A and AA rules)** on both views and finds no violations. That is an automated scan,
  which catches only part of the problems: say "axe-clean, keyboard-tested", not "WCAG compliant", until someone has also tested with a screen reader.
- **Pilot plan (the step after export).** A third view that turns the shortlist into a work package, all as the planner's own record, saved in this browser only: (1) add sites to a planting plan and record five **field-feasibility checks** per site (land access, utilities, space and soil, maintenance access, existing trees), each Not checked until a person sets it, kept separate from the priority score; (2) give sites a status and an inspection batch, download a **blind field sheet** (place only), and **import the completed sheet** back: every row is checked and a bad file is refused whole, each observation is compared with the model (agree or differ, one visit, not validation), and the planner keeps or rejects the site, with a reason, and can add the next-ranked alternatives; (3) group approved sites into planting phases, enter your own inspections per day, trees per site and costs (nothing is assumed), see the **unique reach** of the shortlist and download a work schedule; (4) once a person marks a site Planted, record each tree and its follow-up inspections: a maintenance schedule and **recorded survival among inspected trees** (a tree with no inspection is never counted as surviving; with no records it says No field data). The tool does not inspect, approve or plant anything and there are no logins or shared records. See [docs/pitch/user-flow.md](docs/pitch/user-flow.md) and [docs/usability-test-protocol.md](docs/usability-test-protocol.md) (a protocol to run, not results).
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
- **No authentication, CORS open to all origins.** That is deliberate for a localhost demo. If this were ever hosted:
  put it behind authentication, restrict CORS origins, add rate limiting and keep `/health/deep` internal.

## Testing and CI
```bash
python -m pytest backend/tests -q          # 201 tests, no Earth Engine or network needed
node --test "frontend/tests/*.test.mjs"    # 157 frontend unit tests (Node 22, no dependencies)
node frontend/tools/smoke.mjs              # real Chrome/Edge drives the web app, 39 checks (API must be running)
(cd frontend && npm install)                # once, to switch on the axe-core accessibility scan inside the smoke test
python -m backend.api.selfcheck            # deep check of the committed data
python -m backend.scripts.qa_plot          # draws docs/qa-map.png: sites, corridor, parks, paths, buildings
```
GitHub Actions (`.github/workflows/tests.yml`) runs the backend tests, the frontend unit tests and the data check on every push and pull request
(the workflow only runs once pushed to GitHub; it has not been run yet). Live Earth Engine steps cannot run in CI;
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
| `frontend/` | Web app (sidebar dashboard: map, top sites, sliders, site card, before/after), design-system style guide, Leaflet and fonts bundled, unit tests and a browser smoke test |
| `backend/tests/` | Test suite |
| `docs/` | Data contract, data dictionary, team handoff, ML prompt, design system, frontend brief and wireframe, UX wireframe, pitch fact-check, judge Q&A, pilot-readiness, QA map |

## Limitations (read this before quoting any number)
- **Simulated sites.** 30 m cells on OSM open land, not a real planting list. OSM tags little undeveloped land in the
  west of Elmina, so the map under-represents it.
- **Approximate corridor.** About 2 km of connecting spine against the stated 5 km, and one park (north-west) left
  unlinked. Connectivity features inherit this.
- **Tropical cloud.** Median composites over two-year windows; they can blur short-lived change.
- **Coarse thermal.** Landsat surface temperature is about 100 m native. Use it to rank sites, not to quote
  temperatures. About 18% of the area has no reliable pixel and is filled from neighbours within 100 m for site scoring.
- **Canopy is a proxy**, NDVI >= 0.6, not a tree count. It moves about 5 points between single years and depends
  strongly on the threshold (about 18%, 10% and 3% at 0.5, 0.6 and 0.7), so the baseline-to-latest change is within
  noise: **read it as "no detectable change", not as growth.**
- **Independent maps disagree about canopy.** ESA WorldCover (2021) maps about 28% of Elmina as tree cover; Google
  Dynamic World about 7% (baseline window) falling to about 4% (latest); our proxy says about 10%. So canopy % is
  uncertain by a factor of several, and none of the references supports a direction of change. NDVI 0.6 gives the best
  average agreement of the three thresholds tried (F1 0.51, against 0.47 at 0.5 and 0.32 at 0.7). Both references are
  satellite-derived, not field truth. Details: `backend/data/cache/crosscheck.json`.
- **No ground truth.** No tree inventory, LiDAR or field plots exist for this project.
- **Scores.** Delivered (`score_source: "ml"`); the ranking is validated for consistency and stability, not
  correctness — there is no ground truth, see [docs/ml-model.md](docs/ml-model.md). Any site ML did not score keeps
  the labelled placeholder.
- **Not disclosure-grade.** What a real pilot would need: [docs/pilot-readiness.md](docs/pilot-readiness.md).
- **Outside facts in the pitch.** Checked in [docs/pitch-fact-check.md](docs/pitch-fact-check.md); several need softer wording
  (the "5% planted" figure is contradicted by the same source). Hard questions with honest answers: [docs/judge-qa.md](docs/judge-qa.md).
- **Pitch package.** Deck outline on the template's slides and the official Mechanism and Enabler structure, a 5-minute video script and a submission checklist: [docs/pitch/](docs/pitch/). Theme fit: [docs/theme-fit.md](docs/theme-fit.md). Self-grade against the official rubric: [docs/grading-self-assessment.md](docs/grading-self-assessment.md).
- **Evidence and field check.** What we checked and did not ([docs/evidence-summary.md](docs/evidence-summary.md)); a blind field sheet for a first walk (`python -m backend.scripts.field_sheet`, then `python -m backend.scripts.import_field_checks`). No field data has been collected yet.
- **Footpath greenness layer.** `python -m backend.shade_paths` cuts OpenStreetMap footpaths into pieces of about 50 m and labels each by satellite greenness in thirds relative to the township's paths (served at `/layers/paths/shade`, toggle "Footpath greenness (satellite)"). It is a proxy, not a shade survey: about 95% of footpath samples fall below our tree-cover threshold at 10 m, which is why the layer is relative.
- **Commercial case.** Who it is for, what repeating it for another township needs (an audit of what is Elmina-specific), the Earth Engine licensing point and labelled hypotheses, with no invented figures: [docs/commercial-case.md](docs/commercial-case.md).
- **Other canopy prioritisers.** What Tree Equity Score, i-Tree Landscape, Boston's Right Place Right Tree and others do, what is and is not proven, and where this project fits: [docs/prior-art.md](docs/prior-art.md). `python -m ml.impact_reach` counts what the top sites reach (unshaded footpath, mapped homes, corridor gaps; reach, not outcome; report in `ml/reports/impact_reach.md`, served at `/ml/impact`). `python -m ml.tradeoff` shows what the first 20 and 50 sites reach when chosen five ways (a trade-off, not a league table; `ml/reports/tradeoff.md`, served at `/ml/tradeoff`). `python -m ml.method_agreement` compares our ranking with simplified stand-ins of those approaches (report in `ml/reports/method_agreement.md`).

## Data credits
Map data (c) OpenStreetMap contributors (ODbL). Contains modified Copernicus Sentinel-2 data (European Space Agency).
Landsat 8/9 Collection 2 Level-2 data courtesy of the U.S. Geological Survey. ESA WorldCover and Google Dynamic World
used for the cross-check. Processed with Google Earth Engine (noncommercial use).
