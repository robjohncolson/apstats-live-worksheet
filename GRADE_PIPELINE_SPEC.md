# GRADE_PIPELINE_SPEC.md

> Status: DRAFT -- written 2026-05-21 (session 104). The "Thread 1"
> grade work: make worksheet work score, fix FRQ-revision persistence,
> make the AI verdict unambiguous, and refresh the grade after work.
> ONE teacher decision gates implementation -- the weights (Section 6,
> D1).

## 1. Goal

Make the grade real and trustworthy. Today, doing a worksheet feels
disconnected from the grade: filling in the blanks moves completion but
not the grade, a revised free-response answer can be silently lost, and
the grade pill only refreshes on a tab-refocus. This spec closes that
gap so doing the work visibly and reliably moves the grade.

## 2. Background -- the current model (from the session-104 investigation)

- `lessonGrade = (W * w_w + Q * w_q) / (sum of present weights)`, with
  `w_w = 1`, `w_q = 2`. `W` = mean of the lesson's AI-graded reflections
  (E/P/I mapped to 100/70/35); `Q` = the curriculum_render quiz percent.
- `quarterGrade = max( min(B_quarter, 85), P_quarter )` -- B is the
  weighted mean of lesson grades over due lessons; P is the proctored
  Progress-Check grade. (`roster-server/grade.js`, `lesson-grade.js`,
  `grade-config.js`.)
- Worksheet fill-in blanks are recorded `source:'worksheet'`,
  `score: null` -- completion-only, ZERO grade impact. Only the
  reflections and the quiz move the grade.
- The Do Now grade pill (`renderDoNowGrades` in the Desk) re-fetches
  `GET /grade` only on sign-in and on `visibilitychange` -- never after
  the student does work or clicks Done.

## 3. The change -- four work items

### W1 -- Score the worksheet blanks

The fill-in blanks already carry their correct answers (`data-answer`,
pipe-separated) and the worksheet already validates them
(green/yellow/red). That correctness is currently discarded. W1 records
it and feeds it into the grade.

- The worksheet feeder records each blank with its correctness
  (correct / partial / incorrect) instead of a `null` score; `source`
  stays `'worksheet'`.
- `roster-server/lesson-grade.js` gains a worksheet component. The
  lesson grade becomes a three-way weighted mean:
  `lessonGrade = (Cws * w_ws + W * w_w + Q * w_q) / (present weights)`,
  where `Cws` = the lesson's worksheet score, 0-100, from the share of
  blanks correct (partial-credit per D2).
- The weights live in `grade-config.js` as a knob. Proposed default
  `w_ws : w_w : w_q = 1 : 1 : 2` -- see Section 6 (D1); the teacher
  confirms.
- The cap/uncap is unchanged: `Cws` feeds B, B is still capped at 85,
  the Progress Check still uncaps. Scoring the worksheet is never
  punitive -- a weak worksheet cannot pull the grade below what the
  Progress Check earns.
- Rollout: the feeder change touches all 69 live worksheets -- use the
  established EOL-preserving `scripts/wire-*.mjs` rollout pattern, not a
  hand-edit per file.

### W2 -- Fix FRQ-revision persistence (BUG)

Reported symptom: a revised free-response (reflection) answer did not
persist -- a reflection edited after its first grade reverted on
reload, and the revision did not re-score. This is a likely contributor
to the "frozen Q1" report: a revision that never persisted never
recorded, so it never scored.

- Investigate the worksheet persist/hydrate flow (the session-103
  persistent-answers work, commit `1fbfcc1`) and the appeal/regrade
  flow. A revised reflection must (a) be saved so it re-hydrates on
  reload, and (b) be re-recorded to `item_ledger` so it re-scores.
- Confirm the fix with a test that revises an already-graded reflection
  and asserts both persistence and re-recording.

### W3 -- Unambiguous E/P/I from the AI grader

If the AI grading response does not contain a clean, parseable verdict,
the reflection records with no score and the grade silently does not
move.

- The grading prompts (`ai-grading-prompts*.js`) must instruct the
  model to end every response with an explicit one-letter verdict --
  `E`, `P`, or `I` -- in a fixed, machine-parseable form.
- Harden the score extraction (`ReflectionGrader` / the `/api/ai/grade`
  consumer): an ambiguous or missing verdict must be surfaced (a retry
  or a clear error), never silently recorded as no-score.

### W4 -- The grade pill refreshes after work

`renderDoNowGrades` must also re-fetch after a worksheet or quiz is
marked Done -- wire it into the Desk Done-click success path -- so the
student and teacher see the grade move when work is finished.

## 4. Non-goals

- Not changing the cap/uncap, the 85 ceiling, the quarter bands, or the
  Progress-Check anchors.
- The calendar polish (greyscale done, emphasize the current lesson,
  Q1-Q4 markers, drop the cell link-icons) and the richer roster
  management are separate threads -- not in this spec.

## 5. Sequencing

W2 (the bug -- it loses student work) and W3 (verdict reliability) are
the foundation and come first; W1 (the model change) builds on a
reliable pipeline; W4 ships alongside W1. Implement via the established
loop: freeze a `*_BUILD.md` contract -> parallel Sonnet subagents +
planner-direct for the contended Desk -> Codex read-only eval ->
planner final review -> commit + push.

## 6. Open decisions (teacher)

- **D1 -- WEIGHTS.** With the worksheet scored, `w_ws : w_w : w_q`.
  Proposed default `1 : 1 : 2` (the quiz still leads; the worksheet and
  the reflections each matter). Confirm or adjust.
- **D2 -- Partial-credit blanks.** A "yellow"/partial blank scores as
  what fraction of correct? Proposed: 0.5.
- **D3 -- Correctness basis.** `Cws` over ALL the lesson's blanks (an
  unattempted blank counts 0) or over ATTEMPTED blanks only. Proposed:
  over all blanks, so the worksheet score reflects the whole worksheet.
- **D4 -- Trust.** Blank correctness is computed client-side by the
  worksheet. v1 records that verdict directly -- consistent with the
  honor-banked cap/uncap model (the Progress Check is the real check).
  A future hardening could re-score blanks server-side against a
  bundled worksheet answer key. Proposed: client-recorded for v1.

## 7. Risks

- `roster-server/lesson-grade.js` is the grade engine and is
  well-tested -- the W1 change must keep the existing roster-server
  grade tests green and add coverage for the new worksheet component.
- The W1 feeder change is a 69-worksheet rollout -- EOL-preserving
  `wire-*.mjs` script, never `git add -A`.
- Sacred: never write `curriculum_render/data/curriculum.js`.
- The grading model is the teacher's -- implement exactly to the
  confirmed D1 weights; do not improvise the model.
