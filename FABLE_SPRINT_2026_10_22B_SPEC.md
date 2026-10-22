# FABLE_SPRINT_2026_10_22B_SPEC — second unattended sprint: test signal, review follow-ups, structural debt, teacher visibility

Status: APPROVED 2026-10-22 (teacher: "I am giving you permission right now, so no need to ask until you are done, and pushed").
Executor: Fable 5.1 orchestrator + one agent per repo area. Same rules as the first sprint
(`FABLE_SPRINT_2026_10_22_SPEC.md` §1): stage own paths only, one commit per coherent change,
never commit secrets / bundles by hand / student names, orchestrator pushes.
Postponed by the teacher and NOT in scope: secret rotation, Hetzner/domain, cr `classroom_join` auth.

## Tracks

### A — Deterministic tests (fa, a2)
Flakes seen 2026-10-22 under parallel load, each passing alone:
- fa `roster-server/tests/golden-master.test.js` "synthetic grade HTTP golden master" (15 s hook timeout).
- a2 `tests/a2-score-import.test.js` (5 s timeouts, EBUSY on a shared temp dir); a2 `roster-server/tests/golden-master.test.js` same hook timeout.
Fix per test: per-test `mkdtemp` dirs, explicit hook/test timeouts sized to the slowest observed run ×3, no shared module-level state between files. Prove it: run the file 3× inside the full suite (`npx vitest run` whole suite) and it stays green.

### B — Windows-only / inherited failures become opt-out, not noise (fa, a2)
- fa: `tests/pico-home-phase2`, `pico-home-phase3`, `pico-home-flashcards`, `pico-home-floor`, `pico-home-keys`, `journeys/j5`, `journeys/j9`, `journeys/harness.smoke` fail only on this Windows box (CI green). Find the cause class per file (jsdom + Windows path? timers? canvas?). If it is environmental, gate with `describe.skipIf(process.platform === 'win32' && !process.env.FORCE_WIN_TESTS)` and a one-line comment naming the reason; if it is a real Windows bug in product code, fix it.
- a2: the nine inherited failures listed in `A2_FORK_BASELINE.md` (`phase4b-structure`, three `progress-reset-matrix-*`, `journeys/j7-offline-grade`): same treatment, and update the baseline doc so it says "skipped on win32" instead of "known failing".
- Result: `npx vitest run` on this box reports 0 failed in both repos.

### C — `npm run test:quick` (fa)
A vitest config `vitest.quick.config.js` that runs the grade engine (`roster-server/tests/golden-master*`, `lesson-grade*`), the Desk contract tests (`tests/desk-*.test.js`), the CI-pinning tests (`remaining-feature-contracts`, `grade-engine-bundle-parity`, `gitnexus-shadow`, `lineage`, `pwa`, `ced-no-raw-keys`) and `alias-hosts`. Target under 2 minutes on this box; print the wall time. Document in CLAUDE.md Commands.

### D — class-log health: a bad recording reddens the Desk strip (a2 roster-server + a2 Desk)
`roster-server/device-health.js` computes `failures24h`; "transcript poor" / "Mic:" lines are not counted. Count them (as `recordingWarnings24h`, separate from hard failures) and have `lib/class-log-health.js` paint the strip amber for warnings and red for failures. Test both in `roster-server/tests/device-health.test.js` and the Desk lib test.

### E — a2 deck results: section comes from the card, not the phone (a2 roster-server)
`POST /class-log/deck-results` accepts `section` from the body. Resolve the card by id and use its section; if the body's section disagrees, 409 with both values. Test in `roster-server/tests/card-decks.test.js`.
Also add the `course` query param to `GET /teacher/summaries` if it does not already filter by course (needed by track L; return rows for `course=apstats` only when asked).

