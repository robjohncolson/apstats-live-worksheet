# Review task — calm ledger (student-facing Desk UX)

You are a REVIEWER. Do not edit any file. Do not run git commands that change state. Read-only.

Repo: this working directory. Under review: the UNCOMMITTED working-tree diff in
`ap_stats_roadmap_square_mode.html` and under `tests/` (`git status --short`, then
`git diff -U3 -- ap_stats_roadmap_square_mode.html` and `git diff -- tests/`; new test files are
untracked — read them directly). The contract is `LEDGER_CALM_SPEC.md` (read it fully first).

## What to look for (priority order)

1. **Teacher view regressions** — teachers must still get `Class | Assignments`, plots, captions,
   the five-number summary and the form bar in the Snapshot app (`_renderSnapshotApp`,
   `_renderAssignmentsView`, `_snapAssignmentRow`). Any student-only flag (`dataOnly`, `view === 'work'`)
   leaking into the teacher path is a finding.
2. **Do Now state** — `_donowApplyZeroState` classes: none → neither class; only tentative →
   `donow-zeros-soon`; any past → `donow-zeros-now`; the base `donow-<mode>` class is never
   removed; the state survives a `card.className = 'donow-' + mode` repaint (is the call really
   placed AFTER that assignment, on every path that assigns it?). Pill wording and plurals per §1.2.
   "By <day>" must be the LATEST not-past zero date.
3. **Ledger** — `_walletPrependSnapshot` no longer called from the ledger paint chain (all sites)
   but still called by the Snapshot app's student Class/Graphs tab; the `data-sig` repaint guard in
   `_walletPrependZeroCard` still works (same list → no repaint; changed list → repaint); rows keep
   working buttons (`_zeroOpenLesson/_zeroOpenQuiz/_zeroOpenFlashcards`) and `.wz-see` calls
   `_snapOpenAssignment(lessonKey, kind)`; the status line handles "no grade yet" and the
   nothing-past case; the `See the class` button is hidden for teachers and calls `openSnapshot`.
4. **Snapshot app student data mode** — list always open, tentative yellow chips and the single red
   "you" chip intact, advice present, NO canvas/caption/form bar/legend; Prev/Next/Show all still
   work; `_snapOpenAssignment` lands on the row in `work` view; the `graphs` view restores plots.
   Any place that reads `_snapApp.view === 'class'` / `'assignments'` for students that now breaks
   (e.g. tab highlighting, `focusKey` handling, `arrangeByUsage`).
5. **Crashes** — `typeof` guards where the spec asks; `cedLabel` may be undefined in some contexts;
   `_walletCurrentGrade()` shape assumptions (read the function before judging).
6. **Regressions in tests** — pins deleted rather than updated; ES5-only in the Desk HTML (no arrow
   functions / let / const / template literals inside the HTML); CRLF introduced.

## Output format (only this, no preamble)

```
VERDICT: <SHIP | FIX FIRST>
FINDINGS:
1. [BUG|SPEC|EDGE|REGRESSION|TEST] <file>:<line> — <one sentence: what is wrong>
   Repro/why: <one or two sentences, concrete state → wrong result>
   Fix: <one sentence>
2. ...
CHECKED-OK: <comma-separated spec sections verified with no finding>
```

Only report things that would show a student the wrong state, break the teacher view, crash, or
lose coverage. No style nits.
