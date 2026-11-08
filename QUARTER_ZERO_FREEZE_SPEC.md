# Quarter-end zero freeze (teacher 2026-11-06)

**Rule (both sections, PeriodB and PeriodE, every quarter):** a lesson can only turn into a 0 in a
quarter while that quarter is still open. "Whatever is a zero TODAY (the quarter's last day) counts
as a zero; anything that is merely late does NOT turn into a zero afterwards." Late work still
counts when it is finished, only where it helps.

**Amended 2026-11-07 (teacher): a lesson belongs to the quarter its zero date falls in**
(`zeroQuarterMembership`, contract in `QUARTER_LINE_BY_DUE_DATE_SPEC.md`). A lesson taught in one
quarter whose zero date falls in a later one is a **regular, zero-able lesson of the later quarter**
and stays a **lift-only** lesson of the quarter it was taught in (the freeze below). So the freeze
no longer makes a lesson "never a 0": it only keeps it from being a 0 in the quarter it was taught
in. Only a zero date after the last quarter ends (the year end) is never a 0.

Status: the freeze shipped 2026-11-06 (d2f1b9f1). The amendment is built in the working tree (2026-11-08)
and reviewed (Codex gpt-6-astra max + 4 Opus verifiers, then a Codex re-review); fix pass 2 was folded
2026-11-08 (Schoology tooling and display only; no rule in this file changed) and a third Codex pass is
pending. It ships in the same deploy as `QUARTER_LINE_BY_DUE_DATE_SPEC.md` after teacher sign-off.
**Grade-affecting**: roster-server auto-deploys on push.

## The flags

`zeroFreezeAtQuarterEnd: true` and `zeroQuarterMembership: true` in `roster-server/grade-config.js`
(`PHASE3_CONFIG`, the live SY2627 config). Membership by zero date takes effect only when
`zeroFreezeAtQuarterEnd` AND `v3LessonsByDate` are on too. The frozen SY2526 config
(`roster-server/data/grade-config.sy2526-freeze.json`) and the golden fixture config have neither,
so historical grades and the goldens do not move. Flags absent = the old behavior everywhere.

## Engine (`roster-server/lesson-grade.js`)

- `dueTodayForQuarter(today, Q, config)` is the one clamp: `effectiveToday = min(today, Q.end)`.
  Both quarter engines use it for lesson due-ness: `computeQuarterV3` (v3, production) and
  `computeQuarterFromLessons` (Phase 6, not used in production). `isLessonDue` / `isDateDue` are
  unchanged (`dueAfterLessonDay` `<`, `dueLagDays` 13).
- Effect in the quarter a lesson was taught in: a Q lesson whose zero date has not passed by the
  end of Q's last day is never scheduled-due in Q, so it is a 0 in no track of Q (Lessons, Quiz,
  Blooket, Trainer) and stays out of Q's `quizTodo`, `blooketTodo` and `trainerTodo`.
- **Membership by zero date (v3).** `zeroQuarterOf(zeroDate)` is the first quarter whose last day
  the zero date is due by (a gap day or a quarter's last day rolls to the next quarter; null past
  the last quarter). `lessonQuarters(entry, period)` gives `{ quarter, taught }`: `taught` is
  `quarterOfLesson` (class day, unit fallback); `quarter` is the zero date's quarter when it is
  later than `taught`, else `taught`. Quarter Q's band is the lessons taught in Q plus the lessons
  whose `quarter` is Q. A lesson brought in by its zero date is due there and a 0 once its zero
  date passes; it is never late there (its zero date passes before that quarter ends). Q1 comes
  first, so its band is exactly the lessons taught in it: Q1 is identical with the flag on or off.
- **Late work only helps (v3).** From the day after Q ends, a lesson taught in Q that was not due
  by the end of its last day is *late* in Q. Each Work track first counts its due lessons exactly
  as before (due zeros included), then `addLateScoresThatHelp` adds the late scores best first,
  each one only while it is at least the running average. That is the best average any choice of
  late scores gives, so:
  - starting late work (one blank, one quiz answer, a weak deck run) never lowers the taught
    quarter's grade, and a finished late lesson counts there as soon as it lifts its track, from
    the day after the quarter ends, not from its own zero date (it counts on the Thu 11/12 close day);
  - raising any score, due or late, never lowers a grade (A3), and attempting a due quiz never does
    either (A6);
  - a late score below the student's average in that track is left out, never a drag.
  Combined worksheets keep one Blooket slot per worksheet group (a group a due sibling already
  counts is not counted again). A track with nothing due (never the case in SY2627) starts from
  the best late score. `lessonsDue` / `quizDue` / `blooketDue` / `trainerDue` and the `*Done`
  counts include the late lessons that count.
- Untouched: the PC track, posters (they keep the real today) and the ceiling code. The
  early-completion bonus keeps the real today and stays with the quarter a lesson was taught in:
  a lesson in a later band only by its zero date earns no bonus there. Membership by zero date
  grows the later quarter's `lessonsTotal` (SY2627: B Q2 28 to 34, Q3 15 to 19; E Q2 28 to 35, Q3
  16 to 20); Q1 and Q4 stay. While a quarter is open nothing in it is late.
