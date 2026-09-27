# Review task — effort visibility (PC strategy line + work done ahead)

You are a REVIEWER. Do not edit any file. Do not run git commands that change state. Read-only.

Two repos are under review, both UNCOMMITTED working-tree diffs:
- this repo: `lib/effort-facts.js` (new) + `lib/effort-facts.test.js` (new), `scripts/weekly-slips.mjs`,
  `tests/weekly-slips.test.js`, `ap_stats_roadmap_square_mode.html` (only `_walletPaint`,
  `_buildCoachContext`, `_renderCoachPanel`, the `/grade` cache lines, and the new `<script>` tag —
  `git diff -U3 -- ap_stats_roadmap_square_mode.html`), `tests/desk-ledger-calm.test.js`,
  `tests/desk-why-so-low.test.js`, `tools/schoology_sync_section.py`, `tests/test_schoology_sync_lib.py`
- C:/Users/rober/Downloads/Projects/school/curriculum_render: `railway-server/server.js`
  (`cd` there and `git diff -- railway-server/server.js`)

The contract is `EFFORT_VISIBILITY_SPEC.md` (read fully). §0 states what is already true in the engine.

## What to look for (priority order)

1. **Wrong numbers or wrong promises.** The strategy line must match the v3 rule exactly: BOTH tracks
   ≥ 40% → grade = the HIGHER track. Check `strategyLine`: the "9 points of Work does it" arithmetic
   (40 − work, rounded up, never negative), the "already past 40%" variant, the empty case when
   pc < 40, and that nothing claims a specific final grade. `pcOnFile.counting` / `countsFrom` must
   use `adminDay2[period]` and the `<=` rule (counts FROM that day). `aheadLessons` must use the
   student's OWN section's due date and treat "today" as NOT ahead.
2. **Contradictions between surfaces.** The slip, the Desk balance card, the coach panel and the coach
   facts must all say the same thing for the same student (same numbers, same date). The coach prompt
   must not now push Progress Checks for a student with NO PC on file (the "PC NOT OPEN YET" rule must
   still hold when `pcOnFile` is null).
3. **Data plumbing.** `units` reaches the Desk cache from `/grade` and the slips script from
   `/class/grades` (is the key `units`? is it per student?); the cache is cleared with the others;
   the slip reads `data/lesson-schedule.json` once per run; the Desk gets the period from `cP`.
4. **Sync dry-run summary** (`tools/schoology_sync_section.py`): the "ahead scores waiting for a
   column" line is computed from absent columns only, changes NO write behaviour, prints no student
   names (counts per column key only), and is covered by a pytest.
5. **Privacy / hygiene.** No names in fixtures; ES5 in the HTML and in `lib/effort-facts.js`; LF
   endings; old pins updated not deleted.

## Output format (only this, no preamble)

```
VERDICT: <SHIP | FIX FIRST>
FINDINGS:
1. [BUG|SPEC|EDGE|PRIVACY|TEST] <repo>/<file>:<line> — <one sentence: what is wrong>
   Repro/why: <one or two sentences, concrete input → wrong output>
   Fix: <one sentence>
2. ...
CHECKED-OK: <comma-separated spec sections verified with no finding>
```

Only report things that would tell a student a wrong number, a wrong date, a wrong rule, or a
promise the engine does not keep; or leak data; or lose coverage. No style nits.
