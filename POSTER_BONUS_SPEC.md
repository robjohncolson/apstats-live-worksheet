# Posters as pure bonus + one poster per quarter (spec, 2026-10-09)

Status: PR 1 (sections 2, 5, 6) BUILT 2026-10-09 by Opus, Codex-reviewed, in the working tree awaiting push
sign-off. Sections 3 and 4 not started. **Grade-affecting** (changes the Work track blend
that feeds the Desk grade, the nightly Schoology official grade, and the gradebook grid).

Teacher (2026-10-09 evening): E fell two days behind on the Unit 1 poster, and a Period B student
who missed the week would have had no way to earn the Posters slice. "I want the posters to be
merely additive, a way to stabilize grades. So it becomes purely bonus. 50, 35, 15."

This reverses the morning decision ("posters stay at 30%"). That decision assumed posters would
get a data source (v3.4). This spec retires v3.4: posters never become a Work track.

## 1. Decisions

1. **Posters leave the Work formula.** The Work track is lessons, quizzes, Blooket only.
2. **New Work split: lessons 0.50 / quizzes 0.35 / blooket 0.15.** Quizzes go down from the
   effective 43% they hold today (posters are absent, so the 30/30/10 renormalizes to 43/43/14).
3. **A poster is a Bonus Bank row.** Graded E/P/I by hand like today, entered as a banked bonus
   and applied at quarter close by the existing higher-track rule (`BONUS_HIGHER_TRACK_SPEC.md`).
   Stored as 5/3/1, but the bank applies `bonusMultiplier` 1.5 (PHASE3_CONFIG since 2026-10-03) to
   EVERY bonus row, so a poster is worth **E +7.5 / P +4.5 / I +1.5** on the chosen track, same as
   a DOK sheet. (Found in Codex review 2026-10-09; the teacher accepts posters at the DOK rate
   unless they say otherwise.) It can only raise a grade. No row = nothing lost.
4. **One poster per quarter.** Unit 1's poster is Q1's. Later quarters: one unit each, chosen by
   the teacher (proposal in section 4). Every other unit loses its poster days; the schedule
   generator reclaims them (E gets back about two class days per dropped poster).
5. **Absentees:** no make-up is required. A student who missed the poster simply has no bonus
   row. The teacher MAY accept a solo paper poster later and enter it the same way; that is a
   teacher call per case, not a rule in the system.

## 2. Grade engine (roster-server, auto-deploys on push)

Every weight declaration changes together, same commit:

| File | Today | After |
|---|---|---|
| `roster-server/lesson-grade.js` `V3_WORK_WEIGHTS` | {lessons .30, quizzes .30, posters .30, blooket .10} | {lessons .50, quizzes .35, blooket .15} |
| `roster-server/grade-config.js` `v3WorkWeights` | same | same new value |
| `roster-server/gradebook-grid.js` `SCHOOLOGY_CATEGORY_WEIGHTS` | Lesson 15 / Quizzes 15 / Posters 15 / Blooket 5 / PC 50 | Lesson 25 / Quizzes 17.5 / Blooket 7.5 / PC 50 (Work 50 x split) |
| `tools/schoology_official.py` `WORK_WEIGHTS` | {Lesson 15, Quizzes 15, Posters 15, Blooket 5} | {Lesson 25, Quizzes 17.5, Blooket 7.5} |
| Desk `DESK_V3_WORK_WEIGHTS` (`ap_stats_roadmap_square_mode.html` near line 9092) | 30/30/30/10 | 50/35/15 |
| `start-here.html` `V3_WORK_WEIGHTS` + Grade Playground inputs | 30/30/30/10, has a Posters input | 50/35/15, Posters input removed |
| `roster-server/data/grade-config.sy2526-freeze.json` | posters 0.3 | UNCHANGED (frozen last-year config) |

`workTracks.posters` stays accepted by `computeQuarterV3` for backward compatibility but is
ignored (weight absent). The "weights sum to 1.0" test in `lesson-grade-v3.test.js` passes with
three keys. `workAvgV3` already renormalizes over present keys, so no formula change.

Gradebook grid: `buildGradebookColumns` stops emitting `POSTER:U{n}` columns (`KIND_CATEGORY`
and `KIND_RANK` keep the `poster` entry so old fixtures still parse). The Schoology column
generator therefore never proposes a Posters column again.

Schoology (teacher does this by hand, once): set the **Posters category weight to 0** or delete the
category, and set Lesson 25 / Quizzes 17.5 / Blooket 7.5 / Progress Check 50. The nightly official
grade ignores Schoology's own total, but the categories must match so the gradebook grid's
side-by-side stays honest. `tools/schoology_sync_lib.py` keeps classifying `POSTER` keys; nothing
ever sends one, so it is dead but harmless.

Bundle: run `node scripts/build-grade-engine.mjs` and commit the regenerated
`grade-engine.bundle.js` (CRLF digest trap: regenerate on the same machine that commits).

## 3. Entering a poster as bonus

No new code. Use the existing entry script with a poster sheet id:

