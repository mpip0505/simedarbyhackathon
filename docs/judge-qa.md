# Judge Q&A: hard questions with honest answers

Written for: whoever presents (and anyone covering Q&A). Every answer uses only what the repository can back up. Where
a number is quoted, it comes from the committed data (`backend/data/cache/`) or [pitch-fact-check.md](pitch-fact-check.md)
or the ML validation reports (`ml/reports/`, explained in [ml-model.md](ml-model.md)). The scoring model has now been
delivered (`score_source: "ml"` in `/meta`); the questions below that depended on it are filled in.

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
run, an independent cross-check against two land-cover products, and stability tests on the ranking. Nudging the
weight sliders around our defaults barely moves it (rank correlation 0.99, 18 of the top 20 unchanged); letting them
swing anywhere, including switching a whole benefit off, moves it more (median 0.92, worst case only 1 of 20 survives).
Refitting on 4/5 of the township's neighbourhoods and scoring the rest against that gives 0.997. A 2000-draw Monte
Carlo over every judgement call at once finds 14 of today's top 20 robust (in the top 20 at least 80% of the time) and
is explicit about which of the other 7 are closer calls, and why. All of this shows the ranking is *consistent* and
*stable*, not that it is *correct* - we say both halves of that sentence every time. A pilot would need field plots,
and that is the first thing we would ask Sime Darby Property for.

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

**10a. Is this only a tree-planting ranker? SDP's approach is Avoid, Regenerate, Conserve.**
No. Each site gets a suggested intervention: protect existing vegetation, regenerate habitat, plant for pedestrian shade, or inspect before deciding.
The top 10 are all corridor-gap restoration candidates, and 75 sites already look densely green to the satellite, so planting there could do harm.
Those are flagged for checking before anyone plants. The satellite cannot tell native species or habitat quality, so these are suggestions:
Protect and Regenerate stay flagged until a named ecologist has reviewed them. See [decision-support.md](decision-support.md).

**10c. If we can only inspect 10 sites, why not just take the top 10?**
The top 10 sit side by side and reach much of the same footpath and homes. The best-coverage round picks each next site for what it adds that
is not yet reached. With 10 sites it reaches 51% more poorly shaded footpath, 8% more mapped homes and about three times the corridor gap.
The cost is a lower average score (80.0 against 86.2), and we show that cost openly. It is best only against this reach objective, not
environmentally optimal.

**10b. Tree Equity Score and i-Tree already prioritise where to plant. Why another one?**
They rank US census areas using canopy gap, heat and social vulnerability, built on US data; none of them picks individual 30 m
cells, none has a habitat-corridor goal, and they are not built for cloudy tropical imagery. A 2025 comparison of five such tools in
Austin found they agree on the broad area but differ on the specific top sites, so one list is not "the answer". That is why we
show a rank-steadiness result and adjustable weights. What they have that we lack: a social-vulnerability layer, planting
feasibility and species (Boston), and an outcome evaluation. We are not claiming to beat them. See [prior-art.md](prior-art.md).
*Do not say:* "better than Tree Equity Score". Our `ml/method_agreement.py` compares simplified stand-ins on our own data;
agreement is not accuracy.

**10c. Does prioritising where to plant actually work?**
Honestly, it is largely unevaluated. Cooling and health benefits of more tree cover are mostly modelled (for example a London study),
and a Stanford review calls the causal evidence for heat-health benefits weak. What is well documented is that survival is the weak
link: roughly 6 to 7% of street trees die each year in the first five years. So we claim decision support for where to plant first,
not measured cooling, and our implementation plan puts field checks and post-planting care first. See [prior-art.md](prior-art.md).

**10d. What happens after the planner exports the shortlist?**
The app has a **Pilot plan**: the planner shortlists sites, records five field-feasibility checks per site (land access, utilities, space and soil, maintenance access, existing trees; each Not checked until a person sets it, and separate from the priority score), sends a blind field sheet out and imports the completed sheet back, where each observation is compared with the model (agree or differ; one visit, not validation). The planner keeps or rejects each site, with a reason, and can add the next-ranked alternatives. Approved sites are grouped into phases using the planner's own capacity and costs (nothing assumed), with the unique reach of the shortlist and a work schedule. Once a person marks a site Planted, trees and follow-up inspections are recorded, and recorded survival counts only inspected trees. All of it is the planner's own record kept in the browser on that device: the tool does not inspect, verify, approve or plant, and there are no logins or shared records yet. The real inspections, permissions, species choice and planting are the pilot: [pilot-readiness.md](pilot-readiness.md). A shared, auditable version for a team is the obvious next feature, not something we claim today.

**10e. Can a top-ranked site really be planted?**
Not necessarily, and the tool says so. Priority (what the model ranks) and field feasibility (what a person has confirmed on the ground) are shown separately; a site with all five checks recorded as OK is labelled "not an approval", unknown checks stay Not checked, and approving a site with unresolved checks is flagged. Malaysia's landscape guidance and urban-forestry practice both treat site and species suitability as separate from where trees would help most, so we do not claim a ranked site is plantable.

**10f. Have real users tried it?**
Not yet. [usability-test-protocol.md](usability-test-protocol.md) is the protocol (seven tasks, what to record, how to label proxy users) and the results table is empty. We will not report results before the sessions are run.

