# FABLE_SPRINT_2026_10_22_SPEC — one unattended sprint across the four school repos

Status: APPROVED 2026-10-22 (teacher: "this counts as pre-approval"; unavailable during the run).
Executor: Fable 5.1 as orchestrator, subagents per track. Pushes are allowed for this sprint
(local pre-push gate: `touch .git/PUSH_APPROVED` before each push). Anything that needs a
dashboard the agent cannot reach is written to the teacher checklist (§9), never guessed.

## 0. Ground truth at the start of the run (2026-10-22 08:40 local)

| Repo | HEAD | Dirty | Tests | Notes |
|---|---|---|---|---|
| follow-alongs (fa) | 729461af | 119 files (6 modified, rest `state/` scratch) | root suite running | roster on Railway still reports commit 4a1c791f: the PC curve (8f951a24) and the re-seal script (366a9117) never deployed (Railway pause) |
| curriculum_render (cr) | 758312b | 67 (mostly `state/`, logs) | 7 failed / 1855 passed in ONE file | file identified in §3 |
| algebra2-live-worksheet (a2) | b8c16df | 7 modified + 5 untracked | running | CONTINUATION_PROMPT.md half-refreshed, uncommitted content edits |
| class-log | (part of the `Projects` monorepo, not its own repo) | — | 46 Kotlin test files | 6 specs shipped in a row (POLISH2–5, OBSERVER_CARD*, REHEARSAL) |

Rotation: Phase 1 of `~/.config/apstats/rotation-2026-10-21/RUNBOOK.md` is NOT done (19
`<paste …>` placeholders remain across the env files; Railway CLI session invalidated). Phase 2
is therefore blocked on the teacher's browser. Services are healthy (`/health` on both).

Correction to the morning recommendation: the "deferred grade-loss hardening" backlog
(`state/CODEX_DEFERRED_HARDENING_PROMPT.md`) is ALREADY implemented in both repos (parked
rows, serverFailures, inbox section freeze, `desk-session-expired.test.js`, drain in-flight
flag). It is not a track.

## 1. Tracks

Each track has an owner, allowed paths, a done test, and a commit rule: one commit per
coherent change, stage own paths only, no `git add -A`, never commit `.env`, bundles,
`roster-local/`, or anything with student names. Nobody but the orchestrator pushes.

### T1 — Get the stranded roster commits live (orchestrator)
- Push fa master → Railway rebuilds roster. Verify `/health` reports commit ≥ 8f951a24 and
  `frq.mode` still `authoritative`.
- Dry-run the password re-seal (`rotate-at-rest-keys.mjs`, OLD from `roster-server/.env`,
  NEW from `local.env`) so Phase 2 step 1 is known-good. Never `--apply` (the server would
  still hold the old key).
- Done: health shows the new commit; dry run reports 32 readable password rows.

