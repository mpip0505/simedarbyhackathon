"""Earth Engine calls with retries for transient failures (503s, timeouts)."""
from backend.retry import retry


def get_info(obj, what: str = "Earth Engine request"):
    """obj.getInfo(), retried on transient errors. A wrong query still fails immediately."""
    return retry(obj.getInfo, what=what)
