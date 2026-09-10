# APStat Park six-level cooperative release

## Scope and deliberate adaptations

Six choices, including all FOUR stages of World 1 as board-sized gameplay adaptations, plus paired-button and two-rider challenges. Minimum two distinct online identities. Keyboard and calendar canvas retained. Original site assets, no extracted game data. Moving blocks use authored rails. Weight thresholds scale with online count, capped at four riders for larger classes; two-person lift stays exactly two. This is not an exact geometry/physics port.

Pressure releases on departure; block pushing stops on release. Crate gates depend on interpolated physical dock position. Falls/hazard contact reset the shared attempt. Below two online students pauses the scene clock and progress without pretending a cooperative action succeeded. Completed levels replay from spawn on explicit entry; socket resumes retain the attempt.

Network remains event-based: at most two changed motion anchors/second per player, bounded reliable outbox/history, local interpolation. Held actions renew every two seconds with six-second leases. A 250ms relay maintenance check emits only mechanism transitions. Idle players are not displaced by sparse remote overlap; terrain carrying remains active.

## Validation

- `node --test railway-server/apstat-park/*.test.mjs` (curriculum_render): 70 tests, 70 pass, 0 fail. Includes two-player minimum on all six, identity deduplication, pressure release/expiry/disconnect, push contact and stop, actual crate docking, weighted thresholds at 2/3/4/8/24 students and exit capacity at 2/8/24, clock pause/reset, recovery, room isolation, replay and traffic bounds.
- `node --test apstat-park/*.test.mjs` (follow-alongs): 3 tests, 3 pass, 0 fail.
- `npx vitest run tests/classroom-board.test.js tests/classroom-board-level.test.js tests/classroom-board-terrain.test.js tests/classroom-board-shared-camera.test.js tests/canvas-engine-scenes.test.js tests/classroom-board-activity.test.js`: 6 files, 399 tests passed.
- `npx vitest run tests/pwa.test.js`: 1 file, 28 tests passed. Build 2026-09-10-rukr stamped through the build script.
- `node apstat-park/browser-smoke.mjs`: full combined run passed all six, 673 observed packets, zero page errors. Includes solo waiting, same canvas, six physical routes, reconnect after completion, explicit replay, held-Up exit, five classroom recalls and real Desk at 650px height. Injected remote-overlap regression protects stationary button holders. Test artifacts stay untracked under test-results/.

Existing tests intentionally changed from solo/latched-switch assumptions to two-player pressure semantics, protocol 4 and six levels. No grade, roster or worksheet behavior changes. Desk/service-worker/diagnostics edits are build stamps only.

## Review / deployment

Manual review checked scene/replica/service/session together. GitNexus staged scope: frontend medium, one park message flow; relay index omits the park symbols, so manual call-site and test review used. Unrelated classroom.js, server.js, AGENTS/CLAUDE, skills, logs and other work were excluded.

Local validation complete; deployment verification pending. Frontend goes first, then relay; protocol mismatch reports an update instead of admitting an incompatible client. Verify served assets, Railway deployment hash/status, health and throwaway-section websocket smoke before declaring live.

Limits: no authoritative server physics or anti-cheat; existing section/username trust model retained. Browser paths use two players; larger-group thresholds/completion are exercised as protocol tests, not 24 simultaneous physical browsers. No claim that spotty connections feel identical to a local console. Room progress remains in memory across connections, not relay restarts.
