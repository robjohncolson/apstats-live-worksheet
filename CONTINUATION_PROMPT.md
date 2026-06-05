# CONTINUATION PROMPT — pre-launch lows folded + U5-U7 Blooket backfilled; NEXT = teacher's go-live req.ip glance + the last 3 Blooket sets

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-04 (session 5).
> follow-alongs HEAD = `9bd9345`. Repo `apstats-live-worksheet`, branch `master`, GH Pages + `roster-server/`
> auto-deploy to Railway on push. Teacher tests on the **public GH Pages URL** (SSHes from a work laptop) —
> commit+push promptly; `file://` is not a valid surface. Style: brainstorm → spec → implement (user reviews).
> Memory dir: `C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.
> **Real students + a colleague teacher onboard IMMINENTLY.**

## ⏭ NEXT (in priority order)
1. **LIVE go-live check (teacher-only) — DE-PRIORITIZED.** The teacher decided the per-IP claim cap going
   global is a non-issue at one-section scale. The temp `[GOLIVE] claim req.ip=` log is **DEPLOYED** (`3bf0e29`,
   top of `POST /roster/claim`) and passively prints real signups' `req.ip` to Railway logs. ACTION: glance once
   during first-day onboarding to confirm `req.ip` is distinct per client, then **ask CC to revert the 4
   `[GOLIVE]`/TEMP lines**. If `req.ip` is shared: bump `app.set('trust proxy', N)` to the real hop depth, OR set
   env `SIGNUP_CLAIM_MAX=600` (and `VERIFY_IP_MAX` for the new verify limiter). Smoke: `/health`→`{ok:true}`;
   one real signup → appears in Class Gradebook; teacher signup with **`apstats2627`** → `role=teacher`.
2. **Finish the Blooket backfill (data; due Q2 = 2026-11-14).** DONE: **3.6/3.7 + 4.1-4.6 + U5.3-U7.9 (26 topics,
   this session)**. REMAINING: **4.7-4.12, 5.1, 5.2** — no Blooket set authored ANYWHERE yet (not even `lesson_urls`).
   **⚠ THE LIVE SOURCE IS THE SUPABASE `lesson_urls` TABLE (`blooket_url` column), NOT `units.js`** — the Desk's
   `loadSupabaseOverlay()` fetches it at runtime; the teacher authors Blooket there via the cr editor. To check
   coverage, QUERY `lesson_urls.blooket_url` (anon key is baked in the Desk) — do NOT trust static files. As the
   teacher makes the last 3 sets, re-mine + propagate (recipe below). `BLOOKET_BACKFILL_CHECKLIST.md`.
3. **Backlog (none blocking):**
   (a) **username re-roll for EXISTING students** ("change my username", reuse the claim/unique FCFS machinery);
   (b) **cr orphan-answers ONE-TIME PURGE** — the cascade is now LIVE (future deletes auto-clean cr `answers`),
       but run this once on Supabase if you deleted any test accounts pre-launch:
       `DELETE FROM public.answers WHERE username IN (SELECT a.username FROM public.answers a LEFT JOIN public.users u ON a.username=u.username WHERE u.username IS NULL);`
   (c) Python `tools/schoology_components.py` PC+Poster + quiz-source fix is **DONE** (s5); the 3 stale root tests
       are **DONE** (s5); the B/E + timezone divergence is **DONE** (s5); 3a/3c were investigated → no change needed.

## ✅ SHIPPED THIS SESSION (2026-06-04, s5) — pre-launch lows + Blooket backfill
- `3bf0e29` — **TEMP req.ip go-live diagnostic** in `POST /roster/claim` (revert after the check, see NEXT #1).
- `62e9de6` — **roster-server (auto-deploys):**
  - **#3d** `sectionToPeriod('PeriodX')→'E'`: the grade engine's due-filter AND the teacher-dashboard `due` flag
    now read **Period E's** schedule (the Desk forces `cP='E'` for PeriodX) instead of the B∪E union a null period
    triggered. Only relaxes premature due-zeros → **live PeriodX grades hold steady or tick UP**. +`PeriodX→E` test.
  - **#3e** `verifyIpLimiter` (createRateLimiter, default 300/15min, env `VERIFY_IP_MAX`/`VERIFY_IP_WINDOW_MS`)
    applied before bcrypt in `POST /roster/verify` (bcrypt-DoS hardening; unknown usernames already 401 pre-bcrypt,
    so the vector is a flood of known usernames). +per-IP cap test.
  - **#3b** `deleteRoster` returns `login_username`; new `db.deletePeerAnswers(username)` deletes the cr `answers`
    rows (SAME Supabase instance, keyed by username, NOT FK'd) so a deleted student's peer answers don't orphan;
    best-effort in the DELETE handler (a cleanup failure never fails the already-done delete). +2 cascade tests.
  - roster-server **820/820**.
- `38545ee` — **Desk + tests:** `tdy()` now returns "today" in the school timezone (America/New_York) to match
  the server's `todayInTz` (no-op for Eastern users; fixed a `now`-scope bug in the proposed patch). + repaired the
  **3 stale structural tests** (study-guide `../`→`./` [the files ARE git-tracked in the repo root; `../` doesn't
  exist]; grade-pipeline-w4 modal slice 1200→1600 [`lesson.Cws` at offset 1445; code was fine]; poll-archive-desk
  matches the `<script>` TAG string, not the bare filename [which also appears in a comment 25k chars before the tag]).
  Full root suite **6916 passing**.
- `0810362` — **Python Schoology generator** now mirrors `gradebook-grid.js`: quiz presence sourced from the ANSWER
  KEY (gradable `^U#-L#-Q`, reads the inner `doc.answerKey` map) → the **{5.6, 9.3}** empty-column bug is gone;
  added per-unit **PC + Poster** columns (kind `progress_check`/`poster`; keys `PC:U#`/`POSTER:U#` match node);
  producer fills PC from `units[U#].pcRawPct`, Poster intentionally null (no rubric yet). Caller passes
  `ANSWER_KEY_PATH`; fixed an empty-`topic_keys` sort crash. py **19/19**.
