"""How much do simplified versions of the published prioritisation approaches agree with our ranking?

    python -m ml.method_agreement             # writes ml/reports/method_agreement.json and .md
    python -m ml.method_agreement --stdout    # prints the markdown, writes nothing

Why: the literature (docs/prior-art.md) says different prioritisation tools find the same broad areas but different top
sites (a 2025 Austin comparison of five tools). This asks the same question of our own data, using the fields we already
have, so the pitch can say what the connectivity and shade scores change.

What this is NOT: the real Tree Equity Score, i-Tree Landscape or Boston tool. Those use US census and US land-cover data
we do not have. The stand-ins below copy only the *shape* of each idea (heat only, canopy gap only, both) on our fields.
Agreement is not accuracy: there are no ground-truth labels, so nothing here shows any ranking is right.
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from backend.ml_io import current_data_version, load_sites_df

from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import pct_rank, score_sites
from ml.uncertainty import REPORT_DIR

TOP_K = 20
OURS = "ours"
# name -> one-line description (what it copies, and from where)
METHODS = {
    "heat_only": "Heat only: hottest 250 m surroundings first (the idea behind a land-surface-temperature ranking such as Boston's)",
    "canopy_gap_only": "Canopy gap only: least green 250 m surroundings first (the canopy-gap half of Tree Equity Score)",
    "heat_and_gap": "Heat and canopy gap, equal weight (a Tree Equity Score or Boston style blend, without the social layer we do not have)",
    "equal_three": "Our three scores with equal weights (a user who leaves every slider at the same value)",
    OURS: "Ours: heat 45%, connectivity 30%, shade 25% (the default weights)",
}


def method_scores(df: pd.DataFrame) -> pd.DataFrame:
    """One 0-100 priority column per method, indexed like df. Higher means plant sooner."""
    hot = pct_rank(df["lst_mean_250m"])
    bare = 100.0 - pct_rank(df["ndvi_mean_250m"])
    ours = score_sites(df, DEFAULT_WEIGHTS)
    equal = score_sites(df, {"cooling": 1, "connectivity": 1, "shade": 1})
    return pd.DataFrame({
        "heat_only": hot, "canopy_gap_only": bare, "heat_and_gap": (hot + bare) / 2,
        "equal_three": equal["score_total"], OURS: ours["score_total"],
    }, index=df.index)


def top_sites(scores: pd.Series, site_ids: pd.Series, k: int = TOP_K) -> list[str]:
    """The k highest, ties broken by site_id (the rule everything else in the project uses)."""
    order = pd.DataFrame({"s": scores.values, "id": site_ids.values}).sort_values(["s", "id"], ascending=[False, True])
    return order["id"].head(k).tolist()


def analyse(df: pd.DataFrame, steady_ids: set[str] | None = None, k: int = TOP_K) -> dict:
    sc = method_scores(df)
    ids = df["site_id"]
    tops = {m: top_sites(sc[m], ids, k) for m in sc.columns}
    spearman = sc.rank(method="average").corr(method="pearson")            # Spearman = Pearson on ranks
    names = list(sc.columns)
    overlap = {a: {b: len(set(tops[a]) & set(tops[b])) for b in names} for a in names}
    blocks = df.set_index("site_id")["block_id"]
    out = {
        "data_version": current_data_version(), "n_sites": int(len(df)), "top_k": k,
        "methods": {m: METHODS[m] for m in names},
        "spearman": {a: {b: round(float(spearman.loc[a, b]), 3) for b in names} for a in names},
        "top_overlap": overlap,
        "areas_in_top": {m: int(blocks.loc[tops[m]].nunique()) for m in names},
        "top_sites": tops,
    }
    if steady_ids:
        out["ours_steady_picks_in_each_top"] = {m: len(set(tops[m]) & steady_ids) for m in names}
        out["n_steady"] = len(steady_ids)
    return out


def _steady_ids(threshold: float = 0.8) -> set[str]:
    path = REPORT_DIR / "uncertainty_sites.csv"
    if not path.exists():
        return set()
    u = pd.read_csv(path)
    return set(u.loc[u["topk_frequency"] >= threshold, "site_id"])


def to_markdown(r: dict) -> str:
    names = list(r["methods"])
    short = {"heat_only": "Heat only", "canopy_gap_only": "Canopy gap only", "heat_and_gap": "Heat + gap", "equal_three": "Equal three", OURS: "Ours"}
    k = r["top_k"]
    lines = [
        "# Method agreement: our ranking against simplified published approaches",
        f"Generated on data_version `{r['data_version']}`, {r['n_sites']} sites. Regenerate with `python -m ml.method_agreement`.",
        "",
        "> These are **simplified stand-ins** built from the fields we already have. They are not the real Tree Equity Score, i-Tree Landscape or Boston tool,",
        "> which use US census and land-cover data. **Agreement is not accuracy**: there are no ground-truth labels, so nothing here shows any ranking is right.",
        "",
        "## The methods", *[f"- **{short[m]}**: {d}" for m, d in r["methods"].items()], "",
        f"## How many of the top {k} sites two methods share", "",
        "| | " + " | ".join(short[m] for m in names) + " |", "|---|" + "---|" * len(names),
        *[f"| **{short[a]}** | " + " | ".join(str(r["top_overlap"][a][b]) for b in names) + " |" for a in names], "",
        f"## Rank correlation across all {r['n_sites']} sites (Spearman, 1 = identical order)", "",
        "| | " + " | ".join(short[m] for m in names) + " |", "|---|" + "---|" * len(names),
        *[f"| **{short[a]}** | " + " | ".join(f"{r['spearman'][a][b]:.2f}" for b in names) + " |" for a in names], "",
        f"## How spread out the top {k} are", "",
        "| method | distinct 250 m areas among its top sites |", "|---|---|",
        *[f"| {short[m]} | {r['areas_in_top'][m]} |" for m in names], "",
    ]
    if "ours_steady_picks_in_each_top" in r:
        lines += [f"## Do the others find our {r['n_steady']} steady picks?", "",
                  "Of the sites our ML uncertainty run calls steady (in the top 20 in at least 80% of plausible settings), how many each method also puts in its own top "
                  f"{k}:", "", "| method | steady picks it also finds |", "|---|---|",
                  *[f"| {short[m]} | {r['ours_steady_picks_in_each_top'][m]} of {r['n_steady']} |" for m in names], ""]
    lines += ["## How to read this",
              "- Low overlap between *heat only* and *ours* means the connectivity and shade scores change which sites come first. That is by design, but it is a choice the "
              "planning team should make knowingly, which is why the weights are sliders.",
              "- High overlap between two methods does not make either right; low overlap does not make either wrong.",
              "- The literature finding it echoes: tools agree on broad areas and differ on the specific top sites (Austin, 2025). See docs/prior-art.md.", ""]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--stdout", action="store_true", help="print the report, write nothing")
    ap.add_argument("--k", type=int, default=TOP_K)
    args = ap.parse_args()
    result = analyse(load_sites_df(), _steady_ids(), args.k)
    md = to_markdown(result)
    if args.stdout:
        print(md)
        return
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "method_agreement.json").write_text(json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    (REPORT_DIR / "method_agreement.md").write_text(md, encoding="utf-8")
    print(f"wrote {REPORT_DIR / 'method_agreement.md'}")


if __name__ == "__main__":
    main()
