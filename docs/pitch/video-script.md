# 5-minute demo video: script and shot list

Written for: whoever records the video (or runs the live demo). The brief asks for a 5-minute video or a live demo link; this is a video with a live-demo fallback.
Timings add up to 5:00. **Say what we did, say what we did not, say what it would take.** Judges mark overclaiming down far more than modest honesty.

## Before you record (10 minutes)
1. Start the app: `uvicorn backend.api.main:app --port 8000` and open http://localhost:8000/ (or the hosted link; open it first, a free tier can take about a minute to wake).
2. Screen 1440x900, browser zoom 100%, close other tabs and notifications; use a clean browser profile.
3. Check the chips show "Example sites (simulated)" and "Scores: scoring model". If it says "Preview scores", stop: the scores are not loaded.
4. Rehearse once with a timer.
5. Keep `docs/pitch/screens/` open as a fallback if the live app fails mid-recording.

## Script
| Time | On screen | Say (plain words) |
|---|---|---|
| 0:00 to 0:25 | the Plant first screen | "Sime Darby Property plans to plant a great deal in its townships, for example a 5 km biodiversity corridor in City of Elmina. Each season someone has to decide where the next trees go first. We built a tool that helps answer that, from free satellite and map data. This is a screening tool, not a tree count or a carbon figure." |
| 0:25 to 0:55 | point at the chips and the honesty bar | "Everything here is labelled. The 564 sites are simulated example locations, not Sime Darby Property's list, and the scores come from our scoring model. We say that on every screen because we do not have ground truth." |
| 0:55 to 1:40 | click the rank-1 badge or the first site in the list; the site card opens | "The map shows the top five sites. Click one and you get a one-sentence reason: hot and bare around it, a footpath with no shade, next to a gap in the corridor. Then the three scores, and how steady the rank is: across 2,000 plausible weightings it stayed number one every time. That matters because other prioritising tools often agree on the area but disagree on the exact site." |
| 1:40 to 2:20 | drag the Heat relief slider to 100 and back; point at the note saying how many of the top 10 changed | "The planner decides what matters. Move a slider and the list and the map re-rank at once, in the browser, using the same formula as the server. The note says how many of the top ten changed." |
| 2:20 to 2:50 | switch the list to Spread out | "Spread out picks a first round that covers more areas, so one season is not all in one corner." |
| 2:50 to 3:30 | scroll to What the top sites reach, press Top 50 | "Here is what the first fifty sites reach: within 50 metres of about 5,400 metres of footpath with no tree cover, that is 8% of the township's; within 250 metres of 349 mapped homes; and near 70% of the corridor's gaps. Every footpath, home and gap is counted once. This is reach, not benefit. It does not prove anyone is cooler. A pilot would measure that." |
| 3:30 to 3:50 | press Print planting brief, then Map file for GIS | "For the planning team: a one-page printable brief with the limits attached, and a GIS file that opens in QGIS." |
| 3:50 to 4:30 | click Before and after; show the headline and the How sure are we bars | "Has tree cover changed? Not detectably. Our estimate moved from 9.7 to 10.4%, which is inside the year-to-year swing of about 5 points. And three maps disagree on Elmina's tree cover, from about 4% to 28%. So we use canopy to rank sites, not to quote a percentage." |
| 4:30 to 4:45 | open Methods and limits | "What we checked and what we did not: no field plots, no tree inventory, so nothing here proves the ranking is right." |
| 4:45 to 5:00 | back to the map | "What we need: the real site list, the official corridor, and one afternoon of fieldwork. A blind field sheet is ready to test the ranking on the ground. Then it becomes Sime Darby Property's planting prioritiser, re-run every season. Thank you." |

## If something goes wrong on camera
- The map is slow: wait for the loading message to disappear, then continue.
- The reach or scenario card is missing: the ML reports were not found; skip that section and say nothing about it.
- A number looks different from this script: use what is on screen and update the script afterwards; the numbers here come from the data version named in `ml/reports/impact_reach.md`.

## After recording
Watch it once at normal speed; check no personal tabs, passwords or email addresses are visible; keep it under 5:00; upload it and test the link in a private window.
