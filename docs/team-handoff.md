# Backend handoff (for ML, Frontend and the pitch writers)

Status: the backend runs end to end on real Elmina data. Everything below is from the cached files in
`backend/data/cache/`, rebuilt by `python -m backend.build_cache`.

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
- `GET /sites` returns the ranked GeoJSON (564 simulated sites). Colour by `score_total`; the detail panel uses
  `score_cooling`, `score_connectivity`, `score_shade` plus `ndvi_mean`, `lst_c_mean`, `dist_to_path_m`,
  `corridor_gap_dist_m`.
- **Sliders:** call `GET /weights` once for the default weights, then `GET /sites?w_cooling=..&w_connectivity=..&w_shade=..`
  to get a re-totalled, re-ranked list. Any weight you omit keeps its default.
- **Before/after view:** `GET /summary` (two-year windows), `GET /summary/series` (yearly points with a low/high canopy
  band), `GET /layers/overlays` (image URLs, map bounds as `[[south, west], [north, east]]`, shared colour range so the
  two periods are comparable). Draw the overlays with Leaflet `L.imageOverlay(url, bounds)`.
- `GET /layers/corridor` is the corridor polygon. It is **approximate**: label it that way on the map.
- **Always show:** a "simulated sites" label, the `caveats` and `attribution` from `GET /meta`, and a badge when
  `score_source` is not `ml`.
- Overlays, series and the corridor come from the cache folder. They do not exist in mock mode (404).

## 4. For ML
- Input features per site (all measured, see the contract): `ndvi_mean`, `lst_c_mean`, `canopy_pct_baseline`,
  `dist_to_path_m`, `path_length_within_50m`, `corridor_gap_flag`, `corridor_gap_dist_m`, `area_m2`, `origin`.
- Deliver `backend/data/cache/scores.geojson`: features with `properties.site_id`, `score_cooling`,
  `score_connectivity`, `score_shade`, `score_total`, `rank` (geometry may be null). The API merges it and flips
  `score_source` to `ml`. No API change needed. Optionally write `weights.json` (`{"cooling":..,"connectivity":..,"shade":..}`)
  in the same folder so the sliders start from your default.
- Until you deliver, the API serves a simple placeholder score (`score_source: "placeholder"`). It is not your model.
- Cautions that affect validation:
  - `lst_c_mean` is ranking-grade (Landsat thermal is about 100 m native; gaps filled from neighbours within 100 m).
  - `corridor_gap_*` comes from an approximate corridor (see section 6), so connectivity scores inherit that.
  - Sites are simulated 30 m cells, so any "high-scoring sites are hotter" check partly reflects how they were drawn.

## 5. Numbers you can quote (and how)
| Quantity | Value | How to say it |
|---|---|---|
| Canopy proxy (NDVI >= 0.6) | about 10% (baseline 9.7%, latest 10.4%) | "about 10%, range roughly 8 to 14% depending on the year and 18% at a looser threshold" |
| Change in canopy | +0.7 points | **Not a result.** Canopy moves about 5 points between single years. Say "no detectable change". |
| Mean surface temperature | 38.6 C then 42.1 C | **Indicative only** (+3.5 C). Elmina is under construction so some warming is plausible, but different clear days and seasons feed each period. |
| Simulated sites | 564 | "Candidate sites generated from open land, not Sime Darby Property's list." |

Canopy at other thresholds: about 18% at NDVI 0.5, 10% at 0.6, 3% at 0.7 (`canopy_sensitivity.json`). The team still
needs to agree on one threshold. The 10,266-trees-planted figure is unverified and is not used anywhere in the backend.

## 6. Limits for the pitch's "limits" slide
1. **Simulated sites.** 30 m cells on OSM open land plus non-park corridor land, minus buildings and roads. OSM tags
   little undeveloped land in the west of Elmina, so the map under-represents it.
2. **Approximate corridor.** Built from the 9 largest OSM parks, joined along footpaths/roads where a sensible route
   exists. The spine is about 2 km (the stated corridor is 5 km) and the north-west park is left unlinked. A real
   polygon from Sime Darby Property would improve connectivity scoring most: drop it at
   `backend/data/input/corridor_official.geojson` and rebuild.
3. **Tropical cloud.** Median composites over two-year windows; they can blur short-lived change.
4. **Coarse thermal.** Rank with it, do not quote exact temperatures.
5. **Canopy is a vegetation proxy,** not a tree count, and it is threshold-sensitive.
6. **Before/after is thin.** Two windows and a five-point yearly series; the signal is smaller than the noise for canopy.
   The honest pitch is "we can re-score every season at near-zero cost", not "we measured canopy growth".

## 7. Data credits (show in the UI footer, served at `/meta`)
Map data (c) OpenStreetMap contributors. Contains modified Copernicus Sentinel-2 data. Landsat 8/9 Collection 2
Level-2 courtesy of the U.S. Geological Survey. Processed with Google Earth Engine (noncommercial).

## 8. QA picture
`docs/qa-map.png` shows the sites, corridor, parks, paths and buildings together. Regenerate with
`python -m backend.scripts.qa_plot`.
