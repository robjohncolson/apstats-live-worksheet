# Review 2026-10-22 evening — follow-alongs `729461af..HEAD` (sprint D1, fa reviewer)

Independent read of the 38 commits / 390 files shipped today, formed from the diff (not the
sprint reports). Skipped: `state/archive/**`, `gitnexus-shadow/**`, `grade-engine.bundle.js`,
test-only rewrites except where an assertion was weakened.

## How each focus area was checked

| Area | Method | Verdict |
|------|--------|---------|
| Desk extractions (`js/desk-*.js`) | Each module's text found verbatim in the pre-sprint Desk (`git show 729461af:…`), i.e. byte-for-byte moves. acorn walk over every classic `<script>` segment (inline + modules) in document order: no synchronously-executed code references a name declared only in a LATER segment (transitive through functions called from top level), so no cross-script hoisting was lost; no duplicate top-level `let/const/class` across segments. `?v=` stamps present on all six modules; `scripts/bump-build.mjs` lists them; `sw.js` CORE lists them. Journeys harness boots the real split (DiskResourceLoader resolves `js/desk-*.js`). | OK |
| `teacher-classroom.html` `_wireAtBoot` | 14 listeners routed through it; no `getElementById(..).addEventListener` left at boot. The guard swallows a mistyped id silently — pinned by a new test (below). | OK + test |
| `offline-queue.js` unified | Diff vs `729461af` is comments + three helper extractions (`isParked`, `chargeFailure`, `countsAsServerFailure`) with identical conditions. The pre-sprint fa test file (`git show 729461af:tests/offline-queue.test.js`) passes unchanged against the new file (16/16). cr mirror byte-identical (`cmp`). | OK |
| Class Log fold | Token lives only in `localStorage['apstats_classlog_token']`, sent only as `Authorization: Bearer`; never logged/rendered (`textContent` everywhere). `mount()` gated on `_deskIsTeacher()` (preview-as-student / view-as flip it false). 401/403 from `/teacher/summaries` clears the token and re-renders the sign-in; a failed fetch is evicted from the cache. a2 side verified: `/roster/verify` returns `role`; `/teacher/summaries` is `requireTeacher` (Bearer), `course` must be in `CARD_COURSES` (`apstats` is); row shape matches (`landed/studentQuestions/promises/nextPrep/recordedAt/model`); phone sections are `"B"`/`"E"` = `cP`. | OK |
| `status.html` | No secrets, every URL public, one fetch per source per load, no timers. **Remote text was concatenated into `innerHTML` unescaped** — fixed (below). | FIXED |
| `ci.yml` | `npm test -- --shard=N/3` partitions the root include set deterministically; the three shards plus the park/roster job cover root + roster-server + `test:park` (park is NEW coverage, it was not in the old job). `CI_ONLY_EXCLUDES` unchanged. pytest still not in CI (pre-existing). | OK |
| Grade commits `22aa29e5`, `ddfccdf2` | Band moved E 100→107.5, P 85→92.5, I 60→70→81.25, `ungraded` 70 — every value ≥ its predecessor; the provisional floor (`provisionalFrqFloor`) reads `ungraded` and falls back to `I`; the frozen SY2526 config has its own `frqBand` (`data/grade-config.sy2526-freeze.json`). `LESSON_MAX` (105) applied on all four lesson outputs; unit path clamps per-row at 100 (E 107.5 → 100 ≥ old 100). Schoology sync is best-wins. Nothing lowers a stored number. Config was pinned but no test pinned the lesson numbers the band was solved from — added (below). | OK + test |
| `deskSource()/deskHtml()` split | 141 tests use `deskSource()`. Split-mode files (`X` = `deskHtml()`, `X_SRC` = `deskSource()`) keep their markup pins on the HTML. Two `deskSource()`-only files carried markup/security negatives that became vacuous — fixed (below); the broader class is listed under plausible. | FIXED |

## Confirmed findings (fixed, each with a test)

1. **status.html XSS surface** — `tileHtml()` wrote `t.value` / `t.detail` via `innerHTML`, and
   those were built from unescaped remote fields: GitHub `head_branch` (a fork PR names its own
   branch), `conclusion`, `html_url` (placed in an `href` unchecked), cr `status`/`cache`/
   `aiGradeAuth`, roster `commit`/`worker.mode`/`storage.errorCode`, `version.json` `build`, and
   the fetch error text. Fix: `esc()` on every remote value; `html_url` only linked when it starts
   with `https://github.com/`. Test: `tests/status-page.test.js` "renders hostile remote text as
   text" (an `<img onerror>` branch name, a `javascript:` URL, a `<b>` status, a `<script>` error
   message — none become elements).
