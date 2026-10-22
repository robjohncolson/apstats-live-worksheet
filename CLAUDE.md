# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full AP Statistics course platform: 69 video follow-along live worksheets, the "Desk" student home hub, diagnostic study guides, teacher tools, a roster/grading backend, and authoring/dev tooling.

- **Repo**: github.com/robjohncolson/apstats-live-worksheet (branch `master`)
- **Frontend**: GitHub Pages, base `https://robjohncolson.github.io/apstats-live-worksheet/`
- **Backends**: two Railway services (see Config & External Services)
- Everything student-facing is single-file HTML with embedded CSS/JS — no build step.

## App Surface

### Student apps

| Path | Purpose |
|------|---------|
| `index.html` | Landing page linking all apps (newly added — repo root previously 404'd) |
| `u{unit}_lesson{range}_live.html` | The worksheet family: 69 files at root (u1–u9), indexed by `TOC.html`. Worksheet-wide rollouts are pattern-guarded to `^u\d+_lesson.+_live\.html$` |
| `ap_stats_roadmap_square_mode.html` + `js/desk-*.js` | **The Desk** (~23,400 inline lines after the 2026-10-22 extractions): student home hub — roadmap lesson tiles, Do Now card with grade pills, completion calendar, resource panel, Live Classroom, Study Break Tetris, in-app gradebook, teacher-only Class Log "Recording" fold. Six modules live in `js/desk-{calendar,class-log,gradebook-grid,park-bridge,progress-app,study-break}.js`, loaded with `?v=<build>` and listed in `scripts/bump-build.mjs` DESK_MODULES + `sw.js`. Tests read the Desk's JS through `tests/helpers/desk-source.js` (`deskSource()` / `deskHtml()` / `fnBody()`), never by regexing the HTML directly. `calendar.html` is a 16-line redirect stub into it |
| `start-here.html` | Orientation + interactive v3 Grade Playground (fully static) |
| `study_guide_diagnostic.html` | DAG/BKT diagnostic study guide; depends on `lib/` runtime (`bkt.js`, `dag-renderer.js`, `probe-selector.js`, `curriculum-charts.js`) |
| (no page) | **TI-84 practice** = the APStat Park calculator room on the Desk's calendar board: the ONE calculator surface, no standalone page, no app window (`APSTAT_PARK_SOLO_DOOR_SPEC.md`; the standalone solo page and the Desk `ti84` window were retired 2026-10-17; the v2/v1 trainers and QA harness 2026-10-16, all in git history). Reached by the SOLO/TEAM switch door inside the room, the Desk hash (`#room=calc-solo[&skill=|&topic=]`, `#room=calc-team`) and `_openParkSolo(link)`; with no hash it opens as the team room while a class is live or in session (`apstat-park/class-session.mjs`), else solo. The native JS calculator engine is `apstat-park/calculator-native/` (byte-identical copy on the relay); the WebCEmu ROM harness is `tools/ti84-rom/` (teacher/dev only) |

### In-Desk app windows

The Desk hosts iframe apps via `openApp(id)` — `APP_REGISTRY` near line 12930 of `ap_stats_roadmap_square_mode.html`; documented in `roadmap-apps-spec.md`:

| id | Target |
|----|--------|
| `quiz` | `https://robjohncolson.github.io/curriculum_render/` (separate repo) |
| (no `ti84`) | The calculator is not an app window: it is the park room on the calendar board (`_openParkSolo`, see App Surface) |
| `formulas` | **Equation Trainer** = `https://tmux-trainer.vercel.app/#deck=ap-stats-formulas` — EXTERNAL Vercel app, NOT in this repo. Its source (`tmux-trainer`) is **not cloned on this machine** — treat the deployed URL as the only available surface |

### Teacher tools

| Path | Purpose |
|------|---------|
| `teacher-dashboard.html` | Class grades, skill heatmap, remediation (roster-server backed) |
| `teacher-classroom.html` | Live Classroom cockpit: presence/poll board, Arm Gate / Green Light controls |
| `teacher-code-generator.html` | Deterministic unit unlock codes (static) |
| `teacher-roster-console.html` | **LOCAL-ONLY** (per its own header comment) — bulk enroll, passwords, delete-student, Schoology UIDs. Do NOT link from public pages |
| `status.html` | **Is everything up?** — static, no auth: roster/cr/a2 `/health`, `version.json` on GH Pages + Vercel, latest CI run (public GitHub API, one fetch per load, never polls); green/amber/red tiles with the rule in the light's title. Linked from the teacher-dashboard header only; test `tests/status-page.test.js` |

### Backend

| Service | Purpose |
|---------|---------|
| `roster-server/` | Node/Express + Supabase, deployed on Railway: `https://roster-production-12c1.up.railway.app`. Roster/login/self-signup, v3 two-track grade engine (`lesson-grade.js`, `computeQuarterV3`), unified ledger, class gradebook, Do Now, Blooket import, remediation, Live Classroom state. Holds the service-role key + bcrypt. **Auto-deploys on push to master** |
| curriculum render server | Separate repo (local clone: `/home/mrcolson/repos/curriculum_render`); `https://curriculumrender-production.up.railway.app`. Worksheet answer sync + AI grading endpoints (see API Endpoints) |

### Dev & authoring tools

| Path | Purpose |
|------|---------|
| `tools/level-editor.html` | Live Classroom pico-park level authoring: painter, lint, sim mode |
| `tools/schoology-sync.py`, `tools/schoology_sync_section.py`, `tools/cdp/edge.py` | Teacher-run CDP grade-write into Schoology; daily dry-run-default scheduled task (`tools/daily_schoology_sync.ps1`) |
| `tools/build_schoology_fixture.py` | `/class/grades` → Schoology fixture (`--inspect` sanity check) |
| `scripts/` | Toolbox: `wire-*.mjs` codemods applied across all 69 worksheets, `build-*.mjs` generators, `teacher-roster.mjs`, `import-blooket.mjs` |
| `video-ingest-whisper.mjs` | Working Whisper transcription CLI (`video-ingest.mjs` = dormant Gemini variant) |
| `live-worksheet.skill`, `blooket-quiz.skill` | Claude Code skills (zip archives) for generating worksheets / Blooket CSVs |
| `roster-client-demo.html`, `gradebook-client-demo.html` | Dev smoke harnesses |

### Content & data

| Path | Purpose |
|------|---------|
| `ai-grading-prompts*.js` | AI grading rubrics keyed by textarea ID — 73 files: one per worksheet (69) + edgar/MIT/study-guide variants (see Rubric Structure) |
| `ai-tutor/` | 75 Socratic prompt artifacts (66 lesson + 9 PC), delivered via Desk copy buttons |
| `u*_blooket.csv` / `*_blooket.csv` | 76 Blooket quiz CSVs at root |
| `dok/` | **DOK ladders**: one DOK-3 problem per lesson day (student sheet + board slide + teacher key), YAML + `registry.jsonl` → `build_ladder.py` → LaTeX → `dok/pdf/`; TOC at `dok/index.html`; spec `APS_DOK_LADDER_SPEC.md` |
| `u4_poster/` | Poster job cards + exemplars |
| `unit4_5_schedule_v12.html` etc. | 16 schedule/calendar pages — superseded by the Desk; v12 is the latest |
| `u3_random_block_review.html`, `u6-proportion-inference-plan.html`, `code-to-website-workshop.html` | One-off pages |
| `u1/`–`u3/`, `u5/`–`u9/`, `u4_l*/`, `unit4guide/`, `mit_python_vid2/`, `a2_3-3/` | Source materials (transcripts, slides, PDFs) — not apps (no `u4/` dir; U4 materials live in `u4_l*/` + `unit4guide/`) |
| `data/` | Generated data: `skill-map.*`, `lesson-schedule.json`, `answer-key.json`, study-guide maps |
| `state/` | Cross-agent orchestration logs/prompts; anything older than 2026-09-22 lives in `state/archive/`; new scratch (`*-codex-*prompt.md`, `*.json`, `*.png`) is gitignored |
| `roadmap-data.json` | Baked Desk data — overridden at runtime by Supabase `lesson_urls` (see below) |
| `roster-local/class-summaries/` | **Generated, gitignored** Class Log lesson summaries for sections B and E (`npm run pull-summaries`); see Class recordings below. Never hand-edit |
| `*_SPEC.md` / `*_BUILD.md` | Per-feature spec/build contracts at root; `STATE_MACHINES.md`, `AI_GRADING_INTEGRATION.md` |

### Class recordings

The Class Log phone (`../class-log`) records each B and E block and posts a lesson summary to the a2 roster-server. `npm run pull-summaries` runs `../algebra2-live-worksheet/scripts/pull-class-summaries.mjs --course apstats --out roster-local/class-summaries` (the a2 checkout must sit next to this one; it holds the server URL and the teacher secret, which never comes into this repo). It writes one `<date>-<section>.md` per recorded block (front matter, then Landed, Student questions, Promises made, Next prep) and `index.json` with those four lists for every summary; the last 30 days by default, `-- --from YYYY-MM-DD` for more. The folder is generated and gitignored: the summaries quote student questions and the teacher's remarks, and this repo publishes to GitHub Pages, so they are never committed; the pull takes seconds, run it before reading. Rule for the agent: before planning the next B or E class, writing a Do Now, or a nightly review note, run the pull and read the latest summary for that section; treat its `promises` as commitments the teacher made out loud to that class.

## Architecture (worksheets)

Each worksheet is self-contained HTML with embedded CSS and JavaScript. Key components:

### Core Features
1. **Fill-in-the-blank inputs** (`<input class="blank" data-answer="...">`) with pipe-separated accepted answers
2. **Answer validation** - Color-coded feedback (green=correct, yellow=partial, red=incorrect)
3. **Railway sync** - Answers POST to `/api/submit-answer`; aggregates fetched from `/api/question-stats/:id`
4. **Aggregate drawer** - Focus-following slide-out panel showing class answer distributions
   - Updates automatically when user tabs between inputs (one chart per input)
   - Bars scaled by count (not percentage) for visual comparison
   - Escape key closes drawer, keyboard hint shown in header
5. **Question IDs** - Auto-assigned as `WS-{UNIT}-Q{N}` for server tracking

### AI Grading Features
6. **AI Reflection Grading** - `ReflectionGrader` class grades free-response textareas via `/api/ai/grade`
7. **Calibrated Prompts** - `ai-grading-prompts*.js` contain rubrics with lesson context from video transcripts
8. **Appeal System** - Students can appeal P/I scores up to 3 times with reasoning
9. **Grading State** - `gradingState` Map tracks results, appeal counts, and history

## Commands

```bash
# Install dependencies
npm install

# Run tests
npm test

# Fast gate (~2 min): grade engine (golden-master*, lesson-grade*), Desk contracts
# (tests/desk-*), CI-pinning tests and alias-hosts. Prints its wall time as "Duration".
# Full suites stay the release gate. Config: vitest.quick.config.js
npm run test:quick

# Run a single test file
npx vitest run tests/grading-prompts.test.js

# Run tests matching a pattern
npx vitest run -t "buildReflectionPrompt"

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Testing

Three suites:

| Suite | Where | Run |
|-------|-------|-----|
| Frontend/worksheets (Vitest + jsdom) | `tests/` (~360 files) + colocated `lib/*.test.js` | `npm test` from root (~10 min here; CI runs it as 3 shards). `npm run test:quick` (~1 min) is the release gate. The jsdom harness suites scale their budgets ×3 on Windows (`HARNESS_BUDGET=<n>` overrides) |
| roster-server (Vitest) | `roster-server/tests/` | `cd roster-server && npm test` |
| Schoology tooling (pytest) | `tests/test_*.py` | `pytest tests/` |

Representative coverage: rubric structure + prompt building (`grading-prompts*.test.js`), grading workflow + appeals (`reflection-grader.test.js`), DOM/UI states (`ui-components.test.js`), aggregate drawer, schedules, Desk features (`desk-*.test.js`).

## CED-2026 numbering: old keys are storage ids, never printed

Contract: `CED2026_SINGLE_SOURCE_SPEC.md`. The old 9-unit key (`3.5`, `3.6-7`) stays the key for files, ledger items, `lesson_urls.topic`, Schoology history — but students only ever read the CED-2026 label (`1.13 · Experimental Design · Day 1`, column `1.13 Day 1 Follow-Along`).

- **One crosswalk**: `2026-crosswalk.json` (`map` + `units`). Edit it, then `node scripts/sync-ced-crosswalk.mjs` — vendors it to `roster-server/data/`, `../curriculum_render/data/` and `../curriculum_render/railway-server/data/`, and regenerates `js/ced2026-crosswalk.js`.
- **One helper**: `lib/ced-label.js` (browser globals `cedLabel`/`cedColumnTitle`/`retitleGradebook`/`cedUnitLabel` + `CedLabel`; Node via `lib/ced-label.mjs`). `js/ced2026-labels.js` and `roster-server/lib/ced-label.*` are byte-identical copies made by the sync script — never edit them.
- Every human-facing string goes through the helper; old keys may appear only in `data-*`, ids, URLs and "stored as 3.5" hover titles. The "Schoology: <column>" tag uses the column's `schoologyTitle` (old titles until `SCHOOLOGY_TITLES_CED` in `roster-server/grade-config.js` flips on rename day).
- Column title format is pinned to `data/ced-column-titles.json` (plain ASCII, never ", "; built by `scripts/build-ced-column-titles.mjs`).
- **Guard**: `tests/ced-no-raw-keys.test.js` (renders tile header, Do Now, missing-work rows, coach, gradebook titles; crosswalk coverage; vendored-copy identity) + `lib/ced-label.test.js`.

## Config & External Services

Worksheets and apps load config/client scripts from the **repo's own root** (all tracked):
- `railway_config.js` — sets `window.RAILWAY_SERVER_URL`
- `railway_client.js` — `window.railwayClient` with `submitAnswer()` / `getStats()`
- `roster_config.js`, `roster-client.js` — roster-server URL + client

> **Stale-doc trap (fixed):** older docs claimed worksheets expect `../railway_config.js` in the PARENT directory. That 404s on GH Pages. Worksheets also carry hardcoded inline fallbacks (`window.RAILWAY_SERVER_URL` default), so they work even if a config script fails to load.

Two Railway backends:
- **roster-server** — `https://roster-production-12c1.up.railway.app` (identity, grades, ledger, Live Classroom)
- **curriculum render server** — `https://curriculumrender-production.up.railway.app` (worksheet answer sync + AI grading; separate repo)

**Runtime data overlay:** the Supabase `lesson_urls` table (project `hgvnytaqmuybzbotosyj`) OVERRIDES the baked `roadmap-data.json` for worksheet/quiz/Blooket URLs in the Desk at runtime. The table is the live source of Blooket URLs (all 77 topics covered as of 2026-06-09). **A file-only URL fix is insufficient — the table wins.**

## API Endpoints (curriculum render server)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/submit-answer` | POST | Submit fill-in-the-blank answers |
| `/api/question-stats/:id` | GET | Fetch class answer aggregates |
| `/api/ai/grade` | POST | AI grade reflection responses |
| `/api/ai/appeal` | POST | Submit appeal with reasoning |

## Deployment

- **GH Pages auto-publishes `master`** — every push goes live at the base URL above. CI (`.github/workflows/ci.yml`) runs the root suite in 3 vitest shards plus a park + roster-server job and a blocking typecheck; check `gh run list --workflow=ci.yml` or `status.html` — CI was red for three days in October before anyone looked.
- **roster-server/ auto-deploys to Railway on push to master.** Changes there are grade-affecting; flag them explicitly.
- **Vercel mirror** — `https://apstats-live-worksheet.vercel.app` serves the same tree as a fallback rail when GH Pages is wedged. Since 2026-10-22 it is **automatic**: the Vercel project (`roberts-projects-19fe2013/apstats-live-worksheet`) is GitHub-connected and builds every push to master. Do not use `npx vercel deploy` from this Windows box (the CLI upload dies on a TLS error); `status.html` shows whether the mirror matches GH Pages. `vercel.json` redirects `/` to `mobile-home.html`; `.vercelignore` keeps backend source, tests, and tooling out of the upload.
- The teacher tests on the **public URL** (local `file://` is not a valid test surface) — commit + push promptly.
- Commit new assets (images, sounds, fonts) before referencing them in code.

## Dependent origins (CORS)

roster-server is called cross-origin by these frontends — they MUST keep working after any CORS change:

- `https://robjohncolson.github.io` — GH Pages: the Desk, worksheets, study guide, and the quiz app (`/curriculum_render/`)
- `https://tmux-trainer.vercel.app` — the Equation Trainer (external Vercel app, also embedded in the Desk)
- `https://apstats-live-worksheet.vercel.app` — the Vercel mirror of this repo (GH Pages fallback rail)

`app.use(cors())` in `roster-server/server.js` is **intentionally wildcard-open today**. Do not harden it ad hoc — the prepared hardening path is `roster-server/docs/cors-allowlist.patch` (explicit allowlist with all three origins above plus localhost dev origins, with apply/verify instructions in the file header). After applying + deploying, verify the Desk loads, the trainer signs in standalone, and the quiz app works.

## Blooket credit = the timed flashcard deck's score (no pass mark)

A lesson's Blooket grade is the **best score on its timed flashcard deck, point for point** (Desk `_ftFinish` → `_blooketCommit`; roster `blooketAvg` = mean of best scores over due lessons; a deck not played by its zero date = 0). There is **no 80% pass mark**: "80% counts as done" was the summer-2026 unlock rule from when lessons were gated, and it misled students into stopping at 80 (teacher, 2026-10-12). `BLOOKET_PASS_THRESHOLD` survives only as the lesson-complete tint. Student-facing copy anywhere in the repo (Desk, Pico Desk, mobile home, coach, tooltips) must never call 80% "done", "credit" or "a pass" — tests `tests/desk-blooket-flashcards.test.js`, `tests/desk-flashcards-guard-copy.test.js`, `tests/mobile-home-flashcards.test.js` pin this.

## AI Grading Rubric Structure

Each reflection question in `ai-grading-prompts*.js` has:
```javascript
{
  questionText: "The question prompt",
  expectedElements: [
    { id: "element-id", description: "What to look for", required: true }
  ],
  scoringGuide: { E: "...", P: "...", I: "..." },
  commonMistakes: ["Mistake to watch for"],
  contextFromVideo: "Direct quotes from lesson video"
}
```

## Creating New Worksheets

Use the `live-worksheet.skill` to generate worksheets. The skill expects:
- Unit/topic metadata
- Learning objectives (VAR-3.D style AP codes)
- Key vocabulary terms with definitions
- Timestamped video sections with fill-in-the-blank questions
- Post-video reflection questions and exit ticket

## Naming Conventions

- Worksheets: `u{unit}_lesson{lesson-range}_live.html` (e.g., `u3_lesson6-7_live.html`, `u4_lesson1-2_live.html`)
- Grading prompts: `ai-grading-prompts-u{unit}-l{lessons}.js` per worksheet, rubrics keyed by textarea ID (`ai-grading-prompts.js` = U3 original)
- Question IDs: Auto-assigned as `WS-U{unit}L{lessons}-Q{N}` for server tracking (e.g., `WS-U4L1-2-Q1`)

## Key State Machines

See `STATE_MACHINES.md` for detailed diagrams. Key flows:

1. **Answer Validation** - Unchecked → Correct/Partial/Incorrect/Revealed
2. **AI Grading** - Click → Build Prompt → API Call → Display Feedback
3. **Appeal System** - Disagree → Form → Submit → Upgraded/Maintained
4. **Grading State** - Empty → Graded → Appealed (up to 3x) → Exhausted

## Cross-Agent Delegation

CC and Codex can invoke each other as subagents via the Agent repo's runner.

**Delegate implementation to Codex:**
```bash
python3 /home/mrcolson/repos/Agent/runner/cross-agent.py \
  --direction cc-to-codex \
  --task-type implement \
  --prompt "Your task description" \
  --working-dir /home/mrcolson/repos/apstats-live-worksheet \
  --owned-paths "path/to/file.html" \
  --timeout 120
```

**Ask CC a design question (from Codex):**
```bash
python3 /home/mrcolson/repos/Agent/runner/cross-agent.py \
  --direction codex-to-cc \
  --task-type design-question \
  --prompt "Your question" \
  --working-dir /home/mrcolson/repos/apstats-live-worksheet \
  --timeout 60
```

**Task types**: `implement`, `review`, `investigate`, `validate`, `design-question`
**Flags**: `--dry-run` (preview, no tokens), `--read-only`, `--owned-paths`
When the user asks to delegate work to Codex, use the runner — don't ask the user to copy-paste.

## TI-84 ROM Transpilation

**Moved to its own repo**: `/home/mrcolson/repos/ti84-transpile`
(GitHub: https://github.com/robjohncolson/ti84-transpile).

This repo (`follow-alongs`) is for the AP Stats worksheets, study guide, and the park's calculator engine (`apstat-park/calculator-native/`) only. The ROM transpilation track — `TI-84_Plus_CE/`, browser shell, auto-continuation loop, `CONTINUATION_PROMPT_CODEX.md` — lives in the sibling repo so its commits never republish the student-facing GH Pages site.

Do not re-add transpile work here. If a transpile session needs something from this repo (e.g., the trainer's screen renderer for cross-reference), copy/cherry-pick the file rather than re-introducing the transpile tree.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **apstats-live-worksheet** (31277 symbols, 59211 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/apstats-live-worksheet/context` | Codebase overview, check index freshness |
| `gitnexus://repo/apstats-live-worksheet/clusters` | All functional areas |
| `gitnexus://repo/apstats-live-worksheet/processes` | All execution flows |
| `gitnexus://repo/apstats-live-worksheet/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Code Style

Write extremely easy to consume code. Optimize for how easy the code is to read. Make the code skimmable. Avoid cleverness. Use early returns.
