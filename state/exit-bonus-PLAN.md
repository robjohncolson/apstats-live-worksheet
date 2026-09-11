# Part B plan

Re-read the complete revised specification. Implement only after Part A.

1. Record upstream impacts and flag computeLessonGrades as CRITICAL. Preserve Cws, completion gates and quarter cap.
2. B1: post-B max(with, without) plus E/P/I bonus, cap 105; apply consistently to no-quiz lesson track. Regenerate bundle. Add server bonus tests, stripped-exit golden against unchanged engine and real-engine simulator monotonicity properties.
3. B2: audit all section 3 consumers, fix actual 100-only assumptions, add one-line Playground explanation and root regressions. Record file:line outcomes, including Schoology writes and nudge/coach prompts.
4. Run every required suite, update affected fixture expectations only, record named environmental failures, detect_changes before each commit. Exactly two commits for this part; never push.

Blast radii: current analysis pending. computeLessonGrades is CRITICAL by task designation (server grades, Desk bundle, gradebook, Schoology and simulator). lessonGradeNoQuiz feeds computeQuarterV3 and Work track. No edits until upstream analysis is recorded. No new scoring surface.

Part B upstream analysis before edits: computeLessonGrades UID query returned 0 callers/LOW in the partial index, but git grep proves computeGrade at roster-server/grade.js:284 calls it. Retain CRITICAL risk per task (grades, Desk bundle, gradebook, Schoology, simulator). lessonGradeNoQuiz upstream: 1 direct caller lessonTrackValue, 3 upstream symbols via computeQuarterV3 and computeGrade, 0 indexed processes, graph LOW; grade-affecting path reviewed as HIGH. buildLessonsArray impact requested for additive exit metadata propagation, conditional on a graded ticket so absent-ticket public results stay byte-identical. No completion-gate or Cws edits.

Bundle path correction from repository evidence: scripts/build-grade-engine.mjs writes ROOT grade-engine.bundle.js, not roster-server/grade-engine.bundle.js (that path does not exist). Regenerate the canonical root bundle and verify parity. No builder changes needed.

B1 verification: focused server 40 passed (including 600 fixed-seed monotonicity runs); full roster-server npm test 1742 passed, 3 skipped. Four full public SY2627 stripped-ticket goldens captured from pre-bonus commit 2daef27 and pass byte comparison. No m2b expected grade changes (those ledgers contain no graded exit tickets); artifact hashes already updated in A2.

Full root npm test after bundle regeneration: 9853 passed, 27 failures. 24 are listed baseline failures; the three additional failures were derived-shadow drift because the authorized B2 HTML edits occurred during the suite. Regenerated both shadows; verify them before B1 commit and rerun stable final root suite after B2 tests are complete. Bundle parity passed.

Additional upstream inventories: buildLessonsArray is called by computeGrade (grade.js:511), hence grade-response shape is HIGH despite the incomplete graph reporting zero. It only conditionally propagates two bonus fields. New reflectionMean and blendLessonFeeders are private pure helpers called only by the two already-reviewed grade functions. No existing simulator helper changed; added one property callback.
