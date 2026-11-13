# Quarter line by due date (teacher 2026-11-07, evening)

**Status: BUILT in the working tree 2026-11-08 (engine, Schoology tooling, Desk/Pico/phone), reviewed (Codex
gpt-6-astra `--effort max` + 4 Opus verifiers), fix pass 1 folded; fix pass 2 (the seven findings of the Codex
re-review) folded 2026-11-08; a third Codex pass is pending. Deploy Sunday 2026-11-08 (no class blocks) after
teacher sign-off; Schoology column move Sunday after 17:05 or Monday before 16:00; Quarter 1 close run on the morning
after the close date (§4.5).**

**Amendment (teacher 2026-11-08): Quarter 1's close date moves from Thu 2026-11-12 to Tue 2026-11-10.** The close
run (close → apply-bonus → MP1 final) happens Wed 2026-11-11 (Veterans Day, no school), so the final Quarter 1
grades are in Schoology Marking Period 1 before Thursday, as insurance against a bad Thursday. `finalUntil` stays
Thu 2026-11-19; Quarter 2 (from Mon 11/09) is unchanged. Only `quarters.Q1.close` moved: the engine never reads it.
The dates below now read Tue 11/10 (close) / Wed 11/11 (close run); the earlier Thu/Fri plan is in git history.
Grade-affecting (roster-server auto-deploys) and student-visible (Desk, Pico Desk, phone page, Schoology).

## 0. Decisions (teacher, 2026-11-07)

1. **A lesson belongs to the quarter its zero date falls in** (class day + `dueLagDays` 13), not the quarter it was
   taught in. A zero date on a gap day (Sat 11/07, Sun 11/08) or on a quarter's last day rolls to the next quarter
   (the 0 lands the next morning). Quarter 1 is therefore everything that came due by Fri 11/06: through storage
   `4.1` (CED 2.3 Day 1) for Period B, through storage `2.1`/`2.2` (CED 2.1) for Period E.
2. **Quarter 1 never lowers** from what students see today. Friday's build (d2f1b9f1) files by class day, so the
   after-the-line lessons are Q1 lessons whose scores already lift Q1 where they help. That lift stays: a lesson
   taught in Q1 but due in Q2 is a **regular, zero-able Q2 lesson AND a lift-only Q1 lesson**. "Whatever a student
   has as their current grade should be entered as the final grade in Schoology; never lower. If restricting to
   2.3/2.1 and earlier raises it, use that." (Restricting can never raise it, proved in §2; so Q1 = today's number.)
   Teacher: "there will be some overlap between Q2 and Q1 … that is fine, it's okay to be sloppy there."
3. **No extra grace.** The moved lessons zero on their normal dates (B `4.2` 11/08, `4.3` 11/09, `4.4` 11/11,
   `4.5` 11/12, `4.6` 11/18, `4.7` 11/19; E `2.3`+`4.1` 11/08, `4.2`+`4.3` 11/10, `4.4` 11/12, `4.5` 11/15, `4.6` 11/19).
   The 13-day rule stays consistent.
4. **Quarter 2 holds** storage `4.2` (CED 2.3 Day 2) onward for B, storage `2.3` (CED 2.2) onward for E. **Schoology
   MP2 must be repopulated** with that work by Monday 11/09's syncs; MP1 keeps the columns through the line and its
   final grade, frozen at the close (close date Tue 11/10; run Wed 11/11, no school, §4.5).
5. **Delineation:** students must see plainly what counts for Quarter 1 (closing Tue) and what counts for Quarter 2,
   on the Desk, the Pico Desk home and the phone page.

### What changes for students (Monday 11/09)
- The Do Now shows two grade pills through Tuesday 11/10: `Quarter 1 92 · closes Tue Nov 10` and `Quarter 2 …`. After the
  close the Quarter 1 pill reads `final` for a week, then goes away.
- My Grade / My Ledger list every row once, under `Quarter 1 (closes Tue Nov 10)` or `Quarter 2 (0 dates after Fri
  Nov 6)`. Q1 rows are the zeros still fixable; Q2 rows include 2.3 Day 2 / 2.2 onward with their real zero dates.
- B `4.2`, `4.3`; E `2.3`, `4.1` turn from "late · no 0" (Fri/Sat) to a Sunday warning to a Monday 0 in Quarter 2.
  That is decision 3; a one-time Desk notice on Sunday says so (§4.9).
- Schoology: MP2 shows the after-the-line columns with the scores students already have.

## 1. The rule, with the real schedule

