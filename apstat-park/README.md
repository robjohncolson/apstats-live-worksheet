# APStat Park: one continuous board

The calendar doorway selects a local scene in the existing CanvasEngine. The canvas element, 220px height, background, 20x24 cat sprites, PlayerSprite physics, camera and keyboard handling stay the same. There is no second canvas, game panel, touch-control row or teacher group manager.

Students enter by walking left into the black doorway, pressing Up beside it, or clicking it. Arrows move, Space jumps, and Up enters a door. The starting doorway returns to the calendar; Escape also returns. At the goal, Up enters the unlocked door and a subsequent Up returns to the puzzle lobby. A separate Levels doorway near the start also returns to that lobby. Polls, armed gates, green light, voting doorways and live activities recall students and prevent entry while active.

## Six replayable cooperative levels

At least two distinct students must be online in the same period and level. A lone student can walk and jump while waiting, and use the Calendar or Levels doors normally. Puzzle actions and completion wait for a second student. Falls while waiting respawn locally without resetting shared progress. Multiple tabs do not count as teammates. There is no solo assist or permanently latched pressure button.

World 1 contains four stages. The lobby presents adaptations of those four first, followed by two additional cooperative challenges:

| Lobby choice | Gameplay reference | Cooperation |
| --- | --- | --- |
| Hello together | World 1-1 | Head boost, hold the bridge button for friends, key and exit lift |
| Moving walls | World 1-2 | Push left to uncover the key, then push the wall into the gap; movable final step |
| Upstairs / downstairs | World 1-3 | Upper player holds a bridge; lower player places crates on buttons to unblock the upper route |
| Weight together | World 1-4 | Weight lowers a shelter beneath a moving pillar; collect the lower key and share a capacity-limited exit lift |
| Switchback | Paired-button challenge | Partners alternate holding opposite ends of three crossings |
| Lift relay | Two-rider challenge | Exactly two riders raise the lift; return for remaining friends |

These are original layouts adapted to the 220px calendar board and sparse connection model, not exact level-data ports. The [World 1 walkthrough](https://picoparkmobilewalkthrough.blogspot.com/2021/09/pico-park-level-1-puzzles-walkthrough.html) and [two-player challenges](https://picoparkmobilewalkthrough.blogspot.com/2021/09/pico-park-level-10-two-players-puzzle.html) establish the mechanics. Existing site cat/key assets are reused; no recovered game scripts or newly extracted art are shipped. Blocks follow authored movement rails rather than a shared rigid-body simulation.

Held buttons release when the player steps away. Crate buttons only activate when the actual block reaches the pad. Block pushing stops on release. The weighted shelter needs half the online group, rounded up and capped at four riders to fit the board; larger classes take turns. The final lift permits that many riders at once. The paired lift always needs exactly two, encouraging return trips for odd-sized groups.

The key holder unlocks the door and every connected participant enters. Falling or touching the moving pillar restarts the shared attempt. Dropping below two online players pauses puzzle mechanisms and the scene clock while allowing local exploration, releases pressure and stops pushes; it retains placed blocks, unlocked doors and arrivals. The key returns to its pickup point if its holder disconnects before unlocking. Late arrivals and replacement friends join the current attempt.

Explicit entry after completion starts a fresh attempt, clearing poses, key, gates and arrivals. Socket resume never triggers replay. Returning before friends finish clears only that returning player's arrival. Browser-local completion checkmarks use a protocol-4 key per username; they never lock a door or award grades. Every level stays available, without hourly rotation. Inactive rooms expire after two hours; a relay restart resets room progress.

## Connection behavior

Local physics never waits for network frames. Changed motion anchors are coalesced to at most two per second; stationary players send no motion. Peers interpolate sparse anchors and stop at the last known position during a gap. A reliable resting-position event repairs even a dropped final motion packet. They can be stood on using the board's existing stacking physics. Moving stacks may feel delayed on poor connections; the opening boost uses a stationary teammate.

Automatic lifts and the pillar follow the pausable scene clock. Weighted lifts and blocks interpolate finite movements from authoritative start/target/time events. No per-frame terrain state is sent. Pressure and push changes, resting positions, key, unlock, arrival and retry are sequenced, retried events. Held inputs renew every two seconds with a six-second expiry; a 250ms relay maintenance timer expires leases and detects dock arrival without broadcasting unchanged state. Revision probes run every 15 seconds; bounded replay or a compact summary repairs missed events. The outbox holds at most 16 intents and replaces pending movement with the latest pose when disconnected or backpressured. The park reuses the classroom socket and does not emit classroom_pos packets for park movement.

Rooms are keyed by the joined classroom section and chosen level, retaining the existing identity trust model. No grades or candy are changed. Protocol 4 is required before a client can allocate a room or occupy it; cached earlier clients receive PARK_UPDATE_REQUIRED.

## Verification and release

- Frontend: `npm run test:park` for sparse-motion tests, plus Vitest board/terrain/camera/scene/keyboard suites.
- Relay railway-server: `npm run test:park` for milestones, key handoff, completion, room isolation, protocol migration, replay, stream churn and traffic bounds. These tests import the sibling frontend replica.
- Real browser: `node apstat-park/browser-smoke.mjs`. Needs the sibling relay, Playwright and Chromium. PARK_PLAYWRIGHT_MODULE and PARK_BROWSER can point to installed copies; PARK_SMOKE_OUTPUT selects the artifact directory.

Run `node scripts/bump-build.mjs` before every release touching board or park modules. APP_BUILD, version.json and service-worker BUILD must match. Deploy the frontend first: it detects an old relay and explains that the park is updating. Then deploy the relay, which excludes old cached clients. Review both repositories together and obey the independent pre-push review gate.

## Code

- classroom-board.js supplies the existing engine, camera, input and sprite factories, and handles classroom recall.
- board-scene.mjs assembles scenery and actors into CanvasEngine.sceneEntities.
- panel.mjs handles socket binding, replay and lifecycle; it creates only a status line.
- replica.mjs handles reliable events; remote-motion.mjs interpolates bounded peer anchors.
- Relay levels.mjs describes the six scenes; session.mjs owns milestones; service.mjs binds joined students to period rooms.
