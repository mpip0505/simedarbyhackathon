"""The shared data contract. Backend fills the measured fields, ML fills the score fields."""
from typing import Literal, Optional

from pydantic import BaseModel, Field


class SiteProperties(BaseModel):
    site_id: str
    source: Literal["simulated", "mock"]
    area_m2: float = Field(gt=0)

    # Backend-measured (from satellite + OSM)
    ndvi_mean: float = Field(ge=-1, le=1)
    lst_c_mean: float  # ranking-grade only
    canopy_pct_baseline: float = Field(ge=0, le=100)
    dist_to_path_m: float = Field(ge=0)
    path_length_within_50m: float = Field(ge=0)
    corridor_gap_flag: bool
    corridor_gap_dist_m: float = Field(ge=0)

    # ML-owned (null until the scoring step has run); each score is 0-100
    score_cooling: Optional[float] = Field(default=None, ge=0, le=100)
    score_connectivity: Optional[float] = Field(default=None, ge=0, le=100)
    score_shade: Optional[float] = Field(default=None, ge=0, le=100)
    score_total: Optional[float] = Field(default=None, ge=0, le=100)
    rank: Optional[int] = Field(default=None, ge=1)


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
    caveats: list[str]
