"""The app's in-browser field sheet and importer must speak the same columns and words as backend/field_checks.py.

If one side changes and the other does not, a sheet made by the script could not be read by the app (or the reverse). These tests read the JavaScript source
(no browser needed) and compare it with the Python constants.
"""
import re
from pathlib import Path

from backend import field_checks as fc

JS = Path(__file__).resolve().parents[2] / "frontend" / "js"


def js_array(file: str, name: str) -> list:
    src = (JS / file).read_text(encoding="utf-8")
    m = re.search(rf"export const {name}\s*=\s*\[(.*?)\];", src, re.S)
    assert m, f"{name} not found in {file}"
    return re.findall(r'"([^"]*)"', m.group(1))


def test_the_field_sheet_columns_match():
    assert js_array("plan.js", "FIELD_SHEET_COLUMNS") == fc.SHEET_COLUMNS


def test_the_allowed_answers_match():
    assert js_array("observations.js", "SHADE") == list(fc.SHADE)
    assert js_array("observations.js", "CANOPY") == list(fc.CANOPY)
    assert js_array("observations.js", "YESNO") == list(fc.YESNO)
    assert js_array("observations.js", "REQUIRED_ANSWERS") == fc.FILL_IN


def test_a_sheet_the_app_would_write_is_accepted_by_the_python_importer():
    """The header row the app writes (toCsv over FIELD_SHEET_COLUMNS) is exactly what the Python reader requires."""
    header = ",".join(js_array("plan.js", "FIELD_SHEET_COLUMNS"))
    sheet = fc.read_sheet(header + "\nELM-1,3.1,101.5,none,sparse,yes,,,,\n")
    clean = fc.validate(sheet, {"ELM-1"})
    assert clean.loc[0, "shade_on_path"] == "none"