`regularQuarter(lesson, period)` = the first quarter in calendar order whose last day the zero date is **due by**
(`isDateDue(zeroDate, Q.end)`, strict `<` under `dueAfterLessonDay`), else `null` (zero date after the last quarter
ends; year end). `taughtQuarter` = today's `quarterOfLesson` (class day → `quarterOfDate`, unit fallback).
A lesson is a band member of `regularQuarter` (zero-able) and, when `taughtQuarter` is earlier, also of
`taughtQuarter` as **lift-only** (exactly today's late-lift path). Undated lessons keep their unit-band quarter.

| | Period B | Period E |
|---|---|---|
| Last Quarter 1 regular lesson | `4.1` = 2.3 Day 1 (zero 11/05) | `2.1`,`2.2` = 2.1 (zero 11/05) |
| Taught in Q1, regular in Q2 (lift-only in Q1) | `4.2 4.3 4.4 4.5 4.6 4.7` (2.3 Day 2, 2.4–2.8) | `2.3 4.1 4.2 4.3 4.4 4.5 4.6` (2.2–2.7) |
| First taught-in-Q2 lessons | `4.8` 11/09 (zero 11/22) | `4.7`,`4.8` 11/09 (zero 11/22) |
| Taught in Q2, regular in Q3 (same rule, January) | `5.7 8.4 8.5 8.6` | `8.1 8.4 8.5 8.6` |
| `lessonsTotal` Q1 / Q2 / Q3 / Q4 (before → after) | 27→27 / 28→34 / 15→19 / 7→7 | 26→26 / 28→35 / 16→20 / 7→7 |

Since E's Unit 2 poster days (2026-11-13, U2_CLAIM_POSTER_SPEC.md B7), E's "taught in Q2, regular in Q3" set is
`6.10 6.11 8.1 8.4 8.5 8.6` and its Q3 `lessonsTotal` after the flag is 22.

These sets match the teacher's lists exactly (computed with the engine's own functions on the live schedule).

## 2. Engine — `roster-server/` (grade-affecting)

The ENGINE's `students[].quarters.Q1` is **byte-identical flag on vs off**, proved in independent runs of
2,160 / 2,160, 3,600 / 3,600 and 5,688 / 5,688 random student-days (both sections, 11/06 → 2027-06-30, PC on),
including `ceiling`, `lessonsTotal`, `earlyBonus`/`earlyKeys`, Blooket slots and todo lists; `units`, `completion`
and every lesson value field are identical too. Proof: Q1's band = taught(Q1) ∪ {regular in Q1} = taught(Q1),
because a regular quarter is never earlier than the taught one and Q1 is first; `lessonMap` and `perDayGroups` do
not depend on quarters; so Q1 runs the same code on the same inputs.

**Not identical: the in-app My Gradebook Quarter 1 tab.** §3.5 RE-FILES its columns by quarter: lift-only columns
leave its "Schoology now" total, CED 2.1–2.3 join it, and Period B's straddling `2.3 Follow-Along` / `2.3 Blooket`
count in Quarter 1 only. So `gradebook.quarters.Q1.schoologyTotal` moves for most students, in both directions, by
up to about 9 points. That number mirrors Schoology's columns, not the engine grade; the deploy acceptance diffs
`students[].quarters.Q1` only and REPORTS the gradebook Q1 deltas to the teacher (§6).

