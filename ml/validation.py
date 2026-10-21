"""Validation for the site scores. There are no ground-truth labels, so nothing here can show the
ranking is *right* - only that it is internally consistent and stable. The wording in the report
follows that: "consistent" and "stable", never "accurate".

    python -m ml.validation                 # all checks -> ml/reports/validation.{json,md}
    python -m ml.validation --draws 500     # faster weight-stability sample

Checks
 1 direction        top-decile vs bottom-decile sites on the raw features (partly true by
                    construction - the scores are built from those features - so it is a wiring
                    check, not evidence)
 2 weight stability random weight sets (Dirichlet): rank correlation with the default ranking,
                    top-20 overlap, and how far individual sites move
 3 leave-input-out  drop each of the eight inputs in turn and measure how much the ranking moves
 4 scale sensitivity the four judgement constants (decay scales, cap, gap-fill shrinkage) retested
 5 block hold-out   GroupKFold by block_id: percentile scales refit on 4/5 of the 250 m blocks,
                    held-out blocks scored against them. Neighbouring 30 m cells are correlated,
                    so a random split would overstate stability.
 6 reliability      ranking with and without the 93 sites whose temperature is mostly gap-filled
 7 concentration    how many distinct 250 m blocks the top 20 and top 50 fall in
 8 redundancy       feature pairs that are rank-identical, which would silently double-count
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.model_selection import GroupKFold

from backend.ml_io import current_data_version, load_sites_df

from ml.run_scoring import DEFAULT_WEIGHTS
from ml.scoring_model import (COMPONENT_COLUMNS, CONNECTIVITY_WEIGHTS, COOLING_WEIGHTS,
                              SHADE_WEIGHTS, components, score_sites)

REPORT_DIR = __import__("pathlib").Path(__file__).resolve().parent / "reports"
TOP_K = 20

# Which named input belongs to which score, for the leave-one-input-out check.
INPUT_GROUPS = {"hot": "cooling", "bare": "cooling", "built": "cooling",
                "gap": "connectivity", "park": "connectivity", "inside": "connectivity",
                "unshaded": "shade", "near": "shade"}


# ----------------------------------------------------------------------------- small helpers
def _ranks(scores: pd.DataFrame) -> pd.Series:
    return scores.set_index("site_id")["rank"]


def _spearman(a: pd.Series, b: pd.Series) -> float:
    common = a.index.intersection(b.index)
    return round(float(spearmanr(a.loc[common], b.loc[common]).statistic), 4)


def _top_overlap(a: pd.Series, b: pd.Series, k: int = TOP_K) -> int:
    return len(set(a.nsmallest(k).index) & set(b.nsmallest(k).index))


def _variant(df: pd.DataFrame, weights: dict = None, **kwargs) -> pd.Series:
    return _ranks(score_sites(df, weights or DEFAULT_WEIGHTS, **kwargs))


def _agreement(df: pd.DataFrame, base: pd.Series, label: str, **kwargs) -> dict:
    r = _variant(df, **kwargs)
    return {"variant": label, "spearman_vs_default": _spearman(base, r),
            "top20_shared": _top_overlap(base, r),
            "median_rank_shift": int(np.median(np.abs(r.loc[base.index].to_numpy() - base.to_numpy())))}


# ----------------------------------------------------------------------------- 1 direction
def direction_check(df: pd.DataFrame, scores: pd.DataFrame) -> dict:
    """Do the sites we rank first actually look like the ones the brief asks for?"""
    merged = df.merge(scores[["site_id", "score_total", "rank"]], on="site_id")
    n = max(1, len(merged) // 10)
    top = merged.nsmallest(n, "rank")
    bottom = merged.nlargest(n, "rank")
    fields = ["lst_mean_250m", "ndvi_mean_250m", "built_up_frac_250m", "residential_buildings_within_250m",
              "corridor_gap_dist_m", "dist_to_nearest_park_m", "uncovered_path_length_50m",
              "dist_to_path_m", "canopy_pct_baseline", "lst_valid_frac"]
    rows = [{"feature": f, "top_decile_mean": round(float(top[f].mean()), 3),
             "bottom_decile_mean": round(float(bottom[f].mean()), 3)} for f in fields]
    return {"decile_size": int(n), "features": rows,
            "note": ("Partly true by construction: the scores are built from these features. This checks "
                     "the wiring and the sign of every term, not that the ranking is right.")}


# ----------------------------------------------------------------------------- 2 weight stability
def weight_stability(df: pd.DataFrame, base: pd.Series, draws: int, seed: int = 0) -> dict:
    """Two samplers, because they answer different questions.

    "any weights" draws the whole simplex, including corners that switch a score off entirely - the
    worst case a judge can ask for. "sliders nudged" concentrates around our default, which is what
    a user of the map actually does. Reporting only the first understates the ranking; reporting
    only the second flatters it.
    """
    alpha = [20 * DEFAULT_WEIGHTS[k] for k in ("cooling", "connectivity", "shade")]
    return {"samplers": [_weight_sample(df, base, draws, [1, 1, 1], "any weights: Dirichlet(1,1,1)", seed),
                         _weight_sample(df, base, draws, alpha,
                                        "sliders nudged: Dirichlet(20 x default)", seed + 1)],
            "note": ("Every draw re-totals the same three component scores, so this measures how much the "
                     "weight choice matters, not whether the components are right.")}


def _weight_sample(df: pd.DataFrame, base: pd.Series, draws: int, alpha: list, label: str,
                   seed: int) -> dict:
    rng = np.random.default_rng(seed)
    comp_scores = score_sites(df, DEFAULT_WEIGHTS).set_index("site_id")
    parts = comp_scores[["score_cooling", "score_connectivity", "score_shade"]].to_numpy()
    sims, overlaps, rank_matrix = [], [], np.empty((draws, len(parts)), dtype=np.int32)
    base_vec = base.loc[comp_scores.index].to_numpy()
    for i in range(draws):
        w = rng.dirichlet(alpha)
        total = parts @ w
        order = np.argsort(-total, kind="stable")
        ranks = np.empty(len(total), dtype=np.int32)
        ranks[order] = np.arange(1, len(total) + 1)
        rank_matrix[i] = ranks
        sims.append(spearmanr(base_vec, ranks).statistic)
        overlaps.append(len(set(np.flatnonzero(ranks <= TOP_K)) & set(np.flatnonzero(base_vec <= TOP_K))))
    spread = rank_matrix.max(axis=0) - rank_matrix.min(axis=0)
    always_top = int(((rank_matrix <= 50).all(axis=0)).sum())
    never_top = int(((rank_matrix > 50).all(axis=0)).sum())
    return {
        "sampler": label, "draws": draws,
        "spearman_vs_default": {"min": round(float(np.min(sims)), 3), "p05": round(float(np.percentile(sims, 5)), 3),
                                 "median": round(float(np.median(sims)), 3), "max": round(float(np.max(sims)), 3)},
        "top20_shared_with_default": {"min": int(np.min(overlaps)), "median": int(np.median(overlaps)),
                                       "max": int(np.max(overlaps))},
        "rank_spread_per_site": {"median": int(np.median(spread)), "p90": int(np.percentile(spread, 90)),
                                  "max": int(spread.max())},
        "sites_always_in_top_50": always_top, "sites_never_in_top_50": never_top,
    }


# ----------------------------------------------------------------------------- 3 leave-input-out
def leave_input_out(df: pd.DataFrame, base: pd.Series) -> list:
    """Drop one named input at a time; its score falls back to the remaining inputs, renormalised."""
    out = []
    for name, group in INPUT_GROUPS.items():
        kw = {"cooling_weights": dict(COOLING_WEIGHTS), "connectivity_weights": dict(CONNECTIVITY_WEIGHTS),
              "shade_weights": dict(SHADE_WEIGHTS)}
        kw[group + "_weights"].pop(name)
        row = _agreement(df, base, "without " + name, **kw)
        row["score"] = group
        out.append(row)
    return sorted(out, key=lambda r: r["spearman_vs_default"])


# ----------------------------------------------------------------------------- 4 scale sensitivity
def scale_sensitivity(df: pd.DataFrame, base: pd.Series) -> list:
    """The four judgement constants, retested at values we would have accepted as reasonable."""
    trials = ([{"gap_scale_m": v, "park_scale_m": v} for v in (200.0, 800.0)]
              + [{"path_scale_m": v} for v in (75.0, 300.0)]
              + [{"unshaded_cap_m": v} for v in (75.0, 300.0)]
              + [{"shrink_gapfilled": False}])
    rows = []
    for t in trials:
        label = ", ".join(f"{k}={v}" for k, v in t.items())
        rows.append(_agreement(df, base, label, **t))
    return sorted(rows, key=lambda r: r["spearman_vs_default"])


# ----------------------------------------------------------------------------- 5 block hold-out
def block_holdout(df: pd.DataFrame, base: pd.Series, folds: int = 5) -> dict:
    """Refit the percentile scales on 4/5 of the 250 m blocks and score the held-out blocks against
    them. If the ranking depends on which neighbourhoods happen to be in the sample, this drops."""
    gkf = GroupKFold(n_splits=folds)
    pieces = []
    for train_idx, test_idx in gkf.split(df, groups=df["block_id"]):
        train, test = df.iloc[train_idx], df.iloc[test_idx]
        pieces.append(score_sites(test, DEFAULT_WEIGHTS, reference=train))
    oof = pd.concat(pieces).sort_index()
    oof_ranks = _ranks(oof.assign(rank=oof["score_total"].rank(ascending=False, method="first").astype(int)))
    return {"folds": folds, "blocks": int(df["block_id"].nunique()),
            "spearman_vs_default": _spearman(base, oof_ranks),
            "top20_shared": _top_overlap(base, oof_ranks),
            "median_rank_shift": int(np.median(np.abs(oof_ranks.loc[base.index].to_numpy() - base.to_numpy()))),
            "note": ("Only the percentile scales are sample-dependent; the distance decays are absolute, "
                     "which is why this check moves the ranking so little.")}


# ----------------------------------------------------------------------------- 6 reliability subset
def reliability_subset(df: pd.DataFrame, base: pd.Series, threshold: float = 0.5) -> dict:
    """Re-score without the sites whose temperature is mostly filled from neighbouring pixels."""
    keep = df[df["lst_valid_frac"] >= threshold]
    reduced = _ranks(score_sites(keep, DEFAULT_WEIGHTS))
    base_kept = base.loc[reduced.index]
    low = df[df["lst_valid_frac"] < threshold]["site_id"]
    return {"threshold": threshold, "sites_dropped": int(len(low)), "sites_kept": int(len(keep)),
            "spearman_among_kept": _spearman(base_kept, reduced),
            "low_reliability_in_default_top20": int(base.loc[low].le(TOP_K).sum()),
            "note": ("Dropping sites changes the percentile scales, so a perfect 1.0 is not expected. "
                     "The last number is what matters: how much of the headline top 20 rests on "
                     "gap-filled temperature.")}


# ----------------------------------------------------------------------------- 7 concentration
def spatial_concentration(df: pd.DataFrame, scores: pd.DataFrame) -> dict:
    """Operational sanity: a top 20 inside two blocks is one planting site, not twenty."""
    merged = df[["site_id", "block_id", "origin"]].merge(scores[["site_id", "rank"]], on="site_id")
    out = {}
    for k in (20, 50, 100):
        top = merged.nsmallest(k, "rank")
        counts = top["block_id"].value_counts()
        out["top_" + str(k)] = {"distinct_blocks": int(counts.size),
                                 "largest_block_share": round(float(counts.iloc[0] / k), 2),
                                 "origin_mix": {str(o): int(c) for o, c in top["origin"].value_counts().items()}}
    out["note"] = ("Not a defect of the scores: corridor-edge cells near unshaded paths genuinely cluster. "
                   "It is a caveat for the pitch - present the top 20 as a few planting areas, and use the "
                   "weight sliders or a per-block cap if a spread-out shortlist is wanted.")
    return out


# ----------------------------------------------------------------------------- 8 redundancy
def redundancy(df: pd.DataFrame) -> list:
    """Feature pairs with |Spearman| >= 0.99: using both would double-count one signal."""
    cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) and c not in ("lon", "lat", "area_m2")]
    rho = df[cols].corr(method="spearman")
    pairs = []
    for i, a in enumerate(cols):
        for b in cols[i + 1:]:
            v = rho.loc[a, b]
            if pd.notna(v) and abs(v) >= 0.99:
                pairs.append({"a": a, "b": b, "spearman": round(float(v), 4)})
    return sorted(pairs, key=lambda p: -abs(p["spearman"]))


# ----------------------------------------------------------------------------- report
def run_all(draws: int = 2000) -> dict:
    df = load_sites_df()
    scores = score_sites(df, DEFAULT_WEIGHTS)
    base = _ranks(scores)
    comp = components(df)
    return {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "data_version": current_data_version(),
        "sites": int(len(df)),
        "weights": DEFAULT_WEIGHTS,
        "score_summary": {c: {k: round(float(v), 1) for k, v in scores[c].describe().items()}
                           for c in ("score_cooling", "score_connectivity", "score_shade", "score_total")},
        "component_summary": {c: {"median": round(float(comp[c].median()), 1),
                                   "share_below_5": round(float((comp[c] < 5).mean()), 3)}
                               for c in COMPONENT_COLUMNS},
        "direction": direction_check(df, scores),
        "weight_stability": weight_stability(df, base, draws),
        "leave_input_out": leave_input_out(df, base),
        "scale_sensitivity": scale_sensitivity(df, base),
        "block_holdout": block_holdout(df, base),
        "reliability": reliability_subset(df, base),
        "concentration": spatial_concentration(df, scores),
        "redundant_feature_pairs": redundancy(df),
        "top_20": scores.nsmallest(TOP_K, "rank")[["rank", "site_id", "score_total", "score_cooling",
                                                    "score_connectivity", "score_shade"]].to_dict("records"),
    }


def _table(rows: list, cols: list) -> str:
    head = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
    return head + "".join("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |\n" for r in rows)


def to_markdown(r: dict) -> str:
    ws, L = r["weight_stability"], []
    L.append("# Score validation report\n")
    L.append(f"Generated {r['generated_utc']} UTC on data_version `{r['data_version']}`, "
             f"{r['sites']} sites, weights {json.dumps(r['weights'])}. "
             "Regenerate with `python -m ml.validation`.\n")
    L.append("> **There are no ground-truth labels for this problem** - no tree inventory, LiDAR or field plots. "
             "Nothing below shows the ranking is correct. It shows the ranking is *consistent* with the features "
             "it is built from and *stable* under the choices we had to make. Read it that way, and say so in "
             "the pitch.\n")

    L.append("## Scores at a glance\n")
    L.append(_table([{"score": k, **{kk: v[kk] for kk in ("min", "25%", "50%", "75%", "max")}}
                     for k, v in r["score_summary"].items()],
                    ["score", "min", "25%", "50%", "75%", "max"]))
    L.append("\nComponent inputs (0-100), and how many sites sit near zero:\n")
    L.append(_table([{"input": k, "median": v["median"], "share < 5": v["share_below_5"]}
                     for k, v in r["component_summary"].items()], ["input", "median", "share < 5"]))

    L.append("\n## 1. Direction check\n")
    L.append(f"Top decile vs bottom decile ({r['direction']['decile_size']} sites each).\n")
    L.append(_table(r["direction"]["features"], ["feature", "top_decile_mean", "bottom_decile_mean"]))
    L.append("\n" + r["direction"]["note"] + "\n")

    L.append("\n## 2. Weight stability\n")
    for s in ws["samplers"]:
        L.append(f"\n**{s['sampler']}** ({s['draws']} draws)\n\n"
                 f"- Rank correlation with the default ranking: median **{s['spearman_vs_default']['median']}**, "
                 f"5th percentile {s['spearman_vs_default']['p05']}, worst {s['spearman_vs_default']['min']}.\n"
                 f"- Top {TOP_K} shared with the default: median "
                 f"**{s['top20_shared_with_default']['median']}/{TOP_K}**, "
                 f"worst {s['top20_shared_with_default']['min']}.\n"
                 f"- A site's rank moves by {s['rank_spread_per_site']['median']} places at the median across "
                 f"these weight sets (90th percentile {s['rank_spread_per_site']['p90']}, worst "
                 f"{s['rank_spread_per_site']['max']}).\n"
                 f"- **{s['sites_always_in_top_50']} sites stay in the top 50 under every draw**; "
                 f"{s['sites_never_in_top_50']} never enter it.\n")
    L.append("\n" + ws["note"] + "\n")

    L.append("\n## 3. Leave one input out\n")
    L.append("Each of the eight inputs removed in turn (its score falls back on the rest).\n")
    L.append(_table(r["leave_input_out"], ["variant", "score", "spearman_vs_default", "top20_shared",
                                            "median_rank_shift"]))

    L.append("\n## 4. Sensitivity to the judgement constants\n")
    L.append("The decay scales, the unshaded-path cap and the gap-fill shrinkage, retested at other "
             "defensible values.\n")
    L.append(_table(r["scale_sensitivity"], ["variant", "spearman_vs_default", "top20_shared",
                                              "median_rank_shift"]))

    bh = r["block_holdout"]
    L.append("\n## 5. Block hold-out (spatial robustness)\n")
    L.append(f"GroupKFold, {bh['folds']} folds over {bh['blocks']} 250 m blocks: percentile scales refit on the "
             f"training blocks, held-out blocks scored against them.\n\n"
             f"- Rank correlation with the full-sample ranking: **{bh['spearman_vs_default']}**\n"
             f"- Top {TOP_K} shared: {bh['top20_shared']}/{TOP_K}; median rank shift "
             f"{bh['median_rank_shift']} places\n\n" + bh["note"] + "\n")

    rel = r["reliability"]
    L.append("\n## 6. Reliability of the temperature input\n")
    L.append(f"- {rel['sites_dropped']} sites have `lst_valid_frac` below {rel['threshold']} "
             f"(temperature mostly filled from neighbours).\n"
             f"- Re-scoring the remaining {rel['sites_kept']}: rank correlation **{rel['spearman_among_kept']}** "
             f"with their order in the default ranking.\n"
             f"- Of the default top {TOP_K}, **{rel['low_reliability_in_default_top20']} sites** rely on "
             f"mostly gap-filled temperature.\n\n" + rel["note"] + "\n")

    L.append("\n## 7. Spatial concentration of the shortlist\n")
    L.append(_table([{"shortlist": k, **v} for k, v in r["concentration"].items() if k.startswith("top_")],
                    ["shortlist", "distinct_blocks", "largest_block_share", "origin_mix"]))
    L.append("\n" + r["concentration"]["note"] + "\n")

    L.append("\n## 8. Redundant feature pairs\n")
    if r["redundant_feature_pairs"]:
        L.append("Rank-identical or near-identical pairs in the feature table. The model deliberately uses "
                 "only one of each, so one signal is not counted twice under two names.\n")
        L.append(_table(r["redundant_feature_pairs"], ["a", "b", "spearman"]))
    else:
        L.append("None found.\n")

    L.append("\n## Top 20 sites\n")
    L.append(_table(r["top_20"], ["rank", "site_id", "score_total", "score_cooling", "score_connectivity",
                                   "score_shade"]))
    L.append("\nSee docs/ml-model.md for the plain-language explanation and the limits.\n")
    return "".join(L)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--draws", type=int, default=2000, help="weight-stability sample size")
    ap.add_argument("--json-only", action="store_true")
    a = ap.parse_args()

    report = run_all(a.draws)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "validation.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print("wrote", REPORT_DIR / "validation.json")
    if not a.json_only:
        (REPORT_DIR / "validation.md").write_text(to_markdown(report), encoding="utf-8")
        print("wrote", REPORT_DIR / "validation.md")

    print("\nheadline numbers")
    for s in report["weight_stability"]["samplers"]:
        print("  weights [" + s["sampler"].split(":")[0] + "]: median spearman",
              s["spearman_vs_default"]["median"], "| top20 shared",
              s["top20_shared_with_default"]["median"], "/", TOP_K)
    print("  block hold-out   : spearman", report["block_holdout"]["spearman_vs_default"])
    print("  gap-filled sites in top 20:", report["reliability"]["low_reliability_in_default_top20"])
    print("  top 20 spans", report["concentration"]["top_20"]["distinct_blocks"], "distinct 250 m blocks")


if __name__ == "__main__":
    main()
