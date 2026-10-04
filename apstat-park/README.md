# APStat Park: one continuous board

## Calculator Together (main room)

The student room is one continuous scrolling world with an orange floor. Walk
right toward **Make a five-number summary**; the entrance instructions scroll
away as the calculator platforms come into view, without loading another scene.
Push the numbered team block into the calculator zone to start. Its live counter
counts distinct students pushing against it, including a chain of pushers; merely
walking into the zone does not enroll anyone or start a timer. Docking locks those
names into the team. The camera follows continuously and the first 15-second
countdown starts together only once every selected student can see the full keypad.
Hold Shift to run at twice walking speed in
the calculator room; jump height and timing stay the same.
The original PushBox border comes from sheet rectangle 464,32,48,48, recovered
from `FUN_7ff72bb340f0`'s nine-slice UV table; `FUN_7ff72bb346a0` renders its numeric
counter. This activity adapts that counter to team selection, with relay-controlled
movement at 60 pixels/second. Stale pushing input stops moving the block after 350 ms.
The left doorway opens Jump together with Up. Escape returns to the entrance.
Crossing the doorway preserves the outgoing frame while the next scene loads,
then dissolves it over 320 ms. Both rooms share the responsive 750-unit canvas,
700-unit floor height, and 40-unit doorway at x=30. Pico's rendering is translated
and scaled into that space; its physics and relay coordinates remain unchanged.
Returning to the calculator uses the same handoff without flashing the old board.
The calculator mission uses the existing trainer's native JavaScript calculator
and `one-var-stats` procedure. A scenery renderer paints its live menus and results
in pixel lettering directly on the world background, with no green LCD panel.
It is a guided learning activity, not
the unrestricted ROM emulator. L1 starts with `4,6,7,8,10,12,13,14,18,20`.

Click or tap a key to press it immediately on your own calculator and place your
character on that tile. The camera holds the entire keypad in view. Left/Right
and Space remain optional movement controls; standing on a key for 900 ms presses
it on your calculator only. Each student has an independent engine-validated
history. Equivalent keys and forward shortcuts work without waiting for teammates.
Rapid clicks queue in order; retries use personal revisions to prevent duplicate
presses. Wrong keys change the real calculator state without awarding progress,
and students can recover through further input.

Each calculator checkpoint has 15 seconds. Only an engine-verified forward advance
starts a fresh countdown. Wrong keys, no-op presses, repeated menu keys, and
reconnecting do not renew it. Reaching the boxplot starts one 30-second timer for
the entire plot. All five value selections are accepted without individual
judgment, and the drawing follows those actual values. Only the fifth selection
checks the completed plot. An incorrect plot clears the five selections while
preserving calculator work and the original boxplot deadline; students can retry
until the clock runs out. If any selected student's countdown expires, the relay
freezes everyone's input for a one-second death animation, then respawns each
student at their earned checkpoint. Reaching the boxplot raises the original
orange flag (sheet rectangle 32,320,16,32) and preserves the calculator history.
After a death those students restart only the plot with a fresh 30 seconds;
students still on the calculator restart it. The reset door clears all checkpoints.
Old queued inputs cannot carry into the new attempt.

The canvas and controls have transparent backgrounds, so the surrounding calendar
DOM supplies their exact background, including live theme changes. Scenery text
uses the container's text color. Movement uses the same half-scale Pico profile
as Jump together: fixed 60 Hz simulation, instant walking, variable tap/held jump,
and four-frame coyote allowance. Input press counters preserve taps between frames.
Small approach ledges make every calculator key reachable with the 39px held jump;
`calculator-motion.test.mjs` checks routes using the actual player collision code.
Pico jump, key-press switch, and completion sounds respect the existing mute toggle.
The comparison used the recovered `player_action_held.c`, `player_action_edges.c`
and `performance-review-2026-10-03/player-trace/run-1` experiments in the sibling
`not-school/hermes/old-app/recovered/reconstruction` tree. This room keeps one-way
key platforms and nonblocking teammates for independent solving; it is not a
copy of every Pico stage rule.
Repeated DOWN/ENTER requires stepping or jumping off and returning, or explicitly
clicking the tile again. A click never needs a standing hold.

