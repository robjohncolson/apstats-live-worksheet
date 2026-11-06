# Quarter-end zero freeze (teacher 2026-11-06)

**Rule (both sections, PeriodB and PeriodE, every quarter):** a lesson can only turn into a 0 while
its quarter is still open. "Whatever is a zero TODAY (the quarter's last day) counts as a zero;
anything that is merely late does NOT turn into a zero afterwards." Late work still counts, fully,
when it is finished.

Status: built in the working tree, not committed. **Grade-affecting**: roster-server auto-deploys
on push.

## The flag

`zeroFreezeAtQuarterEnd: true` in `roster-server/grade-config.js` (`PHASE3_CONFIG`, the live SY2627
config). The frozen SY2526 config (`roster-server/data/grade-config.sy2526-freeze.json`) does not
have it, so historical grades do not move. Flag absent = the old behavior everywhere.

## Engine (`roster-server/lesson-grade.js`)

- `dueTodayForQuarter(today, Q, config)` is the one clamp: `effectiveToday = min(today, Q.end)`.
  Both quarter engines use it for lesson due-ness: `computeQuarterV3` (v3, production) and
  `computeQuarterFromLessons` (Phase 6, not used in production). `isLessonDue` / `isDateDue` are
  unchanged (`dueAfterLessonDay` `<`, `dueLagDays` 13).
- Effect: a Q lesson whose zero date has not passed by the end of Q's last day is never
  scheduled-due in Q, so it is a 0 in no track (Lessons, Quiz, Blooket, Trainer) and leaves
  `quizTodo`, `blooketTodo` and `trainerTodo`.
- **Late work only helps (v3).** From the day after Q ends, such a lesson is *late* in Q (its class
  day has passed, it was not due by the end of the last day). Each Work track first counts its due
  lessons exactly as before (due zeros included), then `addLateScoresThatHelp` adds the late
  scores best first, each one only while it is at least the running average. That is the best
  average any choice of late scores gives, so:
  - starting late work (one blank, one quiz answer, a weak deck run) never lowers a grade, and a
    finished late lesson counts as soon as it lifts its track, from the day after the quarter
    ends, not from its own zero date (it counts on the Thu 11/12 close day);
  - raising any score, due or late, never lowers a grade (A3), and attempting a due quiz never does
    either (A6);
  - a late score below the student's average in that track is left out, never a drag.
  Combined worksheets keep one Blooket slot per worksheet group (a group a due sibling already
  counts is not counted again). A track with nothing due (never the case in SY2627) starts from
  the best late score. `lessonsDue` / `quizDue` / `blooketDue` / `trainerDue` and the `*Done`
  counts include the late lessons that count.
- Untouched: the PC track, posters, the early-completion bonus (they keep the real today), the
  ceiling code and `lessonsTotal`. While a quarter is open nothing is late and the engine is
  byte-identical to the old rule (the goldens are as of 2026-10-15 and do not move).
- Phase 6 only gets the clamp: a late lesson with work still counts there by its has-work rule.

## `/grade` and `/class/grades` lessons (`buildLessonsArray`)

For each period p, using the quarter the v3 band loop files the lesson under for p
(`quarterOfLesson` when `v3LessonsByDate`, else `quarterOfUnit`): when the zero date can never
pass inside that quarter (`lessonNeverZero`), the row reports `zeroDate[p] = null` and
`neverZero[p] = true`; otherwise `neverZero[p] = false`. `neverZero: { B, E }` is emitted only
when the flag is on, so flag-off rows stay byte-identical. `due` is unchanged.

**Boundary:** under `dueAfterLessonDay` a zero date EQUAL to Q.end is not a 0 on the last day
(that day has not ended), so it is never-zero too; `lessonNeverZero` uses the same `isDateDue`
test as the engine, so the two always agree. No SY2627 lesson has a zero date on a quarter end,
so this is documentation only.

## Consumers

