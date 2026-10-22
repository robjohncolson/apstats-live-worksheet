# FABLE_SPRINT_2026_10_22C_SPEC — third unattended sprint: a2 CI, one offline queue, Desk extraction phase 2, sharded CI

Status: APPROVED 2026-10-22 (teacher: "spec it and go until completion, you have my full permission").
Same rules as the first two sprints. Orchestrator pushes. Postponed/accepted items stay out of scope.

## C1 — Algebra 2 gets CI (a2)
`.github/workflows/ci.yml` triggers on `master`; the branch is `main`, so it has never run. Fix the
triggers, then make the job actually pass on Linux: root `npx vitest run` + `roster-server npm test`
(both suites, district formula included), Node 22, npm cache, `permissions: contents: read`,
concurrency per ref, 30-minute timeouts. If any root test needs a sibling checkout the way the
AP Stats park tests do, wire it the same way. Fix or skip-with-reason anything that is green on
Windows but red on Linux. Done: a green run on `main` (the orchestrator watches it).

## C2 — One offline queue (fa canonical, cr synced copy)
`offline-queue.js` exists in both repos (fa 296 lines, cr 246; 542 differing lines).
`gradebook-client.js` is per-app and stays separate. Reconcile: read both, keep every behaviour
either side has (parked rows, serverFailures, the ownership gate, whatever cr added), write ONE
`offline-queue.js` in fa, copy it byte-identical into cr. Add `scripts/sync-offline-queue.mjs`
(fa → cr) and an identity test in BOTH repos (`tests/offline-queue-identity.test.js`, skipped when
the sibling checkout is absent, like the park one). All existing offline-queue / gradebook-client /
feeder-record-contract tests in both repos stay green; add tests for any behaviour that only one
side had. Commit per repo. Done: `diff` of the two files is empty and both suites are green.

## C3 — Desk extraction phase 2 (fa)
132 test files read `ap_stats_roadmap_square_mode.html` and pin functions by regex / `fnBody`.
That is what keeps the calendar (`rCal`), the in-app gradebook grid, Study Break Tetris and the
park bridge inline.
1. Add `tests/helpers/desk-source.js`: `deskSource()` returns the Desk's inline JS plus every
   `js/desk-*.js` module the Desk loads, concatenated in load order; `deskHtml()` returns the raw
   file. Also export `fnBody(name)` over that combined source (there are several private copies
   in tests — keep their semantics).
2. Migrate the tests that pin code (not markup) to the helper. Mechanical, many files; a codemod
   under `scripts/` is fine, commit it. Markup pins (`<script src`, element ids) keep reading the
   HTML.
3. Then extract, one commit each, in this order, byte-identical JS moved into `js/desk-<name>.js`
   loaded at the same position with the `?v=` pattern: Study Break Tetris, the gradebook grid,
   the park bridge, `rCal`. After each: `npm run test:quick` green AND the full `tests/desk-*`,
   `pico-home*`, `calendar-*`, `study-break-*`, `classroom-*`, `net-probe`, `ced-*` sets green.
   Stop (and say so) at the first module that cannot move without a behaviour change.
4. `sw.js` precache + `scripts/bump-build.mjs` DESK_MODULES for each new file. Do NOT run
   bump-build / gitnexus:shadow (release does).
Done: the Desk file is materially smaller (report the line count before/after) and every suite
listed is green.

## C4 — Shard the AP Stats root suite in CI (orchestrator)
`ci.yml` test job → matrix of 3 shards (`npx vitest run --shard=${{ matrix.shard }}/3 --retry=2`),
roster-server + park tests in their own job so a shard failure is attributable. Keep the sibling
link step for the park job. Done: a green run with four jobs and a shorter wall time than the
previous run (report both).

## Release
fa: test:quick, full root + roster, bump-build, gitnexus:shadow, detect_changes, push, CI green,
roster `/health`. cr: suite, push, `/health`. a2: suites, push, CI green, `/health`. Spec run log,
memory.
