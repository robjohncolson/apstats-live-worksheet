# Bonus Bank — backend (roster-server + entry script)

Read `BONUS_BANK_SPEC.md` first (repo root). This package is the server side and the
teacher entry script. The Desk and dashboard UI are a SEPARATE later package — do not touch
`ap_stats_roadmap_square_mode.html` or `teacher-dashboard.html`.

Edit in place. No new abstraction layers, no wrappers, no config systems. Match the style of
the neighbouring code (see `POST /class/blooket` in `roster-server/class.js` and
`scripts/import-pc-scores.mjs`). Keep every function short and skimmable.

## Storage: ledger rows only (no new tables)

Two new ledger `source` values, written ONLY by teacher-authenticated routes:

1. `source: 'bonus'` — one row per student per sheet.
   - `item_id: 'BONUS-<sheetId>'` e.g. `BONUS-U1-screen-time`
   - `score: 5 | 3 | 1` (E=5, P=3, I=1) — numeric so best-wins/upsert semantics are simple
   - `response`: JSON string `{"grade":"E","quarter":"Q1","title":"Screen Time, Two Deletions"}`
   - `attempt: 1` (re-entering the same sheet upserts in place on `(student_id, source, item_id, attempt)`)
2. `source: 'bonus_applied'` — one row per student per quarter, written by the apply step.
   - `item_id: 'BONUS-APPLIED-<quarter>'` e.g. `BONUS-APPLIED-Q1`
   - `score`: the adjusted closed-quarter grade (0..100)
   - `response`: JSON string `{"points":8,"workBefore":35.2,"workAfter":43.2,"frozenGrade":63,"adjustedGrade":90,"switched":true,"sheets":["BONUS-U1-screen-time"],"appliedAt":"<iso>"}`

Migration: `roster-server/migrations/0036_item_ledger_bonus_source.sql` — extend the CURRENT
`item_ledger_source_check` allow-list (find the latest migration that redefines it and copy
its full list) with `'bonus'` and `'bonus_applied'`. Follow the drop-then-add pattern of
`0011_item_ledger_pc_source.sql`. The teacher runs migrations by hand; routes must return
503 with a clear "run migration 0036" message when the CHECK rejects the source (mirror how
`/class/blooket` handles the pre-0013 case).

## Grade engine: both sources are inert

In `roster-server/lesson-grade.js` (and `grade.js` / `mastery.js` / `rollup.js` if they
iterate ledger rows), rows with `source === 'bonus'` or `source === 'bonus_applied'` must be
skipped explicitly and early — never bucketed into a lesson, PC, quiz, Blooket or trainer
track, never counted in any Due/Done/Todo, never in `lessonsGraded`. Add the skip where the
other `source ===` branches live; a comment: "banked bonus — applied only at quarter close
(BONUS_BANK_SPEC.md)". Do NOT change any weights, gates or formulas.

## Routes (`roster-server/class.js`, next to the quarter close/deltas block)

All three require `requireTeacher`.

### `POST /class/bonus`
Body: `{ sheetId, title, quarter, section?, entries: [{ username?, studentId?, grade: 'E'|'P'|'I' }] }`
- Resolve each entry to a roster student (studentId, or login_username within `section`
  when given). Unknown → collected in `errors`, skipped; never 500s the batch.
- Write the `source:'bonus'` row per entry with the same ledger insert `/class/blooket` uses
  (`attempt: 1`, upsert).
- Response: `{ ok, sheetId, quarter, written, errors: [...] }`.

