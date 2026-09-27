# Ahead-work projection — "what Schoology will read once your early lessons come due" (2026-09-27)

Teacher: "is our ahead work grading polished? We should see a sort of tentative grades field for students
who've worked ahead of the class so they feel that the current work grade is fair!!!"

## 0. What is true today
- The engine's Work track already counts every lesson with work, ahead or not
  (`v3AheadOfScheduleLessons = 'count-all'`). The Desk grade is therefore already "fair".
- Schoology shows only DUE columns (`buildGradebookRow`: `col.due !== false`), so an ahead student's
  Schoology number lags the Desk. The Desk balance card, the grade breakdown and the slip already say
  "Ahead of the calendar: 3 lessons already done (1.6, 1.7, 1.8). They already count in your Desk grade;
  Schoology catches up when each lesson's column opens." What is missing is the NUMBER: what Schoology
  will read once those columns open. That is the "tentative grade".

## 1. Server (`roster-server/gradebook-grid.js`)
`buildGradebookRow` returns two more fields, computed exactly like `schoologyTotal` but including
non-due completed cells:
```
schoologyProjectedTotal   // category-weighted total over ALL completed cells (due or not); null when no cell
aheadCells                // count of completed cells whose column is not due yet
```
`categoryAveragesProjected` too (same shape as `categoryAverages`). Blanks stay ignored (never 0).
`buildGradebook` passes them through per quarter. Tests in the gradebook-grid test file: a row with one
due and one ahead cell → `schoologyTotal` from the due cell only, `schoologyProjectedTotal` from both,
`aheadCells: 1`; no ahead cells → projected equals today's total and `aheadCells: 0`.

## 2. Desk (`ap_stats_roadmap_square_mode.html`)
- **Balance card ahead line** (`_walletEffortBlock`, the ahead line): when `aheadCells > 0` append one
  sentence: ` Once they come due Schoology will read about 85% (today 83.7%).` Numbers from
  `_gradeGradebookCache.quarters[q].schoologyProjectedTotal` / `.schoologyTotal`, rounded to one decimal.
  No sentence when the projection is not available (older payload).
- **Do Now Schoology chip**: title gains the same sentence; the chip text stays `Schoology today 83.7%`.
- **"show the math" panel** (`_gradeMathLines`): after the "Schoology today = …" line add
  `Once your 3 ahead lessons come due: Schoology ≈ 85 (the ahead cells join their categories).` when `aheadCells > 0`.
- **My Gradebook key line**: the green key gains ` → Schoology will read about 85% once these come due.`
- **Slip** (`scripts/weekly-slips.mjs` ahead line): same sentence appended; the slips script reads
  `student.gradebook?.quarters?.[q]` if `/class/grades` carries it — CHECK: if `/class/grades` students
  do not carry `gradebook`, compute the projection in the slips script from `lessons` with the Desk
  weights via a small shared helper in `lib/effort-facts.js` (`schoologyProjection(lessons, units, period, today, weights)`)
  and use THAT on the Desk too for consistency. Prefer the server field when present; the helper is the
  fallback. Pin parity: helper result === server field on a fixture.
- Coach facts (cr `buildCoachFacts`): `WORK DONE AHEAD` line gains `— once those come due Schoology reads about 85% (today 83.7%)`.

## 3. Tests
`tests/desk-ledger-calm.test.js` (ahead sentence present/absent), `tests/desk-grade-outlook.test.js`
(math panel line), `tests/desk-my-gradebook.test.js` (key sentence), `tests/weekly-slips.test.js`,
`lib/effort-facts.test.js` (helper), roster-server gradebook-grid tests, cr `tests/coach.test.js`.

## 4. Out of scope
No change to what counts (the engine), to the Schoology sync, or to which columns exist.
