# Continuation Prompt — TI-84 CE Procedural Trainer

**Last updated**: 2026-04-14 (session 77 — v6 FRQ decomposition shipped)
**Status**: TI-84 trainer V3 shipped + Physical Calculator Mode is now primary (default). CEmu/WASM emulator demoted to a legacy option behind the Options dialog because school networks block Supabase and WASM boot fails. All core features implemented. **Parallel track**: `study_guide_diagnostic.html` v6 **shipped tonight** — FRQ decomposition feature with helper-tracking penalties, 91/91 study-guide tests green. See entry 77.
**Deadline**: ~May 7 (AP exam, 24 days out)

---

## What This Project Is

A standalone single-file HTML webapp that trains AP Statistics students on the **mechanical key-press sequences** for every TI-84 Plus CE procedure used across Units 1-9. Students interact with a real CEmu-emulated calculator (ROM via Supabase), while a native JS state machine validates keystrokes and drives guided walkthroughs. SRS scheduling ensures durable memory.

## Architecture (V3 — Current)

```
Student clicks virtual key
  → Native state machine: "Is this the right key?"
  → If correct: pass to CEmu → LCD renders real calculator screen
  → If wrong: blocked, show feedback
  → Clutch system: can pause guidance to fix errors freely

ROM loaded from Supabase bucket → cached in IndexedDB → never re-downloaded
Calculator resets to HOME on every new problem
```

### Key Components

| Component | Role |
|-----------|------|
| CEmu WASM (`wasm/WebCEmu.js + .wasm`) | Runs real TI-84 ROM in browser, renders LCD |
| Native module (`native/*.js`, 9 files) | State machine, stat math, menu nav, form engine |
| Bridge (`bridge.js`) | CEmu interface + Supabase ROM auto-loader |
| App (`app.js`) | Walkthrough engine, clutch, SRS, UI |
| Procedures data (`ti84-procedures-data.json`) | 27 procedures, 384+ steps, 65 screens |

### Clutch System (3-phase walkthrough)

```
Phase 1: DATA SETUP (clutch disengaged)
  - Auto-fill types data into CEmu lists/matrices
  - Or student enters manually, clicks "I'm done"
  - 12 of 27 procedures need this phase

Phase 2: PROCEDURE (clutch engaged)
  - State machine validates keystrokes
  - Guided mode: highlights next key, blocks wrong keys
  - Recall mode: no highlights, hints count as misses
  - Pause button: disengage mid-procedure to fix errors

Phase 3: RESULT REVIEW (clutch disengaged)
  - Free exploration of result screen
```

## Files

### Core App

| File | Purpose |
|------|---------|
| `ti84-trainer-v2/standalone.html` | Built single-file bundle (~461KB), what students open |
| `ti84-trainer-v2/app.js` | Walkthrough engine, clutch, phases, UI rendering |
| `ti84-trainer-v2/bridge.js` | CEmu WASM bridge + Supabase ROM auto-download + IndexedDB cache |
| `ti84-trainer-v2/style.css` | Calculator skin CSS (EZ-Spot yellow bezel model) |
| `ti84-trainer-v2/build.mjs` | Assembles standalone.html from modules + data |
| `ti84-trainer-v2/index.html` | Dev entry point (loads modules separately) |

### Native Module (State Machine)

| File | Lines | Tests | Purpose |
|------|-------|-------|---------|
| `native/event-bus.js` | 48 | — | Pub/sub event system |
| `native/stat-math.js` | ~620 | 72 | All stat computations (normal, t, chi-sq, binomial, regression) |
| `native/menu-nav.js` | ~200 | 37 | STAT/DISTR/CALC tab navigation |
| `native/menu-tables.js` | ~280 | — | 12 menu screens extracted from procedures data |
| `native/field-tables.js` | ~540 | — | 20 wizard field tables + 14 result templates |
| `native/form-engine.js` | ~600 | 85 | Wizard cursor, field types, Data/Stats toggle |
| `native/result-formatter.js` | ~100 | 25 | TI-84 number formatting + result line templates |
| `native/screen-renderer.js` | ~350 | — | 320x240 LCD canvas rendering + mock graphs |
| `native/ti84-native.js` | ~600 | 57 | Orchestrator, bridge-compatible API |
| `native/tests/verify-all-procedures.test.js` | ~250 | 78 | Automated walk-through of all 27 procedures |
| **Total** | **~8000** | **354** | |

