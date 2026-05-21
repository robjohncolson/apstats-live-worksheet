# LIVE_CLASSROOM_SPEC.md

> Status: DRAFT -- written 2026-05-21 (session 104). Revision 2.
> Codex gap-review (round 1) found 4 gaps before timing out; this
> revision applies all 4 plus a planner gap pass. Next: optional Codex
> verification pass -> planner final look -> implementation. Do not
> relitigate the Section 3 locked decisions.
>
> Revision log:
> - r1 -- initial draft from the session-104 brainstorm.
> - r2 -- applied Codex round-1 findings (teacher-vs-student avatar
>   rendering; blind-poll own-vote on reload; durable check-in/vote vs
>   the 45s liveness TTL; the section-label question) plus a planner
>   pass (gate/poll mode exclusivity; multi-teacher controls; the
>   cockpit checked-in readout; poll option bounds; client
>   reconnect/backoff; server-restart behavior; the v1/v2 message
>   split).

## 1. Overview

Live Classroom is a shared, real-time board for the AP Statistics "Desk"
(`ap_stats_roadmap_square_mode.html`). Every signed-in student in a class
section has an avatar on a discrete-grid canvas that is rendered to look
like a TI-84 Plus CE calculator screen. One substrate carries two
mechanics:

- GATE (v1) -- a once-per-session check-in ritual. The teacher arms
  "today's hole"; each student walks their avatar into it and is checked
  in; the board drains to empty; the teacher reads the room at a glance
  and gets a green light to start the lesson.
- POLL (v2) -- ad-hoc voting. The teacher opens a question with two or
  more options; each student moves their avatar onto a choice; the live
  cluster of avatars IS the distribution; a snapshot renders as an
  authentic TI-84 stat plot, tagged with the day's lesson.

The board replaces a verbal "is everyone ready?" roll call with an
in-world ritual that keeps students' hands on the keyboard.

## 2. Goals and non-goals

Goals:
- Give the teacher a fast, glanceable read of who is present and engaged.
- Funnel every student onto the correct lesson with a low-friction ritual.
- Build TI-84 fluency passively by rendering all output as calculator
  screens (see D8).
- Stay cheap and lag-free for 25-30 concurrent students (see D2).

Non-goals (v1):
- Not graded. Check-ins and votes are never written to `item_ledger` or
  any gradebook feeder. This is classroom management, not academic work.
- No attendance history. State is live and ephemeral; nothing persists
  past the session. A future opt-in attendance log is out of scope.
- Not the transpiled TI-84 ROM. v1 renders with the trainer's renderer;
  the `ti84-transpile` repo is a future fidelity ceiling only.
- No continuous-motion multiplayer. The board is a discrete grid with
  event-based updates (D2).
- No WebRTC. The classroom board uses only the WebSocket relay.

## 3. Locked decisions (from the session-104 brainstorm)

- D1. Two mechanics, one substrate: GATE (v1) and POLL (v2) share one
  grid board, one avatar system, one WS room model.
- D2. Discrete grid, not continuous motion. The server broadcasts
  DECISIONS (checked-in, voted), never streamed positions. Avatar
  walking/bouncing is client-side animation only -- it never crosses the
  wire. Authoritative shared state is tiny.
- D3. The board renders as a 320x240 TI-84 Plus CE screen -- the
  calculator's pixel grid and font -- nested inside the Desk's System 7
  window chrome.
- D4. GATE: a student checks in -> their avatar enters the hole and is
  removed from the board. The canvas drains to empty. The teacher
  watches it drain.
