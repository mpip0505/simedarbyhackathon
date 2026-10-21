"""Check the ranking against a completed field sheet.

    python -m backend.scripts.import_field_checks field_sheet_done.csv [--out report.md]

Stops with a clear message if the sheet has a missing column, an unknown or repeated site, or a value outside the allowed words.
Nothing here shows the ranking is right; see backend/field_checks.py.
"""
import argparse
from pathlib import Path

from backend import field_checks as fc
from backend.scripts.field_sheet import ranked_table


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("sheet", type=Path)
    ap.add_argument("--out", type=Path, default=None, help="also write the report to this file")
    args = ap.parse_args()
    ranked = ranked_table()
    try:
        observed = fc.validate(fc.read_sheet(args.sheet.read_text(encoding="utf-8-sig")), set(ranked["site_id"]))
        text = fc.report(fc.summarise(observed, ranked.set_index("site_id")["rank"]))
    except fc.FieldCheckError as exc:
        raise SystemExit(f"Cannot use {args.sheet}: {exc}")
    print(text)
    if args.out:
        args.out.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
