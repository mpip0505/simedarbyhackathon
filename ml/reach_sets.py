"""For every candidate site, WHICH footpath samples, mapped homes and corridor-gap samples it reaches (as index lists).

    python -m ml.reach_sets             # writes ml/reports/reach_sets.json
    python -m ml.reach_sets --stdout    # prints a short summary, writes nothing

ml/impact_reach.py answers "what do the first N ranked sites reach?" on the server. A planner's own shortlist is any set of sites, so the browser needs
the same answer for any set. Storing, per site, the indexes it reaches lets the browser take a union (every footpath sample, home and gap counted once,
however many chosen sites are near it) and get exactly the same numbers as impact_reach.py. tests/test_reach_sets.py checks that they agree.

Same definitions as impact_reach.py: footpath samples (every 10 m, latest greenness below the canopy threshold) within 50 m of the cell; mapped residential
buildings touching a 250 m circle around the cell centre; corridor-gap samples (every 10 m) within 50 m of the cell centre. Reach, not benefit; the sites are simulated.
"""
from __future__ import annotations

import argparse
import json

import numpy as np
from shapely import STRtree

from backend.ml_io import current_data_version

from backend.sites.generate import GAP_FLAG_DIST_M, PATH_RADIUS_M, SPINE_STEP_M

from ml.impact_reach import HOME_RADIUS_M, PATH_STEP_M, _load_inputs
from ml.uncertainty import REPORT_DIR


def build() -> dict:
    order_ids, cells, centres, unshaded, homes, gaps, below_pct = _load_inputs()
    path_tree, home_tree, gap_tree = STRtree(unshaded), STRtree(homes), STRtree(gaps)
    sites = {}
    for sid, cell, centre in zip(order_ids, cells, centres):
        sites[sid] = [
            sorted(int(i) for i in path_tree.query(cell.buffer(PATH_RADIUS_M), predicate="intersects")),
            sorted(int(i) for i in home_tree.query(centre.buffer(HOME_RADIUS_M), predicate="intersects")),
            sorted(int(i) for i in gap_tree.query(centre.buffer(GAP_FLAG_DIST_M), predicate="intersects")),
        ]
    return {
        "data_version": current_data_version(), "n_sites": len(sites),
        "layout": "sites[site_id] = [footpath sample indexes, home indexes, corridor-gap sample indexes]",
        "totals": {"footpath_samples": len(unshaded), "homes": len(homes), "gap_samples": len(gaps)},
        "sample_step_m": {"footpath": PATH_STEP_M, "gap": float(SPINE_STEP_M)},
        "note": "Reach, not benefit. The sites are simulated. A union over any set of sites counts each footpath sample, home and gap sample once.",
        "sites": sites,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--stdout", action="store_true")
    args = ap.parse_args()
    r = build()
    if args.stdout:
        print(json.dumps({k: v for k, v in r.items() if k != "sites"}, indent=1))
        return
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    out = REPORT_DIR / "reach_sets.json"
    out.write_text(json.dumps(r, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
