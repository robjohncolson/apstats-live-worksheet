# FRQ rubric transparency

1. Inspect all 69 root live worksheets and their prompt exports; run GitNexus impact checks and verify inline callers where the index has no coverage.
2. Add a guarded, idempotent codemod: runtime rubric targets, DOM-only verdict checklists, saved-answer checklists, and minimal styles. Preserve grading and appeals.
3. Test real worksheet rendering, rubric parity, failure guards, and idempotence; run focused tests and the root suite and investigate new failures.
4. Verify task-only scope and LF bytes, run detect_changes, and make one commit on master. Never push.

## Verification

- Dry run and apply: 69/69; second real run: 0 changes. All 75 task files are LF.
- Requested three suites: 50 passed. Final expanded focused run: 821 passed; both grading-prompts suites also pass in the root run.
- Root: 300 files passed, 18 failed, 1 skipped; 9,737 tests passed, 26 failed, 13 skipped, 1 asynchronous error.
- Additional timing failures in journeys/harness.smoke, journeys/j1-signin-donow, and journeys/j6-review-mode pass on an isolated rerun. The ced2026-surfaces asynchronous flashcard error persists; that suite reads no changed source files. Its assertions pass.
- GitNexus staged detect_changes: 75 files, low risk; inline symbols are not indexed. AST comparison confirms only the two verdict renderers, saved-note helper, and restore caller changed; grading methods and prompts remain identical.
- Updated two old note-text assertions and one restore-signature assertion. No UI component assertions changed.
