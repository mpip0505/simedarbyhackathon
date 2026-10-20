import socket
import urllib.error

import pytest
import requests

from backend import retry as r
from backend.osm import fetch_api


class Flaky:
    """Fails `fails` times with `exc`, then returns 'ok'."""
    def __init__(self, fails, exc):
        self.fails, self.exc, self.calls = fails, exc, 0

    def __call__(self):
        self.calls += 1
        if self.calls <= self.fails:
            raise self.exc
        return "ok"


@pytest.mark.parametrize("exc", [
    urllib.error.HTTPError("http://x", 503, "Service Unavailable", {}, None),
    requests.exceptions.ReadTimeout("Read timed out. (read timeout=180)"),
    requests.exceptions.ConnectionError("Max retries exceeded with url: /api (Failed to establish a new connection)"),
    requests.exceptions.HTTPError("502 Server Error: Bad Gateway for url: https://api.openstreetmap.org"),
    ConnectionResetError("connection reset by peer"), socket.timeout("timed out"), TimeoutError(),
    Exception("Earth Engine internal error, please try again"),
    Exception("HTTP Error 429: Too Many Requests"),
])
def test_transient_failures_are_recognised(exc):
    assert r.is_transient(exc)


@pytest.mark.parametrize("exc", [
    ValueError("Image.rename: Invalid band name: 't0.7'."),
    KeyError("site_id"),
    Exception("Earth Engine: Permission denied on project x (403)"),
    PermissionError("access denied"),
    ValueError("too many pixels: 1500 pixels at 500m scale, limit 5000"),
    KeyError("tile_5030"),
    urllib.error.HTTPError("http://x", 404, "Not Found", {}, None),
])
def test_our_own_mistakes_are_not_retried(exc):
    assert not r.is_transient(exc)


def test_cause_chain_is_followed():
    try:
        try:
            raise TimeoutError("socket stalled")
        except TimeoutError as inner:
            raise RuntimeError("wrapper with no useful words") from inner
    except RuntimeError as outer:
        assert r.is_transient(outer)


def test_retries_then_succeeds_and_waits_longer_each_time():
    fn, waits = Flaky(2, ConnectionResetError("connection reset")), []
    assert r.retry(fn, what="t", wait=5, sleep=waits.append) == "ok"
    assert fn.calls == 3 and waits == [5, 10]


def test_gives_up_after_the_last_attempt_with_a_clear_message():
    fn = Flaky(99, TimeoutError("timed out"))
    with pytest.raises(RuntimeError, match=r"my call failed after 3 attempts: timed out") as e:
        r.retry(fn, what="my call", attempts=3, sleep=lambda s: None)
    assert fn.calls == 3 and isinstance(e.value.__cause__, TimeoutError)


def test_non_transient_error_is_raised_immediately_and_unchanged():
    fn, bad = Flaky(99, ValueError("Invalid band name")), None
    with pytest.raises(ValueError, match="Invalid band name"):
        r.retry(fn, sleep=lambda s: pytest.fail("must not wait for a real bug"))
    assert fn.calls == 1


def test_systemexit_is_not_swallowed():
    def stop():
        raise SystemExit("OSM API refused the box")
    with pytest.raises(SystemExit):
        r.retry(stop, sleep=lambda s: None)


def test_retry_uses_time_sleep_by_default(monkeypatch):
    slept = []
    monkeypatch.setattr(r.time, "sleep", slept.append)
    r.retry(Flaky(1, TimeoutError("timed out")), wait=2)
    assert slept == [2]


# ---- the OSM download uses it ----

class Resp:
    def __init__(self, status, content=b"<osm/>"):
        self.status_code, self.content = status, content

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"{self.status_code} Server Error")


def test_osm_download_survives_two_503s(tmp_path, monkeypatch):
    answers = iter([Resp(503), Resp(503), Resp(200, b"<osm>data</osm>")])
    monkeypatch.setattr(fetch_api.requests, "get", lambda *a, **k: next(answers))
    monkeypatch.setattr(r.time, "sleep", lambda s: None)
    monkeypatch.setattr(fetch_api, "OUT_FILE", tmp_path / "out.osm")
    monkeypatch.setattr(fetch_api, "RAW_DIR", tmp_path)
    monkeypatch.setattr(fetch_api, "bbox_for_request", lambda: (101.49, 3.16, 101.53, 3.21))
    fetch_api.main()
    assert (tmp_path / "out.osm").read_bytes() == b"<osm>data</osm>"
    assert [p.name for p in tmp_path.iterdir()] == ["out.osm"]


def test_osm_download_does_not_retry_a_400(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(fetch_api.requests, "get", lambda *a, **k: calls.append(1) or Resp(400))
    monkeypatch.setattr(fetch_api, "RAW_DIR", tmp_path)
    monkeypatch.setattr(fetch_api, "bbox_for_request", lambda: (101.49, 3.16, 101.53, 3.21))
    with pytest.raises(SystemExit, match="refused the box"):
        fetch_api.main()
    assert len(calls) == 1
