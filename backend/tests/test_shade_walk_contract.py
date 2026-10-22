"""The timed shade-walk sheet: the app's columns, the template file and the protocol must agree. Reads the JavaScript source, no browser needed."""
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / "frontend" / "js" / "shade-walk.js"
FIELD = ROOT / "docs" / "field-check"


def js_list(name: str) -> list:
    m = re.search(rf"export const {name}\s*=\s*\[(.*?)\];", JS.read_text(encoding="utf-8"), re.S)
    assert m, name
    return re.findall(r'"([^"]*)"', m.group(1))


def test_the_template_header_matches_the_apps_columns():
    with (FIELD / "shade_walk_sheet_template.csv").open(encoding="utf-8") as fh:
        assert next(csv.reader(fh)) == js_list("WALK_COLUMNS")


def test_the_example_uses_the_same_columns_and_is_marked_synthetic_in_every_row():
    with (FIELD / "shade_walk_example_synthetic.csv").open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    assert rows and list(rows[0].keys()) == js_list("WALK_COLUMNS")
    assert all("SYNTHETIC" in r["notes"] and "SYNTHETIC" in r["route_id"] for r in rows)
    allowed = set(js_list("PARTICIPANT_TYPES"))
    assert {r["participant_type"] for r in rows} <= allowed


def test_the_protocol_states_the_limits():
    text = (ROOT / "docs" / "shade-walk-protocol.md").read_text(encoding="utf-8")
    for phrase in ("No shade walks have been done yet", "baseline", "route-use counts", "Proxy and team walks are not residents"):
        assert phrase in text
