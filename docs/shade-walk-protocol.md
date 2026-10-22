# Timed shade-walk protocol

Written for: whoever walks the routes, and for judges asking "where does the shade number come from?". **No shade walks have been done yet. Nothing in this repository is a measured shade share; the example file is synthetic.**
The resident shade-exposure calculator in the Pilot plan (step 3) starts with every input empty. This protocol produces the one input that can be measured today: the **current share of walking time in shade**.

## What a walk measures, and what it does not
- **Measures:** on one route, at one time of day, in one kind of weather, how many of the minutes walked were in shade (tree, building or structure).
- **Does not measure:** the shade after planting (that stays an assumption until the same routes are walked again), how many people use the route (that needs route-use counts), how many residents live nearby (OpenStreetMap maps buildings, not households), or any cooling or health effect.
- **Why minutes, not canopy percentages:** satellite greenness at 10 m rates about 95% of footpath as unshaded, so it cannot be used for this. A stopwatch can.

## Before you go
1. In the app: Pilot plan, add your shortlisted sites, then step 3, **Timed shade walks, Download blank walk sheet (CSV)**. It lists a route name for each shortlisted site ("near ELM-xxxx") with two rows each. Rename routes if you walk something different; keep each name consistent.
2. Print the sheet or open it on a phone. Two stopwatches (phone timers) per walker: one for total walking time, one for time in shade.
3. Decide the walk times. Walk the **same routes at the same time of day** before and after planting. Midday and late afternoon give different answers; record the start time every time.

## On each walk
1. Start at one end of the route. Start both stopwatches. Walk at a normal pace along the footpath the residents would use.
2. Run the shade stopwatch only while you are in shade; pause it in full sun. Brief gaps under a single branch count as shade only if you are actually shaded.
3. At the end, stop both. Record: walk id, route, date, start time (24 h, for example 09:30), weather (sunny, cloudy, overcast, after rain), participant type, walking minutes, shaded minutes, and a note about anything unusual (a closed path, a detour, a lorry shading the road).
4. **Participant type matters:** `resident` (lives in the township), `proxy` (a student or colleague standing in for a resident), `team` (a project member). Say which. Proxy and team walks are not residents' experience.

## How many
At least **5 walks on at least 2 routes** before the app will let you use the result as a baseline. More is better: a few routes, a few days, both morning and afternoon. Record the weather; a cloudy day is not the same measurement as a sunny one.

## Bringing the answers back
Pilot plan, step 3, **Import completed walk sheet**. The app checks every row (real date, time as HH:MM, a known participant type, walking minutes above 0 and at most 240, shaded minutes between 0 and walking minutes, no repeated walk id). A bad file is refused whole and nothing changes. Empty rows are left out, not guessed.
It then shows the pooled share (total shaded minutes over total walking minutes, not an average of percentages), the spread of single walks, per-route shares and the date range. **Use as the current shade share** fills only that one input and writes where it came from into the basis box.

## After planting
Walk the same routes again, at the same times of day and in similar weather, with the same participant types. The difference between the two pooled shares is a measured change on those routes, with its limits stated: small samples, different days, and different people. It is still not a population effect and not a cooling or health result.

## Keep the raw notes
Keep the raw sheets, who walked, and any photos. Say in any report how many walks, on how many routes, at what times, and who walked.

## Files
- `docs/field-check/shade_walk_sheet_template.csv`: the blank sheet header (same columns the app writes and reads).
- `docs/field-check/shade_walk_example_synthetic.csv`: **eight invented rows** showing the format. Every row says SYNTHETIC. Do not import it as if it were data.