After reaching the five-number summary, each student assigns the displayed
minimum, Q1, median, Q3 and maximum to their own proportional boxplot. The server
validates the result against the common dataset: `4,7,11,14,20`. As soon as the
boxplot appears, the calculator screen text disappears and the number and approach
ledges become translucent and stop supporting the character. Gravity carries the
character to the floor; clicking boxplot values leaves them there. When a student
finishes, their timer stops and a ready count shows the team's progress.
The reset door appears only when all students selected by the block have matching correct
boxplots, regardless of their key histories. Walk beside it and press Up to clear
all attempts, return the block and current participants to the entrance, and choose
a new team. No grades or currency
change. Solo play works.

Refresh/reconnect restores each student's own inputs; duplicate tabs count as one
student. Leaving retains both the student's work and their place in the locked
team; a five-player round still needs five matching boxplots. Walk-ins wait for the
next team. If the whole team leaves for 30 seconds, the abandoned round releases
the block so a new team can form. Stale standing choices stop counting after 1.5 seconds, inactive
connections leave after five seconds, and hiding the tab leaves immediately.
Teacher classroom calls recall students as with the Park.
Doors do not respond to mouse clicks. There are no visible instructions or buttons
below the playspace; status and summary announcements remain available to screen readers.

The full room loads at entrance. Calculator protocol 5 adds an untimed lobby with
world-coordinate poses and server-controlled block movement. Delivering the block
locks the roster; only those students may join the timed mission. Walking back
leaves active play without shrinking the roster. Mission poses use local coordinates.

Files: `calculator-room.mjs` (scene and trainer bridge), `calculator-display.mjs`
and `pixel-text.mjs` (scenery lettering), `calculator-mission.mjs`
(geometry and deterministic personal input rules), `calculator-lobby.mjs` (block
geometry and pusher selection), and the sibling relay's
`railway-server/apstat-park/calculator-service.mjs` (period-scoped authority).
The relay has byte-identical copies of both rule modules; the tests
pins that copy and the trainer route. No browser or backend import crosses repos
at runtime. Deploy the relay change before the frontend. An older relay leaves
the calculator waiting with an update message; Escape still returns to the entrance.
Calculator protocol 4 requires clients that understand whole-plot validation and phase-specific timers.

Validation: `node --test apstat-park/calculator-mission.test.mjs`, the existing
Park suites in both repos, and `calculator-browser-smoke.mjs` (same Playwright
environment options as `browser-smoke.mjs`). The latter runs a local relay and two
real browser clients through different routes, rapid clicks, timeout deaths and whole-team resets,
independent completion, refresh, team completion, re-entry, restart, keyboard motion,
mobile sizing, the original Park doorway, and teacher recall. Screenshots and the
result JSON go to `test-results/calculator-room` when `PARK_SMOKE_OUTPUT` is set
to that path. Both repositories' pre-push hooks still require orchestrator review
approval; implementation tests do not replace that release gate.

The relay vendors the native trainer under `calculator-native/` and uses
`calculator-runtime.mjs` to run it without a DOM. `calculator-engine.mjs` compares
screen content, cursor, field values, computed results, and modifier state;
it does not maintain a whitelist of equivalent key names. Parity tests pin every
vendored file to the trainer source. Deploy the relay before this frontend update.

STAT navigation verification (2026-10-04): CEmu running the local CE OS 5.8.2.0029
ROM showed `STAT, ENTER` opening the list editor. `STAT, RIGHT` selects CALC,
as documented in the TI CE Getting Started Guide. These are distinct paths.
The native engine previously entered an editor stub without repainting; it now
renders list columns, selection and numeric entries, and supports returning to
STAT. The scenery renderer consumes that editor state. Automated tests cover both
paths and a two-player editor detour during the mission.

