# User flow

Written for: the pitch writers and judges asking "who uses this, and what happens next?". It separates what the app does today from the real-world steps that follow.

**One line for a slide:** Explore, Understand, Prioritise, Evaluate, Shortlist, Inspect, Plan the work, Plant and maintain. All eight are in the app as the planner's own records; the real-world work they record, and a shared audited version, are the pilot.

## The main user
A Sime Darby Property **landscape or sustainability planning officer** (hypothesis, to confirm with mentors), not the general public. Their question: *"We have a limited number of trees to plant this season. Where should we plant first, and why?"*

## The journey, in three stages
**Stage A: Choose (Map and Sites).** See the top sites numbered on the map, read why each ranks where it does, change what matters with the sliders, and compare what the first sites reach on the Sites page. Add the sites you like to the shortlist.
**Stage B: Check (Tracker).** Each shortlisted site moves along the Tracker's board: Shortlisted, Visit planned, Visited, Approved. A visit records who went, when and where the evidence is kept, plus five field checks (access, utilities, space and soil, maintenance, existing trees) that start as Not checked. Only a site with all five checks OK and a named, dated review can be approved; a problem blocks approval and a site set aside needs a reason.
**Stage C: Plant and learn (Tracker, then Advanced tools).** Once a person marks a site Planted, record each tree (species, date, who looks after it) and its follow-up checks; survival counts only inspected trees. Advanced tools hold what a real pilot needs around this: *Edit pilot plan* (choose sites, check coverage against the best-coverage round, plan inspections, plan planting, review and freeze the original shortlist), blind field sheets out and completed sheets back, the resident shade-exposure scenario and timed shade walks, and downloads.

Screening tools alongside: the site card shows siting-screen triggers (mapped roads, buildings and footpaths; not wildlife) separately from field checks, and the map can filter to flagged sites. The OSM-only licence fallback is a separate page that needs no Earth Engine data. These are screening and scenario tools, not field outcomes; see [assessment-response.md](../assessment-response.md).

| # | Step | In the app today | Where |
|---|---|---|---|
| 1 | **Explore** | the township map with the five highest-priority example sites marked 1 to 5, filters for open land and corridor edge | Map |
| 2 | **Understand** | a one-sentence reason per site, three scores, how steady the rank is, the measurements | site card |
| 3 | **Prioritise** | three sliders re-rank live; the note says how many of the top 10 changed | Map, "What matters most?" |
| 4 | **Evaluate** | what the first sites reach, each counted once; every site in a sortable table; footpath greenness layer | Sites, Layers |
| 5 | **Shortlist** | Add to shortlist from the site card, or the first five in one click; the original ranking is frozen | site card, Sites, Tracker |
| 6 | **Visit and check** | plan the visit, record it, five field checks kept separate from the priority score; blind field sheet out and back | Tracker, Advanced tools |
| 7 | **Decide** | approve only with five OK checks and a named, dated review; set aside with a reason; next-ranked replacements | Tracker |
| 8 | **Plant and maintain** | tree records for sites marked Planted, follow-up checks, survival among inspected trees only | Tracker, Advanced tools (Trees) |
| 9 | **Learn** | the next shortlist uses what the field showed (reasons stay in the records); a shared, audited version is not built | next |

**Trends** is for the sustainability analyst: two satellite periods side by side, greenness or ground heat, year by year, and how sure we are.

## What the plan is, and is not
Everything in the Tracker and Advanced tools is the **planner's own record**, stored in the browser on that device. It is not a planting-management platform: no logins, no shared database, no authenticated shared audit trail, and nothing is inspected, approved or planted by the tool. A status such as Planted only records what someone typed; completing the five checks never approves a site; an unknown stays unknown; a tree with no inspection is never counted as surviving. Making it shared and auditable would be the first thing to build in a real pilot.

## How to say it to judges
"Our planner starts with a planning question. The map ranks candidate sites; each one explains why. They change what matters, see what the first sites reach, and shortlist sites. Then the Tracker takes over: each site is visited, checked against five ground checks that start as Not checked, and approved or set aside by a named person with a reason. Approved sites are planted, each tree is recorded, and survival is counted only from trees someone inspected. It is the planner's own record, not an approval, and the real inspections are the pilot we would like to run with Sime Darby Property."

The reproducible freeze/review/replan loop and equal-size seeded benchmarks are documented in [validate-review-replan.md](../validate-review-replan.md). Export evidence JSON before clearing a cycle. These records do not substitute for real field or user-test results.