| Consumer | Behavior for a never-zero lesson |
|---|---|
| `tools/schoology_components.py` `zero_due` / `quiz_zero_due` | null zero date: never written as a 0 to Schoology; a real score still goes through. |
| `tools/schoology_components.py` Follow-Along / Blooket **group** columns (`group_zero_due`) | a combined worksheet's FA and BL columns are dated, and so filed in a marking period, by the group's EARLIEST lesson for the period, so that lesson's zero date alone decides the group's 0 (grades and comments). B and E 4.7 (never-zero, Q1) + 4.8 (Q2, zero date 11/22) share the MP1 columns FA:4.7-8 and BL:4.7-8: they are never zeroed. QUIZ:4.8 (MP2) still zeroes per lesson. Without the freeze nothing changes (the earliest lesson always zeroes first). Side effect for the teacher: 4.8's in-app Q2 worksheet/deck 0 has no Schoology cell, because Schoology keeps that worksheet in MP1. |
| `schoology-sync.py`, `schoology_sync_section.py` | do not compute zero dates (the schedule only names columns and due dates). `build_schoology_fixture.build_fixture` (legacy per-lesson keys) reads the row's own null zero date: no 0. |
| Desk `js/desk-missing-work.js` `zeroWarnings` | not listed: no 0 is coming, so no yellow/red warning, badge, Do Now tint, pill, calendar cell or coach line. |
| Desk `pastDueWork` (grey My Ledger rows, also Pico Desk "NOT YET") | listed once past its due date when the work, quiz or deck is missing (same three rules), after the dated rows, as `{ ..., zeroDate: null, late: true }`. The date cell (`_pastDueWhenText`, `_zeroWhenText`) reads `late · no 0 · counts when you finish it`. |
| Desk My Ledger card + Pico My Grade (`_walletPrependZeroCard`, `_zeroCardStatus`, Pico `renderLedgerZero`) | late rows sit under their own heading `Late — never a 0` (still in Pico's NOT YET bucket); `Past due — not counting yet` keeps only rows that still have a zero date. Status line: `N items below are late: never a 0, and finishing them still counts.` (`1 more is late …` after past-due rows). The card signature carries the late flag, so a row turning late rebuilds the card. |
| Desk Class Snapshot (server `class-snapshot.js` + Desk `_snap*`) | per section (`?section=PeriodB`): skipped, it can never be a counted 0. Pooled (`section=all`): a section where the lesson is never-zero adds its real scores only (no zeros, no tentative zeros), `zeroDates[section] = null`, `neverZero[section] = true`, and never sets the pooled zero date; a lesson no section can count stays out, and a never-zero first lesson of a combined worksheet never hides a sibling that counts. The Desk (`_snapNeverZeroFor`, from the item or the viewer's own `/grade` row) shows a never-zero viewer no "counted since", no red 0, no "You: 0", the advice `Late — this one is never a 0 for you. Finishing it still counts.`, and focuses it only after real 0s and below-Q1 scores. |
| `scripts/weekly-slips.mjs` | `missingWork` adds the same late rows (`late: true`, `zeroDate: null`, `past: false`); `whenText` = `late · counts when you finish it`; rows print in the Desk grey; `missingWork`, `orderMissing`, `firstItem` and `doFirst` put late rows after every dated row (inside `doFirst`, the empty-track rule then orders the late rows among themselves); a late row never makes a student a candidate and is never the strip's first item. `lowestDueScores` counts a never-zero lesson once its class day has passed, so a low late score still becomes "Raise your 4.2 worksheet (now 45)". |
| Student copy (Desk "How grades work", `start-here.html`) | "becomes a 0 13 days after its class day … Unless its quarter ends first: then it is late, never a 0, and finishing it still counts." |
| `roster-server/class.js` `POST /class/quarter/close` | freezes the engine's `quarterGrade`, so the close uses the 11/06 zero set and every late lesson that lifts a track by then. |
| Gradebook `column.due`, `donow.js`, `official-grade.js`, `review.js`, `pico-desk-preview.html` | do not read `/grade` zero dates: unaffected. |

## The never-zero set at Q1's close

Q1 ends Fri 2026-11-06; the teacher closes it Thu 2026-11-12 (`POST /class/quarter/close`).
Old storage keys, from the live schedule (pinned by `lesson-grade.test.js`):

- PeriodB: 4.2 4.3 4.4 4.5 4.6 4.7
- PeriodE: 2.3 4.1 4.2 4.3 4.4 4.5 4.6 4.7

The field is structural, so the lessons array already marks the last two weeks of Q2 too
(B 5.7 8.4 8.5 8.6, E 8.1 8.4 8.5 8.6, zero dates after 2027-01-22). Their class days are in
January, so nothing changes for them before then.

## Open for the teacher

- Late work only helps in the Desk grade and the close. Schoology averages whatever the sync
  writes, so a partial late score (one blank of 4.3-4-5 = about 47) written to a blank MP1 cell
  can still lower Schoology's own MP average, and through it the official grade.

Tests: `roster-server/tests/lesson-grade.test.js` ("quarter-end zero freeze", including the real
schedule at the close), `roster-server/tests/grade-sim-freeze.test.js` (A1/A2/A3/A6, late work only
helps, freeze >= legacy, as of a date after the quarter ends), `roster-server/tests/exit-ticket-bonus.test.js`,
`roster-server/tests/class-snapshot.test.js`, `tests/desk-past-due-work.test.js`,
`tests/desk-zero-warning.test.js`, `tests/desk-missing-work-module.test.js`,
`tests/desk-class-snapshot-assignments.test.js`, `tests/pico-home-mygrade.test.js`,
`tests/grade-clarity.test.js`, `tests/weekly-slips.test.js`, `tests/test_schoology_components.py`.
