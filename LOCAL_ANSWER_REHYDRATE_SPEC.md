# LOCAL_ANSWER_REHYDRATE_SPEC.md — answers never look lost on a device that still has them

Status: IMPLEMENTED Phases A+B (2026-09-17, Codex tasks 1-3 + review + fix pass 5). Phase C pending public-URL smoke.
Owner: CC main session.

## 0. The incident this fixes

Angie (Period B, `banana_seal`) types into a worksheet, leaves, comes back, and the boxes are empty.
The Desk says she is signed in. Her ledger has had zero rows since Aug 21.

Root cause chain (all verified 2026-09-17):

1. Session tokens expire 30 days after sign-in (`roster-server/token.js`, `THIRTY_DAYS_MS`). Her summer
   sign-in expired around Sept 9. The cached `apstats_roster.v1` session stays in localStorage forever,
   so every surface still *displays* her as signed in.
2. Worksheets have **no local answer save**. Persistence is the server ledger only, refilled on load by
   `hydratePriorAnswers()`.
3. With a rejected token, `gradebook-client.js` correctly captures each answer into `OfflineQueue`
   (IndexedDB) and raises the red "session expired" banner. But **nothing reads the queue back into the
   inputs on reload**. `hydratePriorAnswers()` asks the server (401 → nothing), so the page paints empty.
4. Every reload therefore looks like lost work, while the work sits one IndexedDB read away.

The gap is symmetric: the 2026-09-09 hardening made capture durable but left restore server-only.

## 1. Goals / non-goals

Goals
- **G1** A worksheet reload always shows every answer this student typed on this device, whether the
  server has it or not.
- **G2** A student with an expired token is told so *before* they type, on the Desk and on the worksheet,
  in a way that cannot be mistaken for "signed in".
- **G3** An active student never hits expiry at all (sliding refresh). Phase C, backend.

Non-goals
- No change to grade policy, ledger semantics, latest-wins, or the appeal clamp.
- No localStorage answer store. The `OfflineQueue` is already the durable outbox; use it.
- No merging of two accounts, no cross-student restore (ownership gate stays absolute).

## 2. Phase A — worksheet local re-hydration (codemod, 69 files)

### A1. New helper `hydrateLocalAnswers()` in every worksheet

Placed directly after `hydratePriorAnswers()`. Called:
- at the end of `hydratePriorAnswers()`'s `finally` (so it runs whether the server call succeeded,
  failed, or was skipped because `gradebookClient` is absent);
- on `roster-session-changed` and `storage` (`apstats_roster.v1`) events, after the existing re-hydrate;
- once more after `gradebookClient.syncOfflineQueue()` resolves (a drained row becomes a server row; the
  next server hydrate will own it, but the badge must flip from "kept on this device" to "restored").

Behaviour (pure, never throws, never blocks):

```
rows   = await OfflineQueue.all()                      // [] if the queue is absent
sid    = rosterClient.studentId()                      // null → return (no unattributed restore)
prefix = gbWsPrefix()                                  // null → return
keep   = rows.filter(r => r.studentId === sid
                       && String(r.itemId).startsWith(prefix + '-')
                       && r.kind !== 'appeal'
                       && typeof r.response === 'string' && r.response.trim())
latest per OfflineQueue.keyOf(r), pickLatest by transportSequence (same rule as the queue)
```

For each kept row:
- `source === 'worksheet'` → target `.blank[data-question-id="<itemId>"]`.
- `source === 'frq'` → target `textarea#<itemId minus prefix + '-'>`.
- Skip when the target has `dataset.gbEdited === '1'` or a non-blank value (**never clobber**; a
  server-restored value from `hydratePriorAnswers` counts as "has value" and wins).
- Set `value`, set `dataset.restored = '1'` and `dataset.localOnly = '1'`.
- Blanks: call `checkAnswer(blank)` for colour. Do **not** call `recordBlankToGradebook` (the row is
  already queued; re-recording would enqueue a duplicate keystroke).
- Textareas: no grade class (a queued FRQ has no verdict). If the row has `requestGrade === true` the
  existing FRQ pending indicator, if present on the page, may show "waiting to send".
