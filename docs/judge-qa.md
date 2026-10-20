# Judge Q&A: hard questions with honest answers

Written for: whoever presents (and anyone covering Q&A). Every answer uses only what the repository can back up. Where
a number is quoted, it comes from the committed data (`backend/data/cache/`) or [pitch-fact-check.md](pitch-fact-check.md).
Answers marked **[ML to fill]** depend on the scoring model, which was not delivered when this was written.

**Style rule: say what we did, say what we did not, say what it would take.** Judges mark down overclaiming far more
than modest honesty, and a confident wrong number is the worst outcome.

## About the numbers

**1. How accurate is your canopy figure?**
It is a vegetation-index proxy, not a tree count, and we tested it against two independent satellite maps. They
disagree with each other: ESA WorldCover maps about 28% of Elmina as tree cover, Google Dynamic World about 7% falling to
4%, and our proxy about 10%. So canopy share is uncertain by a factor of several. We use it to rank sites, not to report
a percentage. *Do not say:* "about 10% canopy" without that range.

**2. Did tree cover increase between your before and after periods?**
We cannot say. Our proxy moved from 9.7% to 10.4%, but it moves about 5 points between single years, and Dynamic World
shows the opposite direction. The honest result is "no detectable change". The before/after view demonstrates that the
method can be re-run each season; it is not a measurement of growth.

**3. Can I trust the temperature?**
For ranking sites against each other, yes: they share the same composite. For quoting a temperature, no. Landsat thermal
is about 100 m native resolution, about 18% of the area has no reliable pixel and is filled from neighbours, and the
+3.5 C difference between periods mixes different clear days and seasons. Elmina is under construction, so some warming is
plausible, but we call it indicative.

**4. Where is your ground truth? How did you validate it?**
We have none: no tree inventory, LiDAR or field plots. What we did: an imagery go/no-go check, a threshold sensitivity
run, an independent cross-check against two land-cover products, and stability tests on the ranking
**[ML to fill: weight-stability results]**. These show consistency, not correctness. A pilot would need field plots, and
that is the first thing we would ask Sime Darby Property for.

**5. Why NDVI 0.6?**
Across the thresholds we tried, 0.6 agreed best with the two independent maps on average (F1 0.51, against 0.47 at 0.5
and 0.32 at 0.7). It is a screening choice, and the result is sensitive to it (about 18%, 10% and 3% canopy at 0.5, 0.6 and
0.7), which is why we do not quote a percentage.

**6. Tropical cloud ruins satellite analysis. How did you cope?**
Single scenes are mostly cloudy: only about 20% of Sentinel-2 scenes and 25% to 33% of Landsat scenes are under 40% cloud.
We pool two-year windows of cloud-masked scenes into per-pixel medians, which gave enough clear looks per pixel for both
periods. A first attempt at one-year windows was too thin for Landsat, and a weak cloud mask let haze through, so we
tightened the mask and widened the windows. The cost is that composites can blur short-lived change.

## About the data we used

**7. Are these real planting sites?**
No. We do not have Sime Darby Property's list, so we generated 564 candidate sites as 30 m cells on open land and
corridor land, minus buildings and roads, and labelled every one "simulated". The method is built so a real list can
replace them. *Do not say:* "our recommended sites".

**8. Is the corridor real?**
It is an approximation built from OpenStreetMap parks, joined along footpaths and roads where a sensible route exists, and
labelled approximate in the data and on screen. Its connecting spine is about 2 km against the stated 5 km, and one park is
left unlinked. If Sime Darby Property gives us the official polygon, we drop it in and rebuild; the code already supports that.

**9. Does OpenStreetMap cover Elmina well enough?**
Partly. It maps parks, paths and most buildings, but tags little undeveloped land in the west and few buildings in the
south-east, so the site map under-represents the west and our building-density feature is a lower bound there.

## About the idea and its value

**10. What is new here? Google already has tree canopy maps.**
Existing maps give a canopy layer; they do not tell a township team where to plant next given heat, a habitat corridor and
walking routes. Our contribution is the repeatable pipeline from free data to a ranked, explainable list, with adjustable
weights and honest uncertainty. We are not claiming a new satellite method. The cross-check also shows why a single
canopy map should not be trusted blindly.

