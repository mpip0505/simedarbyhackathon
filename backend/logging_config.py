"""One-line logging setup. Level from the LOG_LEVEL environment variable (default INFO)."""
import logging
import os


def setup() -> None:
    """Send `backend.*` logs to stderr unless the host application (uvicorn, pytest) already configured logging."""
    if not logging.getLogger().handlers:
        logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(),
                            format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("backend").setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
