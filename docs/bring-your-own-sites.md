# Bring your own sites

Written for: a Sime Darby Property planner (or a mentor) who has a list of real candidate points and wants to see how this tool would treat them, and for judges asking "could our own list be dropped in?". **Yes, for any point inside the Elmina study area, offline, with one command.** It is a command-line step today, not a button in the web app.

## What it does
```bash
python -m backend.my_sites docs/examples/my_sites_example.csv      # writes my_sites_example_scored.csv and .geojson beside the input
python -m backend.my_sites your_points.csv --out some/folder
```
Each point becomes a 30 m cell centred on it. The cell goes through **exactly the code that measures the simulated candidate sites** (`backend.sites.generate.features_for_cells`) on the cached satellite rasters and OpenStreetMap layers, and the scoring model (`ml/scoring_model.py`) scores it with the project's default weights. Nothing is downloaded and nothing needs Earth Engine.

**Input:** a CSV with `lat` and `lon` (decimal degrees, WGS84) and, optionally, `site_id` and `name`. At most 2,000 points. Site ids are 1 to 40 letters, digits, dot, dash or underscore.

**Output:** a CSV and a GeoJSON with, for each scored point: the three scores and the total, `rank_in_your_list`, `would_rank_among_simulated` (where it would sit among the 564 simulated sites, using the model's own tie rule), the main measurements, and a `flags` column. Text cells that could run as a spreadsheet formula are neutralised.

## What it checks, and what it refuses
- **A bad file is refused whole**, with a line number for every problem (wrong columns, non-numeric or out-of-range coordinates, a bad or repeated id, no rows, too many rows). Nothing is scored from a half-good file.
- A point **outside the Elmina study area** is reported and not scored. A point with **no usable satellite data** (open water, cloud) is reported and not scored.
- A point **on or beside a mapped building or road**, or where the **ground temperature is mostly filled in from neighbours**, is scored and flagged.

## How to read the scores
- Scores are **percentile ranks against the simulated Elmina candidate set**: "hotter than 90% of those sites". They show how a point compares with that set, not how good it is in absolute terms.
- It is a **screening aid**. It knows nothing about land ownership, utilities, soil, tree health or what is on the ground; the field checks in the Tracker and Advanced tools exist for that.
- The measurements inherit every limit in [limitations.md](limitations.md): the corridor is approximate, canopy is a proxy, thermal data is coarse.

## How we know it uses the same method
`backend/tests/test_my_sites.py` scores the **centre point of simulated sites** and checks that every score, and the rank among the simulated sites, equals the committed value exactly. A second test rebuilds all the simulated sites through the shared code path and checks the data version is unchanged, so the refactor that made this possible did not change a single committed number.

## What is not built
A web upload (the scoring needs the rasters and Python, so it would be a server endpoint), a map of the uploaded points, and use outside Elmina (that needs the pipeline run for another township: see [commercial-case.md](commercial-case.md)).
