"""A spatially diversified top-N for the pitch deck - a separate, optional artifact, not a change
to the live ranking.

    python -m ml.shortlist                       # k=20, max 3 sites per 250 m block
    python -m ml.shortlist --k 15 --max-per-block 2

Why this is not just `scores.geojson`'s top 20
------------------------------------------------
`rank` in scores.geojson must track `score_total` in strict score order (backend.validate_scores
checks this), because the map's weight sliders retotal and re-rank live from those same per-site
scores. Reordering `rank` by anything other than score - including "spread the picks out" - would
silently break under any slider move and fail the validator.

So the raw ranking (what the map shows, and what the sliders correctly recompute) and "which sites
would a planting team actually start with" are different questions. The raw top 20 is six 250 m
blocks, almost all one contiguous corridor-edge strip (see ml/reports/validation.md, section 7):
correct on the numbers, but it reads as "one neighbourhood" rather than "a township-wide plan".

This module answers the second question without touching the first: greedily walk the existing
rank order, skip a site once its block already holds `max_per_block` picks, keep going until `k`
sites are chosen. It never changes a score and never writes scores.geojson.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from backend.ml_io import current_data_version, load_sites_df

from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import score_sites

REPORT_DIR = Path(__file__).resolve().parent / "reports"
SITE_COLUMNS = ("site_id", "lon", "lat", "block_id", "origin", "rank", "score_total",
               "score_cooling", "score_connectivity", "score_shade")


def _ranked_sites(weights: dict = None, **scale_overrides) -> pd.DataFrame:
    df = load_sites_df()
    scores = score_sites(df, weights or DEFAULT_WEIGHTS, **scale_overrides)
    merged = df[["site_id", "lon", "lat", "block_id", "origin"]].merge(scores, on="site_id")
    return merged.sort_values("rank").reset_index(drop=True)


def diversified_shortlist(k: int = 20, max_per_block: int = 3, weights: dict = None,
                          **scale_overrides) -> pd.DataFrame:
    """Greedy pick in rank order, skipping once a block hits `max_per_block`.

    Ties are already broken by site_id inside score_sites, so this is deterministic. If `k` can't
    be filled under the cap (not expected with 63 blocks and a 20-50 site shortlist), it is filled
    anyway rather than silently returning short - cap compliance is reported, not force-enforced.
    """
    ranked = _ranked_sites(weights, **scale_overrides)
    counts: dict = {}
    chosen_idx = []
    for i, row in ranked.iterrows():
        if counts.get(row["block_id"], 0) < max_per_block:
            chosen_idx.append(i)
            counts[row["block_id"]] = counts.get(row["block_id"], 0) + 1
        if len(chosen_idx) == k:
            break
    if len(chosen_idx) < k:                       # cap genuinely can't be met: top up over the cap
        for i, row in ranked.iterrows():
            if i in chosen_idx:
                continue
            chosen_idx.append(i)
            if len(chosen_idx) == k:
                break
    return ranked.loc[sorted(chosen_idx), list(SITE_COLUMNS)].reset_index(drop=True)


def _spread(df_subset: pd.DataFrame) -> dict:
    counts = df_subset["block_id"].value_counts()
    return {"n": int(len(df_subset)), "distinct_blocks": int(counts.size),
            "largest_block_share": round(float(counts.iloc[0] / len(df_subset)), 2) if len(df_subset) else 0.0,
            "mean_rank": round(float(df_subset["rank"].mean()), 1)}


def compare(k: int = 20, max_per_block: int = 3, weights: dict = None, **scale_overrides) -> dict:
    ranked = _ranked_sites(weights, **scale_overrides)
    raw_top_k = ranked.head(k)
    diversified = diversified_shortlist(k, max_per_block, weights, **scale_overrides)
    return {
        "k": k, "max_per_block": max_per_block, "data_version": current_data_version(),
        "raw_top_k": _spread(raw_top_k),
        "diversified": _spread(diversified),
        "score_given_up": round(float(raw_top_k["score_total"].mean() - diversified["score_total"].mean()), 1),
        "sites_swapped_in": sorted(set(diversified["site_id"]) - set(raw_top_k["site_id"])),
        "sites_swapped_out": sorted(set(raw_top_k["site_id"]) - set(diversified["site_id"])),
        "diversified_sites": diversified.to_dict("records"),
    }


def _table(rows: list, cols: list) -> str:
    head = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
    return head + "".join("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |\n" for r in rows)


def to_markdown(r: dict) -> str:
    raw, div = r["raw_top_k"], r["diversified"]
    L = [f"# Diversified shortlist (k={r['k']}, max {r['max_per_block']} per 250 m block)\n",
         f"Data version `{r['data_version']}`. Regenerate with `python -m ml.shortlist`.\n",
         "\nThis does **not** change `scores.geojson` or the live map ranking - see the module "
         "docstring in `ml/shortlist.py` for why rank can't be reordered this way inside the "
         "scored file. This is a presentation artifact: which sites to put on a slide as "
         "\"start here\", spread across the township instead of one strip.\n",
         "\n## Spread, before and after\n",
         _table([{"version": "raw top " + str(r["k"]), **raw},
                 {"version": "diversified", **div}],
                ["version", "n", "distinct_blocks", "largest_block_share", "mean_rank"]),
         f"\nTrade-off: the diversified set's average `score_total` is **{r['score_given_up']} points lower** "
         f"than the raw top {r['k']} (mean rank moves from {raw['mean_rank']} to {div['mean_rank']}). "
         "That's the price of spread - every swapped-in site is still a genuinely good candidate, "
         "just not quite top-tier, and it was not already represented nearby.\n",
         f"\n**Swapped in** ({len(r['sites_swapped_in'])}): {', '.join(r['sites_swapped_in']) or 'none'}\n",
         f"\n**Swapped out** ({len(r['sites_swapped_out'])}): {', '.join(r['sites_swapped_out']) or 'none'}\n",
         "\n## The diversified shortlist\n",
         _table(r["diversified_sites"], ["rank", "site_id", "lon", "lat", "block_id", "origin",
                                          "score_total", "score_cooling", "score_connectivity", "score_shade"]),
        ]
    return "".join(L)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--k", type=int, default=20, help="shortlist size (default 20)")
    ap.add_argument("--max-per-block", type=int, default=3, help="cap per 250 m block (default 3)")
    a = ap.parse_args()

    report = compare(a.k, a.max_per_block)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "shortlist.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    (REPORT_DIR / "shortlist.md").write_text(to_markdown(report), encoding="utf-8")
    print("wrote", REPORT_DIR / "shortlist.json")
    print("wrote", REPORT_DIR / "shortlist.md")
    print(f"\nraw top {a.k}: {report['raw_top_k']['distinct_blocks']} blocks, "
          f"largest share {report['raw_top_k']['largest_block_share']}")
    print(f"diversified : {report['diversified']['distinct_blocks']} blocks, "
          f"largest share {report['diversified']['largest_block_share']}, "
          f"gives up {report['score_given_up']} points of mean score_total")


if __name__ == "__main__":
    main()
