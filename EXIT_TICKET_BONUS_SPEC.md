# EXIT_TICKET_BONUS_SPEC.md — the follow-along exit ticket becomes a bonus; lesson max 105 %

**Teacher decision 2026-09-11** (from a student suggestion): "the exit ticket in the follow-along should be bonus —
the max a kid could get on a follow-along should be 105 %." Constraints from the teacher, verbatim intent:
- **Grades only go up.** Many students have already done exit tickets; none of that credit may be lost.
- **Do NOT pull the exit ticket out of the current formula.** It keeps counting whenever it helps AND earns a bonus
  on top. Codex proved (2026-09-11) that leaving it in the mean unconditionally contradicts "only up": one E
  reflection + one I exit ticket = W 67.5, so the exit ticket LOWERED the lesson. Resolution: the exit ticket counts
  in `W` only when that raises the lesson (max of with/without), which is the only formula that satisfies BOTH
  "nobody loses credit already earned" and "adding an exit ticket never lowers a grade".
- Grade-affecting: roster-server auto-deploys; flag it, regen the bundle, run the ROOT suite (parity tests live there).

## 1. Where the exit ticket sits today

- Every one of the 69 worksheets has `<textarea id='exitTicket'>`; it is AI-graded like `reflect1`/`reflect2` and
  recorded as `source:'frq'`, `item_id = <WS-prefix>-exitTicket` (e.g. `WS-U1L4-exitTicket`), raw score 0–1.
- `roster-server/lesson-grade.js` `computeLessonGrades`: `frqScoreToPct` maps raw ≥0.75 → E(100), ≥0.25 → P(70),
  else I(35). `W` = mean of gradable FRQ pcts (reflections + exit ticket). Lesson grade `B` = weighted mean of
  `Cws` (blanks, w1), `W` (w2), `Q` (quiz, w3) over the feeders present. `lessonGradeNoQuiz` (line ~1000) is the
  Schoology / in-app "lesson track" value with the same shape minus Q.

## 2. The change (engine only; worksheets untouched)

In `computeLessonGrades`, after `B` is computed for a topic:

```
exitItem    = acc.frqItems.find(f => /-exitTicket$/.test(f.itemId) && f.score != null)
exitBonus   = exitItem == null ? 0 : (exitItem.score >= band.E ? 5 : exitItem.score >= band.P ? 3 : 1)
B_with      = B as computed today (W = mean over reflections AND exit ticket)
B_without   = same formula with the exit ticket excluded from W (W over reflections only; if no reflections are
              gradable, W is null and the ws/Q feeders carry B_without — exactly as a lesson with no FRQs today)
lessonGrade = min(105, max(B_with, B_without) + exitBonus)
```

Why `max`: `B_without` does not depend on the exit ticket, so adding or raising an exit ticket can only raise
`max(...)` and `exitBonus` — the grade is monotone in the exit ticket by construction. And `max(B_with, …) >= B_with`
= today's grade, so no student loses credit already earned. A lesson with no exit ticket has `B_with == B_without`
and bonus 0 → byte-identical to today.

- `acc.exitBonus` (0/1/3/5) and `acc.exitCounted` (true when `B_with > B_without`) are surfaced on the result so the UI can show "+5 exit ticket".
- Apply the same bonus in `lessonGradeNoQuiz` (min 105) — Schoology and the in-app gradebook must agree with the
  Desk. Schoology accepts scores above an assignment's max (extra credit); confirm the sync tooling
  (`tools/schoology-sync.py`, `build_schoology_fixture.py`, `tests/test_schoology_*`) does not clamp or reject
  values > 100 — if it does, clamp ONLY at the Schoology write (never in the engine) and say so.
- `Cws` is untouched (it gates lesson completion at ≥60; the bonus never affects gating).
- Bonus needs a graded exit ticket: an ungraded/absent one is +0. The AI grade is the existing pipeline; no new
  grading surface, no auto-scoring of anything human-graded.
- Monotonicity: `min(105, max(B_with,B_without) + bonus) >= B_with` always; the grade-policy simulator property tests (fast-check over the
  real engine — see `project_grade_simulator`) must keep passing; add a property "adding/raising an exitTicket
  item never lowers lessonGrade, lessonGradeNoQuiz, workAvgV3, or the quarter grade".

## 3. Downstream (audit, then fix what actually assumes ≤ 100)

- Quarter: `quarterGradeV3` / `computeQuarterV3` — the Work-track mean may now exceed 100 for a student with many
  bonuses; the existing quarter clamp `Math.min(100, base + earlyBonus)` stays (teacher: quarter caps at 100).
- Desk: the two consumers of `lessonGrade` (~9036 remediation list "< 75", ~18420 grade pill `lgVal`) — verify the
  pill renders "105" and any width/percent bar is clamped to 100 % visually without clipping the number.
- `teacher-dashboard.html`, in-app gradebook grid, `start-here.html` Grade Playground copy: render up to 105; the
  Playground's explanatory text should mention the exit-ticket bonus in one line.
- `roster-server/grade-engine.bundle.js`: regen via `scripts/build-grade-engine.mjs` (no new export needed unless
  you add one — then add it to MODULES), run ROOT `npm test` (parity + phase4-structure live there).
- `roster-server/tests/fixtures/m2b-invariance/*` and `art-hashes.json`: expected values change for any fixture
  with a graded exit ticket — update expectations, never the engine.
- Offline mesh / Android packet app consume the bundle; nothing else to do beyond the regen.
- Nightly Review / AI coach prompts that quote "max 100": grep `100%` in `roster-server/nudge*.js`,
  `roster-server/coach*.js`, cr prompt rules are out of scope (separate repo) — list any you find.

## 4. Tests

- `roster-server/tests/exit-ticket-bonus.test.js`: E/P/I/absent → +5/+3/+1/+0; cap at 105; bonus present in
  `lessonGradeNoQuiz`; a lesson with only an exit ticket graded still gets W from it as today plus the bonus;
  no change to any lesson without an exit ticket (golden: recompute the existing sy2627 fixtures with exit
  tickets stripped and assert byte-identical results).
- Property test as in §2.
- Root: bundle parity green; `tests/grade-*` and `tests/desk-grade-*` adapted for 105 where they asserted 100.
