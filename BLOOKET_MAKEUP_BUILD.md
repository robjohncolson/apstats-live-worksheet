# Blooket = a real per-lesson grade, with a flashcard make-up (build spec)

Make the Blooket a graded daily-engagement check that an absent / non-participating student can
**make up** via the Desk flashcards. Decided with the teacher (2026-06-02).

## Confirmed design
- **Per Blooket-bearing due lesson, the student's Blooket score is:**
  1. their **real Blooket game score** (teacher CSV import) if present; ELSE
  2. their **flashcard pass** (a pass is pinned at **80%** by the 8/10 early-stop) if present; ELSE
  3. **0**.
- **Game wins**: a flashcard pass is a FALLBACK only — it never overrides a real game score (no
  "flashcard to 80% instead of trying" incentive).
- **Denominator = due lessons that HAVE a Blooket** (so a lesson with no Blooket is never an unfair
  0). "Has a Blooket" = a non-null blooket URL in `roadmap-data.json`.
- This **replaces** today's Blooket track ("mean of recorded, missing EXCLUDED, no-tank"). It now
  behaves like the lessons/quizzes tracks (denominator = due lessons, un-done = 0). It **lowers**
  grades where Blookets are due-but-undone — the teacher's explicit choice.

## Changes
1. **Blooket-presence data** (`roster-server/data/blooket-lessons.json`, generated from
   `roadmap-data.json` non-null blooket URLs → array of topicKeys). New loader in `server.js`,
   passed to the grade path. Mirrors the worksheet-blank-counts manifest.
2. **`lesson-grade.js`**:
   - `parseItemLesson`: recognize `BL-U{u}-L{l}-DESK_DONE` → `{unit, lessonKey}` (so the flashcard
     self-attest row is bucketed; it was previously dropped as `null`).
   - `computeLessonGrades`: track `acc.blooketGame` (source `'blooket'`, `BLOOKET-…`) and
     `acc.blooketFlashcard` (a `BL-…-DESK_DONE` row's score). Finalize `acc.blooket = game ?? flashcard
     ?? null` (game preferred). Still excluded from Cws/quiz (BL- fails `BLANK_ITEM_PATTERN`; source
     ≠ curriculum_quiz).
3. **`computeQuarterV3` Blooket track**: iterate due lessons ∩ `blooketLessons`; per lesson use
   `r.blooket` or **0**; `blooketAvg = sum / (count of due Blooket-bearing lessons)`.
4. **`grade.js`**: load + thread `blooketLessons` into `computeQuarterV3`.

## Non-goals / guards
- A made-up Blooket is **80%** (the early-stop pins it); never higher (you didn't play the real game).
- The `BL-…-DESK_DONE` row stays grade-inert for **Cws and the quiz track** — it ONLY feeds the
  Blooket track now.
- v3 is live (`USE_V3_GRADING=true`) — this moves real grades. Adversarial review before shipping.

## Tests
- `lesson-grade`: BL- row → `acc.blooket` = 80 when no game score; game score preferred when both;
  BL- still doesn't touch Cws/quiz.
- `computeQuarterV3`: a due Blooket-bearing lesson with no evidence → counts as 0; a lesson with NO
  Blooket → excluded from the Blooket denominator; flashcard make-up lifts a 0 to 80.
- `parseItemLesson`: `BL-U1-L1-DESK_DONE` → `{unit:1, lessonKey:'1'}`.
- Full suites green (only the 3 known pre-existing fails).
