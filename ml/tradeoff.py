"""The trade-off between ways of choosing the first planting sites.

    python -m ml.tradeoff             # writes ml/reports/tradeoff.json and .md
    python -m ml.tradeoff --stdout    # prints the markdown, writes nothing

For the first 20 and 50 sites chosen five ways (heat only, canopy gap only, heat plus canopy gap, our default weights, and our spread-out shortlist), this reports
what each list REACHES (footpath with little tree cover, mapped homes, corridor gaps, each counted once) and how hot and how spread out its sites are.

Read it as a trade-off, not a league table. Our default weights favour footpath and corridor by design, so they reach more of those; a heat-only list picks the
hottest surroundings. Which matters more is the planner's choice, which is why the weights are sliders. Reach is not benefit, the sites are simulated, and
the heat-only, canopy-gap and combined lists are simplified stand-ins (see ml/method_agreement.py).
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from backend.ml_io import current_data_version, load_sites_df

from ml.impact_reach import PATH_STEP_M, _load_inputs, measure
from ml.method_agreement import METHODS, OURS, method_scores, top_sites
from ml.scoring_model import pct_rank
from ml.shortlist import diversified_shortlist
from ml.uncertainty import REPORT_DIR

STEPS = (20, 50)
SPREAD = "spread_out"
LABELS = {**METHODS, SPREAD: "Spread out: our default ranking with at most 3 sites per 250 m block, so a first round covers more areas"}


def pick_lists(df: pd.DataFrame, k: int) -> dict[str, list[str]]:
    """The first k site ids under each method, ties broken by site_id."""
    sc = method_scores(df)
    out = {m: top_sites(sc[m], df["site_id"], k) for m in sc.columns}
    out[SPREAD] = diversified_shortlist(k)["site_id"].tolist()
    return out


def build() -> dict:
    order_ids, cells, centres, unshaded, homes, gaps, _ = _load_inputs()
    index = {sid: i for i, sid in enumerate(order_ids)}
    df = load_sites_df()
    by_site = df.set_index("site_id")
    heat_pct = pd.Series(pct_rank(df["lst_mean_250m"]).to_numpy(), index=df["site_id"])
    totals = {"unshaded_path_m": len(unshaded) * PATH_STEP_M, "homes": len(homes), "gap_m": len(gaps) * 10.0}
    results = {}
    for k in STEPS:
        rows = {}
        for method, ids in pick_lists(df, k).items():
            m = measure([index[s] for s in ids], cells, centres, unshaded, homes, gaps)
            rows[method] = {
                "n": len(ids),
                "unshaded_path_m": round(m["unshaded_path_m"]), "unshaded_path_pct": round(100 * m["unshaded_path_m"] / totals["unshaded_path_m"], 1),
                "homes": m["homes"], "homes_pct": round(100 * m["homes"] / totals["homes"], 1),
                "gap_m": round(m["gap_m"]), "gap_pct": round(100 * m["gap_m"] / totals["gap_m"], 1),
                "areas": int(by_site.loc[ids, "block_id"].nunique()),
                "hotter_than_pct": round(float(heat_pct.loc[ids].mean()), 0),
            }
        results[str(k)] = rows
    return {
        "data_version": current_data_version(), "n_sites": len(df), "steps": list(STEPS),
        "methods": LABELS, "ours": OURS, "spread": SPREAD, "results": results,
        "totals": {k: round(v) for k, v in totals.items()},
        "note": "A trade-off, not a league table: our default weights favour footpath and corridor by design, and a heat-only list picks the hottest surroundings. "
                "Reach is not benefit, the sites are simulated, and the heat-only, canopy-gap and combined lists are simplified stand-ins for published approaches.",
    }


def to_markdown(r: dict) -> str:
    short = {"heat_only": "Heat only", "canopy_gap_only": "Canopy gap only", "heat_and_gap": "Heat + gap", "equal_three": "Equal three", OURS: "Ours (default)", SPREAD: "Spread out"}
    lines = ["# Trade-off between ways of choosing the first sites", f"Generated on data_version `{r['data_version']}`, {r['n_sites']} simulated sites. Regenerate with `python -m ml.tradeoff`.", "", f"> {r['note']}", ""]
    for k in r["steps"]:
        lines += [f"## The first {k} sites", "", "| method | footpath with little tree cover (m) | mapped homes | corridor gap (m) | areas (250 m blocks) | hotter than (% of sites, average) |", "|---|---|---|---|---|---|"]
        for m, x in r["results"][str(k)].items():
            lines.append(f"| {short.get(m, m)} | {x['unshaded_path_m']:,} ({x['unshaded_path_pct']}%) | {x['homes']:,} ({x['homes_pct']}%) | {x['gap_m']:,} ({x['gap_pct']}%) | {x['areas']} | {x['hotter_than_pct']:.0f}% |")
        lines.append("")
    t = r["totals"]
    lines += [f"Percentages are of the township's totals: about {t['unshaded_path_m']:,} m of footpath with little tree cover, {t['homes']:,} mapped homes and about {t['gap_m']:,} m of corridor gap.", ""]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--stdout", action="store_true")
    args = ap.parse_args()
    result = build()
    md = to_markdown(result)
    if args.stdout:
        print(md)
        return
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "tradeoff.json").write_text(json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    (REPORT_DIR / "tradeoff.md").write_text(md, encoding="utf-8")
    print(f"wrote {REPORT_DIR / 'tradeoff.md'}")


if __name__ == "__main__":
    main()