- Phase 6 only gets the clamp, and keeps taught-quarter membership (`zeroQuarterMembership` is a
  v3 rule; the m2b goldens run Phase 6 and do not move). A late lesson with work still counts
  there by its has-work rule.

## `/grade` and `/class/grades` lessons (`buildLessonsArray`)

For each period p the row is judged in the quarter the lesson is a regular member of for p: its
zero date's quarter under `zeroQuarterMembership`, else the quarter the v3 band loop files it
under (`quarterOfLesson` when `v3LessonsByDate`, else `quarterOfUnit`). When the zero date can
never pass inside that quarter (`lessonNeverZero`), the row reports `zeroDate[p] = null` and
`neverZero[p] = true`; otherwise `zeroDate[p]` is the class day + 13 and `neverZero[p] = false`.
With `zeroQuarterMembership` that leaves `neverZero` only for a zero date past the last quarter
(no SY2627 lesson), and every row also carries:

- `quarter: { B, E }`: the regular (zero-able) quarter; `null` exactly when `neverZero[p]`;
  an undated period keeps its unit-band quarter.
- `liftQuarter: { B, E }`: the earlier quarter the lesson was taught in, where it only lifts the
  grade (for a never-zero lesson, the quarter it was taught in); else `null`.

`neverZero: { B, E }` is emitted only when the freeze is on, and `quarter` / `liftQuarter` only
when membership is effective, so flag-off rows stay byte-identical. `due` is unchanged.

**Boundary:** under `dueAfterLessonDay` a zero date EQUAL to Q.end is not a 0 on the last day
(that day has not ended): in Q it is never-zero, and under membership it rolls to the next
quarter. `lessonNeverZero` and `zeroQuarterOf` use the same `isDateDue` test as the engine, so
they always agree. No SY2627 lesson has a zero date on a quarter end.

## Consumers

