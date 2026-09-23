# Bonus Bank — frontend (Desk ledger line + dashboard apply step)

Read `BONUS_BANK_SPEC.md` (repo root) and the backend report in
`state/bonus-bank-backend-report.md`. The server side is DONE and defines the contracts:
`POST /class/bonus`, `GET /class/quarter/deltas` (now carries `bonus` per student),
`POST /class/quarter/apply-bonus` (dryRun default true). Do not touch `roster-server/`.

Edit in place, match neighbouring style, keep functions short. Two files only:
`ap_stats_roadmap_square_mode.html` (the Desk) and `teacher-dashboard.html`, plus tests.

## 1. Desk — My Ledger shows banked bonus (student-visible)

`_walletPaint(host, receipts, loading)` paints the balance card and then the receipt
feed (`_walletReceiptRow(r)`). Receipts arrive from `gradebookClient.fetchReceipts()`
(durable ledger rows → `{src, itemId|item, sc, ts, ...}` — read `_walletReceiptRow` and
`gradebook-client.js` `fetchReceipts` for the exact field names).

Add a **"Bonus banked"** block between the balance card and the feed, painted by a new
pure-ish `_walletBonusBlock(receipts)` that returns an element or null:
- Select receipts with `src === 'bonus'`. Parse the row's JSON `response` (if the receipt
  carries it; otherwise derive the sheet from the itemId `BONUS-<sheetId>` and the grade
  from the score: 5→E, 3→P, 1→I).
- One line per sheet: `<title or sheetId> — E (+5)`.
- Footer sentence, exactly: `Applied at the end of the quarter.` — NO placement wording,
  nothing about tracks, floors or "where it helps".
- If a `src === 'bonus_applied'` receipt exists for the current quarter, the block instead
  reads `Bonus applied — quarter grade <adjustedGrade>` with the same sheet lines above it.
- System 7 look: reuse the balance-card border/box-shadow CSS; Chicago header, Geneva body,
  `textContent` only (no innerHTML with data).
- Bonus receipts must NOT count in `_walletComputePoints` (check it and exclude
  `src === 'bonus' | 'bonus_applied'`), and must not appear as ordinary feed rows (filter
  them out of the list passed to `_walletReceiptRow`).
- `ZERO_WARNING` (`_zeroWarnings`) is unaffected.

## 2. Teacher dashboard — Apply banked bonus (teacher-only)

In the "Quarter Close & Bonus" section (`#qc-*`), the deltas table is rendered by
`renderQuarterDeltas(payload)` from `GET /class/quarter/deltas`.
- Add two columns to the table: **Banked** (points, with a title attribute listing the
  sheets, e.g. "Screen Time, Two Deletions — E (+5)") and **Applied** (adjusted grade or
  "—"). Rows with bonus but no positive delta now arrive too — render them (delta cell shows
  "0" in plain colour).
- Add a button **"Apply banked bonus…"** next to "Show bonus deltas". Click →
  `POST /class/quarter/apply-bonus { quarter, section?, dryRun: true }` → render the audit
  table in a new `#qc-bonus-wrap` (columns: Student · Frozen · Banked pts · Work before →
  after · Switch? · New grade · Sheets) with a summary line ("12 students · 3 flip the
  floor · 0 already applied") and a **Confirm apply** button that repeats the call with
  `dryRun: false`, then re-runs `loadQuarterDeltas()`. Disable Confirm while in flight; show
  the server's `applied` count and any `errors`. Empty audit → "Nothing banked for Q1 in
  this section."
- Freeze must come first: if the deltas response says `frozenCount === 0`, the Apply button
  shows the hint "Freeze the quarter first." and does nothing.
- Use the existing helpers (`postJson`, `fetchJson`, `teacherSecret()`, `escHtml`,
  `studentNameHtml`, `$`). Same 503 "run migration" handling as the freeze button (the
  migration is 0036).

## Tests
- `tests/desk-bonus-bank.test.js`: run `_walletBonusBlock` in a jsdom sandbox (see
  `tests/desk-zero-warning.test.js` for the extraction pattern): E/P/I lines, the exact
  footer sentence, no placement words (`/track|floor|helps/i` must NOT appear), applied
  state, and that `_walletComputePoints` ignores bonus receipts. Source guard: the feed
  filter excludes `src === 'bonus'`.
- `tests/teacher-dashboard-bonus.test.js` (or extend an existing dashboard test): the two
  new columns render from a deltas payload with `bonus`; the audit table renders a
  `switched: true` row with a visible marker; Confirm posts `dryRun: false`.

Run `npx vitest run tests/desk-bonus-bank.test.js tests/teacher-dashboard-bonus.test.js
tests/desk-zero-warning.test.js` and paste results.

## Constraints
- Max 6 files changed. No git commits. Do NOT run `scripts/bump-build.mjs` (the
  orchestrator bumps).
- No new dependencies, no build step, no framework.
- Report: files changed, and any contract mismatch you found against the backend report.
