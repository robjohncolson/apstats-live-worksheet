# APStat Park — lobby occupancy ("find each other")

**Problem (teacher, 2026-09-15):** the park has six cooperative levels and a puzzle needs
at least two students in the SAME level. From the lobby a student cannot see who is behind
any door, so friends pick different doors and both wait. Students should be able to meet
without arranging it beforehand.

**Fix:** the lobby shows who is inside each level. Two pieces, one per repo.

## 1. Relay (`curriculum_render/railway-server/apstat-park/service.mjs`)

New request type `park_lobby`. Reply, for the caller's classroom section only:

```json
{ "type": "park_result", "requestId": "…",
  "levels": [ { "levelIndex": 0, "online": ["alice", "bob"] }, … ] }
```

- Always six entries (`levelIndex` 0..`PARK_LEVEL_COUNT-1`), `online` sorted, `[]` when no
  room exists for that level.
- Requires classroom identity (`identity(ws)` — "Join the classroom first"), but NOT a room
  binding. A lobby client has no binding; today every non-join request without a binding
  returns `PARK_STREAM_CHANGED`. `park_lobby` must be answered before that check.
- Reads only. Never creates a room, never touches `lastActivity`, `emptySince`, rotation,
  or the maintenance timer. May call `syncPresence(room)` on the section's rooms so stale
  bindings are pruned before reporting (that is the same prune a join does).
- Sections stay isolated: a Period B caller never sees Period E rooms.
- Add `'park_lobby'` to `types`. Tests in a new `lobby.test.mjs` (node --test, same harness
  as `service.test.mjs`): two students in level 3 + one in level 0 → correct rows; other
  section sees empties; unjoined socket gets a `park_error`; the call allocates no room;
  a dropped-socket member disappears after `detached`.

## 2. Frontend (`follow-alongs/apstat-park/`)

- `panel.mjs`: while in the lobby (`selectedLevel === null`) and the socket is open, request
  `park_lobby` every 3 s (`pump()` currently returns early in the lobby; it now polls
  instead). Keep the result in `lobbyOnline`; reset it whenever the scene changes. A failed
  or unsupported request (old relay) is ignored — the lobby just shows no names. The status
  line summarises non-empty levels: `Friends inside: Moving walls (avocado_koala) · Switchback
  (plum_deer)`; otherwise the existing walk-to-a-door hint.
- `board-scene.mjs`: `mountBoardScene` accepts `occupancy: () => levels`. Under the lobby
  each door draws the usernames inside it (the caller's own username excluded, at most two
  names then `+N`). A door with people shows `Up to join them` instead of `Up to enter` when
  the player is near it. Exported pure helpers `occupantLabel(names, max)` and
  `lobbySummary(levels, member)` carry the formatting so they can be unit-tested.
- Tests: `apstat-park/lobby-occupancy.test.mjs` (node --test via `npm run test:park`).

## Out of scope (round two, if wanted)

- Lobby occupancy ("at the doors: …") — needs the relay to track lobby presence.
- "Park · Moving walls" location chip in the Desk "Online Now" list — needs level in the
  presence packets.

## Release

Frontend first (`node scripts/bump-build.mjs`, push), then the relay (auto-deploys on push
to curriculum_render `main`). Old relay + new frontend = doors simply show no names.
