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
| `GET /sites?min_score=&limit=` | GeoJSON FeatureCollection, ordered by `rank` (unranked last) |
| `GET /sites/{site_id}` | One Feature, or 404 |
| `GET /summary` | Before/after: `baseline`, `latest`, `delta_canopy_pct_points`, `delta_mean_lst_c`, `caveats` |
| `GET /layers/corridor` | Corridor polygon FeatureCollection (`approximate: true` unless official) |
| `GET /meta` | `data_mode` (`mock` or `cache`), `site_count`, `corridor_approximate`, `caveats` |
| `GET /health` | `{"status":"ok"}` |

## Site feature properties
| Field | Type | Owner | Notes |
|---|---|---|---|
| `site_id` | string | Backend | stable ID |
| `source` | `"simulated"` or `"mock"` | Backend | never present as real sites; show "simulated" in the UI |
| `area_m2` | number | Backend | |
| `ndvi_mean` | -1..1 | Backend | Sentinel-2 composite mean over the site |
| `lst_c_mean` | number, deg C | Backend | Landsat; **ranking only**, not exact temperature |
| `canopy_pct_baseline` | 0..100 | Backend | NDVI-threshold proxy |
| `dist_to_path_m` | number | Backend | to nearest footpath/cycleway (OSM) |
| `path_length_within_50m` | number, m | Backend | path length within 50 m of the site |
| `corridor_gap_flag` | bool | Backend | site sits in/near a corridor gap |
| `corridor_gap_dist_m` | number | Backend | |
| `score_cooling`, `score_connectivity`, `score_shade`, `score_total` | 0..100 or null | ML | null until scoring has run |
| `rank` | int >= 1 or null | ML | 1 = plant first |

## How ML plugs in
Drop `backend/data/cache/scores.geojson` (same features, score fields filled). Backend merges it in batch 5; no API code changes needed.

## Mock data
`backend/data/mock/` holds 15 invented sites (`source: "mock"`) with scores pre-filled so the map has something to colour. Regenerate: `python -m backend.scripts.make_mock`. Mock numbers are not satellite output.

## Caveats (also served at `/meta` and `/summary`)
See `CAVEATS` in `backend/config.py`. Show them in the UI.
