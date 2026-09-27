# Calm ledger — spec (2026-09-26)

Teacher, after a fresh-eyes review: "it's overwhelming. I love the graphs as a teaching experience
but the kids just want to see the data … the Do Now colour needs to reflect incoming zeroes so
it's not a shock … clean up the buttons and everything from the ledger display … the graphs can be
a special button off to the side … take away the 5-number summary from student view, only expose
it in the graphs section (hidden behind a button) … keep all this for the teacher's view."
Keep: the yellow tentative peer 0s and the red "this is you" 0 ("very effective").

Student-facing only. **Teacher view (Desk Snapshot app for teachers, teacher-workspace Class tab)
is unchanged.** Display-only: no grade, ledger, Schoology, roster-server change.

The student's three questions, in order: *Am I in trouble? What exactly do I owe? How do I fix it
fastest?* Everything else moves one tap away.

## 0. Vocabulary
- `warns` = `_zeroCurrentWarnings()` (Desk): rows `{ lessonKey, kind: worksheet|quiz|blooket, zeroDate, daysLeft, past }`.
  `past` = already a real 0 (counting). Not past = tentative, becomes a 0 on `zeroDate`.
- "By <day>": the LATEST `zeroDate` among the not-past warns, formatted like `_zeroWhenText` does
  (weekday + M/D, e.g. `Sun 9/27`).

## 1. Do Now card colour reflects incoming zeros

File: `ap_stats_roadmap_square_mode.html`. The card is `#donow-card`; its base class is set as
`card.className = 'donow-' + mode` (~line 9623) and its grade pills live in `#donow-grades`,
maintained by `_updateDoNowMissingPill()` (~line 15638), which today appends a `qpill-missing`
pill reading `⚠ N missing`.

### 1.1 State classes (additive; never touch the base `donow-*` mode class)
Add a function `_donowApplyZeroState()` that computes from `warns`:
- none → remove `donow-zeros-soon` and `donow-zeros-now`.
- some, none past → `donow-zeros-soon` (yellow).
- any past → `donow-zeros-now` (red).
Call it (a) at the end of `_updateDoNowMissingPill()`, and (b) right after the `card.className = 'donow-' + mode`
assignment so a mode repaint never drops the state. Guard both with `typeof`.

CSS (System-7 palette, keep the existing border/inset look):
```
#donow-card.donow-zeros-soon { background: #fff3b0; }
#donow-card.donow-zeros-now  { background: #f7c9c9; }
#donow-card.donow-done.donow-zeros-soon, #donow-card.donow-done.donow-zeros-now { /* zero state wins over the green "done" tint */ }
```
`donow-signin` (not signed in) shows no zero state (there are no warns then anyway).

### 1.2 Pill text
Replace `⚠ N missing` with plain words, no icon:
- only tentative: `2 become a 0 by Sun 9/27`
- only past: `1 is a 0 now`
- both: `1 is a 0 now · 2 more by Sun 9/27`
Singular/plural: `1 becomes a 0 by …`, `2 become a 0 by …`, `1 is a 0 now`, `2 are 0s now`.
Pill colour classes: add `qpill-soon` / `qpill-now` alongside `qpill-missing` (yellow / red text
or background to match the card). Click behaviour unchanged (opens the ledger). Title: `Tap to see what to finish`.

### 1.3 Tests — `tests/desk-donow-zero-state.test.js` (new)
Extract `_donowApplyZeroState`, `_updateDoNowMissingPill`, `_zeroCountText` (if still used),
`_zeroWhenText` via the `fnSrc` pattern used in `tests/desk-class-snapshot-assignments.test.js`;
stub `_zeroCurrentWarnings` to return each of the four cases; assert classes on `#donow-card`
and the exact pill text; assert a subsequent `card.className = 'donow-done'` followed by
`_donowApplyZeroState()` restores the state class.

## 2. My Ledger (student) — a short list

