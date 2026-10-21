"""Field verification kit: a blind sample of sites to check on foot, and a check of the ranking against what was seen.

    python -m backend.scripts.field_sheet           # writes field_sheet.csv (to fill in) and field_sheet.html (to print)
    python -m backend.scripts.import_field_checks field_sheet_done.csv

We have NO field data. This is what the first afternoon of fieldwork would produce, so the team can test the ranking against ground truth
instead of arguing about it. Nothing here shows the ranking is right: it reports how often the sites ranked highest were seen to lack shade,
compared with sites ranked low, on a small sample.

Blind on purpose: the sheet shows a site ID and a place, never a rank or score, so the person walking cannot be nudged by what the model thinks.
Only sites with footpath within 50 m are sampled, because the shade claim is about people walking.
"""
from __future__ import annotations

import csv
import io
import random
from dataclasses import dataclass

import pandas as pd

SHADE = ("none", "partial", "full")
CANOPY = ("none", "sparse", "moderate", "dense")
YESNO = ("yes", "no")
SHEET_COLUMNS = ["site_id", "lat", "lon", "shade_on_path", "canopy_class", "path_in_use", "photo_id", "notes", "observer", "date"]
FILL_IN = ["shade_on_path", "canopy_class", "path_in_use"]          # required answers
ALLOWED = {"shade_on_path": SHADE, "canopy_class": CANOPY, "path_in_use": YESNO}
SHADE_NEED = {"none": 2, "partial": 1, "full": 0}                  # more need = less shade seen on the path
MIN_PER_GROUP = 8                                                  # below this the summary says plainly that it is too small to read

HELP = {
    "shade_on_path": "Stand on the nearest footpath at midday. none = full sun along it, partial = patchy shade, full = shaded most of the way (within about 50 m).",
    "canopy_class": "Tree cover directly over and around the 30 m cell: none, sparse (a few small trees), moderate, dense.",
    "path_in_use": "Did you see anyone walking or cycling on that path during the visit? yes or no.",
}


def pick_sample(ranked: pd.DataFrame, n_per_group: int = 15, seed: int = 7, top_pool: int = 50) -> pd.DataFrame:
    """Blind sample: `n_per_group` from the top `top_pool` ranked sites and the same number from the lower half, seeded, footpath sites only.

    ranked needs site_id, lat, lon, rank and path_length_within_50m. Returns site_id, lat, lon, rank, group ('high' or 'low'); the caller must not show rank.
    """
    pool = ranked[ranked["path_length_within_50m"] > 0].sort_values("rank")
    if len(pool) < 2 * n_per_group:
        raise ValueError(f"only {len(pool)} sites have footpath within 50 m; need at least {2 * n_per_group}")
    rng = random.Random(seed)
    high = pool.head(top_pool)
    low = pool.iloc[len(pool) // 2:]
    pick = lambda frame: frame.loc[rng.sample(list(frame.index), min(n_per_group, len(frame)))]
    out = pd.concat([pick(high).assign(group="high"), pick(low).assign(group="low")])
    return out[["site_id", "lat", "lon", "rank", "group"]].reset_index(drop=True)


def blank_sheet(sample: pd.DataFrame) -> pd.DataFrame:
    """The sheet people fill in: place and blanks only (no rank, no score, no group), ordered by position so a walk is short."""
    sheet = sample[["site_id", "lat", "lon"]].sort_values(["lat", "lon"]).reset_index(drop=True)
    for col in SHEET_COLUMNS[3:]:
        sheet[col] = ""
    return sheet[SHEET_COLUMNS]


def sheet_html(sheet: pd.DataFrame) -> str:
    """A printable page: one row per site with tick-boxes. Plain text in, escaped on the way out."""
    from html import escape
    opts = lambda col: "  ".join(f"&#9744; {escape(v)}" for v in ALLOWED[col])
    rows = "".join(
        f"<tr><td><b>{escape(str(r.site_id))}</b><br><small>{r.lat:.5f}, {r.lon:.5f}</small></td>"
        f"<td>{opts('shade_on_path')}</td><td>{opts('canopy_class')}</td><td>{opts('path_in_use')}</td><td>photo no.:<br><br>notes:</td></tr>"
        for r in sheet.itertuples())
    help_items = "".join(f"<li><b>{escape(k.replace('_', ' '))}</b>: {escape(v)}</li>" for k, v in HELP.items())
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Elmina field check sheet</title>"
        "<style>body{font:12pt/1.4 sans-serif;margin:16mm}table{border-collapse:collapse;width:100%}td,th{border:1px solid #666;padding:5pt;vertical-align:top;font-size:10.5pt}"
        "h1{font-size:16pt}small{color:#333}@page{size:A4;margin:12mm}tr{break-inside:avoid}</style></head><body>"
        "<h1>Elmina field check sheet</h1>"
        "<p>Observer: ____________________ &nbsp; Date: ____________ &nbsp; Time: ________</p>"
        "<p>Sites are example locations (simulated) from a screening tool. Visit each place, then tick one box in each column. "
        "Enter the same answers in the CSV (field_sheet.csv) afterwards. Do not look up the site's score.</p>"
        f"<ul>{help_items}</ul>"
        "<table><thead><tr><th>Site and place</th><th>Shade on the path</th><th>Tree cover</th><th>Path in use</th><th>Photo, notes</th></tr></thead>"
        f"<tbody>{rows}</tbody></table></body></html>")