### Data Files

| File | Purpose |
|------|---------|
| `ti84-procedures-data.json` | 27 procedures, 20 wizards, 14 results, 12 menus, 65 screens, DAG edges |
| `ti84-pattern-recognition-data.json` | 62 canonical problems, 22 confusion pairs, 27 distractor sets |
| `ti84-rom-disassembly-results.json` | ROM-extracted wizard field tables, confidence levels |
| `ti84-rom-wizard-fields.md` | String offsets, token byte map from ROM extraction |

### CEmu WASM

| File | Purpose |
|------|---------|
| `wasm/WebCEmu.js` | Emscripten glue code (73KB) |
| `wasm/WebCEmu.wasm` | CEmu WASM binary (112KB) |

### Research / ROM Artifacts (not used by trainer)

| File | Purpose |
|------|---------|
| `TI-84_Plus_CE/ROM.transpiled.js` | Codex byte-lifted JS from ROM (384 blocks, startup path only) |
| `TI-84_Plus_CE/ROM.transpiled.report.json` | Coverage stats for transpilation |
| `scripts/transpile-ti84-rom.mjs` | Generator script (requires z80js) |

### Specs & Prompts (historical, in repo)

| File | Purpose |
|------|---------|
| `ti84-trainer-spec.md` | Original V1 spec |
| `ti84-native-port-spec.md` | Native module architecture (7 modules) |
| `ti84-v3-spec.md` | V3 architecture (CEmu primary + native state machine) |
| `ti84-clutch-spec.md` | Clutch system, data seeding, list memory |
| `codex-native-port-prompts.md` | 5-agent parallel Codex dispatch for native module |
| `codex-v3-prompt.md` | V3 integration Codex prompt |
| `codex-clutch-prompt.md` | Clutch system Codex prompt |

## Key Design Decisions (Already Made)

1. **CEmu is primary UI** — students see the real emulated calculator, not a mid-fidelity mock
2. **Native module is the state machine** — validates keystrokes, tracks screen state, never renders to LCD
3. **ROM from Supabase** — auto-download, IndexedDB cache, no file picker. URL: `https://bzqbhtrurzzavhqbgqrs.supabase.co`, bucket: `ti84-trainer-assets`
4. **Clutch system** — disengage/engage state machine for data setup, error correction, result review
5. **Auto-fill** — trainer types sample data into CEmu lists/matrices via key presses
6. **ALPHA + key for menu letters** — items A-H in TESTS/DISTR menus require ALPHA then the physical key
7. **Calculator skin** — matches physical TI-84 Plus CE EZ-Spot model (charcoal body, yellow bezel, blue 2nd, green alpha)
8. **Reset on every problem** — both CEmu and native reset to HOME before each walkthrough
9. **List memory** — persists in localStorage, always shows data setup phase (never silently skips)
10. **CEmu global stubs** — `emul_is_inited`, `initFuncs`, `initLCD`, `enableGUI`, `disableGUI` defined before `callMain()`
11. **`.gitattributes`** — marks `.wasm`, `.rom`, `.8xv`, `.8xp`, `.sqlite` as binary (prevents CRLF corruption)

