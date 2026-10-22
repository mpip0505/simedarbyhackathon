# Validate, Review and Replan implementation plan

**Specification:** The user's Technical Implementation Plan against `59eba33`, with the attached review as context. The requested batch connects existing features; external site ingestion, automatic species matching and new exposure models remain future work. Real fieldwork and independent human sessions cannot be manufactured by software.

**Architecture:** Keep FastAPI read-only and the existing JavaScript UI. Extend the local plan record to version 3 with an original snapshot, attributed inspections/reviews, import history, replacement links and an append-only local event trail. Pure modules handle snapshot validation, comparison and reproducible benchmarks. Browser storage is editable by its owner, not a shared or tamper-proof audit system.

## Required behavior

- Freeze one original shortlist and the complete ranked candidate population, with weights, data/score source, timestamp, immutable original ranks and comparison inputs. Export it in an evidence package; preserve across reloads.
- Keep the ten existing blind CSV columns; append opaque snapshot/data/sheet identifiers. Strictly reject malformed CSV, duplicate headers/IDs, bad dates, wrong versions and unknown sites without partial mutation. Preview before confirmation, record filename/content digest/observer/date and refuse duplicate or racing imports. Legacy sheets may be explicitly previewed as unverified, never supporting approval.
- Compare both directions and return agree/disagree/insufficient. Missing or ambiguous proxies never imply agreement. Compare with the frozen inputs, not live weights/ranks.
- Require attributed inspection evidence before Inspected; a named/date/reason human review and all five OK checks before Approved; Approved before Planted; reason before Rejected. Changes to evidence/checks reopen review. Existing records are retained with missing-evidence warnings.
- Replace only a rejected site, from eligible frozen candidates. Exclude recorded rejections/field issues, preserve original/replacement IDs and reasons, mark replacements Needs inspection, and show original/revised unique reach and deltas.
- Benchmark equal-size shortlists on one common eligible pool: frozen multi-objective, heat-only, canopy-gap-only, constraint-aware ordering and 500 seeded random draws with p05/median/p95. Record eligibility, seed, sample size, unique reach, spread, unresolved map flags and field-evidence coverage. These proxy comparisons are not independent proof of benefit.
- Export a complete revised evidence package and CSV. Make missing/stale data and browser-save failures visible. Add genuine-human session templates/protocol but no invented results.

## Tasks and validation

- [x] Fix comparison/CSV safety with regression tests.
- [x] Add snapshot, provenance, atomic imports, status gates and replacement history with unit tests and migration coverage.
- [x] Add reproducible decision benchmarks with shared constraints and random distributions.
- [x] Integrate freeze → blind export → preview/import → human review → replace → compare/export in Pilot plan; retain sidebar/card controls with evidence gates.
- [x] Update documentation and independent-user kit. Run full unit/Python/browser suites, accessibility/mobile checks and a focused independent code review. Verify packaging in a clean serving environment; report unavailable container execution honestly.

No question/approval gate is needed: the user supplied the implementation scope and explicitly requested uninterrupted execution. Preserve the user's commits, verify the complete change and publish with documentation under their earlier explicit GitHub push instruction.

## Completed verification (2026-10-22)

- Incorporated upstream `cfa2c63` by fast-forward before resolving the overlapping plan/UI edits; retained intervention, readiness and optimizer features. Upstream was fetched again after integration and remained at that commit. No reset, force push or history rewrite was used.
- Frontend: `node --test frontend/tests/*.test.mjs`, 200 passed.
- Python: full pytest suite, 301 passed.
- Browser: `node frontend/tools/smoke.mjs http://127.0.0.1:8765`, 44/44 passed, including axe-core scans and the team's optimizer/intervention checks.
- Clean serving environment: a new venv installed only `backend/requirements-serve.txt`; startup loaded 564 cached sites. The complete browser suite against port 8766 also passed 44/44.
- Additional focused Pilot plan check passed after adding a 390px import-preview overflow assertion and mobile/benchmark screenshots; both screenshots were visually inspected.
- Independent code review identified five import/comparison/eligibility/export gaps and one legacy approval-to-planted bypass. All six were reproduced and fixed with regression tests. Review date consistency also has regression coverage.
- `git diff --check` passes. Real fieldwork/human usability sessions have not run. Docker is unavailable, so actual container execution remains unverified.

Publish the verified changes with a descriptive commit message and documentation, preserving upstream history and using a normal fast-forward push.
