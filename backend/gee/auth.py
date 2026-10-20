"""Earth Engine initialisation with an actionable error message."""
import ee

from backend.config import GEE_PROJECT


def init() -> None:
    if not GEE_PROJECT:
        raise SystemExit("GEE_PROJECT is not set. PowerShell: $env:GEE_PROJECT = '<your-project-id>'")
    try:
        ee.Initialize(project=GEE_PROJECT)
    except Exception as exc:  # ee raises several unrelated exception types
        raise SystemExit(f"Earth Engine init failed ({exc}). Run 'earthengine authenticate' first.") from exc
