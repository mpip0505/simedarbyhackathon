# Frontend: barebones build and designer brief

Written for: whoever designs or extends the interface. The app is a **working map-first build**: the map is the screen, and
"What matters most?", "Top sites" and the site card float over it. The look lives in `css/app.css` and can be replaced
without touching the data or the maths. The UX it implements (journey, wording, states) is in [ux-wireframe.md](ux-wireframe.md).

![Wireframe of the earlier barebones layout, kept for the component list below](wireframe.png)

`docs/wireframe.svg` is the earlier table-based layout. The component list below still describes the data each part uses;
the ranked table is now the "Top sites" list with a one-sentence reason per site, and the detail panel is the site card.

## Run it
```bash
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --port 8000
# open http://localhost:8000/   (redirects to /app/)
```
No Node and no build step are needed to run it. Leaflet is bundled in `frontend/vendor/leaflet/` (checked against the
published hashes), and the map draws from our own cached OpenStreetMap layers, so it works **offline**.
To point a separately hosted design at the API, open it with `?api=http://localhost:8000` (the API allows cross-origin GET).
Only a **localhost address (any port) or the page's own origin** is accepted; anything else is ignored with a visible notice, so a
crafted link cannot make the page load data from someone else's server.

## What each part is, where its data comes from, and what must stay
| # | Component | Data (all `GET`) | Notes for the designer |
|---|---|---|---|
| 1 | Title and screening note | static text | **Keep** the screening-tool wording: it is not a tree count or a carbon figure |
| 2 | Status chips | `/meta`: `data_mode`, `score_source`, `generated_at` | **Keep** "Simulated sites" always, and the score-source chip (amber while scores are placeholders) |
| 3 | View tabs | none | Two views: Prioritise, Before / after |
| 4 | Notice strip | `/meta`: `data_mode`, `scores_error`, `scores_stale` | Shown only when needed. Red for mock data or a rejected score file |
| 5 | Weight sliders | `/weights` (starting values) | Three sliders, 0 to 100, shown as a share of the total. Reset returns to the API's ranking |
| 6 | Filters and search | `/sites` | Origin (all, open land, corridor edge) and a site-id search |
| 7 | Top sites list | `/sites` | Top 8 by default ("See all" expands), each with a one-sentence reason. Click or Enter selects; shared with the map. Numbered badges 1 to 5 mark the top sites on the map |
| 8 | CSV download | built in the browser | The ranked list with the `source` (simulated) and `score_source` columns kept |
| 9 | Map | `/layers/osm/{name}`, `/layers/corridor`, `/layers/corridor/spine`, `/sites` | Offline basemap, approximate corridor (dashed spine), sites coloured by total score |
| 10 | Legend | computed | Score range of the current ranking, with a colourblind-safe ramp |
| 11 | Layer toggles | `/layers/overlays` | Sites, corridor, map detail, vegetation and temperature overlays, optional online street tiles |
| 12 | Site card | `/sites` | One-sentence reason, three score bars, "Why it ranks here", the numbers (collapsed). Preview-score notice when relevant |
| 13 | Footer | `/meta`: `caveats`, `attribution` | **Keep** the limits list and the data credits (OpenStreetMap's licence requires attribution) |
| 14 | Metric toggle | none | Vegetation (NDVI) or surface temperature |
| 15 | Two synced maps | `/layers/overlays` | Baseline left, latest right, same colour scale, panning and zooming linked |
| 16 | Shared legend | `/layers/overlays` | **Keep** "gap-filled, ranking-grade" for temperature |
| 17 | Summary cards | `/summary`, `/summary/series` | **Keep** the honest verdicts: "No detectable change" and "Indicative only" |
| 18 | Year-by-year table | `/summary/series` | Canopy with a low to high range, temperature, clear Landsat looks per pixel |
| 19 | Independent-map comparison | `/summary/crosscheck`, `/summary` | **Keep**: it shows canopy estimates range from about 4% to 28% depending on the method |

### States to design
A. API not reachable. B. Mock data. C. Placeholder scores. D. Score file problem or out of date. See the wireframe.

## Content rules (a Node test enforces the first three)
Always show that sites are **simulated** and when scores are **placeholders**; never show per-site temperature change;
never word the canopy change as growth; never say "reportable", "defensible" or "accurate"; never show the 10,266 or
"5% planted" figure (see `pitch-fact-check.md`); always credit the data sources; label overlays as gap-filled.
`frontend/tests/copy.test.mjs` fails if banned phrases appear or the marked elements (`data-required="honesty"` in
`index.html`) are removed. A redesign may reword anything, but must keep the meaning.

## Reuse this, restyle the rest
```
frontend/
  index.html            structure, element ids (the scripts find elements by id)
  css/app.css           barebones styling: replace freely, keep the ids and classes the scripts use
  js/
    weights.js          re-total and re-rank for new weights. MUST match the API exactly. Reuse unchanged.
    drivers.js          "what drives this site's rank": weighted points and plain-language notes. Reuse.
    scale.js            colour ramp, number formats, percentiles. Reuse.
    report-logic.js     honest wording and numbers for the before/after view. Reuse.
    csv.js              CSV export. Reuse.
    api.js              fetch helpers with timeouts and one retry; apiUrl() for overlay images. Reuse.
    dom.js, state.js    tiny helpers. Replace if you adopt a framework.
    map.js, list.js, panel.js, sliders.js, report.js, main.js   the interface wiring. Replace as needed.
  vendor/leaflet/       Leaflet 1.9.4 (BSD-2), bundled so the demo works offline
  vendor/fonts/         Atkinson Hyperlegible (SBIL Open Font License 1.1, licence file included), bundled for offline use
  tests/                Node unit tests + the Python-generated fixture
  tools/smoke.mjs       real-browser test; tools/make_wireframe.py draws the wireframe
```
**The one rule that matters:** `weights.js` must give exactly the same totals and ranks as the API's
`?w_cooling=&w_connectivity=&w_shade=` re-ranking. Its rounding is not `Math.round`: Python rounds exact ties to the
even digit (72.25 becomes 72.2), and naive JavaScript rounding disagreed with the API on 505 of 2,611 test values.
`backend/scripts/make_frontend_fixture.py` records what the backend returns, `tests/weights.test.mjs` replays it, and
`backend/tests/test_frontend_fixture.py` fails if the backend and the fixture drift apart.

Until a slider moves, the table shows the API's own ranking (the ML model's, once merged). Only after a slider moves does
the browser re-rank, and the page says so.

