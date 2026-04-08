# Continuation Prompt — TI-84 CE Procedural Trainer

**Last updated**: 2026-04-07
**Status**: Data verification phase — Codex output needs ground-truth checking before implementation

---

## What This Project Is

A standalone single-file HTML webapp that trains AP Statistics students on the **mechanical key-press sequences** for every TI-84 Plus CE procedure used across Units 1-9. Students learn via guided walkthrough, then prove retention via recall drills. SRS scheduling ensures durable memory.

**Not an emulator** — a scripted procedural trainer with mid-fidelity screen rendering and state-accurate navigation paths.

## Key Design Decisions (Already Made)

1. **Standalone monolithic HTML** — single file, zero dependencies, embedded JS/CSS
2. **Mid-fidelity UI, high accuracy of state** — recognizable screens but not pixel-perfect
3. **Guided walkthrough -> Recall drill** — teach first, test from memory second
4. **Two input modes**: Virtual clickable keypad (primary) + Physical-first mode (student uses real calc alongside app)
5. **Content model**: Procedures + micro-skills as DAG nodes with prerequisite edges
6. **Skill types**: navigation (menus/tabs), parameter (values/options), confirmation (ENTER to execute)
7. **V1**: Guided + recall + SM-2 SRS scheduling
8. **V2**: Bayesian knowledge tracing + DAG prerequisite enforcement

## Files

| File | Purpose |
|------|---------|
| `ti84-trainer-spec.md` | Full spec (architecture, content model, interaction design, SRS, UI, phases) |
| `ti84-trainer-research-prompt.md` | Prompt given to Codex to produce the procedure data |
| `ti84-procedures-data.json` | Codex's output — 27 procedures, 16 micro-skills, 65 screens, 67 DAG edges |

## What Codex Produced

`ti84-procedures-data.json` contains:
- **27 procedures** (U1-U9: 1-Var Stats, histogram, boxplot, normalcdf, invNorm, LinReg, scatterplot, residual-plot, binompdf/cdf, geometpdf/cdf, normalcdf/invNorm-sampling, 1-PropZTest/Int, T-Test stats/data, TInterval stats/data, 2-SampTTest/Int, matrix-entry, chi-square GOF/Test, LinRegTTest/TInt)
- **16 micro-skills** (enter-data-l1, enter-data-l1-l2, clear-lists, nav-stat-edit/calc/tests, nav-2nd-distr/statplot, select-data-vs-stats, enter-matrix, set-plot-type, zoom-stat, diagnostic-on, access-resid-list, select-alternative, calculate-vs-draw)
- **65 screen states** (menus, wizards, results, editors, graphs)
- **67 DAG edges** (prerequisite relationships)

## Three Known Issues in Codex's Output

### Issue 1: Formulaic Common Errors (HIGH PRIORITY)
Every single one of the 27 procedures has **exactly 4 common errors on exactly steps [1,2]**. No errors anywhere else. This is Codex being lazy/formulaic. Real error coverage should:
- Vary by procedure (some have more error-prone steps than others)
- Extend to wizard/parameter steps (Data vs Stats toggle, alternative hypothesis selection, wrong list references, forgetting Calculate/Draw)
- Cover the STAT > TESTS wizard steps which are major error hotspots

### Issue 2: Y= vs Y_EQUALS Key ID Mismatch (EASY FIX)
- Keypad defines the key as `"id": "Y_EQUALS"` (label: "Y=")
- 5 steps use `"key": "Y="` instead of `"key": "Y_EQUALS"`: histogram step 2, modified-boxplot step 2, scatterplot step 2, residual-plot step 2, nav-2nd-statplot step 2
- Would break key validation in the trainer

### Issue 3: Inlined Navigation Not Factored Into Micro-Skills (DESIGN DECISION)
- 12 STAT>TESTS procedures inline `STAT > RIGHT > RIGHT` while also listing `nav-stat-tests` as a prerequisite
- 4 graphing procedures inline `2ND > Y= > ENTER` while also listing `nav-2nd-statplot` as a prerequisite
- DAG edges exist but step deduplication doesn't — the runner will need to handle this (either inline expansion or skip-if-mastered)

## Verification Status

### COMPLETED: STAT > TESTS Menu Numbering (Reference Guide verified)
**CRITICAL LESSON**: ROM string table order does NOT match menu display order. An initial attempt to derive menu positions from ROM string offsets produced WRONG results (10 items mislabeled). The TI-84 Plus CE Reference Guide (2020) is the authoritative source.

**Codex's original numbering was CORRECT all along.** It was reverted after cross-checking against the official TI Reference Guide PDF.

Reference Guide-verified STAT > TESTS menu (18 items):
```
1:Z-Test  2:T-Test  3:2-SampZTest  4:2-SampTTest  5:1-PropZTest
6:2-PropZTest  7:ZInterval  8:TInterval  9:2-SampZInt  0:2-SampTInt
A:1-PropZInt  B:2-PropZInt  C:χ²-Test  D:χ²GOF-Test
E:2-SampFTest  F:LinRegTTest  G:LinRegTInt  H:ANOVA(
```