# ---------------- reading the completed sheet ----------------

class FieldCheckError(ValueError):
    """The completed sheet is not usable; the message says which row and what to fix."""


def read_sheet(text: str) -> pd.DataFrame:
    reader = csv.DictReader(io.StringIO(text))
    missing = [c for c in SHEET_COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        raise FieldCheckError(f"missing column(s): {', '.join(missing)}")
    return pd.DataFrame(list(reader), columns=SHEET_COLUMNS)


def validate(sheet: pd.DataFrame, known_ids: set[str]) -> pd.DataFrame:
    """Clean rows with all required answers; raises FieldCheckError for anything wrong (unknown site, repeated site, a value we do not allow)."""
    problems = []
    seen = set()
    for i, r in sheet.iterrows():
        line = i + 2                                              # the spreadsheet row, counting the header
        sid = (r["site_id"] or "").strip()
        if sid not in known_ids:
            problems.append(f"row {line}: unknown site_id '{sid}'")
        if sid in seen:
            problems.append(f"row {line}: site_id '{sid}' appears more than once")
        seen.add(sid)
        for col in FILL_IN:
            v = (r[col] or "").strip().lower()
            if v == "":
                problems.append(f"row {line}: {col} is empty")
            elif v not in ALLOWED[col]:
                problems.append(f"row {line}: {col} '{v}' must be one of {', '.join(ALLOWED[col])}")
    if problems:
        raise FieldCheckError("; ".join(problems[:12]) + (f"; and {len(problems) - 12} more" if len(problems) > 12 else ""))
    out = sheet.copy()
    for col in FILL_IN:
        out[col] = out[col].str.strip().str.lower()
    out["site_id"] = out["site_id"].str.strip()
    return out


@dataclass
class Summary:
    n: int
    n_high: int
    n_low: int
    rows: dict          # group -> {"n", "no_shade_pct", "sparse_or_none_pct", "in_use_pct"}
    spearman: float | None
    enough: bool        # both groups have at least MIN_PER_GROUP sites


def _pct(series: pd.Series, test) -> float | None:
    return None if len(series) == 0 else round(100.0 * test(series).mean(), 1)


def summarise(observed: pd.DataFrame, ranks: pd.Series) -> Summary:
    """Compare observations with the ranking. `ranks` maps site_id to rank (1 = plant first).

    Groups are the better and worse half of the sampled sites by rank. spearman is the rank correlation between rank number and shade seen on the path
    (more need = less shade): a ranking that points at real shade gaps gives a NEGATIVE number, because rank 1 should be the least shaded.
    """
    df = observed.assign(rank=observed["site_id"].map(ranks))
    if df["rank"].isna().any():
        raise FieldCheckError("some sites have no rank in the current data")
    df["need"] = df["shade_on_path"].map(SHADE_NEED)
    cut = df["rank"].median()
    df["group"] = ["high" if r <= cut else "low" for r in df["rank"]]
    rows = {}
    for g in ("high", "low"):
        sub = df[df["group"] == g]
        rows[g] = {"n": int(len(sub)), "no_shade_pct": _pct(sub["shade_on_path"], lambda s: s == "none"),
                   "sparse_or_none_pct": _pct(sub["canopy_class"], lambda s: s.isin(["none", "sparse"])),
                   "in_use_pct": _pct(sub["path_in_use"], lambda s: s == "yes")}
    rho = None
    if len(df) >= 3 and df["need"].nunique() > 1:
        rho = round(float(df["rank"].rank().corr(df["need"].rank())), 2)
    return Summary(n=len(df), n_high=rows["high"]["n"], n_low=rows["low"]["n"], rows=rows, spearman=rho,
                   enough=rows["high"]["n"] >= MIN_PER_GROUP and rows["low"]["n"] >= MIN_PER_GROUP)


def report(s: Summary) -> str:
    h, l = s.rows["high"], s.rows["low"]
    lines = ["# Field check: the ranking against what was seen", "",
             f"{s.n} sites visited ({h['n']} ranked in the better half of the sample, {l['n']} in the worse half).", "",
             "| | better-ranked half | worse-ranked half |", "|---|---|---|",
             f"| sites | {h['n']} | {l['n']} |",
             f"| no shade seen on the path | {h['no_shade_pct']}% | {l['no_shade_pct']}% |",
             f"| tree cover none or sparse | {h['sparse_or_none_pct']}% | {l['sparse_or_none_pct']}% |",
             f"| path in use | {h['in_use_pct']}% | {l['in_use_pct']}% |", ""]
    if s.spearman is not None:
        lines.append(f"Rank correlation between rank number and shade seen: **{s.spearman}** (a ranking that points at real shade gaps gives a negative number).")
    if not s.enough:
        lines.append(f"**Too few sites to read:** each half needs at least {MIN_PER_GROUP}. Treat every number above as a note, not a result.")
    lines += ["", "How to read this: it is a small sample, one visit each, and it checks only the shade and cover part of the ranking (not corridor links or heat). "
              "It cannot show the ranking is right. If the better-ranked half was seen to have more unshaded paths, that is encouraging; if not, the ranking needs another look."]
    return "\n".join(lines) + "\n"
