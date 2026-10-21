"""Small stdlib-only provenance helpers shared by artifact builders and the serving API."""
import hashlib
from pathlib import Path


def file_hashes(directory: Path, names: list[str]) -> dict:
    return {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in sorted(names)}


def inputs_stale(directory: Path, expected: dict) -> bool | None:
    if not expected:
        return None
    try:
        # Only known OSM filenames can be checked; an artifact cannot nominate arbitrary local files.
        allowed = {f"{n}.geojson" for n in ("open_land", "parks", "roads", "buildings", "paths")}
        if not set(expected) <= allowed:
            return True
        return file_hashes(directory, list(expected)) != expected
    except OSError:
        return None