### COMPLETED: 2ND > DISTR Menu Numbering (ROM-verified)
Codex's subset was correct: A:binompdf, B:binomcdf, E:geometpdf, F:geometcdf. JSON updated with full 16-item menu.

### COMPLETED: Wizard Field Labels (ROM-verified)
Extracted all wizard field labels from ROM region 0xAEB30-0xAED00. Full report in `ti84-rom-wizard-fields.md`.

**35+ fields confirmed matching** JSON: p₀, x̄, Sx, n, C-Level, Observed, Expected, Xlist, Ylist, FreqList, Calculate, Draw, Inpt, Data, Stats, Pooled, RegEQ, lower, upper, area, Tail, LEFT/CENTER/RIGHT, β & ρ, etc.

**3 fixes applied on 2026-04-07:**
- `numtrials` → `trials` (binompdf/binomcdf wizard fields — ROM says `trials` at 0xAEC99)
- `tail` → `Tail` (invNorm field — ROM uses capitalized `Tail` at 0xAECE5)
- `CNTB` in χ²GOF-Test result: **flagged as unverified** — string not found in ROM, needs CEmu visual check

### Still Needs Visual Verification (CEmu)
1. **Wizard field ORDER** — ROM confirms labels exist but can't confirm top-to-bottom layout
2. **Wizard default values** — what's pre-filled (e.g., List: L₁, Tail: LEFT)
3. **Result screen layout** — exact label order (e.g., does z= come before p= on 1-PropZTest result?)
4. **CNTB label** — does χ²GOF-Test actually display this on result screen?
5. **CE-specific behaviors** — Data/Stats toggle position, Calculate/Draw button placement

### Verification Resources
- **TI-84 Plus CE ROM**: `TI-84_Plus_CE/ROM.rom` (OS 5.8.2.0029) — string extraction for menu ordering
- **TI-84 CE Online Emulator**: https://ti84calc.com/ti84calc — browser-MCP connected, can click through procedures
- **Browser-MCP**: configured in Claude Code, use for visual verification of wizard/result screens
- TI official guidebook PDFs (listed in ti84-procedures-data.json meta.sources)

## Current Task: Verify Wizard Fields & Result Screens

### Completed
1. ✅ STAT > TESTS menu (ROM-verified, 10 items corrected)
2. ✅ 2ND > DISTR menu (ROM-verified, confirmed correct)

### Remaining Verification
3. Inference wizards (1-PropZTest, T-Test, etc.) — field names and order
4. Distribution wizards (normalcdf, binompdf, etc.) — field names and order
5. Result screens — output labels

### Approach
Use browser-MCP on ti84calc.com emulator to click through each procedure and screenshot wizard/result screens. ROM string extraction can also help find field labels.

## Completed Fixes

1. ✅ Issue 2 fixed: Y= → Y_EQUALS in 5 steps (histogram, boxplot, scatterplot, residual-plot, nav-2nd-statplot)
2. ✅ Issue 1 fixed: Common errors expanded from 108 → 144 total, 16/27 procedures now have errors beyond step 2. Covers Data/Stats toggle, alternative hypothesis, Calculate/Draw, menu confusion, tail direction, df entry, variance vs SD, etc.
3. ⏳ Issue 3 (inlined navigation): design decision deferred — runner will handle

## State Machine (Codex-built)

`ti84-state-machine.js` (1347 lines) — deterministic JS state machine:
- **API**: `createState(screenId)`, `createRouteState(routeId)`, `transition(state, key)`, `validKeys(state)`
- **Modes**: generic structural navigation + optional guided-route layer
- **Coverage**: all 27 procedures, all 16 micro-skills
- **Tests**: `tests/ti84-state-machine.test.js` — 52/52 passing
- **Data source**: reads from `ti84-procedures-data.json`

## V2 ROM-Based Trainer (Codex-built, 2026-04-07)

`ti84-trainer-v2/` — complete ROM-backed trainer with real CEmu WASM:

| File | Lines | Purpose |
|------|-------|---------|
| `app.js` | 1681 | Track 1 pattern recognition, Track 2 guided/recall, SRS, UI orchestration |
| `bridge.js` | 568 | CEmu WASM bridge: LCD canvas rendering, keypad input routing |
| `style.css` | 569 | System 7 Mac aesthetic (Chicago font, bevels, platinum gray) |
| `index.html` | 521 | Dev entry point (loads modules separately) |
| `standalone.html` | 4200 | Built single-file bundle (270KB) |
| `build.mjs` | 3738 | Assembles standalone from modules + data |
| `wasm/WebCEmu.js` | 73KB | Emscripten glue code |
| `wasm/WebCEmu.wasm` | 112KB | CEmu WASM binary (52KB gzipped!) |
| `CEMU_BUILD.md` | 144 | Build notes, keypad row/col matrix |
| `generated/` | — | Inlined procedure data, pattern data, state machine |

