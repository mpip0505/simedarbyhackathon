"""Render the cached NDVI / temperature rasters as transparent PNG map overlays.

Run:  python -m backend.overlays
Writes backend/data/cache/overlays/<layer>_<period>.png and overlays.json (bounds, colour ranges).
Baseline and latest share one colour range per layer, so the before/after maps are directly comparable.
"""
import json

import matplotlib
import numpy as np
import rasterio
from PIL import Image

from backend.config import CACHE_DIR

matplotlib.use("Agg")
OVERLAY_DIR = CACHE_DIR / "overlays"
RASTER_DIR = CACHE_DIR / "rasters"
LAYERS = {
    "ndvi": {"cmap": "YlGn", "vmin": -0.1, "vmax": 0.8, "unit": "NDVI", "title": "Vegetation (NDVI)"},
    "lst": {"cmap": "YlOrRd", "vmin": 32.0, "vmax": 50.0, "unit": "deg C", "title": "Surface temperature (ranking-grade)"},
}
PERIODS = ("baseline", "latest")


def to_rgba(arr: np.ndarray, vmin: float, vmax: float, cmap: str) -> np.ndarray:
    """Colour-map finite values; non-finite (no data) pixels become fully transparent."""
    finite = np.isfinite(arr)
    scaled = np.clip((np.where(finite, arr, vmin) - vmin) / (vmax - vmin), 0, 1)
    rgba = (matplotlib.colormaps[cmap](scaled) * 255).astype("uint8")
    rgba[..., 3] = np.where(finite, 255, 0)
    return rgba


def main() -> None:
    OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
    items = []
    for layer, spec in LAYERS.items():
        for period in PERIODS:
            with rasterio.open(RASTER_DIR / f"{layer}_{period}.tif") as src:
                arr = src.read(1).astype("float32")
                b = src.bounds
            name = f"{layer}_{period}"
            Image.fromarray(to_rgba(arr, spec["vmin"], spec["vmax"], spec["cmap"]), "RGBA").save(
                OVERLAY_DIR / f"{name}.png")
            items.append({"name": name, "layer": layer, "period": period, "title": spec["title"],
                          "unit": spec["unit"], "vmin": spec["vmin"], "vmax": spec["vmax"], "cmap": spec["cmap"],
                          "bounds": [[b.bottom, b.left], [b.top, b.right]],  # Leaflet order: [[south, west], [north, east]]
                          "url": f"/layers/overlays/{name}.png",
                          "note": "gap-filled from neighbours within 100 m" if layer == "lst" else ""})
    (OVERLAY_DIR / "overlays.json").write_text(json.dumps({"overlays": items}, indent=1), encoding="utf-8")
    print(f"wrote {len(items)} overlays to {OVERLAY_DIR}")


if __name__ == "__main__":
    main()
