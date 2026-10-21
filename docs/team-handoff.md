# Backend handoff (for ML, Frontend and the pitch writers)

Status: the backend runs end to end on real Elmina data. Everything below is from the cached files in
`backend/data/cache/`, rebuilt by `python -m backend.build_cache` (a full rebuild from a fresh download takes about
4 minutes and reproduced the committed data exactly). 201 backend and 97 frontend tests pass, plus a 29-check browser test.

## 1. Imagery go/no-go: GO
Enough clear Sentinel-2 and Landsat 8/9 observations exist over City of Elmina for both periods, **using multi-date
median composites**. Single scenes are mostly cloudy (only about 20% of Sentinel-2 scenes and 25% to 33% of Landsat scenes are under 40% cloud), so pooled dates
are needed and we say so openly. Landsat is the weaker sensor: after strict cloud and quality masking about 18% of the
area has no reliable pixel. Details: `backend/data/cache/imagery_check.txt`.

## 2. Run it
```
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --port 8000        # http://localhost:8000/docs
```
Works with no internet and no Earth Engine. Field list: `docs/data-contract.md`.

## 3. For Frontend
A **working dashboard interface already exists** in `frontend/` (open `http://localhost:8000/` after starting the API), styled with
the Canopy dashboard system: see [design-system.md](design-system.md) and [frontend.md](frontend.md). It covers everything below, so
any further design can reuse its logic files and replace the look. Below is the API contract it is built on.
- `GET /sites` returns the ranked GeoJSON (564 simulated sites; IDs are stable across rebuilds). Colour by `score_total`; the detail panel uses
  `score_cooling`, `score_connectivity`, `score_shade` plus `ndvi_mean`, `lst_c_mean`, `dist_to_path_m`,
  `corridor_gap_dist_m`.
- **Sliders:** call `GET /weights` once for the default weights, then `GET /sites?w_cooling=..&w_connectivity=..&w_shade=..`
  to get a re-totalled, re-ranked list. Any weight you omit keeps its default.
- **Before/after view:** `GET /summary` (two-year windows), `GET /summary/series` (yearly points with a low/high canopy
  band), `GET /layers/overlays` (image URLs, map bounds as `[[south, west], [north, east]]`, shared colour range so the
  two periods are comparable). Draw the overlays with Leaflet `L.imageOverlay(url, bounds)`.
- `GET /layers/corridor` is the corridor polygon and `GET /layers/corridor/spine` its dashed connectors. They are **approximate**: label them that way on the map.
- Offline basemap: `GET /layers/osm/{buildings|roads|paths|parks|open_land}` returns the cached OpenStreetMap layers, so the map works without internet.
- `GET /summary/crosscheck` gives the canopy comparison with two independent maps: show it next to any canopy number.
- **Always show:** a "simulated sites" label, the `caveats` and `attribution` from `GET /meta`, and a badge when
  `score_source` is not `ml`.
- Overlays, series, the corridor, the basemap layers and the cross-check come from the cache folder. They do not exist in mock mode (404), so the interface must cope with that.

## 4. For ML (original brief — see `ml/README.md` for what was actually delivered)
Start with [data-dictionary.md](data-dictionary.md). It lists every feature with units, ranges and cautions.
```python
from backend.ml_io import load_sites_df, write_scores
df = load_sites_df()      # 564 rows: surroundings, shade, corridor, reliability and spatial-block features
# ... compute score_cooling, score_connectivity, score_shade, score_total (0-100) and rank (1 = plant first) ...
write_scores(df_scores)   # validates, stamps the data version, writes backend/data/cache/scores.geojson
```
- The API merges that file by `site_id`, flips `score_source` to `ml`, and `/meta` shows `scores_stale: true` if the
  backend later rebuilds with different data. Site IDs are stable across rebuilds.
- Check a file by hand: `python -m backend.validate_scores file.geojson`. Format example: `docs/scores.example.geojson`.
- Optionally write `weights.json` (`{"cooling":..,"connectivity":..,"shade":..}`) in the cache folder so the sliders
  start from your default.
- Until you deliver, the API serves a simple placeholder score (`score_source: "placeholder"`). It is not your model.
- A bad or half-written scores file never breaks the API: it is ignored, logged, and shown in `/meta.scores_error`
  (so check `/meta` after you write). `write_scores` refuses to write a file the validator rejects. The `/meta`
  message is generic by design; get the reasons from `python -m backend.validate_scores <file>` or the server log.
  For local debugging only, `API_EXPOSE_DETAILS=1` puts the reasons in the response.
