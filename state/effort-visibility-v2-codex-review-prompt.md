# Review task — effort visibility v2 (strategy wording, both periods named, tracks on the pill, Schoology colour key)

You are a REVIEWER. Do not edit any file. Do not run git commands that change state. Read-only.

Two repos, UNCOMMITTED working-tree diffs:
- this repo: `lib/effort-facts.js`, `lib/effort-facts.test.js`, `scripts/weekly-slips.mjs`, `tests/weekly-slips.test.js`,
  `ap_stats_roadmap_square_mode.html` (`git diff -U3 -- ap_stats_roadmap_square_mode.html`: the grade pill
  builder, `_snapScoreList`, the My Gradebook modal renderer, `_effortFacts`), and any `tests/*.test.js` in the diff.
- C:/Users/rober/Downloads/Projects/school/curriculum_render: `railway-server/server.js` (+ `tests/coach.test.js`).

Contract: `EFFORT_VISIBILITY_V2_SPEC.md` (read fully) on top of `EFFORT_VISIBILITY_SPEC.md`.

## What to look for (priority order)

1. **Wrong numbers or promises in the strategy sentence.** Recompute each of the five §1 cases by hand
   from the code: N = ceil(40 − W) on the UNROUNDED W; "yours would be the Progress Check" only when
   PC > W; the "Work ≥ PC" variant when W ≥ PC; the projected form never states the PC as the grade
   today; the counting form uses `quarters[q].pcAvg`, not a unit. A sentence that could be read as
   "you will get 94%" without the 40%-Work condition is a finding.
2. **Pill arithmetic.** `Q1 <grade> = higher of Work <w> · PC <pc>` must only appear when BOTH tracks
   are ≥ 40 (unrounded) AND the PC is counting; the penalized form names the track that is under 40
   (both, when both are); the not-counting form shows the date; whole numbers rounded consistently
   with the number Schoology shows. The Missing-work pill must still be inserted after it
   (`quarter.after(pill)` in `_updateDoNowMissingPill` finds `.qpill:not(.qpill-missing)`).
3. **Both periods named.** The section names come from the payload's `sections`; one-section payloads
   say one name; the slip and the Desk produce identical lead/foot/key strings for the same data.
4. **My Gradebook colour key.** Due vs not-due comes from `col.due` (`false` = not yet); cells with no
   value get no tint; the "Schoology now" number equals the row total the server computed from due
   columns only (not recomputed differently client-side); the "Desk" number is the quarter grade; when
   columns carry no `due` field there is no key and no tint.
5. **Regressions / hygiene.** Old pins updated not deleted; ES5 in the HTML and lib; LF; no names in
   fixtures; the cr coach suite still green.

## Output format (only this, no preamble)

```
VERDICT: <SHIP | FIX FIRST>
FINDINGS:
1. [BUG|SPEC|EDGE|TEST] <repo>/<file>:<line> — <one sentence>
   Repro/why: <concrete input → wrong output>
   Fix: <one sentence>
2. ...
CHECKED-OK: <spec sections verified with no finding>
```

Only report wrong numbers, wrong conditions, contradictions between surfaces, or lost coverage. No style nits.