### F — cr: AI grade auth off must not disable the rate limiter (cr railway-server)
`railway-server/ai-grade-auth.js`: when `AI_GRADE_AUTH` is `off`, the limiter is skipped too. Decouple: the limiter always runs; the mode only governs identity checks. Confirm what production reports (`/health` → `aiGradeAuth`) and say so in the commit. Test in the existing ai-grade-auth test file.

### G — teacher-classroom.html boot order (fa)
The `btn-class-sound` listener (~line 2942) is wired before the section select / arm gate / green light / `startMonitorMode()` with no null guard. Guard it (and any sibling `getElementById(...).addEventListener` at boot) so one missing element cannot drop everything after it. Test: `tests/v3-p3-webrtc.test.js` fixture WITHOUT the button still reaches `startMonitorMode`.

### H — Desk: extract one inline module (fa)
`ap_stats_roadmap_square_mode.html` is 28,311 lines. Pick the largest inline `<script>` region that is self-contained (candidates: the in-app gradebook grid, the completion calendar renderer `rCal`, the Study Break Tetris engine, the park bridge). Move it to `js/desk-<name>.js` loaded by a `<script src>` at the same position, same globals, same order, no behaviour change. Guards: `npx vitest run tests/desk-*.test.js tests/pwa.test.js tests/remaining-feature-contracts.test.js tests/gitnexus-shadow.test.js tests/lineage.test.js` green; the `sw.js` precache list and `scripts/bump-build.mjs` include the new file; `npm run gitnexus:shadow` after. ONE module only. If no region separates cleanly (shared closures), write `DESK_EXTRACTION_PLAN.md` with the dependency map instead and say so.
⚠ `rCal` has `fnBody` pins in tests (memory: calendar polish) — if you pick the calendar, those tests must be updated, not deleted.

### I — fa `state/` archive
Move every tracked `state/**` file whose last commit is older than 2026-09-22 into `state/archive/` with `git mv` (history preserved). Leave `state/cross-agent-log.json` and anything referenced by a script or test (grep first). Add `.gitignore` rules so new `state/*-codex-*prompt.md`, `state/*.json` test dumps and `state/*.png` are ignored unless force-added. Untracked files: leave them (never delete).

### J — park shared modules: one sync script covers all copies (fa + cr)
`scripts/sync-park-calculator.mjs` misses `calculator-handheld` and `calculator-data-entry` (memory: absorb round 2 "copied by hand"). Make the script discover the shared set from a manifest (`apstat-park/calculator-native/manifest.mjs` or a new `shared-modules.json`) so a new module cannot be missed; keep the identity test (`apstat-park/*.test.mjs` "client and relay use identical block rules") as the guard and extend it to every listed module. Run it; if any copy is already drifted, sync and say which direction.

### K — "Is everything up" page (fa)
`status.html` (static, no auth, no secrets): fetches roster `/health`, cr `/health`, a2 `/health`, `version.json` from GH Pages and the Vercel mirror, and the latest CI conclusion via `https://api.github.com/repos/robjohncolson/apstats-live-worksheet/actions/workflows/ci.yml/runs?per_page=1` (public). Shows commit, FRQ worker mode, roster `persistFailures`, cr `connections`, CI colour, each with age. Pure HTML/JS, Tango tokens, phone-width OK. Link it from `teacher-dashboard.html` header (teacher surface), not from `index.html`. Test: `tests/status-page.test.js` (structure + a fetch-stubbed render).

