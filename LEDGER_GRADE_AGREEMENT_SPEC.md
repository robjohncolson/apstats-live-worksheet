# Ledger balance card agrees with the Do Now — spec (2026-09-27)

Teacher: "I notice discontinuity between the yellow of the Do Now (when the student has work to do
before the zeros hit) and the fact that if I hit the Do Now, the ledger appears and the grade shows
in a green box, which makes me wonder: which is it? Am I fine or not? (To be clear, I am not fine,
I have not done the work. I should be seeing yellow and an explanation of why the grade I see will
drop soon, in the ledger.)"

Follow-up to `LEDGER_CALM_SPEC.md` (§1 Do Now colour, §2.2 status line). Student-facing,
display-only: no grade, ledger, Schoology, roster-server change. File: `ap_stats_roadmap_square_mode.html`.

## 0. Why the two surfaces disagree today

| Surface | Oracle | Meaning |
|---|---|---|
| Do Now card tint (yellow / red) | `_zeroCurrentWarnings()` → `_donowApplyZeroState()` | "a 0 is coming / counting" |
| My Ledger balance card tint + big grade colour | `WalletLogic.walletReadiness(quarter)` hue (40% floor × lessons graded ÷ lessons due) | "are you above the floor and mostly caught up" |
| The big number | engine `quarterGrade` | counts a missing lesson as 0 only once its `zeroDate` has passed |

A student above the floor with most lessons done gets hue ≈ 100–120 (green) and a true-but-temporary
94%, directly under a yellow Missing-work card that says "3 items below become a 0 by Tue 9/29".
Both statements are true. The green box shouts louder. Fix: make the balance card carry the SAME
zero state as the Do Now, and say in one sentence that the number will drop.

## 1. Vocabulary
- `warns` = `_zeroCurrentWarnings()` rows `{ lessonKey, kind, zeroDate, daysLeft, past }` (LEDGER_CALM_SPEC §0).
- `soon` = warns with `past === false`; `now` = warns with `past === true`.
- Day text = `_zeroDayText(iso)` → `Tue 9/29`.
- **Earliest soon day** = the SMALLEST `zeroDate` among `soon` (new pure helper `_zeroEarliestSoonDay(warns)`,
  sibling of `_zeroLatestSoonDay`). The grade first drops on the earliest date, so "drops on" must
  use it; the Do Now pill's "by <day>" keeps using the latest (unchanged).

## 2. Balance card tint follows the zero state

In `_walletPaint`, immediately after the readiness hue block that sets `card.style.backgroundColor`
/ `card.style.borderColor` (and regardless of whether that block ran):

```
var warns = (typeof _zeroCurrentWarnings === 'function') ? _zeroCurrentWarnings() : [];
_walletApplyZeroTint(card, warns);      // new
```

`_walletApplyZeroTint(card, warns)` (new, never throws):
- `warns.length === 0` → remove classes `wallet-zeros-soon` / `wallet-zeros-now`, do nothing else
  (the readiness hue stays).
- any `past` → add class `wallet-zeros-now`, set inline `backgroundColor = '#f7c9c9'`, `borderColor = '#cc0000'`.
- otherwise → add class `wallet-zeros-soon`, set inline `backgroundColor = '#fff3b0'`, `borderColor = '#d9b400'`.

These are the exact values of `#donow-card.donow-zeros-soon` / `.donow-zeros-now` (CSS ~line 2242).
Inline is required: the balance card's colours are inline today, so a class rule alone would lose.
Add the classes anyway so tests and future CSS can hook them. Put the two colour pairs in one
Desk-level constant `ZERO_TINT = { soon: { bg, border }, now: { bg, border } }` and use it here; do
NOT change the Do Now CSS (a test pins the two equal — §5).

Also `_walletApplyWindowReadiness(readiness)`: after its existing hue write, if `warns.length`,
set `win.style.backgroundColor` to `#fff9db` (soon) or `#fff3f3` (now) — the same light tints the
Missing-work rows use (`.wz-row` backgrounds, LEDGER_CALM_SPEC §2.3). Compute `warns` inside via the
same `typeof` guard; keep the signature.

## 3. The big grade stops looking settled

Same block in `_walletPaint`, only when `warns.length > 0`:
- `gradeBig.style.color` → `#7a5c00` (soon) or `#a30000` (now). Readable on the tinted card; NOT the
  card background colour itself (yellow on yellow is unreadable).
- `gradeLbl.textContent` → `'Grade today'` (was `'Grade'`). Unchanged when no warns.
- Append directly after `gradeRow` (before the effort block) a `div.wallet-grade-drop.geneva`,
  `font-size:11px; line-height:1.35; margin-top:4px; color:#000; font-weight:bold`, text from the
  pure helper `_walletGradeDropText(warns)`:

