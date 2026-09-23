# Review: Bonus Bank (backend + frontend) — read-only adversarial review

Spec: `BONUS_BANK_SPEC.md`. Backend contract: `state/bonus-bank-backend-report.md`.
Review the UNCOMMITTED working-tree changes (`git diff` + the new untracked files):

- roster-server/class.js, grade.js, lesson-grade.js, mastery.js, rollup.js, ledger.js
- roster-server/migrations/0036_item_ledger_bonus_source.sql
- roster-server/tests/bonus-bank.test.js
- scripts/enter-bonus.mjs, tests/enter-bonus.test.js
- ap_stats_roadmap_square_mode.html (search `_walletBonusBlock`, `_walletFetchBonusReceipts`)
- teacher-dashboard.html (search `apply-bonus`, `renderQuarterBonus`, `runQuarterBonus`)
- tests/desk-bonus-bank.test.js, tests/teacher-dashboard-bonus.test.js

Do NOT edit anything. Report findings only, ranked by severity, each with file:line, the
concrete failure scenario, and the smallest fix. Check specifically:

1. **PC is never touched.** Trace every path in apply-bonus: points reach Work only.
2. **Engine inertness is complete.** Are there any other consumers of ledger rows
   (gradebook-grid.js, donow.js, review.js, receipts.js, misconceptions, worksheet
   diagnostics, `/class/grades`, `/grade`, offline pack, mesh/QR sync) that would count,
   display as a lesson, or choke on `source: 'bonus'` / `'bonus_applied'` rows or on the
   `BONUS-…` item ids? Non-numeric-looking item ids going through regexes, JSON `response`
   strings being parsed as answers, etc.
3. **Security.** Can a student write or read another student's bonus rows? Check the 403
   guard in `/ledger/record`, `requireTeacher` on the three routes, and the Desk's
   `_walletFetchBonusReceipts` (`GET /ledger/student/:id?prefix=BONUS-`): self-only, and
   what happens in view-as mode.
4. **Idempotence and races.** Apply twice; apply after a student is un-frozen; apply with
   `section` vs without; a student in both a positive-delta row and a bonus row.
5. **Numeric coercion.** PostgREST numerics arrive as strings; null `frozen_work_avg`
   becomes 0 — is that the right behaviour for a frozen student with no Work track?
6. **Student wording.** The Desk block must contain no placement wording (track/floor/
   "where it helps"). Footer must be exactly `Applied at the end of the quarter.`
7. **Dashboard flow.** Stale preview after quarter/section change; Confirm disabled while
   in flight; 503 migration hint; `frozenCount === 0` gating.
8. **Tests.** Anything the new tests claim but do not actually assert.

Output a JSON array of findings `{severity: 'blocker'|'major'|'minor', file, line, issue,
scenario, fix}` followed by a one-paragraph verdict: SHIP / FIX-FIRST.