## Feature Status (All Core Complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Pattern Recognition (Track 1) | DONE | `buildQuestion()`, 62 canonical problems, 22 confusion pairs, distractor MCQ, branch walkthroughs |
| Clutch System (3 phases) | DONE | data-setup → procedure → result-review, auto-fill + manual entry, pause/resume mid-procedure |
| Auto-Fill (lists + matrices) | DONE | Navigates STAT>EDIT, types values, progress pills. Tested on chi-squared GOF |
| SRS Track 1 (pattern) | DONE | SM2, exposure counting, quality 0-5 from branch count |
| SRS Track 2 (navigation) | DONE | SM2, guided→recall progression, demotion on 3+ errors or 2+ hints |
| Walkthrough (guided + recall) | DONE | Key blocking, error/hint tracking, narration, common error messages |
| CEmu Integration | DONE | WebCEmu WASM boots real ROM, LCD rendering, key sending, mock fallback |
| Supabase ROM | DONE | Signed URL, streaming download, IndexedDB cache, version validation |
| List Memory | DONE | localStorage persistence, match checking, always shows data setup phase |
| Pause/Resume Guidance | DONE | Clutch disengage mid-procedure, free keys, resume from current step |
| Calculator Skin | DONE | Photo-accurate EZ-Spot model colors, 6-column keypad grid |
| Mobile Layout | DONE | `@media (max-width: 600px)`: full-bleed, compact walkthrough bar, sticky narration, 42px keys, icon buttons |
| Answer Verification | DONE | "Check Your Answer" card in result-review phase, 23 procedures, uses native computed values with 0.5% tolerance fallback |
| Physical Calculator Mode | DONE (PRIMARY) | Default-on. Renders instruction cards (Press KEY / narration / expected / tips / Back, I did it) so students follow along on their real TI-84. Bypasses `pressButton` validation and just advances `routeState`. Zero network, works offline. |
| Options Dialog | DONE | Titlebar "Options" button opens a small dialog housing Firmware + mode toggle. Keeps the physical view uncluttered. |
| Choice Button Flash | DONE | Track 1 choice buttons flash green (correct) or red (wrong) for 650ms before the panel transitions, so students see which button they hit. |

## Known Issues / Remaining Work

### Layout
- At 100% zoom on 1366x768, user may need to scroll to see full keypad
- Previous auto-fit attempts (clamp/flex) made LCD too small or keys unreadable — rolled back

### Procedures
- All 27 procedures verified via automated tests (354 passing, 0 discrepancies)

### Not Yet Built
- **Student pilot testing** — need real students running through procedures
- **Graph rendering** — native module has mock graphs; CEmu shows real graphs
- **STAT>EDIT data entry walkthrough** — could be its own guided procedure teaching list entry

### Research Artifacts (Not on Critical Path)
- `TI-84_Plus_CE/ROM.transpiled.js` — Codex-generated byte-lifted JS from ROM. 384 blocks, 0.086% coverage. Startup path only. Not used by the trainer; kept as reference. Regenerate with `node scripts/transpile-ti84-rom.mjs`

## Commands

```bash
# Run native module tests
cd ti84-trainer-v2/native && npx vitest run --config vitest.config.js

# Rebuild standalone.html after changes to app.js/style.css/data
node ti84-trainer-v2/build.mjs

# Serve locally for testing (needed for WASM dynamic import)
cd ti84-trainer-v2 && python -m http.server 8000
# Then open http://localhost:8000/standalone.html

# Run all project tests (from repo root)
npm test
```

## Supabase Configuration

```
Project URL: https://bzqbhtrurzzavhqbgqrs.supabase.co
Bucket: ti84-trainer-assets (public)
File: ROM.rom (TI-84 Plus CE OS 5.8.2.0029, 4MB)
Config in: ti84-trainer-v2/bridge.js line 11 (ROM_CONFIG.supabaseUrl)
```

## Session History

**Sessions 1-64**: See `git log --oneline` for commit-level history.

**Sessions 65-75**: Full narratives in `SESSIONS_ARCHIVE.md` — covers QR button, Physical Mode pivot, Options dialog, choice flash, study guide v2/v3/v4/v4-polish.

**Sessions 76-77**: Full detail below (current + previous session).

