"""Monte Carlo uncertainty: turn the deterministic score into a range, instead of reporting one
number as if it were exact.

    python -m ml.uncertainty                 # 2000 draws -> ml/reports/uncertainty.{json,md}
    python -m ml.uncertainty --draws 500      # faster

Why this exists
----------------
Every score in scores.geojson is a single deterministic number, computed under one set of
judgement calls: the default weights, and four distance/length constants inside the components
(ml/scoring_model.GAP_SCALE_M and friends) that nobody fitted - they were chosen because they
looked defensible, and ml/validation.py's "scale sensitivity" section retests each one on its own,
one at a time. That is useful, but it still leaves a single ranking on the map looking more certain
than it is: a site at rank 4 and a site at rank 11 can look clearly different when really the
distance between them depends on which of several defensible choices you made.

This module instead draws many plausible combinations of weights and constants at once, scores
every site under each, and reports what *doesn't* move: which sites land in the top 20 almost no
matter what (robust), which sites are only in the top 20 under some choices (boundary), and how wide
a site's rank really swings. It still is not evidence the ranking is *right* - that would need
labels, which do not exist for this project - only evidence of how much of the ranking is an
artefact of one set of choices versus a pattern that survives changing them.

What varies, and why these ranges
----------------------------------
- weights: Dirichlet concentrated around the default (cooling 0.45 / connectivity 0.30 / shade
  0.25) - the same "sliders nudged" distribution as ml/validation.py's weight_stability, i.e. how
  someone using the map's sliders would actually move them, not the full corner-to-corner simplex.
- gap_scale_m, park_scale_m: Uniform(200, 800) - the two values ml/validation.py already tested
  individually as "other defensible choices" for the corridor decay scale.
- path_scale_m, unshaded_cap_m: Uniform(75, 300) - same reasoning for the shade distances.
- shrink_gapfilled: on in 80% of draws, off in 20% - we are fairly confident the gap-filled
  temperature discount is the right call, not certain.

Not varied: anything about the *features themselves* (OSM undertagging, canopy threshold choice,
corridor accuracy). Those are data problems, not modelling judgement calls, and perturbing them
without a second data source to anchor the perturbation would just be invented uncertainty.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from backend.ml_io import current_data_version, load_sites_df

from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import score_sites

REPORT_DIR = Path(__file__).resolve().parent / "reports"

SCALE_RANGES = {"gap_scale_m": (200.0, 800.0), "park_scale_m": (200.0, 800.0),
                "path_scale_m": (75.0, 300.0), "unshaded_cap_m": (75.0, 300.0)}
SHRINK_GAPFILLED_PROB = 0.8        # fraction of draws with the gap-fill discount switched on
WEIGHT_CONCENTRATION = 20          # same "sliders nudged" tightness as validation.weight_stability
ROBUST_THRESHOLD = 0.8             # in the top K in at least this share of draws -> "robust"
BOUNDARY_THRESHOLD = 0.2           # below this share -> "rarely makes it", else "boundary"


def _draw(rng: np.random.Generator) -> tuple[dict, dict]:
    alpha = [WEIGHT_CONCENTRATION * DEFAULT_WEIGHTS[k] for k in ("cooling", "connectivity", "shade")]
    weights = dict(zip(("cooling", "connectivity", "shade"), rng.dirichlet(alpha)))
    scales = {k: float(rng.uniform(lo, hi)) for k, (lo, hi) in SCALE_RANGES.items()}
    scales["shrink_gapfilled"] = bool(rng.random() < SHRINK_GAPFILLED_PROB)
    return weights, scales


def monte_carlo(df: pd.DataFrame, draws: int, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """draws x n_sites matrices of score_total and rank, in df's row order (score_sites always
    returns rows in input order - add_ranks sorts internally but restores df's index at the end)."""
    rng = np.random.default_rng(seed)
    n = len(df)
    score_mat = np.empty((draws, n), dtype=np.float64)
    rank_mat = np.empty((draws, n), dtype=np.int32)
    for i in range(draws):
        weights, scales = _draw(rng)
        s = score_sites(df, weights, **scales)
        score_mat[i] = s["score_total"].to_numpy()
        rank_mat[i] = s["rank"].to_numpy()
    return score_mat, rank_mat