- Badge via a new `_markLocalRestored(el)`: same placement rules as `_markRestored`, text
  `↻ kept on this device — not saved to your grade yet`, class `restored-badge local-only`, styled INLINE
  (red: `#b00020` border/text on `#fde7ea`) because worksheets have no `.restored-badge` CSS rule.
  If a `.restored-badge` already sits next to the element, replace its text rather than adding a second.

Ordering guarantee: `hydratePriorAnswers()` → (server rows win) → `hydrateLocalAnswers()` → (fills only
what is still empty). Because `checkAnswer` marks nothing as `gbEdited`, a later successful drain +
reload flips the badge to the plain `↻ restored` automatically.

### A2. The badge must go away when the row is saved

`gradebook-client.js` already fires the drain. Add one DOM signal: after `syncOfflineQueue()` sends a
row successfully it dispatches `window.dispatchEvent(new CustomEvent('gb-row-saved', {detail:{key}}))`.
Worksheet listener: find the element whose `dataset.localOnly === '1'` and whose key matches, clear
`localOnly`, rewrite the badge to `↻ restored`. Cheap, additive, and the page never needs a reload to
show "saved".

### A3. Codemod `scripts/wire-local-rehydrate.mjs`

Same contract as `scripts/wire-frq-graded-note.mjs`:
- pattern-guarded to `^u\d+_lesson.+_live\.html$` (edgar/MIT/study-guide untouched);
- idempotent via `MARKER = '// LR1: hydrateLocalAnswers'`;
- EOL-preserving (U1–U3 / U8–U9 are CRLF with BOM; U4–U7 are LF) — build LF templates, convert per
  file, write back with the file's original EOL and BOM;
- anchors:
  1. `finally { if (window.worksheetDiagnostics) window.worksheetDiagnostics.finish(diagnosticRun, prior); }`
     → append `hydrateLocalAnswers();` inside the finally (after `finish`).
  2. `        function _markRestored(el) {` → insert `_markLocalRestored` + `hydrateLocalAnswers`
     above it.
  3. The hydration trigger IIFE (`// Hydration trigger: fire on DOMContentLoaded`) → add the
     `roster-session-changed` and `gb-row-saved` listeners.
- dry run prints per-file `ok | already | anchor-missing:<n>`; `--apply` writes. Any file reporting
  `anchor-missing` blocks the rollout (fix the anchor, never special-case).
- Run `node scripts/bump-build.mjs` after apply (worksheet-diagnostics.js BUILD + version.json + sw.js
  lockstep; `pwa.test.js` pins it).

### A4. Tests (`tests/local-rehydrate.test.js`, Vitest + jsdom)

Static (every worksheet): marker present exactly once; `hydrateLocalAnswers` defined; called from the
`finally`; listeners wired.

Runtime (one representative worksheet, U6 L1-2, using the existing `makeWorksheet`-style harness in
`tests/reflection-grader.test.js` / `desk-*.test.js`):
- queued blank + queued textarea → both painted, badge text is the local-only one, `checkAnswer` colour
  applied to the blank, `record` NOT called.
- server row present for the same item → server value wins, badge is plain `↻ restored`.
- row belongs to a different `studentId` → not painted (ownership).
- row for a different prefix → not painted.
- `dataset.gbEdited === '1'` on the target → not painted.
- `gb-row-saved` for the key → badge text flips, `localOnly` cleared.
- `OfflineQueue` absent / `all()` rejects → no throw, page unchanged.

## 3. Phase B — expiry is visible before the first keystroke

### B1. `roster-client.js`: decode the token locally

The token's first segment is base64url JSON `{sid, exp}` (see `roster-server/token.js`). Add:
- `expiresAt()` → number | null (parsed `exp`; null on any decode failure — treat as unknown, not expired).
- `isExpired(skewMs = 60_000)` → `expiresAt() !== null && expiresAt() <= Date.now() + skewMs`.
- `current()` gains `expired: boolean` (additive field; existing callers ignore it).

Tests: valid/expired/garbage/absent token; `current().expired` present.

