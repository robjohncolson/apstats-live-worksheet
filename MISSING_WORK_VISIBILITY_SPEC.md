# Missing-Work Visibility — spec (2026-09-25)

Teacher request (2026-09-25): a Period E student saw new Schoology zeros drop her grade and asked
"what am I missing?" The teacher had to dig through the teacher workspace to answer. The student
should be able to see this herself, in one tap, at all times. Separately: the teacher could not
find where student messages live in the teacher workspace.

Four deliverables. All display-only. **No grade math changes. No roster-server changes.**

## Root cause found

`ap_stats_roadmap_square_mode.html` (the Desk) already has ZERO_WARNING: `_zeroWarnings()` lists
lessons with no worksheet work whose `zeroDate[cP]` is within 3 days or already past, paints a red
badge on the My Ledger desktop icon (`_updateZeroWarningBadge`) and prepends an "About to become a 0"
card in the ledger window (`_walletPrependZeroCard`).

But its "has work" test is

```js
var hasWork = L.lessonGradeNoQuiz != null || L.Cws != null || L.lessonGrade != null;
```

while the Schoology sync (`tools/schoology_components.py`, Follow-Along column) zeroes on
`lessonGradeNoQuiz` (fallback `Cws`) only. `lessonGrade` includes the quiz, so a student who took the
quiz but never opened the worksheet has `lessonGrade` non-null → the Desk stays silent while Schoology
writes a 0. That is exactly the student's case (1.2: quiz 3/3, flashcards done, worksheet untouched).

## D1 — Desk zero list uses the same truth as the sync

File: `ap_stats_roadmap_square_mode.html`, function `_zeroWarnings`.

- Change `hasWork` to `L.lessonGradeNoQuiz != null || L.Cws != null`. Drop the `lessonGrade` clause.
- Nothing else in the function changes. Keep the function name, signature and pure shape (tests pin
  it via `fnSrc('_zeroWarnings')`).

Test (`tests/desk-zero-warning.test.js`): add a lesson to `LESSONS` such as
`{ lessonKey: '1.5', zeroDate: { B: '2026-09-20', E: '2026-09-21' }, lessonGrade: 100, lessonGradeNoQuiz: null, Cws: null }`
(quiz-only, already past) and assert it IS warned with `past: true`, kind `worksheet`. Also assert a
lesson with `Cws` set but `lessonGradeNoQuiz` null is NOT warned (unchanged behaviour).

## D2 — The ledger card is "Missing work", grouped, uncapped

File: `ap_stats_roadmap_square_mode.html`, function `_walletPrependZeroCard` (keep the name — tests
pin it). Current behaviour: heading "⚠ About to become a 0", one flat list, `warns.slice(0, 6)`.

New behaviour:

- Heading: `⚠ Missing work` (keep the ⚠ so the existing test's heading match can be updated in one
  place).
- Intro paragraph (replace the current one): "Each of these is a 0 in your grade and on Schoology
  once its date passes. All of them are still open — finish one and the 0 is replaced. Flashcard
  decks count as your Blooket grade."
- Two groups, each with a small sub-heading, rendered only when non-empty, in this order:
  1. `Already a 0` — warnings with `past === true`.
  2. `Becomes a 0 soon` — warnings with `past === false`.
- No cap. Render every warning.
- Rows keep the existing structure and buttons: `Open Topic X` → `_zeroOpenLesson`, `Flashcards
  Topic X` → `_zeroOpenFlashcards`, and the `_zeroWhenText` timing span. Do not change
  `_zeroWhenText` strings (tests pin them).
- Keep the card first in the ledger window (it is prepended after every `_walletPaint`).

Badge/icon (`_updateZeroWarningBadge`): change only the title/aria text from "about to become a 0"
to "missing — open My Ledger" e.g. `2 worksheets and 1 flashcard deck missing — open My Ledger`.
Keep `_zeroCountText` as is.

Tests: update the heading/intro expectations; add a case with two past + one upcoming warning and
assert both group sub-headings render, in order, with the right rows under each; add a case with 8
warnings and assert 8 rows render (no cap).

## D3 — Reachable in one tap from where students look

Two entry points, both reusing `_zeroCurrentWarnings()`. Neither touches gating
(`_isLessonComplete`, `_isLessonUnlocked`) or grade math.

### D3a — Do Now card: a "missing" pill next to the quarter grade pill

File: `ap_stats_roadmap_square_mode.html`, function `renderDoNowGrades` (the block that builds the
`.qpill` for the current quarter, ~line 8990).

- After the quarter pill is appended, call `_zeroCurrentWarnings()`. If non-empty, append a second
  pill: `<span class="qpill qpill-missing" role="button" tabindex="0">⚠ N missing</span>` where
  N = `warns.length`. Title = `_zeroCountText(warns) + ' — click to see what to finish'`.
