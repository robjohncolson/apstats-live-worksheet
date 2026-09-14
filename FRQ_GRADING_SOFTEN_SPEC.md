# FRQ grading: softer bar, kinder band, provisional floor (2026-09-14)

Students (two named, more implied) said the follow-along free-response grading was
too harsh, and that finishing the reflections LOWERED a grade that read 100 after
the blanks. The teacher agreed. Three changes, shipped together.

## 1. Re-band: P 70 → 85, I 35 → 60

`roster-server/grade-config.js` `frqBand`. The ledger stores E/P/I as 1 / 0.5 / 0
and the band is applied at rollup, so every already-graded lesson re-tunes with no
data edit. Nothing can go down (I is still the minimum; Schoology best-wins holds).

| Blanks | Reflections | Old | New |
|---|---|---|---|
| 100 | E, E | 100 | 100 |
| 100 | P, P | 80 | 90 |
| 100 | P, I | 68 | 81.7 |
| 100 | I, I | 57 | 73.3 |

## 2. Softer grading standard in every reflection prompt

`scripts/wire-frq-grading-standard.mjs` (idempotent) rewrote the 72 follow-along
`ai-grading-prompts*.js` files: the "REQUIRED ELEMENTS (must address for E)"
heading became "KEY ELEMENTS (what a complete answer usually covers)", and a
GRADING STANDARD block now precedes the grade instruction:

- E: central idea correct, most key elements in the student's own words; do not
  withhold E for a missing specific number, optional element, or informal wording.
- P: on the right track with one real gap or one substantive error.
- I: main idea wrong/missing, off-topic, or essentially blank.
- Torn between two scores → the higher one.

The server-side grader reads the committed bundle built from these files, so
`node scripts/build-frq-rubrics.mjs` was re-run (`roster-server/data/frq-rubrics.SY2627.json`).
`tests/frq-grading-standard.test.js` guards the wiring.

**Re-sweep:** `node tools/regrade-ungraded-frqs.mjs --regrade-low --apply` re-sends
every already-graded P/I row through the grader under the new standard. The
server's FRQ floor means it can only raise.

**Run 2026-09-14:** 199 low verdicts re-sent; 88 raised, 111 held (0 failed). The
standard is softer, not a rubber stamp.

## 3. Provisional reflection floor (the "100 then it dropped" bug)

The lesson blend (blanks : reflections = 1 : 2) renormalized over whichever feeders
existed, so a blanks-only lesson reported the blanks alone (100). Grading the
reflections then added a 2x-weight feeder and the number fell.

Now, for a worksheet whose EARLIEST blank was recorded on/after
`frqProvisionalFloorSince` (`2026-09-15`), an ungraded reflection feeder counts
as the I band and the lesson carries `frqProvisional: true`. Blanks-only reads
73.3 and grading can only raise it. Lessons started before the cutoff keep the
old behavior, so nothing already reported drops (teacher: "scores already at
100 are fine, let's look forward").

Surfaces: `/grade` `lessons[]` gains `frqProvisional` (only when true); the Desk
worksheet chip appends "(reflections not graded yet)" and explains it in the
tooltip; the in-app gradebook and Schoology Follow-Along cell get the same number
through `lessonGradeNoQuiz`.

`roster-server/lesson-grade.js`: `provisionalFrqFloor`, `reflectionMean(items, floor)`,
`lessonGradeNoQuiz` honors `result.frqFloor`. Tests: "provisional reflection floor"
block in `roster-server/tests/lesson-grade.test.js`. `grade-engine.bundle.js` regenerated.