### `GET /class/quarter/deltas` (existing) — additive fields
For every student in the response and for frozen students who currently have no positive
delta (do NOT drop them any more when they have banked bonus), add:
```
bonus: { points, sheets: [{ itemId, title, grade, points }], applied: null | { adjustedGrade, appliedAt } }
```
where `points` = sum of banked `bonus` rows whose `response.quarter === quarter`.
Keep the existing `deltas` semantics for rows with no bonus (backward compatible: the
dashboard's current renderer must still work unchanged).

### `POST /class/quarter/apply-bonus`
Body: `{ quarter, section?, dryRun?: boolean }` (dryRun defaults to TRUE).
For each frozen student in scope with banked points for that quarter and NO existing
`bonus_applied` row:
- `workBefore = frozen_work_avg` (coerce Number — PostgREST numerics are strings),
  `pc = frozen_pc_avg` (may be null),
- `workAfter = min(100, workBefore + points)`,
- `adjustedGrade = combineV3(pc/100, workAfter/100, config.v3Gates) * 100` rounded to 0.1,
  using the SAME exported functions the engine uses (`combineV3`, gates from
  `grade-config.js`) — never re-implement the formula. If `pc` is null, the quarter grade is
  the work track alone (that is what `combineV3` already does).
- `switched = workBefore < floor*100 && workAfter >= floor*100`.
- Audit row: `{ studentId, username, realName, frozenGrade, points, workBefore, workAfter, switched, adjustedGrade, sheets }`.
Response: `{ ok, quarter, dryRun, rows: [audit...], applied: n }`. With `dryRun: false`
write one `bonus_applied` row per audit row (skip and report students already applied —
idempotent: a second call applies 0). Never lower: if `adjustedGrade < frozenGrade` (cannot
happen mathematically, but guard it) keep `frozenGrade`.

Bonus points are Work-track only. There is no code path that adds them to PC. Say so in a
comment at the top of the block.

## Entry script: `scripts/enter-bonus.mjs`

Model on `scripts/import-pc-scores.mjs` (same `--url/--secret` handling, same roster
name-matching table, dry run by default, `--apply` to write).
```
node scripts/enter-bonus.mjs <file>            # dry run: shows name matches + what would be written
node scripts/enter-bonus.mjs <file> --apply    # POST /class/bonus
```
Input file (kept OUTSIDE the repo — it holds names):
```
sheet=U1-screen-time quarter=Q1 title=Screen Time, Two Deletions
Real Name|E          ← or roster username; grade is E, P or I
# comments / blank lines ignored
```
Name matching: exact roster real_name or login_username (case-insensitive, whitespace
collapsed). Ambiguous (two roster matches) or unmatched names are listed and the run
REFUSES to `--apply` until the file is fixed — never guess. Export `parseBonusFile(text)`
for tests.

## Tests (vitest, `roster-server/tests/` + root `tests/`)

1. `roster-server/tests/bonus-bank.test.js`:
   - engine inertness: a fixture ledger with and without `bonus` / `bonus_applied` rows
     produces byte-identical `computeGrade` output (reuse `tests/fixtures/sim-world.js`
     archetypes; a fast-check property over random bonus rows is welcome, keep it small);
   - apply math: Work 35 + 5 → 40 flips the switch (PC 90 → adjusted 90, `switched: true`);
     Work 98 + 5 → 100 (ceiling); PC null → adjusted = workAfter; idempotence (second apply
     writes 0 and reports the student as already applied);
   - route tests for `/class/bonus` (unknown name → errors[], no 500) and `apply-bonus`
     dryRun default, following the existing route-test style in that folder.
2. `tests/enter-bonus.test.js`: `parseBonusFile` — header parsing, E/P/I validation,
   comments, a bad grade letter throws.

Run `cd roster-server && npx vitest run tests/bonus-bank.test.js` and
`npx vitest run tests/enter-bonus.test.js` and paste the results in your report.

## Constraints
- Max 10 files changed. No git commits.
- Do not regenerate goldens or `grade-engine.bundle.js` (the engine change is a skip that
  cannot alter existing outputs; if a golden test fails, STOP and report why rather than
  regenerating).
- Report: files changed, the exact route contracts as implemented, and anything in the spec
  you found impossible or ambiguous.
