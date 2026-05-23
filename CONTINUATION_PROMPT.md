# Continuation Prompt -- session 111

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** --
> the session-110 block and every older block are historical record
> only; do not act on any older "NEXT"/SESSION text. Last updated
> 2026-05-23 (session 111). follow-alongs HEAD = the commit carrying
> this CONTINUATION refresh (feature work ended at `e8f9ac7`).
> curriculum_render HEAD = `25a970b`. Linear, local==origin on both.
>
> ## Shipped this session (111) -- FOUR distinct epics
>
> ### Epic 1 -- Live Classroom Scaling Knob 1 (rate adaptation)
> The first request of the session. `LIVE_CLASSROOM_SCALING_SPEC.md` (s110)
> had three knobs; this implemented Knob 1 (emit-cadence scaled to room
> size). Single repo, one tight loop:
>
> - **`22a78d3`** -- `feat: Live Classroom rate-adapt cadence to room size`.
>   `POS_RATE_TABLE` replaces the fixed `POS_RATE_MS = 100` constant;
>   `_currentEmitRateMs(memberCount)` looks up the threshold-mapped
>   interval; `PlayerSprite` gains an `opts.getMemberCount` (default
>   returns 1 for back-compat); `addSprite` wires a live closure over
>   `state.members`. Thresholds: `<=8 -> 100ms`, `9-20 -> 200ms`,
>   `21-40 -> 300ms`, `>40 -> 500ms`. Codex review folded 1 MAJOR +
>   2 MINOR. Planner-verify (first vitest run) caught 7 buggy boundary
>   tests in the contract's Unit C and folded the corrected
>   advance-past-the-first-gate pattern. 16 new tests.
>
> ### Epic 2 -- Live Classroom v3 P1+P2 (global presence + Live button)
> User pivoted to a bigger architectural conversation: WebRTC for
> in-class data modes + section-agnostic cockpit default + Live mode
> toggle. Spec'd, then implemented P1+P2 (the WS-only foundation work;
> P3 WebRTC + P4 vote-with-feet are queued).
>
> - **`e8f9ac7`** (follow-alongs) -- `feat: Live Classroom v3 P1+P2 client`.
>   Cockpit (`teacher-classroom.html`) restructured: global presence
>   list of everyone online (grouped by section) is the default;
>   `Go Live` button reveals the section picker; `Exit Live` returns.
>   Cockpit subscribes via `classroom_monitor_start`; renders deltas
>   from `classroom_member_update / _member_left / _live_state`.
>   `classroom-board.js` `_reduce` gains a `classroom_live_state` case
>   and a new `live` state field preserved through every other case.
>   Desk (`ap_stats_roadmap_square_mode.html`) renders a "Live with
>   Mr. Colson" pill via a new `_renderLiveIndicator` helper attached
>   to `ClassroomBoard.mount`'s `onStateChange`. Tests +13.
> - **`25a970b`** (curriculum_render) -- `feat: Live Classroom v3 P1+P2 server`.
>   `railway-server/classroom.js` gains `monitorSockets`,
>   `subscribeMonitor`, `unsubscribeMonitor`, `setLive`,
>   `getAllSectionsState`, and a `_fanoutToMonitors` helper wired into
>   every existing method that returns broadcasts (join, detach,
>   heartbeat, armGate, checkin, greenLight, reset, openPoll, castVote,
>   closePoll, revealPoll, position, sweep). A new `room.live` field
>   defaults to false and is preserved across existing v1b/v2 events.
>   `buildStatePayload` includes `live` so the join snapshot lets a
>   late-joining student see Live state immediately. server.js gains
>   four new case handlers. Tests +15.
> - **Spec + contract committed**: `LIVE_CLASSROOM_V3_SPEC.md` (design,
>   the full 4-phase roadmap) + `LIVE_CLASSROOM_V3_P12_BUILD.md` (the
>   frozen P1+P2 contract). Both in `e8f9ac7`.
> - **Codex review folded**: 1 BLOCKER (`buildStatePayload` was missing
>   `live` -- late joiners saw `live:false` on a Live room), 1 MAJOR
>   (`stopMonitorMode` left the WS open but unsubscribed; the next
>   `startMonitorMode` early-returned without re-subscribing), 2 MINOR
>   (setLive bypassed `_fanoutToMonitors` dedup; `_ensureMonitorWs`
>   lacked try/catch + close/error handlers).
>
> ### Epic 3 -- Live Classroom v3 P3 (WebRTC star transport)
> User asked to continue down the v3 chain. P3 swaps `classroom_pos`
> from WS to WebRTC DataChannels in Live mode; cockpit is the hub.
>
> - **`acf986e`** (follow-alongs) -- `feat: Live Classroom v3 P3 client`.
>   Cockpit gains a `studentPeers` Map + `_initPeerFor` per-student
>   negotiation + DC relay loop. `_reconcileStudentPeers` driven from
>   the board's `onStateChange` keeps the peer set in sync with the
>   active section's roster (new joiners get a peer; departed students
>   get a teardown). Board's `sendSignaling` queues payloads pre-open
>   and flushes on `ws.onopen`. Student-side: `_handleP3Offer` (guest
>   peer) + `_handleP3Ice` + `_teardownPeer`; outgoing classroom_pos
>   prefers DC. Frozen contract: `LIVE_CLASSROOM_V3_P3_BUILD.md`. Tests
>   +16 (including a NEW `tests/v3-p3-webrtc.test.js`).
> - **`c64704e`** (curriculum_render) -- `feat: Live Classroom v3 P3 server`.
>   Three new WS handlers (rtc_offer / rtc_answer / rtc_ice) route by
>   section + `to: username`. classroom.js gains `findSocketByUsername`
>   + `_wsEntry` helpers. Cross-section isolation verified by tests.
> - **Codex review folded**: 1 BLOCKER (peer init raced the board WS
>   readiness -- sendSignaling silently dropped + 3 s timeout left a
>   dead stub; fix queues signaling + DELETES the entry on timeout so
>   retry works); 2 MAJORs folded (late-joiner path was wired to the
>   unsubscribed monitor delta -- moved to `_reconcileStudentPeers`
>   off the board's `onStateChange`; and trickle-ICE ordering --
>   per-peer pendingIce queue drained in setRemoteDescription's
>   .then). One MAJOR DEFERRED to P3.1 (split-brain DC ↔ WS relay:
>   WS-fallback students don't receive DC peers' positions; documented
>   in the BUILD Correction; impact small in primary use where
>   everyone's on the school network).
>
> ### Epic 4 -- Live Classroom v3 P4 (vote-with-your-feet doorways)
> The pedagogical killer feature, unblocked by P3 (though it doesn't
> use WebRTC -- vote messages ride WS like v2 polls). Teacher opens
> N labelled doorways (2-8); students walk avatars through their choice
> + press Up to vote; cockpit shows a live bar chart.
>
> - **`16e85af`** (follow-alongs) -- `feat: Live Classroom v3 P4 client`.
>   Cockpit gains a `#doorways-section` form (question + 2-8 options
>   with the v2-poll add/remove mirror), Open/Close buttons, a
>   `#doorways-tally-canvas` rendered via `Ti84Plot.drawBarChart`.
>   Board gains a new `Doorway` entity + `showDoorways` /
>   `hideDoorways` / `updateDoorwayCounts` helpers + multi-hitbox
>   check in `handlePlayerUp` (priority over the gate). 3 new
>   `_reduce` cases with `state.doorways` + `state.closedDoorways`
>   preserved through every other case. Frozen contract:
>   `LIVE_CLASSROOM_V3_P4_BUILD.md`. Tests +14.
> - **`35f211a`** (curriculum_render) -- `feat: Live Classroom v3 P4 server`.
>   `room.doorways` state + three methods (`openDoorways` /
>   `castDoorwayVote` / `closeDoorways`) + three WS handlers. Mutually
>   exclusive with the v2 poll AND the v1b gate. Vote-switching
>   correctly decrements prior + increments new. Tests +11.
> - **Codex review folded**: 1 BLOCKER + 4 MAJOR, ALL inline:
>   BLOCKER -- `buildStatePayload` + `_all` omitted `doorways`;
>   `reset()` left `room.doorways` + every `member.doorVote` live
>   (snapshots now carry doorways, reset clears both). MAJOR -- cockpit
>   `_activeDoorwaysId` now derived from `summary.doorways` (refresh /
>   second teacher hydrate cleanly). MAJOR -- `openDoorways` rejects
>   re-open + clears stale doorVote. MAJOR -- gate vs doorways mutual
>   exclusion ENFORCED on both sides. MAJOR -- local sprite respawns to
>   canvas center if the optimistic doorway-walk left it off-canvas.
>
> ## Migration -- DONE this session (NONE outstanding)
> Session 109's `0007_poll_archive.sql` was run by the user this
> session (per the opening "migration has already been implemented"
> note). No new migrations in s111.
>
> ## Test baselines
> - curriculum_render **934/935** -- the only fail is the long-standing
>   unrelated `redox-chat.test.js` (NOT a regression). +32 over baseline
>   (15 v3 P1+P2 + 6 v3 P3 + 11 v3 P4).
> - follow-alongs root **4941/4942** -- the only fail is the long-standing
>   unrelated `study-guide.test.js` (NOT a regression). +58 over baseline
>   (16 scaling + 13 v3 P1+P2 + 15 v3 P3 + 14 v3 P4). roster-server unchanged.
>
> ## Open / verify
> - cr `25a970b` deploys the `curriculumrender-production` WS service
>   (Railway). Smoke once it lands: `classroom_monitor_start` returns
>   a `classroom_state_all` snapshot; `classroom_live_start` broadcasts
>   `classroom_live_state` to the section's sockets + every monitor;
>   the Desk shows the Live pill; the cockpit's global view updates
>   incrementally as students join/leave. DogePresence / Tetris
>   unregressed (no shared handler changes).
> - follow-alongs `e8f9ac7` republishes GH Pages. Eyeball the cockpit:
>   default view shows the global presence list; the Go Live button
>   transitions cleanly; Exit Live re-subscribes monitor mode.
>
> ## NEXT -- queued (the v3 spec's remaining phases + sibling work)
> - **v3 P3.1 (DEFERRED MAJOR fold)** -- the cockpit's DC.onmessage
>   relays classroom_pos only to OTHER DC peers; WS-fallback students
>   don't receive DC peers' positions. Fix: add `classroom_pos_relay`
>   server route (teacher-only `from` override) so the cockpit can
>   dual-send. ~30 lines. Implement only if real classroom usage
>   surfaces a need.
> - **v3 P4.1 (deferred future polish)** -- doorways can grow theming
>   (per-option colour), >8 doorway count via canvas scrolling, anonymous /
>   blind voting mode. Not load-bearing for the v1 ship.
> - **Additional data modes (v3.x)** -- the spec calls out sliders,
>   2D-axes drop, sampling-distribution-live, CI coverage simulation.
>   Doorways is the proof; the rest reuse the same WS infrastructure
>   (or the WebRTC DataChannel for high-frequency continuous data).
> - **Teacher -> Student Console.** Sibling feature, separate spec NOT
>   YET DRAFTED. Per-student contextual surface launched from clicking
>   an avatar (Live mode) OR a row in `/class/grades` (outside Live).
>   Actions: View as (read-only impersonation), View grade, View
>   recent submissions, Apply remediation, Send nudge (free text,
>   teacher to one or many students), Override lesson gate (TBD).
>   Bidirectional messaging: students reply via a palette of presets
>   (asymmetric — teacher free text, students preset for moderation
>   safety). Teacher avatar visible on the board in Live mode.
>   Draft a spec when ready; the conversation in s111 captured the
>   shape but no spec doc yet.
> - **Railway -> DigitalOcean migration.** Still strategic, before next
>   Railway billing cycle. See `project_railway_to_digitalocean.md`.
> - **Preview-as-student v2 (worksheet-level).** Deferred from s108;
>   may fold into the Teacher -> Student Console "View as" action.
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **Live Classroom = self-directed, not problem-by-problem intimacy**
>   (`feedback_live_classroom_self_directed.md`). Whole-class data /
>   presence modes only; NO voice / screen-share / peer-pair channels.
>   The classroom style is self-directed and ambient -- voice/share
>   modes break that. Reject any future proposal that violates this.
> - **The lifted engine files** (`canvas_engine.js`/`sprite_sheet.js`
>   in follow-alongs root) declare `class` at top level; bare
>   classic-script class declarations do NOT attach to `window`. The
>   IIFE-entry bridge in `classroom-board.js` handles this; do NOT
>   remove. cr is the source of truth; re-copy if cr changes them.
> - **Cross-repo Codex finding gotcha** (s106 lesson, exercised in s111):
>   a finding that looks like a bug in ONE half may be resolved by the
>   other half. Verify cross-repo before folding. (s111 BLOCKER was a
>   real cross-repo issue: the server-side `buildStatePayload` omitted
>   `live`, which manifested as the client never seeing Live mode on a
>   join.)
> - **The cockpit's runtime test pattern** (`tests/poll-archive-cockpit.test.js`):
>   it loads `teacher-classroom.html`'s inline script in jsdom + vm.
>   Any new HTML element the cockpit references MUST also be added to
>   the test's HTML scaffolding (otherwise `getElementById('btn-go-live').addEventListener`
>   throws on null). jsdom also doesn't provide `WebSocket` -- the
>   cockpit's `new WebSocket(...)` calls require a stub.
> - **PowerShell 5.1 + git** -- never `git commit -m` from PowerShell.
>   Use `git commit -F-` with a Bash-tool heredoc.
> - **Stage own paths only** -- `git add` explicit paths, never `-A`.
>   `data/skill-map.js` regenerates on the audit test -- `git checkout`
>   before staging.
> - **roster-server** lives inside follow-alongs (`roster-server/`,
>   own `package.json` + vitest); auto-deploys on a push touching
>   `roster-server/**`. curriculum_render is a SEPARATE repo;
>   `railway-server/**` deploys the `curriculumrender-production` WS
>   service.
> - **The proven loop is still earning its keep**: planner-verify caught
>   a test pattern bug (7 failures) before Codex; Codex caught a
>   cross-repo BLOCKER + MAJOR + 2 MINOR; the planner folded all four
>   and re-verified on disk. Don't skip the loop.
>
> ## Recall on reload
> `project_live_classroom.md`, `project_desk_donow.md`,
> `project_gradebook_grading_model.md`,
> `project_railway_to_digitalocean.md`,
> `feedback_live_classroom_self_directed.md` (new this session),
> `feedback_diagnostic_first.md`,
> `feedback_curriculum_render_sacred.md`,
> `feedback_test_on_public_url.md`.

---

