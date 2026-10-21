# Pilot evidence improvements implementation plan

**Goal:** Address the supplied assessment with resident exposure scenarios, conflict screening, and a runnable Earth Engine independent fallback.

**Architecture:** Extend the existing read-only FastAPI service and plain JavaScript Pilot plan. Generate optional spatial artifacts offline; keep browser inputs local. Preserve the existing scoring model and data version.

**Tech stack:** Python, GeoPandas/Shapely, FastAPI, JavaScript modules, Node tests, pytest, existing browser smoke runner.

**Brief and scope:** The user's 70/100 assessment is the specification. They requested repository review before implementation and explicitly excluded team, registration and real-test details. Inventory reviewed: all 268 tracked paths, source interfaces and tests, data schemas, docs, deployment and vendor assets; detailed reads focused on the affected pipeline, API, plan, reach, UI and export contracts. No new website, framework, remote publication or invented evidence.

## Constraints

- Sites stay simulated; corridor stays approximate.
- No field results, user interviews, species suitability or customer commitments may be invented.
- Unknown map/field inputs stay unknown; no flag means no mapped trigger, never safe to plant.
- Exposure is an assumption-based daily unshaded walking-minutes scenario, never measured cooling or health benefit.
- Fallback must construct its own candidates from OSM only, without satellite-derived sites, rasters, scores or Earth Engine imports.
- User's submission details are excluded; name Sime Darby Property's Elmina landscape team as the proposed first customer only.

## Review focus

Missing/stale reports; overlapping reach; negative or nonfinite inputs; map omissions and absent geometry; downloads preserving caveats and provenance.

## Tasks

- [x] Write failing tests for exposure arithmetic, missing values, zero and negative change, input persistence and formula-safe exports. Implement `exposureScenario(reach, settings)` and a small local store in `frontend/js/exposure.js`, then integrate a calculator in the Pilot plan.
- [x] Write failing synthetic geometry tests for road/building/path conflict triggers and missing layers. Implement `backend/conflicts.py`, keyed by the existing sites data version; add an optional endpoint, site-card/Pilot flags, a flagged-sites filter and exported flags. Flags must be distinct from planner-entered checks.
- [x] Write failing tests proving `backend/open_data.py` builds and ranks OSM-only candidates deterministically, excludes road/building footprints, handles unavailable layers, and serves independently of the normal cache. Include source hashes, a method description, no heat/actual-shade scores, and CSV/GeoJSON downloads in the Pilot plan.
- [x] Generate the optional artifacts from committed inputs, update commercial/pilot/evidence/pitch docs and deployment packaging, then run full Python and frontend suites, deep health, and browser smoke with new workflows, desktop/mobile and optional-report failures.

## Execution notes

Implementation was completed directly in the current checkout and initially left reviewable and uncommitted. The user subsequently requested a GitHub push with a descriptive commit message and documentation, authorizing commit and push to the existing branch. Do not estimate a new judging score. Test output and unresolved limits are recorded below.

## Verification and review

- `python -m pytest backend/tests ml/tests -q`: 301 passed.
- `node --test "frontend/tests/*.test.mjs"`: 166 passed.
- `node frontend/tools/smoke.mjs http://127.0.0.1:8765`: 43/43 passed, including accessibility scans, mobile fallback, unknown reports, exports and configured-API navigation.
- `python -m backend.api.selfcheck`: healthy cache, 564 sites, no warnings/problems.
- Both new artifact generators reproduced byte-identical outputs: 136 sites with mapped triggers; 518 independent OSM-only candidates. Existing satellite input/score files are unchanged.
- Independent review found two issues (unverifiable reach and API-origin navigation); both were fixed and follow-up review found no remaining important issue. Mobile min-width overflow and wrong-shape optional artifacts were also fixed with regression checks.
- Docker report packaging was corrected by inspection; Docker CLI is unavailable, so a container build was not run. No deployment, registration, real field study or usability test was performed.
