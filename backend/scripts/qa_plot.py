"""Quick visual sanity check of the data: sites over buildings, roads, paths, parks and the corridor.

Run:  python -m backend.scripts.qa_plot [output.png]     (default docs/qa-map.png)
"""
import sys
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from backend.api import store  # noqa: E402
from backend.config import BACKEND_DIR, CACHE_DIR  # noqa: E402
from backend.osm.extract import OSM_DIR  # noqa: E402


def main(out: Path) -> None:
    read = lambda n: gpd.read_file(OSM_DIR / f"{n}.geojson")
    fig, ax = plt.subplots(figsize=(9, 12))
    gpd.read_file(OSM_DIR / "aoi.geojson").boundary.plot(ax=ax, color="black", linewidth=1)
    read("buildings").plot(ax=ax, color="#cfcfcf", linewidth=0)
    read("roads").plot(ax=ax, color="#9a9a9a", linewidth=0.5)
    read("paths").plot(ax=ax, color="#1f77b4", linewidth=0.6)
    read("parks").plot(ax=ax, color="#7fc97f", alpha=0.7, linewidth=0)
    gpd.read_file(CACHE_DIR / "corridor.geojson").boundary.plot(ax=ax, color="#d95f02", linewidth=1.2)
    gpd.read_file(CACHE_DIR / "corridor_spine.geojson").plot(ax=ax, color="#d95f02", linewidth=1.5, linestyle="--")
    feats = store.load_sites()["features"]
    sites = gpd.GeoDataFrame([f["properties"] for f in feats],
                             geometry=gpd.GeoSeries.from_xy([0] * len(feats), [0] * len(feats)), crs=4326)
    sites["geometry"] = gpd.GeoDataFrame.from_features(feats, crs=4326).geometry.values
    sites.plot(ax=ax, column="score_total", cmap="viridis", legend=True, linewidth=0.2, edgecolor="white",
               legend_kwds={"label": "score_total (placeholder unless ML merged)", "shrink": 0.5})
    ax.set_title(f"Elmina QA map: {len(sites)} simulated sites ({store.score_source(feats)} scores)\n"
                 "grey = buildings/roads, blue = paths, green = parks, orange = approximate corridor + spine")
    ax.set_aspect(1 / 0.9993)  # equal-ish scale at 3 deg N
    fig.tight_layout()
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=110)
    print(f"saved {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else BACKEND_DIR.parent / "docs" / "qa-map.png")