Ledger paint chain today (`openWallet` → `_walletPaint(host, receipts, loading)` then
`_walletPrependZeroCard(host)` then `_walletPrependSnapshot(host)`; ~lines 18219–18232 and 15108–15109).

### 2.1 Remove from the student ledger
- **Stop calling `_walletPrependSnapshot(host)` from the ledger** (all call sites in the ledger
  paint chain). Keep the function: the Snapshot app still uses it for the student Class tab
  (`_renderSnapshotApp` → `_walletPrependSnapshot(host)` ~line 15807). Update any test that pins
  the ledger call chain (grep `_walletPrependSnapshot` in `tests/`).
- In `_walletPrependZeroCard`: delete the explanatory paragraph (`Each of these is a 0 …`), the
  `Already a 0` / `Becomes a 0 soon` `<h5>` headings, and the per-row `see the class` button.
  Colour carries the meaning (below).

### 2.2 Add: the status line (top of the Missing-work card)
Replace the `⚠ Missing work` heading with a one-line status, class `wz-status geneva`:
- `Q1 so far: 78.1. The 3 items below count as 0 — finishing them is the fastest way up.`
- If nothing is past yet: `Q1 so far: 78.1. 3 items below become a 0 by Sun 9/27 — finish them first.`
- Grade source: `_walletCurrentGrade()` (already used by `_walletPaint`; it returns `{ q, grade }`-like
  data — read its shape and use the same number/format the balance card shows). If no grade yet,
  omit the `Q1 so far` clause.
- **Do NOT print a projected "up to X" number.** The quarter engine (two-track v3) is server-side;
  a client re-implementation is out of scope for this pass (see §6).

### 2.3 Rows
One row per warn, in the existing order (past first, then by date):
`[action button] [lesson label] …………… [date]`
- Action button (`s7btn`): `Open` / `Quiz` / `Flashcards` — the VERB only; the lesson label
  (`cedLabel(lessonKey).text`) is a separate `span.wz-label` so the button stays short.
- Date `span.wz-when`: past → `0 since Sun 9/20`; tentative → `0 after Sun 9/27` (reuse `_zeroWhenText`
  if it already produces this; otherwise adjust it — check its tests first).
- Row colour: `.wz-row.wz-past { border-left: 3px solid #cc0000; background: #fff3f3; }`
  `.wz-row:not(.wz-past) { border-left: 3px solid #d9b400; background: #fff9db; }`
- A tiny text link at the far right, `button.wz-see` → text `class`, `font-size:9px`, `title="How the class did on this one (no names)"`,
  `onclick → _snapOpenAssignment(lessonKey, kind)`. (This is the per-row curiosity link; the big
  button is §3.1.)

### 2.4 Balance card header: the graphs button
In `_walletPaint`, in the `who` row (the small `Your ledger … Q1` line at the top of the balance
card), add on the right a `button.s7btn.wallet-see-class` with text `See the class` (font-size 10px),
`onclick → openSnapshot()` (guard `typeof`). This is the ONE way to the graphs from the ledger,
besides the per-row `class` links. Hide it for teachers (`_deskIsTeacher()` true) — teachers have the
desktop icon and the ledger card is hidden for them anyway.

### 2.5 Tests — `tests/desk-ledger-calm.test.js` (new) + update existing
- `_walletPrependZeroCard`: no `h5`, no paragraph, status line text for both cases (stub
  `_walletCurrentGrade`), row structure (`button` text is the verb only, `.wz-label` holds the
  lesson text, `.wz-when` text, `.wz-see` present and calls `_snapOpenAssignment` with `(lessonKey, kind)`),
  `data-sig` guard still skips a repaint when the list is unchanged.
- `_walletPaint`: `.wallet-see-class` present for a student and absent for a teacher; clicking calls `openSnapshot`.
- Existing tests that pin the old paragraph / headings / `see the class` text (grep `see the class`,
  `Becomes a 0 soon`, `Missing work` in `tests/`) — update to the new contract; do not delete coverage.

