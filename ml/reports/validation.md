# Score validation report
Generated 2026-10-21 02:20:17 UTC on data_version `482cd831d34a`, 564 sites, weights {"cooling": 0.45, "connectivity": 0.3, "shade": 0.25}. Regenerate with `python -m ml.validation`.
> **There are no ground-truth labels for this problem** - no tree inventory, LiDAR or field plots. Nothing below shows the ranking is correct. It shows the ranking is *consistent* with the features it is built from and *stable* under the choices we had to make. Read it that way, and say so in the pitch.
## Scores at a glance
| score | min | 25% | 50% | 75% | max |
|---|---|---|---|---|---|
| score_cooling | 7.5 | 33.5 | 54.9 | 64.3 | 96.1 |
| score_connectivity | 0.4 | 4.6 | 19.5 | 35.8 | 98.5 |
| score_shade | 0.3 | 6.3 | 11.4 | 42.9 | 100.0 |
| score_total | 14.6 | 22.0 | 29.4 | 53.0 | 92.5 |

Component inputs (0-100), and how many sites sit near zero:
| input | median | share < 5 |
|---|---|---|
| hot | 50.0 | 0.05 |
| bare | 50.0 | 0.051 |
| built | 51.7 | 0.0 |
| gap | 15.1 | 0.429 |
| park | 37.5 | 0.161 |
| inside | 0.0 | 0.826 |
| unshaded | 0.0 | 0.715 |
| near | 38.3 | 0.083 |

## 1. Direction check
Top decile vs bottom decile (56 sites each).
| feature | top_decile_mean | bottom_decile_mean |
|---|---|---|
| lst_mean_250m | 42.44 | 39.221 |
| ndvi_mean_250m | 0.309 | 0.441 |
| built_up_frac_250m | 0.151 | 0.0 |
| residential_buildings_within_250m | 26.071 | 0.0 |
| corridor_gap_dist_m | 60.646 | 1277.204 |
| dist_to_nearest_park_m | 97.759 | 421.223 |
| uncovered_path_length_50m | 342.143 | 0.0 |
| dist_to_path_m | 13.029 | 274.021 |
| canopy_pct_baseline | 3.625 | 10.709 |
| lst_valid_frac | 0.916 | 0.999 |

Partly true by construction: the scores are built from these features. This checks the wiring and the sign of every term, not that the ranking is right.

## 2. Weight stability

**any weights: Dirichlet(1,1,1)** (2000 draws)

- Rank correlation with the default ranking: median **0.916**, 5th percentile 0.546, worst 0.41.
- Top 20 shared with the default: median **14/20**, worst 1.
- A site's rank moves by 211 places at the median across these weight sets (90th percentile 396, worst 518).
- **3 sites stay in the top 50 under every draw**; 438 never enter it.

**sliders nudged: Dirichlet(20 x default)** (2000 draws)

- Rank correlation with the default ranking: median **0.991**, 5th percentile 0.866, worst 0.673.
- Top 20 shared with the default: median **18/20**, worst 3.
- A site's rank moves by 139 places at the median across these weight sets (90th percentile 292, worst 338).
- **18 sites stay in the top 50 under every draw**; 473 never enter it.

Every draw re-totals the same three component scores, so this measures how much the weight choice matters, not whether the components are right.

## 3. Leave one input out
Each of the eight inputs removed in turn (its score falls back on the rest).
| variant | score | spearman_vs_default | top20_shared | median_rank_shift |
|---|---|---|---|---|
| without hot | cooling | 0.9483 | 16 | 33 |
| without bare | cooling | 0.9582 | 16 | 23 |
| without unshaded | shade | 0.9747 | 17 | 22 |
| without built | cooling | 0.9812 | 15 | 17 |
| without gap | connectivity | 0.9855 | 18 | 10 |
| without park | connectivity | 0.9891 | 18 | 13 |
| without near | shade | 0.9935 | 19 | 10 |
| without inside | connectivity | 0.9966 | 18 | 7 |

## 4. Sensitivity to the judgement constants
The decay scales, the unshaded-path cap and the gap-fill shrinkage, retested at other defensible values.
| variant | spearman_vs_default | top20_shared | median_rank_shift |
|---|---|---|---|
| shrink_gapfilled=False | 0.9861 | 20 | 2 |
| gap_scale_m=800.0, park_scale_m=800.0 | 0.9882 | 18 | 14 |
| gap_scale_m=200.0, park_scale_m=200.0 | 0.9923 | 18 | 9 |
| path_scale_m=75.0 | 0.9985 | 19 | 4 |
| unshaded_cap_m=75.0 | 0.9989 | 17 | 1 |
| unshaded_cap_m=300.0 | 0.9989 | 18 | 0 |
| path_scale_m=300.0 | 0.9994 | 19 | 2 |

