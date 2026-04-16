# Continuation Prompt — TI-84 CE Procedural Trainer

**Last updated**: 2026-04-16 (post session 91 — FRQ solution-part charts + multi-chart rendering + tier-jump diagnosis)
**Status**: TI-84 trainer V3 shipped, Physical Calculator Mode primary. Study guide `study_guide_diagnostic.html` feature-complete at v6: FRQ decomposition, review queue, mastery map constellation, inline TI-84 procedure walkthroughs, login UX, official AP rubric disclosures, inline chart rendering (70 MCQ charts via singular + plural forms, + deferred-render solution charts). **421/421 study-guide tests green**.
**Deadline**: ~May 7 (AP exam, 22 days out)

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

## Study Guide State (post session 90)

The parallel `study_guide_diagnostic.html` track is feature-complete. Current state:

- **Schema**: `apStatsStudyGuideDiagnostic.v6` (migration chain v6 → v5 → v4 → v3 → v2)
- **Account bar** (s89): username/password login hides when verified, replaced with "Signed in as X · Sign out" strip. Create-user modal opens via text link. No Period / New-Username fields.
- **Daily queue**: v5 dose ladder with 4 tiers (Warmup / Steady / Catch-up / Crunch), hybrid MCQ/FRQ tabs, tier meter + info modal
- **FRQ decomposition**: 31 skills across 9 Progress Check gate FRQs, per-skill formula cards + drill MCQs with latent-penalty scoring (5% formula, 10% correct drill, 15% wrong drill, 50% cap). Helpers only materialize as penalty when the student clicks Grade.
- **Grade card disclosures** (s89): after grading, collapsed `<details>` for "📋 Official AP rubric" (per-part `maxPoints` + criteria + `scoringNotes` pulled from `data/study-guide-frq-bank.js`) and "💡 Worked solution" (per-part response + calculations, MathJax-rendered). Both gated on `grade.score !== 'paper'` — paper mode cannot reveal the answer key.
- **Formula card modal**: LaTeX via MathJax, explain/hint/subconcepts, inline TI-84 procedure walkthrough (33+ mappings), "Practice this formula" primary action
- **Review Queue**: 7-day SM2-lite auto-aging + student graduation via "I know it"
- **Mastery Map**: 81-node constellation canvas, mini-map in sidebar + fullscreen modal with mouse zoom/pan, click-to-open formula card, hover tooltip, pulse on highest-mastery node
- **Inline MCQ chart rendering** (s90 + s91 plural form): `attachMedia` renders both `attachments.chartType` (singular) and `attachments.charts` (plural array) forms via lifted `curriculum_render/js/charts.js`. 70 questions unblocked after s91 (59 via singular + 11 multi-chart questions via plural array that were silently missing charts before). 2-phase `getChartHtml` → `requestAnimationFrame` → `renderChartNow` with `chartCounter` canvas IDs + instance cleanup on probe change. Multi-chart CSS: `.attachment-multi-chart{display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}`.
- **FRQ worked-solution chart rendering** (s91 Phase 4): `renderGrade` solution disclosure renders `part.attachments.chartType` for each solution part. `U2-PC-FRQ-Q02` part c (normal curve) and `U9-PC-FRQ-Q01` part a (scatter) now render. Canvas inside closed `<details>` has 0×0 dimensions so rendering is deferred via a `toggle` listener that fires on first open.
- **Question context audit** (s90 + s91): `scripts/audit-question-context.mjs` classifies 807 served questions across 9 statuses. s91 extended `classifyQuestion` to treat `attachments.charts` (plural) as a chart attachment. Post-s91 counts: OK 627 / OK_TABLE 103 / OK_CHART 70 / IMAGE_OK 3 / CONTEXT_ORPHAN 1 / CONTEXT_UNCLEAR 3. The remaining 1 orphan + 3 unclears are self-contained text questions (U7-L6-Q01 describes a boxplot verbally but is answerable from CLT logic; the 3 unclears are just regex false positives on "below"/"following data"). Report at `.session90-question-audit.md`.
- **Tier-jump semantics** (s91 diagnosed): `debtToTier(debt)` in `.v5-ladder-block.js:277` is 1:1 capped at 3. A single missed day of a tier-0 dose (5 MCQ + 1 FRQ = 6 items, leave 3+ undone) immediately pins the next day to Tier 3 Crunch. WAI per tests (`study-guide-v5-ladder.test.js:178-182`). User confirmed this as intended aggressive escalation in s91.
- **Tests**: 421/421 green across 4 test files (`study-guide.test.js`, `study-guide-v5-ladder.test.js`, `study-guide-v6-frq-decomposition.test.js`, `audit-script.test.js`)

### Load-bearing design principles

1. **Sacred file rule** — `curriculum_render/data/curriculum.js` comes from AP Classroom. Never add MCQs there. All supplements go into `data/formula-probe-supplement.js` (`EMBEDDED_CURRICULUM_SUPPLEMENT`).

