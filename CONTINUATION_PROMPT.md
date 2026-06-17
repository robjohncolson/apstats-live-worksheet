# CONTINUATION PROMPT — CANDY economy REVIVED (avatar poke + 6-number materialized ledger + DOGE convert/materialize floors, s15) ; calendar initial-load fix ; cr identity #2 ; grade-integrity + calendar COMPLETE

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-17 (session 15 — candy economy revived + rebuilt).
> follow-alongs HEAD = `040726a`. Repo `apstats-live-worksheet`, branch `master`. **GH Pages auto-publishes `master`**
> and **`roster-server/` auto-deploys to Railway on push** (`roster-production-12c1.up.railway.app`). Sibling repo
> **curriculum_render** (HEAD `6626dc3`, branch `main`) ALSO auto-deploys: GH Pages (the quiz app) + the cr Railway
> classroom/AI server (`curriculumrender-production.up.railway.app`) when `railway-server/**` changes. cr is local at
> `C:/Users/rober/Downloads/Projects/school/curriculum_render`; ⚠ stage only own paths (it has many unrelated dirty files).
> Teacher tests on the **public GH Pages URL** — commit+push promptly; `file://` is not a valid surface. Style:
> brainstorm → spec → implement (user reviews). ultracode ON = workflow-investigate + adversarial-review before pushing.
> `browser-harness` can't run on this Windows host (no AF_UNIX). Memory dir:
> `C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.
> A real **Dogecoin Core node runs on this box with ~10,273 DOGE** (RPC LIVE; cli at `C:/Program Files/Dogecoin/daemon/dogecoin-cli.exe`,
> not on PATH). **NEVER broadcast a real send without explicit per-send confirmation.**

## ⏭ SESSION 15 SHIPPED (2026-06-17) — calendar load-fix + cr identity #2 + CANDY economy REVIVED (poke + 6-number ledger + DOGE floors)

fa HEAD `040726a`; cr HEAD `6626dc3`. **The candy/DOGE feature is REVIVED — the teacher is re-engaged and actively building it**
(NOT deprecating). Every item below was adversarially reviewed (3-lens workflows) + pushed; the teacher tests on the public URL.

1. **Calendar initial-load crop FIX (fa `e4d77f8`).** The dynamic focus window sized from a COLD `/grade` cache on first
   paint → next-up resolved to an early/already-done lesson → the window cropped the true next lesson (self-corrected only after
   the user paged the calendar). FIX: force ONE `rCal()` on the cold→warm `/grade` transition in `renderDoNowGrades`.
   paintLocalDoneCells's lock-flip rCal escalation CAN'T cover it — it scans only RENDERED cells and the corrected next-up cell
   is the one cropped out of the DOM. Mirrors the summer-schedule loader's one-time rCal. Calendar suites green.

2. **cr identity cheap-wins #2 (curriculum_render `4314897`, branch `main`).** The two HOLEs left from `6c60965`:
   **HOLE 4** focus/visibility roster refresh — and EXPOSED `window.refreshRosterStatus` (it was IIFE-local, so the s11 cross-tab
   `storage` refresh + `_notifyAuthExpired` were silently no-op'ing). **HOLE 5** evict the stale peer cache on a genuine in-session
   identity switch — clears the IDB **`peerCache` store** (the review caught that `localStorage.removeItem('classData')` ALONE is a
   no-op on the primary IDB path: peers live in the `peerCache` store read by `rebuildClassDataView`). Gated so a same-user reload
   keeps its warm cache. cr suite 1415/8 baseline.

3. **CANDY POKE (fa `b077e97` + cr `6626dc3`).** Tap a peer's avatar in the Live Classroom → send 1 candy (Facebook-poke style):
   optimistic "Sent 1🍬 · Undo" (3s, commit DEFERRED so Undo needs no server reversal) → real `POST /wallet/gift` → COSMETIC
   `candy_gift_received` relayed over the cr classroom WS so the recipient sees a toast (USERNAME ONLY — no real names; balance is
   always server-truth so a spoof can't mint candy). Reuses the existing gift backend + the avatar click→username hit-test in
   `classroom-board.js` + the toast system. Fixed 1 candy; per-recipient ~10min cooldown (armed OPTIMISTICALLY pre-POST to close a
   double-tap race) on top of the server 20/day cap. cr-server adds a `candy_gift_received` case → `broadcastToClients` (global,
   like `user_online`; clients filter by `toUsername`). `tests/candy-poke.test.js` (11). Spec: `CANDY_POKE_SPEC.md`.

4. **CANDY LEDGER — "materialized candy" 6-number model (fa `bdb7f8d`; migration `0022` USER-RUN — ✅ TEACHER RAN IT).**
   `Earned + Received = Gifted + Converted + Materialized + Owed`. **Spendable === Owed** (the un-realized pool IS what's free to
   gift/convert), so the spend guard subtracts MATERIALIZED (`candy_given`), NOT the retired `candy_eaten`. **NO new columns** —
   all six map to existing data (Materialized = `candy_given`). **"Eat" RETIRED** (`/wallet/eat`→no-op; `candy_eaten` now vestigial).
   `mark-given` cap re-based to Owed-eligible (Earned+Received−Gifted−Converted), monotonic-safe. Students see "N earned · M in hand
   · O still coming" (the wallet is now ON by default for students). Dashboard "Owed 🍬" worklist + 6-number tooltip-on-hover +
   identity-based overspend ⚠. **`0022_retire_candy_eaten.sql` = CREATE OR REPLACE doge_spend/doge_gift (candy_eaten→candy_given in
   the 3 spendable guards; no columns) — ALREADY RUN.** Spec: `CANDY_LEDGER_SPEC.md`.

5. **DOGE convert-floor + 5-DOGE materialize threshold (fa `040726a`, NO migration).** Convert floor is now DYNAMIC = 1 DOGE's
   worth of candy at the live price (`minConvertCandy` = `candyPerDoge` ≈ 2.4; floats with DOGE/USD), replacing the fixed 5-candy
   min — a kid banks fractional DOGE. New `MIN_MATERIALIZE_DOGE=5`: in-app DOGE only goes ON-CHAIN once UNSENT ≥ 5 (no dust sends);
   dashboard ✓send arms only at ≥5 (else "needs 5 to send"), `planSends` skips sub-5 (reported, accruing), student sees
   "(goes on-chain at 5 Ɖ)". `mark-sent` keeps a manual override below 5. Conservation unchanged.

- **TEACHER DECISIONS this session:** **#1 (Live Classroom poll/vote modeling) = DEPRECATED** ("too extra", parked far back).
  **#2 (cr identity cheap-wins) = SHIPPED** (above). **#3 (Schoology UID coverage) = DEFERRED to ~Sept 1** — it becomes necessary
  when grades sync to Schoology; the teacher doesn't have `ROSTER_TEACHER_SECRET` and is fine trading that security for smoothness
  until then. Do it LAST. **CANDY/DOGE = REVIVED**, actively built (poke + materialized ledger) — do NOT treat it as paused.
  The mental model: **candy is the social/delight currency** (earn → gift via avatar poke → teacher materializes physical candy
  weekly from the dashboard Owed worklist); **DOGE is the optional appreciating-asset lesson** (convert candy at the 1-DOGE-worth
  floor → DOGE accrues in-app → materializes on-chain at 5 DOGE).
- **CANDY LEDGER Phase 2 (OPTIONAL, NOT built):** a weekly "to give THIS WEEK" grouping needs ONE additive column
  `last_materialized_at timestamptz` (the only further migration). Today the running **Owed** column already serves as the worklist.

## ⏭ SESSION 14 SHIPPED (2026-06-17) — Desk CALENDAR cohesion + accessibility + tactility polish

HEAD `0db94a2` (one commit since `f13ac7a`, pushed → GH Pages auto-republishes). From "make the calendar more dynamic /
polished / cohesive + sharpen the code." Ran a 6-lens design workflow (40 proposals → synthesize → adversarial critique →
finalize) then a 3-agent adversarial review (verdict **SHIP**; 6 minor/nit findings ALL folded). Spec + the unshipped queue:
`CALENDAR_POLISH_PROPOSAL.md`. Memory: `project_calendar_polish.md`. Edits all in `ap_stats_roadmap_square_mode.html` (the
Desk) + new `tests/calendar-cohesion.test.js` (24). Full root suite **7188 pass / 6 fail** (the 6 = the user's pre-existing
onboarding refactor, UNCHANGED — desk-gating-fixes / desk-self-signup / desk-signin-wall / desk-user-role).

- **SHIPPED (7 items, all additive / behavior-preserving / in the System-7 aesthetic):**
  1. **Legend decodes every overlay STATE** — collapsed `<details class="legend-states">` "What the marks mean" key
     (today/up-next/done/in-progress/ahead/locked/PC/poster/ready/poll); swatches REUSE the live cell classes so the key
     can't drift from the CSS. `updateLegend` (NOT test-pinned).
  2. **Keyboard access** — interactive cells get `role=button`+`tabIndex=0`+Enter/Space→`c.click()` (reuses the existing
     onclick, honoring the lock + Do-Now guards) + a classic-Mac dotted `:focus-visible` ring (white on dark PC/exam cells).
  3. **Screen-reader layer** — new `cellAria()` helper, `aria-label`+`aria-current='step'` in rCal, `#cg role=group`, a
     `.sr-only` `#cal-sr` aria-live region announcing the visible window on paging; `paintDonowCells` mirrors server
     done/ahead into the label (idempotent).
  4. **Stepped (pixel-crisp `steps(2)`) hover/press tactility** on `.dc` + `.cal-nav-btn`; reduced-motion disables it; the
     press bevel is scoped OFF state-ring cells so it never erases the next-up/done ring.
  5. **Paired the two corner dots** → one 7px scale (round = personal status, squircle = class poll); mobile shrinks both
     + hides the `.dbl` 2x text.
  6. **Code sharpening** — reflowed rCal's dense minified week-building loop to readable code + `// ── N. phase ──` banners
     (a poll-dot date-key DRY onto `_ymdISO` was REVERTED — poll-archive-desk.test.js test 18 pins the inline `getMonth()+1`/`padStart`).
  7. **Named magic numbers** — `--cell-past-dim/--cell-lock-dim/--cell-done-dim` `:root` vars; documented the cls()/htm() sentinels.