**11. How does the ranking handle biodiversity and endangered species?**
It does not model species. Biodiversity enters through connectivity along the corridor and through vegetation context.
Species choice, ERT planting lists and soil suitability would need Sime Darby Property's landscape data. We say so rather
than pretend the score captures ecology.

**12. How does this help the net-zero targets?**
Sime Darby Property's own announcement names nature-based solutions among its levers. Our tool prioritises where planting
helps most for heat, connectivity and shade; it does not calculate carbon sequestration. Carbon accounting needs tree
growth models and field measurement, and removals are usually reported separately from gross emissions, which their
sustainability team would know better than we do.

**13. Does it satisfy the new climate-disclosure rules?**
No, and we do not claim it does. It supports prioritisation and monitoring. Disclosure-grade figures need ground truth,
assured methods and uncertainty ranges. See [pilot-readiness.md](pilot-readiness.md). *Check the exact rule wording before
citing it:* see row 6 of [pitch-fact-check.md](pitch-fact-check.md).

**14. Who pays, and why would they?**
Our hypothesis is Sime Darby Property's sustainability and landscape budgets, for better-placed planting and a repeatable
monitoring method. That is an expectation, not a confirmed fact. The data is free, so the marginal cost of a re-run is small;
the real costs are people, field validation and hosting. One licensing point: our Earth Engine registration is
noncommercial, so a paid pilot would need a commercial plan or a different imagery pipeline.

**15. Can it scale to other townships?**
The pipeline is parameterised by area, so a new township is mostly a new boundary. Limits: OpenStreetMap coverage varies, each
site needs its own validation, and commercial use changes the Earth Engine licence.

**16. What would a pilot look like?**
Sime Darby Property's real site list, one set of field plots or a LiDAR/drone sample to calibrate the canopy proxy, the
official corridor polygon, and a scheduled seasonal re-run. Details in [pilot-readiness.md](pilot-readiness.md).

**17. You say 5% of the trees are planted. Is that right?**
We do not use that figure. The developer's own pages conflict: one infographic says 10,266 trees planted (from a 2022
survey) while text on the same page says over 41,000. We would ask Sime Darby Property for the current count before
quoting any percentage.

## About the technology

**18. How does the scoring work?** **[ML to fill]**
Plain-language explanation from the ML developer: the three scores, the default weights and why, and what the stability
analysis shows. The weights are adjustable live in the app.

**19. What happens if the demo breaks?**
The demo runs offline from committed data, with no live Earth Engine or internet call. The API checks its own data at
startup, ignores a malformed score file instead of crashing, and keeps serving the last good data. The full pipeline rebuilds
in about four minutes and reproduced the committed data exactly.

**20. Is the data secure? Any personal data?**
The data is derived from public sources (satellite imagery and OpenStreetMap); there is no personal data. The API is
read-only and, as a localhost demo, has no login. A hosted version would need authentication and restricted access.

**21. Is the model explainable?** **[ML to fill]**
Aim for: every score is a transparent combination of named measurements, and the detail panel shows what drives each site's
rank.

## Curveballs

**22. What would you do with another month?**
Ask for a real site list, the corridor polygon and some field plots; calibrate the canopy proxy against them; replace
placeholder assumptions about "open land" with their land-use data; and add a feasibility filter for soil, ownership and
construction schedule.

**23. What is the biggest weakness of your project?**
No ground truth. We built the checks that show where the numbers are fragile instead of hiding it, and we know exactly what
data would fix it.

**24. What are you proudest of?**
A pipeline that rebuilds identically from scratch, tests that guard it, and an independent check that told us our own canopy
number was less certain than we first thought, which we then put on the screen.

## Phrases to avoid
"Accurate", "validated" (without saying against what), "defensible", "reportable evidence", "our recommended sites",
"canopy increased", "10,266 trees planted (5%)", "KL's heat islands doubled", "carbon sequestered".