def summarise(df: pd.DataFrame, draws: int = 2000, seed: int = 0, k: int = 20) -> dict:
    baseline = score_sites(df, DEFAULT_WEIGHTS).set_index("site_id")
    score_mat, rank_mat = monte_carlo(df, draws, seed)
    site_ids = df["site_id"].to_numpy()

    per_site = pd.DataFrame({
        "site_id": site_ids,
        "baseline_rank": baseline.loc[site_ids, "rank"].to_numpy(),
        "baseline_score": baseline.loc[site_ids, "score_total"].to_numpy(),
        "score_median": np.median(score_mat, axis=0).round(1),
        "score_p05": np.percentile(score_mat, 5, axis=0).round(1),
        "score_p95": np.percentile(score_mat, 95, axis=0).round(1),
        "rank_median": np.median(rank_mat, axis=0).astype(int),
        "rank_p05": np.percentile(rank_mat, 5, axis=0).astype(int),      # best case (low = good)
        "rank_p95": np.percentile(rank_mat, 95, axis=0).astype(int),     # worst case
        "topk_frequency": (rank_mat <= k).mean(axis=0).round(3),
    }).sort_values("baseline_rank").reset_index(drop=True)

    robust = per_site[per_site["topk_frequency"] >= ROBUST_THRESHOLD]
    boundary = per_site[(per_site["topk_frequency"] < ROBUST_THRESHOLD)
                        & (per_site["topk_frequency"] >= BOUNDARY_THRESHOLD)]
    baseline_top_k = per_site.head(k)
    widest = baseline_top_k.loc[(baseline_top_k["rank_p95"] - baseline_top_k["rank_p05"]).idxmax()]
    widest_diagnosis = _diagnose_swing(df, widest["site_id"])

    return {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "data_version": current_data_version(), "draws": draws, "k": k,
        "sampled": {"weights": f"Dirichlet({WEIGHT_CONCENTRATION} x default), sliders-nudged",
                    **{k2: f"Uniform{v}" for k2, v in SCALE_RANGES.items()},
                    "shrink_gapfilled": f"on in {int(SHRINK_GAPFILLED_PROB*100)}% of draws"},
        "sites_in_sample": int(len(per_site)),
        "robust_top_k": {"threshold": ROBUST_THRESHOLD, "count_overall": int(len(robust)),
                         "count_within_baseline_top_k": int((baseline_top_k["topk_frequency"]
                                                              >= ROBUST_THRESHOLD).sum())},
        "boundary_sites": {"range": [BOUNDARY_THRESHOLD, ROBUST_THRESHOLD], "count": int(len(boundary))},
        "rank_agreement": {
            "spearman_baseline_vs_median": round(float(spearmanr(per_site["baseline_rank"],
                                                                 per_site["rank_median"]).statistic), 4),
        },
        "widest_swing_in_baseline_top_k": {"site_id": widest["site_id"], "baseline_rank": int(widest["baseline_rank"]),
                                           "rank_p05": int(widest["rank_p05"]), "rank_p95": int(widest["rank_p95"]),
                                           "topk_frequency": float(widest["topk_frequency"]),
                                           "why": widest_diagnosis},
        "baseline_top_k": baseline_top_k.to_dict("records"),
        "full_table_csv_note": "full per-site table is in uncertainty_sites.csv next to this report",
        "_full_table": per_site,     # not serialised to json; used only to write the csv
    }


def _diagnose_swing(df: pd.DataFrame, site_id: str) -> str:
    """Why a site's rank swings more than its neighbours': which raw measurement sits *inside* a
    sampled range, so the draw decides whether that term saturates. A feature above the range's top
    (or below its bottom) is threshold-proof regardless of the draw; one inside it is not."""
    row = df.set_index("site_id").loc[site_id]
    checks = [("corridor_gap_dist_m", "gap_scale_m"), ("dist_to_nearest_park_m", "park_scale_m"),
              ("dist_to_path_m", "path_scale_m"), ("uncovered_path_length_50m", "unshaded_cap_m")]
    on_the_fence = [f"{feat}={row[feat]:g}m is inside the sampled {param} range {SCALE_RANGES[param]}"
                    for feat, param in checks if SCALE_RANGES[param][0] < row[feat] < SCALE_RANGES[param][1]]
    if not on_the_fence:
        return "No single input measurement falls inside a sampled range; the swing comes from the weights."
    return "On the fence: " + "; ".join(on_the_fence) + "."


def _table(rows: list, cols: list) -> str:
    head = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
    return head + "".join("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |\n" for r in rows)


