"""Vercel entry point: the same FastAPI app the Dockerfile serves (web app at /app/, API at the root), from the committed cache.
vercel.json rewrites every path here. Nothing is written at runtime, so Vercel's read-only file system is fine."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api.main import app  # noqa: E402,F401
