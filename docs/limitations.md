# Limitations

Written for: anyone about to quote a number from this project. Read this first. The honest-limits rule applies on screen, in the deck and here.

- **Simulated sites.** 30 m cells on OSM open land, not a real planting list. OSM tags little undeveloped land in the
  west of Elmina, so the map under-represents it.
- **Approximate corridor.** About 2 km of connecting spine against the stated 5 km, and one park (north-west) left
  unlinked. Connectivity features inherit this.
- **Tropical cloud.** Median composites over two-year windows; they can blur short-lived change.
- **Coarse thermal.** Landsat surface temperature is about 100 m native. Use it to rank sites, not to quote
  temperatures. About 18% of the area has no reliable pixel and is filled from neighbours within 100 m for site scoring.
- **Canopy is a proxy**, NDVI >= 0.6, not a tree count. It moves about 5 points between single years and depends
  strongly on the threshold (about 18%, 10% and 3% at 0.5, 0.6 and 0.7), so the baseline-to-latest change is within
  noise: **read it as "no detectable change", not as growth.**
- **Independent maps disagree about canopy.** ESA WorldCover (2021) maps about 28% of Elmina as tree cover; Google
  Dynamic World about 7% (baseline window) falling to about 4% (latest); our proxy says about 10%. So canopy % is
  uncertain by a factor of several, and none of the references supports a direction of change. NDVI 0.6 gives the best
  average agreement of the three thresholds tried (F1 0.51, against 0.47 at 0.5 and 0.32 at 0.7). Both references are
  satellite-derived, not field truth. Details: `backend/data/cache/crosscheck.json`.
- **No ground truth.** No tree inventory, LiDAR or field plots exist for this project.
- **Scores.** Delivered (`score_source: "ml"`); the ranking is validated for consistency and stability, not
  correctness, there is no ground truth, see [docs/ml-model.md](ml-model.md). Any site ML did not score keeps
  the labelled placeholder.
- **Not disclosure-grade.** What a real pilot would need: [docs/pilot-readiness.md](pilot-readiness.md).
- **Outside facts in the pitch.** Checked in [docs/pitch-fact-check.md](pitch-fact-check.md); several need softer wording
  (the "5% planted" figure is contradicted by the same source). Hard questions with honest answers: [docs/judge-qa.md](judge-qa.md).
- **Pitch package.** Deck outline on the template's slides and the official Mechanism and Enabler structure, a 5-minute video script and a submission checklist: [docs/pitch/](pitch/). Theme fit: [docs/theme-fit.md](theme-fit.md). Self-grade against the official rubric: [docs/grading-self-assessment.md](grading-self-assessment.md).
- **Evidence and field check.** What we checked and did not ([docs/evidence-summary.md](evidence-summary.md)); a blind field sheet for a first walk (`python -m backend.scripts.field_sheet`, then `python -m backend.scripts.import_field_checks`). No field data has been collected yet.
- **Footpath greenness layer.** `python -m backend.shade_paths` cuts OpenStreetMap footpaths into pieces of about 50 m and labels each by satellite greenness in thirds relative to the township's paths (served at `/layers/paths/shade`, toggle "Footpath greenness (satellite)"). It is a proxy, not a shade survey: about 95% of footpath samples fall below our tree-cover threshold at 10 m, which is why the layer is relative.
- **Commercial case.** Who it is for, what repeating it for another township needs (an audit of what is Elmina-specific), the Earth Engine licensing point and labelled hypotheses, with no invented figures: [docs/commercial-case.md](commercial-case.md).
- **Other canopy prioritisers.** What Tree Equity Score, i-Tree Landscape, Boston's Right Place Right Tree and others do, what is and is not proven, and where this project fits: [docs/prior-art.md](prior-art.md). `python -m ml.impact_reach` counts what the top sites reach (unshaded footpath, mapped homes, corridor gaps; reach, not outcome; report in `ml/reports/impact_reach.md`, served at `/ml/impact`). `python -m ml.tradeoff` shows what the first 20 and 50 sites reach when chosen five ways (a trade-off, not a league table; `ml/reports/tradeoff.md`, served at `/ml/tradeoff`). `python -m ml.method_agreement` compares our ranking with simplified stand-ins of those approaches (report in `ml/reports/method_agreement.md`).
