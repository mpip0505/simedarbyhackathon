"""FastAPI service. Run:  uvicorn backend.api.main:app --reload --port 8000"""
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.api import store
from backend.config import CAVEATS
from backend.schema import Meta, Summary

app = FastAPI(title="Elmina Canopy Prioritiser API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def _ranked_features() -> list[dict]:
    feats = store.load_sites()["features"]
    return sorted(feats, key=lambda f: (f["properties"].get("rank") is None, f["properties"].get("rank") or 0))


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/meta", response_model=Meta)
def meta() -> Meta:
    corridor = store.load_corridor()["features"]
    return Meta(
        data_mode=store.data_mode(),
        site_count=len(store.load_sites()["features"]),
        corridor_approximate=any(f["properties"].get("approximate", True) for f in corridor),
        caveats=CAVEATS,
    )


@app.get("/sites")
def sites(min_score: Optional[float] = Query(None, ge=0, le=100),
          limit: Optional[int] = Query(None, ge=1)) -> dict:
    feats = _ranked_features()
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


@app.get("/layers/corridor")
def corridor() -> dict:
    return store.load_corridor()