| warns | text |
|---|---|
| soon only, 1 item | `This number drops on Tue 9/29 unless the 1 item above is finished. Finished work counts the same day.` |
| soon only, N items | `This number starts dropping on Mon 9/28 unless the 3 items above are finished. Finished work counts the same day.` |
| now only, N zeros | `This number already includes 2 zeros. Finish the 2 items above and it goes back up the same day.` (1 → `1 zero`, `the 1 item above`) |
| mixed | `This number already includes 1 zero and starts dropping again on Tue 9/29 unless the 2 more items above are finished. Finished work counts the same day.` (`drops again` when exactly 1 soon item) |

- "above" is literal: `_walletPrependZeroCard` inserts the Missing-work card as `host.firstChild`,
  so it sits ABOVE the balance card. Do not move either card.
- Day in the soon cases = **earliest** soon day (§1). Counts = `soon.length` / `now.length`.
- The status line in the Missing-work card (`_zeroStatusText`) is unchanged; the two sentences are
  meant to be read together: status = what is owed, drop line = what it does to the number.
- No projected "drops to X" number (LEDGER_CALM_SPEC §6 still stands; never approximate client-side).

## 4. Out of scope (do not touch)
`_zeroWarnings`, `_zeroCurrentWarnings`, `_zeroStatusText`, `_zeroLatestSoonDay`, the Do Now painter
and CSS, `WalletLogic.walletReadiness`, `_walletCurrentGrade`, teacher surfaces, roster-server, slips,
`lib/*`. ES5 only in the Desk (`var`, `function`; no arrows / `let` / template literals). LF endings.

## 5. Tests — `tests/desk-ledger-grade-agreement.test.js` (new)
Use the `fnSrc` + `vm` sandbox pattern from `tests/desk-ledger-calm.test.js` (it already sandboxes
`_walletPaint`; copy its stub set and add `_zeroCurrentWarnings`, `_zeroDayText`, `_zeroEarliestSoonDay`,
`_walletGradeDropText`, `_walletApplyZeroTint`, `ZERO_TINT`). Fixtures: reuse the calm test's
`PAST_WS`, `PAST_QZ`, `SOON_BL` (9/26), `SOON_WS` (9/27) and add `SOON_LATE` (`2026-09-29`).

1. `_zeroEarliestSoonDay([SOON_LATE, SOON_WS, PAST_WS])` → `Sun 9/27`; all past → `''`.
2. `_walletGradeDropText` — all four rows of the §3 table, text verbatim, including the 1-item forms.
3. `_walletPaint` with warns = `[SOON_WS, SOON_LATE]`: balance card has class `wallet-zeros-soon`,
   inline background `rgb(255, 243, 176)` (jsdom normalises hex → rgb; compare via
   `card.style.backgroundColor`), label text `Grade today`, `.wallet-grade-drop` text = the
   N-soon sentence with `Sun 9/27`, big grade colour `rgb(122, 92, 0)`.
4. `_walletPaint` with warns = `[PAST_WS]`: class `wallet-zeros-now`, red pair, drop text = the
   now-only 1-zero sentence.
5. `_walletPaint` with warns = `[]`: neither class, label `Grade`, no `.wallet-grade-drop`, and the
   readiness hue (stub `_walletDisplayReadiness` → `{ state:'eligible', hue: 110 }`) still paints
   `hsl(110, 60%, 88%)` — the green path is untouched when nothing is owed.
6. Colour parity pin: regex the Desk CSS for `#donow-card.donow-zeros-soon{background:<X> !important;border-color:<Y>` and
   `.donow-zeros-now{…}`; assert `ZERO_TINT.soon.bg === X`, `.border === Y`, same for `now`. Change
   one side and this fails on purpose.
7. `_walletApplyWindowReadiness` with warns → window `backgroundColor` `rgb(255, 249, 219)` (soon) /
   `rgb(255, 243, 243)` (now); without warns → the hue value as today.

Do not weaken any existing pin. Existing tests that assert the label text `Grade` or count
`card.children` in `_walletPaint` (grep `'Grade'` and `wallet-see-class` in `tests/desk-ledger-calm.test.js`,
`tests/desk-wallet-render.test.js`, `tests/student-wallet.test.js`) must still pass with `warns = []`
stubs; if a sandbox lacks `_zeroCurrentWarnings`, the `typeof` guard makes it a no-op — verify, do
not add stubs to old tests unless one actually fails.

## 6. Acceptance
- `npx vitest run tests/desk-ledger-grade-agreement.test.js tests/desk-ledger-calm.test.js tests/desk-donow-zero-state.test.js tests/desk-zero-warning.test.js tests/desk-wallet-render.test.js tests/student-wallet.test.js tests/desk-donow-ledger.test.js` green.
- Then `npx vitest run tests/` and report the failing FILE list verbatim; the orchestrator diffs it
  against the known Windows baseline (`reference_windows_root_test_failures`: ~18 pre-existing
  failing files). Do not fix unrelated failures.
- No commit, no build bump, LF endings. Report: files changed, new function names, the vitest
  summaries verbatim, and any spec deviation with the reason.
