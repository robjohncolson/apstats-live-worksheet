# APStat Park: the calendar doorway

APStat Park is an original cooperative puzzle space inspired by PICO PARK. It is embedded in the calendar's existing character area. Teacher-created groups, start/pause/next/end controls, and the modal park window are retired.

## Entering and playing

- A black doorway stays visible in the signed-in calendar character area, including short screens. Walk into it, press Up beside it, or click/tap it.
- Entering changes the contents of the same 220px character strip, keeping its background, typography and character scale. There is no separate framed game panel or layout resize. The bundled door, button, coin and character sprites are reused.
- Everyone in the same classroom period enters the same park automatically. The teacher cockpit does not show the doorway. No teacher needs to go live, create a group, or start a puzzle.
- Arrows or A/D move; Space jumps; E or Up collects, delivers, lights a switch, or enters a door. Touch controls provide the same actions.
- Exit to calendar, Escape while the canvas is focused, or the black calendar door returns to the original classroom scene. The door accepts Up/E or a click. Exit keys cannot reopen the park through the restored calendar, including held-key repeats.
- Polls, gates, green light, voting doorways and live activities recall students to the classroom and prevent park entry until the activity ends.

## Puzzles and hourly selection

Three original layouts rotate: Build a bridge together, Gather the whole sample, and Pass it on. Four shared stations control the bridge. They are independent of the number of players. Anyone can collect or deliver a sample and light a station; an absent collector never locks a task. Play alone or share the work with classmates.

The relay selects a featured layout using the UTC epoch hour modulo three. At an hour boundary, an active attempt stays intact until everyone still connected has reached the finish, with at least eight seconds to celebrate. If everyone explicitly exits, the next entry can take the current featured layout. A socket interruption is not an explicit exit: reconnecting retains the attempt across the hour boundary. An empty room can rotate after three minutes without a socket, as well as after an explicit last exit. Rooms without active bindings are reclaimed after two hours of inactivity.

Late arrivals receive saved shared milestones. Re-entering or reloading restores the finish position if already arrived, otherwise the bridge checkpoint if opened, otherwise the starting doorway. Rotation uses a unique level ID so delayed actions cannot apply to another hour's puzzle.

## Network behavior

Physics and collision run locally at 60 Hz. Other players are visual companions, not physics bodies. Puzzles avoid requiring synchronized jumps or player stacks over unreliable connections.

The relay owns membership, presence and durable milestones. It does not simulate physics, broadcast full worlds per frame, or distribute a native engine memory image. Small movement anchors are capped at two per second per client, interpolate locally, and stop transmitting while idle. Backpressure drops movement rather than queuing old positions. A 15-second revision probe recovers a missed final event and checks rotation; it is not a game-state polling loop.

Actions use a bounded 16-intent outbox, sequential acknowledgments and deduplication. Each stream retains 16 receipts; each room retains 128 durable events before falling back to a compact entry/resume summary. Four tabs per member can coexist, with inactive stream slots safely reclaimed. Sections never share progress. Up to 64 unique members fit a period's room; up to 32 rooms fit the relay.

A 24-player continuous-motion simulation at two updates/second measured about 7.6 KB/second received per player and 313 bytes/second sent per player, excluding WebSocket framing, classroom traffic, initial entry and interactions. Stationary clients generate no motion traffic. This is an all-moving measurement, not a promise about total application bandwidth.

State is retained in relay memory. Connection interruptions recover within the retention window; restarting the relay resets puzzle progress. Existing classroom join identity remains the trust boundary. There are no grade or candy writes.

## Verification

Run `npm run test:park` in this repository and in the sibling relay's `railway-server` directory. Relay tests import the browser replica from the sibling `follow-alongs` checkout.

The browser smoke uses a local server and isolated classroom registry:

```text
node apstat-park/browser-smoke.mjs
```

It needs Playwright, the sibling relay checkout and Chromium. Set PARK_PLAYWRIGHT_MODULE to an installed playwright-core index.mjs and PARK_BROWSER to the browser executable if needed. PARK_SMOKE_OUTPUT chooses the screenshot/result directory.

The smoke walks into the door, clicks to join a friend, plays all three layouts with actual keyboard input, drops a socket, checks hourly rotation and reload checkpoints, tests a mobile-sized scene, and loads the actual calendar at 650px height. Production requests and sockets are blocked for the calendar test. It also checks that the old classroom activity keyboard handler does not intercept park controls, the strip dimensions do not change, and returning through the drawn door stays in the calendar. The return regression positions the classroom avatar inside its entrance before testing Up and held-key repeats.

Run `node scripts/bump-build.mjs` before every release touching the board or park modules. Verify APP_BUILD, version.json and the service worker BUILD agree; a cached retired client must not remain active against the new relay.

## Integration

- `classroom-board.js` creates the doorway, pauses the background scene during park play, and supplies its existing socket and sprite renderer.
- `panel.mjs` manages the inline scene and resumable connection.
- `game.mjs` renders the horizontally scrolling puzzle and controls.
- `world.mjs` owns local physics; `replica.mjs` owns reliable shared progress; `remote-motion.mjs` presents sparse peer motion.
- The relay's `apstat-park/service.mjs` binds students to period rooms; `session.mjs` owns milestones and rotation; `levels.mjs` defines the original puzzles.

Deploy the relay before the frontend. Old cached group-management requests receive PARK_SELF_DIRECTED and tell the user to enter through the calendar. Review the changed browser and relay code together.
