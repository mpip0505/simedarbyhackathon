# Planting-impact scenario — NOT a forecast
Data version `482cd831d34a`. Regenerate with `python -m ml.scenario --k 50 --years 25`.

> **This is a scenario, not a prediction.** It shows what a plausible outcome could look like under a stated growth assumption we did not fit to any field data (none exists for Elmina) - it is not a trend fitted to the yearly series, which the project already says is noisier than its signal. Change the assumption, change the chart. It is also scoped to the *planted set's own average canopy*, not a township-wide figure, and it makes no claim about temperature or carbon - those need relationships this project has not measured.

## The one measured input
Ceiling = **15.1%** canopy (NDVI >= 0.6) — measured today inside Elmina's existing OSM-mapped parks (NDVI >= 0.6, latest window). Notably modest: even Elmina's existing green space is mostly lawn and young landscaping, not closed tree canopy, which is itself worth saying rather than hiding behind a rosier assumption.

## The one assumed input
Years to close 90% of the gap to that ceiling: **10 (fast)**, **15 (default)**, **20 (slow)**. Not fitted, not cited — a named, swappable assumption. Replace with real nursery/arborist input before using this for anything beyond an illustrative pitch chart.

## Top 50 ranked sites, planted vs doing nothing — average canopy % over time
Today's average across the top 50 sites: **3.8%**.

| year | do_nothing | fast | default | slow |
|---|---|---|---|---|
| 0 | 3.8 | 3.8 | 3.8 | 3.8 |
| 5 | 3.8 | 11.5 | 9.9 | 8.7 |
| 10 | 3.8 | 14.0 | 12.7 | 11.5 |
| 15 | 3.8 | 14.7 | 14.0 | 13.1 |
| 20 | 3.8 | 15.0 | 14.6 | 14.0 |
| 25 | 3.8 | 15.1 | 14.9 | 14.5 |

At year 25: **fast** reaches 15.1%, **default** reaches 14.9%, **slow** reaches 14.5%, against 3.8% doing nothing.
