# APStat Park: one continuous board

The calendar doorway selects a local scene in the existing CanvasEngine. The canvas element, 220px height, background, 20x24 cat sprites, PlayerSprite physics, camera and keyboard handling stay the same. There is no second canvas, game panel, touch-control row or teacher group manager.

Students enter by walking left into the black doorway, pressing Up beside it, or clicking it. Arrows move, Space jumps, and Up enters a door. The starting doorway returns to the calendar; Escape also returns. At the goal, Up enters the unlocked door and a subsequent Up returns to the puzzle lobby. A separate Levels doorway near the start also returns to that lobby. Polls, armed gates, green light, voting doorways and live activities recall students and prevent entry while active.

## Three replayable levels

The opening cooperative sequence is adapted from original PICO PARK: use a friend's head to reach a ledge, jump the gap, press the bridge switch so everyone can follow, collect the key and ride the lift to the door. The switch also lowers a step for the student who gave the boost. One player carries the key; that player unlocks the door, then every connected participant enters. This is an adaptation to the board's dimensions and connection model, not a pixel-exact level-data port.

The existing site character, button and key images are reused. No recovered game scripts or newly extracted artwork are included. The gameplay reference is the [opening-level walkthrough](https://picoparkmobilewalkthrough.blogspot.com/2021/09/pico-park-level-1-puzzles-walkthrough.html). The lobby offers Hello together, Switchback (split across raised switch ledges), and Lift relay (use the central lift to reach an upper key route). Every door remains available; there is no forced hourly rotation. The relay keeps an inactive room for two hours. A relay restart resets progress.

A lone student gets a reachable step in the opening level. The new levels require up to two or three latched switches according to the players present. Requirements can ease when players disconnect, and never increase after a puzzle action; opened routes stay open. Once the bridge is open, the checkpoint lets returning students rejoin beyond it. The key returns to its original pickup point if its holder disconnects before unlocking the door. Late arrivals join the active attempt. An explicit entry after completion resets the level with a new attempt ID, clearing poses, key, switches and arrivals. Transport resumes never trigger replay. Returning before friends finish clears only the returning player's arrival. Completion checkmarks are stored per username on this browser, separate from attempt state; they do not lock levels or award grades.

## Connection behavior

Local physics never waits for network frames. Changed motion anchors are coalesced to at most two per second; stationary players send no motion. Peers interpolate sparse anchors and stop at the last known position during a gap. A reliable resting-position event repairs even a dropped final motion packet. They can be stood on using the board's existing stacking physics. Moving stacks may feel delayed on poor connections; the opening boost uses a stationary teammate.

The lift follows a local cycle anchored by the relay clock on resume. It sends no per-frame state. Resting positions, bridge, key, unlock and arrival are sequenced, retried, idempotent events. Revision probes run every 15 seconds; bounded replay or a compact summary repairs missed events. The outbox holds at most 16 intents and replaces pending movement with the latest pose when disconnected or backpressured. The park reuses the classroom socket and does not emit classroom_pos packets for park movement.

Rooms are keyed by the joined classroom section and chosen level, retaining the existing identity trust model. No grades or candy are changed. Protocol 3 is required before a client can allocate a room or occupy it; cached earlier clients receive PARK_UPDATE_REQUIRED.

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
- Relay levels.mjs describes the three scenes; session.mjs owns milestones; service.mjs binds joined students to period rooms.
