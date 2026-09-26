# Review task — tentative zeros on pending assignments (Class Snapshot)

You are a REVIEWER. Do not edit any file. Do not run git commands that change state. Read-only.

Repo: this working directory (AP Stats platform). The change under review is the UNCOMMITTED
working-tree diff in these files:

- roster-server/class-snapshot.js
- roster-server/tests/class-snapshot.test.js
- lib/class-snapshot.js
- tests/class-snapshot-lib.test.js
- ap_stats_roadmap_square_mode.html  (only the function `_snapAssignmentRow`, its call sites in `_renderAssignmentsView`, and CSS near `.snap-alist-you`)
- tests/desk-class-snapshot-assignments.test.js

Get the diff with `git diff -- <file>` per file (the Desk HTML diff is large-file; use
`git diff -U3 -- ap_stats_roadmap_square_mode.html`). The contract is `TENTATIVE_ZEROS_SPEC.md`
(read it fully first); background in `CLASS_SNAPSHOT_SPEC.md`.

## What to look for (in priority order)

1. **Correctness bugs** — wrong statistics on the display distribution D = tentative zeros ++ values
   (median/Q1/Q3/fences/outliers/bins/stems), off-by-one in the "exactly one red mark" rule
   (§2.2), a yellow AND a red mark for the same person, a tentative 0 counted as a real 0 anywhere,
   `n` semantics (must stay `values.length`), the privacy floor (§1.2: publish `values` when
   `values.length + tentativeZeros >= 5`; withhold → `values: []` but `tentativeZeros` still present).
2. **Spec drift** — a single-section payload (`section=PeriodB`) that now carries `tentativeZeros`
   or pending items; `zeros` including tentative; the Missing-work card, `_snapAdvice`, `_snapFocus`,
   teacher-workspace touched.
3. **Edge cases** — `tentativeZeros` undefined on old payloads (must behave as 0); `own` null vs 0;
   `label === null` (nobody placed: no red mark, no "You" sentence, list has no `.snap-alist-you`);
   MIXED item (B counting with real zeros + E tentative) where the viewer's section is the counting
   one → `ownTentative` must be false; canvas height for stem-and-leaf when only tentative zeros
   add stem 0; `values` empty with tentative > 0 (n < 5 text uses D.length).
4. **Regressions** — any existing test pin changed without the spec calling for it; ES5-only code
   in `lib/class-snapshot.js` and the Desk (no arrow functions / let / const / template literals
   there); CRLF introduced (check `git diff --stat` and `file` or a `\r` grep on changed hunks).
5. **Tests** — do the new tests actually assert colours per mark (recorded `fillStyle` at each draw
   call), the caption strings verbatim, the floor both ways, and the single-section pin?

## Output format (only this, no preamble)

```
VERDICT: <SHIP | FIX FIRST>
FINDINGS:
1. [BUG|SPEC|EDGE|REGRESSION|TEST] <file>:<line> — <one sentence: what is wrong>
   Repro/why: <one or two sentences, concrete inputs → wrong output>
   Fix: <one sentence>
2. ...
CHECKED-OK: <comma-separated list of the spec sections you verified with no finding>
```

If you find nothing, say `VERDICT: SHIP` and list CHECKED-OK. Do not pad with style nits; only
report things that would produce a wrong picture, a wrong number, a crash, or a privacy leak.
