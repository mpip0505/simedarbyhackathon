# Score uncertainty (Monte Carlo over the modelling judgement calls)
Generated 2026-10-21 03:54:10 UTC on data_version `f12bc98c3fbd`, 2000 draws. Regenerate with `python -m ml.uncertainty`.

> This is **not** a confidence interval on the true best planting site - there is no ground truth to be confident about. It is a measure of how much the ranking depends on judgement calls (the weights, and four distance constants inside the scores) that were chosen, not fitted. A site whose rank barely moves across plausible choices is a safer pitch claim than one near the cutoff.

## What was varied
| parameter | distribution |
|---|---|
| weights | Dirichlet(20 x default), sliders-nudged |
| gap_scale_m | Uniform(200.0, 800.0) |
| park_scale_m | Uniform(200.0, 800.0) |
| path_scale_m | Uniform(75.0, 300.0) |
| unshaded_cap_m | Uniform(75.0, 300.0) |
| shrink_gapfilled | on in 80% of draws |

## Headline
- Rank correlation between the single default ranking and the median rank across all 2000 draws: **0.9989** (the Monte Carlo median agrees closely with the one number on the map).
- **14 of the default top 20** sites stay in the top 20 in at least 80% of draws - call these the robust recommendations. 14 sites are robust top-20 across the whole candidate set.
- 13 sites are "boundary" cases: they enter the top 20 in 20-80% of draws - plausible, not guaranteed.
- Widest swing inside the default top 20: **ELM-3718-11717** (default rank 13), ranges from 12 to 49 depending on the draw, and is in the top 20 only 39% of the time. On the fence: uncovered_path_length_50m=162.7m is inside the sampled unshaded_cap_m range (75.0, 300.0).

## The default top 20, with their range across 2000 draws
| baseline_rank | site_id | baseline_score | score_median | score_p05 | score_p95 | rank_median | rank_p05 | rank_p95 | topk_frequency |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ELM-3734-11725 | 92.5 | 92.6 | 90.6 | 94.4 | 1 | 1 | 1 | 1.0 |
| 2 | ELM-3719-11715 | 86.6 | 86.6 | 82.5 | 90.7 | 3 | 2 | 8 | 0.996 |
| 3 | ELM-3717-11714 | 86.3 | 86.4 | 82.6 | 90.3 | 4 | 3 | 7 | 0.998 |
| 4 | ELM-3719-11714 | 86.1 | 86.4 | 83.3 | 89.5 | 4 | 3 | 10 | 0.996 |
| 5 | ELM-3720-11714 | 86.1 | 86.4 | 83.4 | 89.6 | 4 | 2 | 14 | 0.982 |
| 6 | ELM-3731-11726 | 85.5 | 85.2 | 81.1 | 89.2 | 8 | 4 | 19 | 0.961 |
| 7 | ELM-3720-11715 | 85.4 | 85.6 | 82.1 | 89.2 | 7 | 6 | 14 | 0.994 |
| 8 | ELM-3719-11716 | 85.1 | 85.1 | 80.7 | 89.6 | 8 | 5 | 14 | 0.978 |
| 9 | ELM-3716-11715 | 84.4 | 84.5 | 79.9 | 89.0 | 10 | 7 | 18 | 0.962 |
| 10 | ELM-3735-11742 | 84.4 | 84.3 | 78.8 | 89.7 | 11 | 3 | 23 | 0.931 |
| 11 | ELM-3720-11716 | 83.9 | 84.1 | 79.9 | 88.3 | 11 | 9 | 22 | 0.935 |
| 12 | ELM-3719-11717 | 83.6 | 83.6 | 78.7 | 88.5 | 12 | 10 | 23 | 0.934 |
| 13 | ELM-3718-11717 | 83.3 | 80.4 | 73.9 | 87.2 | 27 | 12 | 49 | 0.39 |
| 14 | ELM-3736-11743 | 83.0 | 82.9 | 77.1 | 88.6 | 15 | 8 | 33 | 0.828 |
| 15 | ELM-3715-11715 | 82.5 | 82.6 | 77.9 | 87.4 | 17 | 14 | 29 | 0.8 |
| 16 | ELM-3730-11726 | 82.5 | 82.5 | 77.8 | 87.1 | 18 | 13 | 29 | 0.658 |
| 17 | ELM-3720-11717 | 82.4 | 82.5 | 77.8 | 87.2 | 18 | 14 | 28 | 0.638 |
| 18 | ELM-3714-11715 | 82.3 | 82.4 | 77.0 | 87.7 | 19 | 14 | 32 | 0.668 |
| 19 | ELM-3737-11743 | 82.3 | 82.2 | 76.2 | 88.1 | 21 | 12 | 40 | 0.461 |
| 20 | ELM-3715-11716 | 82.2 | 82.0 | 76.3 | 87.7 | 21 | 14 | 37 | 0.44 |

`rank_p05` is the best-case rank seen across draws, `rank_p95` the worst case (low numbers are always better - rank 1 is "plant first"). `topk_frequency` is the share of draws in which the site is still in the top 20.

Full per-site table (564 sites): `ml/reports/uncertainty_sites.csv`.