def to_markdown(r: dict) -> str:
    L = ["# Score uncertainty (Monte Carlo over the modelling judgement calls)\n",
         f"Generated {r['generated_utc']} UTC on data_version `{r['data_version']}`, "
         f"{r['draws']} draws. Regenerate with `python -m ml.uncertainty`.\n",
         "\n> This is **not** a confidence interval on the true best planting site - there is no "
         "ground truth to be confident about. It is a measure of how much the ranking depends on "
         "judgement calls (the weights, and four distance constants inside the scores) that were "
         "chosen, not fitted. A site whose rank barely moves across plausible choices is a safer "
         "pitch claim than one near the cutoff.\n",
         "\n## What was varied\n",
         _table([{"parameter": k, "distribution": v} for k, v in r["sampled"].items()],
                ["parameter", "distribution"]),
         f"\n## Headline\n"
         f"- Rank correlation between the single default ranking and the median rank across all "
         f"{r['draws']} draws: **{r['rank_agreement']['spearman_baseline_vs_median']}** "
         f"(the Monte Carlo median agrees closely with the one number on the map).\n"
         f"- **{r['robust_top_k']['count_within_baseline_top_k']} of the default top {r['k']}** sites "
         f"stay in the top {r['k']} in at least {int(r['robust_top_k']['threshold']*100)}% of draws - "
         f"call these the robust recommendations. {r['robust_top_k']['count_overall']} sites are robust "
         f"top-{r['k']} across the whole candidate set.\n"
         f"- {r['boundary_sites']['count']} sites are \"boundary\" cases: they enter the top {r['k']} in "
         f"{int(r['boundary_sites']['range'][0]*100)}-{int(r['boundary_sites']['range'][1]*100)}% of "
         f"draws - plausible, not guaranteed.\n"
         f"- Widest swing inside the default top {r['k']}: **{r['widest_swing_in_baseline_top_k']['site_id']}** "
         f"(default rank {r['widest_swing_in_baseline_top_k']['baseline_rank']}), ranges from "
         f"{r['widest_swing_in_baseline_top_k']['rank_p05']} to "
         f"{r['widest_swing_in_baseline_top_k']['rank_p95']} depending on the draw, and is in the "
         f"top {r['k']} only {int(r['widest_swing_in_baseline_top_k']['topk_frequency']*100)}% of the time. "
         f"{r['widest_swing_in_baseline_top_k']['why']}\n",
         f"\n## The default top {r['k']}, with their range across {r['draws']} draws\n",
         _table(r["baseline_top_k"], ["baseline_rank", "site_id", "baseline_score", "score_median",
                                       "score_p05", "score_p95", "rank_median", "rank_p05", "rank_p95",
                                       "topk_frequency"]),
         "\n`rank_p05` is the best-case rank seen across draws, `rank_p95` the worst case (low numbers "
         "are always better - rank 1 is \"plant first\"). `topk_frequency` is the share of draws in "
         f"which the site is still in the top {r['k']}.\n",
         f"\nFull per-site table ({r['sites_in_sample']} sites): `ml/reports/uncertainty_sites.csv`.\n",
        ]
    return "".join(L)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--draws", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--k", type=int, default=20)
    a = ap.parse_args()

    df = load_sites_df()
    report = summarise(df, a.draws, a.seed, a.k)
    full_table = report.pop("_full_table")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "uncertainty.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    (REPORT_DIR / "uncertainty.md").write_text(to_markdown(report), encoding="utf-8")
    full_table.to_csv(REPORT_DIR / "uncertainty_sites.csv", index=False)
    print("wrote", REPORT_DIR / "uncertainty.json")
    print("wrote", REPORT_DIR / "uncertainty.md")
    print("wrote", REPORT_DIR / "uncertainty_sites.csv")

    print(f"\nspearman (default vs median rank): {report['rank_agreement']['spearman_baseline_vs_median']}")
    print(f"robust top {a.k} (>= {int(ROBUST_THRESHOLD*100)}% of draws): "
          f"{report['robust_top_k']['count_within_baseline_top_k']} / {a.k} of the default top {a.k}")
    print(f"boundary sites ({int(BOUNDARY_THRESHOLD*100)}-{int(ROBUST_THRESHOLD*100)}%): "
          f"{report['boundary_sites']['count']}")


if __name__ == "__main__":
    main()