**10g. Is the siting screen a wildlife-conflict assessment?**
No. It flags **mapped roads within 15 m, buildings within 10 m and footpath overlap** near a candidate site, for tree-fall, clearance and access review; the thresholds are prototype choices, not legal setbacks. It does **not** assess wildlife: no forest-edge layer is mapped, so we cannot say anything about macaques or other animals, and a forest-edge flag would need an ecologist to set it. We renamed it "siting screen" because "conflict" invited that misreading. No mapped flag does not mean safe to plant.

**10h. Where does the shade-exposure number come from? Your calculator starts empty.**
On purpose: nothing is guessed. Without inputs it shows what needs no assumption (the unique mapped homes the shortlist reaches) and lists each missing input with what would fill it. The one input that can be measured today is the **current shade share**, from timed shade walks: a stopwatch on a route, pooled over at least five walks on two routes ([shade-walk-protocol.md](shade-walk-protocol.md)). That fills only the baseline. The shade after planting, residents per building and route use stay assumptions until someone measures them, so the output is a scenario. No walks have been done yet.

**10i. Is the OSM-only path a second model? What does it replace?**
No. It is a licence fallback. Our Earth Engine registration is noncommercial, so a commercial buyer could ask what runs without it. The OSM-only screen ranks simulated cells only by closeness to a mapped footpath (60%) and a mapped park (40%); it cannot see heat, tree cover, shade or species, and its scores cannot be compared with the satellite model. It replaces the Earth Engine compute step for a reduced screening, not the satellite method, and whether the full satellite workflow may be used commercially is a separate decision.

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

**16a. Wait — is this itself a pilot, or not?**
Both answers are true, for two different things. We **did** pilot the method: the pipeline, corridor model and
scoring ran end to end on real satellite imagery and real OpenStreetMap data for a real township, City of Elmina —
not a toy example. We have **not** piloted real planting: the 564 candidate sites are simulated, not Sime Darby
Property's list, so nothing has been planted or tested against their own records yet. *Do not say* "we piloted tree
planting in Elmina" — say "we piloted the method in Elmina; piloting real planting is the next, concrete step."

**17. You say 5% of the trees are planted. Is that right?**
We do not use that figure. The developer's own pages conflict: one infographic says 10,266 trees planted (from a 2022
survey) while text on the same page says over 41,000. We would ask Sime Darby Property for the current count before
quoting any percentage.

## About the technology

**18. How does the scoring work?**
Three scores out of 100 - cooling benefit, habitat connectivity, shade on walking routes - each a plain weighted
average of a handful of satellite and map measurements of a site's surroundings, blended into one total that sorts
the map. No model is trained: there are no labels to train one on, and a fitted model would invent confidence we
cannot back. Default weights are cooling 0.45, connectivity 0.30, shade 0.25 - heat is the best-measured of the
three, connectivity is weighted down because the corridor it depends on is approximate. The weights are adjustable
live in the app (`/weights`, re-ranks via `?w_cooling=`), and the pitch deck's shortlist spreads the same top sites
across 10 neighbourhoods instead of one corridor-edge strip, for one point of average score. Full write-up:
[ml-model.md](ml-model.md).

**18a. Do you predict future canopy or temperature?**
No, deliberately. Our yearly series is five historical points with more year-to-year noise than
signal (one year's canopy band alone spans 6.6% to 21.9%), so fitting a trend through it and calling
it a forecast would be a worse version of the overclaiming we refuse to do elsewhere. What we show
instead is a labelled **scenario**: if the top-ranked sites are planted, a plausible canopy
trajectory for *that planted set* under a named, swappable growth-speed assumption (not fitted, not
cited) — anchored to one real measurement, what canopy already looks like inside Elmina's existing
parks today (about 15%, using the same NDVI definition as everywhere else). It does not translate
into a temperature or carbon number; we have no calibrated relationship to do that honestly. See
`ml/reports/scenario.md`. *Do not say:* "we predict X% canopy by 2030."

**19. What happens if the demo breaks?**
The demo runs offline from committed data, with no live Earth Engine or internet call. The API checks its own data at
startup, ignores a malformed score file instead of crashing, and keeps serving the last good data. The full pipeline rebuilds
in about four minutes and reproduced the committed data exactly.

**20. Is the data secure? Any personal data?**
The data is derived from public sources (satellite imagery and OpenStreetMap); there is no personal data. The API is
read-only and, as a localhost demo, has no login. A hosted version would need authentication and restricted access.

**21. Is the model explainable?**
Yes, deliberately so, and that was a design choice over a more complex model: every score is a transparent weighted
average of eight named measurements (how hot the surroundings are, how close to a corridor gap, how much nearby
footpath has no shade, and so on), with one of two simple rules deciding how each is turned into a 0-100 input - a
percentile rank for things that only mean something relative to other sites, a decay curve for things with physical
distance meaning. No hidden layers, nothing fitted to data we do not have. The detail panel can show exactly which
of those eight pushed a site's rank up or down, in one step back from the number on the map.

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
"canopy increased", "10,266 trees planted (5%)", "KL's heat islands doubled", "carbon sequestered",
"we predict/forecast X% canopy by [year]" (say "scenario", not "forecast" — see Q18a).
