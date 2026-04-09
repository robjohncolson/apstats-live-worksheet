# Continuation Prompt — TI-84 CE Procedural Trainer

**Last updated**: 2026-04-09
**Status**: V3 shipped — all core features implemented. CEmu primary, native state machine, clutch, auto-fill, pattern recognition, dual-track SRS
**Deadline**: ~May 7 (AP exam, 28 days out)

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

## Previous Context Chain

1-32: [See previous CONTINUATION_PROMPT.md — ROM research, Codex data gathering, verification, V1, V2]
33. Tested V2 standalone in browser — fixed CRLF corruption (.gitattributes), CEmu global stubs
34. CEmu boots successfully with real ROM in browser
35. Built verification app (ti84-verify.html) — step-through certification with discrepancy tracking
36. ROM disassembly spec + Codex prompt — targeted eZ80 extraction of wizard/result data
37. Codex produced ROM disassembly results — 20 wizards, 14 results, 13 discrepancies
38. Applied ROM findings: Color: field added to 6 wizards, CNTB removed, alt hypothesis labels fixed
39. Integrated ROM confidence into verification app — auto-passed 138 high-confidence steps
40. Corrected keypad layout from Gemini photo comparison — 6-column grid, D-pad cross
41. Built native TI-84 stat module — 5 Codex agents in 3 parallel batches, 276 tests
42. Automated procedure verification — found 13 step mismatches, fixed all, 354 tests 0 discrepancies
43. V3 integration — CEmu primary, native validates, Supabase ROM, calculator skin
44. Fixed hover jitter (brightness instead of translateY) and letter key selection (physicalKey mapping)
45. Layout fix attempts — multiple rounds, ultimately rolled back to V3 base + boosted 2nd/alpha fonts
46. Fixed ALPHA + key for menu items A-H — split into two steps, added ALPHA handler to native orchestrator
47. Clutch system built — data setup phase, auto-fill for lists/matrices, list memory, pause/resume guidance
48. Fixed auto-fill list navigation (quit-and-reenter per list) and stale memory skip
49. Added pause/resume button for mid-procedure error correction
50. Deployment discussion — GitHub Pages, Vercel, or Netlify. User will decide later.
51. Codex ROM transpilation — byte-lifted TI-84 ROM to JS (384 blocks, 3613 bytes, 0.086% coverage). Research artifact, not on critical path. Trainer uses CEmu WASM for real ROM execution.
52. Ship-readiness audit confirmed all V3 core features implemented: pattern recognition, clutch, auto-fill, dual-track SRS, walkthrough, CEmu, Supabase ROM, list memory, pause/resume. Remaining work is deployment + polish.
53. Mobile layout implemented (Codex). New `@media (max-width: 600px)` breakpoint: full-bleed chrome, collapsible walkthrough panel (tap to expand), viewport-filling calculator, sticky narration bar, tighter keypad (42px keys), icon-only buttons, dashboard hidden during walkthrough. Spec: `ti84-mobile-layout-spec.md`.
54. Answer verification feature — "Check Your Answer" card with 23 procedures, VERIFICATION_FIELDS lookup, computeExpected() preferring native computed values over stat-math.js recomputation, 0.5% tolerance for AP-appropriate precision. Spec: `ti84-answer-verification-spec.md`.
55. Fixed D-pad arrow jump on click — generic `.key:active { translateY(1px) }` conflicted with absolute positioning transforms. Fix: CSS custom property `--dpad-rest-transform` preserves each arrow's centering transform on `:active`, uses brightness-only press feedback.
56. Unit 8 ingest — cleaned up duplicate `schoologyFolderE` keys in `lesson-registry-data.js` (flat duplicate of per-period data). Updated `roadmap-data.json` with full 8.1-8.6 entries from canonical registry. Created missing `ai-grading-prompts-u8-l2.js` (3 rubrics: chi-square distributions, hypotheses/conditions, Battleship exit ticket). Completed `u8_lesson3_live.html` from 612-line stub to 1540-line full worksheet (Video 2: p-value interpretation + conclusion, Video 3: full AP exam FRQ walkthrough, reflections, exit ticket, Railway sync, aggregate drawer, AI grading). Added 8.5-8.6 to registry with proper URLs. Updated CLAUDE.md file table with all Unit 8 files. Note: 8.4 Period E Schoology folder ID (`988061148`) is a copy-paste error — same as 8.3's E folder. Needs manual correction in canonical `lesson-registry.json`.
57. Roadmap App Launcher — added "Apps" menu to System 7 menu bar in `ap_stats_roadmap_square_mode.html` with three iframe-based overlay windows: TI-84 Trainer (`https://robjohncolson.github.io/apstats-live-worksheet/ti84-trainer-v2/standalone.html`), AP Stats Quiz (`https://robjohncolson.github.io/curriculum_render/`), Equation Trainer (`https://tmux-trainer.vercel.app/#deck=ap-stats-formulas`). All use lazy-loading iframes (src set on open, cleared to `about:blank` on close). Reuses existing `.game-title-bar`/`.close-box` CSS for consistent System 7 aesthetic. Escape key + click-outside-to-close. Mobile responsive (full viewport on small screens). Deployed to GitHub Pages. Spec: `roadmap-apps-spec.md`.
