# APStat Park: one continuous board

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
