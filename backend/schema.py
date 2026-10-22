"""The shared data contract. Backend fills the measured fields, ML fills the score fields."""
from typing import Literal, Optional

from pydantic import BaseModel, Field


class SiteProperties(BaseModel):
    site_id: str
    source: Literal["simulated", "mock"]
    area_m2: float = Field(gt=0)
    origin: Optional[Literal["open_land", "corridor_edge"]] = None  # where the candidate cell came from

    # Backend-measured (from satellite + OSM)
    ndvi_mean: float = Field(ge=-1, le=1)
    lst_c_mean: float  # ranking-grade only
    canopy_pct_baseline: float = Field(ge=0, le=100)
    dist_to_path_m: float = Field(ge=0)
    path_length_within_50m: float = Field(ge=0)
    corridor_gap_flag: bool
    corridor_gap_dist_m: float = Field(ge=0)

    # Extra measured features (optional so older/mock data still validates)
    ndvi_mean_baseline: Optional[float] = Field(default=None, ge=-1, le=1)
    lst_c_mean_baseline: Optional[float] = None
    ndvi_change: Optional[float] = None       # latest minus baseline; noisy, do not treat as growth
    lst_change_c: Optional[float] = None      # latest minus baseline; indicative only
    lst_valid_frac: Optional[float] = Field(default=None, ge=0, le=1)  # share of the cell's temperature that is real, not gap-filled
    lst_mean_100m: Optional[float] = None     # surroundings: mean temperature within 100 m
    lst_mean_250m: Optional[float] = None
    ndvi_mean_100m: Optional[float] = Field(default=None, ge=-1, le=1)
    ndvi_mean_250m: Optional[float] = Field(default=None, ge=-1, le=1)
    buildings_within_250m: Optional[int] = Field(default=None, ge=0)
    residential_buildings_within_250m: Optional[int] = Field(default=None, ge=0)
    built_up_frac_250m: Optional[float] = Field(default=None, ge=0, le=1)
    uncovered_path_length_50m: Optional[float] = Field(default=None, ge=0)  # metres of nearby path with low canopy
    path_canopy_frac_50m: Optional[float] = Field(default=None, ge=0, le=1)  # share of nearby path under canopy
    dist_to_corridor_spine_m: Optional[float] = Field(default=None, ge=0)
    dist_to_nearest_park_m: Optional[float] = Field(default=None, ge=0)
    in_corridor: Optional[bool] = None
    block_id: Optional[str] = None            # 250 m spatial block, use it to split train/test or folds

    # ML-owned (null until the scoring step has run); each score is 0-100
    score_cooling: Optional[float] = Field(default=None, ge=0, le=100)
    score_connectivity: Optional[float] = Field(default=None, ge=0, le=100)
    score_shade: Optional[float] = Field(default=None, ge=0, le=100)
    score_total: Optional[float] = Field(default=None, ge=0, le=100)
    rank: Optional[int] = Field(default=None, ge=1)
    score_source: Optional[Literal["ml", "placeholder", "mock"]] = None  # who produced the scores


class Period(BaseModel):
    label: str
    start: str
    end: str
    canopy_pct: float = Field(ge=0, le=100)
    mean_lst_c: float


class Summary(BaseModel):
    baseline: Period
    latest: Period
    delta_canopy_pct_points: float
    delta_mean_lst_c: float
    caveats: list[str]


class Meta(BaseModel):
    data_mode: Literal["mock", "cache"]
    site_count: int
    corridor_approximate: bool
    corridor_source: Optional[str] = None       # which corridor the gap results use: approximate (OpenStreetMap parks) or an official polygon
    score_source: Literal["ml", "placeholder", "mock"]
    generated_at: Optional[str] = None  # when the cached data was built (None for mock data)
    data_version: Optional[str] = None          # hash of the current sites; ML scores echo it back
    scores_data_version: Optional[str] = None   # data_version the merged ML scores were computed on
    scores_error: Optional[str] = None          # set when scores.geojson was rejected and placeholders are served
    scores_stale: Optional[bool] = None         # True when ML scores were computed on different data; None if unknown
    sources_built: Optional[dict] = None  # when OSM and satellite data were really downloaded/computed
    attribution: list[str]
    caveats: list[str]
