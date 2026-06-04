# CONTINUATION PROMPT — in-app gradebook SHIPPED+LIVE; NEXT = student username self-onboarding (re-roll)

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-03 (session 3).
> follow-alongs HEAD = `5146122` (+ the explainer-copy fix landing with this prompt's commit).
> Ultracode is on. Repo `apstats-live-worksheet`, branch `master`, GH Pages + `roster-server/` auto-deploy
> to Railway on push. Teacher tests on the **public GH Pages URL** (SSHes from a work laptop) — commit+push
> promptly; `file://` is not a valid surface. Style: brainstorm → spec → implement (the user reviews the plan).
> Memory dir: `C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.

## ⏭ NEXT TASK (primary): student username self-onboarding with RE-ROLL
**Goal (teacher, 2026-06-03):** Students tap a button that **randomly generates a username** (fruit_animal
style) and can **re-roll until satisfied**, then claim it. **Collisions = first-come-first-serve.** Brainstorm
the design first (don't auto-build); the teacher wants student *re-roll + pick*, NOT silent auto-assignment.

**What already exists (grounding — verified s3):**
- `roster-server/username.js` → `generateUsername(attempt)`: `fruit_animal` (attempt<4) → `fruit_animal_vehicle`
  (<8) → `fruit_animal_<0-9999>` (else). Word lists FRUITS/ANIMALS/VEHICLES are in that file.
- `roster-server/server.js` `POST /roster/enroll` (**TEACHER-GATED**, ~line 63): auto-generates a username +
  **retries on DB unique-violation up to 8×** + `db.insertRoster({realName, password, section, loginUsername})`.
  So the collision-retry + first-come-first-serve pattern ALREADY exists — but it AUTO-assigns and is teacher-only.
- First-come-first-serve is the **DB UNIQUE constraint on `roster.login_username`** (the atomic insert IS the
  race winner; there is no in-memory set — see username.js header comment).
- Other roster endpoints: `POST /roster/verify` (login), `/roster/resolve`, `/roster/change-password`.
- Sign-in UI: `openSignInModal` in the Desk (`ap_stats_roadmap_square_mode.html`). cr identity is unified onto
  the roster (shared `apstats_roster.v1` localStorage, same origin). Server = `https://roster-production-12c1.up.railway.app`.

**The gap / what to build:** there is (almost certainly) **no STUDENT self-signup** today — enroll is
teacher-gated + auto-assigns. The new flow = a student-facing onboarding that **re-rolls candidates + claims a
SPECIFIC one**.

**Design to settle FIRST with the teacher:**
1. **KEY QUESTION — self-signup vs pre-enrolled?** Does a student create their OWN account from scratch (then we
   must capture real_name + password + section in the flow), or claim/rename a teacher-pre-enrolled slot?
   `insertRoster` needs realName + password + section. Where do those come from self-serve? (Section likely via a
   class code / the teacher's join link.) Resolve this before building.
2. **Claim model:** student re-rolls (client shows one candidate at a time), "Claim this" → server **atomic insert**
   with the chosen username; DB unique-violation → "taken, re-roll please" (first-come-first-serve). An advisory
   `GET /roster/username-available?u=` can make the UX snappy, but the AUTHORITATIVE claim is the insert (a
   pre-check races — never trust it as the guarantee).
3. **Endpoints (likely NEW, student-facing / NON-teacher-gated):** e.g. `GET /roster/suggest-username`
   (server-generated candidate via `generateUsername`, optionally availability-checked) + `POST /roster/claim`
   (insert the chosen username; reuse the enroll unique-retry shape but with the STUDENT's picked name). Because
   it's un-authed, guard against abuse (rate-limit and/or a class-code/join-token gate).
4. **UI:** in `openSignInModal` add a "Create account / 🎲 Generate username" path — show a candidate, a "🎲 Re-roll"
   button (new candidate), "Claim" → on success store the roster identity (`apstats_roster.v1`) + sign in. Match the
   System 7 modal aesthetic (`.dialog-overlay`/`.dialog-box`; see `openSignInModal` + the day-grade/my-gradebook modals).

## ✅ SHIPPED THIS SESSION (2026-06-03 s3): the in-app "1:1 Schoology gradebook" arc — LIVE
Teacher class grid + student modal, both showing the two totals reconciled, + the live v3 quiz fix:
- `a5c227a` — data-driven fine-grained Schoology **column generator** (`tools/schoology_components.py`: FA/Quiz/
  Blooket per lesson; X.1 openers auto-skip quiz; combined worksheets dedup). `--granularity component` on
  `schoology_sync_section.py` + `build_schoology_fixture.py`; `tools/build_periody_mock_fixture.py` (mock + no-rig
  plan preview = 171 cols). Fixes the "1.1 has no quiz" defect by construction.
- `aac8472` — `roster-server/gradebook-grid.js` deriver, surfaced ADDITIVELY on `/grade` + `/class/grades` (the
  `gradebook` field: per-quarter columns/cells/categoryAverages/schoologyTotal/v3Total/reconciliation).
- `8371f73` — **teacher class grid** in `teacher-dashboard.html` (per-quarter component grid + both totals + Δ).
- `dbe7b41` — **tightening + Phase 4**: Follow-Along cell + Schoology push value = `lessonGradeNoQuiz` (worksheet
  blanks + AI reflections = the v3 Lessons-track value; reflections were DROPPED from Schoology before). Engine
  exposes it additively (quarter math untouched). Phase 4 = per-student "why they differ" reconciliation drawer.
- `06ce4d7` — `reconcileQuarter` branches on the UNROUNDED [0,1] fractions (surfaced `pcAvgRaw`/`workAvgRaw`) so the
  "why" can't contradict v3Total at the 40-floor boundary; `non-v3` guard; tie-aware ceiling label.
- `bbe7419` — **#2 LIVE v3 grade fix (only-RAISES, review-verified monotonic):** the Quiz track now divides by due
  QUIZ-BEARING lessons (`quizTotal>0`), not all due lessons — quiz-less openers no longer drag the quiz avg down.
  Drawer gained a "v3 Work track … Quizzes X (n/m taken)" verification line.
- `7048a02` — thread `quizDue/quizDone/quizTodo` through the `grade.js` quarters serializer (the drawer line was a
  silent no-op; it builds `quarters[qKey]` by explicit field-pick, not a spread). Display-only.
- `5146122` — **Phase 3 student "My Gradebook" modal** in the Desk (📊 chip in the Do Now → modal; Q1-Q4 tabs; BOTH
  totals "Your grade" live-v3 + "Report-card estimate" Schoology + Δ + the why + every cell by category). Teacher
  chose "both grades, like the teacher view".
- (this prompt's commit) — "how grades work" explainer copy fixed (was "your live grade IS the Schoology number" →
  now says they can differ slightly + points to 📊 My Gradebook).

**Schoology category weights (teacher's REAL gradesetup, chosen to replicate v3 linearly):** PC 50 / Lesson 15 /
Quizzes 15 / Posters 15 / Blooket 5 (= `V3_WORK_WEIGHTS` 3:3:3:1 work split, 50/50 PC/Work). Schoology blends
LINEARLY; v3 is the max/mean conditional — the Δ + reconciliation surface the gap. **Why v3 reads BELOW Schoology
early:** v3 counts not-done / structurally-absent components as 0s in its due-denominators; Schoology skips blanks.
Converges at term-end. Memory: `project_gradebook_inapp_grid`.

## 🔧 OPEN FOLLOW-UPS (fold when convenient — none blocking)
- **Student-modal polish** (backstop review `wd9beuqe0`, all MINOR/NIT, NO grade impact) — in `renderMyGradebook`
  (`ap_stats_roadmap_square_mode.html` ~9707-9799): (1) **Posters (15%) renders as an empty section to students**
  (its cells are always null) → reads like missing points; skip the section when all cells null + no average, OR
  label it "(not yet graded — not counted)". (2) a category present in columns but absent from `_myGradebookCatOrder()`
  is silently dropped — append leftover categories so the breakdown always reconciles. (3) the modal title never shows
  the quarter → set `'My Gradebook — ' + qk`. ⚠ The teacher grid's empty-Posters rendering is INTENTIONAL and pinned
  by `tests/teacher-gradebook.test.js` — fix the STUDENT modal only.
- **Python generator pass** (`tools/schoology_components.py`): add **PC + Poster columns** (teacher decided to include
  them); **fix quiz-source** — the column generator reads roadmap `urls.quiz` while the producer fills from engine
  `quizTotal`; they diverge on `{5.6, 9.3}` (roadmap has a quiz URL but the answer key has no gradable `U#-L#-Q` items
  — they use a `-MCQ-` infix the regex misses) → 2 permanently-empty quiz columns. Align the generator to `quizTotal`
  (gradebook-grid.js already does). Adversarial-confirmed.
- **U4-7 Blooket backfill (DEFERRED, DUE by Q2 start = 2026-11-14):** roadmap-data `urls.blooket` is null for ALL of
  units 4-7 (+ 3.6/3.7) → the engine `hasBlooket`, the Desk links, AND the Schoology generator exclude them, even
  though Blooket CSVs exist. Fix = add the dashboard URLs to `roadmap-data.json` + regenerate
  `roster-server/data/blooket-lessons.json` via `roster-server/scripts/gen-blooket-lessons.mjs`.

## ⚠ GOTCHAS (load-bearing)
- **USE_V3_GRADING is LIVE** on Railway — grade-engine changes move REAL grades (the #2 fix `bbe7419` only-RAISES,
  review-verified). `roster-server/` auto-deploys on push.
- The **Desk** (`ap_stats_roadmap_square_mode.html`, ~13.5k lines) is a SINGLE FILE edited DIRECTLY (NOT wire-driven —
  the 69 worksheets are). jsdom CAN host it (canvas `getContext` is unimplemented → a load-throw, but hoisted
  functions stay callable; keep render helpers function-local + `try/catch` the `quarterOfDate`/`MacSFX` calls).
- **Commit own paths only** — both repos have many unrelated dirty/untracked files (`.ai-tutor-*.result.md`,
  `tools/_periody_*` throwaways, etc.). Stage explicit paths; never `git add -A`.
- **`git commit -m @'…'@` here-string LEAKS a stray `@`** → write the message to a temp file + `git commit -F <tmp>`.
- Green baselines: **roster-server 772**; Desk suite (`tests/desk-*.test.js`) green; python schoology tests green
  (16 components + 130 sync). Known pre-existing ROOT fails (ignore): `grade-pipeline-w4`, `poll-archive-desk`,
  `study-guide`. browser-harness can't run on this Windows host (no AF_UNIX).
- Migrations are USER-RUN on Supabase. The DB UNIQUE on `roster.login_username` is the first-come-first-serve guarantee.

---
_(Older session notes — Task A cross-device greying + Task B Schoology summer mock, both shipped/parked — removed
2026-06-03 s3. The above is authoritative.)_
