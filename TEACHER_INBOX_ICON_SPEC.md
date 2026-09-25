# Teacher Inbox desktop icon — spec (2026-09-25, draft for teacher review)

Teacher request: "on the desktop I should have an icon like the ledger that tells me of issues I
need to address as a teacher, or messages from students that are new" — without opening the
teacher workspace first.

Display-only. **Teacher-only. No server changes. Never marks anything read.**

## What exists today (reuse, don't rebuild)

- Desk (`ap_stats_roadmap_square_mode.html`) desktop icons are static `<div class="app-icon"
  data-app="…">` blocks in the right column at `top: 36 / 150 / 264 / 396px` (wallet, bulletin,
  week, progress). The wallet icon already carries a red count badge (`.wallet-zero-badge`).
- `_deskIsTeacher()` is the teacher gate (false for students, signed-out, view-as, preview).
- The Desk already polls a teacher endpoint with the roster Bearer token: `_reviewFetchQueue()` →
  `/class/review-queue`, painting `#menu-review-badge` (FRQ responses awaiting review).
- The teacher workspace opens inside the Desk via `_paintTeacherTools(host, view)` →
  iframe `teacher-dashboard.html?workspace=1&view=<tab>`; the workspace honours `?view=` through
  `selectView`. Since `1e0a4133` the workspace has a `messages` tab.
- The workspace inbox stores its "seen" marker in localStorage `tsc-inbox-seen-at:<section or all>`
  (same origin as the Desk, so the Desk can read it; a `storage` event fires cross-tab).
- Server: `GET /teacher/nudge-inbox?limit=50[&section=…]` (`roster-server/nudge.js`), gated by
  `requireTeacher` (accepts the teacher's roster Bearer token). Returns `{ messages: [{ nudgeId,
  senderUsername, text, createdAt, … }] }`, newest first.

## D1 — The icon

- New desktop icon `data-app="teacherinbox"`, label **Teacher Inbox**, right column at
  `top: 528px` (below Progress), same markup pattern as the wallet icon (`onclick="selectAppIcon(this)"`,
  `ondblclick="openTeacherInbox()"`). Glyph: 📬 in the existing `.icon-img` box.
- Rendered `hidden` by default; `_teacherInboxRefreshVisibility()` shows it iff `_deskIsTeacher()`.
  Call it from wherever the Desk re-evaluates teacher-ness after sign-in / sign-out / view-as
  changes (the same places the Teacher menu is shown/hidden). Students never see it.
- Badge: `.teacher-inbox-badge` (copy the `.wallet-zero-badge` rules, reduced-motion safe) showing
  the total count; hidden at 0. `title` and `aria-label`: e.g. `3 new messages · 2 responses to
  review — open Teacher Inbox`.

## D2 — What the count is (v1: new messages only)

> Built 2026-09-25 in-session (Codex backend was rejecting requests). The review-queue source below was
> DROPPED: `_reviewBadgePoll` was retired earlier in September (`#menu-review-badge` no longer exists),
> so there is no cheap background review count to reuse. v1 = new student messages. Opening priority is
> Messages when N>0, else Needs attention.

`_teacherInboxState = { newMessages: 0, reviewQueue: 0, messages: [] }`.

1. **New student messages.** `_teacherInboxFetch()` GETs `/teacher/nudge-inbox?limit=50` with
   `Authorization: Bearer <rosterClient.token()>` (same shape as `_reviewFetchQueue`). "New" =
   `createdAt > seenAt`, where `seenAt = localStorage['tsc-inbox-seen-at:all']` (fall back to the
   per-section key if the Desk knows the active section; `null` → everything is new). The Desk
   never writes this key.
2. **Responses awaiting review.** Reuse the number `_reviewFetchQueue()` already produces for
   `#menu-review-badge` — do not add a second fetch; have the existing review refresh also call
   `_teacherInboxPaint()`.

Poll cadence: every 60 s while `_deskIsTeacher()` and `!document.hidden`, plus once right after
teacher sign-in; stop on sign-out. On 401 / 503 / network error keep the last count and set the
icon title to `inbox unavailable — open to retry`; never throw.

Also listen for `storage` events on `tsc-inbox-seen-at:*` and re-paint, so pressing "Mark read"
inside the workspace clears the Desk badge immediately.

## D3 — Opening it

`openTeacherInbox()`:
- If `newMessages > 0` → open the Teacher Tools window on the **Messages** tab.
- Else if `reviewQueue > 0` → open it on the existing review surface the Teacher menu uses today
  (the same handler as the review badge item).
- Else → open on the **Needs attention** tab.

`_paintTeacherTools` currently whitelists `['class','attention','recent','recovery']`; add
`'messages'` so `view=messages` reaches the iframe.

Also add a Teacher-menu item **Teacher Inbox (N)** that calls `openTeacherInbox()` (menu badge
pattern already exists for review).

## D4 — Not in v1 (say no unless asked)

- Per-student "needs attention" flags (pending grading per student, due items without a grade,
  unlinked Schoology accounts). Those need `/class/grades` + per-student saved-work calls; the
  workspace computes them on load. v2 could expose a cheap server count, but that is a
  roster-server change and out of scope here.
- Reading or replying to messages inside the Desk window. The workspace does that.
- Any write: no mark-read, no dismiss, no snooze.

## Tests (`tests/desk-teacher-inbox.test.js`, jsdom + `fnSrc` pattern from
`tests/desk-zero-warning.test.js`)

- Icon hidden for a student / signed-out; shown for a teacher.
- Count = messages newer than the seen marker + review count; badge hidden at 0; title text.
- `storage` event on the seen key re-paints to 0.
- `openTeacherInbox()` picks `messages` / review / `attention` in that priority.
- Fetch failure keeps the previous count and sets the unavailable title; nothing thrown.
- `_paintTeacherTools` accepts `messages`.

## Constraints

Edit in place; no wrappers, no flags. Preserve existing function names. LF endings. No commit, no
build bump (orchestrator). Run the new test plus `tests/desk-zero-warning.test.js`,
`tests/desk-user-role.test.js`, `tests/desk-view-as.test.js`, `tests/teacher-workspace.test.js`.
