# Submission checklist

Written for: the team leader. Deadline: **23 October 2026, 11:59 PM**. Incomplete submissions will not be considered (submission template). Official rules and scoring:
https://www.simedarbyproperty.com/universityhackathon/ . Tick each box only after you have opened the thing yourself.

## Before anything
- [ ] The team is registered (registration closed 21 October): leader appointed, 3 to 5 members, at least one who codes, **one track chosen (Planet)**, and every member has accepted the team invitation.
- [ ] Contact details and university filled in on the Team Information slide.

## The four components
| Component | Required | What to submit | Done |
|---|---|---|---|
| Pitch deck | yes | the official template, **10 main slides at most**, appendix allowed; content in [deck-outline.md](deck-outline.md) | [ ] |
| Video or demo link | yes | a video of 5 minutes or less ([video-script.md](video-script.md)) **or** a live demo link; best: both, with the link tested in a private window | [ ] |
| Prototype or code link | yes | https://github.com/mpip0505/simedarbyhackathon (open it logged out; check the latest commit is there and the README renders) | [ ] |
| Supporting documents | optional | **PDF ready:** [docs/supporting/canopia-supporting-materials.pdf](../supporting/canopia-supporting-materials.pdf) (9 pages; rebuild from the HTML beside it with Chrome's print to PDF). Also links to `docs/prior-art.md`, `docs/evidence-summary.md`, `docs/commercial-case.md`, `docs/pilot-readiness.md`, `docs/judge-qa.md` in the repository | [ ] |

## Repository and hosting (only the team can do these)
- [ ] **Push, open the Actions tab and watch the first CI run** (`.github/workflows/tests.yml`). Fix whatever fails before anything else; a red badge on the first page a judge opens costs more than any missing feature.
- [ ] **Add a LICENSE.** Choose it yourselves: the code can carry any licence you pick, but the data in `backend/data/cache/` includes OpenStreetMap-derived data (ODbL, share-alike and attribution) and Earth Engine processing under a noncommercial registration, so say in the licence note which parts are covered.
- [ ] Set the GitHub repository **description, website and topics** (for example `urban-forestry`, `geospatial`, `fastapi`, `leaflet`, `sime-darby-hackathon`), and **tag the submission commit** (for example `v1.0-submission`).
- [ ] **Clean-clone test:** in a fresh folder and a fresh virtual environment, run only the README's commands (`pip install -r backend/requirements.txt`, `uvicorn backend.api.main:app --port 8000`) and open the app. Fix the README if anything is missing.
- [ ] **Deploy and test from another device.** Build the Docker image (it has not been built yet), deploy with `render.yaml`, set `CORS_ORIGINS` to the service's own address, leave `API_EXPOSE_DETAILS` unset, then open the link on a phone. The free plan sleeps when idle: open it a minute before presenting.
- [ ] Check in Firefox and on a real phone (only Chromium has been tested), and open the CSV and GeoJSON exports in Excel and QGIS.

## One conversation that is worth more than a feature
- [ ] Ask a hackathon mentor for 15 minutes using [mentor-conversation.md](mentor-conversation.md): who owns the budget, how sites are chosen today, what reporting evidence is needed. Record the answers honestly and label them "one mentor conversation".

## Final checks on the content
- [ ] No slide uses a word from the "avoid" list in the deck outline; the simulated sites are called simulated everywhere.
- [ ] Every number on a slide matches `ml/reports/impact_reach.md`, `ml/reports/uncertainty.md` and `backend/data/cache/crosscheck.json` for the committed data version.
- [ ] The "Why your team should win" text is 100 words or fewer (the draft is 98).
- [ ] The deck is also exported to PDF and opens on another computer.
- [ ] Live link: **https://canopia-app.vercel.app** (deployed on Vercel, project `canopia`; open it in a private window before submitting). `node frontend/tools/smoke.mjs https://canopia-app.vercel.app` runs the browser test against it (it drives a real browser and takes any address, so watch for surprises), and the first page load was tested cold.
- [ ] The repository has no secrets: search for tokens and your Google Cloud project ID before sharing (the push scans did not find any).

## After submitting
- [ ] Keep a screenshot of the confirmation. Judging runs 24 to 28 October and the Top 10 are announced on 28 October; the mentoring sprint is 2 to 6 November, final submission 11 November, Top 10 pitch day 14 November, final presentation 3 December.
- [ ] If you can walk even a few routes with a stopwatch before the final submission, do it: 5 walks on 2 routes fill the exposure baseline with a measured number ([shade-walk-protocol.md](../shade-walk-protocol.md)). Label proxy walkers as proxies.
- [ ] **Ask Sime Darby Property for the official corridor polygon.** Every corridor-gap result (stats, reach, trade-off, regenerate suggestions) is measured against an approximate corridor built from OpenStreetMap parks, and the sidebar says so. To switch: put the file at `backend/data/input/corridor_official.geojson`, run `python -m backend.build_cache --skip-gee` and re-run the ML reports (`python -m ml.run_scoring`, `ml.uncertainty`, `ml.shortlist`, `ml.impact_reach`, `ml.reach_sets`, `ml.tradeoff`); the sidebar then reads Corridor: official polygon.
- [ ] Ask the mentors for the real site list, the official corridor outline, the current tree count, and a few hours of fieldwork (see [pilot-readiness.md](../pilot-readiness.md)).
