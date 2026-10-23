# 5-minute prototype demo video: flow and script

Written for: whoever records the demo video for the Sime Darby Property University Hackathon 2026 (Planet track). The brief asks for a video of 5 minutes or less, or a live demo link.
The script runs about **4:50** at a calm pace (about 540 spoken words, plus pauses while you click). **Say what we did, say what we did not, say what it would take.** Judges mark overclaiming down far more than modest honesty.
It follows the app as it is now: Home, Map, Sites, Tracker, Trends, Methods and limits.

## The flow in one line
Problem (Home) → where to plant first (Map) → why this site (site card) → what matters to you (sliders) → pick sites (Add to shortlist) → what they reach (Sites) → follow each site from visit to planted (Tracker) → has anything changed yet (Trends) → what we did not check (Methods and limits) → what we need next.

## Before you record (10 minutes)
1. Start the app: `uvicorn backend.api.main:app --port 8000` and open http://localhost:8000/app/ (or the hosted link; open it a minute early, a free tier can take that long to wake).
2. Use a **fresh private window** so the app opens on Home and the shortlist and Tracker are empty.
3. Screen 1440x900, browser zoom 100%, close other tabs and notifications.
4. On the Sites page, check the chips read "Example sites (simulated)" and "Scores: scoring model". If they say "Preview score", stop: the scores did not load.
5. Rehearse once with a timer. If you run long, cut the "Spread out" line (Scene 4) and Scene 8 first.
6. Keep `docs/pitch/screens/` open as a fallback if the live app fails mid-recording.

## Script
| Time | Scene | On screen (do this) | Say |
|---|---|---|---|
| 0:00 to 0:20 | 1. The problem | **Home** page | "Sime Darby Property's stated goal is 210,000 trees in City of Elmina at completion. Planting capacity is limited, so every season someone decides where the next trees go first. That choice matters: a tree where it is hot, bare and walked past does more than the same tree somewhere else." |
| 0:20 to 0:40 | 2. What Canopia is | Stay on Home; point at the three steps and the "Good to know" line | "Canopia ranks candidate planting sites, 30 metres across, from free satellite and map data. You decide; it suggests. Everything is labelled: these 564 sites are simulated examples, not Sime Darby Property's list, and this is not a tree count or a carbon figure." |
| 0:40 to 1:25 | 3. Why this site | Press **Open the map**. Point at the numbered badges, then click badge **1**; the site card opens on the left. Scroll the card to **What might this place need?** | "The map ranks every site and marks the top five. Click one and it explains itself in one sentence: hot, bare surroundings, a footpath with no shade, right next to a gap in the approximate corridor. Then the three scores: heat relief, links green areas, shade for walkers. Across 2,000 plausible weightings it stayed number one every time. And for biodiversity it speaks Sime Darby Property's own language, Avoid, Regenerate, Conserve: here it suggests Regenerate, and says an ecologist must decide." |
| 1:25 to 1:45 | 4. What matters to you | Close the card. Drag **Heat relief** up; point at the note "N of the top 10 changed". Optional: switch the list to **Spread out** | "The planner decides what matters. Move a slider and the map and the list re-rank at once, and it says how many of the top ten changed. Spread out picks a first round across more neighbourhoods." |
| 1:45 to 2:00 | 5. Pick sites | Reset the sliders. Open site 1 again and press the orange **Add to shortlist**. Point at the **Shortlist 1** button at the top | "When a site looks right, add it to the shortlist. That is the hand-off from ranking to real work." |
| 2:00 to 2:25 | 6. What they reach | Click **Sites** in the sidebar. In **Your shortlist**, press **Add the first five in the list** (it adds the other four). Scroll to **What the top sites reach** (Top 50 is selected) | "Sites is the same ranking as a table you can sort and download, and here I add the rest of the top five. What would the first fifty sites reach? About 5,400 metres of footpath with little tree cover, 349 mapped homes within 250 metres, and about 70 percent of the corridor's gaps, each counted once. That is reach, not benefit: it does not prove anyone is cooler." |
| 2:25 to 3:40 | 7. Follow each site | Click **Tracker** (five cards are in Shortlisted). Press **Plan all 5 visits**, then **Download the field sheet**. On the first card press **Record the visit**: type a name and "photo 12", open each of the five check dropdowns and pick **OK**, **Save the visit**. Press **Decide**, type a name and a reason, press **Plant here**. Show the card in **Approved** | "The Tracker follows every site you picked, from shortlist to planted, and each card says the one thing to do next. First a person visits. The field sheet has the places but no ranks or scores, so the visitor is not influenced. After the visit you record who went, when, the evidence, and five checks: access, utilities, space and soil, maintenance, existing trees. Only when all five are OK can someone approve it, with their name, a date and a reason. If a check finds a problem, approval is blocked and the card says why. These are the planner's own entries, saved on this device. Nothing is inspected, approved or planted by the tool." |
| 3:40 to 3:55 | 8. After planting | Point at the **Planted** column (or open **Mark as planted** without confirming) | "Once a person plants, the site moves to Planted, and each tree is recorded and checked every few months. Survival counts only the trees someone actually inspected." |
| 3:55 to 4:25 | 9. Has anything changed? | Click **Trends**; show the headline and the figures, then scroll to **How sure are we?** | "Has tree cover changed? Not detectably so far. Our estimate moved from 9.7 to 10.4 percent, inside the normal year-to-year swing. And independent maps disagree on the township's tree cover, from about 4 to 28 percent. So we use canopy to rank sites, never to quote a percentage." |
| 4:25 to 4:35 | 10. What we did not check | Click **Methods and limits** | "Here is what we checked and what we did not: no field plots and no tree inventory, so nothing here proves the ranking is right yet." |
| 4:35 to 4:50 | 11. What we need | Back to **Map** | "What would make it real: the actual site list, the official corridor outline, and one afternoon of fieldwork. Then Canopia becomes a planting prioritiser Sime Darby Property can re-run every season, and take to the next township. Thank you." |

