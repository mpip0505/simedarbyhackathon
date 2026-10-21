"""FastAPI service. Run:  uvicorn backend.api.main:app --reload --port 8000

Errors are always small JSON bodies with a request id (also sent as the X-Request-ID header); details and stack
traces go to the log, never to the client.
"""
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend import logging_config
from backend.api import scoring, selfcheck, store
from backend.config import ATTRIBUTION, CAVEATS
from backend.schema import Meta, Summary

logging_config.setup()
log = logging.getLogger("backend.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Check the data once at startup and say clearly what is being served."""
    result = selfcheck.check()
    log.info("startup: data_mode=%s sites=%d ok=%s", result["data_mode"], result["site_count"], result["ok"])
    for w in result["warnings"]:
        log.warning("startup warning: %s", w)
    for p in result["problems"]:
        log.error("startup PROBLEM: %s", p)
    yield


app = FastAPI(title="Elmina Canopy Prioritiser API", version="0.3.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Request id on every response, one log line per request, and no unhandled exception ever reaches the client."""
    rid = uuid.uuid4().hex[:8]
    request.state.request_id = rid
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error [%s] %s %s", rid, request.method, request.url.path)
        response = JSONResponse({"error": "internal_error", "detail": "Something went wrong on the server.",
                                 "request_id": rid}, status_code=500)
    response.headers["X-Request-ID"] = rid
    log.info("%s %s -> %d (%.0f ms) [%s]", request.method, request.url.path, response.status_code,
             (time.perf_counter() - start) * 1000, rid)
    return response


@app.exception_handler(store.DataUnavailable)
async def data_unavailable(request: Request, exc: store.DataUnavailable):
    rid = getattr(request.state, "request_id", None)
    log.error("data unavailable [%s]: %s", rid, exc)
    detail = str(exc) if store.details_enabled() else "Required data is not available right now."
    return JSONResponse({"error": "data_unavailable", "detail": detail, "request_id": rid}, status_code=503)


def _ranked_features(data: dict, weights: Optional[dict] = None) -> list[dict]:
    feats = data["features"]
    if weights:
        scoring.retotal(feats, weights)
    return sorted(feats, key=lambda f: f["properties"]["rank"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/deep")
def health_deep() -> JSONResponse:
    """Checks every data file against the contract. 200 when sound, 503 otherwise. Clients get pass/fail and counts;
    the detail is in the server log (and in the response only when API_EXPOSE_DETAILS=1)."""
    result = selfcheck.check()
    for p in result["problems"]:
        log.error("health/deep PROBLEM: %s", p)
    for w in result["warnings"]:
        log.warning("health/deep warning: %s", w)
    return JSONResponse(selfcheck.public_view(result), status_code=200 if result["ok"] else 503)


@app.get("/meta", response_model=Meta)
def meta() -> Meta:
    corridor = store.load_corridor()["features"]
    data = store.load_sites()
    feats = data["features"]
    return Meta(
        data_mode=store.data_mode(),
        site_count=len(feats),
        corridor_approximate=any(f["properties"].get("approximate", True) for f in corridor),
        score_source=store.score_source(feats),
        generated_at=store.generated_at(),
        data_version=data.get("data_version"),
        sources_built=store.sources_built(),
        attribution=ATTRIBUTION,
        caveats=CAVEATS,
        **store.scores_status(data),
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
    feats = _ranked_features(store.load_sites(), chosen)
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


@app.get("/layers/corridor/spine")
def corridor_spine() -> dict:
    """The dashed connector lines between parks (approximate, like the corridor itself)."""
    spine = store.load_spine()
    if spine is None:
        raise HTTPException(status_code=404, detail="No corridor spine in this data set (mock data has none)")
    return spine


@app.get("/layers/osm/{name}")
def osm_layer(name: str) -> dict:
    """Cached OpenStreetMap layer for an offline basemap: buildings, roads, paths, parks or open_land."""
    layer = store.load_osm_layer(name)
    if layer is None:
        raise HTTPException(status_code=404, detail=f"No such OSM layer: {name}")
    return layer


@app.get("/summary/crosscheck")
def summary_crosscheck() -> dict:
    """Our canopy proxy against ESA WorldCover and Dynamic World (both satellite maps, not field truth)."""
    result = store.load_crosscheck()
    if result is None:
        raise HTTPException(status_code=404, detail="No cross-check in this data set (mock data has none)")
    return result


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


# ---- the bundled barebones web app (frontend/), served from the same process ----
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


@app.get("/", include_in_schema=False)
def root():
    """Send visitors to the web app when it is present, otherwise to the API docs."""
    return RedirectResponse("/app/" if FRONTEND_DIR.is_dir() else "/docs")


if FRONTEND_DIR.is_dir():
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="app")
