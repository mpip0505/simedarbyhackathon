# Elmina Canopy Prioritiser (backend)

Ranks where to plant trees first in City of Elmina (Selangor) and supplies before/after evidence.
Sime Darby Property "Township of Tomorrow" hackathon, Planet track. This folder is the **backend**: satellite
and map data in, a small API out. Candidate sites are **simulated** (we do not have Sime Darby Property's real list).

## Run the demo (no Earth Engine, no internet needed)
```
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --port 8000
```
Open http://localhost:8000/docs. The API serves the cached files in `backend/data/cache/`. If that folder has no
`sites.geojson` it falls back to invented mock data in `backend/data/mock/` (`/meta` says which).

Field-by-field contract for ML and Frontend: [docs/data-contract.md](docs/data-contract.md).
Handoff note for teammates: [docs/team-handoff.md](docs/team-handoff.md).

## Rebuild the data
```
python -m backend.build_cache --offline     # corridor, overlays, sites from the cached OSM + rasters (no network)
python -m backend.build_cache --skip-gee    # also re-downloads OSM
python -m backend.build_cache               # everything, including Earth Engine
```
The full run needs a one-time Earth Engine login:
```
earthengine authenticate
$env:GEE_PROJECT = "<your-cloud-project-id>"     # PowerShell; use `export` on macOS/Linux
```
Steps run in order and stop at the first failure: OSM download, OSM layers, corridor, Earth Engine composites and
summary, yearly series, canopy sensitivity, map overlays, candidate sites. `backend/data/cache/build_info.json`
records when OSM and satellite data were really built.

## Layout
| Path | What |
|---|---|
| `backend/api/` | FastAPI service, score merge and weights |
| `backend/gee/` | Earth Engine: imagery check, composites, summary, series, sensitivity |
| `backend/osm/` | OpenStreetMap download, clipping, approximate corridor |
| `backend/sites/` | simulated candidate site generator |
| `backend/overlays.py` | NDVI / temperature map images |
| `backend/data/cache/` | generated files the API serves (committed so the demo works offline) |
| `backend/tests/` | `python -m pytest backend/tests -q` |

## Honest limits (say these in the pitch)
- **Simulated sites.** 30 m cells on OSM open land and corridor land, not a real planting list.
- **Approximate corridor.** Built from the 9 largest OSM parks, joined along footpaths/roads where a sensible route
  exists. Its connecting spine is only about 2 km against the stated 5 km corridor, and one park (north-west) is left
  unlinked. Replace it by dropping the official polygon at `backend/data/input/corridor_official.geojson`.
- **Tropical cloud.** Imagery is a multi-date median. Go/no-go result: `backend/data/cache/imagery_check.txt`.
- **Landsat thermal is coarse** (about 100 m native). Use it to rank sites, not to quote temperatures. About 18%
  of the area has no reliable pixel and is filled from neighbours within 100 m for site scoring.
- **Canopy is a proxy**, NDVI >= 0.6, not a tree count. It moves about 5 points between single years and depends
  strongly on the threshold (about 18%, 10% and 3% at 0.5, 0.6 and 0.7), so the baseline-to-latest change is within
  noise. See `backend/data/cache/canopy_sensitivity.json`.
- **Scores:** until ML delivers `scores.geojson`, the API serves a labelled placeholder (`score_source: "placeholder"`).

## Data credits
Map data (c) OpenStreetMap contributors (ODbL). Contains modified Copernicus Sentinel-2 data. Landsat 8/9 Collection 2
Level-2 courtesy of the U.S. Geological Survey. Processed with Google Earth Engine (noncommercial use).