- **Split by `block_id`** (e.g. `GroupKFold`). Neighbouring 30 m cells are correlated, so random splits flatter stability.
- Cautions that affect your work:
  - There are **no real labels**. Validation can only check consistency, not that the ranking is right.
  - `lst_c_mean` is ranking-grade, and `lst_valid_frac < 1` means some of it was gap-filled (93 sites are below 0.5).
  - Do not score on `ndvi_change` / `lst_change_c`: the baseline has haze artefacts (cold pixels, +15 C extremes).
  - Connectivity is skewed: only about 16% of sites are within 50 m of a corridor gap, and the corridor is approximate.
  - Sites are simulated cells, so "high scorers are hotter" is partly true by construction.

## 5. Numbers you can quote (and how)
| Quantity | Value | How to say it |
|---|---|---|
| Canopy proxy (NDVI >= 0.6) | about 10% (baseline 9.7%, latest 10.4%) | "about 10% by our vegetation-index proxy; independent maps range from about 4% to 28%, so treat it as uncertain by a factor of several" |
| Change in canopy | +0.7 points | **Not a result.** Canopy moves about 5 points between single years, and Dynamic World shows the opposite direction (7.1% to 4.4%). Say "no detectable change". |
| Mean surface temperature | 38.6 C then 42.1 C | **Indicative only** (+3.5 C). Elmina is under construction so some warming is plausible, but different clear days and seasons feed each period. |
| Simulated sites | 564 | "Candidate sites generated from open land, not Sime Darby Property's list." |

Canopy at other thresholds: about 18% at NDVI 0.5, 10% at 0.6, 3% at 0.7 (`canopy_sensitivity.json`). The team still
needs to agree on one threshold; the cross-check below favours 0.6. The 10,266-trees-planted figure is unverified and is not used anywhere in the backend.

### The independent cross-check (`backend/data/cache/crosscheck.json`)
We compared our NDVI canopy mask with two independent satellite land-cover products over the same area (both are
satellite maps, not field truth):

| Reference | Tree cover it reports | Agreement with our NDVI >= 0.6 mask |
|---|---|---|
| ESA WorldCover (2021) | about 28% | when we say canopy it agrees 87% (baseline) / 68% (latest); we find only 30% / 25% of its trees |
| Google Dynamic World, baseline window | about 7% | agrees 60%; we find 81% of its trees |
| Google Dynamic World, latest window | about 4% | agrees 38%; we find 89% of its trees |

What this means: the references disagree with each other by about 4x, our 10% sits between them, and Dynamic World's
tree share *falls* between the windows while ours rises slightly. **Canopy % is not a number to quote precisely, and
no trend is supported.** NDVI 0.6 gives the best average agreement of the thresholds tried (mean F1 0.51, against
0.47 at 0.5 and 0.32 at 0.7), which supports keeping 0.6 for ranking.

## 6. Limits for the pitch's "limits" slide
1. **Simulated sites.** 30 m cells on OSM open land plus non-park corridor land, minus buildings and roads. OSM tags
   little undeveloped land in the west of Elmina, so the map under-represents it.
2. **Approximate corridor.** Built from the 9 largest OSM parks, joined along footpaths/roads where a sensible route
   exists. The spine is about 2 km (the stated corridor is 5 km) and the north-west park is left unlinked. A real
   polygon from Sime Darby Property would improve connectivity scoring most: drop it at
   `backend/data/input/corridor_official.geojson` and rebuild.
3. **Tropical cloud.** Median composites over two-year windows; they can blur short-lived change.
4. **Coarse thermal.** Rank with it, do not quote exact temperatures.
5. **Canopy is a vegetation proxy,** not a tree count; it is threshold-sensitive and independent maps disagree about
   the amount by a factor of several (see the cross-check above).
   There is also **no ground truth** (no tree inventory, LiDAR or field plots).
6. **Before/after is thin.** Two windows and a five-point yearly series; the signal is smaller than the noise for canopy.
   The honest pitch is "we can re-score every season at near-zero cost", not "we measured canopy growth".

## 7. Data credits (show in the UI footer, served at `/meta`)
Map data (c) OpenStreetMap contributors. Contains modified Copernicus Sentinel-2 data. Landsat 8/9 Collection 2
Level-2 courtesy of the U.S. Geological Survey. Processed with Google Earth Engine (noncommercial).

## 8. QA picture
`docs/qa-map.png` shows the sites, corridor, parks, paths and buildings together. Regenerate with
`python -m backend.scripts.qa_plot`.