# Continuation Prompt -- session 110

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** --
> the session-109 block and every older block are historical record
> only; do not act on any older "NEXT"/SESSION text. Last updated
> 2026-05-23 (session 110). follow-alongs HEAD = the commit carrying
> this CONTINUATION refresh (feature work ended at `e9ff6e9`).
> curriculum_render HEAD = `8b166d0`. Linear, local==origin on both.
>
> ## Shipped this session (110) -- 15 commits across two epics
> Two themes: (1) the Live Classroom keyboard-avatar feature shipped
> fully end-to-end; (2) a string of UX bug fixes the teacher caught
> while playing with it. Loop throughout: bug -> diagnostic-first
> inspection -> minimal fix -> tight commit -> push.
>
> ### Avatar feature (the headline epic)
> Session opened by discovering that r3 sprites had NEVER actually
> rendered -- the session-109 "diagnostic confirmed it works" was a
> false positive. The lifted `canvas_engine.js` / `sprite_sheet.js`
> are bare top-level `class` declarations; in classic `<script>`s a
> top-level `class` creates a global LEXICAL binding but NOT a
> property of `window`. classroom-board.js's IIFE looked them up as
> `root.CanvasEngine` -> `undefined` -> `new undefined(...)` threw ->
> `engineReady=false` -> board mounted + WS-connected but rendered
> nothing. Fix landed first:
>
> - **r3 render-layer bridge (`fc7995a`)** -- two `if (typeof X !== 'undefined' && !root.X) root.X = X` lines at the IIFE top bridge the engine classes onto `window`. Verbatim cr files untouched. The vitest stubs masked this bug by injecting CanvasEngine as a window PROPERTY; regression pins added so it can't ship dark again.
>
> Then full keyboard-controlled avatars per `KEYBOARD_AVATAR_SPEC.md`
> (frozen `0cd4a34`):
>
> - **Phase 1 (`005d5f9`)** -- PlayerSprite class (Object.create over BoardSprite), document-level keyboard listener, jump physics (JUMP_V0=-280, GRAVITY=800), soft-push, Up = `classroom_checkin` when inside the gate-door hitbox. Down reserved.
> - **Phase 1.5 (`76f8547`)** -- direction-aware frames (+11 row-mirror offset per cr/player_sprite.js line 182), stackable one-way head platforms, soft-push gated on `_sameLevel`. Folded a latent v2 bug: `onDrained` was unconditional, so the poll-voted column walkTo would have wiped the voter's sprite -- now guarded on `draining[uname]`.
> - **Phase 2 server (`8b166d0`, curriculum_render)** -- `classroom_pos` WS message + `classroomRegistry.position(ws, x, y, state, vx, now)`. `pos` field on Member. `classroom_state` join snapshot carries each member.pos. Forwards to all OTHER sockets in the room (sender excluded).
> - **Phase 2 client (`bdb54df`)** -- emit at 10 Hz / 0 Hz idle with a one-shot "rest" snapshot; `applyPos` walkTo chase for x + direct y; `_reduce` threads `pos` through `classroom_state`, `classroom_member_update`, `classroom_gate`, `classroom_poll`, `classroom_poll_reveal`. `addSprite` restores from `member.pos` for late-joiner + reconnect.
> - **Phase 2.1 (`9453f7a`)** -- solid horizontal collision (snap to peer edge, skipped while airborne) + carry-while-standing (`standingOn` + `_standingOnLastX`, Mario rules). `_moved` skipping unified across both sprite classes in `repositionSprites`.
> - **Phase 2.2 + 2.3 (`ffab093`)** -- `BoardSprite._yTarget` + `_chaseY(dt)` so peer jumps interpolate smoothly between 10 Hz broadcasts (Y_CHASE_SPEED=600). `PlayerSprite._jumpInheritedVx` for Mario-style platform-velocity inheritance.
> - **Carry-emit reliability fix (`49ce66d`)** -- the Phase 2.1 `beingCarried = standingOn.state === 'walking'` heuristic was fragile on slower clients (the 'arrived' window between broadcasts could span most of the cycle, leaving the passenger silent). Added `_carriedThisTick`: emit whenever the carrier's x actually moved this tick. Belt and suspenders.
> - **Phase 2.4 jump-block (`8d3c5f5`)** -- jump is REFUSED while a peer is on the player's head (`_someoneOnTop()` with tight 3 px tolerance). Mario's one-way platforms can't carry upward, so without the gate the carrier's jump would drop the passenger to ground level.
> - **Blocked-jump twitch (`e9ff6e9`)** -- a refused jump now triggers a brief sine-decayed y-jitter (~3 px / 150 ms / ~30 Hz) on the local sprite. `PlayerSprite.render` override applies the offset; the actual physics y never moves, so peers don't see it. Local feedback only.
>
> ### UX bug fixes (the second epic)
> - **Calendar 2-week focus (`2572adf`)** -- `rCal` slices `W` to a 2-week window anchored on today's week; pre-school clamps to first 2, post-school to last 2. Without this the calendar buried the avatar board.
> - **Calendar nav arrows (`a28ea24`)** -- prev/next page arrows above the calendar; `calStep(dir)` bumps `_calPageOffset` by `CAL_FOCUS_WEEKS` weeks; hides at edges via `.cal-nav-hidden` (visibility:hidden so the surviving arrow stays anchored).
> - **Stale-panel fix (`05982a3`)** -- one window `storage` event listener for `apstats_ws_completion` that re-renders the open resource panel via `_lastResourcePanel`. Live "Done (N%)" updates as students fill blanks in the worksheet tab.
> - **Sign-in dropdown fix (`ed6f70d`)** -- extracted `_fetchSectionRoster(section)`; `_fetchPeriodRoster` falls back to PeriodX (the universal section while real periods aren't yet assigned); `_openRosterDropdown` bails out on empty so the "No class list loaded" hint no longer overlays the password field.
>
> ## Migration -- NONE this session
> No new DB migration. Session 109's `0007_poll_archive.sql` is still
> outstanding (user-run; until then `/poll-archive` returns 503).
>
> ## Test baselines
> roster-server: unchanged. follow-alongs root **4883/4884** -- the
> only fail is the long-standing unrelated `study-guide.test.js` (NOT
> a regression). curriculum_render **902/903** -- the only fail is
> the long-standing unrelated `redox-chat.test.js` (NOT a regression).
>
> ## Open / verify
> - curriculum_render `8b166d0` deployed the Phase 2 WS service. User
>   has been actively smoke-testing the feature end-to-end -- two
>   browser windows, John + Jane on PeriodX, walking + jumping +
>   stacking. Carry has a ~200-300 ms round-trip lag (network +
>   broadcast cadence + interpolation); accepted as the natural floor.
> - follow-alongs HEAD republishes GH Pages on every push.
> - Session 109's `0007_poll_archive.sql` still pending user-run.
>
> ## NEXT -- queued
> - **`LIVE_CLASSROOM_SCALING_SPEC.md`** -- frozen this session. Three
>   knobs: (1) rate adaptation (emit Hz scaled to room size; ~50 LOC
>   when implemented), (2) idle suppression (already in place;
>   documentation only), (3) interest filtering (out of scope while one
>   section == one room). Implement (1) only if a real classroom
>   stress-test surfaces a need.
> - **CSP** considered + DECLINED this session. User prefers the
>   natural broadcast-roundtrip lag over CSP's rubber-band-on-direction-
>   change failure mode. Students don't watch each other's screens, so
>   the perceived lag is ~zero per student.
> - **Railway -> DigitalOcean migration** -- still strategic, before
>   next billing cycle. See the `railway-to-digitalocean` memory.
> - **Run migration 0007** in Supabase to take `/poll-archive` off the
>   503 degrade.
> - **Preview-as-student v2** -- worksheet-level preview (still
>   Desk-only).
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **The lifted engine files** (`canvas_engine.js` / `sprite_sheet.js`
>   in follow-alongs root) declare `class` at top level; bare
>   classic-script class declarations do NOT attach to `window`.
>   `classroom-board.js`'s IIFE-entry bridge handles this; do NOT
>   remove it. cr is the source of truth; re-copy if cr changes them,
>   don't "improve" in place.
> - **Avatar carry round-trip lag** -- ~200-300 ms inherent at 10 Hz.
>   CSP would smooth it with snap-on-direction-change as a tradeoff;
>   user prefers the lag. Don't add CSP without re-asking.
> - **The diagnostic-first discipline** -- session-109 logged "avatars
>   WORK" but they did not (the bridge was missing). Future "it works"
>   claims need an end-to-end sprite-actually-rendered check, not just
>   "the canvas exists" + "sprite.png HTTP 200".
> - **PowerShell 5.1 + git** -- never `git commit -m` from PowerShell.
>   Use `git commit -F-` with a Bash-tool heredoc.
> - **Stage own paths only** -- `git add` explicit paths, never `-A`.
>   `data/skill-map.js` regenerates on the audit test -- `git checkout`
>   before staging.
> - **roster-server** lives inside follow-alongs (`roster-server/`,
>   own `package.json` + vitest); auto-deploys on a push touching
>   `roster-server/**`. curriculum_render is a SEPARATE repo;
>   `railway-server/**` deploys the `curriculumrender-production` WS
>   service.
>
> ## Recall on reload
> `project_live_classroom.md`, `project_desk_donow.md`,
> `project_gradebook_grading_model.md`,
> `project_railway_to_digitalocean.md`,
> `feedback_diagnostic_first.md`,
> `feedback_curriculum_render_sacred.md`,
> `feedback_test_on_public_url.md`.

---

# Continuation Prompt -- session 109

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** --
> the session-108 block and every older block are historical record
> only; do not act on any older "NEXT"/SESSION text. Last updated
> 2026-05-22 (session 109). follow-alongs HEAD = the commit carrying
> this CONTINUATION refresh (the feature work ended at `c7951fb`).
> curriculum_render HEAD = `c490cff` -- UNTOUCHED this session. Linear,
> local==origin on follow-alongs.
>
> ## Shipped this session (109) -- four commits, all on `master`
> Two themes: the Desk calendar, then Live Classroom v2.1. The proven
> loop throughout: spec -> freeze a `*_BUILD.md` -> dependency-aware
> dispatch -> Codex read-only review -> planner folds every finding +
> re-verifies on disk -> tight commits.
>
> - **Date-driven calendar quarter dividers (`2d3797b`)** -- the Desk
>   `.cal-qband` divider was placed at unit seams (`unitQuarter`); it is
>   now date-driven (`quarterOfDate` + a `QUARTER_WINDOWS` const
>   mirroring `grade-config.js`), so the band snaps to the real
>   quarter-close dates. The band label keeps the unit list. Desk-only.
> - **CALENDAR_FOCUS (`ac3a6c3`)** -- a completed lesson recedes
>   (greyscale + 0.6 opacity); the next-up lesson pops with a synthwave
>   neon treatment. Driven by EITHER `/donow` OR the local completion
>   registry (new `localLessonState`, `.dc-localdone`/`.dc-localpartial`)
>   so it shows in Preview-as-student. Spec `CALENDAR_FOCUS_SPEC.md`.
> - **CALENDAR_FOCUS fix (`6ffd1c5`)** -- the next-up neon followed the
>   `/donow` nextTask, which sticks on a just-completed lesson (a Desk
>   "Done" self-attest never satisfies the lesson manifest). Now `rCal`
>   owns `.cal-current` via `calNextUpTopic` (the first lesson, in
>   calendar order, not locally completed); `paintDonowCells` no longer
>   touches it. Same local signal as the greyscale.
> - **Live Classroom v2.1 (`c7951fb`)** -- the three v2-deferred pieces:
>   a student pull-down "classroom screen" (the board's on-demand TI-84
>   result surface, slides over the avatar scene on poll close); a
>   durable roster-server poll archive (`poll_archive` table); poll
>   history pinned to the calendar day each poll ran (the Desk calendar
>   marks poll days, a click replays the poll). All follow-alongs -- NO
>   curriculum_render / WS-server change. Spec `LIVE_CLASSROOM_V2_1_SPEC.md`
>   / contract `LIVE_CLASSROOM_V2_1_BUILD.md`. **Touches `roster-server/**`
>   -> roster-server auto-deploys.**
>
> ## Migration -- ONE, user-run
> `roster-server/migrations/0007_poll_archive.sql` -- the teacher runs it
> in the curriculum_render Supabase SQL editor (like `0004`-`0006`).
> Until then `/poll-archive` returns `503` (the `42P01 -> 503` degrade);
> nothing else is affected. The rest of v2.1 is GH Pages, live on push.
>
> ## Test baseline
> roster-server **476/476**. follow-alongs root **4760/4761** -- the only
> fail is the long-standing unrelated `tests/study-guide.test.js` (NOT a
> regression).
>
> ## Open / verify
> - `c7951fb` deploys roster-server (`roster-server/**`) + republishes
>   GH Pages. Smoke once it lands: `POST /poll-archive` 401 without a
>   teacher token; a poll close -> the pull-down screen + an archive
>   row; a calendar poll-day click -> the screen replays it.
>   DogePresence / Tetris unregressed (v2.1 did NOT touch the WS server).
> - **Run migration `0007`** in Supabase to take `/poll-archive` off the
>   503 degrade.
> - **Live Classroom avatars** -- a session-109 diagnostic confirmed the
>   board + r3 sprite scene WORK (mounts, canvas, `sprite.png` HTTP 200).
>   An empty board = a presence board with no students connected (a
>   teacher account is an observer, never drawn). To see avatars, sign a
>   STUDENT into the section. Not a bug.
>
> ## NEXT -- queued
> - **v2.1 verify-in-prod** -- once `0007` is run, smoke the archive +
>   the calendar history end to end with a real student session.
> - **Railway -> DigitalOcean migration** -- still queued; strategic,
>   before the next Railway bill. See the `railway-to-digitalocean` memory.
> - **Preview-as-student v2** -- worksheet-level preview (still Desk-only).
> - v2.1 deferred knobs (K12-K16): a teacher poll re-tag/edit
>   (`PATCH /poll-archive`); a dated archive auto-prune.
> - Optional cosmetic: the Desk `.cal-qband` band LABEL still lists units
>   (the divider POSITION is now date-driven).
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **The loop method** held again -- the Codex read-only review caught a
>   real BLOCKER in v2.1 (the cockpit archived a stale tally). The
>   planner folds every finding and ALWAYS re-verifies on disk; the
>   planner-run integration test (after the parallel units) caught a
>   cross-function-call regression the unit-local test runs missed.
> - **The `file://` trap** -- the teacher SSHes from a work laptop; the
>   local `file://` Desk copy is a separate origin (empty localStorage =
>   NOT signed in, `fetch()` CORS-blocked) -- not a valid test surface.
>   Commit+push promptly so the teacher tests the public GH Pages URL.
>   See the `test-on-public-url` memory.
> - **browser-harness does NOT run on this Windows host** (`socket.AF_UNIX`
>   missing) -- use a console-paste diagnostic snippet instead.
> - **Cross-function calls in the Desk MUST be `typeof`-guarded** -- an
>   un-guarded call inside a tested function breaks that function's vm
>   tests (v2.1 U4 hit exactly this).
> - **PowerShell 5.1 + git:** never `git commit -m` from PowerShell --
>   use `git commit -F-` with a Bash-tool heredoc.
> - **Stage own paths only** -- `git add` explicit paths, never `-A`; the
>   repo carries pre-existing untracked scratch; `data/skill-map.js`
>   regenerates on an audit test run -- `git checkout` it before staging.
> - **roster-server** lives inside follow-alongs (`roster-server/`, own
>   `package.json` + vitest); auto-deploys on a push touching
>   `roster-server/**`. curriculum_render is a SEPARATE repo, untouched
>   this session.
>
> ## Recall on reload
> `project_live_classroom.md`, `project_gradebook_grading_model.md`,
> `project_desk_donow.md`, `project_railway_to_digitalocean.md`,
> `feedback_test_on_public_url.md`, `feedback_diagnostic_first.md`,
> `feedback_curriculum_render_sacred.md`.

---

# Continuation Prompt -- session 108

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** --
> the session-107 block and every older block are historical record
> only; do not act on any older "NEXT"/SESSION text. Last updated
> 2026-05-22 (session 108). follow-alongs HEAD = the commit carrying
> this CONTINUATION refresh (the feature work ended at `602baf9`).
> curriculum_render HEAD = `c490cff`. Linear, local==origin on both.
>
> ## Shipped this session (108) -- the session-107 NEXT queue, cleared
> Five workstreams, each run with the proven loop: spec -> freeze a
> `*_BUILD.md` contract -> dependency-aware dispatch (parallel Sonnet
> subagents on disjoint files; planner-direct on the contended Desk) ->
> Codex read-only review (`cross-agent.py`) -> planner folds every
> finding + re-verifies on disk -> tight per-purpose commits -> push.
> Across the session Codex found 2 MINOR (F1) + 1 MAJOR (F2) + 1 MAJOR
> (F3) + 3 MAJOR + 1 MINOR (F4) -- ALL folded. F5 was verified by a
> byte-diff (a verbatim re-sync), no Codex round.
>
> - **F1 -- Preview-as-student Desk toggle (`73d311c`)** -- a Teacher-menu
>   "Preview as student" item flips a per-tab `sessionStorage` flag
>   (`apstats_preview_as_student`); `_deskIsTeacher()` honours it, so the
>   lesson gate / Do-Now focus treat the teacher as a student; a fixed
>   indicator badge shows while active. Spec `PREVIEW_AS_STUDENT_SPEC.md`.
>   Desk-only (planner-direct).
> - **F2 -- Quarters-by-date + the SY26-27 schedule (`cc70b24`)** --
>   grade-quarter assignment is now date-driven: a lesson belongs to the
>   quarter whose calendar window contains its scheduled date, not its
>   unit band. `grade-config.js` gains `start`/`end` windows +
>   `quarterOfDate()`; `lesson-grade.js` gains `quarterOfLesson()`
>   (date-driven, unit-band fallback for a null-date lesson) and
>   `computeQuarterFromLessons` takes `quarterKey` not `quarterBand`.
>   `scripts/build-sy2627-schedule.mjs` lays out real B/E dates for all
>   77 lessons over the Lynn SY26-27 calendar. Specs
>   `QUARTERS_BY_DATE_SPEC.md` / `QUARTERS_BY_DATE_BUILD.md`. **Touches
>   `roster-server/**` -> roster-server auto-deploys.**
> - **F5 -- roster-client.js re-sync (cr `5621f3f`)** -- cr's
>   `roster-client.js` is now byte-identical to follow-alongs' (it
>   predated the `role`/`spriteHue`/`changePassword` additions). Purely
>   additive.
> - **F3 -- Live Classroom v1c, synchronized video start (cr `626499f`
>   + fa `cf97bef`)** -- the cockpit Green Light gains a "Sync video
>   start" checkbox; `classroom_go` / `classroom_greenlight` carry
>   `startVideo` / `videoRef` (additive, ride only the live broadcast,
>   never room state); the board fires a new `onStartVideo` callback;
>   the Desk's `_focusTodayLessonVideo` opens today's lesson resource
>   panel DIRECTLY (the Codex MAJOR fold -- not a synthetic cell click,
>   which would re-enter the lock-dialog / Do-Now-bump guards). Design =
>   `LIVE_CLASSROOM_SPEC.md` S5/S10; contract `LIVE_CLASSROOM_V1C_BUILD.md`.
> - **F4 -- Live Classroom v2, Poll mode (cr `c490cff` + fa `602baf9`)**
>   -- the teacher opens a poll (2-8 options, optionally blind); students
>   vote; avatars cluster under the chosen option column; the cockpit
>   shows a TI-84-style bar chart via the NEW data-driven `ti84-plot.js`.
>   Gate and poll are mutually exclusive. Blind polls are role-aware --
>   every `classroom_member_update` broadcast splits a student bucket
>   (votes masked) / a teacher bucket (real votes). Codex 3 MAJOR + 1
>   MINOR folded (blind-poll own-vote restored optimistically
>   client-side; the blind-poll leak on join/detach/heartbeat/sweep
>   closed; the `classroom_poll` reducer resets member status so a 2nd
>   poll is votable; `reveal` gated to blind). Contract
>   `LIVE_CLASSROOM_V2_BUILD.md`.
>
> ## Migration -- NONE this session
> No new DB migration. F4's poll state is in-memory in the WS server;
> F2/F3 add no schema. roster-server migrations `0001`-`0006` were
> already run (session <=107).
>
> ## Test baseline
> roster-server **443/443**. curriculum_render **894/895** -- the only
> fail is the long-standing unrelated `tests/redox-chat.test.js` (NOT a
> regression). follow-alongs root **4666/4667** -- the only fail is the
> long-standing unrelated `tests/study-guide.test.js` (NOT a regression).
>
> ## Open / verify
> - The pushes triggered deploys: the F2 push (`roster-server/**`) ->
>   roster-server; the cr `626499f` + `c490cff` pushes -> the
>   curriculum_render WS service. Smoke once they land: `/grade` returns
>   date-driven quarter grades; a `classroom_go {startVideo:true}`
>   reaches student Desks; `classroom_open_poll` -> a vote -> the cockpit
>   bar chart; DogePresence / Tetris unregressed.
> - **The teacher's session-107 report ("no sprite-scene board / no
>   cockpit link on the Desk")** was investigated -- NOT a code bug: the
>   board mount (`#classroom-board-mount`, `_mountClassroomBoard`) and
>   the "Live Classroom" Teacher-menu item (opens `teacher-classroom.html`)
>   are both wired in the Desk. `_mountClassroomBoard` bails unless the
>   signed-in user has a `section` -- a teacher account with no section
>   mounts nothing (the teacher's intended view is the cockpit). Likely
>   a GH-Pages cache or a sectionless teacher account. To verify:
>   hard-refresh; confirm the teacher's roster row has a section; open
>   the cockpit via Teacher menu -> Live Classroom.
> - **The SY26-27 lesson schedule** (`roster-server/data/lesson-schedule.json`,
>   generated by `scripts/build-sy2627-schedule.mjs`) is an even
>   first-pass spread across each quarter's school days. The teacher
>   should review/adjust pacing -- the dates are plain editable JSON and
>   the generator is re-runnable.
>
> ## NEXT -- queued
> - **Railway -> DigitalOcean migration** -- the one session-107 queue
>   item deliberately NOT done this session; strategic, before the next
>   Railway bill. See the `railway-to-digitalocean` memory.
> - **Live Classroom v2.1 (deferred from F4):** a student-facing TI-84
>   poll-result surface (K11 -- F4 renders the result only in the
>   cockpit); per-lesson tagging of saved poll graphs; poll history.
> - **Preview-as-student v2 (deferred from F1):** worksheet-level
>   preview (F1 is Desk-only; the 69 worksheets carry their own teacher
>   bypasses).
> - Optional: a date-aligned Desk calendar quarter divider (F2 left the
>   Desk's `unitQuarter` visual dividers unit-based -- the grade math is
>   date-driven, the calendar divider is cosmetic).
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **The loop method** is proven again -- the Codex read-only review
>   gate caught a real correctness bug in 4 of 5 workstreams. The planner
>   folds every finding and ALWAYS re-verifies on disk.
> - **The Grep tool mangles `/` in `-A`/`-B` context lines** (renders
>   `//` as `\`) -- a DISPLAY artifact, NOT file corruption; confirm any
>   suspicious slash with Read before "fixing" anything.
> - **Cross-agent runner:** ASCII-only prompts; give Codex focused
>   "review the `git diff` only" prompts + a 600s `--timeout` (a review
>   timed out at 300s reading a 10k-line file). The clean verdict is in
>   `state/cross-agent/<id>.result.json`.
> - **PowerShell 5.1 + git:** never `git commit -m` from PowerShell --
>   use `git commit -F-` with a Bash-tool heredoc.
> - **Stage own paths only** -- `git add` explicit paths, never `-A`;
>   the repos carry pre-existing untracked scratch, and root
>   `data/skill-map.js` regenerates when an audit test runs --
>   `git checkout` it before staging.
> - **roster-server** lives inside follow-alongs (`roster-server/`, own
>   `package.json` + vitest); auto-deploys on a push touching
>   `roster-server/**`. curriculum_render is a SEPARATE repo;
>   `railway-server/**` deploys the `curriculumrender-production` WS
>   service. A cross-repo feature: review BOTH halves of the contract.
>
> ## Recall on reload
> `project_live_classroom.md`, `project_gradebook_grading_model.md`,
> `project_desk_donow.md`, `project_railway_to_digitalocean.md`,
> `feedback_diagnostic_first.md`, `feedback_curriculum_render_sacred.md`.

---

# Continuation Prompt -- session 107

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** --
> the session-106 block and every older block are historical record
> only; do not act on any older "NEXT"/SESSION text. Last updated
> 2026-05-21 (session 107). follow-alongs HEAD = the commit carrying
> this CONTINUATION refresh (the r3 feature work ended at `e90755e`).
> curriculum_render HEAD = `2626015`. Linear, local==origin on both.
>
> ## Shipped this session (107) -- Live Classroom r3 (the Presentation Revamp)
> One feature, built with the proven loop: brainstorm -> spec
> (`LIVE_CLASSROOM_SPEC.md` Revision 3 / Section 15) -> freeze
> `LIVE_CLASSROOM_R3_BUILD.md` -> 4 parallel Sonnet subagents on disjoint
> files (U1-U4) -> 3 read-only Codex reviews -> planner folds every
> finding + re-verifies on disk -> 3 tight per-purpose commits -> push.
> Codex found 1 BLOCKER + 5 MAJOR + 3 MINOR; all folded (+ 2 planner nits).
>
> - **r3 replaces the Live Classroom board's presentation.** The board
>   was a 320x240 TI-84 LCD with hand-drawn 8px avatars; it is now an
>   animated side-view sprite SCENE reusing curriculum_render's avatars.
>   `canvas_engine.js` + `sprite_sheet.js` were lifted verbatim from
>   curriculum_render into follow-alongs root (`sprite.png` was already
>   tracked). `classroom-board.js` got a render-layer rewrite -- a
>   `CanvasEngine` RAF loop + a slim `BoardSprite` (idle-blink +
>   walk-into-the-gate-door drain), `GateDoor`, green-light overlay. The
>   pure `_reduce` reducer, the WS protocol, and the public board API
>   are UNCHANGED (additive `hue` only). The TI-84 calculator screen is
>   no longer the board substrate -- it becomes an on-demand surface for
>   v2 poll stat-plots (spec decisions D14-D17 supersede D3/K6; D16 = 2D
>   canvas, not WebGL).
> - **Avatar colour persists cross-app via `roster.sprite_hue`.** A new
>   nullable column (migration `0006` -- RUN, see below). cr's hue
>   picker writes it best-effort (`PATCH /roster/:studentId/sprite-hue`,
>   student-own-token auth); `/roster/verify` returns `spriteHue`;
>   `roster-client.js` `current()`/`signIn()` surface it; the WS
>   `classroom_join` + Member + member broadcasts carry an additive
>   durable `hue` (NOT cleared by armGate/reset); the board tints each
>   sprite by it, with a username-hash fallback for un-picked students.
> - **Commits:** follow-alongs `c9d2ebf` (roster-server sprite_hue
>   column + endpoint -- touches `roster-server/**`, auto-deploys) +
>   `e90755e` (the board + spec + BUILD doc + lifted files + Desk and
>   cockpit mount wiring). curriculum_render `2626015` (WS `hue` field +
>   picker roster write -- touches `railway-server/**`, deploys the WS
>   service).
>
> ## Migration -- DONE
> `roster-server/migrations/0006_roster_sprite_hue.sql` was RUN by the
> teacher in the curriculum_render Supabase SQL editor this session. r3
> is FULLY live -- no longer in the degrade-safe (`spriteHue:null` /
> 503) fallback mode.
>
> ## Test baseline
> roster-server **416/416**. curriculum_render **828/829** -- the only
> fail is the long-standing unrelated `redox-chat.test.js` (NOT a
> regression). follow-alongs root **4535/4536** -- the only fail is the
> long-standing unrelated `tests/study-guide.test.js` (NOT a
> regression). New/extended tests: `roster-server/tests/sprite-hue.test.js`,
> curriculum_render `tests/classroom.test.js` +
> `tests/u3-sprite-hue-persist.test.js`, `tests/classroom-board.test.js`,
> `tests/classroom-structure.test.js`.
>
> ## Open / verify
> - Both pushes triggered deploys: `c9d2ebf` -> roster-server,
>   `2626015` -> the curriculum_render WS service. Smoke once they land:
>   `/roster/verify` returns `spriteHue`; `PATCH /roster/:id/sprite-hue`
>   returns 200 (the migration ran -- no longer 503); a `classroom_join`
>   carries `hue`; DogePresence / Tetris unregressed.
> - The board sprite scene is GH Pages (follow-alongs). Eyeball that the
>   board fits its host panel on the Desk + the cockpit (the BLOCKER fix
>   re-pointed the lifted engine off the full viewport onto the
>   container).
>
> ## NEXT -- queued (two were raised + parked THIS session)
> - **"Preview as student" Desk toggle** -- the teacher cannot see the
>   lesson-gating / Do-Now focus because the teacher role bypasses every
>   gate. Diagnosis done (s107): `_deskIsTeacher()` is the single
>   chokepoint -- it reads the `apstats_user_role` localStorage cache,
>   which `updateUserRoleUI()` re-derives from the server role on every
>   load, so a DevTools poke evaporates on reload. Plan: a Teacher-menu
>   "Preview as student" item flipping a `sessionStorage` flag that
>   `_deskIsTeacher()` honours (per-tab, auto-clears, survives reloads).
>   ~15 lines, Desk-only. Not yet spec'd.
> - **Quarters by DATE, not material** -- the teacher's correction:
>   `roster-server/grade-config.js` defines quarters as unit bands
>   (Q1=[1,2,3]...) but a quarter is a calendar window. Teacher provided
>   the Lynn Public Schools SY26-27 calendar (full JSON in the
>   session-107 transcript): first day 2026-09-09; quarter closes Q1
>   2026-11-13 / Q2 2027-01-29 / Q3 2027-04-09 / Q4 2027-06-23; plus
>   holidays + half-days. CATCH found: `roster-server/data/lesson-schedule.json`
>   has NO dates (all `periods` null) -- so "quarters by date" is
>   coupled to laying out the real SY26-27 schedule. Not yet spec'd.
> - **Live Classroom v1c** -- synchronized video start
>   (`LIVE_CLASSROOM_SPEC.md` S10).
> - **Live Classroom v2** -- Poll mode + the data-driven `ti84-plot.js`;
>   this is where the on-demand TI-84 surface (r3 D15) actually gets
>   built.
> - **Railway -> DigitalOcean migration** -- strategic, before the next
>   Railway bill; see the `railway-to-digitalocean` memory.
> - **Cleanup (optional):** cr's `roster-client.js` has drifted from
>   follow-alongs' (it predates the `role` + `changePassword`
>   additions); re-sync the shared file.
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **The loop method** is proven again -- the Codex read-only review
>   gate caught the r3 BLOCKER + 5 MAJOR. The planner folds every
>   finding and ALWAYS re-verifies on disk.
> - **Lifted files:** `canvas_engine.js` / `sprite_sheet.js` /
>   `sprite.png` in follow-alongs root are verbatim copies from
>   curriculum_render -- cr is their source of truth; re-copy if cr
>   changes them, do not "improve" them in place.
> - **Cross-agent runner:** ASCII-only prompts. A Codex review wrote a
>   483 KB `.output`; the clean verdict is in
>   `state/cross-agent/<id>.result.json`, not the wrapper.
> - **PowerShell 5.1 + git:** never `git commit -m` from PowerShell --
>   use `git commit -F-` with a Bash-tool heredoc.
> - **Stage own paths only** -- the repos carry pre-existing untracked
>   scratch (`.ai-tutor-*`, `.codex-*`, `.batch-*`, `state/cross-agent*`,
>   cr's `AGENTS.md`/`CLAUDE.md`/`.claude/**`). `git add` explicit
>   paths, never `-A`. `data/skill-map.js` regenerates when the audit
>   runs -- `git checkout` it.
> - **roster-server** lives inside follow-alongs (`roster-server/`, own
>   `package.json` + vitest); auto-deploys on a push touching
>   `roster-server/**`. curriculum_render is a SEPARATE repo;
>   `railway-server/**` deploys the `curriculumrender-production` WS
>   service.
>
> ## Recall on reload
> `project_live_classroom.md`, `project_gradebook_grading_model.md`,
> `project_desk_donow.md`, `project_grade_pipeline.md`,
> `project_teacher_auth.md`, `project_railway_to_digitalocean.md`,
> `feedback_diagnostic_first.md`, `feedback_curriculum_render_sacred.md`.

---

# Continuation Prompt -- session 106

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** --
> the session-105 block and every older block are historical record
> only; do not act on any older "NEXT"/SESSION text. Last updated
> 2026-05-21 (session 106). follow-alongs HEAD = the commit carrying
> this CONTINUATION refresh (the feature work ended at `8e2aef7`:
> Thread 2 `bc8c436`, Thread 3 `985d11e`, v1b board/cockpit `8e2aef7`).
> curriculum_render HEAD = `10515c4` (v1b WS server). Linear,
> local==origin on both.
>
> ## Shipped this session (106) -- the post-grade-pipeline backlog
> Three workstreams, run as one pipeline with the proven loop: spec ->
> freeze a `*_BUILD.md` contract -> dependency-aware dispatch (5
> parallel Sonnet subagents on disjoint files + planner-direct on the
> contended Desk) -> 4 read-only Codex reviews -> planner folds every
> finding + re-verifies on disk -> 4 tight commits -> push. Codex found
> 0 BLOCKER + 6 MAJOR + 4 MINOR; all folded (1 MAJOR was a verified
> false positive -- see gotchas).
>
> - **Thread 2 -- Calendar polish (`bc8c436`)** -- four Desk
>   (`ap_stats_roadmap_square_mode.html`) calendar-grid changes: done
>   lessons render greyscale (`.dc-done`), the `/donow` current lesson
>   gets a `.cal-current` accent outline, `rCal` emits a `.cal-qband`
>   quarter divider at each Q1-Q4 boundary (new `unitQuarter` helper),
>   and the redundant per-cell direct-link icons were removed from
>   `htm()`. Planner-direct. `CALENDAR_POLISH_SPEC.md` +
>   `CALENDAR_POLISH_BUILD.md`; new `tests/calendar-polish.test.js`.
>   Codex review: clean, no findings.
> - **Thread 3 -- Roster management (`985d11e`)** -- a teacher can edit
>   a student's real name + section and quick-duplicate a student from
>   the roster console, no SQL. roster-server `PATCH /roster/:studentId`
>   (`requireTeacher`-gated; writes ONLY `real_name`/`section`/`updated_at`),
>   new `db.updateStudent`, `studentId` added to `GET /roster/list`;
>   `teacher-roster-console.html` gains per-row Edit (inline inputs +
>   Save/Cancel) and Duplicate (prefills the Add-Student form).
>   `ROSTER_MGMT_SPEC.md` + `ROSTER_MGMT_BUILD.md`; new
>   `roster-server/tests/roster-edit.test.js` +
>   `tests/roster-console-structure.test.js`. Codex 2 MAJOR + 1 MINOR
>   folded (PATCH rejects non-string values with 400 instead of
>   coercing; Duplicate clears stale password/email; a live-payload
>   test drives the real `db.updateStudent`). **This commit touches
>   `roster-server/**` -> roster-server auto-deploys.**
> - **Live Classroom v1b -- the Gate (`8e2aef7` follow-alongs +
>   `10515c4` curriculum_render)** -- the once-per-session check-in
>   ritual. WS server: per-room `gate` + per-member `status`
>   (present|checkedIn); `armGate`/`checkin`/`greenLight`/`reset`
>   registry methods + 4 additive `server.js` switch cases. Board
>   (`classroom-board.js`): draws the gate hole, drains checked-in
>   students, injects a check-in button; new `onStateChange` callback +
>   `armGate`/`greenLight`/`reset` handle methods. Cockpit
>   (`teacher-classroom.html`): Arm Gate / Green Light / Reset control
>   strip + a live checked-in panel. `LIVE_CLASSROOM_V1B_BUILD.md`
>   (design = the existing `LIVE_CLASSROOM_SPEC.md`). Codex 3 MAJOR + 2
>   MINOR folded -- the green-light was reworked: `_reduce` is now pure
>   (greenlight is a boolean), the banner fade is render-layer with a
>   repaint timer, the cockpit indicator is broadcast-driven from
>   `summary.greenlight`. **The `10515c4` push deploys the
>   curriculum_render WS service.**
>
> ## Test baseline (post-fold)
> follow-alongs root **4505/4506** -- the only fail is the long-standing
> unrelated `tests/study-guide.test.js` v3-structure snapshot (NOT a
> regression). roster-server **381/381**. curriculum_render **795/796**
> -- the only fail is the long-standing unrelated
> `tests/redox-chat.test.js` `max_tokens` (NOT a regression).
> `node scripts/audit-feeder-ids.mjs` -> CLEAN 69 / MISMATCH 0. New
> test files: `tests/calendar-polish.test.js`,
> `tests/roster-console-structure.test.js`,
> `roster-server/tests/roster-edit.test.js`; extended:
> `tests/classroom-board.test.js`, `tests/classroom-structure.test.js`,
> `tests/desk-donow-coloring.test.js`, curriculum_render
> `tests/classroom.test.js`.
>
> ## Open / verify
> - `985d11e` (touches `roster-server/**`) triggers the roster-server
>   auto-deploy. `PATCH /roster/:studentId` is live in prod only once
>   that lands -- smoke it (401 without auth; a real edit round-trip).
> - `10515c4` deploys the curriculum_render WS service. The v1b gate
>   handlers are live only once that lands -- smoke a
>   `classroom_arm_gate` round-trip; confirm DogePresence / Tetris
>   unregressed.
>
> ## NEXT -- pick one (none spec'd yet)
> - **Live Classroom v1c** -- synchronized video start (the D5 option;
>   `LIVE_CLASSROOM_SPEC.md` S10): the `classroom_greenlight`
>   `startVideo` path -- student Desks navigate to / focus today's
>   lesson video. Note browser autoplay policy.
> - **Live Classroom v2** -- Poll mode + the data-driven `ti84-plot.js`
>   (`LIVE_CLASSROOM_SPEC.md` S7/S10).
> - **Railway -> DigitalOcean migration** -- strategic, before the next
>   Railway bill; see the `railway-to-digitalocean` memory.
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **The loop method** is proven again -- the Codex read-only eval
>   gate caught real bugs in 3 of 4 workstreams. The planner folds
>   findings and ALWAYS re-verifies on disk (this session that caught a
>   stale test pin the fold itself broke).
> - **Codex cross-repo false positive:** a feature spanning two repos,
>   reviewed per-repo, can draw a false-positive MAJOR -- Codex sees
>   only one repo. (v1b: the WS reviewer flagged `armGate` for not
>   broadcasting a status reset; the board `_reduce` already resets on
>   `classroom_gate` per the frozen contract.) Verify a cross-repo
>   finding against BOTH halves before folding.
> - **Cross-agent runner:** ASCII-only prompts. The background task
>   `.output` is often a wrapper whose `notes` field holds the whole
>   Codex transcript -- read the real verdict from the transcript tail
>   (`tail -c`), not the wrapper `summary`.
> - **PowerShell 5.1 + git:** never pass a commit message via
>   `git commit -m` from PowerShell -- it mangles quotes. Use
>   `git commit -F-` with a bash heredoc (the Bash tool).
> - **The Bash tool is bash, not PowerShell** -- use `tail`/`grep`/`sed`;
>   `Select-Object` fails. The separate PowerShell tool is for PS.
> - **Stage own paths only** -- the repo carries pre-existing untracked
>   scratch (`.ai-tutor-*`, `.codex-*`, `.batch-*`, `state/cross-agent*`).
>   `git add` explicit paths, never `-A`. `data/skill-map.js` +
>   `GRADEBOOK_FEEDER_ID_AUDIT.md` regenerate when the audit runs --
>   `git checkout` them.
> - **roster-server** lives inside follow-alongs (`roster-server/`, own
>   `package.json` + vitest); auto-deploys on a push touching
>   `roster-server/**`. curriculum_render is a SEPARATE repo;
>   `railway-server/**` deploys the `curriculumrender-production`
>   Railway WS service.
>
> ## Recall on reload
> `project_live_classroom.md`, `project_grade_pipeline.md`,
> `project_desk_donow.md`, `project_gradebook_grading_model.md`,
> `project_teacher_auth.md`, `project_railway_to_digitalocean.md`,
> `feedback_diagnostic_first.md`, `feedback_curriculum_render_sacred.md`.

---

# Continuation Prompt -- session 105

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** --
> the session-104 block and every older block are historical record
> only; do not act on any older "NEXT"/SESSION text. Last updated
> 2026-05-21 (session 105). follow-alongs HEAD = the commit carrying
> this CONTINUATION refresh (the Thread-1 work ended at `ffa5b63`);
> curriculum_render HEAD = `120dbac` (untouched this session). Linear,
> local==origin on follow-alongs.
>
> ## Shipped this session (105) -- Thread 1, the grade pipeline
> `GRADE_PIPELINE_SPEC.md` Thread 1 is fully implemented, Codex-reviewed,
> and shipped -- three commits that make doing a worksheet visibly and
> reliably move the grade. Method: freeze `GRADE_PIPELINE_BUILD.md` ->
> dependency-aware batches (the three 69-worksheet rollouts had to
> serialize; server + prompt-file work ran parallel) -> Sonnet subagents
> implement -> Codex read-only review per commit -> planner folds every
> finding + re-verifies on disk -> commit + push. Codex caught a real
> bug on EVERY commit: 1 BLOCKER + 3 MAJOR + 3 MINOR, all folded.
>
> - **W2 (`da750a3`)** -- FRQ-revision persistence. Reflections persist
>   on every edit (new `recordReflectionDraft` sink), an appeal
>   re-records the upgraded score, hydration restores the grade, and
>   editing a graded reflection clears the stale grade. 69-worksheet
>   rollout `scripts/wire-reflection-persistence.mjs` (W2.0-W2.5).
>   u3_lesson6-7's W2.3 hand-applied (bespoke appeal architecture).
>   Codex BLOCKER: hydration left `gradingState` empty so a post-reload
>   edit never cleared the grade -- fixed by W2.5.
> - **W3 (`a39f37d`)** -- unambiguous E/P/I. `scripts/wire-verdict-prompt.mjs`
>   hardens the score instruction in all 69 in-scope
>   `ai-grading-prompts-*.js`; `scripts/wire-verdict-parser.mjs` rolls
>   `coerceVerdict` (first-character) + a TWO-SINK split --
>   `recordReflectionDraft` for W2.1 drafts, `recordReflectionToGradebook`
>   graded-only, which `console.error`s + skips a null/uncoercible
>   verdict (never a silent no-score row). Also committed
>   `GRADE_PIPELINE_BUILD.md` (new) + `GRADE_PIPELINE_SPEC.md` (the
>   teacher's D1-D4 decisions).
> - **W1 + W4 (`ffa5b63`)** -- worksheet blank scoring + grade-pill
>   refresh. `recordBlankToGradebook` now records the blank's verdict
>   score (`scripts/wire-blank-scores.mjs`); `roster-server/lesson-grade.js`
>   gains the worksheet component `Cws` (over ALL blanks, manifest
>   denominator); lesson grade = three-way weighted mean, weights
>   `lessonFeederWeights ws:W:Q = 1:2:3` in `grade-config.js`; threaded
>   through `/grade` + `/class/grades`. W4: `_studentMarkSave` re-invokes
>   `renderDoNowGrades` on the Done success path. **This commit touches
>   `roster-server/**` -> roster-server auto-deploys.**
>
> ## Test baseline (post-`ffa5b63`)
> follow-alongs root **4421/4422** -- the only fail is the long-standing
> unrelated `tests/study-guide.test.js` v3-structure snapshot (NOT a
> regression). roster-server **362/362**. `node scripts/audit-feeder-ids.mjs`
> -> CLEAN 69 / MISMATCH 0. New test files: `tests/grade-pipeline-w2.test.js`,
> `-w3-parser`, `-w3-prompts`, `-w1`, `-w4`.
>
> ## Open / verify
> - The `ffa5b63` push triggers the roster-server auto-deploy (GitHub
>   watch on `roster-server/**`). The new grade math is live in prod
>   only once that deploy lands -- confirm on Railway / smoke `/grade`.
>
> ## NEXT -- pick one (none spec'd yet)
> - **Thread 2 -- Calendar polish**: done lessons go greyscale; the
>   current lesson is emphasized; Q1-Q4 markers on the calendar; drop
>   the direct-link icons on the calendar cells.
> - **Thread 3 -- Roster management**: edit a student's period/section
>   and real name, duplicate a student -- a roster-server PATCH-roster
>   endpoint + inline editing in `teacher-roster-console.html`.
> - **Live Classroom v1b** -- the Gate (`LIVE_CLASSROOM_SPEC.md` S10),
>   then v1c (sync video start) + v2 (Poll).
> - **Railway -> DigitalOcean migration** -- strategic, before the next
>   Railway bill; see the `railway-to-digitalocean` memory.
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **The loop method** is proven -- the Codex read-only eval gate
>   caught a real bug on all 3 commits this session. The planner folds
>   findings and ALWAYS re-verifies them on disk.
> - **Wire-script rollouts** (`scripts/wire-*.mjs`): idempotent,
>   per-file EOL-preserving, per-step sentinel, MANUAL on a non-unique
>   anchor. To re-roll a CHANGED step: `git checkout` the worksheets +
>   re-run (a plain re-run is a sentinel no-op).
> - **Cross-agent runner:** ASCII-only prompts. The `<id>.result.json`
>   is often a wrapper whose `notes` field holds the whole transcript --
>   the real Codex verdict is at the transcript tail.
> - **PowerShell 5.1 + git:** never pass a commit message containing a
>   `"` via a here-string to `git commit -m` -- PS 5.1 mangles it into
>   pathspecs and the commit fails. Use `git commit -F-` with a bash
>   heredoc.
> - **Stage own paths only** -- the repo carries pre-existing untracked
>   scratch (`.ai-tutor-*`, `.codex-*`, `state/cross-agent*`). `git add`
>   explicit paths, never `-A`. `data/skill-map.js` regenerates a
>   timestamp-only header when the audit runs -- `git checkout` it.
> - **roster-server** lives inside follow-alongs (`roster-server/`, own
>   `package.json` + vitest); auto-deploys on a push touching
>   `roster-server/**`.
>
> ## Recall on reload
> `project_grade_pipeline.md`, `project_gradebook_grading_model.md`,
> `project_desk_donow.md`, `project_live_classroom.md`,
> `project_teacher_auth.md`, `feedback_diagnostic_first.md`,
> `feedback_curriculum_render_sacred.md`,
> `project_railway_to_digitalocean.md`.

---

# Continuation Prompt -- session 104

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** --
> the session-103 block and every older block are historical record
> only; do not act on any older "NEXT"/SESSION text. Last updated
> 2026-05-21 (session 104). follow-alongs HEAD = the commit carrying
> this refresh + `GRADE_PIPELINE_SPEC.md` (prior was `42033ac`);
> curriculum_render HEAD = `120dbac`. Linear, local==origin on both.
>
> ## Shipped this session (104)
> Two features, each built with the loop: freeze a `*_BUILD.md`
> contract -> parallel Sonnet subagents + planner-direct for the
> contended Desk -> Codex cross-agent eval (read-only) -> planner final
> review -> commit + push. Codex caught real bugs both times.
>
> - **Live Classroom v1a (Foundation)** -- a shared, section-scoped
>   student-presence board rendered as a 320x240 TI-84 screen.
>   curriculum_render `120dbac` (WS server: new `railway-server/classroom.js`
>   room registry + additive `server.js` -- section-aware
>   `classroom_join`/`_leave`/`_heartbeat`, section-scoped broadcast,
>   liveness/GC sweep). follow-alongs `f74c94e` (`classroom-board.js`
>   board component, `teacher-classroom.html` cockpit, Desk embed +
>   Teacher-menu item). Spec `LIVE_CLASSROOM_SPEC.md`, build doc
>   `LIVE_CLASSROOM_V1A_BUILD.md`. Codex eval found 2 BLOCKER + 6 MAJOR,
>   all folded. v1a is section PRESENCE only -- no gate, no poll.
> - **Connected Teacher Auth** -- follow-alongs `42033ac`. A `roster.role`
>   column (migration `roster-server/migrations/0005_roster_role.sql` --
>   the teacher RAN it); `roster-server/teacher-auth.js` exports
>   `requireTeacher`, which authorizes a request via the `x-teacher-secret`
>   OR a roster token whose account has `role:'teacher'`; all 9
>   teacher-gated endpoints use it. `/roster/verify` returns `role`;
>   `roster-client.js` `current()` exposes it. The Desk teacher access
>   code, `makeMeTeacher`, and the standalone teacher mode are RETIRED;
>   `updateUserRoleUI` derives teacher-ness from the roster session.
>   `x-teacher-secret` stays as a break-glass fallback. Build doc
>   `TEACHER_AUTH_BUILD.md`. Codex eval: 0 BLOCKER, 1 MAJOR + 1 MINOR
>   folded.
>
> ## NEXT = Thread 1, the grade pipeline (`GRADE_PIPELINE_SPEC.md`)
> Spec'd this session (DRAFT). Make worksheet work score (the fill-in
> blanks already carry answers + validation -- score their correctness,
> currently discarded as `score:null`), fix the FRQ-revision
> persistence bug, make the AI grader return an unambiguous E/P/I, and
> refresh the grade pill after work. ONE teacher decision gates
> implementation -- the weights `w_ws:w_w:w_q` (proposed `1:1:2`); see
> `GRADE_PIPELINE_SPEC.md` Section 6.
>
> ## Queued (not yet spec'd)
> - **Thread 2 -- Calendar polish**: done lessons go greyscale; the
>   current lesson is emphasized; Q1-Q4 markers on the calendar; drop
>   the direct-link icons on the calendar cells (clicking the cell
>   opens the resource modal, which covers it).
> - **Thread 3 -- Roster management**: edit a student's period/section
>   and real name, duplicate a student -- a roster-server PATCH-roster
>   endpoint + inline editing in `teacher-roster-console.html`.
> - **Live Classroom v1b** -- the Gate (arm today's hole, check-in,
>   drain-to-empty, the green light). Then v1c (synchronized video
>   start), v2 (Poll mode + the data-driven `ti84-plot.js`). See
>   `LIVE_CLASSROOM_SPEC.md` Section 10.
> - **Railway -> DigitalOcean migration** -- strategic, before the next
>   Railway bill; see the `railway-to-digitalocean` memory.
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **The loop method** (above) is proven -- the Codex read-only eval
>   gate catches a real bug nearly every cycle; the planner folds the
>   findings and ALWAYS re-verifies them on disk.
> - **Cross-agent runner:** ASCII-only prompts (it has a UTF-8-decode
>   bug). New files must be ASCII-clean -- a subagent shipped
>   box-drawing comment separators twice this session; caught + stripped
>   at final review. Codex's `.result.json` can be a wrapper fallback;
>   read the real verdict from the transcript.
> - **The Desk** (`ap_stats_roadmap_square_mode.html`) is the contended
>   ~10k-line single file -- planner-direct, never parallel-Sonnet on it.
> - **Stage own paths only** -- never `git add -A`; the repo carries
>   pre-existing untracked scratch (`.ai-tutor-*`, `.batch-*`,
>   `state/cross-agent*`, `.codex-*`, etc.). `data/skill-map.js`
>   regenerates a timestamp-only header when the feeder audit runs --
>   `git checkout` it if that is its only diff.
> - **roster-server** lives inside follow-alongs (`roster-server/`, its
>   own `package.json` + vitest) and auto-deploys on a push touching
>   `roster-server/**`. Two test suites: follow-alongs root `npm test`
>   (one known unrelated fail, `tests/study-guide.test.js`) and
>   `npm --prefix roster-server test`.
> - The Live Classroom WS server is in the SEPARATE curriculum_render
>   repo (`railway-server/server.js`, the `curriculumrender-production`
>   Railway service) -- additive only; must not regress DogePresence or
>   Tetris.
>
> ## Recall on reload
> `project_live_classroom.md`, `project_teacher_auth.md`,
> `project_gradebook_grading_model.md`, `project_desk_donow.md`,
> `feedback_diagnostic_first.md`, `feedback_curriculum_render_sacred.md`,
> `project_railway_to_digitalocean.md`.

---

# Continuation Prompt — Desk Hardening (session 103)

> **THIS SECTION IS AUTHORITATIVE. It supersedes EVERYTHING below it** —
> the session-102 summary, the "ON RELOAD: RUN THE AUTONOMOUS LOOP"
> section, and the "PRIOR PROVENANCE" block are all historical record
> only; do not act on any older "NEXT THREAD"/SESSION text. Last updated
> 2026-05-21 (session 103). HEAD = `764369b`. Linear, local==origin.
>
> ## ✅ Sessions ≤102 — all shipped & live
> The full gradebook roadmap (T1–T8 + Phase 6 lesson-weighted
> `quarterGrade`), the AI-tutor delivery, the roster teacher tools, the
> Do-Now/Desk rework, and the session-102 Desk UX long-tail are all in
> prod. Detail is in git history + the memory files; the session-102
> summary below is kept only as history.
>
> ## ✅ Session 103 — Desk hardening for the Sept-1 cohort (6 commits)
> Six tight commits, each its own workstream: freeze a `*_BUILD.md`
> contract → planner-direct (the contended Desk file) and/or a Sonnet
> rollout (the 69 worksheets) → Codex read-only review → fold findings →
> planner reverify ON DISK → commit + push. Codex caught real defects on
> two of them; one Codex MAJOR was a verified false positive.
>
> - **Persistent worksheet answers** (`1fbfcc1`): a signed-in student
>   reopening any of the 69 live worksheets gets every fill-in-the-blank
>   + AI-graded reflection auto-populated from their most-recent
>   `item_ledger` submission (fill-empty only; `↻ restored` badge).
>   roster-server `GET /ledger/student/:studentId` extended to accept a
>   student token (self-only; 403 cross-student) + a strict `?prefix=`
>   filter; NEW `gradebookClient.fetchPrior(prefix)`; hydration block
>   rolled to all 69 via `scripts/wire-hydration.mjs`. Codex YELLOW →
>   1 MAJOR (prefix sanitizer allowed `_`, a SQL LIKE wildcard) + 3 MINOR
>   all folded.
> - **Blooket flashcards → curated top-10 + keyboard nav** (`e22cf7c`):
>   the verification flashcards trimmed from ~28 to the 10 most
>   lesson-relevant. NEW `data/blooket-difficulty.json` — Codex tagged
>   all 2264 Blooket questions hard/med/easy against the unit AP
>   frameworks; `_bfSelectTop10` builds each deck hard-first. Keyboard:
>   a-d / 1-4 commit a choice, Enter advances. Codex YELLOW: the first
>   tagging pass templated rationales by lesson (one trivial item tagged
>   `hard`) → re-dispatched Codex with a corrective prompt; the re-run
>   (JSON `version: 2`) fixed all flagged cases.
> - **Worksheet "Done" gated on real completion** (`de68a4b`): the Desk
>   worksheet Done button no longer unlocks on a 5-min timer. Each
>   worksheet computes its own completion (blanks + reflections
>   attempted, plus whether every reflection is AI-rated E) and writes
>   `apstats_ws_completion`, **student-scoped** (`getStudentEmail()` key)
>   so a shared browser never leaks completion between students.
>   Eligible = ≥80% attempted OR all-reflections-E. Codex RED → fixed →
>   re-review GREEN (BLOCKER: an off-pattern driller worksheet; MAJOR:
>   the store was global). The Desk gate pattern-guards to
>   `^u\d+_lesson.+_live\.html$` so off-pattern worksheets keep the timer.
> - **Blooket "Done" opens the flashcards immediately** (`6b15657`):
>   dropped the redundant 15-min Blooket visit timer — the flashcard quiz
>   IS the completion check. Removed the now-dead `BLOOKET_GATE_MS`.
> - **Sequential lesson gate + video Done removed** (`d137c95`): calendar
>   lessons lock (dimmed + 🔒) until the prior lesson is complete
>   (worksheet + Blooket Done) OR the scheduled date arrives. Year-round;
>   teachers + not-signed-in bypass; fails OPEN. The video Done button is
>   gone — the video shows a `✓ done` once the worksheet is marked Done.
>   Codex review GREEN (2 MINOR test-coverage folds).
> - **Sign-in wall — no guest mode** (`764369b`): the Desk sign-in modal
>   auto-opens after the boot splash and is non-dismissable until a real
>   sign-in; all 69 worksheets show a blocking overlay (links to the
>   Desk) if opened without a session. Both fail OPEN. Codex YELLOW: the
>   one MAJOR (an alleged "37/32 mojibake split" across the worksheet
>   blocks) was VERIFIED A FALSE POSITIVE — all 69 wall blocks are
>   byte-identical + valid UTF-8 (the 🔒 emoji intact); it was the
>   cross-agent runner's known UTF-8-decode artifact. A corpus
>   byte-identity test + a UTF-8-validity test now prove it. 2 MINOR
>   folded.
>
> ## Test baseline (post-`764369b`)
> follow-alongs root **4163/4164** — the only fail is the long-standing
> unrelated `tests/study-guide.test.js` v3-structure snapshot (NOT a
> regression; `study_guide_diagnostic.html` is untouched). roster-server
> **291/291** (+11 from the `/ledger/student` extension; otherwise
> untouched this session). `node scripts/audit-feeder-ids.mjs` → CLEAN
> 69 / MISMATCH 0. Desk file + all 69 worksheets LF. Session-103 build
> docs: `PERSISTENT_ANSWERS_BUILD.md`, `FLASHCARD_REWORK_BUILD.md`,
> `WORKSHEET_COMPLETION_GATE_BUILD.md`, `LESSON_GATE_BUILD.md`,
> `SIGNIN_WALL_BUILD.md`.
>
> ## Carry-forward gotchas (still load-bearing)
> - **SACRED:** never write `curriculum_render/data/curriculum.js`.
> - **EOL:** the Desk file + worksheets are LF; bulk edits MUST be
>   EOL-preserving. The `scripts/wire-*.mjs` rollouts are the safe
>   pattern — idempotent, per-file EOL detect, FAIL-not-skip on a
>   non-unique anchor. Re-rolling = revert the worksheets + re-run.
> - **Codex cross-agent:** ASCII-only prompts. The runner has a known
>   UTF-8-decode bug — it mangled the 🔒 emoji in Codex's view this
>   session and produced a false-positive MAJOR. `.result.json` is often
>   a wrapper fallback ("did not write a result file"); parse the real
>   verdict from the transcript tail, never the wrapper. ALWAYS
>   re-verify Codex findings on disk — a corpus hash settled the
>   mojibake claim definitively.
> - **typeof-guard cross-sprint calls:** a new call inside a function a
>   `vm`-test extracts into a partial sandbox breaks that test — wrap as
>   `if (typeof fn === 'function')`. (Bit the sign-in wall:
>   `openSignInModal` calling `_deskAccessGranted` broke
>   `desk-roster-signin`'s vm-test until guarded.)
> - **`data/skill-map.js`** regenerates a timestamp-only `// GENERATED:`
>   header when the audit runs — `git checkout -- data/skill-map.js` if
>   that is its only diff.
> - **roster-server auto-deploys on git commit** (GitHub watch on
>   `roster-server/**`) — no manual `railway up` needed.
> - **Teacher bypass:** the completion gate, lesson gate, and sign-in
>   wall all bypass for `apstats_user_role==='teacher'` — to test them as
>   a student, clear that localStorage key.
> - **Stage own paths only** — the repo carries unrelated pre-existing
>   dirty/untracked scratch (`.ai-tutor-*`, `.batch-*`, `.session*`,
>   `GRADEBOOK_TAGGING_AUDIT.md`, `state/cross-agent-log.json`); never
>   `git add -A`.
>
> ## NEXT = wrap session — no open code work
> Everything the teacher asked for this session is shipped + reviewed.
> The Desk is hardened for the Sept-1 cohort: persistent answers,
> completion-gated worksheet Done, the Blooket flashcard gate,
> sequential lesson unlocking, and a hard sign-in wall (no silent
> un-recorded work). Still queued (strategic, not urgent): the Railway →
> DigitalOcean migration (Tier 1 — roster-server to a $6/mo droplet,
> ~3-4h, trigger before the next Railway bill). Recall memories on
> reload: `project_desk_donow.md`, `project_gradebook_grading_model.md`,
> `feedback_diagnostic_first.md`, `feedback_curriculum_render_sacred.md`,
> `feedback_edgar_separate_track.md`, `project_railway_to_digitalocean.md`.

---

# Continuation Prompt — Gradebook + Desk Polish (session 102)

> **SUPERSEDED — the "Desk Hardening (session 103)" block at the top of
> this file is now the authoritative section. This session-102 summary
> and everything below it are historical record only; do not act on the
> "NEXT THREAD"/SESSION/AUTONOMOUS-LOOP text.** (session 102 — Task-#8
> long-tail of Desk UX polish + Phase 6; HEAD then was `242c34f`.)
>
> ## ✅ Everything shipped through session 101 (gradebook autonomous loop)
> All eight T1–T8 phases live in prod (`ccbf75f` baseline). Phase 4b
> finally rolled (`f6305703` deploy SUCCESS 2026-05-20 15:24 UTC) after
> Railway recovered from a 48h-stretch of 3 distinct failure modes
> (24h OAuth/GCP outage; railpack v0.23.0 path-concat regression on
> deploy `e52eab15`; then a stuck-DEPLOYING traffic-switch lag). Both
> user-owned handoffs CLOSED (Supabase migration `0004` was already
> done 2026-05-19). `/remediation/list` returns 401 now (route mounted,
> teacher-gated) — was 404 before.
>
> ## ✅ Phase 6 SHIPPED — lesson-weighted, date-driven `quarterGrade`
> Three commits + two hotfixes implemented the user's cumulative-progress
> grading model. Replaced Phase 3's "mean of GRADED units" with a
> lesson-level engine that counts lessons due-by-today (per student
> section), with un-attempted due lessons contributing 0.
>
> - **Phase 6 base** (`7f93ab1`): NEW `roster-server/lesson-grade.js`
>   (pure: item-ID parser for 5 patterns; combined-worksheet expansion;
>   lesson aggregation; date filter; lessons[] builder). NEW
>   `scripts/build-lesson-schedule.mjs` → bundled
>   `roster-server/data/lesson-schedule.json` (77 lessons; 7
>   combined-worksheet groups: 3.6-7, 4.1-2, 4.3-4-5, 4.7-8, 4.10-11-12,
>   5.1-2, 6.1-2). `roster-server/grade.js` integrates lesson-level
>   math; `units` field stays unchanged for the teacher dashboard.
>   `grade-config.js` bands updated: Q1=[1,2,3] Q2=[4,5] Q3=[6,7]
>   Q4=[8,9]; `schoolTz='America/New_York'`. Desk gets per-day
>   click-through modal (dblclick / right-click any calendar cell →
>   shows lesson grades for that day). Codex 1BLK+3MAJ+1MIN folded:
>   BLK = section was being read from ledger rows (which don't persist
>   it) → added `db.findByStudentId`; MAJ1 = `/class/grades` not
>   passing schedule → threaded through; MAJ2 = missing-schedule
>   fallback reverted to unit-mean → now uses lesson-level math
>   without date filter (`expandLessonKey` synthesizes topicKey on
>   null schedule); MAJ3 = malformed-entry crash guards; MIN =
>   contextmenu missing stopPropagation.
> - **Phase 6 hotfix** (`368ff11`): `gradingWindowStart='2026-09-01'`
>   excludes stale prior-year dates left in the schedule from a finished
>   cohort. Q3/Q4 lessons in roadmap carried April-2026 dates from
>   SY25-26; without the filter they all flagged "past-due" for the new
>   cohort and showed 0% ↑100. Filter removes any band lesson whose
>   period dates are ENTIRELY before the window start. Lessons with
>   null dates OR with at least one date >= window stay in the band.
>   Annual cutover knob — bump to '2027-09-01' next year.
> - **Phase 6 v2** (`aaa7ca0`): ahead-of-schedule work counts.
>   `dueLessons = (due-by-date) ∪ (lessons-with-recorded-work)`. So a
>   student who did 2 FRQs in lesson 1.1 today (May 2026, pre-cohort)
>   sees Q1 reflect that work instead of an empty pill. Same commit
>   stripped the resource-modal keyboard navigation (the [a][b][1][2][3]
>   badge UX from Task #8) — teacher said "looks weird, feels weird."
>   Modal-scoped keydown handler + `_focusedLetter` + badges all gone;
>   regression guards added.
>
> Phase 6 GREEN: roster-server **280/280** (was 223 → +57 across
> Phase 6 + v2 + hotfix + roster picker); root **1769/1770** (only known
> pre-existing study-guide.test.js fail).
>
> ## ✅ Long-tail Desk UX polish (sessions 102 follow-on)
>
> Many small commits driven by teacher feedback. The Desk file
> (`ap_stats_roadmap_square_mode.html`) is the contended surface; all
> changes are planner-direct (no Sonnet fan-out since v5 detour) and
> EOL LF preserved.
>
> - **Keyboard rework + Q1-Q4 grade outlook strip** (`381a442`): letters
>   a-h SELECT only, no auto-open (then later removed entirely in
>   `aaa7ca0`); compact `[Q1: X.X ↑Y.Y]` quarter pills inside the Do Now
>   card; XSS-safe via createElement+textContent; typeof-guarded fire-
>   and-forget call from renderDoNow.
> - **Blooket flashcard verification** (`a24bacc`): replaces the
>   self-attest score-prompt with a flashcard quiz sourced from the
>   same `u{U}_l{L}_blooket.csv` that built the live Blooket game.
>   Single pass ≥80% to unlock Done; auto-mark on pass; retry on fail.
>   15-min visit gate for Blooket specifically (vs 5-min default for
>   worksheet/quiz). Phase-3 spec preserved: Blooket score still NOT
>   recorded to gradebook ledger; only legacy student_progress for
>   teacher review. 15 structure pins in
>   `tests/desk-blooket-flashcards.test.js`; Playwright smoke loops
>   through all 28 cards of u8_l1_blooket.csv → modal auto-closes → Done
>   mark persisted with score=100.
> - **Date-aware AP Classroom video links** (`ee38ca9`): before
>   `SCHOOL_YEAR_START='2026-09-01'`, AP Classroom URLs hidden; Drive
>   `altUrl` rendered as the primary "Video N" link (no "(alt)" suffix).
>   If a video has no altUrl AND AP isn't available yet: rendered as a
>   locked strike-through placeholder. `localStorage.apstats_desk_today_override`
>   for teacher preview. Fails open (any error → returns true).
> - **Teacher menu** (`3160606`): new menu next to "Student" with three
>   items — Gradebook Dashboard, Roster Console, Unlock Code Generator.
>   Opens in new tabs; auth handled by destination pages.
> - **Flashcard progress save+resume + user-role gating** (`db4fe30`):
>   per-(student,topic) flashcard state persisted; "Student" menu
>   renamed to "User"; Teacher menu hidden by default unless
>   `apstats_user_role==='teacher'`. Initial sign-in modal got a Teacher
>   checkbox + access-code input.
>
> ## 🪤 The typo episode (six iterations, one wasted afternoon)
>
> Teacher reported "can't sign in as teacher, checkbox always greyed
> out." I shipped six progressive code fixes (`ee4b60b` →
> `da693c7` → `05dbd2a` → `02ddf0b` → `b7d5932`) chasing speculation:
> type=password→text, redundant addEventListeners, code-is-gate (not
> checkbox), standalone fast-path (no roster required), tolerant
> matching across all 3 fields, dedicated "Sign in as teacher" button.
> When I finally asked for diagnostic output, the console said
> `match: (none)` — teacher was typing **"googly231"** instead of
> **"google231"** (`googL`y vs `google`). A typo. Every UI change was
> wasted motion. **Reverted to v4 checkbox UX** (`b7d5932`); kept the
> defensive scaffolding (tolerant matching, makeMeTeacher fallback,
> type=text, console diagnostics).
>
> Lesson saved to memory as `feedback_diagnostic_first.md`:
> when a user says "X doesn't work" twice in a row, **STOP coding and
> ask for diagnostic data** (console output, what's being typed,
> screenshot). One round of inspection beats N rounds of speculation.
>
> ## ✅ Teacher+student combo signin + Do Now nudge text (`31f5195`)
>
> Bug: teacher signing in with username+password+code got
> `role=teacher` but no roster token → Do Now card showed "Sign in"
> nudge because /donow couldn't authenticate. Fix: fast-path
> early-return ONLY when credentials are empty (standalone teacher
> mode); else fall through to roster signin AND set teacher flag in
> the post-signin block (which now uses the same tolerant v4 matching
> across all 3 fields). Also: Do Now nudge text "Student ▸ Gradebook"
> updated to "User ▸ Sign In" to match the renamed menu. Welcome
> dialog now reads "Signed in as X (teacher mode)" when role is set.
>
> ## ✅ Sign-in username dropdown — TWO layers
>
> - **Local history** (`da866ca`): native `<datalist>` backed by
>   `localStorage.apstats_desk_known_users` (cap 20, dedup case-
>   insensitively, most-recent-first, skip synthetic
>   `teacher@desk.local`). Each successful sign-in remembers the
>   username on THAT device.
> - **Server-backed roster picker** (`242c34f`): NEW public endpoint
>   `GET /roster/section/:section` on roster-server (no auth; no
>   password info — pinned by tests). Custom dropdown below the
>   username input opens on focus/click; shows every classmate in the
>   current period (B or E) sorted by real name; type to filter on
>   either real name OR username; click a row → fills username, focuses
>   password. 1h localStorage TTL; outside-click + Escape close.
>   Solves "students remember their name but not their username."
>
> Combined: a student opens the modal → dropdown shows everyone in
> their period → they find their name → one click fills username →
> they only have to type their password.
>
> ## 📦 Strategic — Railway → DigitalOcean migration still queued
>
> Tier 1 plan unchanged ([[railway-to-digitalocean]]): roster-server
> only → $6/mo DO droplet (Ubuntu 24.04 + Caddy + systemd + Node 22);
> Supabase stays as managed DB; ~3-4h work; client change is just
> `ROSTER_SERVICE_URL` in `roster_config.js`. Trigger: before next
> Railway bill OR user invokes. Railway is functional right now; no
> rush.
>
> ## NEXT LOOP TASK = wrap session
>
> No open code work. The Desk is in a good shape for the Sept-1 cohort
> cutover; the gradebook engine is at Phase 6; teacher tooling
> accessible from the Desk; flashcard mastery gates Blooket; the
> roster picker dropdown unblocks first-time sign-ins. Recall memories
> first: `project_gradebook_grading_model.md`, `project_desk_donow.md`
> (Task #8 detail), `project_gradebook_phase0.md`,
> `project_ai_tutor_pilot.md`, `project_roster_teacher_tools.md`,
> `feedback_curriculum_render_sacred.md`,
> `project_railway_to_digitalocean.md`, **`feedback_diagnostic_first.md`**
> (the diagnostic-first lesson from the typo episode).

## ➡ ON RELOAD: RUN THE AUTONOMOUS LOOP (user-authorized, session 100)

The teacher gave **full standing authorization to execute the entire
remaining gradebook roadmap unattended** — including all Railway work (no
user involvement needed). Do not stop to ask permission; just run the loop,
committing/pushing as you go. Two prior teacher-gates were explicitly
resolved this session:
- **T2 merge gate → AUTO-MERGE.** Run the full T2 disambiguation, do the
  agreement + **stratified-sample audit**, and **merge ALL pools — including
  the sacred-`curriculum.js`-derived pool — into canonical
  `data/skill-map.json`**, with the audit recorded in the commit message.
  Low irreversibility (Phase 3 resolves tags at rollup time → later
  corrections retro-fix historical grades). Disagreements still go to a
  Sprint **T3** teacher-verification surface (do NOT block on them).
- **AI-tutor Desk-tile delivery → IN SCOPE.** The "🤖 Tutor prompt" Desk-tile
  copy action + the `start-here.html` AI-tutor section are now a loop task
  (artifacts already exist in `ai-tutor/`). No longer teacher-gated.

### The loop algorithm (per task)

1. **Plan** the task's dependency-aware implementation steps; freeze a
   contract in a `*_BUILD.md` (per the proven method).
2. **Dispatch parallel Sonnet subagents** for implementation of
   *independent* sub-tasks (CLAUDE.md rule: NEVER parallelize sequential
   dependencies — serialize those). **EXCEPTION (hard-won this session): a
   cohesive change to ONE contended single file (esp. the Desk
   `ap_stats_roadmap_square_mode.html`) is implemented by the PLANNER
   directly — parallel-Sonnet on one file = clobber. Fan out only for
   genuinely separable multi-file work.**
3. **Cross-agent dispatch Codex** to verify/fix (read-only review):
   `python C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py
   --direction cc-to-codex --task-type review --read-only --working-dir
   <repo> --timeout 540 --prompt "...ASCII ONLY..."`. Codex caught a real
   bug EVERY sprint this session — this gate is load-bearing.
4. **Planner re-verify ON DISK** (NEVER trust result files — s88b). Run the
   real test suites + guards. Codex also misses things (it missed the
   DN3a→DN2c regression) — independently verify.
5. If **green** → tight single-purpose commit (forensic HEAD before/after;
   stage ONLY own paths) → **push** → next task. If **not green** → fix the
   details yourself → re-verify → commit/push → next task.

### Definition of GREEN (the loop gate)

GREEN = no NEW failures beyond the two known pre-existing unrelated ones,
and all relevant guards pass:
- follow-alongs root suite: exactly **1** fail = `tests/study-guide.test.js`
  "v3 structure / loads railway, curriculum, units, frameworks"
  (`study_guide_diagnostic.html` is NOT touched — do NOT "fix" it).
- curriculum_render suite: exactly **1** fail = `tests/redox-chat.test.js`
  `max_tokens` (chat/server not touched).
- Guards: `node scripts/audit-feeder-ids.mjs` → CLEAN 69 / MISMATCH 0;
  the new sprint's test file passes; `roster-server` 80/80 if touched;
  Desk/cr `index.html` stay **LF**.

### Ordered task backlog (dependency-aware — do in order)

1. **T2 full disambiguation run — ✅ DONE & PUSHED (`1565fd5` tooling +
   `4140afe` data/merge).** 2412/2593 `ai-constrained` (93.0%), 0 violations,
   merged into canonical `data/skill-map.json`; audit verdict NOT READY →
   **CONDITIONAL**; 181 → Sprint T3 (`GRADEBOOK_TAGGING_T3_QUEUE.md` +
   `data/skill-map.review-queue.json`). 2 Codex reviews → 7 fixes. roster
   redeploy was a verified no-op (T2 = provenance-only; manifest semantically
   identical). Sprint T3 (teacher spot-review of the certifier pool +
   disagreement queue) is a FUTURE tagging sprint, NOT a loop blocker. Do NOT
   re-run T2. Build doc `GRADEBOOK_TAGGING_T2_FULLRUN_BUILD.md`.
2. **Phase 2 — cr-quiz GRADE-feeder rollup — ✅ DONE & PROD-VERIFIED
   (`00e7a6c`).** `scripts/build-answer-key.mjs` (READ-ONLY, 782 MCQ keys,
   sacred clean, dual-write bundled) + roster-server `GET /rollup` (additive;
   scores `curriculum_quiz` rows vs bundled key, per-unit %; PC excluded =
   Phase-3 `P`). Codex 1 MAJOR + 1 MINOR fixed. roster-server 114/114; live
   `/rollup` smoke on roster-production ALL PASS (co-deployed by TR1's
   `railway up`). Build doc `GRADEBOOK_PHASE2_BUILD.md`.
3. **Phase 3 — grade calc + diagnostic BKT — ✅ DONE & PUSHED & PROD-VERIFIED
   (`801dccc`).** Additive roster-server `GET /grade`
   (`unitGrade=max(min(B,85),P)`; B=weighted mean over PRESENT feeders
   renormalized W:Q=1:2; AI-FRQ E/P/I=100/70/35; worksheet fill-ins
   completion-only — no score recorded; Q vs bundled answer-key; P=per-quarter
   2-anchor piecewise curve over PC raw%, only-raises, no-PC⇒0; quarterGrade
   =mean of GRADED band units, ungraded EXCLUDED not 0; separate completion
   readout) + `GET /mastery` (BKT diagnostic, `lib/bkt.js` reused AS-IS via
   byte-identical bundled `roster-server/bkt.js`, FULL chronological retry-
   stream fold, weak-skill pKnow<θ=0.65, unresolved excluded). ALL knobs in
   one pilot-tunable `roster-server/grade-config.js`. Shared
   `roster-server/scoring.js` (rollup refactored to reuse → single source;
   provably cr-id-equivalent — Codex-confirmed 453-id corpus). Bundled
   `roster-server/data/skill-map.json` + `build-skill-map.mjs` dual-write.
   NO migration; read-only w.r.t. item_ledger; additive+guarded server.js.
   Codex review = **1 BLOCKER + 3 MAJOR + 1 MINOR, ALL fixed** (BLOCKER:
   eager bkt bootstrap could down the live auth service → fault-tolerant
   degrade-to-no-/mastery; MAJORs: full-stream fold, answer-key+skill-map
   fail-closed per-entry uniformly across /rollup/grade/mastery; MINOR:
   weak-skill raw-posterior). Planner self-found `Number(null)===0`
   ungraded-FRQ miscount → nullish guard. GREEN: roster-server **157/157**
   (no Phase-0/1/donow/rollup/TR regression); root 1576/1 (the 1 = known
   study-guide.test.js, untouched); audit-feeder-ids CLEAN 69. SACRED
   curriculum.js untouched. Redeployed (`railway up --ci -s roster`,
   Deploy complete) + **live SMOKETEST smoke on roster-production ALL PASS**
   (/health ok; /grade U1 W=100/Q=50/B=66.7/unitGrade=66.7 exactly as
   hand-computed; /mastery θ=0.65, 2 obs→skill 3.A via bundled skill-map).
   Build doc `GRADEBOOK_PHASE3_BUILD.md` (§5 = planner-frozen impl contract).
   Do NOT rebuild Phase 3.
4. **Phase 4a — teacher dashboard + `start-here.html` student render —
   ✅ DONE & PROD-VERIFIED (`d68e98b` + hotfix `13cb326`).** Additive
   teacher-gated `GET /class/grades` + `GET /class/mastery` (fan-out via
   extracted pure `computeGrade`/`computeMastery` — single source — + class
   skill heatmap `{skill:{weak,total,pctWeak}}`); NEW `teacher-dashboard.html`
   (auth bar + sticky-header class grade table + heatmap tile grid +
   weak-skill triage; x-teacher-secret NEVER persisted; read-only); diff to
   `start-here.html` adding ONE "Where you stand" section with cumulative
   live `/grade` render + jargon-ban guard test (NO BKT/θ/pKnow/probability/
   posterior/Bayesian/weak-skill vocab). Codex review = 0 BLOCKER + 1 MAJOR
   + 2 MINOR all folded. **Planner+smoke-found hotfix:** TR-era
   `db.listRoster` projection omitted `student_id` (teacher console UI did
   not need it) → class fan-out got `undefined` sids → empty units in prod
   despite tests green (fakes had student_id; only prod diverged). Added it
   to the SELECT — invisible to /roster/list which maps to a UI object that
   drops it. **Phase 4b (remediation_assignment write loop + re-check
   gating) is DEFERRED** to its own frozen contract per build-doc rationale
   — needs a NEW curriculum_render Supabase table = user-gated migration,
   mirroring how Phase 0/1 split on DB migrations. roster-server full suite
   **169/169** post Phase 4a (Phase-3 53 still pin the extracted pure fns +
   11 new class tests). Live SMOKETEST smoke on roster-production ALL PASS:
   /class/grades 401-gate; banana_otter U1 W=100 Q=50 B=66.7 unitGrade=66.7
   exact; /class/mastery heatmap `3.A: weak=2/2 pctWeak=100` (single-obs
   BKT-skeptical, as expected). Build doc `GRADEBOOK_PHASE4_BUILD.md` §5 =
   guardrails; do NOT rebuild Phase 4a.
5. **Phase 5 — §6.4 adoption + AI-tutor Desk-tile delivery — ✅ DONE &
   PUSHED (`e592d1b`).** Three deliverables. (1) Desk
   `ap_stats_roadmap_square_mode.html` — `copyTutorPrompt(unit, lesson)`
   async helper + per-lesson "🤖 Tutor prompt — copy to clipboard" button
   inside `showResourcePanel` after worksheet/quiz/blooket links; uses
   `navigator.clipboard.writeText` with a textarea `execCommand` fallback;
   soft-fails on 404 / permission error; XSS-safe via regex-captured
   `(\d+).(\d+)` groups from `inf.t` (raw `inf.t` never reaches the onclick
   string). Lesson topic only — PC tile wiring deferred to Phase 5.1 (PC
   topic-id shape not obviously regular; 9 unit-PC artifacts remain in
   `ai-tutor/` ready to wire). (2) `start-here.html` — new "Your AI tutor
   (per lesson)" `.tool` card added to existing toolkit section (Sonnet
   parallel — genuinely independent file); explains the copy mechanic in
   jargon-banned language. (3) `study_guide_diagnostic.html` — 3 sibling
   scripts (`roster_config.js` + `roster-client.js` +
   `gradebook-client.js`) loaded; `student_id` (via
   `window.rosterClient.studentId()` || null) stamped on BOTH
   `/api/ai/grade` bodies; fire-and-forget
   `gradebookClient.record({source:'frq_studyguide', ...})` on the
   graded-FRQ success path ONLY (focus-synthesis is non-graded — no record
   call, prevents item_ledger pollution). All wrapped in try/catch +
   `.catch(() => {})` per L-D ethos; never throws / blocks. Plus
   `tests/phase5-structure.test.js` (26/26 — Desk button + helper +
   try/catch + XSS regex; start-here jargon-ban + position; study guide
   script order + both call sites stamp + record wrapped + non-graded
   does NOT record; **exact 75-file ai-tutor inventory** + **topic-aware
   header marker**). **Codex review = 0 BLOCKER + 2 MAJOR + 1 MINOR all
   folded** (test too weak on safety contract; inventory was count-only;
   Desk button label missing "— copy to clipboard" suffix). **NO
   roster-server change / NO redeploy / NO `curriculum.js` touch.** GREEN:
   root **1619/1620** (only known pre-existing study-guide.test.js fail —
   unchanged; do NOT fix); roster-server **169/169** (untouched);
   audit-feeder-ids CLEAN 69; all touched files LF/UTF-8 preserved;
   stage-own-paths discipline held (5 files only). Build doc
   `GRADEBOOK_PHASE5_BUILD.md` §1–§7. Do NOT rebuild Phase 5.
6. **Phase 4b — remediation_assignment write loop — ✅ CODE-COMPLETE &
   PUSHED (`5a46f19`).** Built per the frozen `GRADEBOOK_PHASE4B_BUILD.md`
   §1-§7. Nine files: `roster-server/migrations/0004_remediation_assignment.sql`
   (USER-runs in curriculum_render Supabase to provision the new table —
   columns: assignment_id/student_id→roster on-delete-cascade/unit/skill/
   source_attempt/assigned_refs jsonb/status check IN (proposed|assigned|
   completed|waived)/proposed_by/approved_by/assigned_at/completed_at/
   completed_score/recheck_item_id/unlocks/notes/created_at; 4 indexes;
   RLS-no-policies — same posture as 0001/0002); `roster-server/
   remediation-db.js` (live + injectable wrapper, 6 helpers — section
   list uses Supabase `roster:student_id!inner` fk-inner-join, a left-
   join would silently no-op the section filter — Codex MAJOR-1 fold);
   `roster-server/remediation.js` (8 routes wrapped in `safeAsync` so
   Express-4 promise-rejections become 500/503 instead of unhandled —
   Codex MAJOR-2 fold; status transitions proposed→assigned→completed
   + waive side-exit + 409 on illegal transitions; retake gate
   `/unlocks` = unlocked iff zero 'assigned' rows remain for (student,
   skill) per spec §6; `/complete` accepts EITHER student token OR
   teacher secret with 403-on-cross-student only on the token branch;
   `/propose-from-mastery` reuses Phase-3 `computeMastery` + bundled
   answer-key/skill-map/BKT, idempotent skip-existing + dryRun);
   `roster-server/server.js` (additive mount + fault-tolerant
   `createLiveRemediationDb` mirroring Phase-3 BKT bootstrap);
   `roster-server/tests/remediation.test.js` (NEW, 50 cases — 42P01→503
   pinned on ALL 8 endpoints, Codex MAJOR-3 fold; section-filter test
   actually stamps __rosterMeta, Codex MAJOR-4 fold); `teacher-
   dashboard.html` (NEW Remediation panel: propose-from-mastery + dry-
   run + Refresh buttons — Codex MINOR-1 fold, status-colored badges,
   per-row Approve/Complete/Waive; migration-pending 503 surfaces as
   inline message naming 0004; Phase-4a security posture preserved);
   `tests/phase4-structure.test.js` (read-only guard rewritten to scan
   postJson call sites — Codex MINOR-2 fold for dead-var); `tests/
   phase4b-structure.test.js` (NEW, 16 cases). **Codex review = 0
   BLOCKER + 4 MAJOR + 2 MINOR ALL FOLDED.** GREEN: roster-server
   **219/219** (was 169 → +50 new, no regression); follow-alongs root
   1635/1636 (1 known fail); audit-feeder-ids CLEAN 69; LF preserved.
   **⚠ DEPLOY BLOCKED**: Railway OAuth backend was 503 at deploy time
   AND existing roster-production URL returned "Application not found"
   404 — appears to be a wider Railway issue; needs user `railway login`
   refresh + service-status check. **⚠ USER-OWNED Supabase step**: run
   `0004_remediation_assignment.sql` in curriculum_render SQL editor to
   provision the new table. Until BOTH done, /remediation/* returns 503
   "remediation table not yet provisioned" in prod (after redeploy);
   the rest of the service is unaffected.
8. **DESK_MODAL_POLISH — Done-button latch + keyboard shortcuts — ✅
   DONE & PUSHED (`63d8559`, 2026-05-20).** Two prongs shipped in
   `ap_stats_roadmap_square_mode.html`'s `showResourcePanel` modal.
   **PRONG A:** quiz `prompt()` replaced with inline `Score: <input>
   [Save] [Cancel]` form inside `span.desk-quiz-done-slot`; optimistic
   `✓ Saved` button mutation BEFORE the await recordProgress; Enter
   submits, Escape cancels (with stopPropagation so modal ESC handler
   doesn't fire). **PRONG B:** modal-scoped keydown listener attached
   on open / detached on close; letters a-h jump+open primary link
   (link-less rows click first button); numbers 1-3 act on focused
   row (1=primary, 2=alt-video no-op if absent, 3=Done subject to
   visit-gate); `[letter]` and `[number]` badges decorate each row;
   focused-row outline; active-element guard
   (INPUT/TEXTAREA/SELECT/isContentEditable) + modifier guard
   (ctrl/meta/alt) + display-block guard. **Codex review = 0 BLOCKER +
   2 MAJOR + 4 MINOR ALL FOLDED.** MAJOR-1: blank input → `Number('')`
   ===0 silent zero-score write → trim+empty-string check before
   `Number()` coercion (pin 18). MAJOR-2: `_focusedLetter` was
   closure-level → 120ms `recordLinkVisit` re-render reset focus →
   moved to module scope; `_attachResourcePanelKeyHandler` reads +
   re-applies saved focus on re-attach (fallback to 'a' if saved
   letter no longer maps); `closeResourcePanel` resets to 'a' (pins
   19, 20). Removed the hardcoded "default focus = first row" from
   `_decorateResourceRows` IIFE so it doesn't clobber persisted state.
   Tests: `tests/desk-modal-polish.test.js` **20/20** (17 BUILD pins
   + 3 Codex MAJOR folds). Root **1672/1673** (only known unrelated
   `study-guide.test.js` fail, +3 from prior 1669/1670 baseline).
   `phase5-structure` 32/32 unchanged. `desk-roster-signin` 44/44
   unchanged. `audit-feeder-ids` CLEAN 69. EOL LF preserved.
   Playwright headless smoke validated dynamic behaviors: badges
   render after panel open; ESC closes + detaches listener; letter
   'a' opens AP Classroom URL in new tab; active-element +
   modifier guards work; **focus persists on row 'b' after 120ms
   re-render**; `closeResourcePanel` resets `_focusedLetter`='a';
   quiz Done click swaps to inline form; Enter submits; **blank +
   whitespace input both rejected via showDialog**; localStorage gets
   typed score on Save; Cancel restores bare Done button.
   NO server change; NO migration; NO auto-deploy trigger. Build doc:
   `DESK_MODAL_POLISH_BUILD.md` (§1-§8, frozen contract).

   **DEPRECATED TASK-#8-OPEN spec (kept here for provenance only — DO
   NOT RE-RUN):** Two prongs in
   `ap_stats_roadmap_square_mode.html`'s `showResourcePanel` modal:

   **PRONG A — Done button immediate visual feedback.** Teacher symptom
   (verbatim 2026-05-20): "[the Done] button is clicked, it doesn't
   immediately hold the pressed state, only once you click 'okay' and
   then reclick the square does it show 'done'." The "okay" the teacher
   dismissed is almost certainly the native `prompt('Score (0-100)?')`
   inside `studentMark()` for `artifact === 'quiz'` (line ~5413 area).
   Even on non-quiz paths the latch may feel delayed — the panel
   re-render is supposed to be synchronous after `recordProgress`
   returns true (see the prior commit `540d168` for the localStorage-
   first refactor) but the UI tick may not be perceived as immediate.

   **Fix design (sub-agent decides exact mechanism; this is a guidance,
   not a contract):**
   - A1. Replace the native `prompt()` for quiz score with an **inline
     score input** rendered IN the resource panel (e.g., a `<input
     type="number" min="0" max="100">` + a small "Save" button that
     replaces the bare "✓ Done" button on click). No native dialog
     interrupts the visual flow.
   - A2. Make the latch **optimistic**: in `studentMark()`, BEFORE the
     async `recordProgress()` call, DOM-mutate the button to its saved
     state directly (`btn.disabled = true; btn.textContent = '✓ Saved';
     btn.style.opacity = '0.6'`). The async work then either confirms
     (no-op) or — if a future refactor adds a failure rollback —
     reverts. Combined with the localStorage-first refactor, this
     guarantees the saved state is visible the moment the click
     completes.
   - A3. After the async work, the existing `showResourcePanel()`
     re-render still fires — but it now sees the localStorage-saved
     state and re-renders the disabled "✓ Saved" button identically.
     Zero flicker.

   **Acceptance for prong A:**
   - Click Done on a WORKSHEET row → button immediately says "✓ Saved"
     (disabled, opacity 0.6), no flicker, no modal interruption.
   - Click Done on a QUIZ row → inline score input appears in the
     panel (NOT a native prompt). Type a score, hit Enter or click
     Save → button immediately says "✓ Saved" with the score recorded.
   - Saved state persists across modal close/re-open AND across page
     reload (localStorage is source of truth — already true per
     `540d168`).
   - The visit-gate latch (the 5-min countdown from `540d168`) still
     works: Done stays disabled until the gate elapses, regardless of
     this prong's UI changes.

   **PRONG B — Keyboard shortcuts in the resource modal.** Teacher spec
   (verbatim): "a, b, c, d, e, f, g..for example..to go to that link/etc
   ..and 1, 2, 3, 4 to select either the ap classroom video link, or the
   alt video link, or the done button.. depending on context."

   **Design proposal (sub-agent refines):**
   - **Letter keys (a–h)** = jump-to-row. Each rendered `<div
     style="margin:3px 0">` in the resource panel is assigned a
     sequential letter at render time (a = first row, b = second, ...,
     up to h or however many rows exist). A small `[a]` / `[b]` /
     etc. badge sits at the left of each row. Pressing a letter
     **opens the row's primary link in a new tab** (same as the
     teacher would clicking it manually) AND fires the existing
     `recordLinkVisit()` so the visit-gate counter starts.
   - **Number keys (1–4)** = within-row context actions on the
     **currently-focused row** (where "focused" = the most recent
     letter-press OR mouse hover, whichever is later). The mapping:
       1 = primary link (AP Classroom video, or worksheet, etc.)
       2 = secondary link if the row has one (Drive alt video for
           Video rows; otherwise no-op or repeat 1)
       3 = Done button (if enabled per the visit-gate; otherwise
           triggers the same dialog the teacher would see with an
           unready Done click — "open the link first" or "wait Xm")
       4 = (reserved — sub-agent may map to "open in this tab"
           rather than new tab, or omit)
   - Visual indicator: each row carries the letter badge at its
     left edge; the focused row gets a subtle outline (e.g.
     `box-shadow: inset 0 0 0 2px var(--accent)` or similar — match
     System 7 aesthetic). Number-key targets within the row get
     small `[1]` / `[2]` / `[3]` badges at the right edge of their
     respective controls.
   - **Modal-scoped only**: the keydown listener is attached when
     the resource modal opens, removed when it closes. NEVER fires
     when the modal is hidden. NEVER fires when the user is typing
     in an input (check `document.activeElement.tagName !==
     'INPUT'`/`'TEXTAREA'`). ESC closes the modal (already wired in
     the existing close handler — verify still works).
   - Letter / number key handling is **case-insensitive** and ignores
     modifier-key combos (Ctrl+A should still select all text; only
     unmodified single-key presses trigger).

   **Acceptance for prong B:**
   - Open any day with a worksheet — see letter badges (a, b, c, ...)
     at the left of each row, and number badges (1, 2, 3) at the
     right of any row with multiple actions.
   - Press 'a' on the keyboard → first row's primary link opens in a
     new tab AND the visit-counter starts AND the row gets a focus
     outline.
   - With a row focused, press '3' → its Done button fires (subject
     to the visit-gate from `540d168`).
   - Press ESC → modal closes; keydown listener detaches; subsequent
     keyboard input on the Desk page has no surprise side-effects.
   - Typing in any future inline score input (prong A1) → letter/
     number shortcuts DO NOT fire (active element check protects).

   **EXECUTION DISCIPLINE (teacher-specified for this task, 2026-05-20):**
   This is the protocol the next loop run MUST follow on reload — the
   teacher gave standing authorization for this entire sequence to run
   unattended:

   1. **Freeze a small `DESK_MODAL_POLISH_BUILD.md`** first (loop step 1
      — proven method). 1-2 pages: scope, contract for the inline-score
      input shape, the letter/number key map decided by the sub-agent,
      acceptance test list, GREEN gate.
   2. **Dispatch ONE Sonnet sub-agent** to implement both prongs.
      RATIONALE for ONE not multiple: both prongs touch a SINGLE
      contended file (`ap_stats_roadmap_square_mode.html`) → parallel-
      Sonnet on one file = clobber (the standing s100 rule). The Sonnet
      prompt includes the full prong-A and prong-B specs above + a
      command to write the changes + run the relevant tests + report
      diff stats.
   3. **Planner re-verify on disk** (s88b — NEVER trust the result
      file): root `npx vitest run` + `node scripts/audit-feeder-ids.mjs`
      + manual smoke against `http://localhost:8000/ap_stats_roadmap_
      square_mode.html` against the local roster-server on `:8091`.
      Check: worksheet Done → "✓ Saved" instantly; quiz Done → inline
      score input appears; ESC closes; letter keys open links; ESC
      detaches listener.
   4. **Cross-dispatch Codex read-only review** (detached PowerShell via
      `Start-Process -WindowStyle Hidden`, same pattern as Phase 4b /
      Phase 5.1). The Codex prompt covers: prong-A correctness (no
      native dialogs left, optimistic latch DOES write localStorage
      first, no race where async failure leaves saved state without a
      ledger row), prong-B correctness (listener attached on modal open
      / detached on close, active-element check protects inputs, ESC
      still works, badge selectors are XSS-safe, letter/number keys
      ignore modifiers), test coverage (acceptance items above are
      pinned by automated assertions where possible — at minimum a
      structure-style test that key handlers exist + the badges
      render). ASCII-only prompt; parse `state/cross-agent/<id>
      .result.json` findings, NEVER the wrapper.
   5. **Fix any Codex BLOCKER/MAJOR/MINOR findings yourself** (planner-
      direct on the contended file). Re-run tests after every fix.
   6. **Final planner pass:** all root tests green (only the known
      study-guide.test.js fail), all structure tests green, audit-
      feeder-ids CLEAN 69, EOL LF preserved on the Desk file.
   7. **Commit + push** with a tight single-purpose message. Per the
      auto-deploy config, the push will NOT trigger a roster-server
      redeploy (Desk file isn't under `roster-server/`) — that's
      correct, this task touches no server code.
   8. **Update memory + CONTINUATION_PROMPT.md** marking Task #8 DONE
      with the commit SHA.

   **Out of scope (explicit non-goals):**
   - No changes to the gradebookClient feeder behavior, the ledger
     schema, or `recordProgress`'s async path beyond what prong A
     needs (optimistic UI mutation only).
   - No changes to other modals or surfaces — the resource modal in
     `showResourcePanel` only.
   - No new server endpoints, no migration, no auto-deploy trigger.
   - The visit-gate (5-min countdown from `540d168`) stays unchanged.
   - Letter-key conflicts with the browser's own shortcuts (Ctrl-W,
     etc.) — leave the browser's defaults intact; only handle
     UNMODIFIED single-letter / single-digit presses.

   **Recall on reload:** `feedback_curriculum_render_sacred.md`,
   `project_gradebook_grading_model.md` (for the Desk-file ownership
   protocol — gradebook session owns this file, AI-tutor lane defers).
   This task is independent of Railway state; safe to run whether
   Railway is up or down.

7. **Phase 5.1 — PC-tile AI-tutor wiring — ✅ DONE & PUSHED (`66faaf1`).**
   Survey found PCs aren't standalone tiles in the Desk schedule —
   they appear as string mentions ("U6 PC", "U7 PC") in the due/
   assigned columns on the unit's last lesson day. So the design:
   render a SECOND button alongside each lesson tile's tutor button.
   Two deltas in `ap_stats_roadmap_square_mode.html`:
   (a) `showResourcePanel`'s `if (_aitm)` lesson-regex branch now
   renders both buttons (lesson first, PC second), where the PC
   button's onclick passes ONLY `_aitm[1]` (the unit) to a new
   `copyTutorPromptPc(unit)` helper. (b) Refactor: the shared
   clipboard/fetch/textarea-fallback/soft-fail logic moved into a
   private `_copyTutorPromptByPath(path, statusElId)` helper —
   `copyTutorPrompt` and `copyTutorPromptPc` are 3-line delegates so
   the Phase-5 soft-fail contract has a single source of truth.
   Distinct status spans (`#ai-tutor-status` vs `#ai-tutor-pc-status`)
   so messages don't clobber. tests/phase5-structure.test.js extended
   to **31/31**: thin-delegate body check (extracts wrapper bodies +
   asserts <250 chars + exactly 1 delegate call + forbids inlined
   clipboard/fetch/execCommand); PC-button-branch position pin (must
   be inside `if (_aitm)`, AFTER the lesson button); onclick-takes-
   only-_aitm[1] XSS pin. **Codex review = 0 BLOCKER + 0 MAJOR + 2
   MINOR ALL FOLDED** (both test-coverage tightening — code itself
   was correct). All 75 ai-tutor artifacts (66 lesson + 9 PC) are
   now reachable from the Desk. NO roster-server change. NO redeploy.
   GREEN: root **1640/1641** (only known unrelated study-guide fail);
   roster-server 219/219 (untouched); audit CLEAN 69; LF preserved.

### Carry-forward gotchas (hard-won — obey these)

- **SACRED:** never write `curriculum_render/data/curriculum.js`. Supplements
  → follow-alongs `data/formula-probe-supplement.js` (`U{N}-L{N}-QS{N}` ns).
- **typeof-guard cross-sprint calls:** adding a call to a later-sprint
  function inside an earlier sprint's tested function breaks that sprint's
  `vm` test — wrap as `if (typeof fn === 'function') fn()`.
- **Codex cross-agent:** ASCII-only prompts (`§`/`→`/em-dash → cp1252 0x97
  crash). The runner echoes the whole prompt (~1.3MB) and writes the verdict
  to `state/cross-agent/<id>.result.json` and/or the transcript tail —
  parse THAT, never the wrapper `summary`/`files_changed`.
- **EOL:** Desk + cr `index.html` are LF; ~30 older U1–U3 / some U8–U9
  worksheets are CRLF — bulk edits MUST be EOL-preserving.
- **cr-repo** (`C:/Users/rober/Downloads/Projects/school/curriculum_render`,
  GH `curriculum_render`, branch `main`) has unrelated pre-existing dirty
  files (AGENTS.md/CLAUDE.md/.claude/fix_justin/scripts/state/tmpclaude*) —
  stage ONLY own paths. Its commits do NOT republish follow-alongs Pages.
- **Railway** (no user needed): `cd roster-server && railway up --ci -s
  roster` (project `apstats-roster`/env production; already linked + authed
  as bobby; secrets incl. `ROSTER_TEACHER_SECRET`/`ROSTER_PROCTOR_SECRET` in
  gitignored `roster-server/.env`). Redeploy after ANY roster-server change;
  smoke-test `/health` + the changed endpoint with a `SMOKETEST`-section
  account (cleaned by the standing `delete from roster where
  section='SMOKETEST';` chore).
- **Memory:** keep `project_gradebook_grading_model.md`,
  `project_gradebook_phase0.md`, `project_desk_donow.md`,
  `project_roster_teacher_tools.md`, `MEMORY.md` current as phases land
  (condense — MEMORY.md lines are hooks, not content).
- **🔒 ROSTER-SERVER: TR contention RELEASED; still additive-only +
  stage-own-paths.** The concurrent TR/teacher-roster-tools session is
  **DONE & deployed** (all TR0–TR4 committed `92a0f46`+`13c7026`; TR1
  live in prod, `ROSTER_PW_ENC_KEY` set, 8-pt smoke pass; Phase-2 `/rollup`
  co-deployed by that `railway up`). No active concurrent roster-server
  editor now. BUT: roster-server is the LIVE auth service (Phase-0/1/donow/
  rollup/TR all depend on it) — Phase-3 endpoints must be **additive only**,
  full roster-server regression before any redeploy, and **stage ONLY
  explicit own paths** (the shared tree carries other sessions' history;
  never `git add -A`). The 6-commit interleave proved this discipline holds.
  ⚠ **Pending USER chore (do NOT run — user-owned Supabase SQL):**
  `delete from roster where section='SMOKETEST';` (clears TR + Phase-2 +
  any Phase-3 smoke rows; cascades to item_ledger).
- **Long unattended Codex runs MUST be detached** (`powershell.exe
  Start-Process -WindowStyle Hidden -RedirectStandardOutput ...`). A
  harness-tracked background Bash task is KILLED on session suspend/resume
  (lost 2 T2 runs that way). Watch via ONE bg watcher that exits on
  terminal state (success/fatal/stalled). The cross-agent runner echo can
  trigger the same; `state/cross-agent/<id>.result.json` may be a wrapper
  fallback ("did not write a result file") with `files_changed` = an mtime
  snapshot polluted by concurrent runs — read the actual verdict from the
  transcript-tail / `notes` field, never the wrapper.
- **Concurrent AI-tutor session is idle/done** (`9207d24`).

### Current shipped state (the cold-reload baseline)

- **follow-alongs `master` HEAD `242c34f`** (server-backed roster
  picker dropdown). Lineage (most-recent first):
  `242c34f` roster picker server endpoint + searchable client dropdown
  ← `da866ca` local datalist autocomplete ← `31f5195` teacher+student
  combo signin + Do Now nudge text fix
  ← `b7d5932` revert to checkbox UX (the typo episode end)
  ← `02ddf0b` → `05dbd2a` → `da693c7` → `ee4b60b` (4 wasted iterations
  on teacher signin UX, kept for provenance)
  ← `db4fe30` flashcard progress save+resume + user-role gating +
  teacher checkbox ← `3160606` Teacher menu ← `a24bacc` Blooket
  flashcard verification + 15-min gate ← `ee38ca9` Blooket inline
  %-correct prompt (later removed) + date-aware AP Classroom video
  links ← `aaa7ca0` Phase 6 v2 (ahead-of-schedule + strip keyboard
  nav) ← `368ff11` Phase 6 hotfix (gradingWindowStart filter) ←
  `7f93ab1` Phase 6 base (lesson-weighted date-driven quarterGrade +
  per-day click-through) ← `381a442` keyboard rework + grade outlook
  strip ← `3de5fd1` Phase 4b live docs ← `ccbf75f` (docs queue —
  was previous baseline) ← `63d8559` Task #8 ← (earlier lineage
  preserved in prior provenance below). Linear, local==origin.
- **curriculum_render `main` HEAD `1ccd8a2`** (DN2d; sacred `curriculum.js`
  untouched — never re-touched; Phase-2/3/4/6 only READ it).
- **roster-server PROD STATE: LIVE** (`https://roster-production-12c1.up.railway.app`;
  project `apstats-roster`; svc `roster`). Last successful deploy =
  `f6305703` (2026-05-20 15:24 UTC) for Phase 4b. NEW endpoints since
  then need a redeploy: Phase 6 (`/grade` lesson-level + lessons[]
  + `/class/grades` schedule), Phase 6 hotfix (gradingWindowStart),
  Phase 6 v2 (no roster-server change — client-only), and the
  roster picker (`/roster/section/:section`). The auto-deploy on
  `roster-server/**` watch path should have fired on each Phase 6
  commit. **VERIFY:** `curl https://roster-production-12c1.up.railway.app/roster/section/PeriodB`
  should return `{ok:true, section:"PeriodB", students:[...]}` —
  if 404, the auto-deploy hasn't landed yet (wait ~3 min after
  the last roster-server push or trigger a manual redeploy).
  Health endpoint always works; the question is whether the NEW
  endpoints from Phase 6 + roster picker are live.
- **Concurrent TR session: DONE & deployed** (TR0–TR4 committed + live;
  `ROSTER_PW_ENC_KEY` set; reversible AES-256-GCM, bcrypt sole auth). Idle.
- **Concurrent AI-tutor session: idle/done** (`9207d24`); its artifacts in
  `ai-tutor/u{U}_l{L}.md` are the source for the Phase-5 Desk-tile prompt.
- Test baseline (post-`242c34f`): follow-alongs root **1769/1770**
  (only the same known unrelated study-guide.test.js fail; +97 from the
  `63d8559` Task-#8 baseline of 1672/1673 across all the Phase 6 +
  Desk polish + roster picker work). roster-server **280/280**
  (was 223 → +57 from Phase 6 + Phase 6 v2 + hotfix + the new public
  `/roster/section/:section` endpoint). `audit-feeder-ids` CLEAN 69;
  phase4-structure 17/17 + phase4b-structure 16/16 + phase5-structure
  32/32 + desk-modal-polish 17/17 (revised down from 22 after
  keyboard-nav removal; regression guards added) + desk-blooket-flashcards
  24/24 (new) + desk-day-grade-modal 15/15 (new) + desk-grade-outlook
  18/18 + desk-video-availability 10/10 (new) + desk-user-role 32/32
  (new + heavily extended through the teacher-signin saga). **Live
  state in prod**: Phase 4b confirmed live (`f6305703` 2026-05-20
  15:24 UTC) — `/remediation/list` returns 401. Phase 6 endpoints
  (`/grade` lesson-level + lessons[]; `/class/grades` schedule;
  `/roster/section/:section`) should be live too if the auto-deploy
  watch on `roster-server/**` fired correctly on each push since.
  **Verify with**: `curl https://roster-production-12c1.up.railway.app/roster/section/PeriodB`
  → expect `{ok:true, section:"PeriodB", students:[...]}` or empty
  array. If 404, auto-deploy missed; trigger manually.
  Background: Railway suffered a major outage 2026-05-19 → 2026-05-20
  (GCP-side block + non-enterprise build pause); user configured
  GitHub auto-deploy on `roster-server/**` watch path during recovery.
  Once Railway accepts deploys again, the next push touching
  `roster-server/**` will fire the auto-deploy (or the user can
  trigger a one-time manual redeploy from the dashboard). Task #8
  (Desk modal polish) does NOT touch roster-server, so executing it
  won't trigger an auto-deploy on its own.

- ⚠ Local-only test rig: a fresh roster-server is running on
  `http://localhost:8091` (started by the planner this session via
  `cd roster-server && PORT=8091 node --env-file=.env server.js`)
  + a Python static server on `http://localhost:8000` serving the
  repo root. `roster_config.js` auto-detects localhost-served pages
  and routes them to `:8091` (commit `3036bd5`). The teacher-roster-
  console + teacher-dashboard both default the URL dropdown to
  "Local dev (localhost:8091)" with opt-in localStorage persistence
  (commit `d7232a0`). Test account: `date_tiger` /
  `apstats2026` (sec=PeriodE, real_name="Robert Colson"). If those
  servers are still running on reload, no need to restart — just
  smoke-test against them. If they're not, restart via the same
  command above + `python -m http.server 8000 --bind 127.0.0.1`.

  → **PRIOR baseline (pre-`633013c`) — superseded**: follow-alongs
  root **1640/1641** (only
  the same 1 known study-guide.test.js fail); roster-server
  **219/219** (untouched in Phase 5.1); cr **764/765** (1 known
  redox-chat — not touched); `audit-feeder-ids` CLEAN 69;
  phase4-structure 17/17 + phase4b-structure 16/16 + **phase5-structure
  31/31** + roster-server/tests/remediation 50/50. → **NEXT optional
  loop task = wrap-session** (Phase 5 + 5.1 + 4b all shipped; the only
  pending work is the two user-owned handoffs that need Railway to
  recover). Phase 5.1 closed out the final piece of the AI-tutor
  delivery surface; the next architectural increment would be the
  re-check ITEM (consumer of the `/remediation/unlocks` gate), which
  is its own future workstream and not on the current backlog. **⚠ Two user-owned handoffs
  pending for Phase 4b to function in prod**: (a) `railway login` + the
  redeploy (Railway OAuth was 503; existing roster-production URL
  returned "Application not found"); (b) run `roster-server/migrations/
  0004_remediation_assignment.sql` in curriculum_render Supabase SQL
  editor. **NO follow-alongs SQL needed for Phase 4b** (`item_ledger`
  + `roster` untouched; the new `remediation_assignment` is its own
  isolated table). Standing chore: `delete from roster where
  section='SMOKETEST';` (the user already ran this for session 100;
  Phase 4b smoke didn't add any new SMOKETEST rows since deploy was
  blocked).
- ⚠ Phase-4a operational gotcha (recorded): cross-agent runner has a
  sporadic UTF-8-decode bug on Codex's output (cp1252 0xa7/0x97 in the
  stream when files contain §/em-dash/→) — the prompt itself was ASCII
  clean both times; the bug is in the runner's output-decoding side. Retry
  with an "ASCII-only reply" instruction in the prompt worked on the
  second attempt. ⚠ Test-vs-prod schema divergence: the listRoster
  student_id gap was caught only by live smoke (fakes had student_id;
  prod didn't). Future class-fan-out-style endpoints should integration-
  test the real DB projection or pin it with a unit test on db.js.

### Specs to (re)read on reload, per task

**Phase 5.1 (next optional — small):** Read the Desk file's PC-tile shape
(`ap_stats_roadmap_square_mode.html` — PC tiles are visible at lines
1595/2987/3179 area as quiz URLs with `l=PC`; need to identify the topic
key for PC tiles vs lessons), the existing lessons-only `copyTutorPrompt`
helper (added in Phase 5, immediately after `closeResourcePanel`), and
the `ai-tutor/u{u}_pc.md` artifact convention. The 9 PC artifacts ship
in the repo already.

**Provenance (DONE, do not rebuild)**: `GRADEBOOK_PHASE4B_BUILD.md`
(Task #6, this session — `remediation_assignment` write loop),
`GRADEBOOK_PHASE5_BUILD.md` (Task #5, this session — AI-tutor delivery
+ §6.4 close), `GRADEBOOK_PHASE4_BUILD.md` (Phase 4a teacher dashboard +
start-here render), `GRADEBOOK_PHASE3_BUILD.md` (grade calc + diagnostic
BKT), `GRADEBOOK_PHASE2_BUILD.md` (cr-quiz rollup),
`GRADEBOOK_TAGGING_T2_FULLRUN_BUILD.md` (T2 disambiguation),
`ROSTER_TEACHER_TOOLS_SPEC.md` (TR — done/deployed),
`AI_TUTOR_SPEC.md` (§31/§156 — wiring now LIVE per Phase 5),
`DESK_DONOW_SPEC.md` + per-sprint `DESK_DONOW_DN*_BUILD.md` /
`DN2D_BUILD.md`. `GRADEBOOK_GRADING_SPEC.md` §3 (remediation learning
loop) and §6 (`remediation_assignment` record) are the inputs Phase 4b
implements — useful for context if a future "re-check consumer"
workstream lands.

---

> **PRIOR PROVENANCE — superseded by the AUTONOMOUS LOOP section above.
> Historical record only; do NOT act on the older NEXT-THREAD/SESSION text.**

**Last updated**: 2026-05-18 (context-limit handoff). **Read the "➡ NEXT THREAD" block below first — it is the authoritative current state.** TL;DR: Phase 0 + Sprint 1 + grading-v2 + Tagging T1/T2 + Do-Now DN1 + DN2a-0 + **DN2a (`10ffa30`) + DN2b (`5fa2c79`)** all SHIPPED & LIVE on `master` (latest `5fa2c79`); AI-tutor U1–U9 75 artifacts done (separate session, idle). **DN2a/DN2b = the gradebook feeder is now wired across ALL 69 worksheets** (form-agnostic, EOL-safe; `audit-feeder-ids` CLEAN 69; `gradebook-feeder-wiring` 92/92). **NEXT = DN2c (rosterClient single sign-in into the Desk) — TEACHER-GATED *and* BLOCKED behind a DN1 roster-server redeploy (`GET /donow` is 404 on prod; user chose DEFER+track, must be done BEFORE DN2c).** Gradebook session OWNS the Desk file for DN2c/DN3; AI-tutor wiring serialized behind it. *(Older header text retained below for provenance.)* ~~s99:~~ Gradebook **Phase 0 LIVE** (`a7d7bbd`, `https://roster-production-12c1.up.railway.app`) + **grading spec signed off** (`e506b58`) + **Sprint 1 shipped** (`d461ebc`: tagging audit + item_ledger substrate + feeder client). **⚠ Audit verdict (planner-verified real): ZERO AP-skill tags in any pool → Phase 3 NOT READY. Next thread is forced = a TAGGING WORKSTREAM** before Phase 2/3. See "SESSION 99 — COMPLETE" + `project_gradebook_grading_model.md`.)
**Status**: TI-84 trainer V3 shipped, Physical Calculator Mode primary. Study guide `study_guide_diagnostic.html` feature-complete at **v7**: FRQ decomposition, review queue, mastery map constellation, inline TI-84 procedure walkthroughs, login UX, official AP rubric disclosures, inline chart rendering (70 MCQ charts + solution charts), class scoreboard, **summer unit gating with hash-based unlock codes**, **AP date auto-roll**. Teacher-facing `teacher-code-generator.html` sibling tool. Test baseline: root suite **871/872** (1 fail = pre-existing, unrelated `study-guide.test.js` v3-structure snapshot; NOT a regression — `study_guide_diagnostic.html` untouched) **+ roster-server 28/28**.
**AP exam date**: passed 2026-05-07; `computeApExamDate()` auto-rolled to 2027-05-07 at midnight 2026-05-08. App is now in summer-only / next-year-prep posture.
**Current focus**: **Gradebook Phase 0 DONE — fully live & production-verified** (`a7d7bbd`). Auth service deployed to Railway (`https://roster-production-12c1.up.railway.app`; project `apstats-roster`/service `roster`) against the curriculum_render Supabase project; enroll/verify/teacher-gate confirmed in prod. **Next = Phase 1** (item_ledger + worksheet/FRQ feeders stamped with `rosterClient.studentId()`) + single-sign-in adoption on the roadmap (§6.4). Two open chores: run `delete from roster where section='SMOKETEST';` (verification rows); per-app login UI is Phase 1. Carry-over (h) DONE; roadmap U1–U5 summer-prep (`27bc1df`). U4/U5 per-lesson backfill **de-scoped**.

---

## ✅ SESSION 99 — COMPLETE (Gradebook Phase 0 BUILD shipped)

> Phase 0 is code-complete & pushed (`8510252`). The **next session starts at "➡ NEXT THREAD"** at the bottom of this block. Session 98 detail preserved further down as the record.

**Shipped & pushed this session (follow-alongs `master` `8510252`, 18 files, +4920):**
- `roster-server/` — standalone Railway Express auth service. `POST /roster/enroll` (teacher-gated via `x-teacher-secret`), `POST /roster/verify` → `{studentId,token}`, `POST /roster/resolve`, `GET /health`. **bcryptjs cost-12** hash+compare — explicitly fixes the plaintext-password anti-pattern in the `curriculum_render_v2` reference impl. HMAC-SHA256 compact session token (no JWT dep). Injectable `db.js` ⇒ suite runs with no network. Service-role key + all secrets from `process.env` only.
- `roster-server/migrations/0001_roster.sql` — `roster` + `roster_alias` per spec §4; RLS enabled with **zero policies** (service-role only, no anon, no `auth.uid()`).
- `roster-client.js` + `roster_config.js` — repo-root siblings mirroring `railway_client.js`. `window.rosterClient` current/signIn/enroll/signOut/studentId/token; one localStorage key `apstats_roster.v1`; talks only to `window.ROSTER_SERVICE_URL` (no embedded fallback — fails fast if `roster_config.js` not loaded).
- `roster-client-demo.html`, `GRADEBOOK_PHASE0_BUILD.md` (frozen-contract build plan), Decision Log appended to `GRADEBOOK_SPEC.md` (§6.1–6.4 + D-A..D-F).

**Build flow (matches user's requested pattern):** planner froze 3 contracts (DDL / HTTP API / client) → 3 parallel **Sonnet** workstreams (non-overlapping owned paths) → **Codex** cross-agent review+fix. Codex caught a **real `db.js` `.ilike` wildcard-match vuln** (`%`/`_` in a username could match unintended rows) → `.eq` exact lowercase; removed a contract-violating embedded fallback URL in the client; de-hardcoded test secrets (per-test random via `process.env`); strengthened the §7.4 cross-host proof to **3 real separate jsdom windows** sharing one storage. Planner re-ran every suite after Codex (memory gotcha s88b: result files are not evidence).

**Verified (re-run by planner, not trusted from result files):** roster-server **28/28**, roster-client **27/27**, root suite **871/872** (the 1 fail = pre-existing unrelated `study-guide.test.js` v3-structure snapshot — `study_guide_diagnostic.html` is NOT in this changeset; confirmed via `git status`). Net new = 55 tests, all green.

**Acceptance criteria `GRADEBOOK_SPEC.md` §7:** all code-side criteria met (schema+RLS, auth service, client, cross-host identity proof, no plaintext/secrets client-visible, Decision Log). §7's "one student resolves to the same `student_id` from roadmap/worksheet/study guide" is proven by the shared-key design + the 3-window test; per-app login-UI wiring is Phase 1 adoption (out of Phase 0 scope, per spec). The `/api/submit-answer`+`/api/ai/grade`+`/api/ai/appeal` `student_id` field is contract-fixed (doc) here; wiring is Phase 1.

**Shipped & pushed this session (follow-alongs `master`):**
- `6cb7a1f` — Roadmap pivot scaffolding: new `SUMMER26` schedule (U1–3 initially), `computeDefaultYear()`, SY25-26 archived/greyed; **fixed two pre-existing bugs** — `rCal` crashed when a schedule didn't start on a Monday and the countdown's 4th box was hardcoded `May 7` with no id (now `#cd-exam`, synced to `EX_DT`). TOC.html given U1–U3 links.
- `27bc1df` — **Roadmap extended to U1–U5 summer-prep (NEXT STEP 1 done).** `SUMMER26._legacyS` = 38 lessons (U1×10/U2×9/U3×6 per-lesson + U4×6/U5×7 one cell per *combined* worksheet, May 18 → Aug 14 2026); label "Units 1–5 Prep"; examDate + `computeDefaultYear()` cutover → **Sept 1 2026** (`[2026,8,1]`); +Probability/+Distributions units; SY26-27 range.start → Sept 1, label "(periods TBD)", periods "Section 1/2 (TBD)". Headless-verified (Playwright, all 3 years): default=SUMMER26, exactly 38 cells incl. cell-u4/u5, zero U6–9, no JS errors.
- `67b28e9` — **Gradebook Phase 0 spec signed off (NEXT STEP 2 done).** `GRADEBOOK_SPEC.md` — shared roster/login, grounded in a verified audit of the three isolated identity systems (worksheets' unverified free-text username + orphaned FRQ scores; study guide username+password+real_name; roadmap trusted email). Proposes uuid `student_id` join key, `roster`/`roster_alias`, shared `roster-client.js`.

**Decisions that drove this session (now implemented):**
- Keep the *combined* U4/U5 worksheets (no per-lesson backfill). Registry already maps every 4.1–4.12 / 5.1–5.8 topic → its combined worksheet URL (status done) — so summer U4/U5 cells resolve via BAKED_REGISTRY with no broken links.
- ⚠ `apstat_5_framework.md` has **no `## TOPIC` headers** (structurally malformed) — blocks any future U5 pipeline framework-injection AND weakens U5 skill-mapping for the gradebook. `apstat_4_framework.md` is plain-header but OK. Earlier session claim "U4–U9 Drive IDs are in the index" was WRONG — index has ~zero U4/U5 videos.
- School year starts **Sept 1 2026** (not Aug 2). `apstat_X-Y` 0-indexed-month gotcha: `[2026,8,1]`=Sept 1.
- SY26-27 periods are UNKNOWN — must be relabeled period-agnostic ("TBD"), not Period B/E.

**NEXT STEP 1 — ✅ DONE (`27bc1df`).** Extended SUMMER26 to U1–U5 + Sept-1/period fixes in `ap_stats_roadmap_square_mode.html`; `_legacyS` verified byte-identical to the pre-generated literal; headless-verified. The 5 sub-steps were executed exactly as written (kept here as the record of what was done):
  1. Replace `SUMMER26._legacyS` with the pre-generated U1–U5 array in `C:/Users/rober/Downloads/Projects/Agent/.summerS2.txt` (38 lessons: U1–3 per-lesson by topic id; U4/U5 one entry per distinct combined worksheet keyed by topic 4.1/4.3/4.6/4.7/4.9/4.10 and 5.1/5.3/5.4/5.5/5.6/5.7/5.8; Mon/Wed/Fri May 18 → Aug 14 2026). Generator: `Agent/.gen-summer2.cjs`.
  2. `SUMMER26`: `label`→"Summer 2026 — Units 1–5 Prep"; `examDate:[2026,7,2]`→`[2026,8,1]` (Sept 1 "School Starts"); `range.end`→`[2026,7,14]`; `units`→ add `{id:4,label:"Probability"},{id:5,label:"Distributions"}`.
  3. `computeDefaultYear()`: cutover `new Date(2026,7,2)` → `new Date(2026,8,1)` (Sept 1).
  4. `SY26-27`: `range.start [2026,8,2]`→`[2026,8,1]`; `label`→"Full Year 2026-27 (periods TBD)"; periods.B/E `label`→"Section 1 (TBD)"/"Section 2 (TBD)".
  5. Browser-test headless (Playwright launch, serve `python -m http.server 8077`, dismiss "Click to start" splash by clicking ~640,360; verify default=SUMMER26, ~38 unit cells incl. cell-u4/u5, all 3 years load no JS errors), then commit/push roadmap.

**NEXT STEP 2 — ✅ DONE (`67b28e9`, `GRADEBOOK_SPEC.md`).** Phase 0 spec drafted & SIGNED OFF. **4 decisions locked (spec §6):** (1) new dedicated Supabase project; (2) hand-rolled username+password, teacher-provisioned → no `auth.uid()` ⇒ **server-mediated roster access** (thin auth service holds service key, `/roster/enroll`+`/roster/verify`→`{studentId,token}`; clients never hit Supabase directly — mirrors study guide's `/api/users`); (3) clean-start the SUMMER26 cohort (`roster_alias` exists, legacy reconciliation deferred); (4) shared `roster-client.js` + single login on the roadmap. Architecture (as decided, now in spec):
  - **New Supabase analytics layer** = unified ledger. Three tables: `roster` (universal student key + real name + login — the join key for everything), `item_ledger` (one row per student×gradeable-item: worksheet Q / FRQ / curriculum_render quiz answer; source, item_id, unit, topic, skill, response, score, graded_at), `skill_mastery` (per student×AP-skill BKT pKnow rolled from item_ledger — reuse study-guide BKT).
  - Grade = **correctness/mastery-based** off `skill_mastery`; `item_ledger` completeness = accountability check. **Blookets excluded** (manual class participation only).
  - Feeders: worksheet fill-ins (Railway `/api/submit-answer`) + FRQ AI grades (`/api/ai/grade`) are easiest; curriculum_render quiz = **new write path, hardest, depth = every selected option per student per question + full item analysis** (never touch sacred `curriculum.js` question bank, only the answer-submit path); study_guide already Supabase.
  - **Phase 0 = the shared roster/login** (long pole, prerequisite, user chose "new shared roster/login"). Sequencing: user chose "Phase 0 now, in parallel; backfill continues as transcripts are fed" — but U4/U5 backfill was then de-scoped (combined kept), so the only active threads are NEXT STEP 1 (roadmap) + this spec.
  - Phases: 0 roster → 1 item_ledger + worksheet/FRQ feeders → 2 curriculum_render quiz feeder → 3 skill_mastery rollup + grade calc → 4 teacher dashboard.

**Housekeeping — ✅ DONE:** scratch removed (`Agent/.gen-summer2.cjs`, `.summerS2.txt`, `.roadmap-test.mjs`); :8077 server stopped. Auto-memory updated: corrected the false "U4–U9 Drive IDs in index" claim + recorded the `apstat_5_framework.md` no-`## TOPIC`-headers defect (blocks future U5 framework-injection AND weakens U5 gradebook skill-mapping); added `project_gradebook_phase0.md`; fixed MEMORY.md hooks.

**➡ NEXT THREAD — Desk "Do Now" Sprint DN2c (TEACHER-GATED *and* gated behind the DN1 roster-server redeploy in Open-chores (d) — do NOT start without explicit greenlight AND that redeploy done). DN2a + DN2b SHIPPED this session. Handoff updated 2026-05-18.**

**SHIPPED & LIVE on `master` (this session, all planner-verified + most Codex-confirmed):**
- Phase 0 roster auth LIVE & prod-verified (`a7d7bbd`; `https://roster-production-12c1.up.railway.app`; curriculum_render Supabase `bzqbhtrurzzavhqbgqrs`; Railway proj `apstats-roster`/svc `roster`; secrets in gitignored `roster-server/.env`: `ROSTER_TEACHER_SECRET=tagQc8e7mEXDUkqwYSYLqzH8`, `ROSTER_PROCTOR_SECRET=yzNdzBDr2BdpLnBlePlQplqr`).
- Sprint 1 `item_ledger` LIVE (`/ledger/record` accepting writes).
- **Grade model = `GRADEBOOK_GRADING_SPEC.md` v2 HYBRID, §2 amended (`36e2bfe`): TWO graded feeders (follow-along worksheet + curriculum_render quiz; Driller DROPPED) + cap/uncap — `banked=min(B,C≈85)`, `unitGrade=max(banked,P)`, proctored PC is the ONLY uncap C→100 and only-raises. BKT/skill-tags = DIAGNOSTIC engine ONLY, never the grade.**
- Tagging T1 (deterministic `data/skill-map.json`, in `e6adf5d`) + T2 (`1dc5c05`: constrained-AI disambiguation harness + U1 pilot ~98%) shipped.
- Roadmap focus pass (`0a2c0bc`) — **largely superseded by DESK_DONOW D5** (one fall calendar).
- `DESK_DONOW_SPEC.md` **SIGNED OFF** (`5f4a7a0`). DN1 completion engine LIVE (`d41731b`: `scripts/build-work-manifest.mjs`→`data/work-manifest.json` + roster-server `GET /donow`). DN2a-0 (`1970ee2`): feeder id-audit + fixed 69 phantom skill-map keys → **feeder id-vocabulary PROVABLY consistent across all 69** (`scripts/audit-feeder-ids.mjs` regression guard).
- **DN2a (`10ffa30`):** `gradebookClient.record` wired into 2 pilots (`u4_lesson1-2`, `u8_lesson1`) + closed-loop jsdom proof; **write-half PROVEN live on roster-production** (real `item_ledger` row, exact vocab). Codex contract-compliant.
- **DN2b (`5fa2c79`):** rolled to **ALL 69** worksheets via idempotent **EOL-preserving** `scripts/dn2b-wire-feeders.mjs` (kept as a re-runnable rollout/guard). Helper **form-agnostic** (`gbWsPrefix()` = `WS-`+UNIT_ID OR the WORKSHEET_ID value — both id-decl forms); `u3_lesson6-7` (lone WORKSHEET_ID, different submit arch) hand-patched; pilots backported so all 69 share a byte-identical block. `tests/gradebook-feeder-wiring.test.js` 92/92; `audit-feeder-ids` CLEAN all 69; Codex-reviewed (rollout correct; 2 test/doc findings addressed).
- AI-tutor session (SEPARATE, idle): U1–U9 75 artifacts DONE (`9207d24`), zero in-flight commits.
- Exam horizon pinned **Fri May 14 2027 8AM** (`[2027,4,14]`; ⚠ web-verify CB-2027 before student-facing).

**~~DN2a + DN2b DONE (`10ffa30`,`5fa2c79`).~~ NEXT = DN2c — TEACHER-GATED + gated behind the DN1 redeploy (Open-chores (d)):** `rosterClient` single sign-in into the Desk `ap_stats_roadmap_square_mode.html`. ⚠ DN2c delivers no value until `GET /donow` actually works on prod — the redeploy is its hard prerequisite. **DN2d** = curriculum_render quiz answer-submit feeder (SEPARATE curriculum_render repo; NEVER touch sacred `curriculum.js`) — **independent of the `/donow` blocker**, so it can be pursued before the redeploy if the teacher prefers. THEN **DN3** (collapse roadmap to ONE fall calendar Sept-1→exam + 4 completion-color states incl. "done-ahead" glow + Do Now card + soft speed-bump; contended Desk file — gradebook session owns it, fold in AI-tutor's Desk-tile spec, NEVER parallel-edit). THEN controlled full T2 disambiguation run (Codex pipeline; planner-review agreement+stratified sample BEFORE merging into `data/skill-map.json`; disagreements→Sprint T3) → Phase 2/3/4.

**🔒 Desk-file ownership protocol (teacher-decided across BOTH sessions): the gradebook session OWNS `ap_stats_roadmap_square_mode.html` for ALL DN2c/DN3 work. The AI-tutor session hands over its exact Desk-tile "copy tutor prompt" insertion spec to fold into that same Desk pass — NEVER edit the Desk in parallel. AI-tutor's `start-here.html` AI-tutor section + its D5 summer→one-calendar reframe = AI-tutor session's lane (different file, independent), teacher-gated. AI-tutor delivery wiring is serialized BEHIND gradebook DN2c.**

**Method:** freeze contracts → parallel Sonnet → Codex FOCUSED review (`python C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py`; broad times out — keep tight + ~1400s) → planner re-verify under vitest (s88b: NEVER trust result files; agents stream-timeout on long runs but usually finish the work — verify on disk) → tight single-purpose commits (forensic HEAD before/after; clobber-free vs the other session). **Method note (DN2a/b proven):** for surgical ≤~30-line changes the PLANNER implements directly + Codex does the mandated independent review (parallel-Sonnet fan-out adds clobber risk for tiny diffs); reserve fan-out for larger independent workstreams. Baseline (post-DN2b): root suite **1435/1436** (the 1 = pre-existing unrelated `study-guide.test.js` — NOT a regression; do not "fix"); roster-server **80/80**; `tests/gradebook-feeder-wiring.test.js` **92/92**; `audit-feeder-ids` + `work-manifest` = the id-vocabulary regression guards (re-run after ANY worksheet edit). ⚠ **CRLF GOTCHA: ~30 older U1–U3 / some U8-U9 worksheets are CRLF — ANY bulk worksheet edit MUST be EOL-preserving** (a naive LF rollout mixed endings; caught pre-commit via `git diff --stat` deletion-count + git CRLF-normalization warnings; `scripts/dn2b-wire-feeders.mjs` is the EOL-safe pattern). ⚠ **The cross-agent runner's `files_changed` is a coarse mtime snapshot** — it falsely lists `data/skill-map.js`/`.json` (timestamp-only regen + concurrent-test cache); ALWAYS verify via `git status`/`git diff` and `git checkout -- data/skill-map.js` if its only change is the `// GENERATED:` header (frozen vocabulary).

**Open chores / flags:** **(d) ⚠ GATING BLOCKER for DN2c — `GET /donow` returns 404 on roster-production.** DN1's code is correct in-repo (`roster-server/server.js` mounts `mountDonow`; `donow.js`; `loadManifest` defaults to `../data/work-manifest.json` or `WORK_MANIFEST_PATH`) but **roster-server was never redeployed since DN1**. User chose DEFER+track 2026-05-18. The full live loop + DN2c/DN3 depend on it. On redeploy ALSO ensure the deployed roster-server can reach `data/work-manifest.json` (set `WORK_MANIFEST_PATH` or bundle it) or `/donow` will 500 instead of 404. Teacher owns Railway (same redeploy pattern as Phase-0/Sprint-1; secrets already set). (a) `delete from roster where section='SMOKETEST';` clears Phase-0/Sprint-1 **+ DN2a-smoke** test rows (FK cascade clears ledger too) — DN2a live-smoke added 2 (`papaya_badger`, `pumpkin_tiger`; latter has 1 `item_ledger` row); still pending. (b) curriculum.js bank defects (~10 dup-MCQ-choice items + 2 prompt/rubric mismatches, list in `project_gradebook_grading_model.md`) — sacred, never auto-fix; teacher may clean separately. (c) apstat_5 cross-finding (AI-tutor: it wasn't truly `## TOPIC`-malformed; T1's TT1-E restructure may be moot) — verify T1 restructure faithfulness at the T2 review gate; does NOT affect shipped DN1/DN2. Recall: `project_desk_donow.md`, `project_gradebook_grading_model.md`, `project_gradebook_phase0.md`, `project_ai_tutor_pilot.md`.

*(Everything below this line is PRIOR-STATE PROVENANCE — superseded by the handoff above. DN1 + DN2a-0 are DONE; the "controlled full disambiguation run" comes AFTER DN2/DN3 per D2.)* ~~stale:~~ Build the loop-closer: "Do Now" next-task + ONE school-year calendar that colors in as work is banked. 7 decisions locked; exam horizon pinned **Fri May 14 2027 8AM** (`[2027,4,14]`; web-verify CB-2027 before student-facing). **D2 reprioritizes: the deferred §6.4/Phase-1 feeder+roster adoption is now Do Now's prerequisite, AHEAD of the full T2 disambiguation run. D5: roadmap collapses to ONE fall calendar — SUPERSEDES the `0a2c0bc` SUMMER26 Jun-22 re-date** (AI-tutor session owns the `start-here.html` reframe; don't treat the summer schedule as live). **Planner-refined engine-first order: DN1 = manifest builder + roster-server `/donow` endpoint (new/additive, fixture-tested, zero-collision) [IN PROGRESS] → DN2 = feeder/roster adoption (risky: 69 worksheets + contended Desk + curriculum_render; checkpoint first) → DN3 = Desk single-calendar+coloring+DoNow+speedbump → THEN full T2 disambiguation → Phase 2 cr-quiz feeder → Phase 3 (v2 §2 cap/uncap grade + diagnostic BKT) → Phase 4 + §6.4.** Item-id vocab = existing `data/skill-map.json` keys (T1-frozen); manifest enumerates from there; feeders record those exact ids. Recall `project_desk_donow.md`, `project_gradebook_grading_model.md`. *(The long paragraph immediately below is PRIOR-STATE PROVENANCE — superseded by this line; T1/T2/roadmap-focus are DONE, the "controlled full disambiguation run" now comes AFTER DN1–DN3 per D2.)* ~~Prior:~~ gradebook: the CONTROLLED FULL DISAMBIGUATION RUN → Sprint T3, then Phase 2/3 (do NOT rebuild Phase 0 / Sprint 1 / T1 / T2).** **Current truth (2026-05-18):** `GRADEBOOK_GRADING_SPEC.md` = **v2 HYBRID, §2 amended (`36e2bfe`): TWO graded feeders (Driller DROPPED) + cap/uncap** — `banked=min(B,C≈85)`, `unitGrade=max(banked,P)`, proctored PC the only thing that uncaps C→100, only-raises. BKT/skill-tags = diagnostic engine ONLY (never the grade). Roadmap focus pass shipped (`0a2c0bc`): Driller deprecated from student UI, SUMMER26 re-dated (38 lessons Mon 2026-06-22 @4/wk → 2026-08-28, examDate Sept-1 unchanged), periods → "Period X — actual periods TBD". **Tagging T1 shipped (deterministic skill-map, in `e6adf5d`) + T2 shipped (`1dc5c05`): constrained-AI disambiguation harness + validated U1 pilot (~98% dual-pass auto-resolve, 6→teacher queue, canonical skill-map.json untouched).** NEXT = the controlled full 2642-item disambiguation run (Codex pipeline per §5; planner-review the agreement+stratified sample BEFORE merging `ai-constrained` into canonical `data/skill-map.json`; disagreements → Sprint T3 teacher-verification surface) → then Phase 2 (cr-quiz grade feeder) → Phase 3 (v2 §2 cap/uncap grade calc + v2 §3 diagnostic BKT rollup) → Phase 4 + §6.4 adoption. **Concurrent AI-tutor session co-commits this repo — use tight single-purpose commits (it works; clobber avoided).** *(Pre-amendment detail below retained for provenance; supersedes "3 feeders/Driller" and "build the tagging workstream" — those are DONE.)* Original Sprint-1-era pointer: Sprint 1 shipped (`d461ebc`) = tagging audit + `item_ledger` substrate + `gradebook-client.js`, planner-verified (roster-server 48/48 incl. 28 Phase-0 regression, audit 60/60, client 29/29, root 960/961 [the 1 = known unrelated study-guide.test.js]). **`GRADEBOOK_TAGGING_AUDIT.md` proved (independently grep-verified, NOT a parser bug): ZERO explicit AP-skill tags in any of the 4 pools → per-skill BKT is garbage-in → Phase 3 NOT READY.** So the next sprint is the **tagging workstream — spec now DRAFTED: `GRADEBOOK_TAGGING_SPEC.md` (DRAFT, awaiting teacher sign-off + §5 knobs).** Locked: T-0 fix `apstat_5_framework.md`+parser first (0 `(none parsed)`); T-1 teacher-chose baseline-first/iterate; T-2 ONE external unified `data/skill-map.json` (+`.js` wrapper), NEVER inline attrs / NEVER edit sacred `curriculum.js`; T-3 confidence+provenance + teacher spot-review gate on curriculum.js (the certifier) only. Phase 3 resolves item_id→skill via the map at ROLLUP time (improving a tag retro-fixes historical grades). Reframe: not 3190 hand-tags — ids are structured + topic→skill map already extracted; only multi-skill-topic items need disambiguation. Tagging spec SIGNED OFF ("I dig your lean": Codex pipeline; `unresolved`→exclude from the *diagnostic* rollup; fixed stratified sample) and RETARGETED by v2 (banner: same deliverable/decisions, purpose = diagnostic-engine prereq, NOT the grade). Next = build the tagging workstream (same method: freeze contracts → parallel Sonnet → Codex review → planner verify). THEN Phase 2 (cr-quiz grade feeder) → Driller feeder (3rd) → Phase 3 (**v2 §2 cumulative+booster grade calc + v2 §3 diagnostic BKT rollup**) → Phase 4 dashboard + `start-here.html` student render → §6.4 adoption. Same method (frozen contracts + parallel Sonnet + Codex review + planner re-verify). **Sprint 1 is now ACTIVATED & LIVE** (s99): user ran `0002_item_ledger.sql`; CC redeployed roster-server + set Railway `ROSTER_PROCTOR_SECRET`; live-verified on `https://roster-production-12c1.up.railway.app` (/health, Phase-0 regression, `/ledger/record` practice+proctored, L-C integrity confirmed in prod, teacher-gated GET). The `/ledger` ingest path is accepting writes. Chore (optional): `delete from roster where section='SMOKETEST';` — `item_ledger` FK is `on delete cascade`, so this one statement clears both roster + ledger test rows. Recall: `project_gradebook_grading_model.md`. *(Historical Phase 0 handoff detail preserved below; COMPLETE.)*

~~Phase 0 live-provisioning handoff~~ — ✅ DONE this session. Was (decision D-F, runbook `roster-server/README.md`): (1) **use the EXISTING curriculum_render Supabase project `bzqbhtrurzzavhqbgqrs` — do NOT create a new one** (§6.1 revised 2026-05-17 / D-G: free tier = 2 projects, both used; new isolated `roster*` tables, feeder data already co-located there); (2) sanity-check no `roster`/`roster_alias` collision then run `roster-server/migrations/0001_roster.sql` in that project's SQL editor (idempotent, creates only those 2 tables, never ALTERs existing — shared-project discipline); (3) create a Railway service from `roster-server/`, set env `ROSTER_SUPABASE_URL` (=`https://bzqbhtrurzzavhqbgqrs.supabase.co`) / `ROSTER_SUPABASE_SERVICE_KEY` (that project's service-role key) / `ROSTER_TOKEN_SECRET` / `ROSTER_TEACHER_SECRET`; (4) put the deployed URL in `roster_config.js`; (5) smoke-test (`curl /health`, enroll one student with the teacher secret, `signIn` from `roster-client-demo.html`). **Then Phase 1** = `item_ledger` table + the two easy feeders (worksheet fill-ins via Railway `/api/submit-answer`, FRQ AI grades via `/api/ai/grade`) now stamped with `rosterClient.studentId()`; the `student_id` field contract is already fixed. Then Phase 2 (curriculum_render quiz feeder — new write path only, never touches sacred `curriculum.js`) → Phase 3 (skill_mastery rollup + grade calc) → Phase 4 (teacher dashboard). User prefers brainstorm→spec→implement.

---

---

## What This Project Is

A standalone single-file HTML webapp that trains AP Statistics students on the **mechanical key-press sequences** for every TI-84 Plus CE procedure used across Units 1-9. Students interact with a real CEmu-emulated calculator (ROM via Supabase), while a native JS state machine validates keystrokes and drives guided walkthroughs. SRS scheduling ensures durable memory.

## Architecture (V3 — Current)

```
Student clicks virtual key
  → Native state machine: "Is this the right key?"
  → If correct: pass to CEmu → LCD renders real calculator screen
  → If wrong: blocked, show feedback
  → Clutch system: can pause guidance to fix errors freely

ROM loaded from Supabase bucket → cached in IndexedDB → never re-downloaded
Calculator resets to HOME on every new problem
```

### Key Components

| Component | Role |
|-----------|------|
| CEmu WASM (`wasm/WebCEmu.js + .wasm`) | Runs real TI-84 ROM in browser, renders LCD |
| Native module (`native/*.js`, 9 files) | State machine, stat math, menu nav, form engine |
| Bridge (`bridge.js`) | CEmu interface + Supabase ROM auto-loader |
| App (`app.js`) | Walkthrough engine, clutch, SRS, UI |
| Procedures data (`ti84-procedures-data.json`) | 27 procedures, 384+ steps, 65 screens |

### Clutch System (3-phase walkthrough)

```
Phase 1: DATA SETUP (clutch disengaged)
  - Auto-fill types data into CEmu lists/matrices
  - Or student enters manually, clicks "I'm done"
  - 12 of 27 procedures need this phase

Phase 2: PROCEDURE (clutch engaged)
  - State machine validates keystrokes
  - Guided mode: highlights next key, blocks wrong keys
  - Recall mode: no highlights, hints count as misses
  - Pause button: disengage mid-procedure to fix errors

Phase 3: RESULT REVIEW (clutch disengaged)
  - Free exploration of result screen
```

## Files

### Core App

| File | Purpose |
|------|---------|
| `ti84-trainer-v2/standalone.html` | Built single-file bundle (~461KB), what students open |
| `ti84-trainer-v2/app.js` | Walkthrough engine, clutch, phases, UI rendering |
| `ti84-trainer-v2/bridge.js` | CEmu WASM bridge + Supabase ROM auto-download + IndexedDB cache |
| `ti84-trainer-v2/style.css` | Calculator skin CSS (EZ-Spot yellow bezel model) |
| `ti84-trainer-v2/build.mjs` | Assembles standalone.html from modules + data |
| `ti84-trainer-v2/index.html` | Dev entry point (loads modules separately) |

### Native Module (State Machine)

| File | Lines | Tests | Purpose |
|------|-------|-------|---------|
| `native/event-bus.js` | 48 | — | Pub/sub event system |
| `native/stat-math.js` | ~620 | 72 | All stat computations (normal, t, chi-sq, binomial, regression) |
| `native/menu-nav.js` | ~200 | 37 | STAT/DISTR/CALC tab navigation |
| `native/menu-tables.js` | ~280 | — | 12 menu screens extracted from procedures data |
| `native/field-tables.js` | ~540 | — | 20 wizard field tables + 14 result templates |
| `native/form-engine.js` | ~600 | 85 | Wizard cursor, field types, Data/Stats toggle |
| `native/result-formatter.js` | ~100 | 25 | TI-84 number formatting + result line templates |
| `native/screen-renderer.js` | ~350 | — | 320x240 LCD canvas rendering + mock graphs |
| `native/ti84-native.js` | ~600 | 57 | Orchestrator, bridge-compatible API |
| `native/tests/verify-all-procedures.test.js` | ~250 | 78 | Automated walk-through of all 27 procedures |
| **Total** | **~8000** | **354** | |

### Data Files

| File | Purpose |
|------|---------|
| `ti84-procedures-data.json` | 27 procedures, 20 wizards, 14 results, 12 menus, 65 screens, DAG edges |
| `ti84-pattern-recognition-data.json` | 62 canonical problems, 22 confusion pairs, 27 distractor sets |
| `ti84-rom-disassembly-results.json` | ROM-extracted wizard field tables, confidence levels |
| `ti84-rom-wizard-fields.md` | String offsets, token byte map from ROM extraction |

### CEmu WASM

| File | Purpose |
|------|---------|
| `wasm/WebCEmu.js` | Emscripten glue code (73KB) |
| `wasm/WebCEmu.wasm` | CEmu WASM binary (112KB) |

### Research / ROM Artifacts (not used by trainer)

| File | Purpose |
|------|---------|
| `TI-84_Plus_CE/ROM.transpiled.js` | Codex byte-lifted JS from ROM (384 blocks, startup path only) |
| `TI-84_Plus_CE/ROM.transpiled.report.json` | Coverage stats for transpilation |
| `scripts/transpile-ti84-rom.mjs` | Generator script (requires z80js) |

### Specs & Prompts (historical, in repo)

| File | Purpose |
|------|---------|
| `ti84-trainer-spec.md` | Original V1 spec |
| `ti84-native-port-spec.md` | Native module architecture (7 modules) |
| `ti84-v3-spec.md` | V3 architecture (CEmu primary + native state machine) |
| `ti84-clutch-spec.md` | Clutch system, data seeding, list memory |
| `codex-native-port-prompts.md` | 5-agent parallel Codex dispatch for native module |
| `codex-v3-prompt.md` | V3 integration Codex prompt |
| `codex-clutch-prompt.md` | Clutch system Codex prompt |

## Key Design Decisions (TI-84 Trainer)

1. **CEmu is primary UI** — students see the real emulated calculator, not a mid-fidelity mock
2. **Native module is the state machine** — validates keystrokes, tracks screen state, never renders to LCD
3. **ROM from Supabase** — auto-download, IndexedDB cache, no file picker. URL: `https://bzqbhtrurzzavhqbgqrs.supabase.co`, bucket: `ti84-trainer-assets`
4. **Clutch system** — disengage/engage state machine for data setup, error correction, result review
5. **Auto-fill** — trainer types sample data into CEmu lists/matrices via key presses
6. **ALPHA + key for menu letters** — items A-H in TESTS/DISTR menus require ALPHA then the physical key
7. **Calculator skin** — matches physical TI-84 Plus CE EZ-Spot model (charcoal body, yellow bezel, blue 2nd, green alpha)
8. **Reset on every problem** — both CEmu and native reset to HOME before each walkthrough
9. **List memory** — persists in localStorage, always shows data setup phase (never silently skips)
10. **CEmu global stubs** — `emul_is_inited`, `initFuncs`, `initLCD`, `enableGUI`, `disableGUI` defined before `callMain()`
11. **`.gitattributes`** — marks `.wasm`, `.rom`, `.8xv`, `.8xp`, `.sqlite` as binary (prevents CRLF corruption)

## Feature Status (TI-84 Trainer, All Core Complete)

| Feature | Status | Notes |
|---------|--------|-------|
| Pattern Recognition (Track 1) | DONE | `buildQuestion()`, 62 canonical problems, 22 confusion pairs, distractor MCQ, branch walkthroughs |
| Clutch System (3 phases) | DONE | data-setup → procedure → result-review, auto-fill + manual entry, pause/resume mid-procedure |
| Auto-Fill (lists + matrices) | DONE | Navigates STAT>EDIT, types values, progress pills. Tested on chi-squared GOF |
| SRS Track 1 (pattern) | DONE | SM2, exposure counting, quality 0-5 from branch count |
| SRS Track 2 (navigation) | DONE | SM2, guided→recall progression, demotion on 3+ errors or 2+ hints |
| Walkthrough (guided + recall) | DONE | Key blocking, error/hint tracking, narration, common error messages |
| CEmu Integration | DONE | WebCEmu WASM boots real ROM, LCD rendering, key sending, mock fallback |
| Supabase ROM | DONE | Signed URL, streaming download, IndexedDB cache, version validation |
| List Memory | DONE | localStorage persistence, match checking, always shows data setup phase |
| Pause/Resume Guidance | DONE | Clutch disengage mid-procedure, free keys, resume from current step |
| Calculator Skin | DONE | Photo-accurate EZ-Spot model colors, 6-column keypad grid |
| Mobile Layout | DONE | `@media (max-width: 600px)`: full-bleed, compact walkthrough bar, sticky narration, 42px keys, icon buttons |
| Answer Verification | DONE | "Check Your Answer" card in result-review phase, 23 procedures, uses native computed values with 0.5% tolerance fallback |
| Physical Calculator Mode | DONE (PRIMARY) | Default-on. Renders instruction cards (Press KEY / narration / expected / tips / Back, I did it) so students follow along on their real TI-84. Bypasses `pressButton` validation and just advances `routeState`. Zero network, works offline. |
| Options Dialog | DONE | Titlebar "Options" button opens a small dialog housing Firmware + mode toggle. Keeps the physical view uncluttered. |
| Choice Button Flash | DONE | Track 1 choice buttons flash green (correct) or red (wrong) for 650ms before the panel transitions, so students see which button they hit. |

## Known Issues / Remaining Work

### Layout
- At 100% zoom on 1366x768, user may need to scroll to see full keypad
- Previous auto-fit attempts (clamp/flex) made LCD too small or keys unreadable — rolled back

### Procedures
- All 27 procedures verified via automated tests (354 passing, 0 discrepancies)

### Not Yet Built
- **Student pilot testing** — need real students running through procedures
- **Graph rendering** — native module has mock graphs; CEmu shows real graphs
- **STAT>EDIT data entry walkthrough** — could be its own guided procedure teaching list entry

### Research Artifacts (Not on Critical Path)
- `TI-84_Plus_CE/ROM.transpiled.js` — Codex-generated byte-lifted JS from ROM. 384 blocks, 0.086% coverage. Startup path only. Not used by the trainer; kept as reference. Regenerate with `node scripts/transpile-ti84-rom.mjs`

## Commands

```bash
# Run native module tests
cd ti84-trainer-v2/native && npx vitest run --config vitest.config.js

# Rebuild standalone.html after changes to app.js/style.css/data
node ti84-trainer-v2/build.mjs

# Serve locally for testing (needed for WASM dynamic import)
cd ti84-trainer-v2 && python -m http.server 8000
# Then open http://localhost:8000/standalone.html

# Run all project tests (from repo root)
npm test
```

## Supabase Configuration

```
Project URL: https://bzqbhtrurzzavhqbgqrs.supabase.co
Bucket: ti84-trainer-assets (public)
File: ROM.rom (TI-84 Plus CE OS 5.8.2.0029, 4MB)
Config in: ti84-trainer-v2/bridge.js line 11 (ROM_CONFIG.supabaseUrl)
```

---

## Study Guide State (post session 94a)

The parallel `study_guide_diagnostic.html` track is feature-complete. Current state:

- **Schema**: `apStatsStudyGuideDiagnostic.v7` (migration chain v7 → v6 → v5 → v4 → v3 → v2). v7 migration is a pure version bump — existing profiles retain full access (absence of `curriculumMode` field → treated as `'full'` at runtime).
- **Summer gating (s94a)**: New accounts created via `?mode=summer` URL param start with `curriculumMode: 'gated'` and `unlockedUnits: [1]`. Teacher issues per-student codes from `teacher-code-generator.html`; student pastes code into the enter-code panel; `applyUnlockCode` always verifies against `nextLockedUnit(state)` so codes must be redeemed in sequence (U2 → U3 → U4 …). Locked units grey out in mastery map + mini-map with 🔒 overlay; click shows toast instead of opening formula card. Daily queue filters to unlocked units; gated + empty queue shows "see teacher" message. Hash = `sha256(salt | normalizedUsername | unit)` → Crockford-B32, slice(0,6). Salt hardcoded at `'apstats-unlock-v1-3f9a2c'` in `.v7-unlock-block.js` and teacher tool — rotate both to invalidate all codes. Fixture: `('pineapple_koala', 2)` → `348BVD`.
- **AP date auto-roll (s94a)**: `const AP_EXAM_DATE = computeApExamDate()` rolls to next year's May 7 at midnight May 8 (entire exam day stays on current year).
- **Account bar**: username/password login hides when verified, replaced with "Signed in as X · Scoreboard · Sign out" strip. Create-user modal opens via text link.
- **Daily queue**: v5 dose ladder with 4 tiers (Warmup / Steady / Catch-up / Crunch), hybrid MCQ/FRQ tabs, tier meter + info modal
- **FRQ decomposition**: 31 skills across 9 gate FRQs, latent-penalty scoring (5/10/15%, 50% cap). Grade card shows official AP rubric + worked solutions (paper-mode gated).
- **Formula card modal**: LaTeX via MathJax, explain/hint/subconcepts, inline TI-84 procedure walkthrough (33+ mappings), "Practice this formula" primary action
- **Review Queue**: 7-day SM2-lite auto-aging + student graduation via "I know it"
- **Mastery Map**: 81-node constellation canvas, mini-map in sidebar + fullscreen modal with mouse zoom/pan, click-to-open formula card
- **Chart rendering**: 70 MCQ charts (singular + plural `attachments` forms) + FRQ solution-part charts (deferred-render via `<details>` toggle). Lifted from `curriculum_render/js/charts.js` into `lib/curriculum-charts.js`.
- **Scoreboard** (s92): modal fetches all student rows from `study_guide_state_backups` Supabase table, counts green mastery nodes (`lastMastery >= 0.75` out of 81), ranks descending, shows top half only. Current user highlighted; if in bottom half, separator + their row. Singleton guard prevents stacked modals. `countGreenNodes`, `fetchScoreboardData`, `showScoreboardModal` functions.
- **Question context audit**: `scripts/audit-question-context.mjs` classifies 807 served questions (OK 627 / OK_TABLE 103 / OK_CHART 70 / IMAGE_OK 3 / CONTEXT_ORPHAN 1 / CONTEXT_UNCLEAR 3). Remaining orphan + unclears are self-contained text questions.
- **Tier-jump semantics**: `debtToTier(debt)` is 1:1 capped at 3. Intended aggressive escalation, confirmed WAI.

### Load-bearing design principles

1. **Sacred file rule** — `curriculum_render/data/curriculum.js` comes from AP Classroom. Never add MCQs there. All supplements go into `data/formula-probe-supplement.js` (`EMBEDDED_CURRICULUM_SUPPLEMENT`).

2. **Latent penalty, no mode split** — there is NO practice/gate mode toggle (s82 removed it). `computeEffectivePenalty` only runs inside `renderGrade`, and `renderGrade` only fires after the student clicks Grade. Students who click helpers but don't grade see no penalty — safe exploration without a mode field. The escape-hatch note on the helper panel documents this: "Click **Grade** when you're ready for your final score — until then, helpers don't hurt you."

3. **Mastery map is motivational, not informational** — deliberately a glorified progress bar. No edges, no prereq semantics, no labels below zoom 1.8. Students get structural info from the daily queue, review queue, and formula cards. The map exists for the "my territory is turning green" emotional beat.

4. **SRS graduation is student-driven pull** — review queue lists formulas with `hintedAt` within the last 7 days. "I know it" is self-assessment (trains metacognition), not auto-graduation. 7-day auto-aging provides passive graduation. Graduation does NOT refund gate-mode penalties (`formulasViewed` stays independent — separation of concerns).

5. **Formula card → Practice closes the feedback loop** — click mastery map node → read card → tap Practice → land on the MCQ drill for that formula via `pickProbeForFormula` + `setActiveProbe`. Primary-accent button styling invites action. Disabled with tooltip when no probe pool exists.

6. **v4/v5/v6/v7 export sync** — new pure functions must be added in FOUR places per version: the standalone `.vN-*-block.js`, the inline vN export object in `study_guide_diagnostic.html`, the downstream proxy block (e.g., v5 proxies v4), AND any inline destructured reads. Sonnet missed one of the four in s85. Post-check: grep `__studyGuideV{4,5,6,7}__ = {` — each should match twice (standalone + inline).

7. **Paper mode is a cheat path by default** — `Mark complete (paper)` sets `grade.score = 'paper'` with zero content validation. Any student-facing disclosure that could reveal the answer (worked solutions, full rubric criteria, correct-answer highlights) must gate on `grade.score !== 'paper'` OR require real content submission. Codex caught this once in s89 grade disclosures; similar checks needed for any future post-grade reveal.

8. **Dynamic DOM rebuild must rebind listeners** — any function that uses `section.innerHTML = ''` or equivalent teardown to rebuild a form (e.g., `refreshAuthPanelVisibility` restore branch) destroys all child DOM nodes AND their event listeners. Cached `ui.*` refs become stale. Canonical fix: extract wiring into a helper (e.g., `wireAuthFormListeners()`) that re-queries elements + re-attaches handlers, then call it from both init and the restore branch.

### Non-obvious gotchas

- **jsdom smoke probes**: construct JSDOM with `new JSDOM(html, { url: pathToFileURL(htmlPath).href, resources: new ResourceLoader(), runScripts: 'dangerously' })`. The `file://` URL is critical — relative `<script src>` resolves against the document URL, so an `http://localhost/` URL fails with ECONNREFUSED when nothing's serving. `file://` lets jsdom fetch scripts directly from disk. ResourceLoader is needed to actually fetch them; without it, external scripts are silently skipped.
- **`[hidden]` attribute vs class specificity**: a static HTML `<div class="sg-modal-backdrop" hidden>` stays VISIBLE because the class rule `.sg-modal-backdrop{display:flex}` (specificity 0,0,1,0) beats the UA `[hidden]{display:none}` (0,0,0,1). Scope the hide rule to the combined selector — `.sg-modal-backdrop[hidden]{display:none}` (0,0,1,1) — to outrank the base class rule.
- **MathJax 3 delimiters**: LaTeX written into `textContent` must be wrapped in `\[...\]` block-math delimiters (matches the `displayMath` config at line 314-315). Undelimited strings are silently ignored.
- **CSS-pixel vs bitmap-pixel on CSS-scaled canvas**: mastery map canvas has `width=1000 height=700` attributes plus `max-width:100%`. All mouse handlers must multiply `e.offsetX` by `canvas.width/rect.width` to convert CSS → bitmap space (see `toBitmap` helper inside `showMasteryMapModal`). jsdom `getBoundingClientRect` returns zero-width, so this bug is invisible in tests — verify in a real browser or with a probe that computes coords from `computeMapLayout`.
- **Dispatch verification**: Sonnet once returned a fabricated "263/263 tests pass" result file (s88b) without touching the HTML at all. Always run `git status` after dispatch and confirm expected files are in the modified list BEFORE trusting the report. A result file listing deliverables is not evidence the deliverables exist.
- **Float precision**: `0.05 + 0.10 + 0.15 === 0.30000000000000004`. Use `toBeCloseTo(0.30, 10)`, not `toBe(0.30)`.
- **`saveSoon` debounce**: state writes are debounced. jsdom probes that read localStorage immediately after a click will see stale values.
- **Card-boundary test isolation**: asserting a specific card no longer contains text X can false-positive if X appears in another card. Slice the source to the target card's id boundary (`src.indexOf("{id:'", cardStart + 1)`) before the assertion.
- **Block-scope at `study_guide_diagnostic.html:497`**: bare `{` opens a block wrapping v4 code through line 1112. The v5/v6/v7 IIFEs and top-level `const` destructures (including `AP_EXAM_DATE` at line 2109) live OUTSIDE it. Valid JS. Flatten attempts collide with outer-scope names (`AP_EXAM_DATE`, `daysLeft`, `computeDailyDose`, likely more). Formally deferred; don't touch without a full rename plan.
- **TDZ across bare-block boundary (`window.__studyGuideV{N}__` export pattern)**: when the v4 export object literal at line 1085 references a name declared later in the outer scope (line 2109+), property evaluation happens at script-load and throws `Cannot access 'X' before initialization`. **Rule**: any v4/v5/v6/v7 export entry whose value is a `const`/`let` from OUTSIDE the bare block (line 497-1112) MUST use a getter: `get NAME() { return NAME; }`. Regular `NAME: NAME` only works for names declared INSIDE the bare block before line 1085. This is the bug that caused s94a-fix (blank page for all students after s94a shipped).

### Key files (study guide)

| File | Purpose |
|------|---------|
| `study_guide_diagnostic.html` | Main app (~5400 lines including inline v4/v5/v6 logic copies) |
| `.v4-logic-block.js` | Standalone v4 pure functions (daily dose, formula weight, BKT) |
| `.v5-ladder-block.js` | v5 tier ladder pure functions (proxies v4) |
| `.v6-frq-decomp-block.js` | v6 FRQ decomposition logic (`computeEffectivePenalty`, helper tracking) |
| `.v7-unlock-block.js` | v7 unlock codes + unit gating + AP date (`generateUnlockCode`, `applyUnlockCode`, `isUnitUnlocked`, `nextLockedUnit`, `computeApExamDate`) |
| `teacher-code-generator.html` | Teacher-facing sibling tool — single / all-units / bulk CSV code generation. Contains plaintext salt; never deploy publicly |
| `data/ap-stats-cartridge.js` | 81 formula cards with latex, explain, hint, subconcepts |
| `data/frq-decompositions.json` | 31 skills across 9 gate FRQs (no `penalty` field — stripped s89) |
| `data/study-guide-frq-bank.js` | 9 localized gate FRQ prompts + worked solutions + official AP rubrics (s89 drives grade-card disclosures) |
| `data/formula-procedure-map.js` | Formula → TI-84 procedure mappings (36 → 33 after s87 drops) |
| `data/ti84-procedures.js` | Wrapper exposing `ti84-procedures-data.json` as `window.TI84_PROCEDURES` |
| `data/formula-probe-supplement.js` | Hand-authored MCQ supplement (ONLY place to add new MCQs) |
| `lib/chart.min.js` + `lib/chartjs-plugin-datalabels.min.js` | Vendored Chart.js + datalabels plugin (s90) |
| `lib/curriculum-charts.js` | Lifted `curriculum_render/js/charts.js` + `charthelper.js` — defines `window.getChartHtml` / `window.renderChartNow` / `window.chartInstances` |
| `scripts/supplement-probe-signal.mjs` | Signal monitor for supplement probes (run on school network) |
| `scripts/audit-question-context.mjs` | Question context audit — classifies 807 served questions (s90) |

---

## Session History

**Sessions 1-64**: `git log --oneline` for commit-level history.

**Sessions 65-75**: full narratives in `SESSIONS_ARCHIVE.md` (QR button, Physical Mode pivot, Options dialog, choice flash, study guide v2/v3/v4).

**Sessions 76-92**: one line per session below. Use `git show <hash>` for full details.

| # | Commit | Summary |
|---|--------|---------|
| 76 | d91e95c | Study guide v5: tier dose ladder, MCQ/FRQ tabs, paper-mode |
| 77 | 0af87a7 | v6 FRQ decomposition: 31 skills, helper penalty scoring |
| 78 | f5d73a2 | Helper panel UI redesign + schedule test realignment |
| 79 | 52faeb4 | Formula card modal + SRS hint feed (practice/gate split, reverted s82) |
| 80 | 31050ca | Drop gate-mode confirmation + "Queued for tomorrow" chip (removed s86) |
| 81 | 1f5bbcc | Review Queue: 7-day SM2-lite decay + "I know it" graduation |
| 82 | fe94aaf | Collapse practice/gate split → latent-penalty escape hatch |
| 83 | 22adfee | TI-84 procedure walkthroughs in formula card modal |
| 84 | f9c576e | Formula modal 90vh cap + overscroll-behavior |
| 85 | abd5d8c | Mastery Map constellation: 81 nodes, zoom/pan, click-to-card |
| 86 | 687d476 | Codex content audit + Sonnet polish (tooltip, pulse, outlines) |
| 87 | e3ff567 | Apply s86 audit: drop 3 wrong map entries, fix 6 FRQ drifts |
| 88a | beef1d3 | Mastery map `toBitmap` fix for CSS-scaled canvas |
| 88b | d77b174 | "Practice this formula" button in formula card modal |
| — | 7fe8726..5da9fb0 | Interim: two-prop walkthroughs, student profiles, localized gate FRQs |
| 89 | bd1c906 | Login UX, AP rubric disclosures, FRQ audit, penalty strip |
| 90 | 53d275f | Chart rendering lift + question context audit (807 questions) |
| 91 | 83faee7 | Multi-chart rendering (plural form) + FRQ solution charts |
| 92 | 9b5f70c | Class scoreboard modal: ranked by green mastery nodes, top-half visible |
| 93 | 810ca32 | Create-user modal: password field added (bug fix), auto-generated fruit_animal usernames with vehicle tiebreaker, real name field |
| 93 | 09d1804 | Remove dead ✕ close button from create-user modal header |
| 93 | 89f22ae | Label the Remediation Panel aside (persistent heading + subheading) |
| 94a | 636cd05 | Summer unit gating: `?mode=summer` URL param, schema v7, hash-based sequential unlock codes, mastery map lock, daily queue filter, teacher-code-generator.html, AP date auto-roll |
| 94a-fix | 5aa1c76 | TDZ hotfix on `__studyGuideV4__.AP_EXAM_DATE`: s94a moved the `const AP_EXAM_DATE = computeApExamDate()` declaration to line 2109 (outer scope), but line 1086 (v4 export inside the bare block at line 497) still evaluated the name at script-load time → scope walk found the outer const in TDZ → `ReferenceError` → `init()` never ran → blank page + stuck "Loading usernames…" dropdown. Fix: `AP_EXAM_DATE: AP_EXAM_DATE,` → `get AP_EXAM_DATE() { return AP_EXAM_DATE; },`. Getter defers the lookup to property-read time (always after line 2109 initializes). 304/304 v4+v5+v7 tests pass. See gotcha at line 245 — this is the collision the memory warned about. |
| 95 | (uncommitted) | Registry plumbing cleanup. Audit of follow-along coverage exposed three disagreeing registry sources (`registry-data.js` 41 entries, `lesson-registry-data.js` 7 entries, `BAKED_REGISTRY` in `ap_stats_roadmap_square_mode.html` 5 entries), all stale vs the 45 worksheet HTMLs on disk. Root cause: `Agent/state/lesson-registry.json` is the fat truth, but only `export-registry.mjs` (Step 7.5) ran after each pipeline — the roadmap snapshot (`build-roadmap-data.mjs`) and Supabase `lesson_urls` upsert never fired post-step. **Fix:** (1) deleted dead sidecars `registry-data.js`, `lesson-registry-data.js`, `REGISTRY_INTEGRATION.md` from this repo; (2) added both filenames to `.gitignore` so `export-registry.mjs` keeps regenerating them harmlessly; (3) added Step 7.6 (re-bake roadmap snapshot via `build-roadmap-data.mjs`) and Step 7.7 (call `upsertLessonUrls` on the Supabase `lesson_urls` table) to `Agent/scripts/lesson-prep.mjs`. Both wrapped non-fatal. Now after every pipeline run, all three sinks (registry JSON, baked roadmap snapshot, Supabase live table) stay coherent. **Deferred:** full removal of `export-registry.mjs` and its 14 cross-references in the Agent repo (`pipelines/lesson-prep.json`, `tasks/export-registry.json`, panel registrations, design docs) — bigger refactor, separate session. |

| 96 | 9d87e40..f28afac (follow-alongs); a6a8706, f0d9809 (Agent) | **Unit 1 follow-along backfill + framework regen.** (1) AI Studio Drive-picker attach was reproducibly broken: `aistudio-ingest.mjs` searched the picker by *filename* and never clicked the result row, so the picker never reached "1 selected" and Insert was a no-op → Gemini got no video. Fixed with a URL-paste sequence (paste `https://drive.google.com/file/d/<id>/view` → click row → Insert); verified attach (48k tokens). (2) AI Studio media processing was down service-wide (video AND audio, reproduced manually) — bypassed via the **Gemini-in-Drive side panel** (different backend) as the transcript/slides source. (3) Added `--skip-drills` (cascades to skip animation render/upload; drills cartridge fails on a unit's first lesson via Codex Windows-sandbox `CreateProcessAsUserW 206`) and `--skip-commit` (Step 8 `commitAndPushRepos` previously always pushed, ignoring its arg) to `lesson-prep.mjs`. (4) Built all 10 U1 lessons (1.1–1.10, incl. multi-video L4/L7/L10) and registered them. (5) **Framework-injection bug**: `build-codex-prompts.mjs` `extractFrameworkSection` required bold headers `## **TOPIC N.L**` but `apstat_1/3/8_framework.md` use plain `## TOPIC N.L:` → framework silently never injected for U1/U3/U8 (worksheets were transcript-only, unanchored to AP CED). Fixed regex to optional-bold (`## \*{0,2}TOPIC`); verified the framework block (Skill/EU/LO/EK + "must align, don't exceed scope") reaches BOTH worksheet and Blooket Codex prompts. Re-generated all 10 U1 lessons framework-anchored (force via `--force-step content-gen-worksheet --force-step content-gen-blooket`; the task-runner skips when registry status=done). |
| 98 | follow-alongs 6cb7a1f, 27bc1df, 67b28e9 | **Roadmap → U1–U5 summer-prep + Gradebook Phase 0 spec signed off.** `27bc1df`: SUMMER26 extended to 38 cells (U1–3 per-lesson + U4/U5 combined), Sept-1 (`[2026,8,1]`) school-start cutover, SY26-27 period-agnostic; Playwright-verified all 3 years (default=SUMMER26, 38 cells incl cell-u4/u5, zero JS errors). `67b28e9`: `GRADEBOOK_SPEC.md` (shared roster/login) drafted & SIGNED OFF — 4 decisions locked (new dedicated Supabase project; hand-rolled username+password → server-mediated roster access since no `auth.uid()`; clean-start SUMMER26 cohort; shared `roster-client.js` + single roadmap login). Verified-audit finding: 3 isolated identity systems today (worksheet free-text/orphaned FRQ, study-guide username+pw, roadmap email). U4/U5 per-lesson backfill **de-scoped** (combined kept). Memory: corrected false "U4–U9 Drive IDs in index" claim, recorded `apstat_5_framework.md` no-headers defect, added `project_gradebook_phase0.md`. Next: Phase 0 build (no code yet). |
| 99 | follow-alongs `8510252` | **Gradebook Phase 0 BUILD shipped & pushed.** Standalone `roster-server/` Railway Express auth service (bcryptjs cost-12 — fixes the `curriculum_render_v2` plaintext anti-pattern; HMAC-SHA256 token; teacher-gated enroll; injectable db), `0001_roster.sql` (`roster`+`roster_alias`, RLS zero-policies = service-role only), `roster-client.js`+`roster_config.js` repo-root siblings (one key `apstats_roster.v1`), demo, build doc, Decision Log. Flow: planner froze 3 contracts → 3 parallel Sonnet workstreams → Codex review+fix (caught real `.ilike` wildcard vuln→`.eq`; removed contract-violating fallback URL; de-hardcoded test secrets; 3-window §7.4 proof). Re-verified by planner: roster-server 28/28, roster-client 27/27, root 871/872 (1 pre-existing unrelated study-guide.test.js fail). Remaining = live-provisioning user-action handoff (D-F, `roster-server/README.md`); then Phase 1. |
| 97 | follow-alongs 6c776c0..54dc758; Agent 98bc49a, c3dd1e0 | **Carry-over (h) COMPLETE — U2 + U3 backfilled, U1 gap fixed.** Built Unit 2 (2.1–2.9, 9 lessons; multi-video L4/L6/L7/L8/L9) and Unit 3 (3.1–3.5, 5 new lessons; multi-video L3/L5; 3.6–3.7 pre-existing combined). All framework-anchored (fw-focus 35–72 across grading rubrics), live, registered, Supabase-upserted. Raised `tasks/content-gen-worksheet.json` `timeout_minutes` 20→35 (Agent 98bc49a) after U2 L2's first run was killed mid-generation (truncated HTML, no grading file) — distinct from the benign "FAILED-but-complete" U1 1.6/1.10 timeouts. Verified framework injection works for plain-header `apstat_3_framework.md` via the f0d9809 fix (in-prompt check on 3.1). Fixed U1 L10 stale `worksheet=failed` registry status (its framework-regen FAILED on the 20m timeout pre-fix; worksheet was finalized manually but registry re-sync was skipped for regen finalizes) → registry now zero-gap across all 24 backfill lessons (U1×10 + U2×9 + U3×5). Unit 3 had NO Drive-index entries — user supplied transcripts directly via Gemini-in-Drive (recipe is media-source-agnostic). |

## Open Carry-overs

- **(a) Run `node scripts/supplement-probe-signal.mjs` on the school network** — 16 supplement probes with zero signal. Needs school network. Carried since s78.
- **(b) Real student pilot data** — no telemetry bucket yet; direct observation only.
- **(c) WEAK setup/output mapping schema** — 16 entries in `data/formula-procedure-map.js` are "uses as input" rather than "computes". User preference needed on redesign vs drop.
- **(d) Mobile touch gestures for the mastery map** — deferred from s85. ~80 LOC.
- **(e) Block-scope oddity at `study_guide_diagnostic.html:497`** — formally deferred. Don't flatten without a full rename plan. See gotcha line ~245 for the TDZ trap and the getter-defer workaround (used in s94a-fix).
- **(f) Session 94b: adaptive SRS forgetting curve** — full spec in `.session94-spec.md` §13. Ebbinghaus decay on `pKnow`, adaptive half-life tuned to exam proximity (45/21/10/5 days). Solves "empty U1 queue" risk for summer-only students. Needs real student data to tune constants before merging. Deliberately shipped separately from 94a.
- **(g) Teacher tool security hygiene** — `teacher-code-generator.html` contains the unlock salt in plaintext. Never deploy it publicly or link from the student-facing study guide. Built-in yellow warning banner, but operational discipline needed.
- **(h) ✅ DONE — Backfill follow-along worksheets (Units 1–3).** Carry-over (h) is COMPLETE: U1 1.1–1.10 (10), U2 2.1–2.9 (9), U3 3.1–3.5 (5; 3.6–3.7 pre-existing) — 24 new lessons, all live, registered, Supabase-upserted, framework-anchored, **zero registry gaps**. The original (h) scope was an undercount (it said U1 1.3–1.10, U2 2.1–2.7, U3 3.4–3.5); reality was the full units, now all done. **Units 4–9 per-lesson — DE-SCOPED (session 98, 2026-05-17).** User decided to KEEP the existing *combined* U4/U5 worksheets; no per-lesson backfill. The summer roadmap resolves every 4.x/5.x topic → its combined worksheet URL via BAKED_REGISTRY (no broken cells). ⚠ **Correction:** the earlier claim "Drive IDs in `Agent/config/drive-video-index.json`" for U4–U9 was FALSE — the index has ~zero U4/U5 videos. Do not revive without an explicit new ask. The mechanical recipe below is preserved ONLY in case U4–U9 per-lesson is ever revived (source transcripts via Gemini-in-Drive, NOT an index lookup):
  1. **Transcript/slides via Gemini-in-Drive** (AI Studio media is unreliable — skip it). Open the lesson's Drive video (`https://drive.google.com/file/d/<id>/view`; IDs are all in `Agent/config/drive-video-index.json`, grep by topic) and run the transcription prompt then the slides prompt in the in-Drive Gemini panel. Multi-video lessons need each video done separately.
  2. **Save** to `follow-alongs/u{U}/apstat_{U}-{L}-{n}_transcription.txt` and `_slides.txt` with header `# Video {n} — Transcript|Slide Descriptions\n# Unit {U}, Lesson {L}\n\n` (unescape Gemini's `\[ \] \*`).
  3. Stub the lesson in the registry (`upsertLesson(U,L,{topic,urls:{worksheet:<gh-pages url>,quiz:null}})`), then `cd Agent && node scripts/lesson-prep.mjs --unit U --lesson L --skip-ingest --skip-drills --skip-schoology --skip-commit`.
  4. Static-check the worksheet (correct Topic/UNIT_ID, no fallback-pattern leftovers, blanks>0, HTML closed), then commit/push the 3 files to follow-alongs `master` (GH Pages serves from master root, NOT the stale `gh-pages` branch). Use `git pull --rebase --autostash origin master` (handles CRLF-renorm dirty tree + `state/cross-agent-log.json`).
  5. Register: `updateStatus` (ingest/worksheet/blooketCsv=done, drills/animations/schoology/blooketUpload=skipped, urlsGenerated/committed=done) → `node scripts/export-registry.mjs` → `node scripts/build-roadmap-data.mjs` → `upsertLessonUrls('U.L',{worksheetUrl,quizUrl,blooketUrl})` → commit/push rebaked `ap_stats_roadmap_square_mode.html` + `roadmap-data.json`.
  - **Gotchas:** `codex-content-gen.mjs` has no resume guard but the *task-runner* skips when registry status=done — to re-generate a finalized lesson use `--force-step content-gen-worksheet --force-step content-gen-blooket` (task-IDs, not the CLI-documented `worksheet`/`blooketCsv`). Worksheet-gen timeout is now 35 min (`tasks/content-gen-worksheet.json`, raised from 20 in Agent 98bc49a) — covers the slow multi-video tail; a pipeline that still reports FAILED on timeout usually has complete artifacts (verify HTML ends `</body></html>` + grading file exists) and can be finalized manually, but a truncated HTML / missing grading file means re-run (rm the stub first, it can falsely satisfy the artifact check). Framework injects for both bold (`apstat_2`) and plain (`apstat_1/3`) header formats via the f0d9809 fix. If a regen FAILS on timeout, ALSO re-sync the registry status (the task-runner sets worksheet=failed; the regen finalize path skips registry re-sync, leaving a stale "failed" — this bit U1 L10). Full per-lesson detail + Drive IDs in auto-memory `project_aistudio_ingest_drive_picker.md`.
- **(j) ➡ ACTIVE — Bulletproof gradebook. Phase 0 LIVE + grading spec signed off + Sprint 1 shipped (s99); next = the TAGGING WORKSTREAM.** Live auth service: `https://roster-production-12c1.up.railway.app` (Railway `apstats-roster`/`roster`) on curriculum_render Supabase. Secrets in gitignored `roster-server/.env`: `ROSTER_TEACHER_SECRET=tagQc8e7mEXDUkqwYSYLqzH8` (enroll), `ROSTER_PROCTOR_SECRET=yzNdzBDr2BdpLnBlePlQplqr` (gates proctored ledger writes; set on Railway at activation). Commits: Phase 0 `a7d7bbd`, grading spec `e506b58`, Sprint 1 `d461ebc`. **Do NOT rebuild/redeploy Phase 0 or Sprint 1.** Sprint 1 audit forced the order: **tagging workstream FIRST** (AP-skill codes into the 4 pools — never edit sacred `curriculum.js`, use a wrapper) → Phase 2 (cr quiz feeder) → 3 (BKT skill_mastery + grade calc per `GRADEBOOK_GRADING_SPEC.md`) → 4 (teacher dashboard + remediation) → §6.4 adoption. Sprint 1 ACTIVATED & LIVE (migration run, roster-server redeployed, `ROSTER_PROCTOR_SECRET` set, prod-verified incl. L-C). Chore: `delete from roster where section='SMOKETEST';` (cascades to ledger test rows). Recall: `project_gradebook_grading_model.md`, `project_gradebook_phase0.md`.
- **(i) Full removal of `export-registry.mjs` from Agent repo** — deferred from s95. Touches `pipelines/lesson-prep.json` (DAG node + `commit-push` dep), `tasks/export-registry.json`, `scripts/lib/commander/panels/pipeline-steps.mjs` (status mapping), `backfill-registry.mjs`, and ~10 design docs. After removal, drop the two `.gitignore` entries in `follow-alongs/.gitignore` and delete the orphaned Step 7.5 from `lesson-prep.mjs`. Until done, every pipeline run regenerates two zombie files locally — annoying but not breaking.

## Regen commands

Regenerate `data/ti84-procedures.js` wrapper after editing `ti84-procedures-data.json`:

```bash
node -e "const fs=require('fs'); const d=fs.readFileSync('ti84-procedures-data.json','utf8'); fs.writeFileSync('data/ti84-procedures.js', '// Generated from ti84-procedures-data.json — do not edit directly\\nwindow.TI84_PROCEDURES = ' + d + ';\\n');"
```