| Consumer | Behavior |
|---|---|
| `tools/schoology_components.py` `zero_due` / `quiz_zero_due` | a null zero date (never-zero) is never written as a 0 to Schoology; a real score still goes through. Since the amendment the lessons taught in Q1 and due in Q2 carry their real zero dates again; routing their 0s and scores to the right marking period is `QUARTER_LINE_BY_DUE_DATE_SPEC.md` §4 (Schoology lane). |
| `tools/schoology_components.py` Follow-Along / Blooket **group** columns (`group_zero_due`) | a combined worksheet's FA and BL columns are dated, and so filed in a marking period, by the group's EARLIEST lesson for the period, so that lesson's zero date alone decides the group's 0 (grades and comments). The 2026-11-06 note that PeriodB 4.7 (Fri 11/06) + 4.8 share MP1 columns that are never zeroed no longer holds: B 4.7 is a regular Q2 lesson (zero date 11/19) and its columns move to MP2 (§4.3 of the new spec). Without the freeze nothing changes (the earliest lesson always zeroes first). |
| `schoology-sync.py`, `schoology_sync_section.py` | do not compute zero dates (the schedule only names columns and due dates). `build_schoology_fixture.build_fixture` (legacy per-lesson keys) reads the row's own zero date. |
| Desk `js/desk-missing-work.js` `zeroWarnings` | a never-zero row is not listed: no 0 is coming, so no yellow/red warning, badge, Do Now tint, pill, calendar cell or coach line. Rows with a real zero date (now including B 4.2-4.7, E 2.3, 4.1-4.6) warn as usual; grouping them by `quarter[p]` is the new spec's §3 (Desk lane). |
| Desk `pastDueWork` (grey My Ledger rows, also Pico Desk "NOT YET") | a never-zero row is listed once past its due date when the work, quiz or deck is missing (same three rules), after the dated rows, as `{ ..., zeroDate: null, late: true }`. The date cell (`_pastDueWhenText`, `_zeroWhenText`) reads `late · no 0 · counts when you finish it`. |
| Desk My Ledger card + Pico My Grade (`_walletPrependZeroCard`, `_zeroCardStatus`, Pico `renderLedgerZero`) | never-zero rows sit under their own heading `Late — never a 0` (still in Pico's NOT YET bucket); `Past due — not counting yet` keeps only rows that still have a zero date. Status line: `N items below are late: never a 0, and finishing them still counts.` (`1 more is late …` after past-due rows). The card signature carries the late flag, so a row turning late rebuilds the card. Since the amendment only a year-end lesson is never-zero. |
| Desk Class Snapshot (server `class-snapshot.js` + Desk `_snap*`) | per section (`?section=PeriodB`): a never-zero item is skipped, it can never be a counted 0. Pooled (`section=all`): a section where the lesson is never-zero adds its real scores only (no zeros, no tentative zeros), `zeroDates[section] = null`, `neverZero[section] = true`, and never sets the pooled zero date; a lesson no section can count stays out, and a never-zero first lesson of a combined worksheet never hides a sibling that counts. The Desk (`_snapNeverZeroFor`, from the item or the viewer's own `/grade` row) shows a never-zero viewer no "counted since", no red 0, no "You: 0", the advice `Late — this one is never a 0 for you. Finishing it still counts.`, and focuses it only after real 0s and below-Q1 scores. The lessons taught in Q1 and due in Q2 are counted items again (real zero dates). |
| `scripts/weekly-slips.mjs` | `missingWork` adds the same late rows for never-zero lessons (`late: true`, `zeroDate: null`, `past: false`); `whenText` = `late · counts when you finish it`; rows print in the Desk grey; `missingWork`, `orderMissing`, `firstItem` and `doFirst` put late rows after every dated row (inside `doFirst`, the empty-track rule then orders the late rows among themselves); a late row never makes a student a candidate and is never the strip's first item. `lowestDueScores` counts a never-zero lesson once its class day has passed, so a low late score still becomes a "Raise your … worksheet (now 45)" line (since the amendment only a year-end lesson is never-zero; no SY2627 lesson). Slips print CED labels only, never a storage key, and drop rows whose quarter has closed (`QUARTER_LINE_BY_DUE_DATE_SPEC.md` §6). |
| Student copy (Desk "How grades work", `start-here.html`) | the 2026-11-06 sentence "Unless its quarter ends first: then it is late, never a 0, and finishing it still counts." is no longer true; its replacement (a 0 counts in the quarter its 0 date lands in) is `QUARTER_LINE_BY_DUE_DATE_SPEC.md` §3.6 (Desk lane). |
| `roster-server/class.js` `POST /class/quarter/close` | freezes the engine's `quarterGrade`, so the close uses the 11/06 zero set and every late lesson that lifts a track by then. `GET /grade` reports the frozen row as `quarters[Q].closed` (with the applied banked bonus), and `/class/grades` keeps `closedGrade`. |
| In-app grid (`roster-server/gradebook-grid.js`, My Gradebook, teacher Class Gradebook) | files lesson columns by the row's `quarter[p]` when the rows carry it (else the old-unit band). A column whose lessons are ALL lift-only for the tab's quarter (`liftQuarter[p]` is the tab's quarter) is listed there with `liftOnly: true` and never enters that tab's Schoology totals. A mixed group (B `4.1-2`: `4.1` regular in Q1, `4.2` regular in Q2) is a regular Quarter 1 column, because its Schoology column stays in MP1 (decision 8.2); in the Quarter 2 tab it is flagged `schoologyQuarter: 'Q1'`, not `liftOnly`. The re-filing moves the Quarter 1 tab's "Schoology now" total (the engine's Quarter 1 grade does not move). |
| `donow.js`, `official-grade.js`, `review.js`, `pico-desk-preview.html` | do not read `/grade` zero dates: unaffected. |

## The lessons taught in Q1 and due in Q2

Q1 ends Fri 2026-11-06; its close date is Thu 2026-11-12, and `tools/close_quarter.py` runs the close
(`POST /class/quarter/close`) on the morning after, Fri 2026-11-13 before school.
Old storage keys, from the live schedule (pinned by `lesson-grade.test.js` and
`zero-quarter-membership.test.js`). Under the 2026-11-06 rule these were never a 0; since the
amendment each is a regular Q2 lesson with its real zero date and a lift-only Q1 lesson:

- PeriodB: 4.2 4.3 4.4 4.5 4.6 4.7
- PeriodE: 2.3 4.1 4.2 4.3 4.4 4.5 4.6 (4.7 moved to Mon 11/09 on 2026-11-06: a Q2 lesson for E)

The same rule moves the last two weeks of Q2 into Q3 (B 5.7 8.4 8.5 8.6, E 8.1 8.4 8.5 8.6, zero
dates after 2027-01-22): regular in Q3, lift-only in Q2. Their class days are in January, so
nothing changes for them before then.

## Open for the teacher

- Late work only helps in the Desk grade and the close. Schoology averages whatever the sync
  writes, so a partial late score (one blank of 4.3-4-5 = about 47) written to a blank MP1 cell
  can still lower Schoology's own MP average, and through it the official grade. The MP1 / MP2
  routing in `QUARTER_LINE_BY_DUE_DATE_SPEC.md` §4 decides which cells those scores reach.

Tests: `roster-server/tests/lesson-grade.test.js` ("quarter-end zero freeze", including the real
schedule at the close), `roster-server/tests/zero-quarter-membership.test.js` (membership by zero
date: Q1 identity flag on/off, the sets, empty-ledger Q2, the boundaries, the early bonus, the
grid), `roster-server/tests/grade-closed-quarter.test.js` (`quarters[Q].closed`),
`roster-server/tests/grade-sim-freeze.test.js` (A1/A2/A3/A6, late work only helps, freeze >=
legacy, as of a date after the quarter ends), `roster-server/tests/exit-ticket-bonus.test.js`,
`roster-server/tests/class-snapshot.test.js`, `tests/desk-past-due-work.test.js`,
`tests/desk-zero-warning.test.js`, `tests/desk-missing-work-module.test.js`,
`tests/desk-class-snapshot-assignments.test.js`, `tests/pico-home-mygrade.test.js`,
`tests/grade-clarity.test.js`, `tests/weekly-slips.test.js`, `tests/test_schoology_components.py`.