## 3. Snapshot app (student): data first, graphs behind a tab

File: `ap_stats_roadmap_square_mode.html`, `_renderSnapshotApp` (~line 15790+) and
`_renderAssignmentsView` / `_snapAssignmentRow`.

### 3.1 Student tabs
Today: `Class | Assignments`. For students (not teachers) the tabs become:
`My work | Graphs`  (order matters: **My work is the default**).
- **My work** = the Assignments view in **data mode**: for each row (focused view + Prev/Next/Show all
  exactly as today) show the title, the date line, the **score list** (`.snap-alist`, always open,
  with the yellow tentative chips and the red "you" chip exactly as shipped), and the **advice line**.
  Hide: the canvas plot, the caption (`Median … IQR … zeros …`, i.e. the five-number summary), the
  form bar (`.snap-amodes`), the legend. Keep the `show all scores` toggle removed (list always open
  in data mode). Keep the all-clear line (§ focus rule) as is.
- **Graphs** = today's `Class` view (quarter "Where you stand" plot with its own mode tabs) stacked
  above today's Assignments view in **graph mode** (plot + caption + form bar + legend, list collapsed
  as today). Nothing is deleted; it is one tab away.
- Implementation: `_snapApp.view` values for students: `'work'` (default) and `'graphs'`; add a
  render flag `_snapApp.dataOnly = (view === 'work')` that `_snapAssignmentRow` reads (or pass an
  options object) to skip canvas/caption/legend and force the list open. `_snapOpenAssignment`
  (from a ledger row) sets `view = 'work'` for students.
- Teacher: tabs and content **unchanged** (`Class | Assignments`, plots, captions, statistics).

### 3.2 Tests — `tests/desk-class-snapshot-assignments.test.js` (extend) and `tests/desk-class-snapshot.test.js`
- Student default view is `work`; tab labels `['My work', 'Graphs']`; in `work` a row has
  `.snap-alist` (not hidden), `.snap-advice`, and NO `canvas`, NO `.snap-caption`, NO `.snap-amodes`,
  NO `.snap-legend`; in `graphs` all of those are present again.
- Teacher tabs remain `['Class', 'Assignments']` (pin) and teacher rows keep canvas + caption.
- `_snapOpenAssignment` for a student sets `view: 'work'` and the focus key.
- Tentative yellow / red "you" chips still asserted in data mode (reuse the W14 fixture).

## 4. Out of scope (do not touch)
`_zeroWarnings`, the zero-date rule, roster-server, teacher-workspace.js, the Schoology sync, slips,
`lib/class-snapshot.js` (no library change is needed for this pass), the Desk grade pill's number.

## 5. Acceptance
- `npx vitest run tests/desk-donow-zero-state.test.js tests/desk-ledger-calm.test.js tests/desk-class-snapshot-assignments.test.js tests/desk-class-snapshot.test.js tests/desk-donow*.test.js tests/desk-*wallet*.test.js tests/desk-*zero*.test.js tests/desk-*missing*.test.js` green (run whichever of those globs exist; list what you ran).
- Then `npx vitest run tests/` and report the failure list against the known baseline in
  `reference_windows_root_test_failures` terms: the orchestrator will diff it; do not "fix" unrelated failures.
- LF endings; no build bump, no shadow regen, no commit — the orchestrator releases.

## 6. Follow-up (NOT in this pass): "up to X"
The status line was designed to read `Fix the three below and it is up to 91.` That needs a
what-if from the quarter engine (`computeQuarterV3` with the missing items filled at full credit
for DUE lessons only). Options: a `GET /grade?whatIf=fill-missing` server field (touches
roster-server, needs the grade-engine bundle regen + root suite) or the local `GradeEngine` with
synthetic rows. Decide separately; do not approximate it client-side.

## 7. Follow-up SHIPPED separately
The balance card now carries the same yellow/red zero state as the Do Now and says the number will drop: `LEDGER_GRADE_AGREEMENT_SPEC.md` (2026-09-27).