- `9bd9345` (fa) + `baf16f9` (Agent) — **Blooket backfill U5.3-U7.9** (26 topics: 5.3-5.8, 6.1-6.11, 7.1-7.9):
  mined the URLs from the live Supabase `lesson_urls` overlay → wrote `urls.blooket` into `roadmap-data.json` +
  `Agent/state/lesson-registry.json` → regenerated `blooket-lessons.json` (**43→69** topics). **GRADE-AFFECTING:**
  those topics now have `hasBlooket=true`, so recorded Blooket scores engage the v3 Blooket track (were
  visible-but-uncounted: students could play them, the engine ignored them).

### Decisions folded (no code change)
- **#3a** signup-vs-signin: **KEEP current** (sign-in for returning devices, signup for brand-new). Both modals
  already cross-link, so no one is stranded; best for the personal-device deployment.
- **#3c** My Gradebook category-avg: **VERIFIED NO-OP** — the server average (`gradebook-grid.js`) only counts
  non-null cells, which are always visible, so it can't fold in hidden columns. No churn added to the 14k-line Desk.

## 🔁 BLOOKET PIPELINE (for #2)
**⚠ LIVE SOURCE = Supabase `lesson_urls.blooket_url`** (project `hgvnytaqmuybzbotosyj`; the Desk
`loadSupabaseOverlay()` fetches `select=topic,worksheet_url,drills_url,quiz_url,blooket_url` at runtime). The
teacher authors Blooket THERE via the cr editor — NOT only `units.js`, and the STATIC files lag, so the v3 engine
won't count a Blooket until it's propagated. **Recipe to backfill:** query `lesson_urls` for `blooket_url` per topic
(anon key in the Desk) → write `urls.blooket` into BOTH `roadmap-data.json` (`.lessons[topic].urls.blooket`;
`JSON.parse`→set→`JSON.stringify(obj,null,2)` with **NO** trailing newline = exact roundtrip) AND
`Agent/state/lesson-registry.json` (`[topic].urls.blooket`; `JSON.stringify(obj,null,2)+'\n'` = exact roundtrip)
→ run `roster-server/scripts/gen-blooket-lessons.mjs` (roadmap-data → `blooket-lessons.json`, the v3 Blooket-track
denominator) → verify → commit fa (roadmap-data + blooket-lessons) + Agent (lesson-registry). I did TARGETED
roadmap-data edits (NOT a full `build-roadmap-data.mjs` rebake), so the Desk's static `BAKED_REGISTRY` fallback
still lags U5-U7 — the runtime overlay covers it, and a future rebake re-syncs it from the registry (the SOURCE).
`units.js` (cr) tracks only videos+blookets and lags the overlay; it is NOT the engine source.

## ⚠ GOTCHAS (load-bearing)
- **USE_V3_GRADING is LIVE.** Grade-engine/`gradebook-grid.js`/`blooket-lessons.json` changes move REAL grades.
  This session's **#3d (PeriodX→E)** AND **Blooket backfill** both moved live grades intentionally (both can only
  raise/hold, not tank). The display date-gate is DISPLAY-ONLY; the server `col.due` flag is ADDITIVE (no opts →
  no `due` → clients show all = safe degrade).
- **Blooket live source = Supabase `lesson_urls`, not the static files** (see pipeline). Always query it to check coverage.
- The **Desk** (`ap_stats_roadmap_square_mode.html`, ~14k lines) is a SINGLE FILE edited directly. jsdom CAN host it
  (canvas getContext throws → load-throw, hoisted functions stay callable). Keep render helpers function-local +
  typeof-guard cross-feature calls. For control-char regex patterns use a node script / PowerShell byte-replace, not Edit.
- **Commit own paths only** — both repos have many unrelated dirty/untracked files (`.ai-tutor-*.result.md`, etc.).
  Stage explicit paths; never `git add -A`.
- **`git commit -m @'…'@` here-string LEAKS a stray `@`** → write the message to a temp file + `git commit -F`.
- **Cross-repo:** this session touched 3 repos — follow-alongs (`master`, GH Pages+Railway), Agent (`master`,
  lesson-registry source), curriculum_render (`main`, GH Pages + units.js + `curriculum.js` is SACRED — never edit).
  Both roster-server (follow-alongs) AND cr's `answers`/`users` tables live in the SAME Supabase (`bzqbhtru…`/cr URL).
- **Bash tool resets cwd between calls + MSYS2 mangles backslashes in heredocs** — use absolute paths + the Write
  tool for node scripts. **In `node -e`, don't name a var `URL`** (shadows the global `fetch` uses → "URL is not a
  constructor"). Workflow scripts: NO backticks inside template-literal strings.
- Green baselines: **roster-server 820**; python schoology **19/19**; full root **6916 passing**. The only remaining
  root noise is a flaky parallel `localStorage`-leak in `desk-student-dm` / `gradebook-feeder-wiring` (unhandled-error
  logs, 36/36 + 134/134 assertions PASS in isolation). The 3 previously-failing root tests are now FIXED.
- Migrations are USER-RUN on Supabase; **NONE new this session**. The DB UNIQUE on `roster.login_username` is the FCFS guarantee.

---
_(Older session notes removed 2026-06-04 s5. The above is authoritative.)_
