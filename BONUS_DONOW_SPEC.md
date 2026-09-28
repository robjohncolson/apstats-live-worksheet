# Bonus on the Do Now — banked sheets visible where students look every day (spec, 2026-09-28)

Status: BUILT 2026-09-28 (Fable; teacher approved the spec verbally mid-grading). **Display-only** — no server change, no grade change,
no new data. Companion to `BONUS_BANK_SPEC.md` (banking) and `BONUS_HIGHER_TRACK_SPEC.md` (placement).

Teacher (2026-09-28, while hand-grading the first bonus stack): "weekly bonuses should be displayed
on the Do Now once I've graded, so students know what will help them at the end of the quarter."

## 1. What the student sees

One line inside the Do Now card, directly under the quarter grade pill, only when the student has at
least one banked bonus row for the current quarter:

```
Bonus banked: Screen Time P (+3) · Candle Tests E (+5) = +8 at quarter end
```

- Each sheet: short title, letter, points. Sheets in ledger order (oldest first).
- The sum on the right uses the same +5/+3/+1 scale the ledger already stores.
- Hover / tap title text: `Added at the end of the quarter to whichever track helps you more.`
  (the exact My Ledger footer — one sentence, one source of truth: `_walletBonusFooterText`).
- After the quarter is closed and the bonus applied, the line becomes the applied sentence the
  ledger block already uses (`Applied to your Work track — quarter grade 87.`), then disappears
  when the next quarter starts (the fetch is filtered by quarter, as today).

**Never shown:** a "your grade becomes X" number. That needs the server what-if and the placement
is decided at close time. The line says what is banked, not where it lands.

**Zero state:** nothing. No empty strip, no "no bonus yet" text. The Do Now card must not grow a
permanent row (ledger-calm rule; same reason the review chip and bulletin strip were removed).

## 2. Where the data comes from

`_walletFetchBonusReceipts()` (Desk, My Ledger) already returns the `BONUS-*` ledger rows for the
signed-in student (view-as aware, teacher token honoured). Reuse it as-is. `_walletBonusBlock` already
groups rows by sheet and current quarter; extract that grouping into a small pure helper
(`_bonusSummary(receipts, quarter) → { sheets:[{title,grade,points}], total, applied }`) and have
BOTH the ledger block and the new Do Now line render from it. No second fetch shape, no new route.

## 3. Code (Desk only, `ap_stats_roadmap_square_mode.html`)

- New host `<div id="donow-bonus" class="geneva">` after `#donow-grades` (line ~2297).
- `renderDoNowGrades` (line ~9110): after the pill renders, call `renderDoNowBonus()`; it fetches
  via `_walletFetchBonusReceipts`, renders the line or clears the host. Clear the host on every
  entry (signed-out / offline → nothing), same discipline as `#donow-helper`.
- Styling: same `geneva` 11px as the grade pill rule text; a `qpill`-style outline is NOT wanted —
  it is a sentence, not a second pill.
- Teacher's own Desk: no line (a teacher has no bonus rows). View-as: the viewed student's line.
- Tests: `tests/desk-donow-bonus.test.js` — (a) no rows → host empty and hidden; (b) two rows →
  exact text incl. the sum; (c) applied row → applied sentence; (d) rows from another quarter are
  ignored; (e) the ledger block and the Do Now line agree (same helper).

## 4. Entry dependency

Rows exist only after `node scripts/enter-bonus.mjs <file> --apply` (file kept outside the repo).
The Screen Time stack graded 2026-09-28 is the first entry; the Candle Tests sheet (bonus 3) goes
out the same day. Until entry, the line is absent by design.

## 5. Out of scope

- Any projection of the closed grade ("up to X"). Deferred with the ledger-calm "up to X" item.
- A bonus column on the teacher dashboard's Do Now / smartboard views (the Quarter Close card
  already shows Banked / Applied / Closed).
