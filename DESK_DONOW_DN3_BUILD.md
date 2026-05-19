# DN3 Build — Desk: Do Now card + completion calendar (STAGED)

**Frozen contract** (planner, 2026-05-18, session 100). DN3a: IMPLEMENTED +
Codex-reviewed (1 MAJOR + 3 MINOR + 1 planner-caught regression, all fixed —
see §Codex review). DN3b/DN3c: pending. The Desk rework half of
`DESK_DONOW_SPEC.md` §4.4 (decisions D1/D4/D5/D6/D7). Identity + feeders are
LIVE: DN2c (Desk roster sign-in, `820c79f`), DN2a/b (worksheet feeders),
DN2d (cr quiz feeder + cr roster, cr `1ccd8a2`). `/donow` is LIVE & prod-
verified (DN1 redeploy `1179a05`). The Desk does NOT yet consume `/donow`.

🔒 **Desk-ownership protocol:** the gradebook session OWNS
`ap_stats_roadmap_square_mode.html` for ALL DN3 work. The AI-tutor session
must NOT parallel-edit it.

## Staging (large + student-facing → 3 tight commits, not one)

| Stage | Scope | Risk |
|-------|-------|------|
| **DN3a** | `/donow` client + **Do Now card** (additive; the visible loop-closer) | low — purely additive, touches no existing calendar/year code |
| **DN3b** | **4-state calendar cell coloring** (D6) from `/donow` lesson states | med — reads into `rCal()` cell render |
| **DN3c** | **D5 one-calendar collapse** (SY26-27 only) + **D1 soft speed-bump** | high — structural/destructive to year machinery; student-facing |

**AI-tutor Desk-tile "🤖 Tutor prompt" copy action:** `AI_TUTOR_SPEC.md`
§31/§156 — wired **only once the teacher approves delivery** (teacher-gated).
**Out of DN3 scope**; deferred + noted so the AI-tutor session does not
parallel-edit the Desk. Do not architect DN3 in a way that blocks it.

## `/donow` contract (DN1, LIVE — reused, not re-specced)

`GET {window.ROSTER_SERVICE_URL}/donow` · auth `Authorization: Bearer
<rosterClient.token()>` (DN2c made the token available on the Desk).
→ `{ ok:true, nextTask:{ unit, lesson, activity, source, progress:{done,total},
reason } | null, lessons:[{unit,lesson,activities,lessonState}],
units:[{unit,pc:{done,total,state}}], earlierGapFlag }`. 401 if no/!token.

## DN3a — frozen scope (this commit), `ap_stats_roadmap_square_mode.html` only

1. **Do Now card HTML** — a `#donow-card` block inserted right before
   `<div class="cal-outer geneva">` (after `#legend-bar`), System-7 styled
   (Chicago/Geneva, platinum bevel — consistent with the Desk), with a single
   message line `#donow-msg` and an action affordance.
2. **`renderDoNow()`** (async, self-contained, never throws/blocks the Desk):
   - no `window.rosterClient` / no `rosterClient.token()` → card shows
     *"Sign in (Student ▸ Gradebook…) so your work counts and your Do Now
     appears."* (the Desk's existing roster sign-in is the Student menu /
     DN2c modal).
   - has token → `fetch(ROSTER_SERVICE_URL + '/donow', { headers:{
     Authorization:'Bearer '+token } })`. Non-OK / network error → quiet
     fallback message (never an error dialog; never blocks).
   - `nextTask` present → *"Do Now: {U} {lesson} — {activity}
     ({done}/{total} done)."* (no reason line — `/donow`'s `reason` is a
     machine token like `earliest-incomplete`, not student-facing copy;
     Codex #4).
   - malformed/partial `nextTask` (no `unit`) → the quiet fallback (never
     renders "undefined"; Codex #3).
   - `nextTask === null` → celebratory *"All caught up — every assigned item
     is done. 🎉"*.
3. **Invocation (poll cadence, §5 knob):** call `renderDoNow()` (a) at init
   next to `rCal();rProg();`, (b) on a dedicated `visibilitychange` listener
   when the tab becomes visible (cheap refresh on return; NOT piggybacked on
   the game loop's handler), (c) from DN2c `submitSignIn()` success — guarded
   `if (typeof renderDoNow === 'function')` so DN3a stays decoupled from
   DN2c's tested contract. **Sign-out:** `signOutStudent()` does
   `location.reload()`, so the post-reload init `renderDoNow()` IS the
   sign-out refresh (no separate call; Codex #1). No `setInterval` (avoid
   hammering roster-server).
4. **Non-goals (DN3a):** no calendar coloring (DN3b), no year collapse / speed-
   bump (DN3c), no AI-tutor tile (teacher-gated), no Supabase, no change to
   `rCal/rProg/loadYear/computeDefaultYear/SCHEDULE_DEFS`.

## Method

Planner implements directly (one cohesive additive change in the contended
Desk; fan-out = clobber risk) → Codex FOCUSED review (read-only, ≤540s) →
planner re-verify on disk (root vitest + new `tests/desk-donow-card.test.js`
+ `desk-roster-signin` 27/27 regression + `audit-feeder-ids` CLEAN; the 1
known-unrelated `study-guide.test.js` fail stays) → tight single-purpose
commit (forensic HEAD; revert the `data/skill-map.js` GENERATED-header
false-positive if the audit script touched it) → push `master`. Desk is **LF**
— keep edits EOL-clean.

## Codex review (focused, read-only, 2026-05-18) — DN3a

CLEAN: D7 server-mediated (Bearer to ROSTER_SERVICE_URL, zero Supabase);
invocation cadence (init + post-sign-in + dedicated visibilitychange, no
setInterval, separate from the game handler); security (no secrets, token
Bearer-only, nothing logged/persisted); no DN3b/DN3c/AI-tutor scope creep;
zero edits to rCal/rProg/loadYear/computeDefaultYear/SCHEDULE_DEFS.

Findings dispositioned:
- **#1 MINOR (sign-out refresh):** build doc said call `renderDoNow()` from
  `signOutStudent()`; impl reloads instead. RESOLVED by narrowing the doc —
  `location.reload()` → post-reload init `renderDoNow()` IS the refresh.
- **#3 MINOR (malformed nextTask):** truthy `{}`/`{lesson}` rendered
  "undefined". FIXED — `if(!nt.unit)` → quiet fallback.
- **#4 MINOR (reason line):** doc promised a friendly reason line; `/donow`
  `reason` is a machine token. RESOLVED by narrowing the doc (no reason line).
- **#6 MAJOR (test looseness):** bearer/wiring were source-regex/string-count
  only. FIXED — `tests/desk-donow-card.test.js` now uses a fetch spy asserting
  the exact `/donow` URL + `Authorization: Bearer` header, plus runtime tests
  for `token()` throwing and malformed-nextTask fallback, and a source check
  that the `submitSignIn` call is `typeof`-guarded.
- **Regression caught by planner re-verify (not Codex):** adding
  `renderDoNow()` into DN2c's `submitSignIn()` broke 2 `desk-roster-signin`
  vm tests (function absent in that sandbox). FIXED at root — the call is now
  `typeof`-guarded, which both fixes the test and properly decouples DN3a
  from DN2c's frozen contract.

## Acceptance (DN3a)

Signed-in student sees a Do Now card with their single earliest incomplete
activity + progress (D4), driven solely by `/donow` (D7 server-mediated, zero
Desk-side Supabase); not-signed-in shows a sign-in nudge; all-done shows the
celebratory state; the card never throws or blocks the Desk; existing
calendar/year behavior byte-unchanged. DN3b/DN3c follow as separate commits.
