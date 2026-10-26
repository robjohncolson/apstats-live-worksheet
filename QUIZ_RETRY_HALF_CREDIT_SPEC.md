# Quiz retry: a correct retry earns half credit (spec v1, 2026-10-26)

Status: implemented 2026-10-26, awaiting the orchestrator gate; superseded the same evening: retries close at the same cutoff, QUIZ_RETRY_REMOVAL_SPEC.md

## 0. Decision

Teacher decision, 2026-10-26, after a review of every quiz row in the ledger: a correct **first answer** earns full credit, a correct **retry** earns **half credit**, a wrong retry earns nothing. The retry itself stays exactly as it is (one retry, a different letter, an explanation of three or more real words, the explanation-vs-pick confirm card).

Why. Every quiz item has five options. With a full-credit retry a pure guesser's expected score doubles from 20% to 40%, which is exactly the Quiz Done gate. Half credit caps that floor at 30% while a student who genuinely reconsiders still earns something. The ledger on 2026-10-26 (Period B and E, 29 students): 1208 keyed first answers, 91% correct; 104 wrong, 35 retried; 33 retries switched letter and 18 landed right (55% against 25% chance); retry explanations median 10 words; mean lesson quiz score 90% first-answer-only vs 91% with retries.

## 1. The rule

For each keyed `curriculum_quiz` item the authoritative row is `latestPerItem` (the attempt-2 row when one exists; `roster-server/scoring.js`). Its credit:

| Row | Credit |
|---|---|
| attempt 1, response matches the key | 1 |
| attempt 2, matches the key, `recorded_at` on or after the cutoff | 0.5 |
| attempt 2, matches the key, `recorded_at` before the cutoff, missing or unparseable | 1 (grandfathered: a stored grade never goes down) |
| does not match the key | 0 |

- Cutoff: `quizRetryHalfCreditFrom: '2026-10-27T04:00:00Z'` in `roster-server/grade-config.js` (midnight EDT ending Monday 2026-10-26: every retry made under the announced full-credit rule keeps it). Tests override it through the existing `configOverrides` path.
- `attempt` is read as a number (`'2'` counts as 2); a missing attempt is 1. Attempts above 2 cannot exist (the ledger refuses them).
- AI or teacher review credit (`quiz_review` `#rev` rows, `quiz_exception` `#exc` rows) still combines as `max()` with the credit above, unchanged.
- The per-item `correct` flag keeps its meaning, `credit >= 1`; the `credit` field already carried on quiz items is what changes.
- Nothing about the retry itself changes: the ledger route, first-writer-wins, the teacher reset, the confirm card and the AI read are untouched. Rows still carry no score; scoring stays read-time and server-side.

## 2. Where it lives

Single source of truth: `roster-server/scoring.js` gains a pure helper, `quizCredit(row, keyEntry, cutoffIso)` returning 1, 0.5 or 0, built on `isCorrect`. Every **grade-bearing** quiz percentage uses it:

- `roster-server/lesson-grade.js` (~409–418), the v3 Quizzes work track: `credit = max(quizCredit(...), reviewCredit)`. Q is already `sum(credit) / denominator` (~495–499), so the half flows through.
- `roster-server/scoring.js scoreAgainstKey` (used by `grade.js` `qAgg` and the `/rollup` feeder in `rollup.js`): aggregate credit, not a correct count, wherever the result becomes a percentage. Completion counting (`grade.js` ~219–226, "did they answer") is unchanged.
- Offline bundle: if `quizCredit` is imported across bundled modules, add it to the `MODULES` exports list in `scripts/build-grade-engine.mjs`; regenerate with `node scripts/build-grade-engine.mjs`; `tests/grade-engine-bundle-parity.test.js` must pass.
- Desk (`ap_stats_roadmap_square_mode.html` ~6843–6870 and ~20926): the quiz percentage already sums `credit`. Where the Desk counts or lists per-item results by `correct`, a half-credit item shows as "½", not as wrong, and any count shown as a score sums credit. Any Desk copy that states the retry rule says "half credit". Minimal edits; tests through `tests/helpers/desk-source.js`.

Evidence and economy paths keep the boolean and are **not** changed: `mastery.js`, `misconceptions.js`, `receipts.js`, `doge-econ.js`.

## 3. The quiz page (`curriculum_render/index.html`), copy only

| Today | New |
|---|---|
| `Not correct. You get one retry: explain what changed your mind, then submit.` | `Not correct. You get one retry for half credit: explain what changed your mind, then submit.` |
| `You were not correct. One retry: explain what changed your mind.` | `You were not correct. One retry for half credit: explain what changed your mind.` |
| `One retry: explain what changed your mind (at least 3 words).` | `One retry for half credit: explain what changed your mind (at least 3 words).` |
| `Submit retry (this becomes your grade)` (three places) | `Submit retry (half credit if correct)` |
| `✅ Correct answer submitted!` after a **retry** | `✅ Correct on your retry: half credit.` |
| `✅ It is correct.` on the kept-first reconcile path | `✅ It is correct: half credit.` |

Unchanged: the first-answer `✅ Correct answer submitted!`, the pending line, `Not correct. This retry is your grade. The correct answer is shown below.` (a wrong retry is still the grade), the "you've used your retry" talk line. The page never computes a grade; the Desk shows the percentage the server computes. `QUIZ_FIRST_ANSWER_SPEC.md` gets an addendum section pointing here.

## 4. Tests

- roster-server: `quizCredit` matrix (first correct, retry before/at/after the cutoff, retry wrong, missing `recorded_at`, string attempt); lesson-grade v3 Q with one half item (two items, first correct + retry correct → 75%); review credit still wins as `max`; rollup aggregate. `golden-master.test.js` stays byte-identical (its fixtures predate the cutoff); if a golden changes, stop and report instead of regenerating.
- Root: `tests/grade-engine-bundle-parity.test.js`, `tests/phase4-structure.test.js`, `npm run test:quick`, any Desk test touched.
- curriculum_render: `tests/quiz-retry-copy-dom.test.js` pins the new strings on both correct-retry paths; other suites that pinned the old copy are revised.

## 5. Rollout

- `roster-server/` auto-deploys on push to master: push only outside a live B or E block (bell table in `apstat-park/class-session.mjs`). Bump the Desk build first (`scripts/bump-build.mjs`).
- The quiz page copy ships in the same window. Between the copy going live and the midnight cutoff the page says "half credit" while the server still grants full: a few hours, in the students' favor.
- The teacher tells both classes: starting Tuesday 2026-10-27 a correct retry is worth half.
