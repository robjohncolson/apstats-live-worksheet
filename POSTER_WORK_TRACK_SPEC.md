# Posters return to the Work track at 30% (15% of the quarter), scored 90-115 (spec, 2026-10-20)

Status: SIGNED OFF by the teacher 2026-10-20 (flat letter map E 115 / P 100 / I 90 for the conversion; Work clamped at 100; the poster DOES count toward the 40% floor, teacher: "I did want it"). Building. **Grade-affecting** (changes the Work blend that feeds the
Desk grade, the nightly Schoology official grade, the gradebook grid and the Bonus Bank).

Teacher (2026-10-20): Period B reported "the poster grades haven't been entered into Schoology". The
Schoology categories were never moved off Blooket 5 / Lesson 15 / Posters 15 / Progress Check 50 /
Quiz 15, i.e. posters are still 30% of the Work half there, while the engine has run posters as
banked bonus since `POSTER_BONUS_SPEC.md` (2026-10-09). Teacher: "having the posters as 15 makes a
lot of sense." This spec makes the engine match Schoology again and retires `POSTER_BONUS_SPEC.md`
sections 1-3 and 5. Section 4 of that spec (one poster per quarter, `POSTER_UNITS`) stays.

Poster score scale (teacher 2026-10-14): **floor 90, ceiling 115**. I = 90, P = 100, E = 115 as the
defaults; the teacher may enter any number in 90-115 per sheet (sheet 4 got 92, Superpowers 105).
The printed key's 100/85/60 is never used.

## 1. Decisions

1. **Work = lessons 0.30 / quizzes 0.30 / posters 0.30 / blooket 0.10** (the pre-10/09 split).
   Schoology categories stay exactly as the teacher has them today: Lesson 15 / Quizzes 15 /
   Posters 15 / Blooket 5 / Progress Check 50. No Schoology category edit is needed.
2. **A poster is a ledger row, not a bonus row.** New source `poster`, item `POSTER-U{n}`, score
   90-115, response `{grade: 'E'|'P'|'I', sheet, title}`. One row per student per poster unit.
3. **The posters track is the mean of the student's poster scores for the quarter's poster units,
   divided by 100, NOT clamped to 1** (a 115 is 1.15). **Work is clamped to 1.0 after the blend.**
   So a 115 lifts Work by up to 4.5 points over a 100 and can never push Work past 100.
4. **No poster = absent, not zero.** `workTracks.posters = null` renormalises Work over the other
   three tracks, exactly like a lesson with no quiz yet. Schoology does the same with an empty cell.
   A student who missed the poster week is not penalised; the teacher may accept a solo paper
   poster later and enter it the same way (teacher call per case).
5. **A 90 lowers Work for a student whose other tracks average above 90.** Accepted: the floor is
   the teacher's rule, and 90 is a B+ on a quarter of the Work half.
6. **The 29 banked `BONUS-POSTER-U1` rows (B 14, E 15) convert to `POSTER-U1` rows and are deleted
   from the bank** so the quarter close never double counts. Letters map E 115 / P 100 / I 90 unless
   the teacher supplies the per-sheet numbers (recommended: use the 10/14 and 10/16 sheet numbers).
7. **Schoology shows the number.** The poster column (`POSTER:U{n}`, "Unit n Poster") is filled by
   the sync from the `POSTER-U{n}` row's score, so the breakdown students see and the engine agree.
   Commit `30151b8c` (poster evidence column, letter map) is reworked to read the new row first.
8. **The nightly official grade counts posters as a Work category again** (`schoology_official.py`
   `WORK_WEIGHTS` gains Posters 15). Banked DOK sheets stay banked bonus, unchanged.

## 2. Grade engine (roster-server, auto-deploys on push)

Every weight declaration changes together, same commit:

| File | Today | After |
|---|---|---|
| `roster-server/lesson-grade.js` `V3_WORK_WEIGHTS` | {lessons .50, quizzes .35, blooket .15} | {lessons .30, quizzes .30, posters .30, blooket .10} |
| `roster-server/grade-config.js` `v3WorkWeights` | same | same new value |
| `roster-server/gradebook-grid.js` `SCHOOLOGY_CATEGORY_WEIGHTS` | Lesson 25 / Quizzes 17.5 / Blooket 7.5 / PC 50 | Lesson 15 / Quizzes 15 / Posters 15 / Blooket 5 / PC 50; `buildGradebookColumns` emits poster columns again |
| `roster-server/lesson-grade.js` `workAvgV3` | tracks clamped [0,1] | posters track may exceed 1; result `Math.min(1, ...)` |
| `roster-server/grade.js` / `class.js` | `workTracks.posters` never fed | fed from `poster` rows: mean score / 100 over the quarter's poster units (`eventSchedule.posters`), null when none |
| `roster-server/migrations/0042_item_ledger_poster_source.sql` | - | adds `'poster'` to the `item_ledger_source_check` allow-list (**TEACHER-RUN**) |
| `roster-server/ledger.js` | - | `/ledger/record` 403s `source:'poster'` (students can't forge); teacher routes may write it |
| `roster-server/class.js` `bankedBonus` + every `source !== 'bonus'` filter | - | `poster` rows are NOT bonus: engine counts them, bank/mastery/review/doge ignore them like other graded sources. doge-econ: 0 effort points for a poster row (teacher-entered) |
| `tools/schoology_official.py` `WORK_WEIGHTS` | {Lesson 25, Quizzes 17.5, Blooket 7.5} | {Lesson 15, Quizzes 15, Posters 15, Blooket 5}; `column_category` already maps "Poster" to Posters |
| `roster-server/data/grade-config.sy2526-freeze.json` | posters 0.3 | UNCHANGED |
| generated `grade-engine.bundle.js` | - | regen (reference_grade_engine_bundle_regen) |

Engine feed detail: the poster score is read like PC (unit-keyed), not like a lesson. For quarter Q,
poster units = the units whose poster date (`eventSchedule.posters[U].periods[B|E]`) falls in Q. Score
rows for other units are ignored for Q. Mean over those units' rows that exist; none -> null.

## 3. Entering and converting posters

- `scripts/enter-poster.mjs <file> [--apply]` (clone of `enter-bonus.mjs`): file header
  `unit=1 quarter=Q1 title=Unit 1 Poster (Data, Graph, Sentence) section=PeriodB`, then
  `Name|115` or `Name|E` per line (letter -> 115/100/90). Exact roster-name match, refuses
  ambiguous, dry-run by default, upserts (a later entry for the same unit replaces). Teacher routes:
  `POST /class/poster` (teacher secret), atomic per row.
- `scripts/convert-poster-bonus.mjs [--apply]`: for every `BONUS-POSTER-U{n}` row, write
  `POSTER-U{n}` with the letter's default number (or the number from an optional
  `--numbers <file>` of `Name|score`), then delete the bonus row. Prints an audit table. Run once
  per section, after migration 0042 and the server deploy. The Period B and E per-sheet numbers from
  2026-10-14/16 are the recommended `--numbers` input (feedback_poster_score_scale_90_115).

