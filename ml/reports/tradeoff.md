# Trade-off between ways of choosing the first sites
Generated on data_version `f12bc98c3fbd`, 564 simulated sites. Regenerate with `python -m ml.tradeoff`.

> A trade-off, not a league table: our default weights favour footpath and corridor by design, and a heat-only list picks the hottest surroundings. Reach is not benefit, the sites are simulated, and the heat-only, canopy-gap and combined lists are simplified stand-ins for published approaches.

## The first 20 sites

| method | footpath with little tree cover (m) | mapped homes | corridor gap (m) | areas (250 m blocks) | hotter than (% of sites, average) |
|---|---|---|---|---|---|
| Heat only | 580 (0.9%) | 78 (8.1%) | 200 (12.1%) | 9 | 98% |
| Canopy gap only | 610 (0.9%) | 0 (0.0%) | 90 (5.5%) | 6 | 61% |
| Heat + gap | 540 (0.8%) | 71 (7.3%) | 0 (0.0%) | 7 | 96% |
| Equal three | 2,880 (4.4%) | 243 (25.1%) | 540 (32.7%) | 6 | 67% |
| Ours (default) | 2,860 (4.3%) | 243 (25.1%) | 480 (29.1%) | 6 | 68% |
| Spread out | 3,650 (5.5%) | 301 (31.1%) | 660 (40.0%) | 10 | 66% |

## The first 50 sites

| method | footpath with little tree cover (m) | mapped homes | corridor gap (m) | areas (250 m blocks) | hotter than (% of sites, average) |
|---|---|---|---|---|---|
| Heat only | 2,060 (3.1%) | 344 (35.5%) | 310 (18.8%) | 14 | 96% |
| Canopy gap only | 1,130 (1.7%) | 36 (3.7%) | 90 (5.5%) | 13 | 72% |
| Heat + gap | 1,280 (1.9%) | 109 (11.3%) | 0 (0.0%) | 11 | 92% |
| Equal three | 5,110 (7.8%) | 248 (25.6%) | 1,080 (65.5%) | 11 | 60% |
| Ours (default) | 5,400 (8.2%) | 349 (36.1%) | 1,150 (69.7%) | 14 | 64% |
| Spread out | 6,320 (9.6%) | 387 (40.0%) | 960 (58.2%) | 25 | 75% |

Percentages are of the township's totals: about 65,860 m of footpath with little tree cover, 968 mapped homes and about 1,650 m of corridor gap.