- D5. The green light is a teacher toggle. Default: informational (the
  teacher puts the video on the big screen manually; the light just
  confirms the room is ready). Option: synchronized start (the
  teacher's GO broadcasts a video-start to every Desk).
- D6. Identity asymmetry. Students see each other as usernames; the
  teacher sees real names. The WS channel carries usernames ONLY; the
  teacher's client maps username -> realName locally.
- D7. The hole changes daily and is correlated with the schedule (the
  Desk already computes today's lesson). Daily variation is for
  freshness, not anti-cheat.
- D8. TI-84 stat-plot output reuses the trainer's
  `ti84-trainer-v2/native/screen-renderer.js`, refactored to be
  data-driven. The `ti84-transpile` repo is a future fidelity reference,
  not a v1 dependency.
- D9. The teacher cockpit is its own page (`teacher-classroom.html`),
  launched from the Desk's Teacher menu -- not an in-Desk overlay.
- D10. Sections are not hardcoded. The roster `section` field is the WS
  room key. Today there is one section (proposed label `PeriodX` -- see
  OPEN-2); the design must handle one-section-now and
  many-sections-later with no code change.
- D11. Not graded (see Non-goals).
- D12. The WS work is additive to the existing curriculum_render WS
  server. Sacred `curriculum_render/data/curriculum.js` is never touched
  (the WS server is `railway-server/server.js`).
- D13. v1 ships the GATE; v2 ships the POLL on the same substrate.

## 4. Architecture

### 4.1 Repos and boundaries

| Piece | Repo | Path | Deploys to |
|-------|------|------|-----------|
| WS server changes | curriculum_render | `railway-server/server.js` | `curriculumrender-production` Railway service |
| Board component | follow-alongs | `classroom-board.js` (new) | GitHub Pages |
| TI-84 plot module | follow-alongs | `ti84-plot.js` (new, v2) | GitHub Pages |
| Teacher cockpit | follow-alongs | `teacher-classroom.html` (new) | GitHub Pages |
| Desk integration | follow-alongs | `ap_stats_roadmap_square_mode.html` (edit) | GitHub Pages |

Boundaries:
- The WS change is additive to an existing server; it must not break
  DogePresence or the Tetris multiplayer that share that server. It must
  be deployable on its own (no follow-alongs change is a prerequisite
  for deploying the server, and vice versa).
- Sacred `curriculum.js` is not in scope and is never written.
- The `ti84-transpile` repo is read-only reference; not modified, not
  imported.
- roster-server is NOT changed. The classroom board reuses the existing
  public `GET /roster/section/:section` for the teacher's name map.

### 4.2 Why the curriculum_render WS server (not roster-server)

roster-server is a stateless REST auth/gradebook service with no
WebSocket layer. The curriculum_render server already runs a WS relay
with a presence map, heartbeats, and rooms (DogePresence, Tetris). The
classroom feature extends what exists rather than adding WS infra to
roster-server. Trade-off: it adds load to a Railway service slated for
the eventual Railway -> DigitalOcean migration; that migration is a
separate track and not a blocker.

### 4.3 Transport

The board opens its OWN WebSocket connection to `window.RAILWAY_SERVER_URL`
(the same server DogePresence uses, via the existing `railway_config.js`).
It does not share or entangle with the DogePresence/Tetris connection --
a separate, isolated connection keeps v1 simple. Sharing one connection
is a possible later optimization.

## 5. WebSocket protocol

All new message types are additive and prefixed `classroom_`. Existing
message handling (`identify`, `heartbeat`, `presence_snapshot`, `game_*`,
`challenge_*`, `rtc_*`) is untouched.

v1 / v2 split: v1 implements `classroom_join`, `_leave`, `_heartbeat`,
`_checkin`, `_arm_gate`, `_go`, `_reset` and their broadcasts
(`classroom_state`, `_member_update`, `_member_left`, `_gate`,
`_greenlight`). The poll messages (`classroom_open_poll`, `_close_poll`,
`_reveal`, `classroom_vote`, and the `classroom_poll*` broadcasts) are
v2. v1 is fully buildable without any poll handler.

### 5.1 Server state (additive)

```
classrooms      Map<section, ClassroomRoom>
wsToClassroom   Map<ws, { section, username, role }>
```

```
ClassroomRoom = {
  section:  string,
  gate:     { armed: bool, theme: string, openedAt: ts } | null,
  poll:     { id: string, question: string, options: string[],
              blind: bool, openedAt: ts } | null,
  members:  Map<username, Member>
}
Member = {
  username: string,
  role:     "student" | "teacher",
  status:   "present" | "checkedIn" | "voted",
  vote:     number | null,        // option index, POLL only
  online:   bool,                 // a socket is open + heartbeat is fresh
  lastSeen: ts,
  sockets:  Set<ws>
}
```

`gate` and `poll` are never both non-null at once (see 5.6, mode
exclusivity).

### 5.2 Client -> server

| Type | Sender | Payload | Effect |
|------|--------|---------|--------|
| `classroom_join` | both | `{ section, username, role }` | Adds or re-attaches the member to the section room; server replies `classroom_state`. |
| `classroom_heartbeat` | both | `{}` | Refreshes `lastSeen`; keeps `online` true. |
| `classroom_leave` | both | `{}` | Detaches this socket (also done on socket close). See 5.5 for when the member record is removed. |
| `classroom_checkin` | student | `{}` | GATE: sets status `checkedIn`; broadcasts a delta. Ignored if no gate is armed. |
| `classroom_vote` | student | `{ choice }` | POLL: sets `vote`, status `voted`; broadcasts a delta (role-aware, see 5.4). Ignored if no poll is open or `choice` is out of range. |
| `classroom_arm_gate` | teacher | `{ theme }` | Arms the gate; broadcasts `classroom_gate`. Rejected if a poll is open (5.6). |
| `classroom_open_poll` | teacher | `{ question, options[], blind }` | Opens a poll; `options` length must be 2-8; broadcasts `classroom_poll`. Rejected if a gate is armed (5.6). |
| `classroom_close_poll` | teacher | `{}` | Closes the poll; broadcasts `classroom_poll_closed` with the final tally. |
| `classroom_reveal` | teacher | `{}` | Blind poll only: broadcasts `classroom_poll_reveal` (full per-member votes). |
| `classroom_go` | teacher | `{ startVideo, videoRef }` | Broadcasts `classroom_greenlight`. |
| `classroom_reset` | teacher | `{}` | Clears `gate` and `poll`, resets every member status to `present` and `vote` to null; broadcasts `classroom_state`. |

### 5.3 Server -> client (broadcast is section-scoped)

| Type | Payload | When |
|------|---------|------|
| `classroom_state` | `{ section, gate, poll, members[] }` | On join; on reset. Role-aware (see 5.4). |
| `classroom_member_update` | `{ username, status, online, vote? }` | A member changed (status, online, or vote). Role-aware. |
| `classroom_member_left` | `{ username }` | A member record was removed (5.5). |
| `classroom_gate` | `{ armed, theme }` | Gate armed/changed. |
| `classroom_poll` | `{ id, question, options, blind }` | Poll opened. |
| `classroom_poll_closed` | `{ id, tally[] }` | Poll closed. |
| `classroom_poll_reveal` | `{ id, tally[], members[] }` | Blind poll revealed. |
| `classroom_greenlight` | `{ startVideo, videoRef }` | Teacher pressed GO. |

### 5.4 Role-aware broadcast (the blind-poll rule)

The wire never carries real names (D6) -- only usernames.

For a BLIND poll (`poll.blind === true`) the server must not reveal
which option a student chose to OTHER students. While a blind poll is
open:
- to a student socket: a `classroom_member_update` about ANOTHER student
  carries `status:"voted"` and omits `vote`; an update about the
  recipient's OWN member carries the full `vote`. A `classroom_state`
  sent to a student includes that student's OWN `vote` and omits every
  other member's `vote`.
- to a teacher socket: the full `vote` is always included for every
  member (the teacher needs the live tally).
On `classroom_reveal`, all sockets receive `classroom_poll_reveal` with
the full tally and per-member votes.

For a non-blind poll, `vote` is included for all sockets.

### 5.5 Lifecycle: presence liveness vs durable decisions

Two distinct concepts -- do not conflate them:

- Presence liveness (is the socket alive). Governed by the socket and
  the heartbeat. A member with at least one open socket and a heartbeat
  within the last 45s has `online: true`; otherwise `online: false`.
- The durable decision (`checkedIn` / `voted` / a `vote`). This is a
  fact for the whole class session. It persists across socket drops,
  reloads, and reconnects. It is cleared ONLY by `classroom_reset`.

Rules:
- Late join / reload / reconnect: a returning client sends
  `classroom_join`; the server matches the EXISTING Member by
  `username`, adds the new socket, flips `online` true, and replies
  `classroom_state` carrying that member's own durable `status`/`vote`.
  A network blip never makes a checked-in student un-check-in.
- Heartbeat / TTL: 30s client heartbeat, 45s server liveness window.
  When a member's last socket closes or its heartbeat lapses past 45s,
  the server flips `online:false` and broadcasts a
  `classroom_member_update` with `online:false`. The avatar renders
  dimmed; the member is NOT removed and its `status`/`vote` are NOT
  reset.
- Member removal: a member is removed from the room (and
  `classroom_member_left` broadcast) only on `classroom_reset`, or by a
  long idle GC -- a member that has been `online:false` for longer than
  the session-idle window (proposed default 45 min -- Section 11, K8).
  This survives a full class period.
- Empty room: a room with zero members is deleted from `classrooms`.
- Server restart: all classroom state is in memory and is lost if the
  curriculum_render WS service restarts (consistent with the non-goal
  "ephemeral, nothing persists"). Clients reconnect and re-`classroom_join`;
  a mid-session restart resets the board. Accepted v1 limitation.

### 5.6 Error handling and illegal states

- Unknown message type: ignored (existing server behavior).
- `classroom_checkin` with no armed gate; `classroom_vote` with no open
  poll or an out-of-range `choice`: ignored, no broadcast.
- `classroom_open_poll` with `options` length outside 2-8: rejected.
- A teacher control message (`classroom_arm_gate`, `_open_poll`,
  `_close_poll`, `_reveal`, `_go`, `_reset`) from a socket whose member
  `role` is not `teacher`: rejected, no effect.
- Mode exclusivity: the board has exactly one active mode -- idle, gate,
  or poll. `classroom_arm_gate` while a poll is open, or
  `classroom_open_poll` while a gate is armed, is rejected with no
  effect; the teacher must `classroom_reset` first. This keeps the board
  state unambiguous.
- Multiple teachers: any socket whose member `role` is `teacher` may
  send control messages (a co-teacher, or the cockpit open on two
  devices). Concurrent teacher controls are last-write-wins.
- v1 trusts the client-claimed `role` in `classroom_join`. The teacher
  cockpit page is already behind the Desk's teacher gate; a student
  spoofing `role:"teacher"` can only disrupt their own section's board,
  which is visible to the teacher in the room. WS-level teacher auth is
  a noted v1 limitation -- see Section 11, OPEN-1.

## 6. Data model (client)

The board component holds:
- `members` -- from `classroom_state` + deltas. Includes both roles.
- `gate`, `poll` -- the current mode.
- `me` -- `{ username, role, section }`. A student's `username` and
  `section` come from the signed-in `rosterClient` record; `role` from
  the `apstats_user_role` localStorage key. The teacher cockpit selects
  the section explicitly.
- `myStatus`, `myVote` -- this student's own durable state.

Rendering: the board draws an avatar only for members with
`role === "student"`. Teacher members are observers -- tracked so they
receive broadcasts, never drawn as a student avatar. A member with
`online:false` renders dimmed. In GATE mode, a student whose status is
`checkedIn` has drained into the hole (D4) and is no longer drawn.

Avatar placement is deterministic: a hash of the username maps to a home
cell. Walking to the hole or onto a vote region is client-side
animation. The server does NOT track grid cells in v1.

Connection: the board reconnects on socket drop with exponential backoff
and re-sends `classroom_join` on every (re)connect; the server
re-attaches it to the existing Member by username (5.5).

## 7. Rendering -- the TI-84 board

- Render target: a 320x240 canvas (TI-84 Plus CE resolution), displayed
  at an integer 2x scale for crisp pixels. The board uses the CE color
  model; avatars may be colored.
- The board's pixel grid, font, and frame conventions follow the
  trainer's `ti84-trainer-v2/native/screen-renderer.js` so the board
  reads as a calculator screen.
- The logical grid (proposed default 40x30 cells of 8x8 px -- see
  Section 11, K2) holds avatars. Avatars are small sprites (proposed
  8x8) with a username/realName label above in the TI-84 pixel font.
- The hole is a doorway sprite occupying a small cell region; its theme
  is derived from today's lesson (D7).
- POLL (v2) result graph: a new data-driven module `ti84-plot.js`,
  extracted from `screen-renderer.js`. The trainer's `drawHistogram`,
  `drawBoxplot`, `drawScatterplot` etc. currently use hardcoded mock
  data; the module refactors them to accept real data, e.g.
  `drawHistogram(ctx, { bins, labels })`. A `drawDotplot(ctx, { values })`
  is added -- the most natural plot for a class poll, and the cheapest
  to add. The trainer's axis/frame drawing is reused as-is.

## 8. Identity and privacy

- The WS protocol carries `username` only; the server stores only
  `username`. A real name never travels the presence wire.
- A student's board renders `username` for every avatar.
- The teacher cockpit, on load, fetches `GET /roster/section/:section`
  (the existing public roster-server endpoint) once, builds a
  `username -> realName` map, and renders real names on its copy of the
  board. The student Desk never makes that fetch.
- Note: the sign-in picker already shows real names to all students (the
  roster endpoint is public, a session-102 decision). The live presence
  board is a stricter surface and shows students only usernames.
  Tightening the roster endpoint itself is out of scope.

## 9. The teacher cockpit page

`teacher-classroom.html` -- a new page, launched from the Desk's Teacher
menu (alongside the existing Gradebook Dashboard / Roster Console /
Unlock Code Generator items). Patterned on `teacher-dashboard.html`.

Contents:
- A section selector (defaults to the single current section).
- The same board component, in teacher mode (real-name labels;
  observer -- the teacher is not rendered as a student avatar).
- A control strip: Arm Gate (with today's theme), Green Light (with the
  informational / synchronized-start toggle), and -- in v2 -- Open Poll
  (question + options + blind toggle), Close Poll, Reveal, and the TI-84
  result graph.
- A live "checked in" panel: because the board drains to empty in GATE
  mode (D4), the cockpit also shows a count (e.g. "18 / 22 in") and the
  list of checked-in real names. The teacher must know WHO is in, not
  only watch the board empty.
- Folding the existing Gradebook Dashboard / Roster Console INTO this
  page is explicitly deferred (a later "collage" step).

## 10. Phasing

- v1a -- Foundation. WS server section-aware `classrooms`; the board
  component renders live section presence (every signed-in student in
  the section appears as an avatar; live join/leave; online/offline
  dimming). The board is embedded read-only in the Desk and in the
  `teacher-classroom.html` shell. No gate yet. Proves the plumbing.
- v1b -- The Gate. `classroom_arm_gate`, today's themed hole, check-in,
  drain-to-empty, the cockpit checked-in panel, the green light in
  informational mode.
- v1c -- Synchronized start (the D5 option). The `classroom_greenlight`
  `startVideo` path: student Desks navigate to / focus today's lesson
  video. NOTE: browser autoplay policy may block true autoplay without a
  user gesture; v1c may land as "navigate + focus + show Play", not
  literal autoplay. May ship after v1b.
- v2 -- Poll mode. The poll WS messages, poll authoring in the cockpit,
  vote regions on the board, blind/reveal, the `ti84-plot.js` snapshot
  graph, and per-lesson tagging of saved graphs.
- Companion fix -- the roster-picker `_periodToSection` / section-label
  fix (Section 14). Small; ships with v1a since the board also needs
  section handling.
- Deferred -- the Pulse (a repeatable mid-class engagement check, same
  primitive as the Gate); a student avatar picker; folding the gradebook
  dashboard/roster into the cockpit; attendance persistence;
  transpiled-ROM rendering.

## 11. Open knobs / proposed defaults

- K1. Avatar movement -- PROPOSED DEFAULT: a single keypress or click
  triggers an auto-walk (client-side animation) into the hole. Requiring
  a real keypress in the live window satisfies "hands on keyboard."
  Optional later: arrow-key steering as an engagement-proof variant.
- K2. Grid dimensions -- PROPOSED DEFAULT: render target 320x240
  (CE-authentic), 2x display; logical grid 40x30 of 8x8 px cells. The
  teacher's "60x60" idea works with smaller sprites or a larger render
  target; this is a tunable.
- K3. Green-light threshold -- PROPOSED DEFAULT: no auto-fire. The
  cockpit shows a live count ("18 / 22 in"); the teacher clicks GO when
  satisfied (absent students must not block the room).
- K4. Heartbeat / TTL -- reuse the existing 30s heartbeat, 45s liveness
  window.
- K5. Daily hole theme -- PROPOSED DEFAULT: derived deterministically
  from today's lesson id (the Desk already computes it), cycling a small
  set of themed doorway sprites.
- K6. Avatar art -- PROPOSED DEFAULT: auto-assigned, deterministic from a
  username hash (a color + a simple shape). A student-chosen avatar is
  deferred.
- K7. Blind poll -- PROPOSED DEFAULT: polls are non-blind (the live
  cluster is visible); blind is a per-poll teacher toggle.
- K8. Session-idle GC window -- PROPOSED DEFAULT: 45 min. A member
  offline longer than this is removed (5.5); long enough to outlast a
  class period.
- OPEN-1. WS teacher-role trust. v1 trusts the client-claimed `role`.
  Acceptable, or do we want a classroom-control passphrase the cockpit
  page holds? (Teacher decision.)
- OPEN-2. The exact section label for the current single section.
  Proposed: `PeriodX` (no space, matching the existing `PeriodB` /
  `PeriodE` rows). The enrolled roster rows and the picker must use the
  identical string. (Teacher decision -- confirm the label.)

## 12. Testing

Vitest + jsdom, matching the existing structure+behavior test pattern.

- `tests/classroom-board.test.js` (new) -- the board component: renders
  a `classroom_state` snapshot, applies member deltas, handles
  join/leave, renders avatars for student-role members only (teachers
  not drawn), dims `online:false` members, the GATE drain animation
  reaches empty, role-aware label rendering (username vs realName).
- `tests/ti84-plot.test.js` (new, v2) -- the plot module: binning math,
  dotplot/histogram output structure, axis reuse.
- `tests/classroom-structure.test.js` (new) -- structure pins for
  `teacher-classroom.html` (the checked-in panel, the control strip) and
  the Desk integration (the board mount, the Teacher-menu launch item).
- curriculum_render WS server tests (in that repo's suite):
  - section-scoped broadcast -- a message in section A is not delivered
    to section B.
  - the blind-poll role-aware rule -- a student socket never receives
    another student's `vote`, but always receives its own.
  - durable decision vs liveness -- a checked-in member that drops its
    socket and reconnects within the GC window is still `checkedIn`.
  - liveness TTL -- a member past 45s with no heartbeat flips
    `online:false` without losing `status`/`vote`.
  - mode exclusivity -- arm-gate while a poll is open is rejected.
  - DogePresence / Tetris handling is unregressed.

## 13. Risks and gotchas

- The Desk (`ap_stats_roadmap_square_mode.html`) is a contended
  ~10k-line single file. Board-embed edits are planner-direct, EOL LF.
- curriculum_render is a separate repo with unrelated pre-existing dirty
  files. Stage own paths only; never `git add -A`. Sacred
  `data/curriculum.js` untouched.
- The WS change deploys to the `curriculumrender-production` Railway
  service, not roster-server. It must not regress DogePresence/Tetris,
  and must be deployable independently of the follow-alongs changes.
- Two WS connections from the Desk (DogePresence's + the board's) is
  accepted for v1; the board's connection is isolated.
- Cross-agent prompts to Codex must be ASCII-only (the runner has a known
  UTF-8 decode bug). Keep this spec and new files ASCII-clean where
  practical.
- The `ti84-transpile` repo: future reference only; not touched.
- Identity: a real name must never reach a student client or the WS
  wire. The teacher's name map is fetched only by the cockpit page.
- Implementation must run GitNexus impact analysis before editing
  existing symbols (the Desk's functions, the WS server's handler), per
  the repo CLAUDE.md.

## 14. Companion fix -- the roster picker / section label

The session-104 dropdown report ("the username dropdown does not
populate") was diagnosed as: roster-server is healthy, but the roster is
essentially empty (no fall cohort enrolled yet) and there are no periods
assigned -- everyone belongs to a single section.

Two parts:
1. Data (teacher-owned): enroll the cohort under the single section
   label. Proposed canonical label: `PeriodX` (no space -- matches the
   existing `PeriodB` / `PeriodE` rows). See Section 11, OPEN-2. The
   enrolled rows and the picker must use the identical string.
2. Code (small): `_periodToSection` in the Desk hardcodes only "B" and
   "E" and returns null for anything else, which yields an empty picker.
   Change it to pass through any section value and default to the single
   configured current section, so the current section works and future
   real periods work with no further code change. The classroom board
   reads `section` from the signed-in `rosterClient`, so it needs the
   same non-hardcoded handling.