76. **Study guide v5 — dose ladder + hybrid MCQ/FRQ queue shipped** (2026-04-14 session 76). Closed entry 75 open item (a) via full end-to-end jsdom smoke test, shipped two commits to master, and locked in the FRQ decomposition feature design for session 77.
    - **Hard rule captured — `curriculum_render/data/curriculum.js` is SACRED**. Mid-session, Task C had dispatched Codex to add Power/Type-I/Type-II MCQs directly to `../curriculum_render/data/curriculum.js`. User interrupted: "That is supposed to be sacred.. they come directly from AP classroom." Killed the Codex process before any writes landed (`git status` on curriculum_render confirmed clean). New hard rule: all MCQ additions go into `follow-alongs/data/formula-probe-supplement.js` (the `EMBEDDED_CURRICULUM_SUPPLEMENT` array), never into `curriculum_render/`. Memory file saved: `memory/feedback_curriculum_render_sacred.md` + `MEMORY.md` gained a "Hard Rules" section above "Project Structure" linking to it.
    - **Entry 75 open item (a) — v4 polish commit + ship**. The Batch A polish from entry 75 (clickable See-all cells, "untested" gray dot for absent touchedFormulas, 29 new CSS rules) was sitting in the working tree but had never been committed — HEAD at session start was `2147a03` which still had the old broken render. Shipped as commit `0c0f736` ("study guide v4 polish — see-all clickable + untested labels + 29 CSS rules"), pushed to master. No code change needed; the fix already existed on disk, just needed to leave dev purgatory.
    - **v5 ladder design decisions (locked in with user)**. User feedback on v4: "only 4 MCQ's this close to the exam seems too lenient" + wants the queue to respond to student behavior, not just calendar. Agreed shape:
      * **4-tier ladder**: Tier 0 Warmup (5 MCQ + 1 FRQ, green) / Tier 1 Steady (7 + 1, yellow) / Tier 2 Catch-up (10 + 2, orange) / Tier 3 Crunch (12 + 2, red).
      * **Two triggers, max-of wins**: calendar day-of-study-period (`TIER_CALENDAR_DAYS = [0, 8, 15, 21]`, indexed by tier) OR debt (`debtToTier(debt) = min(3, debt)`). So a student hitting day 8 auto-bumps to tier 1 even if zero debt; a student missing 2 days at tier 0 also lands in tier 2. `computeDoseTier = max(calendarTier, debtToTier(mcqDebt), debtToTier(frqDebt))`.
      * **Working ahead cancels debt**: if `mcqCompleted.length > mcq.length` (student did more than assigned), the surplus subtracts from tomorrow's debt. `debt = max(0, oldDebt + shortfall - surplus)`.
      * **Separate MCQ debt and FRQ debt tracks**. Skipping yesterday's FRQ doesn't burn the MCQ tier (and vice versa). Both feed into `computeDoseTier` as peers.
      * **Hybrid queue with tabs** (hard UX constraint: "only one problem displayed at a time"). `dailyDose` now has `mcq[]`, `mcqCompleted[]`, `frq[]`, `frqCompleted[]`, `activeTab`. Two tab buttons at the top of the queue pane, list below shows only the active tab. `advanceDailyQueueV5` is tab-aware: advances within the current tab; when current tab exhausts, flips `activeTab` to the other pool and returns its first uncompleted entry; returns null when both exhausted.
      * **Tier meter UI**: 4 segments colored green/yellow/orange/red, segments `0..tier` get `.is-active`, info button `ⓘ What do tiers mean?` opens a modal listing all 4 tiers with trigger conditions pulled from `LADDER` + `TIER_CALENDAR_DAYS` (so text stays in sync with logic).
      * **FRQ picker**: `pickDailyFrqs(state, n)` iterates units 1..9, skips units where `state.units[u].frqGrade` is already set (graded this session), sorts remaining by `unitMeanMastery` (mean of `unitState.masteryState` values, fallback 0.3), takes weakest `n`. Gate question IDs hardcoded in `GATE_IDS_V5 = {1:'U1-PC-FRQ-Q02', ..., 9:'U9-PC-FRQ-Q01'}`.
      * **FRQ paper-mode button**: each FRQ entry in `renderActiveProbe` gets `.sg-frq-paper-toggle` ("I'll write this on paper"). Clicking flips `data.frqOnPaper`, changes textarea placeholder to "Write on paper and hand in to Mr. Colson — AI grading skipped," changes Grade button to "Mark complete (paper)", and skips the `/api/ai/grade` call entirely — stores `{score: 'paper', feedback: 'Written response submitted to teacher.', submittedAt: todayISO}`.
    - **Implementation (two parallel Codex batches, then integration)**.
      * **Batch A (pure logic + tests, parallel)** — wrote `.v5-ladder-block.js` (568 lines, 16.9KB). IIFE publishing `window.__studyGuideV5__` with constants (`LADDER`, `STUDY_START_DATE='2026-04-14'`, `TIER_CALENDAR_DAYS`, `GATE_IDS_V5`) + pure functions (`daysSinceStudyStart`, `calendarTier`, `debtToTier`, `computeDoseTier`, `tierSpec`, `updateDebtFromPriorDose`, `unitMeanMastery`, `pickDailyFrqs`, `pickDailyQueueV5`, `advanceDailyQueueV5`, `setActiveTab`, `buildMcqQueue`). Re-exports v4 helpers (`daysLeft`, `computeDailyDose`, `formulaMastery`, `formulaWeight`, `formulaName`, `touchedFormulaCount`, `pickProbeForFormula`, `recordFormulaTouch`, `FORMULA_UNIT_MAP`, `UNIT_EXAM_WEIGHTS`, `TIER_MULTIPLIERS`, `BKT_INIT`, `AP_EXAM_DATE`) via `getV4()` reading `window.__studyGuideV4__` at call time so both browser and synthetic-window tests work. `buildMcqQueue` reimplements v4's coverage-floor + weight-sort loop but caps the dose at `spec.mcq` instead of `ceil(remaining/days)`. `updateDebtFromPriorDose` mutates state idempotently, floors at 0, no-ops if `dailyDose.date === today` or `dailyDose` is null. Tests: `tests/study-guide-v5-ladder.test.js` (14KB, 22 tests) using same synthetic-window pattern as v4 — `readFileSync` both `.v4-logic-block.js` and `.v5-ladder-block.js`, run v4 first to populate `__studyGuideV4__`, then v5. Covers all ladder math, tier boundaries (day 1/8/15/21), debt shortage/surplus/idempotency, `pickDailyFrqs` weakest-first + skip-graded, `pickDailyQueueV5` idempotent per date + regenerates on day change, `advanceDailyQueueV5` tab flipping + null when both pools exhausted, working-ahead cancels debt, 2-day skip bumps to tier 2.
      * **Batch M (serial HTML integration)** — surgical edits to `study_guide_diagnostic.html`. (1) Pasted `.v5-ladder-block.js` body inline into the main IIFE after the v4 logic block (lines 784-1423), updated destructure to pull from `window.__studyGuideV5__` (includes new v5 exports + keeps v4 helper names since v5 re-exports them). (2) State schema bump: `STORAGE_KEY='apStatsStudyGuideDiagnostic.v5'`, `SCHEMA_VERSION=5`, `STATE_ID='sg-state-v5'`; `makeDefaultState()` gains `doseLadder: {tier:0, mcqDebt:0, frqDebt:0}`; `normalizeState()` accepts schemaVersion 5 and adds v4→v5 migration branch that carries forward `touchedFormulas` + `units` but resets `dailyDose` to null (v4's flat queue shape is incompatible with v5's mcq/frq split). (3) `init()` localStorage read chain tries `.v5` → `.v4` → `.v3` → `.v2` with normalizeState handling each migration; after load calls `state.dailyDose = pickDailyQueueV5(state, today(), AP_EXAM_DATE)` replacing the old v4 `pickDailyQueue` call. (4) `renderQueuePane()` rewritten: `.sg-queue-header` with title from `tierSpec(tier).mcq/.frq` + subtitle from `LADDER[tier].label` and `daysLeft`, `.sg-tier-meter` with 4 colored segments, `.sg-tier-info` button opening a modal; `.sg-queue-tabs` with MCQ/FRQ tab buttons showing `completed/total` badges and calling `setActiveTab` on click; `<ol class="sg-queue-list">` rendering entries from the active tab; `.sg-see-all` disclosure stays unchanged from v4 polish. For MCQ entries label is `formulaName(formulaId)` with `Unit N · L M`; for FRQ entries label is `Unit N FRQ Gate` with `Mastery: X%` from `unitMeanMastery`. (5) `advanceDailyQueue()` now delegates to `advanceDailyQueueV5(state, currentId)` — call sites in the MCQ Next button and FRQ Grade button unchanged. (6) `renderActiveProbe` FRQ branch gains `.sg-frq-paper-toggle` button before the Grade button with the paper-mode toggle described above. (7) New `renderTierInfoModal()` renders backdrop + modal with all 4 tier rows (`sg-tier-dot` color swatch + label + trigger conditions pulled from `LADDER`/`TIER_CALENDAR_DAYS`) + the explainer paragraph. Backdrop click or Esc closes. (8) ~29 new CSS rules for `.sg-queue-header`, `.sg-tier-meter`/`.sg-tier-seg.is-tier-{0..3}`, `.sg-queue-tabs`/`.sg-queue-tab`, `.sg-modal-backdrop`/`.sg-modal`/`.sg-tier-row`, `.sg-frq-paper-toggle`. Tier colors: `#2e7d32` green / `#f9a825` yellow / `#ef6c00` orange / `#c62828` red.
    - **Structural oddity**: `study_guide_diagnostic.html` line 294 has a bare `{` opening a block scope that closes at line 783, wrapping all v4 code. This is valid JS (just an unusual block scope from the entry 74 inline paste) — v4 publishes `window.__studyGuideV4__` at line 764 inside the block, and the v5 IIFE at line 784 reads from `window.__studyGuideV4__` via `getV4()` at call time, so it works. Not a bug, just worth knowing.
    - **Test updates**: `tests/study-guide.test.js` v4 describe block converted to v5 structural assertions (`window.__studyGuideV5__` published, `LADDER` constant present, `STORAGE_KEY` uses `.v5`, `SCHEMA_VERSION=5`, `sg-tier-meter`/`sg-queue-tabs`/`sg-frq-paper-toggle` classes present, `pickDailyQueueV5` replaces `pickDailyQueue` at init site, `function advanceDailyQueueV5` present in inline logic). Kept existing describes for supplement probes and theme toggle.
    - **Verification**: `tests/study-guide.test.js` + `tests/study-guide-v5-ladder.test.js` both pass — 56/56 green. jsdom end-to-end smoke test confirmed MCQ tab renders "Sample Mean (x-bar) · Unit 1 · L7" as first queue entry with `(0/5)` badge, FRQ tab renders "Unit 1 FRQ Gate" with textarea + Grade + paper toggle, tier meter shows tier 0 active (green), info modal lists all 4 tiers. **Gotcha discovered**: the initial smoke probe showed MCQ queue empty — root cause was the probe script didn't use `ResourceLoader`, so `<script src>` data files weren't loading. Fix: `import { JSDOM, ResourceLoader } from 'jsdom'; new JSDOM(..., { resources: new ResourceLoader() })`. Keep this in mind for any future jsdom smoke probing.
    - **Files (new / modified)**: new — `.v5-ladder-block.js`, `tests/study-guide-v5-ladder.test.js`, `.v5-batch-a.md`, `.v5-batch-m.md`, `memory/feedback_curriculum_render_sacred.md`, `.supplement-audit-reaudit.md`. modified — `study_guide_diagnostic.html` (+~907 lines: v5 logic block paste + renderQueuePane rewrite + tier modal + CSS + state migration), `tests/study-guide.test.js` (v4→v5 structural assertions, +31 lines), `memory/MEMORY.md` (Hard Rules section added).
    - **Commits shipped this session**: `0c0f736` (v4 polish clickable see-all + 29 CSS rules — was sitting uncommitted from entry 75), `d91e95c` (v5 dose ladder + hybrid MCQ/FRQ queue + tier meter + info modal + FRQ paper-mode button). Both pushed to master.
    - **Entry 75 open items status**: (a) Browser smoke test — **CLOSED** via jsdom end-to-end. (b) 16 supplement probes still zero real-student signal — **STILL OPEN**, continue monitoring. (c) Power/Type-I/II still thin in main curriculum_render bank — **PERMANENTLY DEFERRED** per sacred-file rule; supplement covers it, main bank will not be touched. (d) U4-L9-QS1 + U6-L4-QS1 re-audit — **CLOSED** via Task D, both rated CLEAN with TEACHES reasoning (`.supplement-audit-reaudit.md`).
    - **PENDING FOR SESSION 77 — FRQ decomposition feature (all 5 forks locked in by user, not yet implemented)**. User direction: each FRQ should be analyzed offline into skills with supporting formulas + MCQs. Students can trade score for hints. Also solves the "right pane shows '?' for FRQ lesson number" problem.
      * **Fork 1 — A: pre-computed**. Decompositions authored offline by one Codex agent, saved to `data/frq-decompositions.json`. No live AI calls during grading.
      * **Fork 2 — numeric scoring + per-help penalties**. `E=1.0, P=0.6, I=0.2`. Penalties: **formula card = 5%**, **correct MCQ drill = 10%**, **wrong MCQ drill = 15%**. Total penalty capped at **50%**. `effectiveScore = rawNumeric × (1 - totalPenalty)`.
      * **Fork 3 — split view (iii)**. When a helper MCQ is active, it replaces the right-pane remediation; the FRQ stays in the center pane. Same decomposition data also populates the right-pane lesson details that currently show "?" for FRQ active probes — **one data source fixes both problems**.
      * **Fork 4 — Model Y punitive**. Wrong helper answer costs more than right helper answer (15% vs 10%) — the student pays for being wrong, not just for asking.
      * **Fork 5 — no undo, confirmation modal on first helper use per FRQ**. "Using helpers will reduce your score. Continue?" once per FRQ per session; subsequent helpers tap through silently.
      * **Data shape proposed**: `{"U1-PC-FRQ-Q02": {"unit":1, "topic":"...", "skills":[{"id":"...", "name":"...", "whyItMatters":"...", "supportingFormulas":["mean","std-dev"], "supportingMcqIds":["U1-L4-Q03",...], "penalty":0.1}], "maxPenalty":0.5}}`.
      * **Implementation batches proposed**: Batch A (data authoring) = ONE Codex agent reads all 9 FRQ prompts (found in `ai-grading-prompts-study-guide.js` via `GATE_IDS_SG`) + rubrics + `curriculum_render/data/curriculum.js` (read-only! sacred!) + framework + cartridge, produces decomposition JSON sequentially for consistency. Batch B (logic layer) = `getFrqDecomposition`, `recordHelperUsed`, `computeEffectivePenalty`, `computeEffectiveScore` + unit tests. Batch C (render integration) = `renderFrqHelpers` in `renderActiveProbe` FRQ branch, split-view right-pane helper MCQ display, confirmation modal, dual raw/effective score display.
    - **Open items for session 77**: (a) Implement the FRQ decomposition feature per the 5-fork design above. Start with Batch A (data authoring) since B + C both depend on the JSON shape — don't parallelize. (b) 16 supplement probes still have zero real-student signal — continue monitoring first week of use. (c) After Batch A lands, `data/frq-decompositions.json` should be sanity-checked by a second Codex agent (cheap, catches authoring drift before the UI goes live). (d) The block-scope oddity at study_guide_diagnostic.html line 294 is still there; harmless but worth flattening next time the file gets a major edit.

