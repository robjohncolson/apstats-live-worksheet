# Continuation Prompt — TI-84 CE Procedural Trainer

**Last updated**: 2026-04-13 (evening)
**Status**: TI-84 trainer V3 shipped + Physical Calculator Mode is now primary (default). CEmu/WASM emulator demoted to a legacy option behind the Options dialog because school networks block Supabase and WASM boot fails. All core features implemented. **Parallel track**: `study_guide_diagnostic.html` (v3) is live but scheduled for a v4 shell rewrite — see entries 72 and 73. Formula coverage audit + 10 hand-authored supplement probes completed this evening; next session will spec the deadline-aware daily-queue shell.
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
58. Added Driller app (`https://lrsl-driller.vercel.app/platform/app.html?cartridge=a2t4l1-inverse-variation&mode=1`) as 5th iframe app — desktop icon, menu item, overlay window. Updated calendar minimize icon to support PNG with emoji fallback.
59. System 7 desktop icons — removed tile backgrounds, icons float directly on desktop with transparent PNGs (48x48, converted from nanobanana 1024x1024 pixel art via Pillow). Icons are individually positioned, draggable with localStorage persistence. 6 icons: calc, calendar, driller, formulas, quiz, tetris. Auto-arrange by usage frequency on page load (open counts tracked in localStorage).
60. Full window management system — close box (top-left) fully closes app (clears iframe), collapse box (top-right) minimizes to desktop icon with outline shrink animation, double-click title bar toggles maximize/restore, all app windows draggable by title bar. Calendar window gets same treatment. Fixed z-index stacking: icons at z-index 1, calendar window at z-index 3 (`position:relative` on `.window-wrap`), overlays at z-index 250. Darkened overlay backdrop to 85% opacity.
61. Rebranded hub as **"The Desk"** — subject-agnostic name for the System 7-styled educational hub. Updated page `<title>` and boot screen. Individual app names unchanged. Will expand to Algebra 2, Algebra 1, Business subjects.
62. Supabase data audit — mapped two projects: lrsl-trainer (13 active tables: users, lsrl_progress, user_progress, ghost_profiles, ghost_battles, ghost_ratings, time_sessions, etc.) and curriculum_render (7 tables: users, answers, votes, badges, user_activity, identity_claims, teacher_notifications). Both use Fruit_Animal username/password auth. Different Supabase instances, same schema patterns.
63. Built "My Progress" app window — native JS module (not iframe) that queries both Supabase projects read-only. Login via dropdown + password (verified against driller Railway API `/api/users/verify`). 4 tabs: Driller (stars/scores), Quiz Answers (per-question), Badges (achievement grid), Time on Task (session durations). 60-second cache, System 7 spreadsheet aesthetic with beveled headers and folder tabs. **Commented out for Spring 2026** — students primarily use curriculum_render quizzes, showing empty driller progress could send wrong signal. Re-enable for SY26-27.
64. ROM.transpiled.js grew to 149MB (past GitHub's 100MB limit) from Codex transpiler phases. Added to `.gitignore`, removed from tracking. File kept locally as research artifact. Separate from trainer functionality.
65. QR code share button added to the trainer (commit `2302536`). Small button next to the titlebar generates a QR code students can scan to open the trainer on their phone. See `CONTINUATION_PROMPT_CODEX.md` for the parallel ROM-transpiler progress around the same time (Phase 25G, 0xB608 seeds landing in commit `1836e80` so the OS event loop runs 50K steps).
66. **Pivot — Physical Calculator Mode** (commit `ba6ae75`). Edgar reported the WASM emulator fails on school networks: Supabase is blocked and WebCEmu itself errors out. Since every student owns a physical TI-84 anyway, we added a new render path that uses the existing `generated/data-procedures.js` data (narration, key, highlight, commonErrors) to display big text instruction cards instead of an on-screen calculator. Advance bypasses `pressButton` key validation and just calls `nextRouteState(step)` directly. Data-setup and result-review phases get analogous cards. Zero new dependencies, fully offline. Verified end-to-end in jsdom: data-setup → step 1 of N → advance → back, all button states correct, localStorage persists the mode.
67. **Default flipped to Physical Mode** (commit `a976af6`). New cohort logic: `parsed.physicalMode !== false` — fresh installs get physical, legacy users with no explicit preference are grandfathered into physical, anyone who explicitly opted out stays in emulator. Verified across four cohorts in jsdom.
68. **Options dialog** (commit `48b5605`). Titlebar "Firmware" button renamed to "Options" and routes through a new `renderOptionsDialog()` that contains Firmware + mode-toggle. Bottom `physical-mode-toggle` strip removed from the physical view. `open-rom-dialog` and `toggle-physical-mode` handlers auto-close the Options dialog for clean chaining. Purpose: keep the student-facing physical view focused on just the step card.
69. **Choice-button flash feedback** (commit `7a97232`). Track 1 pattern-recognition buttons now shade green (correct) or red (wrong) for 650ms before the panel transitions to the walkthrough or branch intro. New `app.choiceFlash = { procedureId, kind }` state, `handleChoice` sets the flash + banner, renders, awaits 650ms, clears, then proceeds. CSS classes `.choice-flash-correct` / `.choice-flash-wrong` provide shaded background + bevel. Reason: previously students never saw which button they clicked — the panel just swapped out instantly.
70. **Known stale state (not yet acted on)**: The autonomous frontier runner started a transpile at ~19:06 on 2026-04-11 that ran ~53 min with full CPU and then died silently (PID 14700 gone, `ROM.transpiled.js` / `report.json` still stamped 15:23). Root cause not diagnosed; current `ROM.transpiled.js` is the successful 0xB608 build from commit `1836e80`, which is fine. Logs: `TI-84_Plus_CE/transpile.log`, `TI-84_Plus_CE/new-seeds*.txt`. See `CONTINUATION_PROMPT_CODEX.md` for the ROM-side implications.
71. **Study guide diagnostic v2 — bug fixes + compact UI redesign** (2026-04-12 → 2026-04-13). `study_guide_diagnostic.html` is a single-file AP Stats worksheet: 9 per-unit cards, each with an MCQ/FRQ/Both mode toggle, MCQ probes drawn from `EMBEDDED_CURRICULUM` (one per lesson, up to 6 per unit), one gate FRQ from the College Board Progress Check AI-graded via `/api/ai/grade`, and a "Show me what to focus on" button that builds a personalized prioritization from MCQ signal + FRQ grade + AP Course Framework metadata. Exports to standalone HTML that doubles as student save file and teacher submission. Initial creation at `33d759c`. This session's fixes and features, in order:
    - Escaped `</script>` in export template literal so the HTML parser doesn't bail mid-file (`1759a0f`).
    - Moved `today` const above `makeDefaultState()` to resolve a silent TDZ crash that broke the IIFE (name/period/date inputs showed but unit cards never rendered) (`0be56ea`).
    - Collapsible unit cards + "I'll work this out on paper" FRQ toggle — withholds AI grading on incomplete text but still runs focus synthesis; prompts student to submit written work to Mr. Colson (`0c1b279`).
    - MCQ choice layout fix — replaced `display:grid` wrap (stacked key above value) with a flat flex row; `width:100%` on label; mirrors `curriculum_render`'s proven CSS. Image path resolution made dynamic via `document.querySelector('script[src*="curriculum_render/data"]')` so attachments load regardless of where the page is served from (`0d3e0c4`, `daf97ab`).
    - MathJax v3 loaded from `cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js` with `typesetPromise()` called after each unit render for LaTeX in prompts and choices (`f26ceeb`).
    - `window.RAILWAY_SERVER_URL` fallback — `../railway_config.js` doesn't exist at the `school/` level (only `curriculum_render/railway_config.js`), so the `<script src>` silently 404'd and the URL was never set. Hardcoded `https://curriculumrender-production.up.railway.app` as fallback, matching the pattern every other worksheet uses (`fa2ee20`).
    - **Curriculum_render server fix** (cross-repo, `curriculum_render` main branch commit `495ff31`): `normalizeGradingResponse` in `railway-server/server.js` was stripping focus-synthesis responses because it only understood E/P/I grading format — it would see `{priority, overallSummary, focusLessons, synthesisNote}`, find no `score` key, and return the fallback `{score:'I', feedback:'Unable to determine score...'}`. Client-side `normalizeFocus` then got that and produced the stub message "The AI returned a limited focus summary for this unit." Fix: added a short-circuit before the fallback that passes through responses with `priority`/`focusLessons`/`overallSummary` keys as `{...parsed}`. Railway auto-redeploys on push to main.
    - Debug logging in `runFocus` — raw API response is now `console.log`-ed with tag `[StudyGuide] focus synthesis raw response:` so we can diagnose future mismatches (`894fa5e`).
    - Resource card links rebuilt — prior code emitted `./u${unit}_lesson${lesson}_live.html` and `./u${unit}_l${lesson}_blooket.csv` for every probe, producing 404s because the real filenames use multi-lesson patterns (`u4_lesson1-2_live.html`, `u4_l3_l4_l5_blooket.csv`). Replaced with static `WORKSHEET_FILES` + `BLOOKET_FILES` lookup tables keyed by `"unit-lesson"` that only contain entries for files that actually exist on disk. Added deep-linked `../curriculum_render/index.html?u=N&l=M` quiz URL (curriculum_render supports `?unit=N&lesson=M` or `?u=N&l=M` per its `handleURLNavigation`). Added global app links for Equation Trainer (`tmux-trainer.vercel.app/#deck=ap-stats-formulas`) and Driller (`lrsl-driller.vercel.app/platform/app.html`) since those apps aren't lesson-specific (`4b074dd`).
    - **Compact UI redesign pass** — instructions box collapsed by default via `<details>`/`<summary>` (no JS); resource card links rendered as a 2-column auto-fill pill-button grid (`.resource-link-grid` + `.resource-link-btn`) instead of `<ul>/<li>/<a>`; unit-header padding 22px → 14px, unit-body 22px → 14px, unit-section 18px → 14px, probe 18px → 14px; textarea min-height 180px → 110px; action/probe button min-height 46px → 40px; status/chip badges 32px → 26px. Added TI-84 Trainer (`https://robjohncolson.github.io/apstats-live-worksheet/ti84-trainer-v2/standalone.html`) to every resource card (`bdba8a0`).
    - **Files**: `study_guide_diagnostic.html` (~900 lines), `ai-grading-prompts-study-guide.js` (exposes `GATE_IDS_SG`, `buildReflectionPromptSG`, `buildFocusSynthesisPromptSG`, `getFrameworkContextSG`, `stripFrqBoilerplateSG`, `STORAGE_KEY_SG = 'apStatsStudyGuideDiagnostic.v2'`), `tests/study-guide.test.js` (structural assertions).
    - **Open items**: (a) Verify the focus-synthesis server fix lands in production after Railway auto-redeploy — browser console should show `[StudyGuide] focus synthesis raw response: {priority, overallSummary, focusLessons, ...}` on success. (b) Blooket + worksheet lookup tables are static; new lessons need to be added to both maps in `renderResourceCard`. (c) Units 1 and 2 have no follow-along worksheets or Blooket CSVs yet — lookup tables correctly show nothing for these, student still sees quiz app + trainer links.
72. **Study guide diagnostic v3 — focused single-question redesign** (2026-04-13). User feedback on v2: "the goal is total diagnostic coverage in the most painless, efficient manner" and "there should only ever be one problem displayed." v2 showed all 9 unit cards simultaneously with DAG mini-visualizations — too noisy, too much to scan. v3 rewrites the shell as a three-pane focused layout:
    - **Spec**: `.study-guide-spec-focused.md` — goal, three-pane ASCII diagram, paper/night color themes (Paper: `#f7f2e8` bg / `#2a2520` text / `#7a4a1f` accent; Night: `#14171c` bg / `#e4e7ec` text / `#6ca6ff` accent), state schema v2→v3 migration, AI-judgement consumption table, acceptance criteria. Written first, then handed to the Plan agent to produce a 4-batch dispatch plan with self-contained Codex prompts.
    - **Dispatch mechanics**: Used `.dispatch-codex.py` wrapper that reads a prompt from a file and passes it via `subprocess.run` argv (bypassing the bash single-quote escaping bug from the previous TI-84 session). Parallel batches A/B/C (CSS/shell, state schema, pure-logic helpers) dispatched to Codex subagents; serialized Batch M for the big render-pipeline replacement since all four touch the same HTML file.
    - **Batch A (CSS + shell)**: Added `:root { --sg-bg, --sg-text, --sg-accent, ... }` theme variables with `:root[data-theme="night"]` override; replaced legacy `.unit-card` / `.dag-panel` styles with `#sg-layout` CSS grid containing `#sg-rail` (left), `#sg-active` (center), `#sg-remediation` (right); added `#theme-toggle` Paper/Night button with `applyTheme(theme)` that sets `document.documentElement.dataset.theme` and persists to `state.theme`.
    - **Batch B (state v3 + FRQ→BKT bridge)**: Bumped `STORAGE_KEY → 'apStatsStudyGuideDiagnostic.v3'`, `SCHEMA_VERSION → 3`, `STATE_ID → 'sg-state-v3'`. Extended `makeDefaultState()` with top-level `theme: 'paper'`, `activeProbe: null`, and per-unit `priority: null`. `normalizeState()` handles v2→v3 migration (copies existing `mcqAnswers/mcqResults/frqAnswer/frqGrade/focusSynthesis/masteryState` forward, adds v3 fields). `init()` reads v3 storage first, falls back to v2 migration + immediate re-save. New `applyFrqFocusToBkt(unit, focus)`: iterates `focus.focusLessons[].loIds`, deduplicates, and calls `BKT.updateMastery(prior, false)` once per unique loId — this is the FRQ→BKT bridge since FRQ gate IDs aren't in `question-lo-map`, so the AI's focus synthesis becomes the signal source. Wired into `runFocus` right before `saveNow()`.
    - **Batch C (pickers + deep links)**: Added four pure-logic helpers. `pickProbeForLo(unit, loId)` scans `EMBEDDED_CURRICULUM` for MCQs tagged with `loId` as primary or secondary, prefers untouched probes, falls back to `ProbeSelector.selectProbes` when no tagged match exists. `pickNextWeakest()` flattens all `topology.units[u].nodes[i].loIds`, sorts by mastery ascending, walks the sorted list calling `pickProbeForLo` until something returns. `buildCurriculumLink(unit, lesson, questionId)` returns `../curriculum_render/index.html?q=QID` or `?u=N&l=M`. `setActiveProbe(unit, questionId, source)` validates source against `['manual','next-weakest','lo-click']` and mutates `state.activeProbe`.
    - **Batch M (render pipeline swap + regression recovery)**: Deleted `renderUnits`/`renderUnit`/`rerenderUnit`/`renderDagPanel` and the `<script src="lib/dag-renderer.js">` tag. Added `renderTreeRail()` (left pane: weak-spots heading, unit cards sorted by mean mastery, nested LO buttons with priority-high/medium/low classes, "Next weakest" button at bottom, delegated click handler routes LO clicks through `pickProbeForLo` → `setActiveProbe`); `renderActiveProbe()` (center pane: single probe card with prompt + MCQ radios, Check button that updates `mcqResults` + loops `loIdsForQuestion(qid)` to call `BKT.updateMastery`, then re-renders rail and remediation; leaves the checked card visible until Next); `renderRemediation()` (right pane: lesson topic + skills from `UNIT_FRAMEWORKS`, focus-synthesis reason when available, deep-link to curriculum_render); `markActiveRailRow()` highlights the currently-active LO button. `init()` now calls `applyTheme(state.theme) + renderTreeRail() + renderActiveProbe() + renderRemediation()`. Test suite updated to assert v3 shape (`sg-rail`, `sg-active`, `sg-remediation`, `theme-toggle`, `sg-state-v3`, `../curriculum_render/index.html?u=`).
    - **Batch M regression + recovery**: The first Codex dispatch for Batch M timed out at 900s but had already written partial changes to disk — it correctly added the new `render*` functions but ALSO deleted 11 helper functions it should have preserved (`unitTitle`, `unitTopic`, `examWeight`, `lessonTitle`, `videoUrl`, `tagEntry`, `loIdsForQuestion`, `unitTopology`, `ensureMasteryState`, `buildProbes`, `buildProbesLegacy`, `probesFor`, `attachMedia`) plus the Batch B `applyFrqFocusToBkt` and the Batch C `pickProbeForLo`/`pickNextWeakest`/`buildCurriculumLink`/`setActiveProbe`. Recovery: instead of reverting, I pulled the helper bodies from HEAD and the Batch B/C prompt specs, then patched them back in with a single `Edit` call between `defaultMasteryValue` (~line 377) and `unitDisplayTitle`. 27/27 `tests/study-guide.test.js` now pass; 23 failing `tests/schedule.test.js` are pre-existing and unrelated.
    - **Files**: `study_guide_diagnostic.html` (~1217 lines, +263 from v2), `tests/study-guide.test.js`. Spec: `.study-guide-spec-focused.md`. Dispatch scaffolding: `.focused-batch-a.md`, `.focused-batch-b.md`, `.focused-batch-c.md`, `.focused-batch-m.md`, `.dispatch-codex.py`.
    - **Open items**: (a) Visual smoke test in browser — open `study_guide_diagnostic.html`, verify rail populates with weak LOs, click an LO button, verify active probe renders and Check button updates mastery + refreshes rail. (b) Test the Paper/Night toggle visually. (c) v2 localStorage data from existing students will auto-migrate to v3 on first load; if a student reports missing data, check DevTools localStorage for both keys. (d) FRQ gate IDs still aren't tagged in `question-lo-map.js` — the FRQ→BKT bridge relies entirely on AI focus-synthesis `focusLessons[].loIds`, so a flat AI response means no mastery drop. Worth monitoring in production.
73. **Study guide v3 feedback + formula-probe mapping pass** (2026-04-13 evening). Student-UX review of v3 turned up five real problems with the tree-rail layout: (1) left pane shows weak LOs for every unit simultaneously — overwhelming, feels like a lot of work; (2) units appear in mastery-ascending order so the rail opens with "Unit 6" instead of "Unit 1" for no reason the student can see; (3) every skill defaults to 30% mastery on first load, which reads as "you're failing"; (4) students are being sent off to Formula Defense to practice formulas rather than having the formulas woven into the diagnostic itself; (5) `VAR-3.D` / `UNC-1.B` style framework codes are student-visible in rail + remediation, creating noise. Agreed direction for v4 shell (not yet implemented):
    - Collapse rail from "every weak LO in every unit" down to a small daily queue ("Today: 5 questions") with a disclosure toggle for "See all units."
    - Deadline-aware dose: `ceil(remainingWork / daysLeft)` clamped to [3, 12]. Today (~24 days out) that's 4-5 questions; by May 1 it's 10+. AP exam is ~2026-05-07.
    - Weighted picker for the queue: `p(formula) ∝ exam_weight(unit) × tier_multiplier × (1 - mastery)` where tier multipliers are core=4, regular=3, power=2, support=1. U1/U4/U6 dominate early; U8/U9 support barely surfaces until core is mastered.
    - Coverage floor: before the queue can repeat any formula, every core+regular formula (32 total) must have been touched at least once.
    - Drop default 30% → render as neutral "untested" dot, only show % after the student actually answers. BKT still runs under the hood.
    - Natural unit order 1→9 in any "see all" disclosure (no mastery-sort surface).
    - Student-visible labels use formula NAMES from Formula Defense (e.g., "SD of p-hat", "One-sample t statistic") instead of framework skill IDs. IDs stay in state for BKT, just never rendered.
    - **Formula-probe mapping** (backing data for the new queue engine, saved this session):
      * **Source of formulas**: `C:/Users/rober/Downloads/Projects/tmux-trainer/ap-stats-cartridge.js` — `AP_STATS_CARTRIDGE.commands[]` has **81 formulas** across 8 domains (descriptive, probability, distributions, inf-proportions, inf-means, chi-square, regression, inference) and 4 tiers (core=18, regular=14, power=14, support=35).
      * **Rigorous tagging pass** — 4 parallel Explore agents reviewed all 817 MCQs in `C:/Users/rober/Downloads/Projects/school/curriculum_render/data/curriculum.js` (split: descriptive+probability / distributions+regression / inf-proportions+inf-means / chi-square+inference). Each agent was instructed to apply a strict "central skill being tested" quality bar, not keyword matching. A quick earlier audit claimed 73/81 covered but was too optimistic; the rigorous pass brought that down to **70/81**.
      * **xbar-se rescan**: batch 3 returned a typo'd ID (`U25-L7-Q06`). CC found `U7-L2-Q06` (novels CI, distinguishes s/sqrt(n) from s/sqrt(n-1)) directly while dispatching Codex in parallel via `--read-only` cross-agent. Codex returned three additional candidates (`U7-L5-Q01` canned corn, `U7-L5-Q05`, `U7-L2-Q03`); CC spot-verified Q01, added Q01+Q05 to the map entry alongside Q06. Final tagged count after rescan: **71/81**. Codex's return envelope reported `files_changed: [formula-probe-map.json, formula-probe-supplement.js]`, but `git status` + spot grep confirmed those were false positives (files untouched).
      * **10 hand-authored supplement probes** drafted for the uncovered formulas, one each: `lincomb-mean` (U4-L9-QS1, linearity of expectation w/o independence), `slope-mean` (U9-L2-QS1, unbiased estimator), `slope-sd` (U9-L2-QS2, theoretical vs sample SE), `resid-s` (U9-L1-QS1, √(SSE/(n−2))), `std-resid-chi` (U8-L5-QS1, (O−E)/√E vs cell χ² contribution), `power` (U6-L6-QS1, 1−β), `margin-error` (U7-L2-QS1, t*·SE), `width-ci` (U6-L4-QS1, n = (z*σ/ME)² round up), `type-i-error` (U6-L4-QS2, drug efficacy context), `type-ii-error` (U6-L4-QS3, bolt strength context). Each probe has 5 choices with distractors that correspond to specific misconceptions (not random wrong numbers), plus a `reasoning` field for the remediation pane. Saved to `data/formula-probe-supplement.js` as `EMBEDDED_CURRICULUM_SUPPLEMENT` — same schema as main curriculum so the study guide can merge both arrays at load time. New ID namespace: `U{N}-L{N}-QS{N}` (QS = supplement). Combined coverage with supplement merged: **81/81**.
      * **Gap this surfaced in the main curriculum bank**: Type I/II error interpretation, power, margin of error computation, and sample-size-for-ME are all AP exam staples but have zero dedicated MCQs in `curriculum_render`. Worth flagging to whoever maintains that bank.
    - **Files (new)**: `data/formula-probe-map.json` (81-formula lookup table with notes + gap list + per-tier coverage summary), `data/formula-probe-supplement.js` (10 hand-authored MCQs matching `EMBEDDED_CURRICULUM` schema).
    - **Open items**: (a) Review the 10 supplement probes — especially U4-L9-QS1 (lincomb-mean independence caveat) and U9-L2-QS2 (slope-sd conceptual vs computational), the rest are straightforward computation. (b) Write the v4 shell spec (daily queue engine + deadline-aware dose + weighted picker + formula-name labels + collapse rail + drop 30% defaults + natural unit order) before coding. (c) Merge `formula-probe-supplement.js` into the study guide's load path — it's written as a separate file but nothing consumes it yet. (d) The v3 tree-rail UX is still live in production until v4 ships; students will keep seeing the overwhelming rail.