### T2 — Alias codemod, built and tested, NOT run (agent, fa `scripts/` + `tests/` only)
Pre-condition for the Hetzner move (HETZNER_MIGRATION_SPEC §0: "own domain + codemod BEFORE
any move"). The domain is unknown (Grok), so the tool takes it as an argument.
- `scripts/alias-hosts.mjs --domain <d> [--apply]`: dry-run by default; prints every file and
  the count of replacements. Maps `roster-production-12c1.up.railway.app` → `roster.<d>`,
  `curriculumrender-production.up.railway.app` → `cr.<d>`, the a2 Railway host → `a2.<d>`,
  the lrsl-driller host → `lrsl.<d>`, the shared-grading-proxy host → `proxy.<d>`.
  Walks fa, `../curriculum_render`, `../algebra2-live-worksheet`, and fa `tools/` (Athena
  callers). Skips `node_modules`, `.git`, `state/`, `roster-local/`, binaries, and anything
  under `dist`/`offline-pack`. Worksheet edits are pattern-guarded to `^u\d+_lesson.+_live\.html$`
  at the fa root (edgar driller excluded, per feedback).
- `scripts/alias-hosts.inventory.json`: generated inventory of every current hardcoded host
  (path, line count) committed so the move has a checklist. Also list hosts found in
  `.github/workflows/*.yml` and `tools/*.ps1`.
- Tests: `tests/alias-hosts.test.js` on a temp tree (dry run changes nothing; apply rewrites
  only the mapped hosts; the guard skips `edgar*`; CRLF files keep CRLF).
- Done: tests green; inventory committed; `node scripts/alias-hosts.mjs --domain example.test`
  prints the plan with zero writes.

### T3 — curriculum_render: fix the red file, then a review pass (agent, cr only)
- Identify the 1 failing test file (7 cases). If the failures are a real regression, fix the
  code; if the tests pin stale behaviour, fix the tests and say so in the commit.
- Review `railway-server/` grade-bearing and auth-bearing routes shipped since 2026-09-20
  (park relay absorb rounds, `/park/calc/*`, bonus rail callback, AI grade/appeal) for:
  missing auth on a write, a write that can lower a stored grade, unbounded input, and any
  path that returns 5xx on bad input instead of 4xx. Confirm each finding by reading the
  code path end to end; fix confirmed ones with a test; list unconfirmed ones in
  `docs/review-2026-10-22.md`.
- Add `*.log`, `railway-server/state/`, `test-results/` to `.gitignore` if not already.
  Do NOT commit `scripts/sy2627-predelete-dump.json` (may hold student rows).
- Done: `npx vitest run` fully green; review doc committed.

### T4 — algebra2-live-worksheet: land the dirty work, refresh the continuation, review (agent, a2 only)
- Read the 7 modified files. If the content edits (day-log, lesson-prep, skill-ids,
  lesson-targets, CONTINUATION_PROMPT) are coherent, run the build scripts CLAUDE.md names
  for those inputs (`--check` where available), run `npx vitest run` and
  `roster-server npm test`, commit. If something is half-finished, commit the finished part
  and note the rest in CONTINUATION_PROMPT.
- Rewrite the top "What changed" section of CONTINUATION_PROMPT.md from `git log` since
  2026-10-06 (Class Log passes 3–4, rehearsal decks, migrations 0044–0046, the 10/21 redeploy).
  Keep the grading rules and names sections verbatim.
- Review `roster-server/deck-rules.js`, the `/class-log/*` and `/teacher/decks` routes, and
  `scripts/draft-card-decks.mjs` for: a deck result that can change a grade, token checks on
  every teacher route, validation before every DB write, and the atomic `put_card_decks` RPC
  really being atomic. Fix confirmed findings with tests; list the rest in
  `docs/review-2026-10-22.md`.
- Run `node scripts/bump-build.mjs` last if any Desk/JS/CSS/content changed.
- Done: both suites green; continuation refreshed; review doc committed.

### T5 — class-log: adversarial review of the recording-failure and deck-result paths (agent, `school/class-log` only)
- Read `SPEC.md`, `POLISH5_SPEC.md`, `REHEARSAL_SPEC.md`. Review the Kotlin for: a bad
  recording that fails silently (the POLISH5 promise is "fails loudly"), a deck result lost
  when the queue is interrupted, a summary posted for the wrong block/date, quiet-hours
  logic around the bell schedule, and anything that could post twice.
- Run the unit tests if Gradle works offline on this box (`gradlew test` from `android/`);
  otherwise say so and reason from the code.
- Fix confirmed findings with a unit test each; commit inside the `Projects` monorepo with
  paths limited to `school/class-log/`. Write `school/class-log/REVIEW_2026_10_22.md`.
- Done: findings doc committed; tests green or explicitly not runnable.

### T6 — follow-alongs hygiene + CI issue #2 (orchestrator)
- Commit the six modified files (GitNexus counts, skill-map, cards.tex, cross-agent log).
- `.gitignore`: `state/*.out`, `state/*.xml`, `state/*-pycache/`, `state/*-pytemp/`,
  `UsersroberAppDataLocalTemp*/`, `test-results/`, `supabase_logs.json`. Never delete files.
- `.github/workflows/ci.yml` exactly per issue #2 (permissions, concurrency, timeouts, npm
  cache, `apstat-park tests` step). Close the issue with the commit hash after CI is green.
- Done: `git status` shows only intentional untracked scratch; CI green on master.

### T7 — Release (orchestrator, after T2–T6 land)
- fa: `node scripts/bump-build.mjs` (LF-normalize), full root suite + roster-server suite,
  `detect_changes`, push. cr: push main. a2: push master. Projects monorepo: push class-log
  commits only if the monorepo's own remote is configured and clean for those paths;
  otherwise leave committed locally and say so.
- Verify: fa `/health` commit, cr `/health`, a2 `/health`, GH Pages serves the new
  `version.json`, CI run on master green.

## 2. Out of scope (do not start)
New student-facing features, worksheet authoring, Blooket CSVs, DOK sheets, the Hetzner
box itself, applying the re-seal, disabling any Supabase key, any change to grading
constants, `app.use(cors())` hardening (prepared patch exists; needs the teacher).

## 3. Working notes (filled in during the run)

(see §8)

## 8. Run log

## 9. Teacher checklist (things only you can do)
