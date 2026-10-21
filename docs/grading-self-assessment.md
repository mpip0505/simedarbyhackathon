# Grading self-assessment against the official rubric

Written for: the team, to decide what to build and say next. These are **our own estimates, not a prediction of the judges' marks**; re-check
the weights on the [official page](https://www.simedarbyproperty.com/universityhackathon/) before relying on them. Kept current batch by batch.

## The rubric (official)
| Criterion | Weight | Official description (short) |
|---|---|---|
| Impact and Sustainability Value | 25% | potential to deliver **measurable** benefits to residents, communities and the environment |
| Innovation and Differentiation | 20% | originality, and how it improves on or differs from existing solutions |
| Feasibility and Deliverability | 20% | practicality of implementing and piloting inside a Sime Darby Property township |
| Strategic Fit and Theme Relevance | 15% | alignment with the People or Planet theme and the developer's township priorities |
| Commercial and Value Multiplication | 10% | business value, and scaling across townships or use cases |
| Team, Evidence and Pitch Quality | 10% | research, validation, prototype or demo, team capability, clarity of presentation |

Pitch structure: **Mechanism** (the solution, how it works, who benefits, value to the township) and **Enabler** (how technology enables it, the user experience, implementation at township scale).
Submission also asks for a pitch deck (max 10 main slides), a 5-minute video or live demo link, and a code link. Proposal due **23 October 2026, 11:59 PM**.

## Honest grade, 22 October 2026 (before the score-raising batches)
| Criterion | Estimate | Why |
|---|---|---|
| Impact (25) | 13 to 15 | strong potential, no measured benefit; no ground truth; canopy change "not detectable" |
| Innovation (20) | 14 | cell scale, corridor score, rank steadiness, tropical pipeline, honest limits; not a new satellite method |
| Feasibility (20) | 13 to 14 | working, reproducible, tested prototype; simulated sites, no real data, no live URL, noncommercial Earth Engine licence |
| Fit (15) | 12 | Planet and Elmina corridor fit; thin People angle |
| Commercial (10) | 4 to 5 | "who pays" is a hypothesis; nothing run on a second township |
| Team, Evidence, Pitch (10) | 5 to 6 | research and prototype strong; no validation, deck or video yet |
| **Total** | **about 60 to 66** | |

## Plan to raise it (see the batches; realistic ceiling about 72 to 78)
0. housekeeping (this file, doc fixes, push) 
1. Impact: measured **reach** of the top sites (unshaded footpath, homes, corridor gaps), de-duplicated, plus a pilot measurement plan
2. Commercial: buyer, replication steps, other uses, licensing, labelled hypotheses; a township kit if the audit shows it is small
3. Evidence: field verification kit and a one-page evidence summary
4. Fit: map the tool to the developer's stated priorities and add the People angle
5. Pitch package: deck outline in the Mechanism and Enabler structure, a 5-minute video script, a submission checklist, a live-demo check

## What cannot be fixed in time (say it, do not hide it)
No ground truth (tree inventory, LiDAR or field plots) and no real Sime Darby site list. Impact therefore stays "potential, measured by reach, not outcome".

## Re-grade log
- 22 Oct 2026: baseline above.
- 22 Oct 2026, after Batch 1 (impact reach): Impact moves from about 13 to 15 up to about **16 to 18 of 25**. The tool now states what the top sites reach, de-duplicated
  (for example, the first 50 sites are within 50 m of about 5,400 m of footpath with no tree cover, 8% of the township's, and within 250 m of 349 of 968 mapped homes),
  and the pilot-readiness doc lists what a real pilot would measure. It is still reach, not outcome, because there is no ground truth. Total estimate about 63 to 70.
- 22 Oct 2026, after Batch 2 (commercial case): Commercial moves from about 4 to 5 up to about **6 to 7 of 10**. `docs/commercial-case.md` names the users, other uses, cost drivers,
  the Earth Engine licensing point and labelled hypotheses, and lists exactly what is Elmina-specific in the code (so another township is a day or two of work, not a rebuild from scratch).
  It stays a hypothesis because nothing has been run on a second township and we do not know the buyer's budget or current process. Not built: the township kit (the audit showed it is not a small change).
- 22 Oct 2026, after Batch 3 (evidence and validation): Team, Evidence and Pitch moves from about 5 to 6 up to about **7 to 8 of 10** (the deck and video are still to do), and Feasibility edges up
  by about 1 (a tested field check kit, a one-page evidence summary and a "what we checked, what we did not" note in the app). The kit is built and tested on synthetic answers only; **no field data has been collected**.
