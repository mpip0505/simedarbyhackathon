# Validate, review and replan

The Pilot plan freezes a reproducible starting point, brings blind field observations back into the browser, requires human review, and compares revised choices with simple baselines. It remains a planning prototype with simulated candidate cells. Software checks and synthetic browser fixtures are not field validation or independent-user results.

This work extends `59eba33` and incorporates the team's subsequent `cfa2c63` commit. Intervention suggestions, ecologist review fields, maintenance readiness and the best-coverage optimizer remain available. The optimizer and the new decision benchmark answer different questions: the former maximises proxy reach within a top-100 pool; the latter compares equal-size methods over the full frozen eligible population.

## Planner workflow

1. Add sites and set the weights you want to preserve. Open **Pilot plan** and **Freeze original shortlist**. This captures active selected IDs and the complete ranked candidate population, component/total scores, original ranks, geometry, measured comparison inputs, data version, score source, normalized weights and timestamp. Moving sliders later cannot change that original record.
2. Mark sites **Needs inspection**, optionally assign batches, and download the field sheet from Pilot plan. The ten existing columns remain first; opaque `data_version`, `snapshot_id`, `sheet_id` columns follow. The sheet has no priority ranks or scores. Preserve the metadata and coordinates when completing it.
3. Complete shade, canopy and path-use answers. Add observer, date and any photo/reference notes. Select the CSV to see a preview: no observation changes until **Confirm field import**. Discarding the preview leaves the plan unchanged.
4. Review each site. A versioned observation needs observer and date to support Inspected status. Alternatively record a named, dated manual inspection with an evidence reference. Enter a human reviewer, review date and reason to keep or reject. A keep decision is separate from planting approval.
5. Complete all five field checks and record a keep review after any check changes before selecting Approved. Planted additionally requires an evidence-supported Approved record. Imported answers never fill in utilities, permissions or other feasibility checks.
6. For a rejected site, choose an eligible frozen alternative. The original remains rejected with a reason and replacement link; the new site starts Needs inspection. Review the marginal unique reach and mapped flags before choosing it.
7. Compare original/revised references and equal-size baselines. Download plan CSV, benchmark CSV and the complete evidence JSON before clearing the plan for another cycle.

Freeze is once per cycle. Export first, then clear the plan to start another cycle on a changed dataset. Clearing also clears trees and local evidence history; downloaded files remain yours to retain. There is no evidence-package restore UI in this prototype.

## Import contract and safety

Existing columns: `site_id,lat,lon,shade_on_path,canopy_class,path_in_use,photo_id,notes,observer,date`. Versioned columns: `data_version,snapshot_id,sheet_id`.

The importer rejects malformed quoting, duplicate headers, wrong row widths, unknown/repeated IDs, sites outside the current plan, invalid answer words or dates, future observation dates, mismatched versions/snapshots, unissued sheet IDs and changed locations (tolerance 0.00001 degrees). Provenance and location checks apply to incomplete known-site rows too. Rows without site IDs are ignored; incomplete answers are counted and left out rather than guessed. A file with no complete usable answers cannot be confirmed. Invalid files do not partially change the plan.

A preview records the plan revision; changes made while a file is read or before confirmation invalidate that preview. Original CSV content, filename, SHA-256 content digest, observer/date, import time, issued-sheet identifiers and comparison outcome are retained. Re-importing identical content is refused. Corrections require the explicit replace-previous-observations option; they preserve the earlier import record and reopen review. Imports cannot overwrite planted-site observations.

Unversioned sheets from older tools require the explicit legacy-preview checkbox. Legacy or unattributed observations remain **insufficient**, cannot advance inspection status and cannot support approval without separate attributed manual inspection. Such imports are useful as notes, not authenticated field evidence. The old sidebar sheet remains an unversioned format; use Pilot plan for versioned sheets.

Limits: 1 MB file, 1,000 rows, 300 plan sites, 5,000 frozen candidates, 100 issued sheets, 30 import archives and 2,000 local events per cycle. Export and start a fresh cycle when those limits are reached. Storage quota can be reached sooner: a visible warning says when changes exist only for the current session.

## Comparison rules

Comparison always uses the frozen candidate measurements. Footpath cover <= 0.33 predicts little cover, >= 0.67 predicts high cover, otherwise intermediate. Baseline canopy < 25% predicts low cover, >= 75% high cover, otherwise intermediate. None/sparse field canopy maps to low, moderate to intermediate, dense to high.

- **Disagree:** opposite path-cover extremes; low baseline canopy versus moderate/dense observed canopy; or high baseline canopy versus none/sparse observed canopy.
- **Agree:** both known proxies match the corresponding observed categories, with no contradiction.
- **Insufficient:** a required proxy is missing, invalid, unsupported by a nearby path, ambiguous relative to the observation, or the observation lacks attributable issued-sheet provenance.

A known contradiction takes precedence over a different missing proxy. Path-in-use is recorded separately; it does not establish shade agreement. These thresholds are transparent screening heuristics, not a validated shade model. Agreement on one visit does not prove model accuracy, cooling, safety or planting suitability.

