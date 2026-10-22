# FABLE_SPRINT_2026_10_22D_SPEC — fourth sprint: review today's work, tomorrow's prep, the nightly "Tomorrow" draft, a2 typecheck, harness budgets, review follow-ups, docs

Status: APPROVED 2026-10-22 evening (teacher: "spec, and implement until completion, you've my full permission to commit and push"). Budget: ~3 hours.
Same rules as sprints A–C. Review (D1) runs FIRST; the agents that edit existing code (D3–D5) start after it, so review findings land before more changes pile on.

Teacher rules recorded today (feedback_do_now_not_unique): a Do Now is never a new task — it is a Group Jam (an assigned IXL skill) or a problem from the packet. Nightly prep keeps the current class format (get through the IXL skills, the packet, then the quiz); it never adds activities.

## D1 — Independent review of everything shipped 2026-10-22 (first, two agents)
Today: fa 38 commits / 390 files, cr 7 / 16, a2 13 / 33, class-log 3. No second set of eyes yet. Two reviewers, fresh context, given the diff ranges, not the sprint reports:
- fa: `git diff 729461af..HEAD` (skip `state/archive/**`, `gitnexus-shadow/**`, `grade-engine.bundle.js`, `tests/**` rewrites except for lost assertions). Focus: the four Desk extractions (script order, globals, `?v=` stamps, sw.js precache), the teacher-classroom boot helper, the unified offline queue, the Class Log fold (token handling, teacher-only), status.html (no secrets), ci.yml (shards cover every file exactly once), the two grade-affecting commits from the teacher's other session (22aa29e5, ddfccdf2: nothing lowers a stored grade; bundle matches source).
- cr + a2 + class-log: cr `758312b..HEAD` (limiter in every mode, park read routes, mirrored queue); a2 `b8c16df..HEAD` (deck section rule, course filter, health warnings, CI, bundle LF fix, `deckFromRow`); class-log `801f4c3..HEAD` (RETIRE alarm slot, recordingWarnings24h).
Rules for reviewers: confirm by reading the code path end to end; fix CONFIRMED findings with the smallest diff + a test; list PLAUSIBLE ones in `docs/review-2026-10-22-evening.md` (fa root `REVIEW_2026_10_22_EVENING.md`). Commit by path, no push.

## D2 — Tomorrow's prep notes, AP Stats B and E (orchestrator, read-only)
`npm run pull-summaries`, read the latest B and E summaries, write `roster-local/prep/2026-10-23-B.md` and `-E.md` (gitignored): what landed, promises made (treat as commitments), student questions to answer, what tomorrow's lesson is per the Desk schedule, and the Do Now = the due worksheet / Blooket deck already on the schedule (never a new task). Print them in the final report.

