# Continuation Prompt — TI-84 CE Procedural Trainer

**Last updated**: 2026-05-16 (post session 97 — **carry-over (h) COMPLETE**: Units 1, 2, 3 follow-along worksheets all backfilled, live, registered, Supabase-upserted, framework-anchored, zero registry gaps. 24 new lessons. Builds on session 96's AI Studio attach fix + framework-injection fix + 35m timeout.)
**Status**: TI-84 trainer V3 shipped, Physical Calculator Mode primary. Study guide `study_guide_diagnostic.html` feature-complete at **v7**: FRQ decomposition, review queue, mastery map constellation, inline TI-84 procedure walkthroughs, login UX, official AP rubric disclosures, inline chart rendering (70 MCQ charts + solution charts), class scoreboard, **summer unit gating with hash-based unlock codes**, **AP date auto-roll**. Teacher-facing `teacher-code-generator.html` sibling tool. **845/845 project tests green**.
**AP exam date**: passed 2026-05-07; `computeApExamDate()` auto-rolled to 2027-05-07 at midnight 2026-05-08. App is now in summer-only / next-year-prep posture.
**Current focus**: carry-over (h) DONE — Units 1–3 follow-alongs all live at `robjohncolson.github.io/apstats-live-worksheet/u{1-3}_lesson{N}_live.html`, registered, Supabase-upserted, framework-anchored, gap-free. No active follow-along work. Optional next: extend the same recipe to **Units 4–9** (registry has them, no per-lesson worksheet HTML yet; Drive IDs already in `Agent/config/drive-video-index.json`) — see Open Carry-overs (h).

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

## Key Design Decisions (TI-84 Trainer)

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

## Feature Status (TI-84 Trainer, All Core Complete)

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

---

## Study Guide State (post session 94a)

The parallel `study_guide_diagnostic.html` track is feature-complete. Current state:

- **Schema**: `apStatsStudyGuideDiagnostic.v7` (migration chain v7 → v6 → v5 → v4 → v3 → v2). v7 migration is a pure version bump — existing profiles retain full access (absence of `curriculumMode` field → treated as `'full'` at runtime).
- **Summer gating (s94a)**: New accounts created via `?mode=summer` URL param start with `curriculumMode: 'gated'` and `unlockedUnits: [1]`. Teacher issues per-student codes from `teacher-code-generator.html`; student pastes code into the enter-code panel; `applyUnlockCode` always verifies against `nextLockedUnit(state)` so codes must be redeemed in sequence (U2 → U3 → U4 …). Locked units grey out in mastery map + mini-map with 🔒 overlay; click shows toast instead of opening formula card. Daily queue filters to unlocked units; gated + empty queue shows "see teacher" message. Hash = `sha256(salt | normalizedUsername | unit)` → Crockford-B32, slice(0,6). Salt hardcoded at `'apstats-unlock-v1-3f9a2c'` in `.v7-unlock-block.js` and teacher tool — rotate both to invalidate all codes. Fixture: `('pineapple_koala', 2)` → `348BVD`.
- **AP date auto-roll (s94a)**: `const AP_EXAM_DATE = computeApExamDate()` rolls to next year's May 7 at midnight May 8 (entire exam day stays on current year).
- **Account bar**: username/password login hides when verified, replaced with "Signed in as X · Scoreboard · Sign out" strip. Create-user modal opens via text link.
- **Daily queue**: v5 dose ladder with 4 tiers (Warmup / Steady / Catch-up / Crunch), hybrid MCQ/FRQ tabs, tier meter + info modal
- **FRQ decomposition**: 31 skills across 9 gate FRQs, latent-penalty scoring (5/10/15%, 50% cap). Grade card shows official AP rubric + worked solutions (paper-mode gated).
- **Formula card modal**: LaTeX via MathJax, explain/hint/subconcepts, inline TI-84 procedure walkthrough (33+ mappings), "Practice this formula" primary action
- **Review Queue**: 7-day SM2-lite auto-aging + student graduation via "I know it"
- **Mastery Map**: 81-node constellation canvas, mini-map in sidebar + fullscreen modal with mouse zoom/pan, click-to-open formula card
- **Chart rendering**: 70 MCQ charts (singular + plural `attachments` forms) + FRQ solution-part charts (deferred-render via `<details>` toggle). Lifted from `curriculum_render/js/charts.js` into `lib/curriculum-charts.js`.
- **Scoreboard** (s92): modal fetches all student rows from `study_guide_state_backups` Supabase table, counts green mastery nodes (`lastMastery >= 0.75` out of 81), ranks descending, shows top half only. Current user highlighted; if in bottom half, separator + their row. Singleton guard prevents stacked modals. `countGreenNodes`, `fetchScoreboardData`, `showScoreboardModal` functions.
- **Question context audit**: `scripts/audit-question-context.mjs` classifies 807 served questions (OK 627 / OK_TABLE 103 / OK_CHART 70 / IMAGE_OK 3 / CONTEXT_ORPHAN 1 / CONTEXT_UNCLEAR 3). Remaining orphan + unclears are self-contained text questions.
- **Tier-jump semantics**: `debtToTier(debt)` is 1:1 capped at 3. Intended aggressive escalation, confirmed WAI.

### Load-bearing design principles

1. **Sacred file rule** — `curriculum_render/data/curriculum.js` comes from AP Classroom. Never add MCQs there. All supplements go into `data/formula-probe-supplement.js` (`EMBEDDED_CURRICULUM_SUPPLEMENT`).

2. **Latent penalty, no mode split** — there is NO practice/gate mode toggle (s82 removed it). `computeEffectivePenalty` only runs inside `renderGrade`, and `renderGrade` only fires after the student clicks Grade. Students who click helpers but don't grade see no penalty — safe exploration without a mode field. The escape-hatch note on the helper panel documents this: "Click **Grade** when you're ready for your final score — until then, helpers don't hurt you."

3. **Mastery map is motivational, not informational** — deliberately a glorified progress bar. No edges, no prereq semantics, no labels below zoom 1.8. Students get structural info from the daily queue, review queue, and formula cards. The map exists for the "my territory is turning green" emotional beat.

4. **SRS graduation is student-driven pull** — review queue lists formulas with `hintedAt` within the last 7 days. "I know it" is self-assessment (trains metacognition), not auto-graduation. 7-day auto-aging provides passive graduation. Graduation does NOT refund gate-mode penalties (`formulasViewed` stays independent — separation of concerns).

5. **Formula card → Practice closes the feedback loop** — click mastery map node → read card → tap Practice → land on the MCQ drill for that formula via `pickProbeForFormula` + `setActiveProbe`. Primary-accent button styling invites action. Disabled with tooltip when no probe pool exists.

6. **v4/v5/v6/v7 export sync** — new pure functions must be added in FOUR places per version: the standalone `.vN-*-block.js`, the inline vN export object in `study_guide_diagnostic.html`, the downstream proxy block (e.g., v5 proxies v4), AND any inline destructured reads. Sonnet missed one of the four in s85. Post-check: grep `__studyGuideV{4,5,6,7}__ = {` — each should match twice (standalone + inline).

7. **Paper mode is a cheat path by default** — `Mark complete (paper)` sets `grade.score = 'paper'` with zero content validation. Any student-facing disclosure that could reveal the answer (worked solutions, full rubric criteria, correct-answer highlights) must gate on `grade.score !== 'paper'` OR require real content submission. Codex caught this once in s89 grade disclosures; similar checks needed for any future post-grade reveal.

8. **Dynamic DOM rebuild must rebind listeners** — any function that uses `section.innerHTML = ''` or equivalent teardown to rebuild a form (e.g., `refreshAuthPanelVisibility` restore branch) destroys all child DOM nodes AND their event listeners. Cached `ui.*` refs become stale. Canonical fix: extract wiring into a helper (e.g., `wireAuthFormListeners()`) that re-queries elements + re-attaches handlers, then call it from both init and the restore branch.

### Non-obvious gotchas

- **jsdom smoke probes**: construct JSDOM with `new JSDOM(html, { url: pathToFileURL(htmlPath).href, resources: new ResourceLoader(), runScripts: 'dangerously' })`. The `file://` URL is critical — relative `<script src>` resolves against the document URL, so an `http://localhost/` URL fails with ECONNREFUSED when nothing's serving. `file://` lets jsdom fetch scripts directly from disk. ResourceLoader is needed to actually fetch them; without it, external scripts are silently skipped.
- **`[hidden]` attribute vs class specificity**: a static HTML `<div class="sg-modal-backdrop" hidden>` stays VISIBLE because the class rule `.sg-modal-backdrop{display:flex}` (specificity 0,0,1,0) beats the UA `[hidden]{display:none}` (0,0,0,1). Scope the hide rule to the combined selector — `.sg-modal-backdrop[hidden]{display:none}` (0,0,1,1) — to outrank the base class rule.
- **MathJax 3 delimiters**: LaTeX written into `textContent` must be wrapped in `\[...\]` block-math delimiters (matches the `displayMath` config at line 314-315). Undelimited strings are silently ignored.
- **CSS-pixel vs bitmap-pixel on CSS-scaled canvas**: mastery map canvas has `width=1000 height=700` attributes plus `max-width:100%`. All mouse handlers must multiply `e.offsetX` by `canvas.width/rect.width` to convert CSS → bitmap space (see `toBitmap` helper inside `showMasteryMapModal`). jsdom `getBoundingClientRect` returns zero-width, so this bug is invisible in tests — verify in a real browser or with a probe that computes coords from `computeMapLayout`.
- **Dispatch verification**: Sonnet once returned a fabricated "263/263 tests pass" result file (s88b) without touching the HTML at all. Always run `git status` after dispatch and confirm expected files are in the modified list BEFORE trusting the report. A result file listing deliverables is not evidence the deliverables exist.
- **Float precision**: `0.05 + 0.10 + 0.15 === 0.30000000000000004`. Use `toBeCloseTo(0.30, 10)`, not `toBe(0.30)`.
- **`saveSoon` debounce**: state writes are debounced. jsdom probes that read localStorage immediately after a click will see stale values.
- **Card-boundary test isolation**: asserting a specific card no longer contains text X can false-positive if X appears in another card. Slice the source to the target card's id boundary (`src.indexOf("{id:'", cardStart + 1)`) before the assertion.
- **Block-scope at `study_guide_diagnostic.html:497`**: bare `{` opens a block wrapping v4 code through line 1112. The v5/v6/v7 IIFEs and top-level `const` destructures (including `AP_EXAM_DATE` at line 2109) live OUTSIDE it. Valid JS. Flatten attempts collide with outer-scope names (`AP_EXAM_DATE`, `daysLeft`, `computeDailyDose`, likely more). Formally deferred; don't touch without a full rename plan.
- **TDZ across bare-block boundary (`window.__studyGuideV{N}__` export pattern)**: when the v4 export object literal at line 1085 references a name declared later in the outer scope (line 2109+), property evaluation happens at script-load and throws `Cannot access 'X' before initialization`. **Rule**: any v4/v5/v6/v7 export entry whose value is a `const`/`let` from OUTSIDE the bare block (line 497-1112) MUST use a getter: `get NAME() { return NAME; }`. Regular `NAME: NAME` only works for names declared INSIDE the bare block before line 1085. This is the bug that caused s94a-fix (blank page for all students after s94a shipped).

### Key files (study guide)

| File | Purpose |
|------|---------|
| `study_guide_diagnostic.html` | Main app (~5400 lines including inline v4/v5/v6 logic copies) |
| `.v4-logic-block.js` | Standalone v4 pure functions (daily dose, formula weight, BKT) |
| `.v5-ladder-block.js` | v5 tier ladder pure functions (proxies v4) |
| `.v6-frq-decomp-block.js` | v6 FRQ decomposition logic (`computeEffectivePenalty`, helper tracking) |
| `.v7-unlock-block.js` | v7 unlock codes + unit gating + AP date (`generateUnlockCode`, `applyUnlockCode`, `isUnitUnlocked`, `nextLockedUnit`, `computeApExamDate`) |
| `teacher-code-generator.html` | Teacher-facing sibling tool — single / all-units / bulk CSV code generation. Contains plaintext salt; never deploy publicly |
| `data/ap-stats-cartridge.js` | 81 formula cards with latex, explain, hint, subconcepts |
| `data/frq-decompositions.json` | 31 skills across 9 gate FRQs (no `penalty` field — stripped s89) |
| `data/study-guide-frq-bank.js` | 9 localized gate FRQ prompts + worked solutions + official AP rubrics (s89 drives grade-card disclosures) |
| `data/formula-procedure-map.js` | Formula → TI-84 procedure mappings (36 → 33 after s87 drops) |
| `data/ti84-procedures.js` | Wrapper exposing `ti84-procedures-data.json` as `window.TI84_PROCEDURES` |
| `data/formula-probe-supplement.js` | Hand-authored MCQ supplement (ONLY place to add new MCQs) |
| `lib/chart.min.js` + `lib/chartjs-plugin-datalabels.min.js` | Vendored Chart.js + datalabels plugin (s90) |
| `lib/curriculum-charts.js` | Lifted `curriculum_render/js/charts.js` + `charthelper.js` — defines `window.getChartHtml` / `window.renderChartNow` / `window.chartInstances` |
| `scripts/supplement-probe-signal.mjs` | Signal monitor for supplement probes (run on school network) |
| `scripts/audit-question-context.mjs` | Question context audit — classifies 807 served questions (s90) |

---

## Session History

**Sessions 1-64**: `git log --oneline` for commit-level history.

**Sessions 65-75**: full narratives in `SESSIONS_ARCHIVE.md` (QR button, Physical Mode pivot, Options dialog, choice flash, study guide v2/v3/v4).

**Sessions 76-92**: one line per session below. Use `git show <hash>` for full details.

| # | Commit | Summary |
|---|--------|---------|
| 76 | d91e95c | Study guide v5: tier dose ladder, MCQ/FRQ tabs, paper-mode |
| 77 | 0af87a7 | v6 FRQ decomposition: 31 skills, helper penalty scoring |
| 78 | f5d73a2 | Helper panel UI redesign + schedule test realignment |
| 79 | 52faeb4 | Formula card modal + SRS hint feed (practice/gate split, reverted s82) |
| 80 | 31050ca | Drop gate-mode confirmation + "Queued for tomorrow" chip (removed s86) |
| 81 | 1f5bbcc | Review Queue: 7-day SM2-lite decay + "I know it" graduation |
| 82 | fe94aaf | Collapse practice/gate split → latent-penalty escape hatch |
| 83 | 22adfee | TI-84 procedure walkthroughs in formula card modal |
| 84 | f9c576e | Formula modal 90vh cap + overscroll-behavior |
| 85 | abd5d8c | Mastery Map constellation: 81 nodes, zoom/pan, click-to-card |
| 86 | 687d476 | Codex content audit + Sonnet polish (tooltip, pulse, outlines) |
| 87 | e3ff567 | Apply s86 audit: drop 3 wrong map entries, fix 6 FRQ drifts |
| 88a | beef1d3 | Mastery map `toBitmap` fix for CSS-scaled canvas |
| 88b | d77b174 | "Practice this formula" button in formula card modal |
| — | 7fe8726..5da9fb0 | Interim: two-prop walkthroughs, student profiles, localized gate FRQs |
| 89 | bd1c906 | Login UX, AP rubric disclosures, FRQ audit, penalty strip |
| 90 | 53d275f | Chart rendering lift + question context audit (807 questions) |
| 91 | 83faee7 | Multi-chart rendering (plural form) + FRQ solution charts |
| 92 | 9b5f70c | Class scoreboard modal: ranked by green mastery nodes, top-half visible |
| 93 | 810ca32 | Create-user modal: password field added (bug fix), auto-generated fruit_animal usernames with vehicle tiebreaker, real name field |
| 93 | 09d1804 | Remove dead ✕ close button from create-user modal header |
| 93 | 89f22ae | Label the Remediation Panel aside (persistent heading + subheading) |
| 94a | 636cd05 | Summer unit gating: `?mode=summer` URL param, schema v7, hash-based sequential unlock codes, mastery map lock, daily queue filter, teacher-code-generator.html, AP date auto-roll |
| 94a-fix | 5aa1c76 | TDZ hotfix on `__studyGuideV4__.AP_EXAM_DATE`: s94a moved the `const AP_EXAM_DATE = computeApExamDate()` declaration to line 2109 (outer scope), but line 1086 (v4 export inside the bare block at line 497) still evaluated the name at script-load time → scope walk found the outer const in TDZ → `ReferenceError` → `init()` never ran → blank page + stuck "Loading usernames…" dropdown. Fix: `AP_EXAM_DATE: AP_EXAM_DATE,` → `get AP_EXAM_DATE() { return AP_EXAM_DATE; },`. Getter defers the lookup to property-read time (always after line 2109 initializes). 304/304 v4+v5+v7 tests pass. See gotcha at line 245 — this is the collision the memory warned about. |
| 95 | (uncommitted) | Registry plumbing cleanup. Audit of follow-along coverage exposed three disagreeing registry sources (`registry-data.js` 41 entries, `lesson-registry-data.js` 7 entries, `BAKED_REGISTRY` in `ap_stats_roadmap_square_mode.html` 5 entries), all stale vs the 45 worksheet HTMLs on disk. Root cause: `Agent/state/lesson-registry.json` is the fat truth, but only `export-registry.mjs` (Step 7.5) ran after each pipeline — the roadmap snapshot (`build-roadmap-data.mjs`) and Supabase `lesson_urls` upsert never fired post-step. **Fix:** (1) deleted dead sidecars `registry-data.js`, `lesson-registry-data.js`, `REGISTRY_INTEGRATION.md` from this repo; (2) added both filenames to `.gitignore` so `export-registry.mjs` keeps regenerating them harmlessly; (3) added Step 7.6 (re-bake roadmap snapshot via `build-roadmap-data.mjs`) and Step 7.7 (call `upsertLessonUrls` on the Supabase `lesson_urls` table) to `Agent/scripts/lesson-prep.mjs`. Both wrapped non-fatal. Now after every pipeline run, all three sinks (registry JSON, baked roadmap snapshot, Supabase live table) stay coherent. **Deferred:** full removal of `export-registry.mjs` and its 14 cross-references in the Agent repo (`pipelines/lesson-prep.json`, `tasks/export-registry.json`, panel registrations, design docs) — bigger refactor, separate session. |

| 96 | 9d87e40..f28afac (follow-alongs); a6a8706, f0d9809 (Agent) | **Unit 1 follow-along backfill + framework regen.** (1) AI Studio Drive-picker attach was reproducibly broken: `aistudio-ingest.mjs` searched the picker by *filename* and never clicked the result row, so the picker never reached "1 selected" and Insert was a no-op → Gemini got no video. Fixed with a URL-paste sequence (paste `https://drive.google.com/file/d/<id>/view` → click row → Insert); verified attach (48k tokens). (2) AI Studio media processing was down service-wide (video AND audio, reproduced manually) — bypassed via the **Gemini-in-Drive side panel** (different backend) as the transcript/slides source. (3) Added `--skip-drills` (cascades to skip animation render/upload; drills cartridge fails on a unit's first lesson via Codex Windows-sandbox `CreateProcessAsUserW 206`) and `--skip-commit` (Step 8 `commitAndPushRepos` previously always pushed, ignoring its arg) to `lesson-prep.mjs`. (4) Built all 10 U1 lessons (1.1–1.10, incl. multi-video L4/L7/L10) and registered them. (5) **Framework-injection bug**: `build-codex-prompts.mjs` `extractFrameworkSection` required bold headers `## **TOPIC N.L**` but `apstat_1/3/8_framework.md` use plain `## TOPIC N.L:` → framework silently never injected for U1/U3/U8 (worksheets were transcript-only, unanchored to AP CED). Fixed regex to optional-bold (`## \*{0,2}TOPIC`); verified the framework block (Skill/EU/LO/EK + "must align, don't exceed scope") reaches BOTH worksheet and Blooket Codex prompts. Re-generated all 10 U1 lessons framework-anchored (force via `--force-step content-gen-worksheet --force-step content-gen-blooket`; the task-runner skips when registry status=done). |
| 97 | follow-alongs 6c776c0..54dc758; Agent 98bc49a, c3dd1e0 | **Carry-over (h) COMPLETE — U2 + U3 backfilled, U1 gap fixed.** Built Unit 2 (2.1–2.9, 9 lessons; multi-video L4/L6/L7/L8/L9) and Unit 3 (3.1–3.5, 5 new lessons; multi-video L3/L5; 3.6–3.7 pre-existing combined). All framework-anchored (fw-focus 35–72 across grading rubrics), live, registered, Supabase-upserted. Raised `tasks/content-gen-worksheet.json` `timeout_minutes` 20→35 (Agent 98bc49a) after U2 L2's first run was killed mid-generation (truncated HTML, no grading file) — distinct from the benign "FAILED-but-complete" U1 1.6/1.10 timeouts. Verified framework injection works for plain-header `apstat_3_framework.md` via the f0d9809 fix (in-prompt check on 3.1). Fixed U1 L10 stale `worksheet=failed` registry status (its framework-regen FAILED on the 20m timeout pre-fix; worksheet was finalized manually but registry re-sync was skipped for regen finalizes) → registry now zero-gap across all 24 backfill lessons (U1×10 + U2×9 + U3×5). Unit 3 had NO Drive-index entries — user supplied transcripts directly via Gemini-in-Drive (recipe is media-source-agnostic). |

## Open Carry-overs

- **(a) Run `node scripts/supplement-probe-signal.mjs` on the school network** — 16 supplement probes with zero signal. Needs school network. Carried since s78.
- **(b) Real student pilot data** — no telemetry bucket yet; direct observation only.
- **(c) WEAK setup/output mapping schema** — 16 entries in `data/formula-procedure-map.js` are "uses as input" rather than "computes". User preference needed on redesign vs drop.
- **(d) Mobile touch gestures for the mastery map** — deferred from s85. ~80 LOC.
- **(e) Block-scope oddity at `study_guide_diagnostic.html:497`** — formally deferred. Don't flatten without a full rename plan. See gotcha line ~245 for the TDZ trap and the getter-defer workaround (used in s94a-fix).
- **(f) Session 94b: adaptive SRS forgetting curve** — full spec in `.session94-spec.md` §13. Ebbinghaus decay on `pKnow`, adaptive half-life tuned to exam proximity (45/21/10/5 days). Solves "empty U1 queue" risk for summer-only students. Needs real student data to tune constants before merging. Deliberately shipped separately from 94a.
- **(g) Teacher tool security hygiene** — `teacher-code-generator.html` contains the unlock salt in plaintext. Never deploy it publicly or link from the student-facing study guide. Built-in yellow warning banner, but operational discipline needed.
- **(h) ✅ DONE — Backfill follow-along worksheets (Units 1–3).** Carry-over (h) is COMPLETE: U1 1.1–1.10 (10), U2 2.1–2.9 (9), U3 3.1–3.5 (5; 3.6–3.7 pre-existing) — 24 new lessons, all live, registered, Supabase-upserted, framework-anchored, **zero registry gaps**. The original (h) scope was an undercount (it said U1 1.3–1.10, U2 2.1–2.7, U3 3.4–3.5); reality was the full units, now all done. **Optional continuation: Units 4–9** are NOT done as per-lesson follow-alongs (registry has them, no worksheet HTML; Drive IDs in `Agent/config/drive-video-index.json`). The recipe below is fully mechanical (~15 min Codex build/lesson) and applies unchanged to U4–U9:
  1. **Transcript/slides via Gemini-in-Drive** (AI Studio media is unreliable — skip it). Open the lesson's Drive video (`https://drive.google.com/file/d/<id>/view`; IDs are all in `Agent/config/drive-video-index.json`, grep by topic) and run the transcription prompt then the slides prompt in the in-Drive Gemini panel. Multi-video lessons need each video done separately.
  2. **Save** to `follow-alongs/u{U}/apstat_{U}-{L}-{n}_transcription.txt` and `_slides.txt` with header `# Video {n} — Transcript|Slide Descriptions\n# Unit {U}, Lesson {L}\n\n` (unescape Gemini's `\[ \] \*`).
  3. Stub the lesson in the registry (`upsertLesson(U,L,{topic,urls:{worksheet:<gh-pages url>,quiz:null}})`), then `cd Agent && node scripts/lesson-prep.mjs --unit U --lesson L --skip-ingest --skip-drills --skip-schoology --skip-commit`.
  4. Static-check the worksheet (correct Topic/UNIT_ID, no fallback-pattern leftovers, blanks>0, HTML closed), then commit/push the 3 files to follow-alongs `master` (GH Pages serves from master root, NOT the stale `gh-pages` branch). Use `git pull --rebase --autostash origin master` (handles CRLF-renorm dirty tree + `state/cross-agent-log.json`).
  5. Register: `updateStatus` (ingest/worksheet/blooketCsv=done, drills/animations/schoology/blooketUpload=skipped, urlsGenerated/committed=done) → `node scripts/export-registry.mjs` → `node scripts/build-roadmap-data.mjs` → `upsertLessonUrls('U.L',{worksheetUrl,quizUrl,blooketUrl})` → commit/push rebaked `ap_stats_roadmap_square_mode.html` + `roadmap-data.json`.
  - **Gotchas:** `codex-content-gen.mjs` has no resume guard but the *task-runner* skips when registry status=done — to re-generate a finalized lesson use `--force-step content-gen-worksheet --force-step content-gen-blooket` (task-IDs, not the CLI-documented `worksheet`/`blooketCsv`). Worksheet-gen timeout is now 35 min (`tasks/content-gen-worksheet.json`, raised from 20 in Agent 98bc49a) — covers the slow multi-video tail; a pipeline that still reports FAILED on timeout usually has complete artifacts (verify HTML ends `</body></html>` + grading file exists) and can be finalized manually, but a truncated HTML / missing grading file means re-run (rm the stub first, it can falsely satisfy the artifact check). Framework injects for both bold (`apstat_2`) and plain (`apstat_1/3`) header formats via the f0d9809 fix. If a regen FAILS on timeout, ALSO re-sync the registry status (the task-runner sets worksheet=failed; the regen finalize path skips registry re-sync, leaving a stale "failed" — this bit U1 L10). Full per-lesson detail + Drive IDs in auto-memory `project_aistudio_ingest_drive_picker.md`.
- **(i) Full removal of `export-registry.mjs` from Agent repo** — deferred from s95. Touches `pipelines/lesson-prep.json` (DAG node + `commit-push` dep), `tasks/export-registry.json`, `scripts/lib/commander/panels/pipeline-steps.mjs` (status mapping), `backfill-registry.mjs`, and ~10 design docs. After removal, drop the two `.gitignore` entries in `follow-alongs/.gitignore` and delete the orphaned Step 7.5 from `lesson-prep.mjs`. Until done, every pipeline run regenerates two zombie files locally — annoying but not breaking.

## Regen commands

Regenerate `data/ti84-procedures.js` wrapper after editing `ti84-procedures-data.json`:

```bash
node -e "const fs=require('fs'); const d=fs.readFileSync('ti84-procedures-data.json','utf8'); fs.writeFileSync('data/ti84-procedures.js', '// Generated from ti84-procedures-data.json — do not edit directly\\nwindow.TI84_PROCEDURES = ' + d + ';\\n');"
```
