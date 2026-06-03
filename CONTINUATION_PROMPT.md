# CONTINUATION PROMPT — (A) cross-device greying ✅ SHIPPED, (B) Schoology summer mock-grading — Phase A seam ✅ SHIPPED, live steps gated on rig sign-in

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-03 (session 2).
> follow-alongs HEAD = `f74bac9`; curriculum_render HEAD = `767ccf4`.

## ⏭ DO NEXT (Task B Phase A — gated on the rig)
The Schoology rig profile (`%TEMP%/edge-claude-cdp`) is **LOGIN_REQUIRED** as of 2026-06-03 (cookie
expired since s123). **Re-sign into Schoology in the home-laptop rig Edge window FIRST.** Then:
1. **Verify (read-only):** `python tools/_probe_periodb.py` → confirm `authenticated`, the live MP4 range
   (4/11/26–6/30/26), and that UIDs 193718 / 203434 / 195239 are in the Period B roster.
2. **Enroll** 3 PeriodY fruit_animal test students: `node scripts/teacher-roster.mjs --name "..." --section PeriodY --random`
   (×3, or a CSV) → record the auto-generated usernames from the credentials CSV.
3. **Map UIDs:** build a `username,schoologyUid` CSV (the 3 usernames → 193718 / 203434 / 195239) →
   `node scripts/teacher-roster.mjs --set-schoology-uids <csv> --section PeriodY`.
4. **Grades:** `python tools/build_schoology_fixture.py` for section PeriodY → fixture keyed by schoology_uid/lesson.
5. **DRY-RUN then LIVE:** `python tools/schoology_sync_section.py --sync-section PeriodY --grades-fixture <f> --dry-run`
   (confirm every line shows `mp=<MP4 id>`), then drop `--dry-run` + `--limit 1` for the first real cell.
The config seam is DONE (`f74bac9`): PeriodY→Period B course + `SECTION_FORCE_MP_DATE` forces MP4 by date.
Cleanup when done: `delete from roster where section='PeriodY';` + delete the test assignments/columns.

