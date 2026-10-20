"""FastAPI service. Run:  uvicorn backend.api.main:app --reload --port 8000"""
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.api import scoring, store
from backend.config import ATTRIBUTION, CAVEATS
from backend.schema import Meta, Summary

app = FastAPI(title="Elmina Canopy Prioritiser API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def _ranked_features(weights: Optional[dict] = None) -> list[dict]:
    feats = store.load_sites()["features"]
    if weights:
        scoring.retotal(feats, weights)
    return sorted(feats, key=lambda f: f["properties"]["rank"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/meta", response_model=Meta)
def meta() -> Meta:
    corridor = store.load_corridor()["features"]
    feats = store.load_sites()["features"]
    return Meta(
        data_mode=store.data_mode(),
        site_count=len(feats),
        corridor_approximate=any(f["properties"].get("approximate", True) for f in corridor),
        score_source=store.score_source(feats),
        generated_at=store.generated_at(),
        sources_built=store.sources_built(),
        attribution=ATTRIBUTION,
        caveats=CAVEATS,
    )


@app.get("/weights")
def weights() -> dict:
    """Default weights (sum to 1). Initialise the sliders from this so Frontend and ML never disagree."""
    return {"default": store.default_weights(), "source": store.weights_source()}


@app.get("/sites")
def sites(min_score: Optional[float] = Query(None, ge=0, le=100),
          limit: Optional[int] = Query(None, ge=1),
          w_cooling: Optional[float] = Query(None, ge=0),
          w_connectivity: Optional[float] = Query(None, ge=0),
          w_shade: Optional[float] = Query(None, ge=0)) -> dict:
    """Ranked sites. Pass any of w_cooling / w_connectivity / w_shade to re-total and re-rank
    (unset ones keep their default weight; weights are normalised to sum to 1)."""
    given = {"cooling": w_cooling, "connectivity": w_connectivity, "shade": w_shade}
    chosen = None
    if any(v is not None for v in given.values()):
        base = store.default_weights()
        chosen = {k: base[k] if v is None else v for k, v in given.items()}
        if sum(chosen.values()) <= 0:
            raise HTTPException(status_code=422, detail="weights must not all be zero")
    feats = _ranked_features(chosen)
    if min_score is not None:
        feats = [f for f in feats if (f["properties"].get("score_total") or 0) >= min_score]
    if limit is not None:
        feats = feats[:limit]
    return {"type": "FeatureCollection", "features": feats}


@app.get("/sites/{site_id}")
def site_detail(site_id: str) -> dict:
    for f in store.load_sites()["features"]:
        if f["properties"]["site_id"] == site_id:
            return f
    raise HTTPException(status_code=404, detail=f"Unknown site_id: {site_id}")


@app.get("/summary", response_model=Summary)
def summary() -> dict:
    return store.load_summary()


@app.get("/summary/series")
def summary_series() -> dict:
    """Yearly canopy (with a low/high band) and surface temperature, for the 'over time' chart."""
    series = store.load_series()
    if series is None:
        raise HTTPException(status_code=404, detail="No yearly series in this data set (mock data has none)")
    return series


@app.get("/layers/corridor")
def corridor() -> dict:
    return store.load_corridor()


@app.get("/layers/overlays")
def overlays() -> dict:
    """Before/after map images: url, map bounds ([[south, west], [north, east]]), colour range, unit."""
    index = store.load_overlays()
    if index is None:
        raise HTTPException(status_code=404, detail="No overlay images in this data set (mock data has none)")
    return index


@app.get("/layers/overlays/{name}.png")
def overlay_image(name: str) -> FileResponse:
    path = store.overlay_file(name)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail=f"Unknown overlay: {name}")
    return FileResponse(path, media_type="image/png")