This is still a native model, not full ROM execution. The sibling transpile report
lists 17.0149% byte coverage and its browser control-key report documents partial
semantics. Those figures do not establish whole-calculator fidelity. The initial
STAT/ENTER CEmu capture succeeded; subsequent automated CEmu scenarios failed and
were stopped, so they are not claimed as ROM verification. List formulas, named
lists, header editing, and other unimplemented calculator paths remain outside
the verified scope.

## ROM-derived behavior coverage

The production calculator is ordinary JavaScript. ROM analysis supplies evidence
for translating its behavior; the room and relay do not load or execute a ROM.
The first static contract is `ti84-trainer-v2/native/stat-rom-contract.json`.
Regenerate it in the sibling `ti84-transpile` repo with
`node TI-84_Plus_CE/semantic/extract-stat-menu.mjs`, or verify the saved artifact
with `--check`. The extractor reads the local ROM and SDK definitions, decodes in
ADL mode, checks instruction operands and pins the full ROM hash. It launches no
emulator. Copy the generated `semantic/stat-menu-contract.json` into the trainer
after reviewing any changes.

The normal STAT descriptor at `0x08709A` has EDIT/CALC/TESTS counts `5/15/18`.
The program-editor variant has `5/14/18`; confusing these omitted
`E:QuickPlot&Fit-EQ` from the trainer. The menu now includes that entry, though
its graph tool remains unimplemented. `calculator-stat-pathways.test.mjs` checks
all 38 cursor positions against arrow, ENTER and prefix selection rules (1,558
checks), including wrapping, tab cursor reset and invalid prefixes. It separately
checks that every selected row remains visible in the world display.

These are menu navigation checks, not proof that every selected command works.
The contract explicitly lists unresolved command handlers, paging, context
returns, list editing, wizard errors, and decimal arithmetic. Those must be
translated and verified before claiming all STAT pathways or 1:1 parity.

Mission milestones compare visible calculator states and wizard values. Unrelated
stored lists and stale prior results cannot reject a valid route; result milestones
still compare the computed statistics against the supplied dataset. Modifier
state is included, and printed game key legends normalize to trainer button IDs
before modifiers are applied. Client and server use byte-identical implementations.

## Original Park rooms

The calendar doorway selects a local scene in the existing CanvasEngine. The canvas element, background, 20x24 cat sprites, PlayerSprite physics, camera and keyboard handling are shared with the calendar. There is no second canvas, game panel, touch-control row or teacher group manager. A level taller than the 220px strip grows the board while it is open (level 6 is 240px) and every exit restores 220px.

One doorway sits at the left of the calendar board, drawn with PICO PARK's open-door sprite from the level-6 atlas (32x32, the same door as inside the level). The board preloads and decodes the atlas when it mounts and hands that same image to the level; until it is decoded nothing is drawn there (the door's hit area stays), and only if it can never load is a plain block in the page's text colour drawn instead. Standing on it and pressing Up, clicking it, or holding Left against the wall beside it opens **Jump together**, a faithful half-scale recreation of PICO PARK stage 1-1 (relay level 6). There is no lobby. Arrows move, Space jumps, and Up enters a door. Inside the park a key tap counts even when it is shorter than a frame, and held keys are released when the page loses focus or the tab is hidden. Inside the level the starting doorway returns to the calendar (Up on it, or walk left into it); Escape also returns. At the goal, Up enters the unlocked door and a subsequent Up returns to the calendar. Polls, armed gates, green light, voting doorways and live activities recall students and prevent entry while active.

The six earlier levels (Hello together, Switchback, Lift relay, Moving walls, Upstairs / downstairs, Weight together) remain in the relay with no door. The old door list is kept, commented out, as `PARK_DOORS_V4` in `classroom-board.js`, and the test-only `board.openParkLevel(n)` still opens any of them.

## Jump together (level 6, PICO PARK 1-1)

The relay's `levels.mjs` holds the level data compiled from the shipped `stage_jump01` map at half scale (1488x240, 24px tiles): two pits, two party-conditional stairs, a latch switch with an extending bridge, a party-scaled lift, a trailing key and the goal door on a high ledge. The site owner has the developer's permission to use PICO PARK's art and sounds; they live in `assets/` (`pico-1-1.png` is cropped from the game's sprite sheet by `assets/build-atlas.mjs`; `assets/pico-atlas.mjs` lists the rectangles).

