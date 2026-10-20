"""Retry flaky network calls (Earth Engine, OpenStreetMap) but never retry our own mistakes.

Only failures that look transient are retried (HTTP 429/5xx, timeouts, dropped connections). A wrong query or a
missing permission fails at once, so a real bug is not hidden behind several minutes of waiting.
"""
import logging
import re
import socket
import time
from typing import Callable

log = logging.getLogger("backend.retry")

TRANSIENT_MARKERS = ("too many requests", "timed out", "timeout",
                     "temporarily", "try again", "connection reset", "connection aborted", "connection refused",
                     "remote end closed", "internal error", "service unavailable", "bad gateway",
                     "gateway time-out", "computation timed out", "backend error", "max retries exceeded",
                     "failed to establish", "name resolution", "temporary failure", "urlopen error")
STATUS_CODE = re.compile(r"(?<![\w.])(429|500|502|503|504)(?![\w.])")  # whole numbers only: not "1500" or "500m"
TRANSIENT_TYPES = (TimeoutError, ConnectionError, socket.timeout)


def is_transient(exc: BaseException) -> bool:
    """True for failures worth retrying. Checks the exception type, its message, and what caused it."""
    seen = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        if isinstance(exc, TRANSIENT_TYPES):
            return True
        text = str(exc).lower()
        if STATUS_CODE.search(text) or any(marker in text for marker in TRANSIENT_MARKERS):
            return True
        exc = exc.__cause__ or exc.__context__
    return False


def retry(fn: Callable, *, what: str = "request", attempts: int = 4, wait: float = 5.0,
          sleep: Callable[[float], None] = None):
    """Call fn(); on a transient failure wait wait*attempt seconds and try again, up to `attempts` times.
    Non-transient errors are raised immediately and unchanged. After the last attempt a RuntimeError names the call."""
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:
            if not is_transient(exc):
                raise
            if attempt == attempts:
                raise RuntimeError(f"{what} failed after {attempts} attempts: {exc}") from exc
            delay = wait * attempt
            log.warning("%s: attempt %d/%d failed (%s); retrying in %.0f s", what, attempt, attempts,
                        str(exc)[:80], delay)
            print(f"  {what}: attempt {attempt}/{attempts} failed ({str(exc)[:60]}), retrying in {delay:.0f} s", flush=True)
            (sleep or time.sleep)(delay)