### B2. `gradebook-client.js`: pre-flight the expiry

In `record()`, online path, right after the `!_token()` check: if `rosterClient.isExpired()` is true,
skip the network, enqueue exactly as the 401 branch does today, set `_lastAuthFailToken`, raise
`_showNoIdentityNudge('expired')`, return `{ ok:false, reason:'auth', queued:true }`. Same outcome as
now, one fewer 401 per keystroke, and the banner shows on the *first* keystroke instead of after the
first rejected POST.

### B3. Worksheet identity wall

The wall (`restoreSavedUser()` / the sign-in wall block) currently paints the cached name as signed in.
When `current().expired` is true: paint the name with an "expired — sign in again" suffix, show the
red banner immediately on load (not on first record), and keep the inputs enabled (work is captured
locally; disabling would lose the answer the student is mid-typing).

Rolled out by the same codemod (anchor: the `restoreSavedUser` function's success branch), marker `LR2`.

### B4. Desk boot

`_reconcileRosterSection()` (fa `f979cd58`) already runs at boot. Add a sibling
`_reconcileRosterExpiry()`: if `rosterClient.isExpired()`, open the sign-in modal at once with the
existing "Your sign-in expired — sign in again. Your work on this device is saved and will sync."
notice, prefill the username, and set `_expiredSignInShown = true` so the /grade 401 path does not
double-prompt. The greeting/avatar strip shows "(expired)" until sign-in succeeds. View-as and teacher
role are excluded exactly as the existing /grade branch excludes them.

Tests in `tests/desk-roster-signin.test.js`: expired session → modal opens with the notice; valid →
no modal; view-as → no modal.

### B5. Sign-out is invisible; "sign in again" must be one obvious click (teacher, 2026-09-17)

Today "Sign Out" lives only inside the User menu dropdown and the password-change dialog. The
top-bar identity chip shows the cached name as if everything were fine. The teacher had to tell a
student to "sign in on top of your current login", which works (`submitSignIn` has no already-signed-in
guard; `writeSession` replaces the token and fires `roster-session-changed`) but nobody can discover it.

Changes (Desk, `ap_stats_roadmap_square_mode.html`):
- `updateStudentMenu()`: when `current().expired` is true, the chip reads `⚠ Sign-in expired` (never the
  name), `title` = "Your sign-in expired — click to sign in again", and the User-menu status line reads
  `Sign-in expired: <name> (<username>)`. Valid session: chip unchanged, but `title` becomes
  "Signed in as <name> — click to sign in again or switch account".
- `openSignInModal()`: when a session exists, show a one-line strip above the username field:
  `Signed in as <name>. Signing in again refreshes your session.` plus a text link **Sign out** that calls
  `signOutStudent()`. When the session is expired the strip reads
  `Your sign-in expired — sign in again to keep saving your work.` The strip is a new element
  `#signin-current-strip` inside the existing overlay; hidden when there is no session.
- The sign-in modal's username prefill (already present) makes "sign in again" = type PIN, press OK.
- After a successful `submitSignIn()` over an existing session with the SAME studentId: no welcome dialog,
  just a toast `Session refreshed — your saved work will sync now.` and `_scheduleOfflineDrain`-equivalent
  via the existing `roster-session-changed` fan-out. Different studentId: existing behaviour (full
  welcome + reload path) — that is a real account switch.

Worksheets: the red banner's link already points at the Desk; with B4 the Desk opens the modal on
arrival when expired, so no worksheet-side sign-in form is needed. The banner text gains "(one click
on the Desk)".

Tests (`tests/desk-roster-signin.test.js`): expired → chip text + modal strip text; valid → strip shows
name + Sign out link; Sign out link calls `signOutStudent`; same-student re-sign-in → no welcome dialog.

## 7. Dispatch plan (Codex gpt-6-astra via cross-agent runner, sequential, never parallel)