2. **No lesson-level pin for the new band** — `roster-server/tests/grade.test.js` pins the config
   object only. Added `computeLessonGrades — production frqBand targets (2026-10-22)` to
   `roster-server/tests/lesson-grade.test.js`: all blanks right + {none, I I, P P, E E} → 80 / 87.5
   / 95 / 105; graded I > ungraded; reflection-only E → W 107.5 but lesson 105; a band without
   `ungraded` (SY2526 shape) still floors at I.
3. **Markup guards made vacuous by the C3 codemod** —
   `tests/calculator-solo-entry.test.js` asserted `app-ti84-overlay` / `app-ti84-frame` /
   `calculator-solo.html` are absent from `deskSource()`, which is JS only, so a re-added overlay
   `<div>` or `<a href>` would pass. `tests/desk-verify-tools.test.js` asserted "no token in the
   teacher-verify URL" against JS only; a markup `href` would evade it. Both now also read
   `deskHtml()`.
4. **`_wireAtBoot` hides a mistyped id** — new `tests/teacher-classroom-wire-at-boot.test.js`:
   every id passed to `_wireAtBoot` exists as `id="…"` in the page, and no boot-time listener
   bypasses the guard.

## Plausible (not fixed; file:line)

- **sw.js precache of the versioned modules is dead weight** — `sw.js:29` precaches
  `js/desk-*.js` without a query, but the Desk requests `js/desk-*.js?v=<stamp>`
  (`ap_stats_roadmap_square_mode.html:20802,21195,21199,21232,22676` and `:2960`) and
  `caches.match(e.request)` (`sw.js:81`) does not ignore search, so the precached entries never
  serve; the versioned URL is cached on first online load by the asset path. Same pre-existing
  pattern as `canvas_engine.js` etc., so not a regression — but a first visit that goes offline
  before all modules load would 504 on `js/desk-*.js`. Options: `ignoreSearch: true` on the
  asset match, or precache the stamped URLs.
- **`deskSource()`-only negative guards no longer see inline `on*=""` handlers** — markup
  attributes are JS too, and the pre-sprint tests read the whole file. Guards of the shape
  `expect(DESK).not.toContain('<fn>')` now miss an `onclick="<fn>()"`:
  `tests/desk-receipt-row.test.js:67-68`, `tests/desk-wallet-sessions-only.test.js:18`,
  `tests/desk-namefinder-footer.test.js:60`, `tests/desk-timed-deck.test.js:141-143`,
  `tests/desk-modal-polish.test.js:72-74,116`, `tests/no-guest-mode.test.js:46`,
  `tests/desk-grade-chip.test.js:53`. Cheapest general fix: a `deskAll()` helper
  (`deskHtml()` + modules) for whole-Desk negatives.
- **Lesson `W` can display above 100** — `lesson-grade.js` leaves `acc.W` unclamped (a
  reflection-only E lesson has `W = 107.5`, pinned by the new test); the Desk prints it at
  `ap_stats_roadmap_square_mode.html:20938` ("AI reflections: 107.5%") and forwards it at
  `:6734` / `:9710`. Cosmetic; the lesson number itself is clamped.
- **Class Log token persists per browser profile** — `js/desk-class-log.js:35-40` keeps the a2
  teacher token in `localStorage`; on a shared classroom machine signed in as the teacher it
  survives the Desk sign-out (the Desk's own sign-out does not clear `apstats_classlog_token`).
  Intentional for the fold's "sign in once" UX, but worth clearing in the Desk's teacher
  sign-out path.
- **a2 CORS allowlist** — `js/desk-class-log.js:23` calls the a2 roster-server cross-origin
  from `robjohncolson.github.io`; the a2 server reads `CORS_ORIGINS` from its Railway env
  (`algebra2-live-worksheet/roster-server/server.js:178-180`). If that allowlist is ever set
  without the GH Pages / Vercel-mirror origins the fold shows "Recording summary unavailable"
  (status 0) with no further hint. Not checkable from the repo.
- **`status.html` Vercel judge** — `judgeVercel` (`status.html:~190`) is amber whenever
  `pagesBuild` is unknown (GH Pages fetch failed) even if the mirror is fine; a cosmetic
  double-count on a GH Pages outage.
- **ci.yml** — each root shard re-runs `npm ci` for roster-server (needed by one test); fine
  but ~1 min × 3. pytest (`tests/test_*.py`) still has no CI job (pre-existing).

## Regression-risk calls

- The Desk split is the largest change and I found no load-order defect by static analysis or
  by the real-boot harness; the residual risk is a *future* edit that adds top-level code to an
  early inline segment calling a function that lives in a later module — nothing guards that
  today. A cheap guard would be the acorn cross-segment check from this review as a test.
- Grade commits: raise-only by construction; the one visible side effect is `W` > 100 on the
  reflection line (above).

## Commits (no push)

See the final report for hashes.
