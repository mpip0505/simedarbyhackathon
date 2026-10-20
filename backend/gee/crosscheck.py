"""Independent sanity check of our NDVI canopy proxy against two trusted free land-cover products.

Run:  python -m backend.gee.crosscheck        (needs Earth Engine login)
Writes backend/data/cache/crosscheck.json.

References (both 10 m, both built from Sentinel-2, so they are NOT ground truth, only independent methods):
- ESA WorldCover v200 (2021): pixels classed "tree cover".
- Google Dynamic World: pixels whose mean "trees" probability over the same window is at least 0.5.
Our mask: median Sentinel-2 NDVI >= threshold, for the baseline and latest windows, at NDVI 0.5 / 0.6 / 0.7.
For each combination we report canopy % from each product and agreement (precision, recall, F1, kappa).
Note: WorldCover is a 2021 map, so the baseline window (2021-10 to 2023-09) is the closer match in time.
"""
from backend import atomic
from backend.config import BASELINE_PERIOD, CACHE_DIR, CANOPY_NDVI_THRESHOLD, LATEST_PERIOD
from backend.gee.composites import end_exclusive, get_aoi, ndvi_composite
from backend.gee.safe import get_info

THRESHOLDS = (0.5, 0.6, 0.7)
DW_TREE_PROB = 0.5
SCALE_M = 10


def agreement_metrics(tp: float, fp: float, fn: float, tn: float) -> dict:
    """Agreement between our canopy mask (positive = our canopy) and a reference mask, from pixel counts.
    precision: of our canopy pixels, the share the reference also calls tree. recall: of the reference's tree
    pixels, the share we also call canopy. Undefined ratios (no positives) are None, not zero."""
    n = tp + fp + fn + tn
    if n <= 0:
        raise ValueError("no pixels were compared")
    div = lambda a, b: None if b == 0 else a / b
    precision, recall = div(tp, tp + fp), div(tp, tp + fn)
    f1 = None if precision is None or recall is None or precision + recall == 0 else 2 * precision * recall / (precision + recall)
    ours_pct, ref_pct = 100 * (tp + fp) / n, 100 * (tp + fn) / n
    expected = ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / n
    kappa = None if expected == n else ((tp + tn) - expected) / (n - expected)
    r = lambda v, d=3: None if v is None else round(v, d)
    return {"pixels": int(n), "ours_canopy_pct": r(ours_pct, 2), "reference_tree_pct": r(ref_pct, 2),
            "agreement": r((tp + tn) / n), "precision": r(precision), "recall": r(recall), "f1": r(f1), "kappa": r(kappa)}


def best_threshold(results: dict) -> dict:
    """Mean F1 per threshold across every window and reference, and the best threshold by that measure."""
    scores = {}
    for window in results.values():
        for ref in window.values():
            for t, m in ref.items():
                if m["f1"] is not None:
                    scores.setdefault(t, []).append(m["f1"])
    mean_f1 = {t: round(sum(v) / len(v), 3) for t, v in scores.items()}
    return {"mean_f1_by_threshold": mean_f1, "best": max(mean_f1, key=mean_f1.get) if mean_f1 else None}


def _counts(ee, ours, ref, aoi) -> dict:
    stack = ee.Image.cat(ours.And(ref).rename("tp"), ours.And(ref.Not()).rename("fp"),
                         ours.Not().And(ref).rename("fn"), ours.Not().And(ref.Not()).rename("tn"))
    return get_info(stack.reduceRegion(ee.Reducer.sum(), aoi, SCALE_M, maxPixels=1e9, tileScale=4), "agreement counts")


def run() -> dict:
    import ee
    from backend.gee.auth import init
    init()
    aoi = get_aoi(ee)
    worldcover = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").eq(10).unmask(0).clip(aoi)
    results = {}
    for label, (start, end) in (("baseline", BASELINE_PERIOD), ("latest", LATEST_PERIOD)):
        ndvi = ndvi_composite(ee, aoi, start, end)
        dw = (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(aoi).filterDate(start, end_exclusive(end))
              .select("trees").mean().gte(DW_TREE_PROB).unmask(0).clip(aoi))
        results[label] = {}
        for ref_name, ref in (("esa_worldcover_2021", worldcover), ("dynamic_world_same_window", dw)):
            results[label][ref_name] = {}
            for t in THRESHOLDS:
                c = _counts(ee, ndvi.gte(t).updateMask(ndvi.mask()), ref, aoi)
                results[label][ref_name][str(t)] = agreement_metrics(c["tp"], c["fp"], c["fn"], c["tn"])
                m = results[label][ref_name][str(t)]
                print(f"{label:8s} {ref_name:26s} NDVI>={t}: ours {m['ours_canopy_pct']}% ref {m['reference_tree_pct']}% "
                      f"precision {m['precision']} recall {m['recall']} F1 {m['f1']}", flush=True)
    return results


def main() -> None:
    results = run()
    out = {"method": __doc__.strip(), "canopy_ndvi_threshold_in_use": CANOPY_NDVI_THRESHOLD,
           "dynamic_world_tree_probability": DW_TREE_PROB, "results": results, "threshold_comparison": best_threshold(results),
           "caveat": "Both references are satellite-derived maps, not field truth. They show whether our proxy agrees "
                     "with independent methods, not whether it counts trees correctly."}
    atomic.write_json(CACHE_DIR / "crosscheck.json", out, indent=1)
    print("\n", out["threshold_comparison"])


if __name__ == "__main__":
    main()