- Click and Enter/Space → `openWallet()` (the existing My Ledger opener; the card is at the top).
- CSS next to the existing `#donow-grades .qpill` rules: red border/text using the existing error
  colour token if one exists (grep `--err` / `--danger` / the colour used by `.wallet-zero-badge`),
  white background, cursor pointer. Respect `prefers-reduced-motion`; no animation needed.
- This is a pill inside the existing `#donow-grades` row, NOT a new strip on the Do Now card (the
  teacher has ruled out new strips there — see the bulletin memory).
- `renderDoNowGrades` runs before `_gradeLessonsCache` may be set on first paint; if
  `_zeroCurrentWarnings()` returns `[]` render nothing. The existing repaint path after
  `_gradeLessonsCache` is set already calls `_updateZeroWarningBadge`; add a call there that
  re-renders the pill if needed (simplest: a small `_updateDoNowMissingPill()` that finds
  `#donow-grades` and adds/removes the pill, invoked from the same place as
  `_updateZeroWarningBadge`).

### D3b — Calendar tiles: a red corner mark on already-zero lessons

File: `ap_stats_roadmap_square_mode.html`, function `paintLocalDoneCells` (~line 8123).

- Build `var zeroTopics = {}` from `_zeroCurrentWarnings().filter(w => w.past)` keyed by
  `lessonKey`.
- In the per-cell loop, add `'dc-zero'` to the `classList.remove(...)` list, then after the
  done/partial classes: `if (zeroTopics[topic]) c.classList.add('dc-zero')`.
- Topic keys on cells can be combined ("1.2+1.3") — also mark when ANY member of
  `topic.split('+')` is in `zeroTopics`.
- CSS: `.dc.dc-zero::after` a small red square/dot in the top-right corner (System-7 flavour: 6px
  square, 1px black border, red fill). Never overrides `.dc-localdone` greying; a tile can be both.
  Title: append ` — missing work (already a 0)` to the cell's existing tooltip text if one is set
  via `title`, else set it.

Tests: `tests/desk-zero-warning.test.js` (or a new `tests/desk-missing-work.test.js` using the same
`fnSrc` sandbox pattern): assert the pill renders with the right count and opens the wallet (stub
`openWallet`), and that `paintLocalDoneCells` adds `dc-zero` to a past-zero cell and not to an
upcoming one. Keep tests free of pixel coordinates.

## D4 — Teacher workspace: a Messages tab

Files: `teacher-workspace.js` (+ `teacher-workspace.css`), tests `tests/teacher-workspace.test.js`,
`tests/teacher-inbox.test.js`.

Today the inbox strip (`#inbox-strip`, rendered by `renderStudentInbox` in `teacher-dashboard.html`)
is moved into the "Needs attention" pane, and the nav shows a non-interactive `N student message(s)`
status span. Change:

- Add a tab `['messages', 'Messages']` between "Needs attention" and "Recent work". Create its pane
  like the others and move `#inbox-strip` into it (instead of into `panes.attention`).
- Replace the status span with a **button** (class `workspace-unread`, keep `role="status"` on an
  inner span so the live-region behaviour stays) that reads `N student message(s)` and on click calls
  `selectView('messages')` then focuses the first `#inbox-list li`. Hide the button when the badge is
  hidden (0 new), exactly as the text is emptied today.
- Show the unread count on the Messages tab button too: label `Messages` → `Messages (N)` when N>0.
- Update the "Needs attention" empty-state sentence that says "Check messages and browser reports
  below." to "Check the Messages tab and browser reports below."
- Nothing marks messages read on open (keep the header comment's promise). "Mark read" stays the only
  way.

Tests: update the pane-placement assertion; add: clicking the unread button selects the Messages
tab; the tab label shows the count; count 0 hides the button.

## Constraints

- Edit in place. No new wrapper modules, no new abstractions, no config flags.
- Preserve all function names listed above — tests extract them by name.
- Do not touch `roster-server/`, `tools/schoology_*`, gating, or grade math.
- LF line endings. Do not commit. Do not bump the build stamp (the orchestrator does that).
- Run: `npx vitest run tests/desk-zero-warning.test.js tests/desk-missing-work.test.js tests/teacher-workspace.test.js tests/teacher-inbox.test.js tests/desk-donow-card.test.js tests/desk-donow-ledger.test.js` (skip a file if it does not exist) and report results verbatim.

## Acceptance (teacher-visible)

1. A Period E student who took the 1.2 quiz but never opened the 1.2 worksheet sees, on the Desk:
   a red badge on My Ledger, a `⚠ 1 missing` pill beside the quarter grade in Do Now, a red corner
   mark on the 1.2 calendar tile, and in My Ledger a "Missing work → Already a 0 → Open Topic 1.2"
   row. Opening and finishing the worksheet clears all four on the next grade refresh.
2. The teacher opens the workspace, sees `8 student message(s)` as a button, clicks it, and lands on
   a Messages tab with the inbox.