**Key architecture decisions:**
- CEmu core compiled with Emscripten 3.1.74, `-Oz -flto`, exported `_emsc_keypad_event`
- ROM loaded from IndexedDB (student provides once via file picker)
- State machine is an overlay — intercepts wrong keys, passes correct keys to CEmu
- Track 1 (pattern recognition) has unlimited branching on wrong answers
- Track 2 (calculator navigation) uses real ROM output, not mid-fidelity renderer
- V1 files untouched — Codex isolated the work due to CRITICAL upstream impact on `createState`

**Verified:**
- `node --check` passes on all JS files
- `node build.mjs` regenerates standalone.html (270KB)
- `npx vitest run tests/ti84-state-machine.test.js` → 52/52 passing
- Existing tests unaffected (only `schedule.test.js` has pre-existing failures)

## Next Steps

1. Test V2 in browser with actual ROM — verify CEmu boots, LCD renders, keypad works
2. Student pilot — have students load ROM and run through a few procedures
3. Iterate on UX based on feedback (narration tone, mobile layout, session pacing)
4. Resolve Issue 3 strategy in the runner (inline expansion vs skip-if-mastered)

## Architecture Reminder

```
CONTENT LAYER (data)     -> PROCEDURES[], MICRO_SKILLS[], SCREENS{}, KEYPAD_LAYOUT, DAG
ENGINE LAYER (logic)     -> ProcedureRunner, ScreenRenderer, KeypadController, SessionQueue, KnowledgeTracer, StateManager
UI LAYER (rendering)     -> Calculator display, Virtual keypad, Compact key palette, Session dashboard, Mode selector
```

All in one HTML file. localStorage for persistence. No server needed (export/import JSON for backup).

## Previous Context Chain

The conversation went:
1. User asked CC to research what TI-84 procedures AP Stats covers -> CC audited framework files, curriculum.json, existing apps
2. CC asked 5 clarifying questions (standalone vs cartridge, visual fidelity, interaction model, input method, scope)
3. User answered all 5 with detailed decisions (standalone HTML, mid-fidelity, guided+recall, virtual keypad + physical-first, full U1-U9)
4. CC wrote `ti84-trainer-spec.md` (full spec) and `ti84-trainer-research-prompt.md` (Codex research prompt)
5. User dispatched Codex with the research prompt -> Codex produced `ti84-procedures-data.json`
6. CC analyzed the JSON and found 3 issues (formulaic errors, Y= mismatch, inlined nav)
7. **Connection dropped** during discussion of verification approach
8. Reconnected, re-established context, user provided emulator URL: https://ti84calc.com/ti84calc
9. User asked to save this continuation prompt before proceeding with verification
10. Set up browser-MCP, navigated to emulator — saw STAT EDIT and CALC menus but arrow clicks were flaky (WebSocket timeouts)
11. User pivoted: had Codex examine actual TI-84 Plus CE ROM (`TI-84_Plus_CE/ROM.rom`, OS 5.8.2.0029)
12. Codex confirmed STAT > TESTS numbering was suspicious; DISTR looked OK
13. CC extracted menu strings from ROM binary — INCORRECTLY assumed string order = menu order
14. CC "corrected" 10 menu items based on ROM string order — THIS WAS WRONG
15. CC updated DISTR screen with full 16-item menu (DISTR was correct)
16. CC ran background agent to extract wizard field labels from ROM — 35+ matches, 3 fixes applied
17. Applied fixes: `numtrials`→`trials`, `tail`→`Tail`, flagged `CNTB` as unverified
18. Full ROM extraction report saved to `ti84-rom-wizard-fields.md`
19. Codex prompt for CEmu verification saved to `codex-cemu-verification-prompt.md`
20. CEmu automation attempted — SendKeys failed (LCD stayed off), Codex also found CEmu brittle
21. Downloaded TI-84 Plus CE Reference Guide PDF — cross-checked menu positions
22. **CRITICAL DISCOVERY**: ROM string table order ≠ menu display order. Codex's ORIGINAL numbering was correct!
23. REVERTED all STAT>TESTS changes. Menu now has full 18 items matching Reference Guide exactly
24. Lesson: never trust ROM byte offsets for menu ordering; use official documentation or live UI
25. User decided: problem-first flow (pattern recognition → calculator walkthrough), System 7 UI
26. Generated pattern recognition data: 62 canonical problems, 22 confusion pairs, 27 distractor sets
27. Codex built V1 trainer (`ti84_trainer.html`) — works but "dry as heck", overwhelming UI
28. User decided: run actual ROM in browser (Path B — never compromise quality for speed)
29. Research: CEmu has official Emscripten support (`core/os/os-emscripten.c`, `core/emscripten.mk`)
30. Wrote V2 ROM-based Codex prompt; Codex built complete V2 in `ti84-trainer-v2/`
31. V2 verified: WASM binary 112KB, syntax checks pass, build runs, standalone.html 270KB
32. **30-day student deadline**: students need SRS reps before AP exam (~May 7, 2026)
