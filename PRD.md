# PRD: Elmina Canopy Prioritiser

Written for: the whole team (Backend, ML, Frontend and design, pitch writers) and mentors. It says what we are building,
for whom, what "done" means and what we will not claim. Detail lives in the linked docs; this file points to them
instead of repeating them.

| | |
|---|---|
| Product | A screening tool that ranks where to plant trees first in **City of Elmina (Selangor)** and shows a before/after view of vegetation and surface temperature |
| Event and track | Sime Darby Property "Township of Tomorrow" hackathon, **Planet (biodiversity)** |
| Version | 1.0, draft for team review. 21 October 2026, repository at commit `5c7e570` |
| Status | Working prototype. Imagery, candidate sites, API and web app are built and tested. **The ML scoring model is not delivered**, so the app shows labelled placeholder scores |
| Not in the repo | Submission date and demo format, who owns what, the pitch deck. See [section 12](#12-open-questions) |

## Contents
[1 Summary](#1-summary) · [2 Background and problem](#2-background-and-problem) · [3 Goals, non-goals, success](#3-goals-non-goals-and-success-criteria) ·
[4 Users and who pays](#4-users-stories-and-who-pays) · [5 The solution](#5-the-solution-mechanism) · [6 Requirements](#6-requirements) ·
[7 Technology and data](#7-technology-and-data-enabler) · [8 What we have measured](#8-what-we-have-measured) · [9 Risks](#9-risks) ·
[10 Plan and status](#10-plan-and-status) · [11 Pitch alignment](#11-pitch-alignment) · [12 Open questions](#12-open-questions) ·
[Appendix A: differences from the brief](#appendix-a-differences-from-the-original-brief) · [Appendix B: glossary and docs](#appendix-b-glossary-and-document-map)

## 1. Summary
Sime Darby Property's stated goal is 210,000 trees at completion in City of Elmina, about 10% of them endangered, rare or
threatened (ERT) species. Even on the highest tree count in the developer's own material (over 41,000), most of that goal is
still ahead, and the order in which sites get planted is a choice.

The **Canopy Prioritiser** scores every candidate planting site on three things and ranks them:
1. **Heat relief** (cooling benefit): hot, sparsely vegetated surroundings score higher. Landsat surface temperature and Sentinel-2 vegetation index.
2. **Links green areas** (habitat connectivity): sites that close gaps along the Urban Biodiversity Corridor score higher.
3. **Shade for walkers** (shade on walking routes): sites beside footpaths that have little or no tree cover score higher.

Users see the ranking on a map, move three sliders to ask "what if?", open a site card that explains each rank, and switch to a
before/after view that says honestly what the satellite data can and cannot show.

**Positioning in one line:** a screening and monitoring tool for deciding where to look first, built on free data and
re-runnable every season. It is **not** a tree count, a carbon figure or disclosure-grade evidence ([section 6.3](#63-product-guardrails-honesty-rules)).

## 2. Background and problem

### 2.1 Facts we rely on
All six were checked against public sources on 21 October 2026 in [docs/pitch-fact-check.md](docs/pitch-fact-check.md). Re-read each
source before a fact goes on a slide.

| # | Fact | Status | Wording to use |
|---|---|---|---|
| 1 | Goal of 210,000 trees, about 10% (21,000) endangered, rare or threatened | Confirmed with caveat. Source is sponsored partner content for Sime Darby Property in The Star, which says "ERT" in one place and "IUCN trees" in another | "Sime Darby Property's stated goal is 210,000 trees at completion, about 10% of them endangered, rare or threatened species." Attribute it to the developer |
| 2 | Trees planted so far | **Conflicting.** The same page gives 10,266 (a 2022 survey) and "over 41,000". Neither is dated. The brief's "roughly 5%" is not supported | **Not used anywhere.** Ask Sime Darby Property for the current count |
| 3 | A 5 km Urban Biodiversity Corridor linking six park precincts inside the 300-acre Central Park | Confirmed with caveat: described as planned, still in design | "A planned 5 km corridor connecting six park precincts" |
| 4 | Net zero by 2050 and a 40% cut in Scope 1 and 2 emissions by 2030 | Confirmed (company press release, 27 November 2023) | As stated. Scope 3 is not part of the 2030 target |
| 5 | Urban forest conservation as a sequestration lever | Confirmed with caveat. The release names nature-based solutions, urban biodiversity corridors and forest conservation. No sequestration figures found | "Names nature-based solutions, including urban biodiversity corridors, as part of its route to net zero." Never quote tonnes of carbon |
| 6 | Bursa Main Market climate disclosure | **Needs wording care.** Earlier sources say TCFD-aligned for financial years ending on or after 31 December 2025. Bursa's December 2024 amendments moved to IFRS S2-based disclosure, phased by issuer group, and sources disagree on the dates. Bursa's own text was not retrieved | "Bursa requires climate-related disclosures aligned with IFRS S2, which builds on TCFD, phased in by issuer group." Check the rule text and Sime Darby Property's group before quoting a date |

### 2.2 The problem
Planting capacity (seedlings, crews, budget, time) is finite and the backlog is large, so the *order* of planting matters.
Our premise: a tree planted where it is hot and bare, where the green corridor has a gap, and where people walk does more
for heat, habitat and people than the same tree elsewhere. We have no field evidence for that premise in Elmina. The tool
turns it into a repeatable, adjustable calculation on satellite and map data.

A second pressure: listed developers are expected to make climate-related disclosures, and nature-based actions are hard
to evidence consistently. A documented method for tracking vegetation and heat over time helps with *monitoring*. Our own
cross-check shows it is not yet strong enough to *report* ([section 8](#8-what-we-have-measured)).

Two things we **do not know** and must not assume ([section 12](#12-open-questions)): how Sime Darby Property's landscape
team sequences planting today, and whether they want a ranking tool in this form.

### 2.3 Why it is feasible in two weeks
- Sentinel-2 and Landsat 8/9 are free and revisit Elmina regularly. Tropical cloud blocks most single scenes, but pooled
  two-year composites give enough clear looks. The go/no-go result is **GO** ([section 8](#8-what-we-have-measured)).
- OpenStreetMap supplies paths, roads, parks and buildings.
- Google Earth Engine does the heavy processing. A full rebuild takes about 4 minutes.

## 3. Goals, non-goals and success criteria

### 3.1 Goals
| ID | Goal |
|---|---|
| G1 | Produce a ranked planting order for candidate sites in Elmina on three explainable criteria |
| G2 | Make every rank explainable in one sentence, and let the user change what matters |
| G3 | Show change over time in a before/after view that states what the data supports |
| G4 | Be honest by design: simulated sites, approximate corridor, ranking-grade temperature and uncertain canopy are visible on screen |
| G5 | Be repeatable: free data, one command to rebuild, a demo that runs offline |
| G6 | Support the pitch: a clear **Mechanism** (the solution and its value) and **Enabler** (how technology makes it work at township scale) |

### 3.2 Non-goals
- A tree count, a carbon or sequestration figure, or disclosure-grade evidence.
- Species choice, ERT planting lists, soil, irrigation, land ownership, cost or construction schedule. Biodiversity enters
  only through corridor connectivity and vegetation context.
- Sime Darby Property's real planting list or official corridor. We do not have them, so sites are **simulated**, the
  corridor is **approximate**, and both are labelled.
- Hardware, drone or LiDAR data, paid data, or any non-free imagery.
- Claiming that trees were planted, that tree cover increased, or that planting caused any change we show.
- Logins, multiple users, write access, or a hosted production deployment (localhost demo only).
- Other townships (a possible next step, [section 7.4](#74-scaling-to-a-township-and-beyond)).

### 3.3 Success criteria
**Hackathon-ready (must be true on demo day)**

| # | Criterion | Status |
|---|---|---|
| 1 | ML scores merged: `/meta` shows `score_source: "ml"`, `scores_error: null`, `scores_stale: false` | **Not met** |
| 2 | Weight-stability and consistency validation written up, stating plainly that there are no ground-truth labels | **Not met** |
| 3 | Opening screen passes the 10-second test: someone who has never seen it can say where the first sites are, and that they are examples | Not yet tested with people |
| 4 | Demo runs offline from a fresh clone with the two commands in the README | Designed for. Confirm on the demo machine |
| 5 | The honesty labels (simulated, preview scores, limits, credits) are always on screen, no banned phrase appears, and each canopy or temperature number carries its caveat | Labels and banned phrases: met in automated tests (88 frontend tests pass). Caveat pairing: checked by review, not by a test |
| 6 | Every outside claim in the pitch traces to `docs/pitch-fact-check.md` or a committed data file | Fact-check and judge Q&A drafted. Deck not in the repo |

**Pilot hypotheses (after the hackathon; no targets set, to be agreed with Sime Darby Property)**
- How closely the tool's top sites match the landscape team's own priorities.
- Error of the canopy proxy against field plots, after calibration.
- Effort for their team to run a seasonal re-score without us.

## 4. Users, stories and who pays

### 4.1 Users
| User | Need | Basis |
|---|---|---|
| Landscape and township planning team at Sime Darby Property (primary) | Decide where the next plantings go, and explain why | Hypothesis. No interviews done |
| Sustainability and reporting team (secondary) | Track vegetation and heat over time with a documented method and honest uncertainty | Hypothesis |
| Hackathon judges (the audience that decides now) | Grasp the idea fast, see it work, probe its limits | Known: criteria in [section 11](#11-pitch-alignment) |

### 4.2 User stories and acceptance criteria
| ID | Story | Acceptance criteria |
|---|---|---|
| U1 | As a planner, I want to see where to plant first on a map | On open, the top five sites are numbered 1 to 5 on the map. Each row of the Top sites list gives a one-sentence reason |
| U2 | I want to change what matters (heat, links, shade) and see the order change | Moving a slider re-ranks list and map. A note says how many of the top 10 changed. Reset restores the default. Browser re-ranking equals the API's for the same weights (checked against a Python-generated test fixture) |
| U3 | I want to know why a site ranks where it does | Site card: one-sentence reason, three score bars, "Why it ranks here" in four bullets, the numbers (collapsed), and a caution that temperature ranks sites and is not an exact reading |
| U4 | As an analyst, I want to see whether greenness and ground heat changed, and how sure we are | Headline says "not detectably" when the change is within noise. Two linked maps share one colour scale. The independent-map comparison is one click away |
| U5 | I want to take the ranked list away | CSV download keeps the `source` (simulated) and `score_source` columns |
| U6 | As a team member, I want to rebuild all data with one command and spot drift | Deterministic rebuild. Every build carries a `data_version`. `/meta` flags `scores_stale` when scores were computed on older data |
| U7 | As a judge, I want the limits stated before I ask | The honesty bar is always visible. "Limits of this data" and "Data credits" are one click away |

### 4.3 Who pays, and why (business viability)
- **Payer (hypothesis, not a fact):** Sime Darby Property's sustainability and landscape budgets. Check with a mentor.
- **Value:** better-placed planting and a repeatable, documented monitoring method. It is not a direct cost saving, and we have
  **not** quantified the benefit of better placement.
- **Cost to run:** imagery and basemap data are free, so a re-run costs little. The real costs are people, field validation,
  hosting and, for commercial use, a different Earth Engine licence (ours is noncommercial).
- **Route to adoption:** a small pilot with their real site list, the official corridor polygon and a set of field plots
  ([docs/pilot-readiness.md](docs/pilot-readiness.md)).
- **Pricing:** not decided. Do not state a number.

### 4.4 Assumptions not yet tested
1. Heat, corridor connectivity and walking shade are the criteria a landscape team would choose. They come from the brief, not from user research.
2. A satellite-derived, ranking-grade signal tracks real cooling or habitat benefit. We have no ground truth to check it.
3. Sime Darby Property would share a site list, a corridor polygon and field data for a pilot.
4. Today's planting sequence leaves room for a better one. We do not know how it is decided.

## 5. The solution (Mechanism)

### 5.1 How it works
1. Build cloud-masked median composites of Sentinel-2 NDVI and Landsat 8/9 surface temperature for a **baseline** (2021-10 to 2023-09) and a **latest** (2024-10 to 2026-09) window.
2. Pull paths, roads, parks, open land and buildings from OpenStreetMap. Build an approximate corridor from the nine largest parks.
3. Generate 564 **simulated** candidate sites: 30 m cells on open land and non-park corridor land, minus buildings and roads.
4. Measure about 30 features per site: temperature, vegetation, surroundings, unshaded nearby path, corridor distances, data reliability.
5. Score each site on the three criteria, combine with adjustable weights, and rank.
6. Serve it through a read-only API and show it in a map-first web app with a before/after view.

### 5.2 The three criteria
Suggested starting features (the ML owner may change them; every column is in [docs/data-dictionary.md](docs/data-dictionary.md)).

| Criterion (label on screen) | Question | Suggested features | Higher score means |
|---|---|---|---|
| Cooling benefit ("Heat relief") | Where would new canopy cool the most? | `lst_mean_250m`, `ndvi_mean_250m`, `built_up_frac_250m` | Hotter, less vegetated, more built-up surroundings |
| Habitat connectivity ("Links green areas") | Which sites close gaps in the corridor? | `corridor_gap_dist_m`, `in_corridor` | Closer to a gap. A gap is a point on the corridor spine where NDVI is below 0.5 |
| Shade on walking routes ("Shade for walkers") | Where is a walked path unshaded? | `uncovered_path_length_50m`, `path_length_within_50m` | More nearby footpath with no canopy over it |

Only footpaths are scored: OpenStreetMap has no cycleways in Elmina.

### 5.3 Score, weights and rank
- Each component is 0 to 100. `score_total` is their weighted average. Weights are normalised, so the sliders express a share of the total.
- **Default weights are the ML owner's decision**, written to `weights.json`. Until then the placeholder uses 0.40 cooling, 0.35 connectivity, 0.25 shade. That is not the model.
- `rank` is a unique integer, 1 = plant first, consistent with the total. Ties are broken by `site_id`.
- A judge must be able to follow the scoring in one sentence. Prefer transparent percentile-rank scores to a black box ([docs/ml-developer-prompt.md](docs/ml-developer-prompt.md)).

### 5.4 What the user sees
Two views. Full UX in [docs/ux-wireframe.md](docs/ux-wireframe.md); build notes in [docs/frontend.md](docs/frontend.md).
- **Plant first.** The map is the screen: offline basemap, approximate green corridor, example sites coloured by priority, the top five numbered. Beside the map: "What matters most?" (three sliders) and "Top sites" (five rows at a time, reason per row, filters, search, download). A site card opens as a panel on the left of the map. Layer switches cover greenness and ground heat from the satellite.
- **Before and after.** A plain headline computed from the data (today: "Has tree cover changed? Not detectably so far."), two linked maps for the two periods, a greenness / ground heat switch, three cards (tree-cover estimate, ground heat, "How sure are we?"), then year-by-year numbers and the independent-map comparison.

### 5.5 If time runs short
The placeholder-scored app is already a working demo. If ML slips, ship it with the amber "Preview scores: ML model not
connected yet" chip and say so on stage. Cut in this order: plotted charts, compare-two-sites, shareable link, print view.
Never cut the honesty features or the ML validation write-up.

## 6. Requirements
Priority: **Must**, **Should**, **Could**. Status: Done, Partial, Open.

### 6.1 Functional requirements

**Data and candidate sites**

| ID | Requirement | Priority | Status | Where |
|---|---|---|---|---|
| D-1 | Confirm usable Sentinel-2 and Landsat 8/9 scenes over Elmina for both periods (go/no-go) | Must | Done: GO | `backend/data/cache/imagery_check.txt` |
| D-2 | Cloud-masked multi-date median composites: NDVI from Sentinel-2, surface temperature from Landsat 8/9, for baseline and latest | Must | Done | `backend/gee/composites.py` |
| D-3 | Baseline and latest canopy proxy with threshold sensitivity (NDVI 0.5, 0.6, 0.7) and a yearly series with a low to high band | Must | Done | `canopy_sensitivity.json`, `series.json` |
| D-4 | Independent canopy cross-check against ESA WorldCover and Google Dynamic World | Should | Done | `backend/gee/crosscheck.py`, `crosscheck.json` |
| D-5 | OpenStreetMap layers (paths, roads, parks, open land, buildings) clipped to the Elmina boundary | Must | Done | `backend/osm/` |
| D-6 | Approximate Urban Biodiversity Corridor, replaceable by an official polygon dropped in as a file | Must | Partial: about 2 km of spine against the stated 5 km, one park unlinked | `backend/osm/corridor.py` |
| D-7 | Simulated candidate sites (30 m cells), every one labelled `simulated`, with stable IDs | Must | Done: 564 sites | `backend/sites/generate.py` |
| D-8 | About 30 measured features per site, including a reliability flag and a spatial `block_id` | Must | Done | `docs/data-dictionary.md` |
| D-9 | One-command deterministic rebuild with a data-version stamp | Should | Done | `backend/build_cache.py` |
| D-10 | Score a user-supplied site list instead of simulated cells (`--sites-file`) | Could (pilot) | **Open: not built** | `docs/pilot-readiness.md` |

**Scoring (ML)**

| ID | Requirement | Priority | Status | Where |
|---|---|---|---|---|
| M-1 | Three component scores, 0 to 100: cooling, connectivity, shade | Must | **Open** (placeholder only) | Placeholder in `backend/api/scoring.py` |
| M-2 | A combined total with adjustable weights, default chosen and justified, written to `weights.json` | Must | **Open** (placeholder 0.40 / 0.35 / 0.25) | |
| M-3 | A unique integer rank that agrees with the total | Must | **Open** (API ranks the placeholder) | |
| M-4 | Validation that fits having no labels: direction check, weight stability (random weight sets: rank correlation, top-20 overlap, rank range per site), leave-one-feature-group-out, split by `block_id`, with and without low-reliability sites (`lst_valid_frac` below 0.5) | Must | **Open** | `docs/ml-developer-prompt.md` |
| M-5 | A plain-language explanation of the scoring for the pitch | Must | **Open** | |
| M-6 | Delivery through `write_scores`: validated, stamped with the data version, and a bad file can never break the API | Must | Done | `backend/ml_io.py`, `backend/validate_scores.py` |

**API**

| ID | Requirement | Priority | Status | Where |
|---|---|---|---|---|
| A-1 | Read-only endpoints: ranked sites, one site, summary, yearly series, overlays, corridor, OSM layers, cross-check, weights, meta, health | Must | Done | `backend/api/main.py`, [docs/data-contract.md](docs/data-contract.md) |
| A-2 | Live re-weighting with `?w_cooling=&w_connectivity=&w_shade=` | Must | Done | `backend/api/scoring.py` |
| A-3 | Merge ML scores by `site_id`, report `score_source` and `scores_stale`, fall back to a labelled placeholder | Must | Done | `backend/api/store.py`, `scoring.py` |
| A-4 | Startup self-check and `/health/deep`. Public errors carry no paths or exception text | Should | Done | `backend/api/selfcheck.py` |
| A-5 | Offline operation: no Earth Engine or OpenStreetMap call at runtime | Must | Done | `backend/tests/test_api_extras.py` |

**Web app**

| ID | Requirement | Priority | Status | Where |
|---|---|---|---|---|
| W-1 | "Plant first" map: sites coloured by score, top five numbered, approximate corridor, offline basemap | Must | Done | `frontend/js/map.js` |
| W-2 | "What matters most?" sliders that re-rank live, with a note on how many of the top 10 changed, and Reset | Must | Done | `frontend/js/weights.js`, `sliders.js` |
| W-3 | Top sites list: one-sentence reason per row, filters (all, open land, corridor edge), search, "See all" | Must | Done | `frontend/js/list.js`, `drivers.js` |
| W-4 | Site card: reason, three score bars, "Why it ranks here", numbers, temperature caution | Must | Done | `frontend/js/panel.js` |
| W-5 | Map layers: sites, corridor, map detail, greenness, ground heat, optional street map | Should | Done | `frontend/index.html` |
| W-6 | CSV download keeping `source` and `score_source` | Should | Done | `frontend/js/csv.js` |
| W-7 | "Before and after" view: headline verdict, two synced maps on one colour scale, metric switch, three cards, year-by-year table, independent-map comparison | Must | Done | `frontend/js/report.js`, `report-logic.js` |
| W-8 | Honesty bar, limits sheet, data credits, and chips for simulated sites and score source, always available | Must | Done | `frontend/index.html` |
| W-9 | States: loading, no match, service unreachable, example data, preview scores, rejected or stale score file | Must | Done | `frontend/js/main.js`, `frontend/index.html` |
| W-10 | Small-screen layout (the sidebar becomes a strip, panels stack under the map) | Should | Partial: checked at 1440, 1100 and 390px in Chromium only; `frontend/tools/smoke.mjs` is updated but has not been run against this layout | `frontend/css/app.css` |
| W-11 | Final visual design pass that keeps the honesty elements | Should | Done: the Canopy dashboard system is installed (tokens, components, sidebar layout) with a live style guide; honesty elements kept and tested | [docs/design-system.md](docs/design-system.md), `frontend/styleguide.html` |
| W-12 | Plotted charts for the yearly series | Could | Partial: bar charts with ranges and hover are done (`frontend/js/charts.js`); plotted lines are not | `frontend/js/charts.js` |
| W-13 | Compare two sites, shareable selection link, print view | Could | Open | [docs/ux-wireframe.md](docs/ux-wireframe.md) |

**Pitch**

| ID | Requirement | Priority | Status | Where |
|---|---|---|---|---|
| P-1 | Deck with Mechanism, Enabler and a "limits" slide | Must | **Open**: not in the repo | |
| P-2 | Fact-check of outside claims | Must | Done | [docs/pitch-fact-check.md](docs/pitch-fact-check.md) |
| P-3 | Judge Q&A | Should | Drafted. Answers 4, 18 and 21 wait for ML | [docs/judge-qa.md](docs/judge-qa.md) |
| P-4 | Demo script, plus a fallback if the live demo breaks (for example a recording) | Must | **Open** | |

### 6.2 Non-functional requirements
| Area | Requirement | Status |
|---|---|---|
| Honesty | The rules in [6.3](#63-product-guardrails-honesty-rules) hold on every screen, enforced by tests | Done for UI copy |
| Offline | The demo needs only the committed cache: no Earth Engine, no internet. A test enforces that the API never imports Earth Engine or OpenStreetMap libraries | Done |
| Reproducibility | A full rebuild from a fresh download reproduces the committed data (same `data_version`, same 564 site IDs), as reported in the README | Done |
| Reliability | Atomic cache writes. A bad scores file is ignored and reported in `/meta`. An incomplete cache falls back to mock data loudly | Done |
| Security | Read-only GET API. No secrets in the repo (`GEE_PROJECT` is an environment variable). Generic public errors. The web app never builds HTML from API text, and `?api=` accepts only localhost or its own origin. No login and open CORS are acceptable for a localhost demo only | Done. Hosting would need authentication, restricted CORS and rate limits |
| Accessibility | Plain-language labels, bundled Geist font (Atkinson Hyperlegible as fallback), colourblind-safe colour ramp, text contrast of 4.5:1 or better (ratios in [docs/design-system.md](docs/design-system.md)), keyboard-selectable list and chart bars, status messages announced | Done. No audit with assistive technology |
| Performance | Re-ranking on a slider move feels instant for 564 sites | Not measured |
| Compatibility | Checked at 1440x900 and a phone width in headless Chrome only | Partial. Test the demo machine and browser |
| Licensing | OpenStreetMap (ODbL) attribution and Sentinel-2 and Landsat credits shown. Leaflet and the font are bundled with their licences. Earth Engine use is registered as noncommercial | Done. The noncommercial limit matters for a pilot |
| Quality | Frontend: 88 unit tests (pass), plus a browser smoke test (updated for the dashboard layout, not yet re-run). Backend: 194 tests as reported in the README (run `python -m pytest backend/tests -q` to confirm). A GitHub Actions workflow exists but has not run yet | Partial |
| Environment | Python 3.12 for the API. Node 22 for tests only. A full rebuild needs an Earth Engine login and a `GEE_PROJECT` | |

### 6.3 Product guardrails (honesty rules)
These are product requirements, not style. The UI-copy rules are enforced by `frontend/tests/copy.test.mjs`.
1. Wherever sites appear, say they are **simulated** ("Example sites (simulated)").
2. While scores are placeholders, say so ("Preview scores: ML model not connected yet"). The warning clears only when `/meta` reports `score_source: "ml"`.
3. Temperature ranks sites. Never present it as an exact reading, and never show a per-site temperature change.
4. Canopy is a proxy. Show it as a range next to the independent-map comparison, and word the change as "No detectable change" unless the data supports more.
5. Label the corridor as approximate, and temperature overlays as gap-filled and ranking-grade.
6. Show the data credits and the limits list from `/meta`.
7. Banned in UI copy: "reportable", "defensible", "accurate", "validated", "canopy increased / growth / gain", "carbon sequestered", "heat islands doubled", "our recommended sites", the 10,266 figure and "5% planted".
8. In the pitch, say "supports prioritisation and monitoring" and "site-level screening scores". "Supports reporting" is the most we may claim.

## 7. Technology and data (Enabler)

### 7.1 Architecture
```
Sentinel-2 + Landsat 8/9 + OpenStreetMap
        |  Google Earth Engine + Python (one command, about 4 minutes)
        v
composites, baseline/latest stats, overlays, approximate corridor
        |
        v
564 simulated sites x about 30 measured features  --->  ML scoring  --->  scores.geojson
        |                                              (NOT DELIVERED)          |
        v                                                                       v
FastAPI, read-only: ranked sites, summary, layers  <--- merged by site_id (labelled placeholder until then)
        |
        v
Web app: "Plant first" map + "Before and after"   (plain HTML, JavaScript and Leaflet, no build step)
```

### 7.2 Data sources
| Source | Used for | Notes |
|---|---|---|
| Sentinel-2 (Copernicus, via Earth Engine) | NDVI: greenness and the canopy proxy | 10 m. Cloud Score+ mask (`cs_cdf` at least 0.6) |
| Landsat 8/9 Collection 2 Level-2 (USGS, via Earth Engine) | Land surface temperature: heat | About 100 m native thermal. `QA_PIXEL` cloud and shadow mask. About 18% of the area has no reliable pixel |
| OpenStreetMap | Paths, roads, parks, open land, buildings, boundary | Uneven: little undeveloped land tagged in the west, few buildings in the south-east, no cycleways. Elmina Valley Central Park is about 17 ha in OSM against about 120 ha in the developer's material |
| ESA WorldCover (2021), Google Dynamic World | Independent cross-check of canopy only | Satellite-derived, not ground truth |
| **Not available to us**: site list, official corridor, tree inventory, LiDAR | Would replace simulated sites, the approximate corridor and the canopy proxy | Asked of Sime Darby Property in [section 12](#12-open-questions) |

### 7.3 Constraints from the brief, and how we handle them
| Constraint | How we handle it |
|---|---|
| Free data only | Sentinel-2, Landsat and OpenStreetMap through Earth Engine. WorldCover and Dynamic World only to cross-check |
| Tropical cloud | Median composites over two-year windows with cloud masks. Stated openly. Cost: they can blur short-lived change |
| Coarse Landsat thermal | Used to rank sites, never to quote a temperature. Gaps filled from neighbours within 100 m for site scoring; reported averages are not filled |
| No real site list | 564 simulated 30 m cells, labelled |
| No official corridor | Approximate corridor from the nine largest OpenStreetMap parks. An official polygon can be dropped in at `backend/data/input/corridor_official.geojson` |
| No hardware, Python preferred, simple front end | Python 3.12 and FastAPI. A web map plus a results list in plain JavaScript and Leaflet |

Method decisions and why:
- **Two-year windows** (baseline 2021-10 to 2023-09, latest 2024-10 to 2026-09). Single years gave too few clear Landsat looks (about 1.6 per pixel in 2021-22).
- **Canopy proxy = NDVI at or above 0.6.** It agrees best on average with the two independent maps (mean F1 0.51, against 0.47 at 0.5 and 0.32 at 0.7). It remains a screening choice.
- **Do not score on change fields** (`ndvi_change`, `lst_change_c`). The baseline has haze artefacts.
- **Validate by spatial block.** Neighbouring 30 m cells are correlated, so split by `block_id` (63 blocks of 250 m).

### 7.4 Scaling to a township and beyond
The pipeline takes an area boundary, so a new area is mostly a new boundary plus a rebuild. We have **not** run it beyond Elmina.
Limits: OpenStreetMap coverage varies, each area needs its own validation, and commercial use changes the Earth Engine
licence. A seasonal re-score needs an owner and a scheduler, which a laptop run does not provide.

## 8. What we have measured
Every figure below comes from a committed file in `backend/data/cache/` or from [docs/pitch-fact-check.md](docs/pitch-fact-check.md).

| Quantity | Value | How to say it |
|---|---|---|
| Imagery go/no-go | **GO** for both sensors and both periods. Under 40% cloud: about 20% of Sentinel-2 scenes and 25% to 33% of Landsat scenes. About 18% of the area has no reliable Landsat pixel | "Single scenes are mostly cloudy, so we pool two-year windows of cloud-masked scenes into per-pixel medians" |
| Canopy proxy (NDVI 0.6) | About 10% (baseline 9.7%, latest 10.4%). About 18% at NDVI 0.5 and 3% at 0.7 | "About 10% by our vegetation-index proxy. Independent maps range from about 4% to 28%, so it is uncertain by a factor of several" |
| Change in canopy | +0.7 points | **Not a result.** Canopy moves about 5 points between single years, and Dynamic World shows the opposite direction (7.1% to 4.4%). Say "no detectable change" |
| Independent maps | WorldCover (2021) about 28% tree cover. Dynamic World about 7% (baseline) and 4% (latest) | "Both are satellite-derived, not field truth, and they disagree with each other by about 4 times" |
| Mean surface temperature | 38.6 C then 42.1 C (+3.5 C) | **Indicative only.** Different clear days and seasons feed each period. Elmina is under construction, so some warming is plausible |
| Simulated sites | 564: 466 open land, 98 corridor edge | "Candidate sites generated from open land, not Sime Darby Property's list" |
| Corridor | Spine about 2.0 km against the stated 5 km. Nine parks used. One park left unlinked | "Approximate, built from OpenStreetMap parks" |
| Connectivity signal | 91 sites (16%) lie within 50 m of a corridor gap | Connectivity is skewed, and it inherits the approximate corridor |
| Temperature reliability | 93 sites get under half of their temperature from real pixels | Flag or down-weight them |

## 9. Risks
| # | Risk | Impact | Mitigation and status |
|---|---|---|---|
| R1 | ML scoring arrives late. It is the critical path | High | Placeholder scoring ships labelled "Preview scores". The ML plan is a rough first version by Day 6, final with stability analysis by Day 10, write-up by Day 12 |
| R2 | The pitch is read as overclaiming | High | [Section 6.3](#63-product-guardrails-honesty-rules), the banned-phrase test, [docs/judge-qa.md](docs/judge-qa.md) |
| R3 | No ground truth: validation only shows consistency, and "high scorers are hotter" is partly true by construction | High | Say so. Offer the pilot with field plots as the fix |
| R4 | Before/after signal is smaller than the noise, so the "after" story is weak | High | Reframed as "no detectable change". Sell repeatability each season, not growth |
| R5 | Simulated sites and an approximate corridor look made up | Medium | Labelled everywhere. Official inputs are designed for (the corridor drop-in works; `--sites-file` is not built yet) |
| R6 | Tropical cloud and coarse thermal limit what we can claim | Medium | Composites, ranking-only use, caveats on screen |
| R7 | OpenStreetMap gaps bias where sites appear (west under-represented) | Medium | Stated. Official land-use data in a pilot |
| R8 | Live demo fails on the day | Medium | Offline by design. Decide on a recorded fallback (P-4) |
| R9 | Earth Engine registration is noncommercial, which clashes with a business-viability story | Medium | State it. A paid pilot needs a commercial plan or a Sentinel Hub style pipeline |
| R10 | Quality gaps: CI never run on GitHub, browser testing in headless Chrome only | Low | Push and run CI. Test on the demo machine |
| R11 | Time split between ML work and the design pass | Medium | ML first. Design pass only on top of the existing, tested logic files |

## 10. Plan and status
The brief's two-week plan, with where the repository stands. Calendar dates are not in the repo, so add them here once known.

| Phase | Planned | Status |
|---|---|---|
| Days 1 to 2 | Go/no-go on usable Sentinel-2 and Landsat scenes | **Done: GO**, using pooled composites. Landsat is the weaker sensor |
| Days 3 to 6 | Vegetation and surface-temperature maps, baseline canopy figure | **Done.** Canopy is a proxy, quoted as a range. ML first version also due Day 6: Open |
| Days 7 to 10 | Site scoring, ranking, web map | Web map and API: **Done.** Scoring and ranking: placeholder only. ML final with stability analysis due Day 10: **Open** |
| Days 11 to 14 | Before/after view, pitch deck, demo | Before/after view: **Done.** Deck, demo script, rehearsal and final design pass: **Open** |

**Critical path from here**
1. ML delivers scores through `write_scores`. Confirm `/meta`: `score_source: "ml"`, `scores_error: null`, `scores_stale: false`.
2. ML validation and weight-stability write-up. Fill the three `[ML to fill]` answers in [docs/judge-qa.md](docs/judge-qa.md).
3. Settle the decisions in [section 12](#12-open-questions): default weights, canopy threshold, how many sites to mark, headline.
4. Design pass on top of the existing app, keeping every element marked `data-required="honesty"`.
5. Deck (Mechanism, Enabler, limits slide), demo script and fallback. Rehearse with the judge Q&A.
6. Push to GitHub and run CI. Test on the demo machine and browser. Run the 10-second test with a few people outside the team.

## 11. Pitch alignment

### 11.1 Mechanism and Enabler
| Part | Message | Proof in the product |
|---|---|---|
| **Mechanism** (the solution and its value) | Plant the next tree where it does the most for heat, habitat and walkers. Change the priorities and watch the order change. Check back each season | Ranked map, sliders, site card, before/after view |
| **Enabler** (how technology makes it work at township scale) | Free satellite and map data, cloud-masked composites, a scripted pipeline that rebuilds in about 4 minutes, a tested offline API, and uncertainty built into the product | Pipeline, API, tests, the independent cross-check. Scales by changing the area boundary (not yet tested beyond Elmina) |

### 11.2 Judging criteria
| Criterion | Our strongest honest point | Weakest point, and what to prepare |
|---|---|---|
| Innovation and original thinking | One explainable ranking that combines heat, habitat connectivity and walking shade for planting order, with adjustable weights and uncertainty on screen. We do not claim a new satellite method | "Google already has canopy maps." Answer in judge Q&A 10 |
| Design | Map-first, plain language, accessible type and colour, explicit states, the answer visible in 10 seconds | Charts are DOM bars with hover, not plotted lines; the layout was checked at three widths in Chromium only |
| Business viability | Free data, scripted rebuild, a concrete pilot path | Payer is a hypothesis, benefit is unquantified, Earth Engine licence is noncommercial |
| Technical execution | Reproducible pipeline on real data, tests, offline demo, graceful degradation, independent cross-check | **ML scoring not delivered**, no ground truth, CI not yet run on GitHub |
| Fit to the theme (Planet, biodiversity) | People: heat relief and shade for walkers. Nature: connectivity along the corridor. Business: planting budget and monitoring | No species or ERT modelling. Biodiversity enters through connectivity and vegetation context only (judge Q&A 11) |

### 11.3 The one-minute demo
1. **See the answer.** The map opens with the top five sites numbered.
2. **Ask "what if?"** Move a slider; the order changes and a note says by how much.
3. **Pick a site.** The card says why in a sentence, then four bullets.
4. **Check time.** Switch to Before and after for the honest verdict and "How sure are we?".
5. **Take it away.** Download the ranked list, marked as example sites.

Words to avoid on stage: the list in [docs/judge-qa.md](docs/judge-qa.md) ("Phrases to avoid") and [6.3](#63-product-guardrails-honesty-rules).

## 12. Open questions
| # | Question | Who answers | Why it matters |
|---|---|---|---|
| 1 | What are the submission date, demo format (live, hosted link or video) and time limit? | Team / organisers | Sets the plan and the hosting decision. The app runs on localhost only |
| 2 | Who owns ML, what is the ETA, and who decides the default weights? | Team | Critical path (R1) |
| 3 | Confirm NDVI 0.6 as the canopy threshold? | Backend + ML | `config.py` says the team must agree before any report. The cross-check favours 0.6 |
| 4 | Mark 5, 10 or 20 sites on opening? | Frontend / design | Open in the UX doc |
| 5 | Headline: "Where to plant first in City of Elmina", or name the township owner? | Pitch / design | Open in the UX doc |
| 6 | Keep the street-map option, given it needs internet and the demo is offline? | Frontend | Open in the UX doc |
| 7 | Is "compare two sites" needed for the pitch? | Pitch / design | Decides a Could item |
| 8 | How does the landscape team sequence planting today, and with what data? | Mentor / Sime Darby Property | Tests the core premise |
| 9 | Can Sime Darby Property share a site list, the official corridor polygon, any tree inventory or LiDAR? | Mentor | Would remove "simulated" and "approximate" |
| 10 | Who pays, from which budget, and which report would use the numbers? | Mentor | Business viability is a hypothesis |
| 11 | What is the current planted-tree count? | Mentor | The 10,266 and 41,000+ figures conflict |
| 12 | Which Bursa group is Sime Darby Property in, and from which year? | Pitch | Row 6 of the fact-check |
| 13 | Does hackathon prize money or a paid pilot change our Earth Engine noncommercial registration? | Team | Licensing (R9) |

## Appendix A: differences from the original brief
The brief was the starting point. These are the places this PRD deliberately departs from it, and why.

| Original brief | This PRD | Why |
|---|---|---|
| "Before-and-after evidence for its climate reporting", "defensible, site-level numbers", "reportable evidence" | A before/after **monitoring** view and site-level **screening** scores. "Supports reporting" at most | Our cross-check shows canopy share is uncertain by a factor of several (about 4% to 28% across methods) and there is no ground truth. See "assumptions" in `docs/pitch-fact-check.md` |
| About 10,266 trees planted, roughly 5% (unverified) | Dropped. No planted-count figure is used | The same sponsored page also says "over 41,000". Neither figure is dated |
| Bursa: TCFD-aligned disclosures for financial years ending on or after 31 December 2025 | Disclosures aligned with IFRS S2 (builds on TCFD), phased by issuer group. Verify dates before quoting | Bursa amended its rules in December 2024. Sources disagree on the dates |
| Shade over "footpaths and cycle routes" | Footpaths only | OpenStreetMap has no cycleways in Elmina |
| 2-week plan, starting at Day 1 | Kept in [section 10](#10-plan-and-status), with status | Most of Days 1 to 10 are already built. Scoring and the pitch are the gap |
| "Ask me before assuming anything about data we do not have" | Every such assumption is in [section 4.4](#44-assumptions-not-yet-tested) or [section 12](#12-open-questions) | |

## Appendix B: glossary and document map
| Term | Meaning |
|---|---|
| NDVI | Normalised Difference Vegetation Index from Sentinel-2. Higher is greener |
| LST | Land surface temperature from Landsat thermal bands. Ranking-grade, not exact |
| Composite | Per-pixel median over many cloud-masked scenes in a time window |
| Canopy proxy | Share of 10 m pixels with NDVI at or above 0.6. Not a tree count |
| UBC | Urban Biodiversity Corridor |
| ERT | Endangered, rare or threatened species |
| Simulated site | A 30 m candidate cell generated by us. Not a real planting site |
| Placeholder / preview score | A stand-in score served until the ML scores are merged |
| Screening-grade | Good enough to rank where to look first, not to report |
| TCFD, IFRS S2 | Climate-disclosure frameworks. IFRS S2 builds on TCFD |

| Document | What it is for |
|---|---|
| [README.md](README.md) | Run it, the API, rebuilding the data, limits |
| [docs/data-contract.md](docs/data-contract.md) | API endpoints and site fields |
| [docs/data-dictionary.md](docs/data-dictionary.md) | Every site feature, with units, ranges and cautions |
| [docs/ml-developer-prompt.md](docs/ml-developer-prompt.md) | The ML brief and hand-off interface |
| [docs/team-handoff.md](docs/team-handoff.md) | Numbers you can quote, and the limits slide |
| [docs/design-system.md](docs/design-system.md) | The Canopy dashboard system: tokens, components, layout, accessibility (live page: `frontend/styleguide.html`) |
| [docs/frontend.md](docs/frontend.md) | Designer brief: components, what must stay, security rules |
| [docs/ux-wireframe.md](docs/ux-wireframe.md) | The map-first UX, journey and wording |
| [docs/pitch-fact-check.md](docs/pitch-fact-check.md) | Outside claims, checked |
| [docs/judge-qa.md](docs/judge-qa.md) | Hard questions with honest answers |
| [docs/pilot-readiness.md](docs/pilot-readiness.md) | What a real pilot with Sime Darby Property would need |
