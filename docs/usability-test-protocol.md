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
| 3 | "Choose five sites to look at first and put them on a shortlist." | five sites in the Pilot plan | 4 min |
| 4 | "Pick two of them to inspect on the ground and get a sheet you can hand to someone." | two sites marked Needs inspection and a field sheet downloaded | 4 min |
| 5 | "Someone walked those two sites and filled the sheet in (the facilitator takes the sheet they downloaded in task 4, types in made-up answers for the two sites, writes SYNTHETIC in the notes column, and hands the file back; `docs/field-check/example_completed_synthetic.csv` shows the format). Bring the answers back and tell me what you learn." | imports the file and states which agree or differ | 5 min |
| 6 | "One site does not look right. Reject it and find a replacement." | status Rejected, a reason entered, a next-ranked alternative added | 4 min |
| 7 | "Which sites can you say are safe to plant?" | answers that none is confirmed, because the checks are Not checked or only the planner's entries | 2 min |

## What to record
For each task: completed without help (yes or no), seconds taken, number of wrong clicks or backtracks, and any sentence they said out loud that shows confusion. After task 7 ask:
1. "What would you do next, if this were your job?" (Does the answer match the Pilot plan steps?)
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