### L — Class Log summaries fold in the AP Stats Desk (fa Desk, reads a2 roster-server)
a2's Desk shows the "Recording" fold (`desk.html` ~8058, `lib/class-log-summary.js`) from `GET /teacher/summaries` on the a2 roster-server, behind a2 `requireTeacher`. AP Stats summaries live in the same table (`course=apstats`). Implement in the fa Desk teacher day panel: a "Recording" fold that calls `https://a2-live-worksheets-production.up.railway.app/teacher/summaries?course=apstats&from=&to=` with an a2 teacher token. Token: on first open, a small "Class Log sign-in" prompt (teacher password → a2 `/teacher/login` or whatever a2 uses; read a2 `a2-client.js`), stored in `localStorage apstats_classlog_token`; 401 clears it and re-prompts. Copy `lib/class-log-summary.js` into fa `lib/` (keep a header comment naming the source). Filter client-side by `course === 'apstats'` too, in case the server ignores the param. Students never see the fold (teacher role only, `_deskIsTeacher()`). Tests: `tests/desk-class-log-fold.test.js` (fold renders for teacher with a stubbed 200; hidden for students; 401 path). CORS: a2 roster-server must allow the GH Pages origin — check `CORS_ORIGINS` handling in a2 `server.js`; if GH Pages is not allowed, add it in the a2 repo (track E's agent owns a2 server; coordinate via the orchestrator — the fa agent writes what it needs in its report).

## Release (orchestrator)
fa: `npm run test:quick`, full root + roster suites, bump-build, gitnexus:shadow, detect_changes, push, CI green, roster `/health` commit. a2: both suites, bump-build, push, `/health`. cr: suite, push, `/health`. Update CLAUDE.md where commands or files changed. Memory + spec run log.

## Run log (2026-10-22, 11:00–15:30 local)

| Track | Result |
|---|---|
| A | fa golden-master 60 s budgets (green ×3 under load); receipt-binding 30 s. a2 score-import 20 s + retrying rmSync; a2 golden-master 45 s. |
| B | fa: 10 jsdom-harness files `describe.skipIf(win32)` (Desk boots 7–14 s here vs <3 s in CI); `FORCE_WIN_TESTS=1` opts in. a2: the nine "inherited" failures were fork drift, not Windows — three fixed (one real harness bug: undeclared `_expiredSignInShown`), j7 skipped with reason; baseline doc updated. Both root suites: 0 failed on this box. |
| C | `npm run test:quick`: 105 files / 1646 tests, 56 s idle. |
| D | a2 server stores `recordingWarnings24h`; Desk strip amber on warnings, red on failures. Phone sends the count (poor transcript stamps + mic clipping/silence lines, 24 h window); class-log eafe5c4. |
| E | deck results use the card's section (409 on mismatch); `GET /teacher/summaries?course=` filter; GH Pages already in a2 CORS. |
| F | cr limiter runs in every AI_GRADE_AUTH mode (production is `log`, so bursts now 429). cr 9fe4d59 live. |
| G | 14 boot-time listeners in teacher-classroom.html go through a null-guarding helper; fixture-without-button test. |
| H | `js/desk-progress-app.js` extracted (My Progress window, 392 lines). Gradebook grid / rCal / Tetris / park bridge are pinned by text-extraction tests in 20+ files outside tests/desk-*; map in commit 951e627d. |
| I | 102 tracked state/ files → state/archive/ (git mv; renames rode in commit 537fbc9a via the shared index). New scratch patterns ignored. |
| J | `scripts/park-shared-modules.json` (12 modules); sync + identity test cover all; no drift found (22/22 identical). |
| K | `status.html` live, linked from teacher-dashboard. Vercel tile will be RED: the mirror returns DEPLOYMENT_NOT_FOUND and `vercel deploy` aborts on seven access-denied junk dirs at the repo root (`UsersroberAppDataLocalTemp*`, `state/*-pycache`, `state/*-pytemp`) — delete them from an elevated shell, then `npx vercel deploy --prod --yes`. |
| L | Desk "Recording" fold (teacher only, GH Pages origin): a2 teacher login once → `apstats_classlog_token`. 14 tests. |

Release: fa a804d0cd (root 10440/0 failed here, roster 2069, CI green), cr 9fe4d59, a2 4ed2a09, class-log eafe5c4; all `/health` on the new commits. The push also carried 22aa29e5 (calmer auto-grading + band re-set, teacher's other session the same morning).