Ultracode is on. Repos: **follow-alongs** (`apstats-live-worksheet`, branch `master`, GH Pages +
`roster-server/` auto-deploys to Railway) and **curriculum_render** (cr, branch `main`, AI server on
Railway). Both auto-deploy on push. Teacher tests on the **public GH Pages URL** (SSHes from a work
laptop) — commit+push promptly; `file://` is not a valid test surface. Style: brainstorm → spec →
implement (the user reviews the plan). Commit own paths only (both repos have unrelated dirty/untracked
files incl. many `.ai-tutor-*.result.md`). Memory dir:
`C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.

## ✅ DONE THIS SESSION (2026-06-03 session 2)

### A. Cross-device lesson-greying fix — ✅ SHIPPED (`da85a12`)
`_isLessonComplete` now counts an artifact done when the local `.ts` mark exists OR the SYNCED `/grade`
score clears the Done-button bar (worksheet `Cws≥60`, Blooket `≥80`); `typeof`-guarded → isolated vm
tests fall back to strict local-only (A8c preserved); quiz stays OUT of the gate (the `0dea2ae` fix
holds). New `paintLocalDoneCells()` + `_orderedPeriodTopics()`: repaint after the async `_gradeLessonsCache`
warms (rCal runs before it) — flicker-free greying class toggle, escalating to ONE `rCal` rebuild ONLY
when a lesson's lock flips (never on a plain poll; self-converging). Wired into `renderDoNowGrades`.
+10 tests (calendar-polish C5b/A8d). Full root suite 6850 pass (3 known fails). 4-dim adversarial
Workflow: 6 findings → 5 refuted, 1 confirmed (stale lock) → folded by the lock-flip escalation.
**Teacher: verify on the WORK computer — a lesson done elsewhere should now grey + unlock without a
local Done-click once /grade loads.**

### B. Schoology summer mock-grading — ✅ Phase A config seam SHIPPED (`f74bac9`); live steps gated (see "DO NEXT" up top)
Inputs locked: 3 real Period B UIDs → 193718 Jefferson Cruz / 203434 Stephanie Granados Alvarez /
195239 Isaias Pablo Castillo; 3 fruit_animal PeriodY students will map to them. MP4 = 4/11/26–6/30/26.
Config seam built dry-run-safe + unit-tested (130 py tests). Enroll + UID-map + live push remain — all
gated on the rig being signed in (currently LOGIN_REQUIRED).

---
## 🗂 ORIGINAL TASK BRIEFS (for reference)

### A. Cross-device lesson-greying fix (Desk `ap_stats_roadmap_square_mode.html`) — DONE, see above
**Symptom (teacher, live):** the SAME Desk + SAME student greys completed lessons on the HOME computer
but NOT on the work computer (1.1 is done, should grey, doesn't on work).
**Root cause:** the gating fix `0dea2ae` made greying STRICT — `localLessonState` now defers to
`_isLessonComplete` (worksheet **and** Blooket done). But "done" is read from the LOCAL Done-click marks
(`localStorage apstats_desk_marks_<email>`, the `.ts` stamps), which **don't sync cross-device**; only
some marks hydrate from `/donow selfDoneArtifacts` (`_hydrateMarksFromDonow`). So a device that didn't
do the work locally sees no worksheet/Blooket `.ts` → nothing greys. (The OLD lenient any-artifact logic
masked this.) **DO NOT revert `0dea2ae`** — it correctly killed the quiz-alone-completes-a-lesson bug.
**Fix direction:** a gate artifact counts "done" when EITHER the local `.ts` mark exists OR the SYNCED
signal clears the bar — worksheet: `_getCwsForTopic(topic) >= DESK_WORKSHEET_DONE_THRESHOLD`; Blooket:
blooket score `>= 80` (reuse the exact signals the Done button's `eligible` check already uses in
`_doneBtn`, ~line 8140-8166). Likely edit `_isLessonComplete` (~5030) and/or `localLessonState` (~4276).
**Confirm first (1 console session on the WORK computer):** inspect `apstats_desk_marks_*` for
`1.1|worksheet` / `1.1|blooket` `.ts`, and the `/donow` response's `selfDoneArtifacts` — tells us
"hydrate the missing marks" vs "derive from synced score" (lean: derive from synced score).
**Decision (user leans YES):** a lesson greys once the work CLEARS THE BAR by synced score, even without
an explicit Done-click on that device. Tests live in `tests/calendar-polish.test.js` (A8/A8c) +
`tests/desk-gating-fixes.test.js`.

### B. Schoology summer mock-grading → Phase A (dissolves the parked period→course-mapping blocker)
**Why now:** pinning a mapping over summer makes the whole Schoology push testable TODAY (it was parked
to ~Sept-2026 only because the period→course mapping was unknown — this plan fixes one).
**TEACHER CLARIFICATION (overrides earlier caution — caution was MISPLACED):** all grades are DONE (year
over), students will NOT see any of this, and **Schoology ≠ PowerSchool** (PowerSchool holds the real
transcript grades). So **write mock grades DIRECTLY to the real Period B cells/assignments in MP4 — no
"test column" needed.** Prioritize TESTING THE WORKFLOW over caution.
**Plan:**
1. Enroll the 3 test students into roster section **`PeriodY`** (`scripts/teacher-roster.mjs` bulk-enroll
   → fruit_animal usernames). Real grades flow through the existing v3 pipeline.
2. **Two config seams = the clean fall-cutover stipulation:**
   - **Per-student `schoology_uid`** (existing bridge: migration 0012, `--set-schoology-uids`,
     `db.getSchoologyUidMap`/`updateSchoologyUid`, `PATCH /roster/:id/schoology-uid`). Summer: map each
     PeriodY test student → a real Period B student's UID (random). Fall: repoint each real student → own UID.
   - **NEW section→Schoology-target config** `section → { course, section_id, marking_period, assignment }`.
     Summer: `PeriodY → { Period B, section 1, MP4, <assignment> }`. Fall: real periods → real targets.
     **Cutover = edit these two layers only; sync code unchanged.**
3. **Phase A milestone:** a one-command `tools/schoology-sync.py --section PeriodY` (or the daily schtask)
   → prove a real push lands in B/MP4. Cell-write mechanism is PROVEN (P1b: 95 landed in a real cell;
   create-nid fast-path + JS-submit live-verified). See memory `project_schoology_sync`.
4. **Phase B (the literal Desk button, later):** the web Desk CANNOT drive the laptop's Schoology browser
   automation directly → needs a small **local bridge** (Desk → roster-server flag → a laptop watcher runs
   the sync). Build after Phase A proves the pipeline.
**Need from the user to build A:** the 3 students' names + IDs, the Period B names/UIDs to map them to, and
the Schoology course/section/MP4/assignment identifiers (or grab them from the rig).

## ✅ SHIPPED 2026-06-02→03 (AI worksheet grading saga + Desk fixes; follow-alongs unless noted)
- **AI worksheet grading** (fa `f36cbda`, cr `767ccf4`): semantic blank credit + folded FRQ pass on all
  69 worksheets; AI ONLY RAISES (verbatim + original FRQ = floor). cr `POST /api/ai/grade-worksheet`
  (framework-grounded, injection-hardened: JSON-escaped student text + "treat as DATA" rule + deterministic
  numeric backstop). 6-dim adversarial Workflow review → 12 fixes folded incl. a **BLOCKER** (re-blur
  clobbered the AI 1.0 → wrap `recordBlankToGradebook`/`recordReflectionToGradebook` upgrade-only). NO
  migration. Memory `project_ai_worksheet_grading`.
- **Merged to ONE "✨ Grade with AI" button** (`a0567d6`): retired the legacy "Grade My Reflections"
  (kept only on `u3_lesson6-7`, no `gradeReflection`); folded the polish/enrich pass (manual-only); win
  toast + local "Score" now counts AI-accepted blanks.
- **Worksheet score relabel** (`f6391ed`): "This worksheet's blanks: Z% …" (partial=half) + tooltip → not
  confused with the Desk grade.
- **Class View** (`c744ebb`): "📊 Class" drawer → named dotplot (≤10 distinct) / frequency table with
  first-name+last-initial labels + key-answer highlight; NEW roster-server `GET /class/blank/:itemId`
  (student-token, section-scoped, no migration — reuses item_ledger+roster); `ledger-db.getLedgerByItem`.
  Memory note appended to `project_ai_worksheet_grading`.
- **Desk gating + 3 UI bugs** (`0dea2ae`): `localLessonState` now strict (quiz alone ≠ done — was greying
  + unlocking the next lesson from the quiz); reddish-grey non-pressable `.s7btn-locked` Done button;
  alt-tab modal fixed (`renderDoNowGrades` only refreshes an OPEN resource panel, not a closed one);
  duplicate app icons fixed (emoji → `::after`+`has-png`, mirrors the calendar icon). Memory
  `project_desk_gating_fix`. **(Task A above is the cross-device follow-on.)**

## ⚠ GOTCHAS (load-bearing)
- **USE_V3_GRADING is LIVE** on Railway — grade-engine/UI changes move REAL grades; review before shipping.
  (Desk greying/UI is NOT the grade engine — Task A is UI only.)
- **`git commit -m @'…'@` here-string LEAKS a stray `@`** — write the message to a temp file +
  `git commit -F <tmp>` (then `rm`).
- **Migrations are USER-RUN** on Supabase. Schoology Task B uses the EXISTING `schoology_uid` bridge
  (migration 0012, already live) — only the new section→target config is additive.
- **curriculum.js is SACRED** (cr) — never edit. **Edgar driller** excluded by `^u\d+_lesson.+_live\.html$`.
- **The Desk (`ap_stats_roadmap_square_mode.html`) is a SINGLE FILE, edited DIRECTLY (NOT wire-driven).**
  The 69 worksheets ARE wire-driven (`scripts/wire-ai-worksheet-grade.mjs`): to change `INJECTED_JS`,
  `git checkout 47acfab -- u*_lesson*_live.html` (pristine) → `--apply` (the SENTINEL blocks in-place re-wire).
  Worksheets are **LF** (not CRLF).
- **vitest `mock.calls` elements are arg-ARRAYS** — `.map(c=>c[0]).find(...)`, not `.find(...).score`.
- **`git stash push <path> --` can POP a pre-existing user stash** → CLAUDE.md conflict. Don't stash for
  isolation probes; revert specific files instead.
- Known pre-existing root test fails (ignore): `grade-pipeline-w4`, `poll-archive-desk`, `study-guide`.
  Green baselines: fa ~6840 pass; roster-server 747/747; cr 1379 pass (8 pre-existing fails: classroom, redox-chat).
- ⚠ AI-worksheet-grading mechanism is jsdom/static-tested + adversarially reviewed but the timer/blur/async
  paths still want a real signed-in browser pass. Teacher confirmed the blur/reload/dedup fixes hold LIVE.

---
_(Older session notes removed 2026-06-03; the section above is authoritative.)_