- **Physics.** The level uses the `pico` profile (`physics.mjs`): fixed 60 Hz, measured PICO PARK walk, jump, held boost, gravity and coyote time; teammates block each other and can be stood on.
- **Poses.** The relay's body is 16x23 (pose = its top-left); the board sprite is the 20x24 cat, and the `pico` hitbox is that same 16x23 body at sprite (x+2, y+1), so stacked cats are 23 px apart on both sides. `pico-rules.mjs` `toPose`/`fromPose` is the only conversion: pose = sprite + (2, 1), so feet on the floor are the same y on both sides.
- **Party.** The party is online members who have not arrived; the *active* party also leaves out idle members. Stairs (`party` ranges), the party-of-one bridge and the lift's rider count follow the active party, so they can change mid-play: a block that appears around a cat lifts it onto its top, one that disappears lets it fall.
- **Alone.** One student can finish: the bridge is fully extended and the lift needs one rider. No "waiting for a friend".
- **Switch and bridge.** Entering the published trigger box sends one latch press; the bridge extends from the relay's scene-clock timestamp (60 px/s after 33 ms). Riders on the extending bridge are not carried.
- **Lift.** min(8, active party) riders raise it; the panel shows how many more are needed. Riders (on the lift, or stacked on a teammate over it) renew a `lift` hold every 2 s; a cat beneath a descending lift renews a `lift-under` lease and stops it locally, so it never sinks into anyone. Both leases stop (one release) after 120 s without keyboard input and resume on the next key, so an absent student holds nothing. A teammate registered as a rider is drawn on the lift at the stack level it boarded with for the whole ride, so a 2 Hz sample cannot drop a stack off it. The lift is solid from below and carries its riders exactly.
- **Key and door.** The key box sends the key pickup; the key trails its holder and opens the door when it reaches the door. It returns to its spot when its holder leaves or goes idle. Entry needs a fresh Up press on the ledge in front of the open door; after entering, the cat is inside the door (not drawn, not solid).
- **Falling.** The pits have catch zones: a falling cat reappears above the near side, stacked 25px higher for each teammate still dropping in, with no speed.
- **Hidden tab.** A tab hidden for 15 s leaves the park (as Escape does), so its student leaves the party at once; coming back, they re-enter at their last safe spot.
- **Re-entry.** Coming back resumes at the saved spot only if it rests on permanent ground (tiles or the resting bridge); otherwise at the nearest checkpoint to its left. A socket resume keeps the local position.
- **Entering.** From the Up press until level 6's data and art are ready, the board keeps showing the last calendar frame, frozen; then the level appears fully drawn and the board grows to 240 px in the same step. If the art is not ready 1.5 s after the scene mounts, the level draws with neutral flat shapes in its own palette, so a missing atlas never blocks entry. Nothing of the legacy scene is drawn on the way in.
- **Background.** The level paints the colour that shows behind the calendar strip: the first ancestor of the board with a background colour (on the calendar, `.window-content`, rgb(247, 245, 238)), re-read once a second; body, then white, as fallbacks. Entering and leaving does not change colour.
- **Cats.** One sprite source everywhere: the calendar strip's cats and the level's cats are drawn from the same atlas cells. A student's colour is their calendar hue turned into PICO PARK's body colour (`hue-rotate` of #ff8c8c, the colour the calendar always showed) and painted with the game's tint formula, so their cat is the same colour on the calendar, in the level, and on the edge markers. If the atlas cannot load, calendar cats are flat blocks in the student's colour.
- **Screen.** Each student's camera follows their own cat; teammates off screen show as coloured arrows at the screen edge. Cats are tinted with PICO PARK's eight player colours in member order, and a small triangle marks your own cat (above the key while you carry it). The status line teaches the wide pit when a cat stands on the top stair with a teammate beside it.
- **Sound.** Jump, switch, key/door and stage-clear sounds play only after a user gesture and follow the calendar's sound toggle (`localStorage['macsound-muted']`). There is no stage music: the site has no music preference to keep it off by default.

Teammate motion stays at no more than two updates per second over the relay; peers are interpolated between updates (prediction is a later stage). Riders of the lift are drawn on it rather than half a second behind it.

## Earlier levels (0-5, no door)

Levels 0-5 are protocol-4 adaptations for the 220px board and need two students online in the same period and level. Falling off the bottom wraps to the top above the last solid ground. The pillar in Weight together restarts the shared attempt. Held buttons release when the player steps away; crate buttons activate when the block reaches the pad; the weighted shelter needs half the online group (capped at four).

## Finding each other

While a student is on the calendar board (not in a level, no whole-class event running) `classroom-board.js` asks the relay (`park_lobby`, every 3 s) who is inside. The door shows one cat per classmate inside (up to three) and a line above it names them (two names then "+N", the viewer omitted). Only the student's own period is reported. An older relay that does not know the request leaves the door unlabeled.

## Connection behavior

Local physics never waits for network frames. Changed motion anchors are coalesced to at most two per second; stationary players send no motion. Peers interpolate sparse anchors and stop at the last known position during a gap. A reliable resting-position event repairs even a dropped final motion packet.

Lifts and blocks interpolate finite movements from authoritative start/target/time events on the relay's pausable scene clock; a lift resuming after a block may carry a start time in the future and holds until then. No per-frame terrain state is sent. Pressure, resting positions, key, unlock, arrival and retry are sequenced, retried events. Held inputs renew every two seconds with a six-second expiry; a refused hold waits before it is retried. Revision probes run every 15 seconds; bounded replay or a compact summary repairs missed events. The park reuses the classroom socket and does not emit classroom_pos packets for park movement.

Rooms are keyed by the joined classroom section and chosen level, retaining the existing identity trust model. No grades or candy are changed. The client speaks protocol 5 (it still accepts protocol-4 levels). On `PARK_UPDATE_REQUIRED` it asks the relay's lobby how many levels it knows: a relay without level 6 is the old side ("The park is updating. Try again in a few minutes."); otherwise this page is ("A newer park is ready. Reload the calendar to enter it."). Either way there is no retry loop. The board imports `apstat-park/panel.mjs?v=<APP_BUILD>` and every park module passes that query on to its imports, art and sounds, so a page never mixes modules from two deploys; the service worker caches them per URL like any other asset.

## Verification and release

### Calculator curriculum rounds

The calculator game covers all 31 procedures in `ti84-procedures-data.json`.
The relay chooses one shared mission when the block-selected team is ready.
It uses the authenticated B/E section, `data/lesson-schedule.json` dates mapped
through `data/ti84-lesson-map.json`, and today's date in America/New_York.
A shuffled bag covers the currently taught skills before repeating; newly
dated skills join immediately. Undated bonus procedures are implemented but
excluded until the calendar assigns them a date. An empty pool waits without
starting a deadline. Calendar dates are the unlock rule, not individual mastery.

Every player gets the same problem and solves their calculator independently.
Each engine-confirmed advance earns 15 seconds; incorrect/no-op keys do not.
The follow-up result challenge has one 30-second deadline across whole-answer
retries. Its checkpoint survives team deaths. Histograms, modified boxplots,
scatter/residual plots, regression, probability/cutoffs, intervals, tests,
matrices, and sampling each have an appropriate result construction. Numerical
choices use five significant digits. The completion door requires everyone and
returns to the block lobby; the next delivered block draws another skill.

The catalog uses the first canonical trainer problem per skill (the original
five-number-summary dataset is preserved). Routes are generated by pressing
real engine keys through field entry, not by setting a final result. The
native engine remains a reimplementation, not a claim of full ROM parity:
random draws use its seeded generator and histogram bins use its data fit.
The original ROM is not executed. Browser and relay vendor identical engine,
catalog, and rule modules. Calculator protocol is 6; Pico protocol remains 5.

After changing trainer problems, routes, or the calendar, regenerate and sync:

```powershell
node scripts/build-park-curriculum.mjs
node scripts/sync-park-calculator.mjs
npm run test:park
```

`calculator-curriculum-browser-smoke.mjs` solves every skill by mouse on the
real local relay and captures desktop/mobile results. Its authenticated fixture
skips block travel and pins skills, including future/bonus skills, only in that
test process. `calculator-browser-smoke.mjs` separately exercises real team
block travel, timer failures, checkpoints, and door navigation. Relay
`calculator-rotation.test.mjs` checks date gating and shared round lifecycle.
Run native tests from `ti84-trainer-v2/native` with
`../../node_modules/.bin/vitest.cmd run --config vitest.config.js`.

Pico goal completion fades the scene objects toward white while preserving the
calendar background. After an 800 ms lead-in, `CLEAR!` slides from the left to the
viewport center over one second and stays until the player exits. The timing and
slide curve follow recovered `FUN_7ff72bb2bbf0` (phases 21/22) and
`FUN_7ff72bb2c2c0` (`t * (640 + t)`, capped at one second). The 72% whitening and
responsive lettering adapt that presentation to this desk. It starts only on
team completion and clears on retry/reentry. `stage-clear-browser-smoke.mjs`
checks the real relay goal arrivals, pixel whitening, desktop/mobile centering,
and a fresh round; its fixture skips the platform route.

- Frontend: `npm run test:park` (node --test `apstat-park/*.test.mjs`: sparse motion, replica, lobby/door pins, and `pico-rules`/`pico-scene` tests for pose conversion, party terrain, bridge, lift, catch zones, re-entry, trigger boxes, sound gating). These import the sibling relay worktree's `levels.mjs`/`session.mjs`. Plus Vitest `tests/park-physics.test.js` and `tests/park-board-height.test.js`.
- Relay railway-server: `npm run test:park`. These tests import the sibling frontend replica.
- Real browser: `node apstat-park/browser-smoke.mjs` (in-process relay, never production). Needs the sibling relay, Playwright and Chromium/Edge: `PARK_PLAYWRIGHT_MODULE` and `PARK_BROWSER` can point to installed copies; `PARK_SMOKE_OUTPUT` selects the artifact directory, `PARK_SHOTS` the level-6 screenshots, and `PARK_LEVEL_FILTER=6` (or `0,3`) runs a subset, and `PARK_LATENCY_MS` / `PARK_JITTER_MS` delay every relay message each way (latency + uniform jitter, in order). Level 6: solo by keyboard, two students the real way (stack on the top stair, carrier walks off, rider jumps to the bridge, switch, lift, key, door), both pits, leave and re-enter, a protocol-4 client, a simulated pre-level-6 relay, and three students riding the lift with one stacked on a teammate at 150 ms + up to 150 ms jitter each way; then levels 0-5 through `openParkLevel`, and the real calendar's single door with the board growing 220 -> 240 -> 220.

Run `node scripts/bump-build.mjs` before every release touching board or park modules. APP_BUILD, version.json and service-worker BUILD must match. **Deploy the relay first** (it serves protocol-4 clients unchanged and adds level 6 for protocol 5), **then the frontend**. A frontend that reaches an old relay shows "The park is updating. Try again in a few minutes." instead of a broken level. Review both repositories together and obey the independent pre-push review gate.

## Code

- classroom-board.js supplies the engine, camera, input and sprite factories, draws the door and polls occupancy, and handles classroom recall.
- board-scene.mjs assembles scenery and actors into CanvasEngine.sceneEntities and runs the fixed step; level 6 delegates to pico-scene.mjs.
- pico-scene.mjs (level 6 terrain, mechanisms, intents, drawing), pico-rules.mjs (pure rules shared with the tests), pico-art.mjs (atlas, tinted cats, tiles), pico-audio.mjs (gated sound effects).
- panel.mjs handles socket binding, replay and lifecycle for one level; it creates only a status line.
- replica.mjs handles reliable events; remote-motion.mjs interpolates bounded peer anchors.
- Relay levels.mjs describes the seven scenes; session.mjs owns milestones; service.mjs binds joined students to period rooms.