## 5. Block hold-out (spatial robustness)
GroupKFold, 5 folds over 63 250 m blocks: percentile scales refit on the training blocks, held-out blocks scored against them.

- Rank correlation with the full-sample ranking: **0.9966**
- Top 20 shared: 19/20; median rank shift 5 places

Only the percentile scales are sample-dependent; the distance decays are absolute, which is why this check moves the ranking so little.

## 6. Reliability of the temperature input
- 93 sites have `lst_valid_frac` below 0.5 (temperature mostly filled from neighbours).
- Re-scoring the remaining 471: rank correlation **0.9994** with their order in the default ranking.
- Of the default top 20, **0 sites** rely on mostly gap-filled temperature.

Dropping sites changes the percentile scales, so a perfect 1.0 is not expected. The last number is what matters: how much of the headline top 20 rests on gap-filled temperature.

## 7. Spatial concentration of the shortlist
| shortlist | distinct_blocks | largest_block_share | origin_mix |
|---|---|---|---|
| top_20 | 6 | 0.35 | {'corridor_edge': 20} |
| top_50 | 14 | 0.22 | {'corridor_edge': 48, 'open_land': 2} |
| top_100 | 26 | 0.12 | {'corridor_edge': 74, 'open_land': 26} |

Not a defect of the scores: corridor-edge cells near unshaded paths genuinely cluster. It is a caveat for the pitch - present the top 20 as a few planting areas, and use the weight sliders or a per-block cap if a spread-out shortlist is wanted.

## 8. Redundant feature pairs
Rank-identical or near-identical pairs in the feature table. The model deliberately uses only one of each, so one signal is not counted twice under two names.
| a | b | spearman |
|---|---|---|
| path_length_within_50m | uncovered_path_length_50m | 0.9998 |
| corridor_gap_dist_m | dist_to_corridor_spine_m | 0.9994 |

## Top 20 sites
| rank | site_id | score_total | score_cooling | score_connectivity | score_shade |
|---|---|---|---|---|---|
| 1 | ELM-3734-11725 | 92.5 | 87.3 | 94.8 | 99.1 |
| 2 | ELM-3719-11715 | 86.6 | 74.8 | 93.0 | 100.0 |
| 3 | ELM-3717-11714 | 86.3 | 75.4 | 91.6 | 99.6 |
| 4 | ELM-3719-11714 | 86.1 | 78.5 | 88.2 | 97.3 |
| 5 | ELM-3720-11714 | 86.1 | 79.8 | 85.6 | 98.0 |
| 6 | ELM-3731-11726 | 85.5 | 74.2 | 92.1 | 98.0 |
| 7 | ELM-3720-11715 | 85.4 | 76.3 | 88.2 | 98.6 |
| 8 | ELM-3719-11716 | 85.1 | 71.8 | 93.2 | 99.2 |
| 9 | ELM-3716-11715 | 84.4 | 70.5 | 94.0 | 97.9 |
| 10 | ELM-3735-11742 | 84.4 | 67.1 | 98.5 | 98.8 |
| 11 | ELM-3720-11716 | 83.9 | 72.4 | 88.8 | 98.9 |
| 12 | ELM-3719-11717 | 83.6 | 68.4 | 94.2 | 98.1 |
| 13 | ELM-3718-11717 | 83.3 | 68.1 | 95.0 | 96.6 |
| 14 | ELM-3736-11743 | 83.0 | 64.8 | 97.3 | 98.6 |
| 15 | ELM-3715-11715 | 82.5 | 68.0 | 92.7 | 96.4 |
| 16 | ELM-3730-11726 | 82.5 | 69.2 | 88.8 | 98.7 |
| 17 | ELM-3720-11717 | 82.4 | 68.9 | 89.3 | 98.3 |
| 18 | ELM-3714-11715 | 82.3 | 66.0 | 93.3 | 98.6 |
| 19 | ELM-3737-11743 | 82.3 | 63.6 | 95.8 | 99.8 |
| 20 | ELM-3715-11716 | 82.2 | 64.6 | 95.4 | 98.0 |

See docs/ml-model.md for the plain-language explanation and the limits.