Changes (smallest set):
- `grade-config.js` `PHASE3_CONFIG`: add `zeroQuarterMembership: true` after `zeroFreezeAtQuarterEnd`. Effective only
  with `zeroFreezeAtQuarterEnd` AND `v3LessonsByDate`. Do NOT add to `data/grade-config.sy2526-freeze.json` nor the
  golden fixture config (the synthetic golden's `3.1` straddles 11/02→11/15; gating on the freeze keeps it still).
  Also add display-only `quarters.Q1.close: '2026-11-10'` (was `'2026-11-12'` until the 2026-11-08 amendment) (and `finalUntil: '2026-11-19'`); the engine ignores them.
- `lesson-grade.js`: new pure exports `zeroQuarterOf(zeroDate, config)` and `lessonQuarters(entry, period, config)`
  → `{ quarter, taught }` (quarter = zeroQuarterOf when the three flags are on AND it is strictly later than
  taught; else taught). Insert after `lessonNeverZero` (~869).
- `computeQuarterV3` band loop (1514-1523): keep a lesson when `taught === Q || quarter === Q`; record
  `taughtEarlier` = band lessons with `taught !== Q`. **Everything else unchanged**: `dueTodayForQuarter`, `isLate`,
  `lateScores`, `addLateScoresThatHelp`, quiz/Blooket/trainer loops, PC, posters, ceiling. A lesson brought in by its
  zero date is never late in its regular quarter (its zero date passes before that quarter ends).
- Early-completion bonus loop (~1887): `if (taughtEarlier.has(topicKey)) continue;` — the bonus stays with the
  taught quarter (without it a diligent B student gets +2/+3 Q2 points for Q1 worksheets; Q1 keeps its credit).
- `buildLessonsArray` / `neverZeroFor` (2053-2060, 2089-2103): file by `lessonQuarters(...).quarter`; restore
  `zeroDate[p]` (class day + 13) for every lesson with a regular quarter; `neverZero[p]` true only when
  `quarter[p]` is null (year end). With the flag on, emit `quarter: {B, E}` (regular) and `liftQuarter: {B, E}`
  (the earlier taught quarter; for a year-end row, zero date past the last quarter: `quarter` null, `neverZero`
  true, `liftQuarter` = the taught quarter, Q4; no SY2627 lesson has that shape; else null). Flag off → no new
  fields, byte-identical rows. `due` unchanged.
- **A quarter that has not started has no grade** (gated on `zeroQuarterMembership`): `computeQuarterV3` reports
  `quarterGradeBase` / `quarterGrade` null while today is before the quarter's start date. Without it the has-work
  fallback gives Quarter 2 a number on Sun 11/08 built from Quarter 1 work that is not due yet, which then drops on
  Monday. So Sunday 11/08 shows `Quarter 2 · starts Mon Nov 9` (decision 8.6) on the Desk, Pico Desk and phone. Q1
  and flag-off identity are untouched.
- `computeQuarterFromLessons` (Phase 6, not production): **no change**; document the divergence (m2b stays still).
- `GET /grade` (`grade.js` 545-601): add `quarters[Q].closed = { grade, pcAvg, workAvg, at }` from
  `quarter_grade_snapshot` for the student (first-close-wins row written by `POST /class/quarter/close`), plus the
  applied bonus row if present, so the Desk can show "final". `/class/grades` keeps `closedGrade`.
- `grade-engine.bundle.js`: regenerate (`node scripts/build-grade-engine.mjs`); add `zeroQuarterOf`, `lessonQuarters`
  to the `MODULES` exports if the Desk needs them (prefer reading the row fields).
- Blooket interplay: `perDayDeckGroups` is quarter-independent (still `4|7-8`, `4|10-12`). B `4.7` becomes a
  regular Q2 lesson, so from 11/20 it gets its own per-day Q2 slot (and `4.8` from 11/23); Q1 unchanged. The B shared
  worksheet `4|1-2` (`4.1` Q1, `4.2` Q2) is not per-day: Q1 slot from `4.1`, Q2 slot keyed `4|1-2` at the group's
  best — the accepted overlap.

Tests: re-pin `lesson-grade.test.js` freeze block (1545-1599 "late in Q1" → equality in Q1 always, Q2 only before
11/18 or assert the per-day Q2 slots; 1798 becomes "zeroes in Q2": `quizTodo ['4.5','5.1']`, `lessonsTotal 2`;
1852-1858 `q1()` chooses by `quarter[p]==='Q1'`; 1866 "taught in Q1, regular in Q2" asserts `liftQuarter`/`quarter`
for the sets in §1; 1917-1937 zero dates restored + new fields); `exit-ticket-bonus.test.js` 108 destructures the
new fields; `m2b-grade-invariance.test.js` 35 adds the key; new `zero-quarter-membership.test.js`: (1) Q1 identity
flag on vs off on `resolveProductionGradeInputs('SY2627')`, seeded ledgers, both sections, 11/06→06/30; (2) §1 sets on
the real schedule; (3) empty B ledger Q2: 11/08 nothing due, grade null; 11/09 `lessonsDue 1`, `quizTodo ['4.2']`,
`blooketTodo ['4.2']`; (4) empty E ledger 11/09: `quizTodo ['2.3']`, `blooketTodo ['2.3','4.1']`; (5) `zeroQuarterOf`
boundaries ('11-05'→Q1; '11-06','11-07','11-08'→Q2; '2027-01-22','01-24'→Q3; '2027-06-17'+ → null); (6) Q2 early
bonus equals today's. Goldens and m2b expected unchanged (if one moves: stop and explain).
Acceptance at deploy: snapshot `/class/grades` before/after; **`students[].quarters.Q1` identical**; Q2 differs only
by the new members (report the per-student Q2 deltas to the teacher); `gradebook.quarters.Q1.schoologyTotal` is
expected to move (the re-filed tab, above): report its per-student deltas to the teacher, do not gate on them.

## 3. Desk, Pico Desk, phone — the delineation (`ap_stats_roadmap_square_mode.html`, `pico-home.js`, `js/desk-*.js`, `mobile-home.html`)

Data: the new row fields (`quarter`, `liftQuarter`, restored `zeroDate`), `config.quarters.Q1.close/finalUntil`
(already shipped via `/grade` `config.quarters` and the offline inputs; mirror the close date in the Desk's
`QUARTER_WINDOWS` with a pin test against grade-config), `quarters.Q1.closed`. **Degrade gracefully**: when the fields
are absent (old cached payload, old offline inputs) keep today's single-pill, no-grouping behaviour. Use `tdy()` /
`_zeroTodayIso()` for every window test so tests can pin the date.

Wording: say **"Quarter 1" / "Quarter 2"** in headings (the same ledger card and the Snapshot app use `Q1`/`Q3` for
quartiles). Say **"0 dates after Fri Nov 6"**, not "due after" (the Desk's "due" means the class day). CED labels
only. Never "80%" as done/credit/pass.

1. **Do Now pills** (`renderDoNowGrades` 9258-9577): during the close window (`Q.end < today <= Q.close`) render the
   closing quarter's pill first: `Quarter 1 92 · closes Tue Nov 10` (official when published; title: "fixable until
   Thu"), then the current quarter's pill with today's chips. When `close < today <= finalUntil`: `Quarter 1 final 92`
   (from `quarters.Q1.closed` or the official). Pills carry `data-quarter` and `data-role` (closing | final |
   current). Per-quarter official cache: `_officialGradeByQuarter` holds every quarter; the single
   `_officialGradeCache` is KEPT as the current quarter's slot. Both quarters are fetched together and the side
   (closing) quarter's official is cached per school day. Pico `gradeInfo` (1281-1297) and
   `_updateDoNowMissingPill` (16822-16848) read by role, not "first pill"; the missing pill goes after the last
   quarter pill and reads per quarter: `Quarter 1: 2 are 0s now, fix by Tue 11/10 · Quarter 2: 1 becomes a 0 Mon`.
   Re-pin `tests/desk-grade-outlook.test.js` 19-20, `desk-official-grade.test.js` 96-141, j1 journey (first `.qkey`
   on 2026-08-18 stays `Q1`), `desk-donow-zero-state.test.js` 87, `desk-zero-warning.test.js` 229-246.
2. **My Ledger / Missing-work card** (`_walletPrependZeroCard` 17500-17553, status 17558-17652) and **Pico My Grade**
   buckets (`ledgerBuckets` 2605-2639, `renderLedgerZero` 2709-2761): every row **once**, under its regular quarter
   (`quarter[cP]`), with new heading class (not `.wz-later-head`): `Quarter 1 (closes Tue Nov 10)` then
   `Quarter 2 (0 dates after Fri Nov 6)`; each group its own status lead (`Quarter 2 so far: X%` counts only Q2 rows;
   `_walletGradeDropText` scoped to the displayed quarter). Rows with `liftQuarter[cP]==='Q1'` add one short line:
   `finishing it by Thu can also raise Quarter 1 (never lower)`. Include grouping + closed state in `sig`/
   `zeroSignature`. `Late — never a 0` stays only for `neverZero` rows (year end). Keep Pico ↔ System 7 parity pins
   (`tests/pico-home-mygrade.test.js` 470-517, 551-587; `desk-ledger-calm` 63-83; `desk-past-due-work` 403-459).
3. **One choke point after the close** (`_zeroCurrentWarnings` / `_pastDueCurrentWork` 16627-16650, typeof-guarded
   helper in `js/desk-missing-work.js`, new pure export; leave `zeroWarnings`/`pastDueWork` byte-identical because
   the parity snapshot pins their shapes): rows whose regular quarter has closed drop out of the Do Now tint, badge,
   coach, calendar `!` marks, snapshot focus and Pico buckets; before the close every row stays.
4. **Calendar**: the `.cal-qband` divider already sits between the Nov 2 and Nov 9 week rows (`rCal` 368-380). In the
   window its text becomes `Quarter 2 (Nov 9 – Jan 22) · Quarter 1 closes Tue Nov 10`; mark Fri 11/06 `Quarter 1
   ends` and Tue 11/10 `Quarter 1 closes` after `c.innerHTML = htm(...)`, never inside `htm()` (Pico parses `.tl`).
   Pico week window: a new badge element (`Q1 ENDS FRI` / `Q2 · Q1 CLOSES THU`); do not touch `#pico-week-title`
   or `#pico-unit` (pinned).
5. **My Gradebook** (`js/desk-gradebook-grid.js` 40-51, 254-305 + server `roster-server/gradebook-grid.js`
   123-200): file lesson columns by `quarter[period]` (lift-only lessons appear in the Q1 tab marked "can raise
   Quarter 1", excluded from the owe badge) instead of the old-unit band (today Q1 = units 1,3,4 and 2.1–2.3 sit under
   Q3, matching nothing). Default to the closing quarter during the window; tab labels carry the rule
   (`Quarter 1 · closes Tue Nov 10`, `Quarter 2 · 0 dates after Nov 6`). `_gradebookSchoologyTitle` quarter-aware
   (`Schoology MP2: …` when MP1 and MP2 share a title).
6. **Help text** (Desk modal 2548-2569; `start-here.html` 656, 714, 717) replaces "Unless its quarter ends first …
   never a 0" with: "A 0 counts in the quarter its 0 date lands in. Quarter 1 ended Fri Nov 6: work whose 0 date was
   by Nov 6 counts for Quarter 1, and you can fix those 0s until it closes Tue Nov 10. Work with a 0 date after Nov 6
   counts for Quarter 2 (Nov 9 – Jan 22) even if it was taught in Quarter 1; finishing it by Tue Nov 10 can also raise
   Quarter 1, never lower it. Progress Check retakes for Quarter 1 end at the close too." Re-pin
   `tests/grade-clarity.test.js` 94, 133. Drop the stale ↑ ceiling sentence.
7. **Coach** (`_buildCoachContext` 9597-9794): tag missing items by quarter; the missing list, the flashcard list and
   the weak lessons are filtered to the displayed quarter BEFORE they are truncated, so the Quarter 2 explanation
   never counts Quarter 1 zeros; window line `Quarter 1 closes Tue Nov 10: N zeros still fixable`.
8. **`_bonusSummary`** (19236-19300): never `'Q' + quarterOfDate(new Date())` (gives `Q0` on gap days); use the
   closing/current quarter; show Quarter 1's banked DOK bonus as `added at Tuesday's close` during the window.
9. **One-time notice (Sun 11/08 → Mon)** for students with missing B `4.2`/`4.3` or E `2.3`/`4.1` work: "Quarter 1
   ended Friday. 2.3 Day 2 counts for Quarter 2 and its 0 date is today; finish it to clear it." (Desk Do Now line +
   Pico sign; dismissable; gone after 11/10.)
10. **Phone page** `mobile-home.html` 881-901: show `Quarter 1 92 · closes Tue Nov 10` beside the current quarter
    during the window; never jump to Quarter 2 alone while Quarter 1 is fixable. After the close its
    `Quarter 1 final` = max(frozen + applied bonus, official MP1 override), the same as the Desk.
11. **Class Snapshot / Where you stand**: after the close, no "Do this next … any score replaces the 0" for a closed
    quarter's assignment (label `Quarter 1 final`); during the window keep the current quarter.
Deploy hygiene: `node scripts/bump-build.mjs` + LF normalise (Python `chr(13)`; verify with `od -c`), `sw.js`
module stamps, `npm run gitnexus:shadow`, `npm run test:quick`, GitNexus `detect_changes`.

## 4. Schoology (`tools/`, Athena rig; LIVE tasks ApStatsSchoologySync-B 16:30 / -E 16:45 run every day incl. Sunday)

Facts (reader, verified in code): the tool, not Schoology, picks a column's marking period **once, at creation**
(`grading_period_id` from `marking_period_for_date(class-day due date)`); nothing moves a column afterwards; the
gradebook shows one MP at a time and the sync finds columns only by title among the displayed MP's cells; the
nightly "official" override is Schoology's displayed-MP work calc + engine PC + bonuses, rewritten up or down, with
no never-lower guard; its quarter comes from `/class/snapshot` (Q1 on gap days, Q2 from Mon 11/09). **Every
after-the-line column already exists in MP1** (B 12: `2.3 Day 2 Quiz`, `2.4-2.6 Follow-Along/Blooket`, `2.4/2.5/2.6
Quiz`, `2.7 Follow-Along/Blooket/Quiz`, `2.8-2.9 Follow-Along/Blooket`, `2.8 Quiz`; E 14: `2.2 Follow-Along/Blooket/
Quiz`, `2.3 Follow-Along/Blooket`, `2.3 Day 2 Quiz`, `2.4-2.6 …`, `2.4/2.5/2.6 Quiz`, `2.7 …`). B's `2.3 Follow-Along`
/ `2.3 Blooket` straddle the line (`4.1` Q1 + `4.2` Q2).

**Live rig facts (read-only probe, Sat 11/07 ~23:00):** Schoology marking periods are contiguous: MP1 id 1173888
(09/02–11/06), **MP2 id 1173889 (11/07–01/22/27)**, MP3 1173886 (01/23–04/14), MP4 1173887 (04/15–06/30); the same
ids for both courses (B 8537033028, E 8537033042). So Schoology has no gap days: a zero date of 11/08 is already MP2
there. **Both gradebooks open on MP2 by default now** (filter input value 1173889, header 'Marking Period 2:
11/07/26 - 1/22/27'; `Drupal.available_grading_periods` = the four ids + all/final/none). MP2 shows 0 filled cells
and 0 overrides. Any Quarter 1 / MP1 pass must therefore select the MP1 filter explicitly and verify it.

If the engine ships and the tooling does not change in the same deploy, **Monday's run writes ~5 B and ~36 E new
zeros into MP1 columns** and lowers the MP1 official. So:

1. **Zero routing by quarter (ships with the engine).** `schoology_components.py`: a target (score or 0) for a
   lesson is emitted only in the pass for `lesson.quarter[p]`; a group column's deciding lesson follows the same
   rule. The daily job becomes quarter-explicit: a **Quarter 1 / MP1 pass** (columns through the line, Q1 zeros,
   Q1 override) while `today <= close`, and a **Quarter 2 / MP2 pass** every day. Each pass selects and **verifies**
   the gradebook's MP filter before any read or write (`select_grading_period` / `displayed_grading_period` in
   `schoology_ops.py`; hidden input `select2-change-event=sGraderFilterGradingPeriodChanged`,
   `.grader-grid-col-header-gp` aria-label; UI mechanics unverified: one-shot check on the rig Sunday). A switch
   counts only when the grid's column IDENTITY changes (which assignments it shows, by title; never score text, so a
   score that changes on the old grid is not a switch; a switch into an empty MP2 before the move is a real change;
   a period already shown needs a rendered, settled grid) and the visible column titles match the period; every
   write re-checks the displayed period first. **Marking-period evidence** = the `grading_period_id` stamps in
   `tools/.schoology-sync-state.json` (written when the sync creates a column, section 4.2, and by the move tool for
   every registered column, section 4.3). Once a section has any stamp, an unstamped due column, a foreign column
   (stamped for another period but on the grid) or a grid showing none of this period's stamped columns fails
   the pass closed (exit 3). With no stamps (today: none of the 226 state rows has one, until the move) the sync prints
   a WARNING and relies on the identity signature alone. **An unverified marking-period view ABORTS that pass with
   no writes (exit 3).** The LIVE tasks run without `-Q2ScoresOnly` (zeros on; decision 3, no grace);
   `-Q2ScoresOnly` exists only as a manual fallback. The daily job derives its passes from config
   (`build_schoology_fixture.py --passes`): the quarter containing today, the next quarter on a gap day, plus every
   ended quarter still inside its close window; nothing hard-codes Q1/Q2. A pass for a quarter that has not started
   (start date after today) still syncs but skips its official step: no override and no Desk publication (Sun 11/08's
   Quarter 2 pass writes no MP2 override; Monday's writes the first).
2. **Column filing from now on** by the **FILING DATE = zero date + 1** (the morning the 0 lands, so a zero date on a
   period's last day files into the next period; gap days roll forward: `marking_period_for_date`; re-pin
   `test_schoology_sync_lib.py` 254-263). Progress Check columns file by their Day 2 date. The Schoology due date
   stays the class day (decision 8.4). Record the MP id in the state row.
3. **One-time move of the 26 existing after-the-line columns MP1 → MP2 — by TOOL (teacher 11/07: "I'd rather you
   move them").** New `tools/schoology_move_columns.py` on the Edge CDP rig: default is a dry run that lists every
   planned move (section, title, state key, assignment/node id, current MP → target MP, filled-cell count); `--inspect
   <title>` opens that assignment's edit form (`/assignment/edit/{course}/{nid}/basic`, node id via the Materials
   lookup from `schoology_rename_columns.py` 256-345) and dumps the form's field names and the Grading Period options
   WITHOUT submitting; `--apply --one <title>` moves exactly one column, then reads the gradebook back in the MP2 view
   and asserts the column is there with the same filled-cell count it had in MP1 (grades carried over) and the same
   title; `--apply` moves the rest, one at a time, aborting on the first readback mismatch. Never changes a title or a
   due date (decision 4: class day stays). **Excludes B's straddling `2.3 Follow-Along` / `2.3 Blooket` (decision 2:
   they stay in MP1; `4.2`'s `2.3 Day 2 Quiz` moves).** An `--apply` run stamps EVERY registered column of the
   section with its MP id in the state row (`grading_period_id`: MP2 for a moved column, MP1 for the rest, as seen
   in the MP1 view), the marking-period evidence of section 4.1; a `--stamp` mode (read-only in Schoology) writes the
   same stamps without moving anything and refuses any ambiguous column. The orchestrator runs it (dry run →
   `--inspect` → `--apply --one` → `--apply`) Sunday after the deploy, before 16:00, or after 17:05.
   Safety: holds the shared rig lock (`tools/.schoology-sync-logs/rig.lock`); refuses to start 16:00–17:05 and
   re-checks the clock before each move; backs up its state file into `tools/.schoology-sync-logs/` first; refuses
   a form whose title or due-date field is missing, and re-reads both after each submit (they must be unchanged).
4. **Never lower, Quarter 1.** The MP1 override pass skips any write where `official < current`. The override reader
   returns one of three states and never writes on unreadable: a number, taken ONLY from the persisted display
   (`.grader-grid-grade-display`), never from the editor box (`input.grader-edit-input` can hold an unsaved value);
   verified-empty (display, scale label and editor all blank); or unreadable (label only, garbage, or an editor value
   that contradicts the display, such as a blank display over a number in the editor). Immediately before EACH write
   the tool re-reads that student's row and recomputes never-lower against the FRESH value (unreadable then: no
   write, exit 1; a value raised by hand during the run is kept). Every override write, either quarter, counts only
   when the persisted display then shows the written number; otherwise it is a failed write (exit 1), retried the
   next night. Baseline Sunday's overrides before the move (`CMD 5`) so the move itself cannot lower anyone
   (estimated MP1 work shifts of at most −0.65 for 4 E students and −0.22 for 3 B students without the guard).
5. **The close** (`tools/close_quarter.py`), run on the **morning AFTER the close date**: Wed 11/11 (no school), so
   Tuesday's 16:30/16:45 runs and Tuesday-evening fixes all count. The tool refuses `--apply` while today <= the
   close date and refuses `--today` together with `--apply`. Sequence: `POST /class/quarter/close {quarter:'Q1'}`
   for both sections → `POST /class/quarter/apply-bonus` → write the MP1 final override =
   `max(closedGrade incl. applied bonus, current MP1 override)` ONCE, recorded per student. The maximum is taken
   against a FRESH re-read of the student's row for EVERY student not yet recorded, including one whose batch read
   already matched (unreadable: no write, not recorded; a fresh override at or above the closed grade is recorded
   and published as that fresh value), and a final is recorded only when the persisted display shows the written
   number: an unconfirmed save stays retryable
   (the next `--final --apply` re-reads and retries). Publication to the Desk is tracked separately and retried.
   After that the daily Quarter 1 pass is skipped. (Decision 2: "whatever a student has as their current grade should
   be entered as the final grade; never lower".) Every rig tool (sync, official, move, close), the standalone section
   sync included, holds the shared rig lock (`tools/.schoology-sync-logs/rig.lock`) from before it connects until it
   exits; a daily-job step inherits the job's lock. A manual run refuses to start 16:00-17:05 in every mode that
   drives the rig, dry runs included, and a manual `--apply` run still going at 16:00 stops cleanly at its next cell,
   student, move or section; only the daily job's own steps (lock owner `PeriodB` / `PeriodE`) are exempt.
6. **MP2 override from Monday**: today's `pc_for_quarter('Q2')` counts U2 PC Part A already on file for 12 B / 11 E
   students. Recommend counting a PC only from its Day 2 date (the engine's rule), consistent with the teacher's
   "U2 PC counts only after B+C+FRQ" — **teacher to confirm**.
7. **Previews** (read-only; on the rig only before 16:00 or after 17:05, which the sync, official and move tools
   enforce, dry runs included): `pytest` Schoology suites (828 pass today); `CMD 3`
   `component_grades_from_class_doc(doc, today='2026-11-09')` after the engine is live; `CMD 4` MP ids + the
   gradebook's default view; `CMD 5` titles + filled cells per MP; `CMD 6` sync `--dry-run --through 2026-11-09`;
   `CMD 7` official dry run (adds `--quarter`, `--today`). Add `--today` to `build_schoology_fixture.py` and the sync.
Re-pin: `test_schoology_components.py` 93-222, 331-407; `test_schoology_sync_section.py` 544-567, 806-817;
`test_schoology_official.py` 13-220; `test_schoology_best_wins.py`; `test_e_wednesday_schedule_schoology.py`.

## 5. Runbooks

**Sunday 11/08 (before 16:00):** build + review (Opus 5.5 lanes: engine, Schoology tooling, Desk/Pico; Codex
gpt-6-astra `--effort max` + Opus verifiers; two fix passes, then a third Codex pass) → gates → snapshot
`/class/grades` before → push (teacher sign-off: student-visible) → verify `students[].quarters.Q1` identical, Q2
and gradebook-Q1 deltas reported, Desk build live, slices/zero fields present → `CMD 4/5/7` previews (never
16:00-17:05). **16:30/16:45** LIVE runs (Quarter 1 pass with never-lower; Quarter 2 pass with zeros on; a pass whose
marking-period view does not verify aborts with no writes, exit 3; nothing new zeros on Sunday; the Quarter 2
official step is skipped until Quarter 2 starts Mon 11/09, so no MP2 override and no Desk Quarter 2 official; if the
move has not run yet no column carries a stamp, so the sync warns and checks the view by column identity alone).
**Column move by tool** (dry run → inspect → one → all, §4.3) before 16:00 if the MP filter and edit form
verify, else after 17:05; readback `CMD 5`. Its `--apply` stamps every registered column, which arms the stamp
check of section 4.1 from the next pass (`--stamp` writes the stamps without moving).
**Monday 11/09 16:30/16:45:** both passes; Quarter 2 pass writes MP2 scores, the first Q2 zeros (B `4.2` quiz;
E `2.3`, `4.1-2`) and the first MP2 override. **Tue 11/10:** Quarter 1 pass continues (fixes propagate, never
lower). **Wed 11/11 (no school), morning:** the close, §4.5; the Quarter 1 pass is skipped from then on.
**Report cards 11/16** read the MP1 final.

## 6. Acceptance (all lanes)
- Engine: Q1 identity (flag on/off) on live inputs; §1 sets; empty-ledger Q2 on 11/08–11/13; goldens/m2b unchanged.
- Live: `/class/grades` before/after → `students[].quarters.Q1` byte-identical; Q2 only new members; a report of the
  per-student `gradebook.quarters.Q1.schoologyTotal` deltas for the teacher (expected to move, §2); Desk/Pico/phone
  show two pills (Sunday: `Quarter 2 · starts Mon Nov 9`, even when an official number is cached: a quarter
  before its start date never shows a number), grouped rows, boundary; a B student with `4.2` missing sees it under
  Quarter 2 with `0 after Sun 11/8`.
- Teacher surfaces: the teacher dashboard's columns are the union over quarters (the re-filing drops no column);
  view-as carries the `closed` field.
- Weekly slips (`scripts/weekly-slips.mjs`): CED labels only; rows whose quarter has closed are dropped (no
  "can still be finished" for a closed quarter's 0).
- Schoology: Sunday dry runs write nothing; Monday's Quarter 1 pass writes no 0 for an after-the-line lesson; the
  Quarter 2 pass writes into MP2 only; an unverified view writes nothing; no override lower than Sunday's baseline
  in MP1, nor lower than a fresh re-read of the row just before the write; nothing written over an unreadable
  override (label only, garbage, a contradicting editor value); an override or a final counts only once the saved
  display shows it (else failed and retried; a final stays unrecorded); no MP2 override and no Desk Quarter 2
  official on Sun 11/08; a score change on the old grid never passes as a period switch; after the move every
  registered column carries a `grading_period_id` stamp, and from then on a foreign column, an unstamped due column,
  or a grid showing none of the period's stamped columns aborts its pass (exit 3); a standalone sync holds the rig lock, and manual rig runs, dry runs too, are
  refused 16:00-17:05 (a manual `--apply` stops at 16:00); readback after the move.

## 7. Risks
- Engine alone = MP1 zeros Monday (§4). Ship engine + zero routing together; move columns before Monday 16:30.
- MP filter driving is unverified UI work on a shared rig; an unverified view aborts its pass with no writes (exit 3),
  so the cost is a missed day of Schoology writes, not wrong cells; `-Q2ScoresOnly` is a manual fallback only.
  Until the move stamps the columns, the grid's content is checked by column identity alone (the sync warns); from
  the first stamp on the check fails closed, so an unstamped due column, or a stamp the grid disagrees with, stops
  that pass (exit 3) until the state is fixed (`--stamp`).
- Override writes fail closed: an override that cannot be read (in the batch read or in the fresh re-read just before
  the write), or a save whose display never shows the written number, means no write or a failed one (exit 1),
  retried the next night; a final stays unrecorded until a later `--final --apply` confirms it. The cost is a late
  override, never a lower one.
- Manual rig runs (sync, official, move; dry runs too) are refused 16:00-17:05, a manual `--apply` stops cleanly at
  16:00 part-way (re-run after 17:05), and a standalone sync refuses while another tool holds the rig lock: plan
  previews and the move outside that window.
- Quarter 2's own close and `finalUntil` are not set yet: decide them before January. Until a Quarter 2 close is
  set, no Quarter 2 pass runs after 01/22 (the pass list keeps an ended quarter only inside its close window).
- The My Gradebook Quarter 1 tab's "Schoology now" total moves on deploy (re-filed columns, §2), up or down by up
  to about 9 points; the engine Quarter 1 grade does not. Reported to the teacher, not hidden.
- Duplicate columns if MP2 copies were created instead of moved (same titles); never delete + recreate (empties cells,
  wipes hand entries, needs `last_synced` cleared).
- Overlap (accepted): the same worksheet/deck/quiz counts lift-only in Q1 and regular in Q2 (B `4.2`–`4.7`, E `2.3`,
  `4.1`–`4.6`; and the Q2/Q3 line in January). A missing shared deck `4|1-2` is a 0 in Q1 (via `4.1`) and Q2 (via `4.2`).
- Abrupt flip for B `4.2`/`4.3`, E `2.3`/`4.1` (late·no 0 → warning Sunday → 0 Monday): decision 3; §3.9 notice.
- After the close, stale red Q1 zeros everywhere unless §3.3 lands with the Desk.
- Q2 on day one reads 0 or very low for students behind (Lessons track = `4.2` alone under not-until-due).
- GitNexus: `computeQuarterV3` / `computeGrade` HIGH (every grade route, transcript); mitigated by the identity test
  and the live diff.

## 8. Decided by the teacher (2026-11-07, late evening)
1. The 26 columns are moved **by tool** (§4.3), not by hand.
2. B's straddling `2.3 Follow-Along` / `2.3 Blooket` **stay in MP1**.
3. MP1 final at the close = **the Desk's frozen Quarter 1 (closedGrade + applied bonus), never below the current MP1
   override**, written once (the close run, Wed 11/11, so Tuesday's work counts; §4.5).
4. Schoology due date for the moved columns: **the class day, unchanged**.
5. MP2 override: **count a Progress Check only from its Day 2 date** (so U2 Part A does not lift it from Monday).
6. **Two pills from Sunday** (the Quarter 2 pill reads `starts Mon Nov 9` until it has a grade); `final` shown
   through **Thu Nov 19**.
7. After the close, Quarter 1 zeros **leave** the Do Now and buckets; a read-only `Quarter 1 final` line stays in My
   Grade for the week.