| # | Task | Files | Prompt |
|---|------|-------|--------|
| 1 | B1 + B2 shared clients + tests | `roster-client.js`, `gradebook-client.js`, `tests/roster-client.test.js`, `tests/gradebook-client.test.js` | `state/rehydrate-task1-clients-codex-prompt.md` |
| 2 | A1–A4 + B3 codemod, applied to all 69 | `scripts/wire-local-rehydrate.mjs`, `tests/local-rehydrate.test.js`, 69 worksheets | `state/rehydrate-task2-codemod-codex-prompt.md` |
| 3 | B4 + B5 Desk | `ap_stats_roadmap_square_mode.html`, `tests/desk-roster-signin.test.js` | `state/rehydrate-task3-desk-codex-prompt.md` |
| 4 | Adversarial review of the full diff | read-only | `state/rehydrate-task4-review-codex-prompt.md` |

CC runs `npm test`, `node scripts/bump-build.mjs`, `npm run gitnexus:shadow`, `detect_changes`, then
commits and pushes (push gate: `.git/PUSH_APPROVED`). Phase C waits for the public-URL smoke.

## 4. Phase C — sliding refresh (backend, auto-deploys, flag on push)

`POST /roster/refresh` (Bearer token): if the token verifies and has < 10 days left, return a fresh
30-day token for the same `sid`; otherwise return the current one. Roster-client `refreshIfNeeded()`
is called by the Desk at boot and by worksheets after a successful `hydratePriorAnswers()`. Writes the
new token through `writeSession` so the existing `roster-session-changed` plumbing fans out.

This makes expiry a "did not open the app for 30 days" event only. Phase C ships after A+B are live and
verified on the public URL; it touches `roster-server/` (grade-adjacent, Railway auto-deploy).

## 5. Rollout order

1. Phase B1 (roster-client) + B2 (gradebook-client) — shared files, one commit, tests green.
2. Phase A codemod + A4 tests + B3 (same codemod run) + bump-build — one commit.
3. Phase B4 Desk — one commit (Desk file is shared with the Codex PICO PARK track: stage by hunk).
4. Public-URL smoke: sign in on a Chromebook, hand-edit `apstats_roster.v1` to an expired token, type
   into U1 L1, reload → answers present with the local-only badge; sign in again → badge flips, ledger
   row appears in `--view`.
5. Phase C after the smoke passes.

Angie today, independent of this spec: sign out + sign in on the Desk (`banana_seal` / 3321). Her
queued rows drain on the next worksheet load; nothing else is needed for her grade.

## 6. Open questions for the teacher

- Q1 Badge wording. Proposed: `↻ kept on this device — not saved to your grade yet`. Shorter alternative:
  `↻ not saved yet`.
- Q2 Phase C refresh threshold: 10 days left (proposed) vs refresh on every boot.

## 8. Review outcome (2026-09-17) — deviations from §2/§3 as first written

Codex adversarial review returned BLOCK (2 blockers, 7 majors). All addressed in task 5:

- **B2 pre-flight DROPPED.** Local expiry is advisory only (chip, modal, banner). A skewed device clock
  must never veto writes; the server 401 stays the sole write authority. `isExpired(0)` means zero skew.
- **Expiry is duration-based** when the session has `signedInAt` (ISO string, written at sign-in and
  password change): expiry = signedInAt + 30 days by the device's own clock. Token `exp` decode is the
  fallback for older sessions only.
- **Restored values are owned.** Every restored element (server or local) carries `data-restored-owner`;
  `_lrResetForeignRestores(sid)` clears foreign values before any re-hydrate and on session change, so
  a classmate signing in on another tab never inherits — or heals/records — the previous student's answers.
- **`_postRecord` rechecks the row owner** against the current session before reading the token
  (pre-existing drain race; a foreign row stays queued, never sent).
- **No local hydration in view-as / read-only.**
- **`gb-row-saved` carries `studentId` + `transportSequence`;** the badge flips only for the same owner
  and a sequence ≥ the painted one. An unmatched save debounces a server re-hydrate (drain-before-read race).
- **Boot banner can escalate:** an uncaptured auth failure rewrites the banner to the "NOT being saved" text.
- **Desk boot prompt skips `OFFLINE_MODE`** and reads the teacher role from `current().role` first.
- Integration test added with the real queue + clients (account switch, no POST under the other token).
