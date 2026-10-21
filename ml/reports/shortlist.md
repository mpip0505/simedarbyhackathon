# Diversified shortlist (k=20, max 3 per 250 m block)
Data version `482cd831d34a`. Regenerate with `python -m ml.shortlist`.

This does **not** change `scores.geojson` or the live map ranking - see the module docstring in `ml/shortlist.py` for why rank can't be reordered this way inside the scored file. This is a presentation artifact: which sites to put on a slide as "start here", spread across the township instead of one strip.

## Spread, before and after
| version | n | distinct_blocks | largest_block_share | mean_rank |
|---|---|---|---|---|
| raw top 20 | 20 | 6 | 0.35 | 10.5 |
| diversified | 20 | 10 | 0.15 | 15.1 |

Trade-off: the diversified set's average `score_total` is **1.0 points lower** than the raw top 20 (mean rank moves from 10.5 to 15.1). That's the price of spread - every swapped-in site is still a genuinely good candidate, just not quite top-tier, and it was not already represented nearby.

**Swapped in** (5): ELM-3726-11724, ELM-3729-11726, ELM-3736-11741, ELM-3767-11758, ELM-3769-11778

**Swapped out** (5): ELM-3715-11716, ELM-3719-11716, ELM-3720-11714, ELM-3720-11715, ELM-3720-11716

## The diversified shortlist
| rank | site_id | lon | lat | block_id | origin | score_total | score_cooling | score_connectivity | score_shade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ELM-3734-11725 | 101.510288 | 3.176567 | B448-1407 | corridor_edge | 92.5 | 87.3 | 94.8 | 99.1 |
| 2 | ELM-3719-11715 | 101.506254 | 3.173844 | B446-1405 | corridor_edge | 86.6 | 74.8 | 93.0 | 100.0 |
| 3 | ELM-3717-11714 | 101.505716 | 3.173571 | B446-1405 | corridor_edge | 86.3 | 75.4 | 91.6 | 99.6 |
| 4 | ELM-3719-11714 | 101.506255 | 3.173573 | B446-1405 | corridor_edge | 86.1 | 78.5 | 88.2 | 97.3 |
| 6 | ELM-3731-11726 | 101.509478 | 3.176835 | B447-1407 | corridor_edge | 85.5 | 74.2 | 92.1 | 98.0 |
| 9 | ELM-3716-11715 | 101.505446 | 3.173841 | B445-1405 | corridor_edge | 84.4 | 70.5 | 94.0 | 97.9 |
| 10 | ELM-3735-11742 | 101.510542 | 3.181173 | B448-1409 | corridor_edge | 84.4 | 67.1 | 98.5 | 98.8 |
| 12 | ELM-3719-11717 | 101.506253 | 3.174386 | B446-1406 | corridor_edge | 83.6 | 68.4 | 94.2 | 98.1 |
| 13 | ELM-3718-11717 | 101.505983 | 3.174385 | B446-1406 | corridor_edge | 83.3 | 68.1 | 95.0 | 96.6 |
| 14 | ELM-3736-11743 | 101.510811 | 3.181445 | B448-1409 | corridor_edge | 83.0 | 64.8 | 97.3 | 98.6 |
| 15 | ELM-3715-11715 | 101.505176 | 3.17384 | B445-1405 | corridor_edge | 82.5 | 68.0 | 92.7 | 96.4 |
| 16 | ELM-3730-11726 | 101.509209 | 3.176834 | B447-1407 | corridor_edge | 82.5 | 69.2 | 88.8 | 98.7 |
| 17 | ELM-3720-11717 | 101.506522 | 3.174387 | B446-1406 | corridor_edge | 82.4 | 68.9 | 89.3 | 98.3 |
| 18 | ELM-3714-11715 | 101.504907 | 3.173839 | B445-1405 | corridor_edge | 82.3 | 66.0 | 93.3 | 98.6 |
| 19 | ELM-3737-11743 | 101.51108 | 3.181446 | B448-1409 | corridor_edge | 82.3 | 63.6 | 95.8 | 99.8 |
| 22 | ELM-3729-11726 | 101.508939 | 3.176833 | B447-1407 | corridor_edge | 82.0 | 66.2 | 90.7 | 99.9 |
| 27 | ELM-3769-11778 | 101.519673 | 3.190957 | B452-1413 | open_land | 80.7 | 95.1 | 46.7 | 95.6 |
| 28 | ELM-3736-11741 | 101.510812 | 3.180903 | B448-1408 | corridor_edge | 80.6 | 64.4 | 94.5 | 92.9 |
| 31 | ELM-3767-11758 | 101.519152 | 3.185537 | B452-1411 | corridor_edge | 80.1 | 87.3 | 91.9 | 52.8 |
| 35 | ELM-3726-11724 | 101.508133 | 3.176289 | B447-1406 | corridor_edge | 79.4 | 63.1 | 88.1 | 98.5 |
