# TETRIS_HARDENING_SPEC.md — Study Break 1v1 robustness pass (session 24)

From the s24 5-lens audit (`tetris-audit` workflow): 15 confirmed findings, 0 money-theft.
Single-player is solid; the staked 1v1 multiplayer hangs/desyncs in normal-but-imperfect
network conditions. This pass hardens the transport, the scoring choke point, and the match
lifecycle. Money was already conservation-audited — untouched here.

## Fixes (theme → findings)

**A. Live-socket-on-demand** (MP-1 major, MP-4 minor, SB-1-integration major)
- New `studyBreak._liveWs()`: prefer `DogePresence.ws` if `readyState===1`, else `this.mpWs` if
  open, else null. The presence socket auto-reconnects (new object) so the cached `mpWs` goes
  stale → outbound game traffic silently dies. Use `_liveWs()` in `sendGameMessage`, `close()`'s
  `game_leave`, and `showChallengeDialog` accept/decline (which threw on a null `mpWs` in solo).

**B. Garbage-topout routes through the scoring choke point** (SB-1-state major)
- A garbage-induced topout with no active `flashText` skipped `drawGameOverCard` →
  `_studyBreakScoreGameOnce` never fired → series desync + stranded escrow. Fix: set a flash on
  the garbage topout AND make the 1v1 game-over draw branch fall back to the card whenever
  `mode==='1v1' && mpState` (not gated on `flashText`).

**C. Match-in-progress guard + lifecycle cleanup** (SB-3, SB-2-integration, F3, SB-2-state, SB-5)
- `startMatch`/`launchMatch`: ignore a new `match_start` while `mpState && !mpState.seriesOver`
  (don't clobber a live staked match → orphaned escrow).
- `challenge_received` (DogePresence 17157) / `showChallengeDialog`: auto-decline an incoming
  challenge while a match is live instead of popping the dialog over it.
- `close()`: null `mpState` UNCONDITIONALLY (was only in the socket-open branch); clear the
  countdown timer (store as `this.countdownTimer`).

**D. Stale cross-game message rejection** (SB-4)
- Stamp outbound game messages with `mpState.roomId`; reject inbound `opponent_ko` /
  `opponent_state` / garbage whose `roomId !== mpState.roomId`.

**E. ICE candidate buffering** (MP-3)
- Buffer remote ICE until `setRemoteDescription` resolves; flush after; `.catch` every
  `addIceCandidate`; guard `peerConnection` non-null.

**F. Lock-delay reset cap** (SB-1-core minor) — cap move/rotate lock resets (~15) to kill the
classic infinite-spin stall; reset the counter on spawn.

**H. Periodic escrow sweep** (F2, roster-server) — call `sweepStaleBets()` from `bet/resolve`
AND on a boot timer, so abandoned escrow refunds even if the class stops betting.

**I. z-order** (SB-3-integration) — `launchMatch` closes any open `_avatarMenu` popover (z400)
so it doesn't render over the game (z250).

## Deferred (noted, not in this pass)
- **MP-5** opponent-freeze watchdog + heartbeat ping (half-open/frozen-tab peer) — the most
  involved; the MP-1 fix + server sweep already cover clean disconnects. Follow-up.

## Verify
- `tests/study-break-stakes.test.js` (existing) + new pins for `_liveWs`, the garbage choke
  point, the match-in-progress guard, roomId stamping, the lock-reset cap. Adversarial re-review
  before push. roster-server tests for the sweep wiring.
