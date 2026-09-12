# Misconceptions data-flow fixes

Baseline: master at 1cef455. Preserve all pre-existing worktree changes.

## Plan (before implementation)

1. Refresh GitNexus and inspect the extraction, worker/RPC, sweep, and regrade flows. Run upstream impact analysis before modifying existing symbols and report risk.
2. Capture baseline root/server suite results and a read-only local reproduction using real PeriodE ledger rows. Keep temporary scripts, snapshots, and logs outside state/. Never print credentials or student responses.
3. Commit 1: accept quiz and curriculum_quiz through one shared predicate; cover curriculum_quiz extraction in tests. Include this plan.
4. Commit 2: locate the actual FRQ detail-stripping layer, preserve rubric elements through worker and sweep persistence, and add weak score-only fallback events excluded from class persistence. Add focused regression tests and a migration only if the RPC requires one.
5. Commit 3: implement explicit feedback backfill selection and feedbackOnly storage that cannot change the score of record, retain retry/rate limiting, and add a manual workflow input. Test lower and higher grader scores and both server branches.
6. Before each commit run focused tests, review the staged diff, and run GitNexus detect_changes. After implementation run roster-server npm test and root npm test; compare failure names to baseline. Run before/after extraction over the same real-row snapshot and report rows, events by source, class-persistent count, and evidence keys.
7. Print a plain-text report with three commit hashes, actual stripping location, suite results and unchanged baseline failure names, reproduction numbers, any teacher-applied migration, and unmet requirements.

## Constraints

- Never push, apply a live migration, or execute the feedback backfill live.
- Live data access is read-only using roster-server/.env; only aggregate reproduction results are reported.
- No scratch directories under state/.
- Exactly three defect commits; stage only this task's changes.
