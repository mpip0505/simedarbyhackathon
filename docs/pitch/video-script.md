# 5-minute demo video: script and shot list

Written for: whoever records the video (or runs the live demo). The brief asks for a 5-minute video or a live demo link; this is a video with a live-demo fallback.
Timings add up to 5:00. **Say what we did, say what we did not, say what it would take.** Judges mark overclaiming down far more than modest honesty.
The flow it follows is in [user-flow.md](user-flow.md): Explore, Understand, Prioritise, Evaluate, Plan, Export, then the field steps that are the pilot.

## Before you record (10 minutes)
1. Start the app: `uvicorn backend.api.main:app --port 8000` and open http://localhost:8000/ (or the hosted link; open it first, a free tier can take about a minute to wake).
2. Screen 1440x900, browser zoom 100%, close other tabs and notifications; use a clean browser profile (so the planting plan starts empty).
3. Check the chips show "Pilot township: City of Elmina", "Example sites (simulated)" and "Scores: scoring model". If it says "Preview scores", stop: the scores are not loaded.
4. Rehearse once with a timer.
5. Keep `docs/pitch/screens/` open as a fallback if the live app fails mid-recording.

## Script
| Time | On screen | Say (plain words) |
|---|---|---|
| 0:00 to 0:25 | the Plant first screen | "Sime Darby Property plans to plant a great deal across its townships. Each season someone has to decide where the next trees go first. We built a tool that helps answer that from free satellite and map data, and we piloted it in City of Elmina so it can expand to other townships. It is a screening tool, not a tree count or a carbon figure." |
| 0:25 to 0:50 | point at the chips and the honesty bar | "Everything is labelled. The 564 sites are simulated example locations, not Sime Darby Property's list, and the scores come from an explainable scoring model. We say that on every screen because we do not have ground truth." |
| 0:50 to 1:30 | click the rank-1 badge; the site card opens | "The map marks the top five sites. Click one and you get a one-sentence reason: hot and bare around it, a footpath with little shade, next to a gap in the corridor. Then the three scores, and how steady the rank is: across 2,000 plausible weightings it stayed number one every time. Other prioritising tools often agree on the area but disagree on the exact site, so this matters." |
| 1:30 to 2:00 | drag the Heat relief slider to 100 and back; point at the note saying how many of the top 10 changed | "The planner decides what matters. Move a slider and the list and the map re-rank at once, in the browser, with the same formula as the server." |
| 2:00 to 2:20 | switch the list to Spread out | "Spread out picks a first round that covers more areas, so one season is not all in one corner." |
| 2:20 to 2:55 | scroll to What the top sites reach, press Top 50 | "What do the first fifty sites reach? Within 50 metres of about 5,400 metres of footpath where the satellite sees little tree cover, 8% of the township's; within 250 metres of 349 mapped homes; and near 70% of the corridor's gaps. Every footpath, home and gap counted once. This is reach, not benefit. It does not prove anyone is cooler." |
| 2:55 to 3:35 | press Open the pilot plan; Add the first five ranked sites; show Field feasibility: Not checked; set two to Needs inspection; press Download field sheet; import the synthetic completed sheet; keep one, reject one and add a replacement | "Then the planner shortlists, and the Pilot plan takes over. Priority is what the model says; field feasibility is what a person has confirmed on the ground, and every check starts as Not checked. Two sites go out for inspection on a blind field sheet, place only, no rank or score. Here is a completed sheet, made up for this demo: the app checks every row, compares each observation with the model, and shows where the field agrees or differs. The planner keeps or rejects each site, with a reason, and can add the next-ranked alternative. These are the planner's own entries, saved on this device. Nothing is approved or planted by the tool." |
| 3:35 to 3:55 | scroll to Plan the work, then Plant and maintain; press Print planting brief | "Approved sites go into planting phases using the planner's own numbers, with the shortlist's reach counted once and a work schedule to download. Once a person records a planting, trees and follow-up inspections go here, and survival counts only the trees that were inspected. There is also a one-page brief and a GIS file for the planning team." |
| 3:55 to 4:35 | click Before and after; show the headline and the How sure are we bars | "Has tree cover changed? Not detectably. Our estimate moved from 9.7 to 10.4%, inside the year-to-year swing of about 5 points. And three maps disagree on the pilot township's tree cover, from about 4% to 28%. So we use canopy to rank sites, not to quote a percentage." |
| 4:35 to 4:45 | open Methods and limits | "What we checked and what we did not: no field plots, no tree inventory, so nothing here proves the ranking is right." |
| 4:45 to 5:00 | back to the map | "What we need: the real site list, the official corridor, and one afternoon of fieldwork. Then it becomes Sime Darby Property's planting prioritiser, re-run every season and ready for more townships. Thank you." |

## If something goes wrong on camera
- The map is slow: wait for the loading message to disappear, then continue.
- The reach, trade-off or scenario card is missing: the reports were not found; skip that section and say nothing about it.
- The planting plan is not empty at the start: press Clear the plan twice, or open the app in a private window.
- A number looks different from this script: use what is on screen and update the script afterwards; the numbers here come from the data version named in `ml/reports/impact_reach.md`.

## After recording
Watch it once at normal speed; check no personal tabs, passwords or email addresses are visible; keep it under 5:00; upload it and test the link in a private window.