## Test it
```bash
node --test "frontend/tests/*.test.mjs"   # 71 unit tests, no dependencies (Node 22; quote the pattern)
# or:  cd frontend && npm test
python -m pytest backend/tests -q       # includes the static-serving and endpoint tests
node frontend/tools/smoke.mjs           # real Chrome or Edge drives the app; needs the API running on port 8000
```
The smoke test loads the page, clicks a row, drags the sliders, filters, searches, toggles layers, switches views and
temperature/vegetation, checks the unreachable-API message and a narrow screen, fails on any console error or stray
text such as `null` or `[object ...]`, and writes screenshots (`node frontend/tools/smoke.mjs <baseUrl> <folder>`).
Set `CHROME_PATH` if the browser is somewhere unusual.

## Security rules for any redesign
- **API text is data, never markup.** Build DOM with text nodes or `textContent`; never `innerHTML`. Leaflet treats a *string*
  given to `setTooltipContent`, `bindTooltip` or `bindPopup` as **HTML**, so pass a DOM node (this was a real hole, now fixed
  in `js/map.js`).
- Keep the `?api=` restriction in `js/api.js` (`resolveApiBase`).
- `tests/safety.test.mjs` scans the scripts for these patterns, and `tools/smoke.mjs` runs a hostile API (site ids that are
  HTML with an `onerror` handler) against the real page and fails if any script runs or markup becomes an element.

## Known limits of this build
- Charts are tables and bars, not plotted lines. It has been checked at 1440x900 and a phone width only through screenshots
  and the smoke test (headless Chrome), not on other browsers or real touch devices.
- Rank badges that would overlap are nudged apart (rank 1 stays on its site), so a badge can sit a few pixels off its cell.
- The online street-map toggle needs internet, and OpenStreetMap's tile policy applies (light use, with attribution).
- While ML scores are not merged, everything shows the labelled placeholder. The interface switches automatically when
  `score_source` becomes `ml`.
- Site cells are 30 m, so they are small at the default zoom; a designed version may want a zoom-dependent marker size.