## Review, eligibility and traceability

Inspection requires a name, valid date and manual evidence reference, or an attributable versioned observation. Human decisions require reviewer, date and reason; reviews cannot predate the recorded inspection or be future-dated. Changes to inspection, imported observations or checks reopen the keep review and demote an Approved entry to Inspected. Legacy Approved/Planted records are retained with missing-evidence warnings; legacy approval cannot advance to a new Planted status without meeting the current evidence gate.

Rejections remain excluded for the cycle even after removing their row. Field issues are stored independently of active membership: removing/re-adding a site restores its issue checks as Needs inspection. Alternatives, best-coverage selection and decision benchmarks exclude these unresolved IDs. To resolve an issue, restore its row, record inspection evidence, set all five checks OK and record an attributed keep review with the resolution reason. Clearing a check alone does not clear eligibility history. Mapped flags are unresolved screening triggers, not confirmed field rejection or proof of safety.

Replacement records include original/replacement IDs, original/replacement ranks, reviewer, date and reason. The rejected original is not overwritten. Unique reach uses unions of shared path/building/gap IDs, so overlapping candidates are not added twice. Reach comparison is unavailable when the reach artifact is missing, stale or from another data version.

## Decision benchmark

The original and revised plan rows are references and may have different site counts. The four deterministic methods and random distribution use the same pool and N (the original shortlist size). The pool contains all frozen candidates with finite heat-context and baseline-canopy measurements, excluding recorded rejections and field issues. Missing either required input excludes the candidate from every method. If fewer than N remain, no smaller sample is silently substituted.

| Method | Ordering |
| --- | --- |
| Multi-objective | Frozen original rank |
| Heat only | Highest `lst_mean_250m` first |
| Canopy gap only | Lowest `canopy_pct_baseline` first |
| Constraint aware | No mapped trigger, then mapped review, then unknown; original rank within each group |
| Random | Uniform selections without replacement; 500 draws, seed 20261022 |

Ties use site ID. Randomness uses Mulberry32 plus partial Fisher-Yates, with linearly interpolated p05/median/p95 for each metric. Metrics are unique footpath reach, mapped residential buildings, approximate corridor-gap reach, distinct area blocks, unresolved/unknown map screens, attributed inspection coverage, human-review coverage and field disagreements. Zero field coverage is zero when any attributed evidence exists in the plan; when none exists anywhere it is unavailable. Unobserved sites are not presumed suitable or unsuitable. Unequal observation coverage prevents treating disagreement counts as comparable accuracy rates.

The JSON retains seed, draws, method selections, pool, exclusions and metric distributions. CSV includes method site IDs/counts and random distributions. Proxy reach overlaps the model's input objectives; it is not independent evidence of effectiveness. A real decision-quality test needs a blind, consistently sampled inspection set across selection methods, authorised suitability judgments and follow-up outcomes.

## Evidence and compatibility

Storage uses the existing `elmina-planting-plan-v1` key with internal shape v3; older records retain notes, tree records, intervention/readiness fields and statuses. Unattributed older comparisons become insufficient. The revised plan CSV preserves existing columns in order and appends snapshot/data IDs, original rank, replacement links, inspection attribution and human-review attribution. Current rank remains clearly separate from original rank. Unknown sites missing from the live dataset remain in the JSON even though the plan CSV cannot supply their current geometry.

The evidence JSON includes original snapshot, current entries/settings/trees, archived imports and original CSV content, issued sheets, exclusions/field issues, decision events, benchmark report and current data version. CSV output neutralises formula-like free text. The API remains read-only; field records are not uploaded. This is editable local browser storage, not an authenticated, shared or tamper-proof audit system. File digests identify content, not the identity of the person who supplied it.

## Verification and evidence still needed

Automated regression tests cover tri-state comparison, CSV safety, immutable snapshots, stale contexts, import confirmation/races, evidence gates, legacy migration, issue persistence/resolution, replacement links, unique reach and seeded baselines. Browser automation exercises the combined workflow with explicitly SYNTHETIC answers and retains the team's optimizer/intervention checks. See [frontend.md](frontend.md) for commands.

No real field walk or independent-human usability session has been conducted by this implementation. Use [usability-test-protocol.md](usability-test-protocol.md) and [the empty session log](usability-session-log.csv); keep raw notes and label proxy participants accurately. Registration, names and submission placeholders were skipped at the user's request.

A clean Python environment with only `backend/requirements-serve.txt` verifies serving from the committed cache without Earth Engine or GIS packages. Docker is unavailable on this workstation, so an actual container build/run remains unverified; the existing Dockerfile is unchanged.

Verification recorded on 2026-10-22: **200 frontend tests**, **301 Python tests**, and **44/44 browser checks** passed. The browser suite also passed 44/44 against the clean serving environment. A further focused Pilot plan run passed with a 390px import-preview overflow assertion; import-preview and benchmark screenshots were inspected. Independent code review findings were reproduced and covered by regression tests. These are automated software checks, not participant or field results.