2. **Latent penalty, no mode split** — there is NO practice/gate mode toggle (s82 removed it). `computeEffectivePenalty` only runs inside `renderGrade`, and `renderGrade` only fires after the student clicks Grade. Students who click helpers but don't grade see no penalty — safe exploration without a mode field. The escape-hatch note on the helper panel documents this: "Click **Grade** when you're ready for your final score — until then, helpers don't hurt you."

3. **Mastery map is motivational, not informational** — deliberately a glorified progress bar. No edges, no prereq semantics, no labels below zoom 1.8. Students get structural info from the daily queue, review queue, and formula cards. The map exists for the "my territory is turning green" emotional beat.

4. **SRS graduation is student-driven pull** — review queue lists formulas with `hintedAt` within the last 7 days. "I know it" is self-assessment (trains metacognition), not auto-graduation. 7-day auto-aging provides passive graduation. Graduation does NOT refund gate-mode penalties (`formulasViewed` stays independent — separation of concerns).

5. **Formula card → Practice closes the feedback loop** — click mastery map node → read card → tap Practice → land on the MCQ drill for that formula via `pickProbeForFormula` + `setActiveProbe`. Primary-accent button styling invites action. Disabled with tooltip when no probe pool exists.

6. **v4/v5 export sync** — new pure functions must be added in FOUR places: `.v4-logic-block.js`, the inline v4 export object in `study_guide_diagnostic.html`, `.v5-ladder-block.js`, AND the inline v5 proxy block. Sonnet missed one of these four in s85. Post-check: grep `__studyGuideV4__ = {` and `__studyGuideV5__`.

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
- **Block-scope at `study_guide_diagnostic.html:303`**: bare `{` opens a block wrapping v4 code through ~line 783. Valid JS. Flatten attempts collide with outer-scope v5 destructured names (`AP_EXAM_DATE`, `daysLeft`, `computeDailyDose`, likely more). Formally deferred; don't touch without a full rename plan.

### Key files (study guide)

| File | Purpose |
|------|---------|
| `study_guide_diagnostic.html` | Main app (~3400 lines including inline v4/v5/v6 logic copies) |
| `.v4-logic-block.js` | Standalone v4 pure functions (daily dose, formula weight, BKT) |
| `.v5-ladder-block.js` | v5 tier ladder pure functions (proxies v4) |
| `.v6-frq-decomp-block.js` | v6 FRQ decomposition logic (`computeEffectivePenalty`, helper tracking) |
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

**Sessions 76-90**: one line per session below. Use `git show <hash>` for implementation details, file lists, and test-count deltas.

