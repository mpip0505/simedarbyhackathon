# User flow

Written for: the pitch writers and judges asking "who uses this, and what happens next?". It separates what the app does today from the real-world steps that follow.

**One line for a slide:** Explore, Understand, Prioritise, Evaluate, Plan, Export, Field-verify, Implement. The first six are in the app; the last two are the pilot.

## The main user
A Sime Darby Property **landscape or sustainability planning officer** (hypothesis, to confirm with mentors), not the general public. Their question: *"We have a limited number of trees to plant this season. Where should we plant first, and why?"*

## The journey
| # | Step | In the app today | Where |
|---|---|---|---|
| 1 | **Explore** | the township map with the five highest-priority example sites marked 1 to 5, filters for open land and corridor edge | Plant first |
| 2 | **Understand** | a one-sentence reason per site, three scores, how steady the rank is, and the measurements | site card |
| 3 | **Prioritise** | three sliders re-rank live; Ranked or Spread out | What matters most, Top sites |
| 4 | **Evaluate** | what the first 10 to 100 sites reach (footpath with little tree cover, mapped homes, corridor gaps); five ways of choosing compared as a trade-off; footpath greenness layer | reach and trade-off cards, Layers |
| 5 | **Plan** | add sites to a planting plan, set a status and a note, mark which need inspection | Planting plan |
| 6 | **Export** | ranked CSV, GIS map file, a printable brief, the plan (CSV) and a blind field sheet (CSV) | sidebar, plan panel |
| 7 | **Field-verify** | not in the app: a person walks the sites. The blind field sheet and `python -m backend.scripts.import_field_checks` prepare and read back the check | pilot |
| 8 | **Implement** | not in the app: permissions, species, approval, planting, monitoring | pilot |

A second view, **Before and after**, is for the sustainability analyst: two satellite periods side by side, greenness or ground heat, year by year, and how sure we are.

## What the plan is, and is not
The planting plan is a **lightweight record of the planner's own decisions**, stored in the browser on that device. It is not a planting-management platform: no logins, no shared database, no audit trail, no inspection and no tracking of real planting. A status such as Planted only records what someone typed. Making it shared and auditable would be the next feature in a real pilot.

## How to say it to judges
"Our planner starts with a planning question. The map ranks candidate sites; each one explains why. They change what matters, see what the first sites reach, shortlist sites in a planting plan, mark which need inspecting, and export a brief, a GIS file and a field sheet. Then people walk the sites and check them before anything is planted. We built the first part and the tools for the second; the second part is the pilot we would like to run with Sime Darby Property."
