# Pitch deck outline: Elmina Canopy Prioritiser (team Triple T)

Written for: the team member building the slides in the official template (10 main slides maximum, appendix allowed). Structured on the template's 8 areas **and** the official
two-part pitch, **Mechanism** (the solution, how it works, who benefits, why it creates value for the township) and **Enabler** (how technology enables it, the user experience, implementation at township scale).
Every number is from the repository (source in brackets). Screenshots are in `docs/pitch/screens/`. Words to avoid are listed at the end. Team and contact details are yours to fill in.

**The live deck** is in Figma Slides (https://www.figma.com/slides/LySZlNsfHqvMU1nNwuGpjZ). On 22 October 2026 it was revised in place to match this outline and reframed as a **pilot**: the problem is stated at township scale (Sime Darby Property's townships, with City of Elmina as the pilot), the product is called Canopy Prioritiser, the kicker says Planet (one track only), outdated test counts and the word "defensible" are gone, the Impact slide shows reach instead of an unsourced time-saving claim, the Feasibility slide states the Earth Engine licence and that hosting is not yet verified, and the three screenshot placeholders hold current screenshots. Still to do by the team: the team-information placeholders (leader, members, emails, phone). The deck has 12 main slides plus an appendix, above the 10-main-slide limit in the template; that was left unchanged on request.

**One thread through every slide:** *"Where should the next tree go first?"*

| # | Template slide | Part | Official criterion it earns marks on |
|---|---|---|---|
| 0 | Team information (front matter, if the template counts it, do not exceed 10 main slides) | | |
| 1 | The Problem | Mechanism | Strategic Fit, Impact |
| 2 | Target User | Mechanism | Strategic Fit, Commercial |
| 3 | Your Solution | Mechanism | Innovation, Impact |
| 4 | Innovation | Mechanism | Innovation |
| 5 | How it Works | Enabler | Feasibility, Pitch Quality |
| 6 | Impact | Mechanism | Impact |
| 7 | Feasibility | Enabler | Feasibility, Commercial |
| 8 | Implementation | Enabler | Feasibility, Commercial |
| 9 | Visual Concept | Enabler | Pitch Quality |
| 10 | Why your team should win (100 words or less) | | all |

## Slide 0: Team information (fill in)
Team name **Triple T**. Team leader: [name]. University: [university]. Members (3 to 5; the official rules need at least one who codes): [names and roles: backend, ML, frontend]. Contact: [email, phone].
Track: **Planet** (one track only).

## Slide 1: The Problem (Mechanism)
- Sime Darby Property plans a great deal of planting across its townships: a stated target of 50,000 endangered trees by 2030, a 5 km corridor in City of Elmina (developer material, [theme-fit.md](../theme-fit.md)).
- **Where to plant first** is decided every season. We found no published method for choosing at planting-site scale in a cloudy tropical township; existing tools rank US census areas ([prior-art.md](../prior-art.md)).
- Satellite maps do not settle it: three independent maps disagree on Elmina's tree cover, from about 4% to 28% ([crosscheck.json](../../backend/data/cache/crosscheck.json)).
- Why it matters: a wrong first choice costs a planting season and, across the world, roughly 6 to 7% of street trees die each year in the first five years ([prior-art.md](../prior-art.md)), so each planting should count.
- *Screen:* none; a simple map of Elmina.

## Slide 2: Target User (Mechanism)
- Primary: Sime Darby Property's landscape and planting team choosing this season's sites. Secondary: the sustainability and reporting team; township management. Beneficiaries: residents who walk (hypothesis; confirm with mentors, [commercial-case.md](../commercial-case.md)).
- Their challenge: limited planting budget, no field data to hand, and a need to explain "why here" to management.

## Slide 3: Your Solution (Mechanism)
**Elmina Canopy Prioritiser**: a map-first screening tool that ranks candidate planting sites by **heat relief**, **links between green areas** and **shade for walkers**, and explains every rank in a sentence.
Planners drag three sliders and the list and map update at once. It is a screening tool: **not a tree count and not a carbon figure.**
- *Screen:* `screens/01-plant-first.png` and `screens/02-site-card.png`.

## Slide 4: Innovation (Mechanism)
What is different from Tree Equity Score, i-Tree Landscape and Boston's Right Place, Right Tree ([prior-art.md](../prior-art.md)):
1. **Site scale (30 m cells)**, not census areas.
2. **A cloud-aware tropical pipeline from free data.**
3. **Corridor connectivity is a score**, which equity-first tools do not have.
4. **Rank steadiness:** 14 of the top 20 stay in the top 20 in at least 80% of 2,000 plausible settings ([uncertainty.md](../../ml/reports/uncertainty.md)). Austin's 2025 comparison found tools agree on broad areas but differ on specific top sites, so showing how steady a pick is matters.
5. **Honest limits on screen.**
We do not claim a new satellite method or to beat those tools. *Screen:* `screens/07-steadiness.png`.

## Slide 5: How it Works (Enabler)
Free satellite and map data to ranked sites, in five steps:
1. **Data:** Sentinel-2 greenness and Landsat ground heat on Google Earth Engine (two-year cloud-masked medians), plus OpenStreetMap footpaths, parks and buildings.
2. **Sites:** 564 simulated 30 m candidate cells, about 30 measured features each.
3. **Scores:** an ML scoring model gives heat relief, corridor connectivity and shade, with the default weights 45/30/25 (transparent, no fitted parameters because there are no labels).
4. **Serve:** a FastAPI service; the browser re-ranks with the same formula as the server (tested to match exactly).
5. **Explain:** a plain reason, rank steadiness and the limits for every site.
One command rebuilds everything in about 4 minutes and reproduced the committed data exactly.

## Slide 6: Impact (Mechanism)
**Reach, not outcome** ([impact_reach.md](../../ml/reports/impact_reach.md)). With the default ML ranking on the simulated sites, the first 50 sites are:
- within 50 m of about **5,400 m of footpath where the satellite sees little tree cover** (8% of the township's 65,860 m; 58% of what any site can reach);
- within 250 m of **349 of 968 mapped homes** (36%);
- within 50 m of about **1,150 m of the approximate corridor's gaps** (70% of about 1,650 m).
Say plainly: this counts what lies near the sites. It does not show cooling, health, survival or carbon; a pilot would measure those ([pilot-readiness.md](../pilot-readiness.md)).
Co-benefit for People: shade where people walk, near homes. *Screen:* `screens/05-reach.png`.

## Slide 7: Feasibility (Enabler)
- **Built and running**: 271 backend and ML tests, 101 frontend tests, a 30-check browser test including an accessibility scan and a hostile-data security test.
- **Free data**; hosting on a free tier works for a demo (`render.yaml`); exports for the planning team: ranked CSV, GIS map file and a printable brief (`screens/06-brief.png`).
- **What we need from Sime Darby Property:** the real site list, the official corridor outline, the current tree count, and a few hours of fieldwork.
- **Honest risks:** simulated sites; no ground truth; OpenStreetMap under-maps some areas; the Earth Engine registration is noncommercial, so a paid pilot needs a commercial plan or an open-data pipeline ([commercial-case.md](../commercial-case.md)).

## Slide 8: Implementation (Enabler)
1. **Now:** working prototype on simulated sites.
2. **Weeks 1 to 2:** load the real site list and the official corridor outline and rebuild (supported by the code).
3. **One afternoon:** walk the blind field sheet for 30 sites (`python -m backend.scripts.field_sheet`) and run the check (`import_field_checks`), the first real test of the ranking ([evidence-summary.md](../evidence-summary.md)).
4. **Plant a season** using the shortlist; count survival at 6, 12 and 24 months, including after any maintenance guarantee ends, and re-run the footpath and corridor reach on new imagery.
5. **Scale:** another township after a day or two of adaptation (an audit lists what changes; not yet run elsewhere, [commercial-case.md](../commercial-case.md)).

## Slide 9: Visual Concept (Enabler)
Four screenshots: the map with the numbered top five and sliders (`01`), a site card with its reason and steadiness (`02`), the reach card (`05`), and before and after with the honest verdict (`03`).
Caption each: "Example sites (simulated). Scores from the scoring model."

## Slide 10: Why your team should win (98 words)
Triple T built a working, honest screening tool, not a mock-up. From free satellite and OpenStreetMap data, it ranks 564 candidate planting sites in City of Elmina by heat relief, green-corridor links and shade for walkers, explains every rank in plain words, and lets planners change the weights live. We tested our canopy estimate against two independent maps, found they disagree by a factor of several, and say so on screen. Every number is reproducible with one command, so it can re-run each season. Give us the real site list and it becomes Sime Darby Property's planting prioritiser.

## Appendix (not counted in the 10)
A1 cross-check chart (`screens/03-before-after.png`); A2 method agreement ([method_agreement.md](../../ml/reports/method_agreement.md)); A3 prior-art table; A4 limits list ([data caveats in the app]); A5 planting scenario (`screens/04-scenario.png`, a scenario with named assumptions, not a forecast); A6 commercial hypotheses; A7 field check sheet; A8 judge Q&A ([judge-qa.md](../judge-qa.md)).

## Words to avoid on any slide
"proven", "accurate", "validated", "defensible", "reportable", "saves lives", "reduces heat illness", any carbon or tonnes figure, "our recommended sites" (they are simulated), "5% planted" and "10,266" (conflicting developer figures), "KL heat islands doubled".
