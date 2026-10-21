# Field check sheet (blank example)

`field_sheet.html` is a printable sheet and `field_sheet.csv` is the same list to type answers into. The sites are **example locations (simulated)** from the screening tool.
The sheet shows the place only, never a rank or score, so whoever walks it is not influenced by the model.

Make a fresh one: `python -m backend.scripts.field_sheet --out field_check` (choose `--n` and `--seed`).
Check the answers: `python -m backend.scripts.import_field_checks field_sheet_done.csv`.
See [../evidence-summary.md](../evidence-summary.md) and `backend/field_checks.py`. No field data has been collected yet.

`example_completed_synthetic.csv` shows what a completed sheet looks like for the importer (in the app's Pilot plan, step 2, or `python -m backend.scripts.import_field_checks`). **Every answer in it is invented** and marked SYNTHETIC; it is a format example, not a field observation. To try the import in the app, add those sites to your plan first (the importer only accepts sites that are in the plan).
