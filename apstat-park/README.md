# APStat Park

An original cooperative classroom platform game inspired by PICO PARK. Its puzzles
use saved contributions and forgiving timing. Movement and collisions run locally;
teammates help through shared actions rather than synchronized body physics.

## Playing

Open **APStat Park** from the classroom board. The teacher chooses one to eight
students, creates the group, and starts it. Students join their assigned group.
Use arrows or A/D to move, Space to jump, and E/Up to interact. Touch buttons are
also available. The teacher can pause, advance a stuck group, or end the session.

1. **Build a bridge together:** activate each player's switch, then reach the exit.
2. **Gather the whole sample:** jump to collect your sample before using your switch.
3. **Pass it on:** collect your parcel and deliver it to the next player's station.
   Each switch needs its incoming parcel. Solo players deliver to their own station.

Contributions stay saved. Players do not need to act simultaneously. Away players
are dimmed and named in a notice; the teacher can advance if someone cannot return.

## Implementation and network contract

The classroom button loads `panel.mjs`, which uses the existing classroom WebSocket.
The matching relay is `curriculum_render/railway-server/apstat-park`. Both sides
are wired into local application sources and must ship together. Deployment has
not been performed. Existing native experiments remain separate and are not loaded
by this entry point.

- `world.mjs` simulates the local body at fixed 60 Hz with local jumps and respawn.
- `game.mjs` renders locally and keeps controls responsive during a socket outage.
- `replica.mjs` orders pending actions and recovers acknowledged shared progress.
- `remote-motion.mjs` interpolates sparse teammate anchors with a 250 ms display
  delay. It freezes at the latest anchor when updates stop.
- Relay `session.mjs` validates assigned ownership, proximity, puzzle prerequisites
  and command sequence. It stores shared milestones, not server-simulated physics.
- Relay `service.mjs` derives identity and teacher privileges from the classroom
  registry, scopes groups, handles connection presence and suppresses backed-up sends.

Motion is capped at four small messages per second, goes only to other players,
and produces no updates while stationary. Unsent motion is replaced by the latest
pose; old movement is never replayed after an outage. Full world/engine snapshots,
native memory, animation and audio state are absent from the protocol.

A client retains at most 16 pending actions and retries only the head every 1.5
seconds. Sequence receipts deduplicate accepted and rejected commands. The relay
retains 128 durable events and 16 receipts per client record. Reconnect receives
missed events, or a compact level/progress summary if history is too old. Static
level definitions are sent at entry or summary recovery, not during motion.
A small revision probe every 15 seconds catches a missing final event.

Presence changes are durable events, emitted only when the set of connected park
members changes. Idle motion silence is not treated as disconnection. Multiple
sockets for one member preserve presence until the last leaves. Closing the panel
sends one leave message while retaining the classroom connection and saved progress.
Silent network failures become visible when the existing socket timeout detects them.

There are at most 32 groups and four client records per member. New tabs can reclaim
inactive records; active records are protected. Each allocation has a stream ID,
so old packets/receipts cannot affect replacements. Returning reclaimed clients
restore progress and retry current-level intents with fresh sequences; milestones
are idempotent. Groups expire after 30 minutes without activity from bound clients.
If two active tabs present the same cached client ID, the relay assigns the second
one a separate ID and the panel saves it for subsequent reconnects and reopenings.
Existing revision probes keep open idle panels alive. Cleanup is lazy, with no extra
timer or traffic. Relay process restarts require creating new groups.

## Verification

Run from `school/curriculum_render/railway-server`:

```sh
node --test apstat-park/*.test.mjs
```

Twenty-one relay/protocol tests cover ownership, group boundaries, teacher controls,
pause, duplicate actions, event gaps, compact recovery, stale levels, lost receipt
reasons, bounded queues/history, socket backpressure, handoffs for 1/2/8 players,
presence, idle operation, expiration, and 30 closed-tab replacements.
They also verify independent action sequences for tabs with copied client IDs.

Run from `school/follow-alongs`:

```sh
node --test apstat-park/world.test.mjs apstat-park/remote-motion.test.mjs
npx vitest run tests/classroom-board-level.test.js tests/classroom-board.test.js
```

Five physics/presentation tests and 342 existing classroom-board tests pass.
The physics tests include a simulated minute without network access.

Browser tools live in `hermes/old-app/apstat-park-tools` and run from `hermes/old-app`:

```sh
node apstat-park-tools/verify_board_entry.mjs
node apstat-park-tools/verify_browser.mjs --eight-players --full-route --rough
node apstat-park-tools/verify_idle.mjs
```

The entry harness uses the real classroom board, registry and park service. It
checks five panel reopenings, away notices, automatic board reconnect, preserved
progress and absence of native module requests. The route harness drives Chromium
students through all three levels using keyboard controls, with real WebSockets,
message delays, dropped acknowledgments and an actual socket interruption.
`--rough` uses 250 ms upstream and 750 ms downstream delay. Results are written to
`apstat-park-tools/results`. These local harnesses do not boot the production relay's
database-backed application, and the route drives students sequentially.

## Measured traffic

- Idle: 956 JSON bytes/minute per participant for four status request/response pairs;
  eight students plus teacher total 8,604 bytes/minute. No idle broadcasts.
- Eight simultaneously moving players, synthetic minute: 296,544 upstream bytes
  total and 2,175,936 downstream bytes after fanout. Each student receives about
  4,533 bytes/second. Motion goes to neither the sender nor the teacher.
- Full browser route measurements include startup, interactions and recovery and
  are recorded separately in `results/eight-player.json`, with per-member totals.
  The eight-player route passed with a 1,000 ms simulated round trip and nine
  dropped acknowledgments: 1,229,021 JSON bytes over 290.762 seconds for the group.
  This measurement preceded the final copied-client join fix; the final entry
  test and protocol tests separately verify that fix.

These counts exclude WebSocket framing and existing classroom heartbeats. The
synthetic movement test is a sustained-activity bound, not a prediction of every
classroom connection. The implementation supports the original three-level loop;
additional level design is future expansion rather than native-game reproduction.
