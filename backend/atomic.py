"""Atomic file writes: readers see the old file or the complete new one, never a half-written one.

Every cache file the API reads goes through these helpers. A file is written to a temp file in the same folder,
flushed to disk, then swapped in with os.replace (atomic on Windows and POSIX). If anything fails, the temp
file is removed and the previous file is left exactly as it was.
"""
import json
import os
import time
from pathlib import Path
from typing import Callable


SWAP_RETRIES = 25     # Windows refuses to replace a file while a reader has it open: wait briefly and retry
SWAP_WAIT_S = 0.02


def _replace(tmp: Path, path: Path) -> None:
    for attempt in range(SWAP_RETRIES):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == SWAP_RETRIES - 1:
                raise
            time.sleep(SWAP_WAIT_S)


def _swap_in(path: Path, write_tmp: Callable[[Path], None]) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        write_tmp(tmp)
        _replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)  # only present if something failed before the swap
    return path


def write_bytes(path: Path, data: bytes) -> Path:
    def go(tmp: Path) -> None:
        with open(tmp, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
    return _swap_in(path, go)


def write_text(path: Path, text: str, encoding: str = "utf-8") -> Path:
    return write_bytes(path, text.encode(encoding))


def write_json(path: Path, obj, indent: int = None) -> Path:
    return write_text(path, json.dumps(obj, indent=indent))


def write_geodataframe(gdf, path: Path, driver: str = "GeoJSON") -> Path:
    """Write a GeoDataFrame via a temp file. The driver must be given because the temp name has no extension hint,
    and the layer name is pinned to the final file's name so the temp file's name (with its process id) never
    leaks into the output; that keeps rebuilds byte-identical."""
    return _swap_in(path, lambda tmp: gdf.to_file(tmp, driver=driver, layer=Path(path).stem))


def write_csv(df, path: Path, **kwargs) -> Path:
    return _swap_in(path, lambda tmp: df.to_csv(tmp, **kwargs))


def write_image(image, path: Path, fmt: str = "PNG") -> Path:
    """Save a PIL image atomically."""
    return _swap_in(path, lambda tmp: image.save(tmp, format=fmt))