## 4. Schoology sync (tools/, runs on Athena)

- `build_schoology_fixture.fetch_poster_grades` reads `/ledger/student/:id?prefix=POSTER-` first
  and uses the row's numeric score; falls back to the `BONUS-POSTER-` letter map only while the
  conversion has not run (so the evidence column is right on both sides of the cutover).
- `schoology_components.POSTER_SCORE` stays as the letter default.
- Best-wins is unchanged: a higher hand-entered Schoology cell is kept.
- Schoology: the poster assignment's max points stay 100; a 115 is extra credit on that cell.
  Verify once on Athena that the gradebook accepts >100 on the column (it does for hand entry).

## 5. Student-facing text

Every place that says posters are bonus flips back to "a poster is 30% of your Work":
`lib/effort-facts.js` (lines 226-231), `start-here.html` (line 605 + the bonus-sheet bullet at 719 +
the worked example at 712 + the Grade Playground regains its Posters input, `V3_WORK_WEIGHTS` at
749), the Desk (`DESK_V3_WORK_WEIGHTS` at ap_stats_roadmap_square_mode.html:9098, "how your grade is
counted", My Ledger "Bonus banked" block must no longer list posters), Pico Desk / mobile home copy
if they mention posters. Wording rule: "Your unit poster counts 30% of Work. It is scored 90 to 115,
so it can only help you unless the rest of your Work is above 90." Never print 100/85/60.

## 6. Tests

- `roster-server/tests/lesson-grade-v3.test.js`: weights sum to 1.0 with posters; posters track
  null renormalises; 1.15 posters track clamps Work at 1.0; worked cases (a) lessons 90 / quizzes 70
  / blooket 80 / poster 115 -> Work min(1, .27+.21+.08+.345)=.905; (b) same with no poster -> (.27+.21+.08)/.70 = .80;
  (c) all 100 + poster 90 -> .97.
- `roster-server/tests/gradebook-grid.test.js`: poster columns back, category weights 15/15/15/5/50.
- `tests/test_schoology_official.py` (or wherever `WORK_WEIGHTS` is pinned): Posters 15 counted.
- `tests/test_build_schoology_fixture.py`: POSTER- rows win over BONUS-POSTER- rows.
- Goldens: `golden-synthetic`, `m2b-invariance/*` regen + re-pin; `tests/grade-playground.test.js`,
  `tests/grade-clarity.test.js`, `tests/desk-grade-outlook.test.js`, `tests/desk-donow-bonus.test.js`
  re-pinned to the new copy and weights. Root suite + roster suite + pytest all green before push.
- Bank: a converted student has no `BONUS-POSTER-` row and the Quarter Close preview shows no poster.

## 7. Rollout order

1. Teacher signs off this spec (weights, 90-115 scale, conversion numbers).
2. Migration 0042 (teacher-run on Supabase).
3. roster-server: engine + routes + tests + bundle regen -> push (auto-deploys). Until step 4 runs,
   posters track is null for everyone and Work renormalises, so no grade moves yet.
4. `convert-poster-bonus.mjs --apply` per section with the per-sheet numbers. Grades move here:
   Period B and E Work tracks pick up the poster.
5. Python sync + official tool -> push; Athena's next -Live run fills the poster column and the
   nightly official grade counts it.
6. Desk + start-here + effort-facts copy -> bump-build -> push.
7. Verify on the public URL: a Period B student's Desk Work pill, the Schoology column, the official
   pill, and the dashboard Quarter Close preview (no poster in the bank).

## 8. Risks

- Double count if the conversion runs before the server deploy ignores `poster` rows in the bank, or
  if any bonus row survives. The convert script refuses to run while the server reports no `poster`
  support, and prints the surviving `BONUS-POSTER-` count after.
- Work drops for top students: a 90 poster lowers a 95-Work student to about 93.5. Teacher accepted
  the floor; state it in the copy.
- Schoology's category math and the engine agree only if both treat a missing poster as absent.
  They do today. Do not emit 0 for a missing poster.
- The posters track accepts 90-115 only; the entry route rejects anything else so a typo of 9 or
  1150 cannot land.
