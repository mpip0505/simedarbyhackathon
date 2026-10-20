"""Loads site/corridor/summary files. Prefers real cached data, falls back to mock."""
import json
from pathlib import Path

from backend.config import CACHE_DIR, MOCK_DIR


def data_dir() -> Path:
    return CACHE_DIR if (CACHE_DIR / "sites.geojson").exists() else MOCK_DIR


def data_mode() -> str:
    return "cache" if data_dir() == CACHE_DIR else "mock"


def _load(name: str) -> dict:
    return json.loads((data_dir() / name).read_text(encoding="utf-8"))


def load_sites() -> dict:
    return _load("sites.geojson")


def load_corridor() -> dict:
    return _load("corridor.geojson")


def load_summary() -> dict:
    return _load("summary.json")
