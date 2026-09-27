# Review task — Bonus Bank v2 (higher-track placement, GRADE-AFFECTING) + ahead-work projection

You are a REVIEWER. Do not edit any file. Do not run git commands that change state. Read-only.
You MAY run the test suites (`cd roster-server && npx vitest run tests/bonus-bank.test.js`, etc.).

Two repos, UNCOMMITTED working-tree diffs (`git status --short`; `git diff -- <file>`):
- this repo: `roster-server/class.js`, `roster-server/tests/bonus-bank.test.js`, `roster-server/gradebook-grid.js`
  + its tests, `teacher-dashboard.html`, `ap_stats_roadmap_square_mode.html` (`git diff -U3 -- ap_stats_roadmap_square_mode.html`),
  `lib/effort-facts.js` + test, `scripts/weekly-slips.mjs` + test, `tests/desk-*.test.js` in the diff.
- C:/Users/rober/Downloads/Projects/school/curriculum_render: `railway-server/server.js`, `tests/coach.test.js`.

Contracts: `BONUS_HIGHER_TRACK_SPEC.md` (PART A) and `AHEAD_WORK_PROJECTION_SPEC.md` (PART B).

## PART A — recompute by hand; this changes the number that goes to Schoology at quarter close
Use `quarterGradeV3(pc, work)` = both ≥ 0.40 → max(pc, work); else max(0.7·pc, 0.7·work, (pc+work)/2);
`combineV3` passes a null track through. Gates default floor 0.40. Points P on a 0–100 scale added to a
track average (0–100), capped at 100, then divided by 100 for the formula. Residual = max(0, frozenGrade −
round1(combineV3(pc, work)·100)). adjusted = min(100, round1(candidate·100 + residual)).

For each case below, compute BOTH placements yourself and state the numbers; then check the code and the
test's expected value agree with YOUR arithmetic (a test that pins the code's own output is not evidence):
(a) pc 90, work 60, P 5, frozen 90 → work-placement: max(.90,.65)=90; pc-placement: max(.95,.60)=95 → PC, 95.
(b) pc 60, work 90, P 5 → Work, 95.
(c) pc 90, work 37, P 5 → work: 42 ≥ 40 → max(.90,.42)=90; pc: work still 37 → max(.7·.95, .7·.37, (.95+.37)/2)=max(.665,.259,.66)=66.5 → WORK wins (90) even though PC is the higher track — the floor flip beats adding to PC. Confirm the code picks Work here.
(d) pc null, work 60, P 5 → Work only, 65, pcAfter null.
(e) pc 70, work 70, P 5 → both candidates 75 → tie → higher frozen average tie → Work.
(f) monotone: for pc 90, work 37, P = 0..35 step 1 the adjusted grade is non-decreasing and ≥ frozen.
(g) `bonus_applied` response carries `placement`; a STUDENT read exposes the placement word and nothing else new.
Also verify: PC unit scores / `pcAvg` are never written; `switched` reflects the CHOSEN track; the residual is
still applied; stale-if-refrozen and first-writer idempotency unchanged; `GET /class/quarter/deltas` and the
dashboard preview show the same placement the apply step will use; nothing outside the apply/deltas path
calls `bonusAudit`.

## PART B
`schoologyProjectedTotal` includes non-due COMPLETED cells only (blanks never 0); `aheadCells` counts them;
projected === today's total when no ahead cells; the Desk/slip/coach sentences use the same two numbers;
if a client-side helper exists it matches the server field on the same fixture.

## Output format (only this)
```
VERDICT: <SHIP | FIX FIRST>
FINDINGS:
1. [BUG|SPEC|EDGE|TEST] <repo>/<file>:<line> — <one sentence>
   Repro/why: <your arithmetic vs the code's>
   Fix: <one sentence>
...
HAND-CHECKED: (a)=… (b)=… (c)=… (d)=… (e)=… (f)=… (g)=…   ← your own numbers/verdicts
CHECKED-OK: <sections verified with no finding>
```
Only report wrong numbers, wrong placement, altered PC data, lost idempotency, or lost coverage.
