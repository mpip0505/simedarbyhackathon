# Site feature dictionary (for the ML teammate)

One row per simulated candidate site. Same fields in `backend/data/cache/site_features.csv` (flat, with `lon`/`lat`
centroid) and `backend/data/cache/sites.geojson` (polygons). 564 sites, 30 m x 30 m cells (900 m2). Ranges below were
measured on the current build (`data_version` in `/meta`).

```python
from backend.ml_io import load_sites_df, write_scores
df = load_sites_df()                 # pandas, one row per site
# ... compute score_cooling, score_connectivity, score_shade, score_total (0-100), rank (1 = plant first) ...
write_scores(df_scores)              # validates, then writes backend/data/cache/scores.geojson
```
Check any file by hand: `python -m backend.validate_scores path/to/scores.geojson`.
Tiny example of the format: `python -m backend.ml_io --example`.

## Identity and grouping
| Column | Meaning |
|---|---|
| `site_id` | `ELM-<x>-<y>`, from the cell's position on a fixed 30 m grid. **Stable across rebuilds**: the same cell always has the same ID. |
| `lon`, `lat` | centroid, EPSG:4326 (CSV only) |
| `source` | always `simulated`. These are not Sime Darby Property's real sites. |
| `origin` | `open_land` (466) or `corridor_edge` (98, non-park land inside the approximate corridor) |
| `block_id` | 250 m spatial block (63 blocks, 1 to 37 sites each). **Split train/test or folds by block** (e.g. `GroupKFold`). Neighbouring cells are strongly correlated, so random splits overstate stability. |
| `area_m2` | 900 for every site |

## Measured on the site itself
| Column | Unit / range | Notes |
|---|---|---|
| `ndvi_mean` | 0.00 to 0.79 | Sentinel-2 median NDVI, latest window (2024-10 to 2026-09). Cells with NDVI < 0 (likely water) were dropped. |
| `lst_c_mean` | 35 to 50 deg C | Landsat surface temperature, latest window. **Ranking only**, not an exact temperature (about 100 m native resolution, resampled to 30 m). |
| `lst_valid_frac` | 0 to 1 | Share of the cell's temperature from real pixels. The rest was filled from neighbours within 100 m. 93 sites are below 0.5: consider down-weighting them. |
| `canopy_pct_baseline` | 0 to 100 | Share of the cell's 10 m pixels with NDVI >= 0.6 in the baseline window. **Median is 0**: most candidate land is bare. A vegetation proxy, not a tree count. |

## Surroundings (the brief's "hot, low-vegetation surroundings")
| Column | Unit / range | Notes |
|---|---|---|
| `lst_mean_100m`, `lst_mean_250m` | 37 to 49 deg C | mean temperature within the radius, latest window, gap-filled raster |
| `ndvi_mean_100m`, `ndvi_mean_250m` | 0.14 to 0.65 | mean NDVI within the radius |
| `buildings_within_250m` | 0 to 218 | OSM building footprints touching the 250 m disc |
| `residential_buildings_within_250m` | 0 to 212 | counts OSM tags house, terrace, detached, apartments, etc. Untyped `building=yes` are not counted. |
| `built_up_frac_250m` | 0 to 0.38 | footprint area share of the 250 m disc. **A lower bound**: OSM maps few buildings in the south-east, so this under-reports there. |

## Walking routes (shade)
| Column | Unit / range | Notes |
|---|---|---|
| `dist_to_path_m` | 0.1 to 675 m | to the nearest OSM footway/path (OSM has no cycleways in Elmina) |
| `path_length_within_50m` | 0 to 530 m | path length within 50 m of the cell |
| `uncovered_path_length_50m` | 0 to 540 m | nearby path with NDVI < 0.6 beneath it (sampled every 10 m): walking route without canopy |
| `path_canopy_frac_50m` | 0 to 0.67, **blank if no path within 50 m** (403 sites) | share of nearby path that already has canopy. Blank means "no path nearby", not "no canopy". |

## Corridor (approximate corridor, see limits)
| Column | Unit / range | Notes |
|---|---|---|
| `corridor_gap_flag` | bool | a corridor gap point is within 50 m (91 sites) |
| `corridor_gap_dist_m` | 2 to 3322 m | distance to the nearest gap point: spine points where NDVI < 0.5. Median is 756 m, so **connectivity is very skewed**: only about 16% of sites are near a gap. |
| `dist_to_corridor_spine_m` | 0.7 to 3317 m | to the nearest connector line between parks |
| `dist_to_nearest_park_m` | 6 to 1971 m | to the nearest OSM park polygon |
| `in_corridor` | bool | cell centre lies inside the corridor polygon (98 sites) |

## Change over time (diagnostic only, do not score on these)
| Column | Notes |
|---|---|
| `ndvi_mean_baseline`, `lst_c_mean_baseline` | same measures for the baseline window (2021-10 to 2023-09) |
| `ndvi_change`, `lst_change_c` | latest minus baseline. **Noisy and partly artefact.** The baseline temperature has implausibly cold pixels (minimum 24 deg C, so some haze leaks through) and change reaches +15 deg C at the extreme. Canopy moves about 5 points between single years. Use these to explore, not to rank. |

## ML-owned fields (you write these)
| Column | Range | Notes |
|---|---|---|
| `score_cooling`, `score_connectivity`, `score_shade`, `score_total` | 0 to 100, no blanks | `score_total` should equal the weighted components |
| `rank` | integer >= 1, unique | 1 = plant first; must agree with `score_total` order |

`write_scores` stamps your file with the current `data_version`. If the backend rebuilds with different data, `/meta`
shows `scores_stale: true` until you re-score.

## Caveats that bear on validation
- There are **no real labels**. Validation can only check internal consistency (e.g. high scorers are hotter and less
  vegetated, rankings are stable under different weights), not that the ranking is "right". Say this in the pitch.
- Sites are simulated 30 m cells drawn from OSM open land, so "high-scoring sites are hotter than low-scoring ones" is
  partly true by construction of the features, not an independent finding.
- The corridor is approximate (about 2 km of spine against the stated 5 km, north-west park unlinked), so
  connectivity features inherit that.
- OSM undertags undeveloped land in the west and buildings in the south-east.
