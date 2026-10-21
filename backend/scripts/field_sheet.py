"""Make a blind field check sheet for a sample of high- and low-ranked sites.

    python -m backend.scripts.field_sheet [--n 15] [--seed 7] [--out folder]

Writes field_sheet.csv (fill in, or copy answers into it) and field_sheet.html (print it) into the folder (default: ./field_check).
The sheet shows place only, never rank or score. See backend/field_checks.py.
"""
import argparse
from pathlib import Path

from backend import field_checks as fc
from backend.api import store
from backend.ml_io import load_sites_df


def ranked_table():
    """Sites with lat, lon, rank (as served by the API, so ML scores when merged) and footpath length."""
    df = load_sites_df()
    ranks = {f["properties"]["site_id"]: f["properties"]["rank"] for f in store.load_sites()["features"]}
    df["rank"] = df["site_id"].map(ranks)
    return df[["site_id", "lat", "lon", "rank", "path_length_within_50m"]]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--n", type=int, default=15, help="sites per group (default 15, so 30 in all)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", type=Path, default=Path("field_check"))
    args = ap.parse_args()
    sheet = fc.blank_sheet(fc.pick_sample(ranked_table(), args.n, args.seed))
    args.out.mkdir(parents=True, exist_ok=True)
    sheet.to_csv(args.out / "field_sheet.csv", index=False)
    (args.out / "field_sheet.html").write_text(fc.sheet_html(sheet), encoding="utf-8")
    print(f"{len(sheet)} sites -> {args.out / 'field_sheet.csv'} and {args.out / 'field_sheet.html'} (no ranks on the sheet)")


if __name__ == "__main__":
    main()
