# Data contract (Backend -> ML -> Frontend)

Source of truth in code: `backend/schema.py`. Coordinates are EPSG:4326 (lon, lat).
Status: **draft v0.1 from Backend. ML and Frontend, please push back now, not on day 9.**

## Run the API (mock data works today)
```
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --reload --port 8000
```
Docs UI: http://localhost:8000/docs. CORS is open for GET.

## Endpoints
| Endpoint | Returns |
|---|---|
| `GET /sites?min_score=&limit=&w_cooling=&w_connectivity=&w_shade=` | GeoJSON FeatureCollection ordered by `rank`. Pass any weight (>= 0) to re-total and re-rank live for sliders; unset weights keep their default, and weights are normalised to sum to 1. All zero returns 422. |
| `GET /sites/{site_id}` | One Feature, or 404 |
| `GET /summary` | Before/after: `baseline`, `latest`, `delta_canopy_pct_points`, `delta_mean_lst_c`, `caveats` |
| `GET /layers/corridor` | Corridor polygon FeatureCollection (`approximate: true` unless official) |
| `GET /meta` | `data_mode` (`mock` or `cache`), `site_count`, `corridor_approximate`, `score_source` (`mock`, `placeholder` or `ml`), `data_version`, `scores_data_version`, `scores_stale` (true when ML scores were computed on different data; null if unknown), `scores_error` (set when `scores.geojson` was rejected and placeholders are served; a generic message, the reasons are in the server log or from `python -m backend.validate_scores`), `sources_built`, `generated_at`, `attribution`, `caveats` |
| `GET /summary/series` | Yearly canopy (with `canopy_pct_low` / `canopy_pct_high` band) and mean temperature points. 404 in mock mode. |
| `GET /layers/overlays` | Before/after map images: `url`, `bounds` as `[[south, west], [north, east]]`, shared colour range, unit. 404 in mock mode. |
| `GET /layers/overlays/{name}.png` | The rendered image named in `/layers/overlays` |
| `GET /weights` | `{"default": {cooling, connectivity, shade}, "source": "config" or "file"}`; start the sliders here |
| `GET /health` | `{"status":"ok"}` |
| `GET /health/deep` | Checks every data file against this contract. 200 when sound, 503 otherwise. Returns `ok`, `problem_count`, `warning_count` only; the reasons are in the server log (or in the response when `API_EXPOSE_DETAILS=1`, local debugging only). |

Errors are small JSON bodies: `{"error": ..., "detail": ..., "request_id": ...}` (also the `X-Request-ID` header).

## Site feature properties
| Field | Type | Owner | Notes |
|---|---|---|---|
| `site_id` | string | Backend | stable ID |
| `source` | `"simulated"` or `"mock"` | Backend | never present as real sites; show "simulated" in the UI |
| `area_m2` | number | Backend | |
| `origin` | `open_land` or `corridor_edge` | Backend | where the candidate cell came from |
| `ndvi_mean` | -1..1 | Backend | Sentinel-2 composite mean over the site |
| `lst_c_mean` | number, deg C | Backend | Landsat; **ranking only**, not exact temperature |
| `canopy_pct_baseline` | 0..100 | Backend | NDVI-threshold proxy |
| `dist_to_path_m` | number | Backend | to nearest footpath/cycleway (OSM) |
| `path_length_within_50m` | number, m | Backend | path length within 50 m of the site |
| `corridor_gap_flag` | bool | Backend | site sits in/near a corridor gap |
| `corridor_gap_dist_m` | number | Backend | |
| `score_cooling`, `score_connectivity`, `score_shade`, `score_total` | 0..100 or null | ML | null until scoring has run |
| `rank` | int >= 1 or null | ML | 1 = plant first |
| `score_source` | `ml`, `placeholder` or `mock` | API | **`placeholder` means ML scores are not merged yet: do not present as the model.** Show a badge in the UI when it is not `ml`. |

## More site fields
The table above is the core. Sites also carry surroundings (`lst_mean_250m`, `built_up_frac_250m`, ...), shade
(`uncovered_path_length_50m`, ...), corridor distances, reliability (`lst_valid_frac`) and `block_id`. All are listed
with units, ranges and cautions in [data-dictionary.md](data-dictionary.md). Site IDs are stable across rebuilds.

## How ML plugs in
Use `backend.ml_io` (`load_sites_df`, `write_scores`): it validates the file and stamps it with the current
`data_version`. Check a file by hand with `python -m backend.validate_scores <file>`. Format example:
`docs/scores.example.geojson`.

Drop `backend/data/cache/scores.geojson`: a FeatureCollection whose features have `properties.site_id` plus `score_cooling`, `score_connectivity`, `score_shade`, `score_total`, `rank` (geometry can be null). The API merges it by `site_id` on every request and flips `score_source` to `ml`; sites ML did not score keep placeholder scores. No API code changes needed.

While ML is not delivered, the API fills a simple stand-in (`placeholder`) from the measured fields so the map is usable. It is not the ML model.

## Mock data
`backend/data/mock/` holds 15 invented sites (`source: "mock"`) with scores pre-filled so the map has something to colour. Regenerate: `python -m backend.scripts.make_mock`. Mock numbers are not satellite output.

## Before/after windows
`/summary` compares two-year windows: baseline 2021-10 to 2023-09, latest 2024-10 to 2026-09 (config: `BASELINE_PERIOD`, `LATEST_PERIOD`). Single years were too thin for Landsat. Canopy % moves about 5 points between single years, so show the canopy before/after as a range, not a precise change. LST change is indicative only. Detail: `backend/data/cache/canopy_sensitivity.json`.

## Caveats (also served at `/meta` and `/summary`)
See `CAVEATS` in `backend/config.py`. Show them in the UI.