- **⚠ CALENDAR TEST-CONTRACT GOTCHAS (durable, for future calendar work):** `tests/calendar-polish.test.js` (46) uses
  `fnBody(html,'rCal')` and pins MANY exact substrings INSIDE rCal → logic CANNOT be extracted into helpers without rewriting
  those tests. The **synthwave `.cal-current`** (#ff2e97 + calCurrentPulse + reduced-motion) is a FROZEN tested contract —
  do NOT swap it (reconciliation options are in the proposal doc). `poll-archive-desk.test.js` test 30 does
  `indexOf('.poll-dot {')` so any earlier `.poll-dot {` token breaks it — order such selectors as `.poll-dot, .status-dot {`.
- **✅ ROUND 2 (`10ef5f3`) — ALL 9 needs-your-nod items APPROVED + SHIPPED** ("all of it, per your judgement"). My calls:
  (8) hover → **additive outline ring** (no more full-black invert wiping state cues); (9) synthwave → a **live "Up-next style"
  switcher** in the legend (Neon default / Toned / Marching-ants / Gold), persisted to localStorage as `#cg[data-calcur]`,
  alternatives layered AFTER the frozen `.cal-current` so the default is byte-identical + 46 frozen tests green — pick by feel;
  (10) dropped the redundant ◀TODAY chip (frame signals today) + `2x`→bottom-center; (11) **colorblind glyphs** ✓/◐/▶ via
  `::after` reusing the tooltip symbols (+white halo, shown on touch); (12) mobile clamps the subtitle (ellipsis) not hides it;
  (13) **honest progress** — a pure unit-tested `_computePace` (deduped DOT-LESSON universe) drives a pace label + done-fill,
  fail-open, recomputed when the /grade cache warms; (14) tooltip → honest open-hint (the cursor-following links were dead);
  (15) today seated forward **statically** (no idle animation); (16) one-ring — today keeps its 2px frame, glyph carries state.
  A 2nd 3-agent adversarial review (verdict *fix-first*) caught 2 real majors before push — an inflated progress denominator
  (specials counted as lessons → fixed via `_computePace` + execution test) and a legend swatch that mis-taught ✓ as "Ahead"
  (Done swatch now uses the real `dc-done`). `tests/calendar-cohesion.test.js` now **42**.
- **✅ ROUND 2b — live teacher-feedback fixes (`77f7fb3`):** (a) removed the deprecated registry
  "readiness" signal from the STUDENT view (cell status-dot + tooltip Ready/Partial/Pending line +
  legend "Ready" entry) — it marked most lessons "partial" (teacher material-tracking) and
  contradicted the new student glyphs; (b) tooltip drops the "double-click for grade" hint (single
  click opens the panel first → dblclick rarely lands; grade is on the Do-Now anyway) → now just
  "Click to open"; (c) **marching ants is now the DEFAULT** up-next style (`CALCUR_DEFAULT='ants'`;
  'neon' falls through to the frozen rule so 46 frozen tests stay green); (d) the "What the marks
  mean" legend was made a visible System-7 chip (was faint grey text — teacher couldn't find it).
  **⚠ (c) + "No open task" are SUPERSEDED by ROUND 2c below — the legend was then HIDDEN entirely, and a real open
  ants/summer task exists.** `tests/calendar-cohesion.test.js` was **44** at 2b. ⚠ `.status-dot` CSS is
  retained-but-deprecated (kept so the mobile `.poll-dot, .status-dot` selector + poll-archive
  `indexOf('.poll-dot {')` test stay valid) — purge both together if desired. The day-grade
  dblclick/right-click handlers are still wired (only the misleading hint was removed).
- **✅ ROUND 2c — more live teacher feedback (`3936f5b` + `94e208e`):**
  (a) **Teacher-as-self progress overlay SUPPRESSED** (`3936f5b`) — the ◐ "in progress" markings were the TEACHER's own
  browsing marks rendered as student progress (inaccurate noise). rCal (`_suppressProgress`) + paintLocalDoneCells
  (`suppressProgress`) now skip the local progress overlay (greying + ◐/✓) when `_deskIsTeacher()` — gated so
  preview-as-student + real students KEEP it. cal-current/next-up is kept for teachers.
  (b) **Up-next style moved `#cg[data-calcur]` → `body[data-calcur]`** (`3936f5b`) so the legend "Up next" swatch previews
  the chosen style LIVE, not only the grid cell. `_applyCalcurStyle` sets it on `document.body`.
  (c) **LEGEND HIDDEN** (`94e208e`, SUPERSEDES 2b's "visible chip") — teacher: "the legend isn't necessary, the cells +
  glyphs are self-explanatory, rid it for cleanliness." `#legend-bar { display:none }` (one CSS line, reversible). updateLegend
  still runs so the marching-ants default still applies; the switcher UI is now hidden → the up-next style is effectively fixed
  to the `ants` default (change `CALCUR_DEFAULT` to re-default; un-hide `#legend-bar` to bring the switcher back).
  `tests/calendar-cohesion.test.js` now **47**; full root suite **7211 pass / 6 fail** (the same pre-existing onboarding 6).

- **✅ ROUND 2d — greying fixed + marching ants now lands on the summer lesson (RESOLVED the prior OPEN item):**
  (1) **GREYING (`62bc8e6` + `4596b99`, teacher-CONFIRMED):** the teacher's completed 1.1 (worksheet 73% + flashcards 93%)
  wasn't greying — root = the /grade cache-cold RACE + the over-aggressive teacher-suppression. FIXED: suppress only browsing
  `'partial'`, KEEP real `'done'`. Diag confirmed `complete_1_1:true, state_1_1:"done"`. Also the flashcards button labelled by
  100% not the 80 gate → said "Improve (flashcards)" at 93%; now "Flashcards ✓ done — redo to improve" (`4596b99`).
  (2) **ANTS / SUMMER↔FALL DISCONNECT (`7252c99`):** next-up was computed ONLY over FALL combined topics ("1.2+1.3"), which
  never match the individual SUMMER cells ("1.1"/"1.2") → no summer cell ever got `cal-current`. (The first diag's `summerCells:0`
  was a cache RACE; the 2nd showed `summerLoaded:true, nextUpTopic:"1.2+1.3"` — confirming the disconnect, not a load failure.)
  Shipped the **WINDOW REDESIGN**: new `_orderedSummerTopics()` + summer-aware next-up (rCal + paintLocalDoneCells mark the
  summer cell; the FALL `inf.t === _nextUpTopic` lines kept VERBATIM, summer is a separate else-if), a **DYNAMIC window**
  (`CAL_FOCUS_WEEKS` now sized to span today→next-up, clamped [1,4]; AHEAD anchors today, BEHIND anchors the overdue lesson;
  `_calStepWeeks` pages by the visible width), and a **Today** button (3rd nav child between the arrows, dims at offset 0).
  Designed via a 4-lens workflow whose critique caught 2 blockers (summer head-start "Sept jump" + paging dead-end) → the
  REVISED algo avoids both → a 3-agent review re-verified (live case 1.1-done→ants-on-1.2 traces; both blockers confirmed fixed)
  → its 1 major (paintLocalDoneCells missing rCal's summer-active guard → would clobber the fall next-up OFF-season) folded via
  a DOM-truth guard (`#cg .dc[data-summer="1"]`). ONE frozen calStep test rewritten (`*2`→`*_calStepWeeks`, authorized); all 46
  other calendar-polish pins preserved VERBATIM. `tests/calendar-cohesion.test.js` now **57**; full root suite **7221 pass / 6**
  (the pre-existing onboarding 6). **NO open calendar task.** Key fns: `_orderedSummerTopics()` (~L7015), rCal section 3/3b
  (next-up-before-sizing + dynamic window), `calToday()`/`_calStepWeeks` (~L16426), `_walletLoadSummerSchedule` (~L7191).
  **✅ TEACHER-CONFIRMED LIVE (2026-06-17):** all 4 verified on the public URL — (1) 1.1 greyed + "Flashcards ✓ done",
  (2) next-up dashed box on 1.2, (3) window sizes to reach the next lesson, (4) Today button. NOTE: the next-up box renders
  STATIC (not marching) for the teacher because **prefers-reduced-motion is on** in their browser/OS — working as designed
  (we honor reduce-motion; `matchMedia('(prefers-reduced-motion: reduce)').matches` confirms), teacher ACCEPTED the static box.
  Settled-with-defaults (teacher fine): CAL_MAX_WEEKS=4, up-next default = marching-ants. **The entire CALENDAR program is DONE.**

## ⏭ SESSION 13 SHIPPED (2026-06-16) — grade-policy SIMULATOR + 3 perverse-incentive fixes + appeal/gating state-machine models

HEAD `d48bf32` (4 commits since `0780ece`, ALL pushed). `04c5fe6` + `3029dae` touch `roster-server/**` + all 69 worksheets →
**Railway auto-deploys + GH Pages republishes.** Started from the user's question *"is it smart to model the app as a state
machine to simulate how student decisions affect outcomes?"* — built it, found real bugs, fixed them, then extended the technique.
Specs: `GRADE_SIMULATION_SPEC.md`, `GRADE_FIX_F1_F3_BUILD.md`. Findings: `GRADE_SIMULATION_FINDINGS.md`. Memory: `project_grade_simulator.md`.

- **The grade simulator (3 layers), commit `04c5fe6` + Layer C `5e042ca`:**
  - **Layer A** — `roster-server/tests/grade-sim*.test.js` + `tests/fixtures/sim-world.js`: property-fuzz (`fast-check`, now a
    roster-server devDep) of synthetic ledger-row trajectories through the **REAL `computeGrade`** (zero drift) — invariants A1–A9 + 5 archetypes.
  - **Layer B** — `roster-server/tools/grade-sim-sweep.mjs` (sweep config knobs) + `grade-sim-f1a-compare.mjs` (the F1-A comparison that chose the policy from data).
  - **Layer C** — `formal/grade-model/` PLT **Redex** model of the quarter-grade fold, cross-checked vs JS **PASS 1000/1000**.
    Run: `node roster-server/tools/grade-model-emit-cases.mjs` then **PowerShell** `racket formal/grade-model/crosscheck.rkt`
    (racket = scoop `current=9.2`, on `scoop/shims`; **segfaults under MSYS bash → use PowerShell**). Codex draft folded (Redex `number` not `rational`; subscripted-nonterminal pattern vars; flonum gates/rounding to mirror JS IEEE doubles).
- **4 findings (3 fixed + 1 averted), all simulator-found:**
  - **F1** ahead-of-schedule work could LOWER your grade (−14): a not-yet-due lesson joined the Lessons denominator on first touch AND its un-taken quiz counted as 0.
  - **F2** v3 work weights + the 40/70 gates were HARDCODED (despite grade-config's "all knobs here" claim) → now config (`v3WorkWeights`, `v3Gates`), defaults byte-identical.
  - **F3** your FIRST worksheet blank dropped the lesson 100→75 (Cws flips from absent/ignored to 1-of-4 with the unfilled blanks as 0).
  - **F4 (headline):** the sim caught that the FIRST proposed F1-A fix `'only-helps'` was itself **NON-MONOTONIC** (raising a due lesson could evict an above-avg early lesson → A3 violation) BEFORE it shipped → shipped the monotonic `'not-until-due'`.
  - **Shipped flags (`roster-server/grade-config.js`, ENABLED):** `v3FixQuizZero:true`, `v3FixCwsReveal:true`, `v3AheadOfScheduleLessons:'not-until-due'`. **Default-OFF path is byte-identical** (`grade-sim-fixes.test.js` pins the findings under legacy config + verifies the fixes). Adversarial review (Codex, read-only) CLEAN (A2 ceiling, A3 monotonicity, no double-count, flags-off identity). ⚠ **`'only-helps' must NOT ship — it violates A3.**
- **Appeal state machine — `3029dae`:** `tests/appeal-state-machine.test.js` EXHAUSTIVELY model-checks the reflection appeal machine
  (tiny space = proof). **F5** "AI only ever raises" was enforced ONLY by the `_aiFrqFloor` overlay monkey-patch (~L2290), NOT the base
  `recordReflectionToGradebook` (~L1206) → a P→I appeal could write the LOWER grade. **F6** a downgrade appeal lowered the DISPLAYED
  score while the UI said "Score maintained". **FIXED:** `scripts/wire-appeal-clamp.mjs` injects a clamp (appeal verdict never below
  previous; marker `APPEAL-CLAMP`) into all **69 worksheets**; `u3_lesson6-7_live.html` (original prototype, different handler) patched directly.
- **Lesson gating — MODELED, NO findings (`d48bf32`):** `tests/lesson-gating.test.js` exhaustively model-checks the strict gate
  (`_isLessonUnlocked`/`_isLessonComplete`/`_prevTopicInSequence`/`_prevSummerTopic`) → reachable states are CONTIGUOUS PREFIXES
  (the historical parity leak 1.2/1.4/1.6-open/1.3/1.5-locked is structurally impossible), monotonic, no deadlock, combined-topic bridge works. **Confirms the s11 LESSON_GATE_BUILD §8 fix holds.**
- **⚠ Rigor caveat:** Layer A drives the **real** engine; the appeal + gating models are faithful models of the **documented logic**, NOT the live DOM-coupled code. A live-code harness (extract the real functions + stub their globals) would make them true differential checks — an optional follow-on.
- **Tests:** roster-server **985/985**; root **7139 pass** — the **6 pre-existing failures** (desk-gating-fixes / desk-self-signup / desk-user-role / desk-signin-wall) are the user's parallel onboarding refactor, UNCHANGED. Racket v9.2 + redex installed on this box (scoop).

## ⏭ SESSION 12 SHIPPED (2026-06-16) — "view as student" worksheets show the STUDENT's answers READ-ONLY + Show-Answers cheat closed

HEAD `0780ece` (one commit, 80 files). Touches `roster-server/**` → **Railway auto-deploys**; GH Pages republishes. Both bugs the
teacher hit are fixed and 20-agent adversarially reviewed (1 MAJOR + NITs folded). **TEACHER CONFIRMED IT WORKS LIVE.**

- **BUG 1 — view-as opened a worksheet showing the TEACHER's own past answers; now shows the STUDENT's, READ-ONLY.** Root cause:
  the Desk's view-as is per-tab `sessionStorage` impersonation that NEVER changes the roster login; worksheets are separate pages
  that hydrate via `gradebook-client.js fetchPrior` → `GET /ledger/student/:id` keyed on the signed-in identity (= the teacher).
  - `roster-server/ledger.js` — a verified TEACHER token may now read ANY student's ledger; non-teacher cross-student reads still
    403. **GOTCHA (folded): the role lookup runs on the ROSTER db, not the ledger db** — `server.js` threads `rosterDb: db` into
    `mountLedger`; without that every view-as read 403'd.
  - `gradebook-client.js` — `fetchPrior` honors `window.__VIEW_AS_STUDENT_ID__` (teacher token rides along in the header).
  - Desk `_wireViewAsWorksheetLinks` — capturing click/auxclick listener appends `?viewAsUserId=<sid>` to worksheet anchor hrefs
    ONLY under `_viewAsContext()` (worksheet filenames only; skips edgar/mit/quiz/external).
  - `scripts/wire-worksheet-viewas.mjs` — idempotent, EOL-preserving codemod (marker `WS-VIEWAS-MODULE`) injecting the read-only
    module across all **69 worksheets**: sets `__VIEW_AS_STUDENT_ID__` + `__WS_READ_ONLY__`, **NEUTERS every server write sink**
    (`gradebookClient.record` + `railwayClient.submitAnswer` → no-ops — this is what covers the on-load `healLocalAnswersToLedger`
    path), disables inputs, hides grade/answer buttons, fetches `/teacher/student/:sid/profile` for the banner + identity (fail-safe:
    blanks the header if the fetch fails — never the wrong person). **⚠ To edit the module: `git checkout -- $(git diff --name-only |
    grep -E '^u\d+_lesson.*_live\.html$')` to revert the 69 first, then re-run `--apply` — the marker makes a plain re-run a SKIP.**
  - `roster-prefill.js` — bails in view-as (it was filling the TEACHER's name + a green "signed in as teacher" banner = the review's MAJOR).
- **BUG 2 — "Show Answers" was a free 100%** (fill key → Check). Button now ships `hidden`; revealed ONLY for a signed teacher on
  their OWN worksheet (gated on `rosterClient.current().role`, re-gated on a later sign-in). **NOTE (accepted): a casual-cheat speed
  bump, NOT a boundary** — `data-answer` values + the `showAnswers()` global are in the page; the durable fix is server-side scoring
  (out of scope). LEFT (noted, out of scope): the pre-existing `?token=` query-string fallback on `GET /ledger/student` (new code is header-only).
- **Tests:** roster-server **963/963**; new `tests/worksheet-viewas-module.test.js` 11/11 (runs the real injected module in jsdom);
  `gradebook-client` / `desk-view-as` / `roster-prefill` extended + green; root **7125 pass** — the **6 pre-existing onboarding/icon
  failures** (desk-gating-fixes / desk-self-signup / desk-user-role / desk-signin-wall) are the user's parallel refactor, UNCHANGED.

## ⏭ SESSION 11 SHIPPED (2026-06-16) — Desk/gating/Live-Classroom + cr login, all adversarially reviewed

- **STRICT topic-sequence lesson gate** (`0a79f1c`, LESSON_GATE_BUILD §8): the gate keyed on the previous CALENDAR CELL
  (parity leak: 1.2/1.4/1.6 open, 1.3/1.5 locked) → now gates on the true topic-predecessor (`_prevTopicInSequence`),
  window-independent + cross-portion (topic-keyed completion). Date bypass REMOVED (strict; fall too — teacher P5 unlock is
  the escape). **⚠ live config forces period E (combined pacing `1.2+1.3`…) but summer is individual (`1.1`..`1.10`)** → the
  gate DISPATCHES by cell surface (`_prevSummerTopic` for summer cells, `_prevTopicInSequence` for fall) + a completion
  bridge (`_isLessonComplete`: combined "A+B" done when its parts are). The review caught this as a BLOCKER (a naive single-
  sequence gate left summer always-open). Verified vs live cP=E.
- **Buy-min 25→5** (`d7b0636`) + disbursement **"✓ given/sent"** fix; **Teacher Tools launcher** + **Roster Console restored**
  (`5bd38cd`, Class Gradebook dropped); **voluntary "Change Password"** in the User menu (`c141867`); **"I'm not on the list"
  → straight to GUEST** (no self-signup) (`68eb697`).
- **Kid→kid candy gifting** (`db24a41`, migration `0021` USER-RUN) — `POST /wallet/gift` by username, Desk 🎁, atomic
  `doge_gift()` w/ HARD daily cap, active-student-only recipient, kill-switch. 15-finding review folded.
- **Guest + Teacher Live-Classroom AVATARS** (`7a1eb0c` guest; fa `7aa5891` + cr `42b74e3` teacher): guests + the teacher
  now render as avatars in the scene; the teacher's avatar is movable + can step into doorways (vote VISUAL-ONLY — doesn't
  steer the class winner; server checkin role-guard). ⚠ KNOWN minor: arrow/Space drive the avatar in the tall teacher
  cockpit (mouse-wheel scroll still works) — accepted cost.
- **cr↔Desk login tightened** (cr `6c60965`): 401/expiry surfaced ("sign in again", was silent grade loss); cross-tab
  `storage` sign-out listener; `roster-client.js` synced to the Desk's. **LEFT (user chose cheap-wins): cr focus-roster-
  refresh + clear stale peer `classData` on identity change.** Audit detail in `project_cr_identity_unify.md`.

## ⏭ NEXT — candy economy REVIVED + shipped (poke + 6-number ledger + DOGE floors, see s15 ↑). Calendar + grade-integrity COMPLETE.

> **GRADE-INTEGRITY MODELING (s13 — DONE).** Model app areas as state machines / property tests over the real logic to FIND or
> VERIFY integrity bugs. SHIPPED s13 (all pushed): grade engine (Layers A/B/C, 3 fixes + F4 averted), appeal machine (F5/F6 fixed
> across all 69 worksheets, `3029dae`), lesson gating (modeled → SOUND, `d48bf32`), Schoology reconciliation (modeled → SOUND,
> idempotent + dup-safe, `43c3089`), AND the **LIVE-CODE harnesses** (`21219ff`): `tests/lesson-gating-live.test.js` +
> `tests/appeal-clamp-live.test.js` extract the REAL Desk/worksheet functions (brace-match + `new Function` with stubbed globals)
> and run the invariants against the shipping code — the real gate matches the model and the real appeal clamp is verified
> end-to-end. **No open task in this program.** The reusable recipe: identify/extract the pure logic → fixture + generator → assert
> invariants (exhaustive when the state space is small, fast-check/seeded-random when large) → pin findings → fix → (optional)
> live-code harness via the `fnBody` extractor. **Possible NEW targets if reopened:** Live Classroom poll/vote protocol (wants TLA+,
> not fast-check — but DEPRECATED per s15), or the **candy/DOGE wallet conservation math** — the 6-number identity
> `Earned+Received=Gifted+Converted+Materialized+Owed` is now LIVE + adversarially reviewed; a live-code differential harness over
> `deriveBalances`/`doge_spend`/`doge_gift` is a strong target. Findings doc: `GRADE_SIMULATION_FINDINGS.md`; memory:
> `project_grade_simulator.md`. (DOGE is no longer "paused" — see s15.)

> **DOGE/candy status (UPDATED s15 — REVIVED):** migrations `0019` / `0021` / `0022` are **RUN**. The candy economy is the
> teacher's ACTIVE focus: avatar **poke** gifting + the **6-number materialized ledger** (candy earned → owed → materialized
> weekly from the dashboard Owed worklist) + **DOGE** as the optional convert/materialize layer (1-DOGE-worth convert floor,
> 5-DOGE on-chain materialize). The teacher leaned toward deprecating in s12 but REVIVED + rebuilt it in s15 — **do NOT treat it as
> paused.** Still **NOT physically handing out paper wallets / registering addresses** (the on-chain DOGE go-live stays OPTIONAL),
> but the in-app candy ledger + poke are LIVE and in use. If on-chain go-live is wanted: print the wallet sheet → register each
> address (Reward Disbursement) → DRY-RUN `node tools/doge-send.mjs` (CC plans only; `--send` is the teacher's deliberate,
> irreversible call; now batches at **≥5 DOGE** per the materialize threshold).

The original DOGE go-live checklist is kept below for reference, but items 1–2 are DONE and item 3 is on hold per the note above.

0. **✅ DONE (session 10):** migrations **0019 + 0020 RUN**; **node restarted** (mainnet, synced, 10,273 DOGE, RPC live);
   **30 paper wallets generated + node-validated** at `C:/Users/rober/doge-wallets/` (OUTSIDE the repo — real keys; print
   the HTML, seal the `-KEYS.csv` offline, delete the HTML after printing); **canary send VERIFIED end-to-end** (1 DOGE →
   wallet #1 `DEuXEB47…`, txid `eaa5d3b6…`, 14 confs; `doge-chain.js` read it back `confirmedDoge:1`). The full loop works.
1. **✅ DONE (s12): migration `0021` (gifting) RUN.** `POST /wallet/gift` + the 🎁 button are live.
2. **✅ DONE (s12): Abraham Ladny (`olive_sloth`, PeriodX) + a few other students ENROLLED.** (Still set Abraham's Schoology UID
   `191627` if not yet done.)
3. **⏸ ON HOLD (s12): NOT handing out / registering wallets** — the teacher is considering deprecating candy/DOGE (see the status
   note above). If revived: print the wallet sheet, register each address in the dashboard (Reward Disbursement → set), then a
   DRY-RUN of `node tools/doge-send.mjs` (plan only) → first real `--send` when ready (CC runs dry-run only; `--send` is your
   deliberate call, irreversible).
   - **Optional:** set Railway env `BLOCKCYPHER_TOKEN` (lifts the explorer free-tier ~100 req/hr ceiling; on-chain display works without it).
   - **Buy minimum is now 5 candy** (~1 lesson, was 25) — budget-neutral, kids can convert sooner.
   - **PENDING discussion:** guest-workflow hardening (complement the no-guest sign-in wall, don't collide with the in-progress onboarding refactor).
4. **✅ DONE (session 9, `c84a8e4`): watch-only on-chain balance display.** `roster-server/doge-chain.js` (BlockCypher
   `doge/main`; testnet has NO provider → explicit error, registration mainnet-locked), `GET /wallet/chain` +
   `GET /class/wallets/chain`, Desk ⛓ on-chain line + dashboard On-chain Ɖ column. **Two NEW optional activation items:**
   (a) run migration `0020_doge_chain_cache` (USER-RUN, OPTIONAL — the live read works with just 0019 + a registered
   address; 0020 only adds durable cache cols read back on an explorer outage); (b) set Railway env `BLOCKCYPHER_TOKEN`
   (free tier ~100 req/hr; the Desk polls per open wallet every 5 min). Plus item-6 hardening (uuid-404, overspend ⚠,
   `?section=` scope, address regex → 34 chars). roster-server 944 green; root 7092 green.
5. **VERIFY the My Ledger ↔ Pacing color fix landed** (`46f5220`): the Desk's summer-schedule fetch could fail silently →
   My Ledger showed fall 'eligible' (yellow) while the dashboard Pacing showed summer (green) for the same person. Fix
   retries the load on `openWallet` + re-paints on success. If it persists, console diag in the Desk:
   `console.log(!!window._summerSchedule, _walletDisplayReadiness())` — null schedule = the fetch is still failing.
6. **✅ DONE (session 9): the verification minor-backlog hardening** — negative candy now SURFACED (`candyBalanceRaw` +
   dashboard ⚠ overspend badge, not silently clamped); `studentId` uuid-shape guard → 404 not 500; `GET /class/wallets`
   (+`/chain`) section-scoped; `mark-given/sent` clamp regression-tested; custodial price-window exposure documented (spec §3).
7. **(carried from session 7 — RESOLVED session 9):** section naming is **already canonical** — `/roster/section/PeriodX`
   returns the 27 students, `/roster/section/PERIODX` is empty → **NO `UPDATE` needed** (self-signup writes `PeriodX`; any
   all-caps would be legacy, and none exist). Both Railway servers are **deployed** (`/commits`→401 auth-gate, cr
   `/api/user-answers/<u>`→200). **Still open:** Schoology-UID coverage for the 27 — needs the teacher secret:
   `ROSTER_TEACHER_SECRET=… python tools/build_schoology_fixture.py --section PeriodX --inspect` (read `uid_bridge_covered`).

## ✅ SHIPPED THIS SESSION (2026-06-15/16, session 8)

**DOGE EFFORT WALLET — the headline. Spec `DOGE_WALLET_SPEC.md` (v2, `60a6485`); memory `project_doge_effort_wallet.md`.**
A reward system on top of the existing effort points (`js/wallet_logic.js` WALLET_POINTS): kids earn **candy** (stable
≈-dollar unit, FIXED 36 pts = 1 candy = $0.036) → **eat it** (consumed) or **buy DOGE** at the **live FLOATING price**
(buy early = cheaper; "33 candy/DOGE" if it appreciates). Real on-chain **paper wallets**, app **watch-only**. **Broker
economics**: teacher cost = candy-dollars forgone, capped at the $300 budget, no DOGE price exposure. Forced session-end
choice, one-way (no sell-back). Teacher confirmed all decisions; teaching goal = work-early + appreciating-asset-vs-consumable.
- **Phase 1a `f5f1152`** — `wallet_logic.js` conversion math (`candyFromPoints`/`candyPerDoge`/`dogeFromCandy`/`usdFromCandy`)
  + Desk My-Ledger preview panel. **Gated**: shows for teachers automatically (`_deskIsTeacher`) or `localStorage
  'apstats_doge_wallet_preview'='1'` for students (default OFF). **NOTE: gated OFF in `apstats_preview_as_student` mode.**
- **Phase 1b `6d2f366`** — `tools/doge-wallet-gen.mjs`: OFFLINE Dogecoin paper-wallet generator. 100% Node built-in crypto
  (secp256k1 via createECDH, SHA256+RIPEMD160), hand-rolled base58check self-tested vs the canonical vector each run.
  Prints HTML sheet (addr+QR / WIF+QR) + sealed addr↔key CSV. mainnet `D…` + `--testnet` `n…`. `qrcode` devDep. 9 tests + live testnet run.
- **Phase 2 backend `0935f55`** — migration `0019` (USER-RUN), `doge-econ.js` (shared frozen econ + `computeEffort`),
  `doge-wallet.js` mounted: student `GET /wallet` / `POST /wallet/eat` / `buy-doge` (server-stamped price, 25-candy floor);
  teacher `POST /wallet/address` / `mark-given` / `mark-sent` / `GET /class/wallets`. db helpers. 503-graceful pre-0019.
- **Phase 2 Desk wallet `cf0e8f1`** — interactive 🍬 Eat / Ɖ Buy-DOGE in My Ledger (display-only fallback pre-0019).
- **Phase 2 disbursement `c9bb63c`** + `369d25b` + `46f5220` — teacher-dashboard "🍬 Reward Disbursement": per-kid candy
  earned / **to give** (eaten−given) / **to deposit** (balance−sent) / address, with ✓gave/✓sent/set-address; `/class/grades`
  gained a per-student `effort:{points,candy}`. Now **includes teacher/test accounts** (badged 🧪) for testing.
- **Spend race FIXED `f0d16fa`** — `/wallet/eat`+`/wallet/buy-doge` now use an atomic `doge_spend()` Postgres function
  (a single guarded UPDATE, folded into 0019) instead of read-modify-write; +tests (eat-then-buy conservation; the real
  PostgREST row-of-nulls guard).
- **Phase 3 `4ce2673`+`d4fe519`** — `tools/doge-send.mjs`: OFFLINE batch sender. Reads `/class/wallets`, plans ONE
  `sendmany` from the node to kids' addresses, broadcasts, then marks sent. DRY-RUN default; mainnet assert + fee buffer +
  validate-every-address before broadcast; **crash-resilient journal** (refuses `--send` while a prior batch is
  un-reconciled → no double-send); mark-given/sent clamped at owed/banked. `planSends` unit-tested (11). Spending key
  never leaves the node (watch-only app).
- **Verified by TWO 3-agent adversarial workflows:** Phase-2 (security + integration CLEAN; the race was the one MAJOR →
  now fixed) and Phase-3 (`doge_spend` SQL CLEAN; the sender's crash double-send MAJOR → now fixed; RLS + clamps folded).
  roster-server suite 919 green; root suites green except the 6 pre-existing onboarding failures.

**DESK POLISH (secondary):** username-wheel login footer declutter (`10e4e04`); Do-Now card restructure + click-opens-My-
Ledger fix (`50203a1`/`36ec71e`); My Gradebook folded into My Ledger (`ed310a6`); Pacing Overview shows teacher/test rows
(`397927d`); **summer schedule woven INTO the calendar grid** as amber weeks (`856d643`→`07881c8`); **school year opens with
orientation + a no-stakes Unit-1 baseline** (`5d197c3`). All adversarially verified; weekend-anchor calendar bug fixed as a bonus.

## KEY FACTS / GOTCHAS
- **roster-server is self-contained** — can't import `../js`; the frozen econ is DUPLICATED in `roster-server/doge-econ.js`
  (mirror of `js/wallet_logic.js`). Keep in sync if the peg ever changes (it shouldn't).
- **Effort points** = receipt-carrying `item_ledger` rows (with `receipt_compact`), deduped by `source|item_id`, scored by
  WALLET_POINTS. `computeEffort` is the single source (class.js + wallet routes agree → teacher total = kid's wallet).
- **Numbers** (tunable, frozen at outset): 36 pts/candy, $0.036/candy ($13 / 360-pc bag), ~30 kids, ~$300 budget ≈ 8,300
  candy; DOGE ~$0.088 → 1 DOGE ≈ 2.4 candy. `POINTS_PER_CANDY=36` is the one dial — retune once real accrual lands, then freeze.
- **6 pre-existing root-suite failures** (desk-gating-fixes icon + desk-self-signup/signin-wall/user-role onboarding) are
  the user's parallel onboarding/icon refactor — NOT this session's; left untouched. Root suite otherwise green (~7080 pass).
- **Guests can't appear server-side** anywhere (pacing, disbursement) — device-local aliases, never on the roster.
