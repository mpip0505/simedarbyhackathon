"""Central settings. Everything team-tunable lives here."""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
MOCK_DIR = BACKEND_DIR / "data" / "mock"
CACHE_DIR = BACKEND_DIR / "data" / "cache"
INPUT_DIR = BACKEND_DIR / "data" / "input"

# Google Cloud project registered for Earth Engine (set in your shell, never commit).
GEE_PROJECT = os.environ.get("GEE_PROJECT", "")

# Area of interest for City of Elmina: (west, south, east, north).
# Bounds of the OpenStreetMap "Elmina" area polygon (Nominatim, checked 2026-10-20). Still an
# OSM boundary, not Sime Darby Property's own township boundary.
ELMINA_BBOX = (101.4925, 3.1603, 101.5289, 3.2135)

# Before/after comparison windows (inclusive), two years each so both pool enough clear Landsat
# looks (single 2022 gave only ~1.6 clear observations per pixel). Landsat 9 starts late 2021.
BASELINE_PERIOD = ("2021-10-01", "2023-09-30")
LATEST_PERIOD = ("2024-10-01", "2026-09-30")

# Canopy proxy: NDVI at or above this counts as "canopy". A proxy, not a tree census.
# Team must agree on the value before it appears in any report.
CANOPY_NDVI_THRESHOLD = 0.6

# Weights used only when the API re-totals scores (ML owns the real default).
DEFAULT_WEIGHTS = {"cooling": 0.4, "connectivity": 0.35, "shade": 0.25}

# Required credits (OpenStreetMap's licence requires attribution). Shown by /meta; show them in the UI footer.
ATTRIBUTION = [
    "Map data © OpenStreetMap contributors (ODbL)",
    "Contains modified Copernicus Sentinel-2 data (European Space Agency)",
    "Landsat 8/9 Collection 2 Level-2 data, courtesy of the U.S. Geological Survey",
    "Processed with Google Earth Engine",
]

# Shown by /meta and /summary so no consumer can miss them.
CAVEATS = [
    "Candidate planting sites are SIMULATED from open land; they are not Sime Darby Property's real site list.",
    "The corridor polygon is APPROXIMATE (derived from OpenStreetMap) unless an official polygon is supplied.",
    "Land surface temperature comes from Landsat thermal bands (about 100 m native resolution). Use it to rank sites, not to quote exact temperatures.",
    "About 18% of the area has no reliable Landsat pixel after cloud and quality masking; site temperatures there "
    "are filled from neighbouring pixels within 100 m. Reported before/after temperature averages are not filled.",
    "Imagery is a multi-date median composite to cope with tropical cloud cover; composites can blur short-lived changes.",
    "Canopy cover is an NDVI-threshold proxy, not a tree count, and it depends heavily on the threshold chosen.",
    "Canopy proxy values vary by about 5 percentage points between single years (see canopy_sensitivity.json), "
    "so small before/after differences in canopy are within noise and should not be reported as change.",
    "Independent satellite land-cover maps disagree on Elmina's canopy share (crosscheck.json): ESA WorldCover (2021) "
    "maps about 28% as tree cover, Google Dynamic World about 7% falling to about 4%, and our NDVI proxy about 10%. "
    "Canopy % is therefore uncertain by a factor of several, and none of the references supports a direction of change.",
]