| # | Commit | Delta |
|---|--------|-------|
| 76 | d91e95c (+ 0c0f736 polish) | Study guide v5: 4-tier dose ladder + hybrid MCQ/FRQ tabs + tier meter + info modal + FRQ paper-mode. User interrupted mid-session with sacred-file rule (`curriculum_render/data/curriculum.js` is off-limits) |
| 77 | 0af87a7 | v6 FRQ decomposition: 31 skills across 9 gate FRQs authored by Codex, helper panel with 5/10/15% penalty scoring + confirmation modal |
| 78 | f5d73a2 | v6 helper panel UI redesign + `tests/schedule.test.js` re-alignment (20/43 → 39/39) + `scripts/supplement-probe-signal.mjs` created |
| 79 | 52faeb4 | Formula card modal (MathJax + cartridge) + SRS hint feed (`recordFormulaHint`, `formulaWeight` 3-day decay boost) + **practice/gate mode split** (reverted in s82) |
| 80 | 31050ca | Drop gate-mode confirmation for formula clicks (kept for drills) + persistent "Queued for tomorrow" chip (removed in s86) |
| 81 | 1f5bbcc | Persistent Review Queue panel with 7-day SM2-lite decay + student graduation via "I know it" |
| 82 | fe94aaf | **Collapse practice/gate mode split** into always-scored with latent-penalty escape hatch (see Design Principle 2) |
| 83 | 22adfee | Port TI-84 procedure walkthroughs into formula card modal via static `renderProcedureWalkthrough` (36 mappings in `data/formula-procedure-map.js`) |
| 84 | f9c576e | Cap formula modal height at 90vh with internal scroll + `overscroll-behavior:contain` |
| 85 | abd5d8c | **Mastery Map constellation visualizer**: 81 nodes in 9 unit clusters, mini-map in sidebar + fullscreen modal with mouse zoom/pan, click-to-open formula cards |
| 86 | 687d476 | Codex read-only content audit (145 findings: 115 OK / 29 WEAK / 3 WRONG / 4 MISSING) + Sonnet polish: remove s80 chip, cluster outlines, hover tooltip, pulse rAF on highest-mastery node |
| 87 | e3ff567 | Apply s86 audit: drop 3 wrong `normalcdf` map entries (`zscore`, `z-test-stat`, `empirical-rule`) + fix 6 FRQ skill drifts + 6 cartridge wording updates |
| 88a | beef1d3 | Mastery map click/hover/zoom fix: `toBitmap` helper for CSS-scaled canvas (5 mouse handlers) |
| 88b | d77b174 | Remove "See all formulas" disclosure + add "Practice this formula" button to formula card modal. Sonnet fabricated the deliverables; Opus applied the edits directly after catching via `git status` |
| — | 7fe8726..5da9fb0 | Interim batch between s88 and s89 (no formal session number): two-prop TI-84 walkthroughs (closes s87 carry-over), make TI-84 steps visible in formula modal, student profiles + username flow + shared Supabase backups, **localize gate FRQs with official scoring rubrics into `data/study-guide-frq-bank.js`** — the last one is what s89 Workstream D surfaces in the grade card |
| 89 | bd1c906 | Login UX (hide on verify, drop Period / New-Username, Create link → modal, sign-out strip, listener rebind helper) + official AP rubric + worked-solution disclosures in `renderGrade` (paper-mode gated) + FRQ decomposition audit (`whyItMatters` tightened on u5/u9) + **strip `skill.penalty`** metadata + JSON↔wrapper parity test (incidentally closed an s87 wrapper drift regression) |
| 90 | 53d275f | Question context audit (`scripts/audit-question-context.mjs`, 807 served questions, 9-status classification) + **lift chart rendering** (`curriculum_render/js/charts.js` → `lib/curriculum-charts.js` + vendored Chart.js) — 59 chart questions now render. `attachMedia` extended with `hasChart` branch, `isDarkMode()` patched for `data-theme="night"`, `--chart-*` CSS variables added, chart instance cleanup on active-probe change. Phase 4 (FRQ solution-part charts) deferred |
| 91 | _pending_ | Tier-jump diagnosis (debt ladder confirmed WAI) + **Phase 4 FRQ solution-part charts** (deferred-render via `<details>` toggle listener for U2-PC-FRQ-Q02 part c + U9-PC-FRQ-Q01 part a) + **discovered `attachments.charts` plural form silently missing charts** → extend `attachMedia` with `hasCharts` branch + update `classifyQuestion` in audit script. Net: OK_CHART 59 → 70 (+11 multi-chart questions unblocked), CONTEXT_ORPHAN 7 → 1, CONTEXT_UNCLEAR 3 → 3. `.attachment-multi-chart{display:grid}` CSS. 412 → 421 tests (+5 Phase 4 + +5 audit/attachMedia plural). The 1 remaining orphan (U7-L6-Q01) + 3 unclears are genuine self-contained text questions — no action needed. |

## Open Carry-overs

- **(a) Run `node scripts/supplement-probe-signal.mjs` on the school network** — 16 supplement probes still have zero real-student signal. Deterministic script, just needs network. Commits `probe-signal-reports/YYYY-MM-DD.md`. Carried since s78.
- **(b) Real student pilot data** — signals to watch now include formula modal opens, review-queue reviews/graduations, drill helper usage, mastery map interactions, grade-card rubric disclosures, chart question engagement. No telemetry bucket yet; direct observation.
- **(c) WEAK setup/output mapping schema** — 16 entries in `data/formula-procedure-map.js` are "uses as input" rather than "computes" (e.g., `phat-se → normalcdf-sampling`). Options: redesign to `{procedureId, relationship: 'direct'|'setup'}`, or drop them. User preference needed.
- **(d) Mobile touch gestures for the mastery map** — deferred from s85. Pinch-zoom + single-finger drag is ~80 LOC.
- **(e) Block-scope oddity at `study_guide_diagnostic.html:303`** — formally deferred (see Gotchas). Don't flatten without a full v5-destructure rename plan.
- **(f) RESOLVED in s91** — FRQ worked-solution chart rendering for U2-PC-FRQ-Q02 part c + U9-PC-FRQ-Q01 part a landed via toggle-deferred rendering inside `<details class='sg-grade-solution'>`.
- **(g) RESOLVED in s91** — All 7 original orphans were false positives. 6/7 had `attachments.charts` plural form that the audit missed (fixed — see s91 row). 1/7 (U7-L6-Q01) is self-contained: describes a boxplot but answerable from CLT logic. No action needed.
- **(h) RESOLVED in s91** — All 3 "unclears" are self-contained text questions flagged by the regex on "below" / "following data". U1-PC-MCQ-B-Q18 describes a normal distribution mathematically; U6-L10-Q04 describes the experiment in full; U8-L5-Q06 describes the chi-square setup fully. No visual needed. (Potential future polish: tighten `UNCLEAR_REGEX` in the audit script to reduce noise.)

## Regen commands

Regenerate `data/ti84-procedures.js` wrapper after editing `ti84-procedures-data.json`:

```bash
node -e "const fs=require('fs'); const d=fs.readFileSync('ti84-procedures-data.json','utf8'); fs.writeFileSync('data/ti84-procedures.js', '// Generated from ti84-procedures-data.json — do not edit directly\\nwindow.TI84_PROCEDURES = ' + d + ';\\n');"
```