## D0 — Nightly "Tomorrow" draft for Algebra 2 (agent, a2)
Goal: every evening the teacher gets, per section (C, D, G), a one-screen note for the next class day that follows the existing format. Sources, in priority: `data/a2-lesson-targets.json` + `lib/a2-year-plan.js` (which lesson / day the section is on tomorrow, next assessment date), `content/a2/day-log.json` (what landed last time), `content/a2/lesson-prep.json` (kept examples, DOK 3 item, the quiz item the lesson is taught toward, IXL skills per example), `content/a2/lesson-skills.json` + `data/ixl-algebra2-skills.json` (assigned IXL skills and their pages), the latest Class Log summary for that section (`roster-local/class-summaries/`, pulled by `scripts/pull-class-summaries.mjs`; promises + student questions).
Output per section: **Do Now** = one assigned IXL skill as a Group Jam (prefer the skill tied to the next kept example; fall back to the lesson's first unfinished skill) OR one kept packet example / practice item not yet done (from the day log), stated as "Group Jam: <skill code + name> (<IXL page>)" or "Packet: Example N / practice item N"; **Then** = the next kept examples in order with their IXL skill; **Quiz target** = the lesson quiz item the lesson is taught toward and the assessment date; **Promises / questions** from the recording; **Left in the packet** = kept items not yet in the day log. Nothing invented.
Mechanics: `scripts/draft-tomorrow.mjs [--date YYYY-MM-DD] [--section C|D|G]` (deterministic, no LLM; the day log and prep JSON are the truth), writes `roster-local/tomorrow/<date>-<section>.md` and prints them; `tools/nightly_tomorrow.ps1` runs the pull then the draft; register a Windows scheduled task `A2 Tomorrow Draft` at 20:30 daily via `schtasks` (the Schoology sync task in `tools/daily_schoology_sync.ps1` shows the pattern — copy its logging/`--once` conventions) and say in the report whether registration succeeded. Delivery into the Desk: if a2 already has a teacher route + fold that can carry a per-section-day note cheaply (check `/teacher/cards`, observer cards, the day log's `resources`), add a "Tomorrow" fold under the teacher day panel that reads it; otherwise the file + print is the deliverable and say so. Tests: `tests/draft-tomorrow.test.js` on a fixture tree (deterministic output, the "never invented" rule: every Do Now string resolves to an IXL code in the skill map or a numbered packet item in lesson-prep). `node scripts/bump-build.mjs` if desk.html changed. Document in CLAUDE.md and CONTINUATION_PROMPT's daily procedure.

## D3 — Algebra 2 typecheck becomes blocking (agent, a2, after D1)
46 errors: `gradebook-client.js` (43) and `roster-server/lesson-grade.js` (3). Fix with JSDoc types, never behaviour; grade-engine bundle regenerated via the LF-normalizing generator if lesson-grade.js changes; golden masters must be byte-identical. Flip `continue-on-error` off in ci.yml. Done: `npm run typecheck` clean in both dirs; CI green.

## D4 — Harness budgets scale by platform; un-skip the ten win32 files (agent, fa, after D1)
`tests/journeys/harness.js`: a `BUDGET` multiplier (default 1, `3` on win32 unless `HARNESS_BUDGET` overrides) applied to `waitFor` default, the boot assertion and the per-test timeouts; remove the `describeOnThisBox` gates in the ten files from sprint B; run them here (sequentially if the whole set under load still flakes, say so and gate only the harness set with `--no-file-parallelism` via a `test:harness` script). CI unaffected (multiplier 1). Done: `npx vitest run tests/journeys tests/pico-home-*.test.js` green on this box.

## D5 — Close the small review items (agent, split by repo, after D1)
From this morning's three review docs + class-log REVIEW: a2 — deck-result `section` must match the card (done) → also reject a `cardId` that is not for that section's course; class-log — `failures24h` ignoring "transcript poor" is now covered by warnings; cr — `/api/ai/grade` odd `scenario`/`answers` shapes → 400 not 500 (construct the probe); bonus-rail `posted/failed` arrays bounded (ring of 500); fa — `teacher-classroom.html` nothing left. Each with a test. Skip anything the teacher accepted (classroom_join).

## D6 — Docs refresh (orchestrator, last)
All four CLAUDE.md files: Desk size and module list, test commands (`test:quick`, shards), `state/archive`, status.html, the mirror, a2 CI, `draft-tomorrow`. One commit per repo.

## Release
Same as sprint C per repo. Spec run log + memory.

## Run log (2026-10-22, 21:40–23:30 local)

| Track | Result |
|---|---|
| D1 fa | 4 confirmed: **status.html XSS** (remote text into innerHTML; `esc()` everywhere, run link only for github.com URLs), the 10/22 grade band had no lesson-level test (added: blanks + none/I/P/E → 80/87.5/95/105), two markup guards made vacuous by the C3 codemod (now read `deskHtml()` too), `_wireAtBoot` ids pinned. Verified clean: extraction order (acorn cross-segment check), queue parity with 729461af, Class Log token handling, shard coverage, nothing lowers a grade. c94ef250, 31f8ff6e. |
| D1 cr/a2/class-log | 1 confirmed (cr log-mode invalid-shape header/log duplication, 67a7218). a2 + class-log: none; bundle LF claim verified both directions. Review docs committed in all three. |
| D0 | a2 nightly "Tomorrow" draft: `lib/a2-tomorrow.js` (UMD), `scripts/draft-tomorrow.mjs`, `tools/nightly_tomorrow.ps1`, scheduled task `A2 Tomorrow Draft` 20:30 daily (registered, manual run exit 0), Desk teacher fold "Tomorrow (draft)". Do Now rule: a Jam named in the day log → the IXL skill of the next kept example → first unjammed skill → a kept packet item; nothing invented (20 tests). Notes for C 10/26, D 10/23, G 10/23 in `roster-local/tomorrow/`. |
| D2 | Prep notes B + E for Fri 10/23 in `roster-local/prep/` (B: 2.3 Simulation Day 1, PC deadline Fri midnight, "interviewing someone next week"; E: 2.1 Day 1+2 catch-up, last E recording empty — check the phone). |
| D3 | a2 typecheck 46 → 0 (JSDoc only; engine outputs identical 21/21); CI typecheck job blocking again. |
| D4 | Harness budgets ×3 on win32 (`HARNESS_BUDGET` override); ten gated files un-skipped and green here (pico-home-doge too: it was the unscaled 1 s wait). |
| D5 | class-log: 409 `section_mismatch` → re-send once with the card's section, correction persisted (470 tests). cr (44e9647): `/api/ai/grade` + appeal bad shapes → 400 via `grade-shape.js` (six constructed 500s closed, incl. a regex-metachar template key), bonus rail `posted`/`failed` ring of 500, `rate-ip` marker on anonymous log-mode 429s, `queryText` too-long vs missing. 78 files / 1909 tests. a2 cardId/course check deferred (three agents already in a2). |
| D6 | fa CLAUDE.md refreshed; a2 CLAUDE.md + CONTINUATION by D0; cr/class-log docs by their agents. |

Gotcha found during release: the a2 fixture tree under `tests/fixtures/**/roster-local/` was hidden by the repo-wide `roster-local/` ignore and never reached CI (f3f64d2 un-ignores fixtures).

Release: fa ff7c3976 (CI green on abb272ec; roster live), a2 f3f64d2 (CI green, typecheck blocking; live), cr 44e9647, class-log subtree (470 Kotlin tests). a2 fixture un-ignore was the one post-push fix.