## Numbers in the script, and where they come from
| Said | Source (data version `f12bc98c3fbd`) |
|---|---|
| 210,000 trees | Sime Darby Property's stated goal at completion, attributed to the developer ([pitch-fact-check.md](../pitch-fact-check.md)); do not say how many are planted so far, the sources conflict |
| 564 simulated sites | the Sites page and `backend/data/cache/sites.geojson` |
| 2,000 weightings, rank 1 every time | the site card's "How steady is this rank?" for site ELM-3734-11725 ([ml/reports/uncertainty.md](../../ml/reports/uncertainty.md)) |
| 5,400 m footpath, 349 homes, about 70% of corridor gaps (top 50) | [ml/reports/impact_reach.md](../../ml/reports/impact_reach.md): 1,150 m of about 1,650 m of gaps |
| 9.7% to 10.4% tree-cover estimate | the Trends page (`backend/data/cache/summary.json`) |
| about 4% to 28% between maps | the "How sure are we?" card (`backend/data/cache/crosscheck.json`: ESA WorldCover 27.7%) |

If a number on screen differs from this script, say the number on screen and fix the script afterwards.

## Words to keep, words to avoid
- Keep: "simulated sites", "approximate corridor", "screening tool", "reach, not benefit", "the planner decides".
- Avoid: "accurate", "validated", "proves", "our recommended sites", "carbon sequestered", "canopy increased", or any tree count we cannot source.

## If something goes wrong on camera
- The map is slow: wait for the loading message to go, then continue. If it stays on "Loading Elmina data" for more than a few seconds, reload the page (this happened once in testing when the tab was hidden while it loaded).
- The reach card is missing on Sites: the reports were not found; skip Scene 6 and say nothing about it.
- The Tracker is not empty at the start: open the app in a new private window.
- Shortlisted shows fewer than five cards: you skipped **Add the first five in the list** on Sites. Use **Pick more sites**, or say "here are the sites I picked" and carry on; the button reads **Plan all N visits** for however many there are.
- **Download the field sheet** makes the browser show its download bar or ask where to save: allow downloads for localhost before you record, or cut that moment in editing.
- The Tracker scene is the longest and has typing: keep the names short ("A. Tan", "photo 12", "Access confirmed"), or cut the typing in editing.
- "Plant here" is refused: one of the five checks is not OK, or the decision date is before the visit date. Fix it, or show the refusal and say "approval needs all five checks OK".

## After recording
Watch it once at normal speed; check no personal tabs, passwords or email addresses are visible; keep it at 5:00 or less; upload it and open the link in a private window to test it.
