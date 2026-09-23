# Bonus Bank — fix package (backend) after adversarial review

Context: `BONUS_BANK_SPEC.md`, your backend report `state/bonus-bank-backend-report.md`,
and the review findings in `state/cross-agent/cd809f057862.result.json` (read it in full).
Fix the findings below in place. Do NOT touch `ap_stats_roadmap_square_mode.html` or
`teacher-dashboard.html` (the orchestrator handles the Desk view-as finding). No new
tables, no new abstraction layers, short skimmable functions. Max 10 files. No commits.

Fact that changes the blocker's fix: the daily Schoology sync runs at **component**
granularity (per-lesson columns); Schoology computes its own quarter total. The app's
closed-quarter value is what the teacher reads off the Quarter Close card and enters by
hand (the card's own hint says so). So "consumed by exports" means: (a) the Quarter Close
card and `/class/grades` must expose the closed value with the bonus applied, and (b) the
fixture's `quarter` granularity path must prefer it. Nothing else.

## Fixes

1. **Closed-quarter resolver (blocker).** In `roster-server/class.js` add one small
   function `closedQuarterGrade(snapshotRow, appliedRow)` → `{ grade, source: 'applied' |
   'frozen' }` (applied wins). Use it in `GET /class/quarter/deltas` (add `closed` per
   student: the number the teacher enters) and in `GET /class/grades`: each
   `quarters[Q]` gains additive `closedGrade` (null until frozen) and `bonusApplied`
   (null | { adjustedGrade, appliedAt }). In `tools/build_schoology_fixture.py` the
   `quarter`/`both` granularity path uses `closedGrade` when present, else
   `quarterGrade`. Add a pytest case in `tests/test_build_schoology_fixture.py`.

2. **Early-completion bonus preserved (major).** The snapshot stores only frozenGrade /
   frozenPcAvg / frozenWorkAvg; `computeQuarterV3` adds `earlyBonus` after `combineV3`.
   In the apply math recover the residual:
   `residual = max(0, frozenGrade − round1(combineV3(pc, workBefore/100) × 100))`, then
   `adjustedGrade = min(100, round1(combineV3(pc, workAfter/100) × 100 + residual))`.
   Record `residual` in the audit response as `earlyBonus`. Test: PC 50, Work 60,
   frozen 64 (+4 early), E sheet → 69. And the null-Work case gets its own test.

3. **Atomic first-writer application (major).** Add `insertLedgerRowIfAbsent(row)` to
   `roster-server/ledger-db.js` next to `insertLedgerRow` — same payload, but
   `.upsert(payload, { onConflict: 'student_id,source,item_id,attempt', ignoreDuplicates:
   true }).select('*')` — returning whether a row was inserted. `apply-bonus` uses it for
   `bonus_applied` rows and counts `applied` from actually-inserted rows only; a lost race
   is reported in `skipped` with reason `'already applied'`. Also bind the application to
   the snapshot: store `frozenAt` (the snapshot row's `frozen_at`) in the audit response,
   and in dryRun/deltas mark `applied.stale: true` when the snapshot's `frozen_at` differs
   from the recorded one (no automatic reapply — the teacher sees "stale").

4. **Redact placement details from student reads (major).** In
   `GET /ledger/student/:studentId` (`roster-server/ledger.js`), when the caller is NOT a
   verified teacher, project every `source === 'bonus_applied'` row's `response` down to
   the JSON string of `{ adjustedGrade, appliedAt }` before responding. Teacher reads keep
   the full audit. Test both.

5. **Nightly Review ignores bonus rows (major).** `roster-server/review.js`: filter
   `source === 'bonus' || 'bonus_applied'` out before sessionizing / windowing / counting in
   both queue paths (the by-student loop near line 250 and the by-item loop near line 435).
   Test: a student with only a fresh bonus row has zero unseen items.

6. **Effort points ignore bonus rows (major).** `roster-server/doge-econ.js` (and
   `backfill.js` if it is the row source): `bonus` / `bonus_applied` earn 0 effort points,
   including already-signed/backfilled rows. Test with a signed bonus receipt.

7. **Tests (minor).** In `roster-server/tests/bonus-bank.test.js` make the snapshot mock
   honour its quarter argument with quarter-tagged rows; add a Q2-bonus-vs-Q1-snapshot
   case; add the overlapping section/all-roster apply case using the new atomic insert
   (second call inserts 0); add the stale-snapshot case.

Run `cd roster-server && npx vitest run` (whole suite; the one known red test is
`misconceptions-triage` "does not count future observations", pre-existing) and
`pytest tests/test_build_schoology_fixture.py -q`. Paste results.

Report: files changed, exact new/changed response fields, and any finding you decided NOT
to fix, with the reason.
