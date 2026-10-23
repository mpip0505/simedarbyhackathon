# Usability test protocol (to run, not yet run)

Written for: whoever runs the first test with real people, and for judges asking "did anyone besides the team use this?". **No test has been run yet: there are no results in this repository, and none should be invented.**
Fill in [the results template](#results-template) after each session and keep the raw notes.

## Who to test with, and how to label them
- **Best:** two or more people who plan or manage landscaping, facilities or planting (for example from the township's landscape team, or a university facilities office).
- **Acceptable, if that is all that is available:** classmates or friends who have never seen the tool. They are **proxy users**. Label them that way everywhere: "proxy-user usability test", never "Sime Darby Property stakeholder validation".
- Do not coach. The person who built it must not sit beside the participant explaining it.

## Set-up (5 minutes)
Open the app in a private window (so the planting plan starts empty), screen 1440x900. Give the participant the sheet below and nothing else. Record the screen if they agree, and note the time taken for each task.

## Tasks (read aloud; one at a time)
| # | Task | Done when | Time limit |
|---|---|---|---|
| 1 | "You have a limited number of trees to plant this season. Find the site the tool ranks first and tell me why it ranks there." | says the one-sentence reason (heat, shade or corridor gap) in their own words | 3 min |
| 2 | "Change what matters most so heat counts for everything. Did the top of the list change? How do you know?" | moves the sliders and reads the note about how many of the top 10 changed | 3 min |
| 3 | "Choose five sites to look at first and put them on a shortlist." | five sites on the shortlist (Tracker) | 4 min |
| 4 | "Pick two of them to inspect on the ground and get a sheet you can hand to someone." | original shortlist frozen, two sites marked Needs inspection and a versioned field sheet downloaded | 4 min |
| 5 | "Someone walked those two sites and filled the sheet in (the facilitator takes the sheet they downloaded in task 4, types in made-up answers for the two sites, writes SYNTHETIC in the notes column, and hands the file back; `docs/field-check/example_completed_synthetic.csv` shows the format). Bring the answers back and tell me what you learn." | previews the file without changing observations, confirms import, and explains agree, disagree or insufficient evidence | 5 min |
| 6 | "One site does not look right. Reject it and find a replacement." | named, dated rejection review with a reason; linked eligible replacement added as Needs inspection | 4 min |
| 7 | "Which sites can you say are safe to plant?" | answers that none is confirmed, because the checks are Not checked or only the planner's entries | 2 min |

## What to record
For each task: completed without help (yes or no), seconds taken, number of wrong clicks or backtracks, and any sentence they said out loud that shows confusion. After task 7 ask:
1. "What would you do next, if this were your job?" (Does the answer match the Tracker's stages?)
2. "Was anything on screen hard to read, find or understand?" (Note keyboard, screen reader or contrast problems if they use any.)
3. "What would stop you using this in your real work?"

## Measures to report
Completion rate per task, median time per task, total errors, and the three most common points of confusion, with the number of participants. State **n** next to every number. With fewer than five participants, say the findings are anecdotal.

## Honest framing for the deck
"Proxy-user usability test, n = X: Y of X completed the shortlist-to-field-sheet flow unaided. The main confusion was Z, which we fixed." Only after it has actually been run.

## Results template
| Participant (role, proxy or real) | T1 | T2 | T3 | T4 | T5 | T6 | T7 | Notes |
|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | | | |
| P2 | | | | | | | | |

## Additional reproducibility tasks

After task 6, ask the participant to compare the original and revised reach, explain why equal-size method rows differ from reference rows, and download the evidence package. Record success, time and confusion separately. Ask them to distinguish a mapped trigger, an observation disagreement and a confirmed field issue. Use [usability-session-log.csv](usability-session-log.csv) for raw task records. The file intentionally contains headers only: no sessions have been run. Keep synthetic demonstration sheets clearly labelled and preserve their issued metadata.

## Facilitator rehearsal of tasks 4 to 7 (not a usability result)
Before running people, the flow of tasks 4 to 7 was rehearsed by the automated browser test (`frontend/tools/smoke.mjs`, the pilot plan check, now under Advanced tools), which freezes the shortlist, marks sites Needs inspection, downloads the versioned field sheet, previews a synthetic completed sheet without changing observations, imports it, rejects a site with a reason and adds a linked replacement. Task 7 ("Which sites are safe to plant?") is answered by a summary line above the site cards: "0 of N sites have all five field checks marked OK ... None is approved for planting". This shows the flow is **completable**; it says nothing about whether a person can find their way through it. That is what the sessions above are for, and no sessions have been run.
