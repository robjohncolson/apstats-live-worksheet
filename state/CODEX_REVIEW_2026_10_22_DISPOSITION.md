# Disposition of the Codex overnight review (2026-10-22 → 23)

All ten confirmed findings were verified by hand (diffs read end to end, proving tests re-run on this box) and
fast-forwarded into master/main on 2026-10-23 morning. Codex's side branches were deleted after the merge.

| # | Finding | Repo | Merged as | Verified by |
|---|---|---|---|---|
| 1 | per-key lock released by an earlier operation | fa + cr | c31ee96d / 029ef49 | offline-queue-lock-race (both) |
| 2 | successful replay deletes a newer unsent answer | fa + cr | same | same |
| 3 | Class Log teacher token survives Desk sign-out | fa | c31ee96d | desk-class-log-signout, -signin-race |
| 4 | first offline reload cannot load js/desk-*.js?v= | fa | c31ee96d | desk-offline-first-load |
| 5 | six markup guards vacuous after the C3 codemod | fa | c31ee96d | the six files |
| 6 | park read routes 500 on object-shaped query values | cr | d609484 | park-calc-query-shape |
| 7 | nested toString-poisoned grade inputs 500 | cr | d609484 | ai-grade-nested-shape |
| 8 | "quiz" mention scheduled as a quiz day | a2 | 07dd9c0 | a2-tomorrow-review |
| 9 | Desk Tomorrow fold used the calendar lesson, not the day log's | a2 | 76380af | a2-tomorrow-panel |
| 10 | 409 re-send ignored a fresh token rejection | class-log | 16c4309 | DeckResultQueueTest |

Findings 1 and 2 pre-dated the sprint (present in both repos' queues before unification). Codex's note that
cr needed a build stamp was handled by `node scripts/bump-build.mjs` in cr (3004f8d) and fa (67098f91).

Plausible item left open: the Desk fold looks back 14 days for a recording while the CLI takes the latest
earlier summary without a cutoff (`lib/a2-tomorrow.js:273` vs `scripts/draft-tomorrow.mjs:95`).