```
sheet=POSTER-U1 quarter=Q1 title=Unit 1 Poster (Data, Graph, Sentence)
Student Name|E
...
```

```
node scripts/enter-bonus.mjs <file-outside-repo> --apply
```

Rows land as `BONUS-POSTER-U1` (source `bonus`, score 5/3/1), show in My Ledger as
"Bonus banked: E", and apply at quarter close with the DOK sheets. One group grade becomes one
row per member, same as the DOK sheets.

Period B's Unit 1 posters (finished 2026-10-09) are the first entry. Period E's follow 10/14.

Optional later: a dashboard "Enter poster grades" panel (one E/P/I per group, fanned out to
members). Not in this spec; the script covers it.

## 4. Schedule: one poster per quarter

Desk `injectPcPosterEvents` gets a `POSTER_UNITS` set next to `POSTER_DAYS`; `appendPcPosterFor`
only pushes the Poster tile(s) when the unit is in `POSTER_UNITS`. The PC tiles are unchanged.

Proposed units (teacher to confirm; quarters end 11/6, 1/22, 4/14, 6/17; units are NEW CED ids):

| Quarter | Poster unit | Why |
|---|---|---|
| Q1 | U1 | done |
| Q2 | U2 (PC 11/24) | lands the week before Thanksgiving, well before the 1/22 close. U3's PC is 1/19, too close to the close for a hand-graded bonus |
| Q3 | U5 (PC 3/12) | mid-quarter, after the U4 PC |
| Q4 | last unit before the AP exam | pick when the Q4 schedule settles |

`scripts/build-lesson-schedule-sy2627.mjs` currently fails the build when a unit has no poster
date for a period. Change: a unit missing from the Desk's poster tiles is omitted from `posters`
(the map is sparse, keyed by unit) instead of failing. `build-sy2627-schedule.mjs` mirrors only
the units present; `roadmap-data.json` `posters` entries for dropped units are removed.

Regen procedure (from the section-break-days notes): regenerate JSON (both copies), run the
sim-pinned tests and update pins FROM THE SIM (`tests/desk-b-work-days.test.js`,
`desk-e-pairing.test.js`, the B-column sha256 in `desk-calendar-ced2026.test.js`,
`tests/test_e_wednesday_schedule_schoology.py`), regenerate the M2B golden, bump-build, LF-normalize.

Expected ripple: E's U2 lessons move up two days; B Work Days shift (B stays paused when two or
more topics ahead of E). Report the before/after unit-end dates for both periods in the PR.

Friday 10/16 for B stays a Work Day unless the teacher asks otherwise (open from 10/9).

## 5. Student-facing text

- `start-here.html` "Your work" paragraph: drop "your unit posters"; add one line under the
  bonus text: "Unit posters are bonus: graded E/P/I, banked, applied at the end of the quarter."
- `lib/effort-facts.js` "how your grade is counted": weights 50/35/15; posters listed with the
  DOK sheets as bonus.
- Desk Do Now poster branch + `POSTER_LINKS` panel: keep. Tooltip gains "Bonus (banked)".
- Desk My Grade / ledger tracks: posters row removed.

## 6. Tests

- `lesson-grade-v3.test.js`: weights sum, `workAvgV3` with three tracks, posters key ignored.
- `gradebook-grid.test.js`: no POSTER columns; category weights 25/17.5/7.5/50.
- `tests/grade-playground.test.js`: extracts the new constants.
- Root `desk-*` schedule pins and M2B golden regenerated (dates only).
- Python tests for `schoology_official.py` (if present) for the new `WORK_WEIGHTS`.
- Golden-master synthetic fixture `v3WorkWeights` updated; `sim-world.js` updated.

## 7. Rollout order

1. This spec approved.
2. Engine + Desk + start-here + effort-facts + bundle in one PR (Codex implement, Opus review).
3. Teacher changes the Schoology category weights the same evening the PR deploys.
4. Schedule regen in a second PR (own pins and golden), so grade and calendar diffs stay separable.
5. Enter B's Unit 1 poster bonus rows; E's after 10/14.

## 8. Risks

- Quiz-heavy students drop a little; lesson-heavy students rise. The deltas endpoint cannot
  preview a weight change (it hides decreases and unfrozen students); use a read-only old-vs-new
  recompute over `/class/grades` workTracks instead. Done 2026-10-09 (no PC yet, so grade = Work):
  25 of 29 students rise (+0.1 to +4.1), 4 fall (at most -2.1), nobody crosses the 40% floor.
- Nightly `schoology_official.py` uses Schoology's own Calc as Work until a Progress Check column
  exists. Until the teacher sets Posters to 0 in Schoology, that Calc would still carry a Posters
  category if any poster score were entered there. Never enter posters in Schoology; change the
  categories the evening this deploys.
- A single quarter poster adds at most +5. That is the point; say so to students so nobody
  expects the poster to rescue a quarter.
- Q2's poster is the last fixed block before Thanksgiving; if E slips again, drop it to Q3 rather
  than moving the PC.