- **Entry 77 — v6 FRQ Decomposition feature SHIPPED (2026-04-14 late)**. All 5 forks from entry 76 landed via 4 Codex sub-agent dispatches (CC orchestrated, Sonnet 4.6 plan agent broke down the implementation into 1132-line plan → `.plan-session77.md`). Cross-agent dispatch via `.dispatch-codex.py` wrapper that reads prompt from file to avoid bash single-quote escaping issues.
    - **Batch A (data authoring, single sequential Codex)** — wrote `data/frq-decompositions.json` (~15.5 KB) with **31 skills across all 9 Progress Check FRQ gate questions** (U1-PC-FRQ-Q02 through U9-PC-FRQ-Q01). Each FRQ has 2-4 skills with `id/name/whyItMatters/supportingFormulas/supportingMcqIds/penalty` fields + `maxPenalty: 0.50`. Codex made several rubric-driven adjustments from the prompt guidance: substituted `ci-formula` for `p-value-interp` in U6/U7 (both resolve in cartridge — verified), dropped `U4-L8-Q01` and `U6-L5-Q01` where rubric called for different support, omitted `slope-ci` from U9 since that FRQ centers on a slope t-test rather than interval, added a distribution-probability skill to U4, reshaped U5 around histogram reading plus estimator comparison, split U7 and U9 to honor separate interpretation and hypothesis-writing rubric points.
    - **Batch A2 (audit, second Codex)** — produced `.frq-decomp-audit.md`: **5 PASS / 4 WARN / 0 FAIL**, zero unresolved formula/MCQ IDs. All 4 WARN entries are conceptual-only skills without tool support (U3 generalization/causation, U5 histogram/midrange, U7 scope-limit, U9 slope-hypotheses) which are acceptable by design since the `whyItMatters` field justifies the absence. No fixes needed.
    - **Batch B (logic layer + 30 tests, third Codex)** — wrote `.v6-frq-decomp-block.js` (184 lines) as IIFE publishing `window.__studyGuideV6__` with 4 functions: `getFrqDecomposition(questionId)`, `recordHelperUsed(unit, kind, payload, state)` with first-use-wins dedup, `computeEffectivePenalty(frqHelpers, decomposition)` returning [0, 0.50], `computeEffectiveScore(rawScore, penalty)` returning `{raw, rawNumeric, effective, penaltyPct, breakdown}`. Paper mode returns null effective score. Unknown raw scores normalize to `'I'`. Penalty cap applies `Math.min(decomposition.maxPenalty, 0.50)`. Tests: `tests/study-guide-v6-frq-decomposition.test.js` (327 lines, 30 tests) using synthetic-window pattern (`readFileSync` + `new Function('window', src)`). **CC fix**: one test used `toBe(0.30)` for the sum 0.05 + 0.10 + 0.15 which is `0.30000000000000004` in float — changed to `toBeCloseTo(0.30, 10)`. All 30 tests pass.
    - **Batch C (render integration, fourth Codex)** — surgical edits to `study_guide_diagnostic.html` (+421 lines, 2598 → 3019), creates `data/frq-decompositions.js` as sync wrapper publishing `window.FRQ_DECOMPOSITIONS`, adds 5 `it()` blocks to `tests/study-guide.test.js`. HTML changes: (1) bumped `STORAGE_KEY → 'apStatsStudyGuideDiagnostic.v6'`, `SCHEMA_VERSION = 6`, `STATE_ID = 'sg-state-v6'`; (2) pasted `.v6-frq-decomp-block.js` body inline into the main IIFE after the v5 logic block, added destructure from `window.__studyGuideV6__`; (3) added `defaultFrqHelpers()` + `normalizeFrqHelpers()` helpers; (4) `makeDefaultState` + `getUnit` + `normalizeState` all thread `frqHelpers: defaultFrqHelpers()` through per-unit state; (5) `normalizeState` version check expanded to accept `=== 6`, `doseLadder`/`dailyDose` gating now allows v5 or v6; (6) `init()` localStorage fallback chain v6 → v5 → v4 → v3 → v2; (7) new CSS rules for `.sg-frq-helpers`, `.sg-frq-helper-formula-btn`, `.sg-frq-helper-drill-btn`, `.sg-frq-helper-modal`, `.frq-grade-effective`, `.sg-helper-drill-card`; (8) `renderActiveProbe` FRQ branch gains helper panel after the answer/actions section listing skills with formula cards + "Drill me" buttons; (9) new `handleHelperClick`, `doHelperAction`, `showFrqHelperModal` functions with first-use confirmation modal + no-undo pattern; (10) `renderGrade` signature now accepts `effectiveScoreResult` and renders both raw and effective score; (11) `renderRemediation` gains `isFrqGate` branch with early return — uses `getFrqDecomposition(questionId)` instead of `tagEntry(questionId)`, renders active drill MCQ if one is set, otherwise renders the skill list with per-skill tool tabs (this fixes the "Lesson ?" display bug for FRQ active probes automatically, since the decomposition data supplies the names directly).
    - **Verification**: `npx vitest run tests/study-guide.test.js tests/study-guide-v5-ladder.test.js tests/study-guide-v6-frq-decomposition.test.js` → **91/91 green** (39 + 22 + 30). Full suite had 23 failures in `tests/schedule.test.js` but those are **pre-existing, unrelated** to v6 (last commit to `unit4_schedule_v4.html` was 95ec006, not this session — v6 touched only HTML + tests/study-guide.test.js + new files).
    - **Files (new / modified)**: new — `data/frq-decompositions.json`, `data/frq-decompositions.js`, `.v6-frq-decomp-block.js`, `tests/study-guide-v6-frq-decomposition.test.js`, `.frq-decomp-audit.md`, `.batch-a-frq-decomp.md`, `.batch-a2-frq-decomp-audit.md`, `.batch-b-frq-logic.md`, `.batch-c-frq-render.md`, `.plan-session77.md`. modified — `study_guide_diagnostic.html` (+421 lines), `tests/study-guide.test.js` (+5 `it` blocks + v5→v6 string updates).
    - **Open items for session 78**: (a) Manually click through the v6 HTML in a browser to verify the helper panel renders, confirmation modal fires, effective score shows next to raw score, and right-pane no longer shows "Lesson ?" for FRQ active probes. Tests cover the wiring but not the visual correctness. (b) Schedule.test.js regression needs a separate cleanup pass — not blocking. (c) 16 supplement probes still need real-student signal. (d) Block-scope oddity at HTML line 294 still there (harmless).
