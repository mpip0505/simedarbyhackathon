# What the top sites reach
Generated on data_version `f12bc98c3fbd`, 564 simulated sites, ranked with the ML default weights. Regenerate with `python -m ml.impact_reach`.

> REACH, not outcome. It counts what lies near the sites; it does not show planting there would cool, improve health or survive. The sites are simulated. Every footpath point, home and gap point is counted once, however many chosen sites are near it.

## Totals in the township (from our data)
- Unshaded footpath: about **65,860 m**; **9,330 m** of it is within reach of at least one candidate site.
- Mapped homes: **968**; **443** are within 250 m of at least one candidate site.
- Corridor gaps (approximate corridor): about **1,650 m**; **1,510 m** of it is within 50 m of at least one candidate site.

## What the first N sites reach

| N sites | planting area (m²) | unshaded footpath (m) | % of reachable | homes | % of reachable | corridor gap (m) | % of reachable |
|---|---|---|---|---|---|---|---|
| 5 | 4,500 | 1,380 | 14.8% | 242 | 54.6% | 200 | 13.2% |
| 10 | 9,000 | 2,120 | 22.7% | 242 | 54.6% | 350 | 23.2% |
| 20 | 18,000 | 2,860 | 30.7% | 243 | 54.9% | 480 | 31.8% |
| 50 | 45,000 | 5,400 | 57.9% | 349 | 78.8% | 1,150 | 76.2% |
| 100 | 90,000 | 7,920 | 84.9% | 416 | 93.9% | 1,470 | 97.4% |
| 200 | 180,000 | 9,280 | 99.5% | 443 | 100.0% | 1,510 | 100.0% |
| 564 | 507,600 | 9,330 | 100.0% | 443 | 100.0% | 1,510 | 100.0% |

## Definitions
- **unshaded_path_m**: OpenStreetMap footpath (sampled every 10 m) whose latest greenness is below 0.6, within 50 m of a chosen site. About, to the nearest 10 m.
- **homes**: Mapped residential buildings touching a 250 m circle around a chosen site's centre. OpenStreetMap under-maps some areas, so this is a lower bound.
- **gap_m**: Corridor spine (approximate) with greenness below the gap threshold, within 50 m of a chosen site's centre. About, to the nearest 10 m.
