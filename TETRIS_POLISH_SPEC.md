# Study Break Tetris — polish build spec (2026-09-25)

Teacher asked: "investigate the Tetris game and all of its gameplay / student-interaction dynamics, polish it up, make sure all bugs are closed."
Method: 4 Codex investigators (core / ux / mp / life lenses) → 46 findings → 3 Codex verifiers (confirm / downgrade / dedupe) → 39 unique items → 3 sequential implementation batches (one file, disjoint function ownership per batch, each batch rebases on the previous) → adversarial review of the whole diff → root tests → commit.

Game = `const studyBreak = {` in `ap_stats_roadmap_square_mode.html` (~19720–22608). Tests: `tests/study-break-*.test.js` (80 pass at start). New tests go in `tests/study-break-polish.test.js` (create in batch A; B and C append `describe` blocks).

## Invariants (FINAL teacher decisions — a change that violates one is a bug)
- A confirmed forfeit (Esc×2) still REFUNDS the bet. No lobby mid-match. R never restarts a live game. No pause in a live 1v1. Cut squares do not shatter. Solo Tetris stays free. Candy stakes are real.
- Money: the server settles only on agreement and refunds on disagreement/timeout/sweep. The client must (a) never present an unfunded match as funded, (b) never stop trying to report a finished series while the outcome is non-terminal, (c) never let a stale room's messages score/garbage/KO a new game.
- The relay (`../curriculum_render`) is out of scope. Work with the message types it forwards: game_challenge, challenge_accept, challenge_decline, game_state, game_garbage, game_over, game_leave, rtc_offer/answer/ice.
- Edit in place, plain skimmable code, early returns, no new abstractions/wrappers/flags, preserve every existing function name (tests pin them by name). LF line endings. No commits. No build bump.


## Batch A — Money + match flow (1v1)

### mp-1 — A failed settlement request permanently disables retry and strands escrow until the sweep
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 1
- Where: _studyBreakResolveStakes, extract lines 1664–1678
- Repro: Complete a funded series, fail one player's POST /wallet/bet/resolve before it reaches the server, restore connectivity, and call the resolver again.
- Expected: Retry the same idempotent winner report until acknowledged; preserve unresolved settlement independently of the game screen.
- Actual: Line 1665 sets 'ms._resolved = true' before the request; line 1664 then rejects every retry. Errors become null or are swallowed at 1675/1678. The other player's report cannot settle alone, so candy remains unavailable until the server's stale-bet refund, and the legitimate winner loses the payout.
- Fix (minimal): In _studyBreakResolveStakes separate in-flight from acknowledged/terminal state; clear in-flight on failure and retry the identical room/winner report with capped backoff. Retain unfinished reports independently of mpState so close/rematch cannot discard them. Stop polling on settled/refunded or a classified permanent error; preserve the forfeit-refund policy.
- Test: Evaluate the resolver in a sandbox with _dogeWalletAction=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({ok:true,status:'settled'}); call it, flush promises, call again; expect(_dogeWalletAction).toHaveBeenCalledTimes(2).
- Touches: _studyBreakResolveStakes

### mp-2 — Settlement can precede escrow opening and is never replayed after the candy is debited
- Verdict: CONFIRMED · severity high · money-safety: yes · confidence 1
- Where: startMatch / _studyBreakArmStakes / _studyBreakResolveStakes, extract lines 1167–1171, 1629–1633, 1664–1675
- Repro: Delay B's bet/open request at the network while A's returns waiting. Finish two quick games and deliver both resolve requests while the database bet is still pending. Then release B's bet/open request.
- Expected: Begin the funded series only after escrow confirmation, or queue settlement until opening completes.
- Actual: 'this._studyBreakArmStakes();' (1167) is not awaited. The SQL resolver returns the existing non-open status without recording a report (0024_tetris_stakes.sql, tetris_bet_resolve). Both clients permanently set _resolved, then the delayed open can debit both stakes. The open callback only updates staked and draws (1631–1632); no reports are retried, leaving the new escrow until the stale sweep.
- Fix (minimal): Have _studyBreakArmStakes track a room-scoped opening operation and recheck waiting until confirmed open/opened. Gate countdown on confirmation and queue resolve behind it; retain pending financial work through close until acknowledged or voided.
- Test: Use deferred open in the real-method sandbox and a wallet spy; call _studyBreakArmStakes then _studyBreakResolveStakes before resolving open; expect(wallet.mock.calls.filter(([url]) => url === '/wallet/bet/resolve')).toHaveLength(0).
- Touches: startMatch, _studyBreakArmStakes, _studyBreakResolveStakes, close

### mp-5 — Independent round advance allows old KOs to win a new game and drops new-round attacks
- Verdict: CONFIRMED · severity high · money-safety: yes · confidence 1
- Where: startNewGame / sendGameMessage / opponentKO, extract lines 757–767, 1264, 1559–1582, 1655–1657
- Repro: Both players top out in game 1. A immediately presses R before B's KO reaches A; A starts game 2. Deliver B's game-1 KO. Alternatively, let one player skip ahead and send garbage while the other is still on the previous game-over card.
- Expected: Both sides agree on the finished round and readiness before starting the next; every attack/result belongs to one round.
- Actual: Line 763 increments gameNumber locally, while line 1264 stamps only roomId, which is shared by the entire series. opponentKO treats the delayed prior-round KO as a current win (1580). Conversely, garbage received before the slower player's advance is erased by 'ms.pendingGarbage = 0' (766). Auto-advance also differs by the loser's 600ms scoring delay even without R.
- Fix (minimal): Carry roomId/gameNumber in relay-preserved game_state control envelopes. Gate startNewGame until peer round-result/readiness agreement; reject stale-round KO/garbage and retain valid next-round traffic until transition.
- Test: In the real-object sandbox top out round 1, invoke the currently allowed startNewGame, then deliver its delayed opponentKO(0, sameRoom); expect(sb.state).toBe('running') (today it becomes gameover; if advance is deferred, retain the eventual post-agreement assertion).
- Touches: startNewGame, sendGameMessage, updateOpponentState, opponentKO, receiveGarbage, _studyBreakScoreGameOnce

### mp-7 — Near-simultaneous losses still disagree when a crossing KO takes more than 600ms
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 0.99
- Where: _studyBreakScoreGameOnce / opponentKO / startNewGame, extract lines 1644–1646, 1565–1579, 757–759
- Repro: Both players top out before receiving the other's KO. Delay each KO by 800ms but keep each game-over card rendering. A second variant is pressing R during the 600ms grace window.
- Expected: Both clients commit the same round result using the deterministic score/side tie-break.
- Actual: The fixed 'Date.now() - ms.gameOverAt < 600' grace (1644) expires and each counts a loss. The delayed KO is ignored by "if (this.state === 'gameover' && ms.gameScored) return;" (1579). R sets gameOverAt=0 (758), eliminating even that grace. Repeating this in the decider produces disagreeing reports and refunds an otherwise legitimate match. This is a remaining regression of B14's cross-KO fix.
- Fix (minimal): Track a round-tagged provisional result and exchange result/ack messages through game_state, which the relay preserves. Commit only an agreed result; apply the existing score/side tie-break to crossing losses. Gate startNewGame on completed reconciliation instead of zeroing gameOverAt; use the existing disconnect/refund path if acknowledgment never arrives.
- Test: Create two real-method sandboxes with opposite sides and local gameover, fake-clock gameOverAt set to now, equal scores, and one prior win each; advance 800ms, score each, then deliver crossing opponentKO calls; expect(a.mpState.myWins).toBe(b.mpState.oppWins). Today these become 1 and 2.
- Touches: _studyBreakScoreGameOnce, opponentKO, startNewGame, handleMpMessage, sendGameMessage

### mp-8 — Actual relay KO, garbage, and leave messages bypass room isolation
- Verdict: CONFIRMED · severity high · money-safety: yes · confidence 0.99
- Where: handleMpMessage / receiveGarbage / opponentKO, extract lines 907–916, 1501, 1559; relay server.js lines 2894–2897, 2910–2913, 2931
- Repro: Inject relay-shaped messages during a new match: {type:'garbage_incoming',lines:4}, {type:'opponent_ko',finalScore:0}, or {type:'opponent_left'}. These are the exact objects emitted by the sibling relay, including for traffic left over from another room.
- Expected: Only events identifying the current room may alter a funded match.
- Actual: The guard 'if (roomId && roomId !== this.mpState.roomId) return' (1501/1559) explicitly accepts missing IDs. The active relay reconstructs garbage and KO payloads without roomId, and the leave handler passes only data.reason (916). Outbound room stamping therefore provides no isolation for the decisive control events, despite the hardening spec's stale-message requirement.
- Fix (minimal): Send KO/garbage/voluntary leave as room-and-round-scoped controls inside game_state and validate before dispatch in updateOpponentState. Stop treating unscoped legacy controls as authoritative; use the existing heartbeat timeout for unscoped relay disconnects, preserving refunds.
- Test: In a running new-room smoke fixture call handleMpMessage({type:'garbage_incoming',lines:4}); expect(sb.mpState.pendingGarbage).toBe(0).
- Touches: sendGameMessage, updateOpponentState, handleMpMessage, receiveGarbage, opponentKO, opponentLeft, close, DogePresence.handleMessage

### mp-9 — The incoming-dialog collision policy retains a challenge the relay has already deleted
- Verdict: CONFIRMED · severity bug · money-safety: no · confidence 0.99
- Where: showChallengeDialog, extract lines 1063–1065, 1082–1088; relay server.js lines 2767–2772, 2797–2800, 2850–2856
- Repro: B is viewing A's incoming challenge. C challenges B before B answers. B's client automatically declines C and keeps A's dialog. B presses Accept on A's dialog.
- Expected: The visible Accept button refers to an outstanding relay challenge, and superseded challengers receive a clear outcome.
- Actual: Line 1065 says "if (this.pendingChallenger && this.pendingChallenger !== fromUser) { reply('challenge_decline'); return; }". But the relay stores a single challenges entry per recipient and C already replaced A. Declining C deletes that entry. Accepting the retained A dialog deterministically returns 'Challenge not found'; A waits until its local timeout.
- Fix (minimal): In showChallengeDialog's different-challenger branch, decline the newcomer as today, then clear the old timer/pendingChallenger and hide or disable the old dialog. Announce that the invitation expired or was superseded so no invalid Accept action remains.
- Test: In the smoke sandbox with a live socket stub, call showChallengeDialog('A') then showChallengeDialog('C'). Assert expect(sb.pendingChallenger).not.toBe('A').
- Touches: showChallengeDialog

### mp-10 — Closing or leaving the lobby does not withdraw consent to a pending outgoing match (also reported as life-7)
- Verdict: CONFIRMED · severity high · money-safety: yes · confidence 0.98
- Where: leaveLobby / close / _clearOutgoingChallenge / handleMpMessage, extract lines 1041–1048, 646, 1026–1029, 894–899
- Repro: Challenge B, then press Back to leave the lobby or close Study Break. B accepts within the relay's challenge window.
- Expected: An abandoned outgoing attempt cannot reopen the game and arm a new candy escrow without renewed consent.
- Actual: leaveLobby only changes display/mode/state. close calls '_clearOutgoingChallenge()' (646), which removes only local bookkeeping (1026–1029). The server challenge remains, and an eventual match_start invokes 'DogePresence.launchMatch(data)' when closed (897), then arms stakes at 1167. Closing the UI can therefore be followed by a new escrow debit.
- Fix (minimal): On explicit close or leaveLobby retain an abandonment marker for the outgoing target/attempt through expiry. Reject matching late match_start before launch/bet/open and send game_leave; preserve normal accepted incoming and still-pending avatar challenges.
- Test: In the smoke sandbox sendChallenge('Bob'), leaveLobby(), then handleMpMessage with its late match_start and a startMatch spy; expect(startMatch).not.toHaveBeenCalled().
- Touches: close, leaveLobby, _clearOutgoingChallenge, handleMpMessage, DogePresence.handleMessage, DogePresence.launchMatch

### mp-11 — An unconfirmed or failed stake handshake is presented as a funded match on one side
- Verdict: CONFIRMED · severity risk · money-safety: no · confidence 1
- Where: _studyBreakArmStakes / startMatch / draw, extract lines 1631–1633, 1167–1171, 2405
- Repro: A's bet/open returns waiting, then B's request fails for insufficient candy or never joins. Observe A's live HUD and compare B's. Also retry bet/open against an already-open row, whose SQL response is status:'open'.
- Expected: Distinguish awaiting consent, confirmed escrow, and failed eligibility; do not promise a pot before confirmation or silently continue the required staked 1v1 after failure.
- Actual: Line 1631 marks both 'opened' and 'waiting' as staked, although waiting has debited nobody. The HUD at 2405 immediately advertises 'pot 2'. B's failure merely leaves staked=false and gameplay continues, so the players see different financial terms. The same predicate does not recognize the existing-row 'open' status returned by the SQL idempotency branch.
- Fix (minimal): In _studyBreakArmStakes, distinguish awaiting, funded and failed outcomes; only opened/open mean funded. Recheck awaiting consent with a match-identity guard and bounded timer. In draw/drawGameOverCard, show pending or the actual failure reason instead of promising a pot or claiming no money moved before confirmation; clear the recheck timer on close/match replacement.
- Test: In a sandbox with valid mpState and _dogeWalletAction resolving {ok:true,status:'waiting'}, invoke real _studyBreakArmStakes and flush promises. Assert expect(sb.mpState.staked).toBe(false).
- Touches: _studyBreakArmStakes, draw, drawGameOverCard, close, startMatch

### mp-12 — The first finisher never learns whether the bet eventually settled (also reported as ux-12)
- Verdict: CONFIRMED · severity low · money-safety: no · confidence 1
- Where: _studyBreakResolveStakes / drawGameOverCard, extract lines 1669–1678, 2788–2793
- Repro: A reports the agreed series winner first and receives {ok:true,status:'pending'}. B then reports the same winner and the server settles. Leave A's result card open.
- Expected: A keeps a pending indicator until its card and wallet reflect the terminal settlement.
- Actual: Line 1675 handles pending with 'else ms.candyOutcome = null'. There is no polling or settlement subscription, and _resolved prevents another call. A's card falls back to 'R = rematch · Esc = exit' (2793); its wallet refresh at 1677 can occur before B settles. Only B reliably sees the payout.
- Fix (minimal): In _studyBreakResolveStakes retain pending and periodically resubmit the same idempotent report with bounded backoff until settled/refunded; update the matching card and refresh the wallet on terminal status.
- Test: Mock wallet response {ok:true,status:'pending'} in the real resolver sandbox, flush promises; expect(ms.candyOutcome).toBe('pending').
- Touches: _studyBreakResolveStakes

### life-1 — An opponent leaving during countdown resurrects a finished match (also reported as mp-4)
- Verdict: CONFIRMED · severity bug · money-safety: no · confidence 1
- Where: startMatch extract lines 1176-1188; opponentLeft lines 1595-1608
- Repro: Start a match, then have the opponent close Study Break while GET READY still shows 3 or 2. Let the remaining countdown ticks execute. Reproduced with the real object and controlled interval callbacks.
- Expected: The forfeit ends the series, retains the result card, and cancels countdown; the bet follows the existing refund policy.
- Actual: opponentLeft sets 'ms.seriesOver = true' (1604) but leaves countdownTimer running. Its guard only checks '!this.isOpen() || !this.mpState' (1177), then writes 'this.state = 'running'' (1184). The reproduced final state is running with seriesOver=true and a fresh active piece; heartbeat subsequently stops because the series is over.
- Fix (minimal): Clear and null countdownTimer in opponentLeft. Capture the match identity in startMatch and cancel its countdown callback unless the match remains current, unfinished and in countdown state.
- Test: In the smoke sandbox with fake timers call startMatch(), opponentLeft('quit'), then vi.advanceTimersByTime(3000); expect(sb.state).toBe('gameover').
- Touches: opponentLeft, startMatch

### life-4 — The single-pending challenge guard fails when entering through the avatar menu first (also reported as mp-6)
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 1
- Where: sendChallenge extract lines 982-995; Desk DogePresence.sendChallenge HTML lines 24227-24247; avatar action HTML lines 16423-16427
- Repro: Use a classmate's avatar Start a game action to challenge Bob. Before Bob responds, open Study Break, enter its lobby and challenge Carol. Let Carol accept and then Bob accept.
- Expected: Both entry points share one pending challenge and reject the second request, preserving the active relay room.
- Actual: DogePresence records challengePending, but studyBreak only tests 'if (this._outgoing)' (988), then overwrites the shared value with 'DogePresence.challengePending = target' (991). The controlled reproduction with challengePending='Bob' sent game_challenge to Carol. The relay's challenge_accept handler independently executes 'wsToRoom.set(challenge.fromWs, roomId)' (railway-server/server.js 2822) for each accept. The second match_start is ignored by the live-match guard, but the relay has already rebound the socket, disrupting the first match. This is a remaining integration regression of prior bug B9.
- Fix (minimal): Before sending in studyBreak.sendChallenge, reject if either _outgoing or DogePresence.challengePending is occupied. Report the existing target and do not overwrite it. Keep clearing conditional on the matching attempt in both entry points.
- Test: In a method sandbox set DogePresence.challengePending='Bob', _outgoing=null and a live socket send spy; call sendChallenge('Carol'); expect(ws.send).not.toHaveBeenCalled().
- Touches: studyBreak.sendChallenge, DogePresence.sendChallenge

### life-8 — Opening or reopening misses an already-active classroom signal
- Verdict: CONFIRMED · severity bug · money-safety: no · confidence 0.99
- Where: open extract lines 590-612; close line 658; onClassroomSignal lines 397-405; Desk onStateChange HTML lines 25533-25538 and launchMatch lines 24328-24339
- Repro: Let the teacher arm the gate or send Green Light while Study Break is closed, then open it without another classroom state transition. Alternatively receive the signal in-game, close and immediately reopen while it remains active.
- Expected: The opening HUD reflects the current teacher signal, including the cached signal that predates opening.
- Actual: The Desk caches '_lastClassroomSummary = summary' but forwards only while studyBreak.isOpen() (HTML 25536-25538). close writes 'this._classroomNote = ''' (658), and neither open nor launchMatch hydrates it from the cached summary. The signal stays absent until another state notification arrives. This is a lifecycle gap in implemented quick win Q14.
- Fix (minimal): After making the overlay visible in open and DogePresence.launchMatch, pass the existing _lastClassroomSummary to onClassroomSignal when defined. Keep the current ongoing onStateChange forwarding.
- Test: In the smoke sandbox close the game, set the sandbox's _lastClassroomSummary={greenlight:true}, and reopen without dispatching a classroom update. Assert expect(sb._classroomNote).toContain('GREEN LIGHT').
- Touches: studyBreak.open, DogePresence.launchMatch

### core-6 — Slow animation frames slow game time and reintroduce a live-match stall (also reported as life-9)
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 0.99
- Where: loop, extract lines 679-681: 'const delta = this.lastTime ? Math.min(40, ts - this.lastTime) : 16;' and 'this.update(delta, ts);'.
- Repro: Use a level-1 running fixture with an I at x=3,y=3, lastTime=1000 and isOpen()=>true. Call loop at timestamps 2000,3000,4000,5000,6000. Compare with the same five seconds delivered at 60Hz. A throttled/background tab or overloaded device creates this timing pattern without pressing Pause.
- Expected: Live 1v1 gravity and lock delays advance with elapsed match time, so frame throttling does not give one player extra placement time.
- Actual: Five seconds at 1Hz advance only 200ms of simulation and leave the I at y=3; at 60Hz it reaches y=8. The same clamp stretches the 500ms lock delay to about 13 seconds at 1Hz. Disabling the pause button does not prevent this alternate freeze path.
- Fix (minimal): In loop, accumulate elapsed running time and consume it through bounded simulation steps without discarding the remainder. Base step timestamps on simulation time and reset the accumulator on new runs/solo resume. Keep live-match liveness tied to simulation progress when rendering is suspended, preserving timeout refunds.
- Test: Use real loop in a sandbox with isOpen=true, state running, lastTime=1000, update=vi.fn(), draw stubbed and rAF stubbed; drive timestamps 2000 through 6000. Assert expect(update.mock.calls.reduce((sum, [delta]) => sum + delta, 0)).toBeCloseTo(5000, 0).
- Touches: loop, startLoop, togglePause, _startHeartbeat

### ux-8 — Offline rematch attempts report errors only in the hidden lobby
- Verdict: DOWNGRADE · severity polish · money-safety: no · confidence 1
- Where: requestRematch, extract lines 1033-1038; sendChallenge, lines 982-985; drawGameOverCard, lines 2816-2820
- Repro: Finish a series, lose the WebSocket connection, and press R or click the split screen to request a rematch. Runtime probe with _liveWs returning null wrote 'Not connected — try again in a moment' into lobby-status while _rematchNote stayed empty.
- Expected: The visible series card and live region explain that the rematch was not sent and can be retried after reconnecting.
- Actual: sendChallenge handles no socket with 'this._setLobbyStatus('Not connected \u2014 try again in a moment'); return;' (985). requestRematch clears _rematchNote before calling it (1036-1037). The series card reads only _outgoing.text or _rematchNote, so it continues to invite another R press without showing the error.
- Fix (minimal): Have sendChallenge expose its immediate send failure to requestRematch. On failure set _rematchNote, call _announce with that message, and draw the existing card.
- Test: In the sandbox set a completed mpState with opponent Bob and _liveWs=()=>null; call requestRematch(); expect(sb._rematchNote).toMatch(/Not connected/).
- Touches: sendChallenge, requestRematch


## Batch B — Core mechanics + lifecycle

### core-1 — Garbage overflow silently deletes the top of the stack instead of topping out (also reported as mp-3)
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 1
- Where: insertGarbage, extract lines 1526-1544: 'this.board.shift();' discards occupied rows; the only loss check is 'if (this.active && !this.isValid(this.active))'. lockPiece, lines 2066 and 2076: 'this.active = null;' precedes 'this.insertGarbage();'.
- Repro: On an otherwise empty 24x10 fixture, put a fragment at board[4][0], set mode='1v1', mpState.pendingGarbage=6, active=null, and state='running'. Call insertGarbage(), then spawnNext() with O next. This is the same active=null state used by the normal lock-time insertion path.
- Expected: Raising occupied cells beyond the allocated top boundary ends the game through _endGame; garbage must not erase the high stack and let play continue.
- Actual: The fragment is discarded, 54 garbage cells remain, and O spawns successfully with state still 'running'. The active-piece burial check cannot detect overflow on the normal path.
- Fix (minimal): In insertGarbage, inspect board.slice(0, count) for occupied cells before shifting. On overflow clear the pending batch, call _endGame('Garbage top out'), and return before permitting another spawn. Retain spawn collision handling for non-overflow batches.
- Test: Evaluate the real object in the smoke sandbox; set running 1v1, active=null, board[4][0] to a fragment and pendingGarbage=6; call insertGarbage(); expect(sb.state).toBe('gameover').
- Touches: insertGarbage

### core-2 — An exhausted type disables the drought guard for other overdue types
- Verdict: DOWNGRADE · severity low · money-safety: no · confidence 1
- Where: nextFromBag, extract lines 1798-1801: 'const i = this.bag.lastIndexOf(t);' is followed by an unconditional 'break;' even when i is -1.
- Repro: Set bag=['O','L'] and _since={I:15,O:14}, with the normal types order ['I','O','T','S','Z','J','L']. Call nextFromBag(). Such a state occurs near the end of the 63-piece bag after all I pieces have already been drawn.
- Expected: Skip overdue types absent from the remaining bag and promote an available overdue type, O in this fixture.
- Actual: The search stops on absent I, returns L, and increases O's drought to 15 even though O is available. Subsequent draws can keep ignoring other droughts until the absent early-priority type reappears.
- Fix (minimal): nextFromBag: continue when i < 0; break only after finding an available overdue type.
- Test: Evaluate the real object in the smoke sandbox; set bag=['O','L'], _since={I:15,O:14}; expect(sb.nextFromBag()).toBe('O').
- Touches: nextFromBag

### core-3 — Hold replacements inherit an exhausted lock-reset budget
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 1
- Where: holdSwap, extract lines 1928 and 1932-1934: 'this.active = replacement;' resets lockTimer and fallTimer but not lockResets; spawnNext line 1841 explicitly does 'this.lockResets = 0;'.
- Repro: Place support cells at row 5, columns 4 through 6. Spawn O at x=3,y=3, with O also in hold. Rotate the grounded O 15 times to exhaust its reset budget, then hold-swap. After 490ms of grounded time on the replacement, move right once and advance update by 16ms.
- Expected: The replacement gets its own 15-reset budget. Its first successful grounded move restarts the 500ms lock delay.
- Actual: holdSwap preserves lockResets=15. The move leaves lockTimer=490, and the next update locks the replacement and tops out. Empty-hold replacements use spawnNext and do reset the budget, so behavior depends on whether hold was occupied.
- Fix (minimal): In holdSwap, set this.lockResets = 0 when installing the valid replacement, alongside the timer resets. Retain the holdLocked guard.
- Test: Evaluate the real object in the smoke sandbox; put support at board[5][4..6], use active O at spawn and hold O, rotate 15 times, then holdSwap(). Assert expect(sb.lockResets).toBe(0).
- Touches: holdSwap

### core-4 — Rotating briefly airborne replenishes the entire lock-reset budget
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 1
- Where: _resetLockTimer, extract lines 1855-1859: the airborne branch executes 'this.lockTimer = 0; this.lockResets = 0;'; tryRotate line 1905 calls it after changing orientation.
- Repro: On an empty board put a support fragment at [22][3], and a T at x=3,y=20,rot=0. Set lockResets=15 and lockTimer=490. Alternate tryRotate(1), update(100,now), tryRotate(-1), update(100,now+100), repeating 100 cycles. Both rotations are valid: rot=0 rests on the support, while rot=1 is briefly airborne.
- Expected: Returning to the same landing height cannot buy unlimited new resets; the per-piece LOCK_RESET_CAP should eventually force a lock.
- Actual: The fixture stays running with the same T at y=20 after 20 seconds, lockResets=1 and lockTimer=100. Each airborne orientation restores the budget, defeating the hardening spec's anti-stall cap without using the already-fixed repeated firm-drop path.
- Fix (minimal): In _resetLockTimer retain the per-piece reset count when airborne and preserve accrued lock time once the cap is exhausted. Apply the same exhausted-budget preservation in update's airborne branch. Reset the budget for a newly spawned or held-in piece, not for an orientation change.
- Test: In the real-object sandbox set board[22][3], T at (3,20,rot=0), lockResets=15 and lockTimer=490; spy/stub lockPiece, alternate rotate/update as reported until it fires; expect(sb.lockPiece).toHaveBeenCalled().
- Touches: _resetLockTimer, update, holdSwap

### core-5 — Square hints can advertise a hole that the completing piece falls straight through
- Verdict: DOWNGRADE · severity low · money-safety: no · confidence 1
- Where: _hintAt, extract lines 2183-2187 check only clear cells above the hole; lines 2199-2200 return a hint after connectivity alone: "return { x, y, material: types.size === 1 ? 'gold' : 'silver' };".
- Repro: Place three vertical I pieces in columns 0,1,2, each occupying rows 18-21, with supporting fragments at [22][0..2]. Leave column 3 empty. Call _hintAt(0,18), then set active={type:'I',rot:1,x:1,y:3,id:4} and call getGhostY().
- Expected: A 'one piece drop away' hint appears only when the missing tetromino can actually come to rest in the four advertised cells.
- Actual: _hintAt returns a gold hint for the vertical hole at column 3, rows 18-21, but getGhostY returns 20, placing the dropped I in rows 20-23. The advertised square cannot be completed by that drop.
- Fix (minimal): In _hintAt, after connectivity succeeds, require at least one hole cell to have floor or an occupied non-hole cell immediately below it; otherwise the completing tetromino can descend and the hint must be null.
- Test: In the real-object sandbox, fill columns 0..2 at rows 18..21 with three whole I piece IDs and support only those columns at row 22; expect(sb._hintAt(0,18)).toBeNull().
- Touches: _hintAt

### core-7 — Buffered hold discards a simultaneously buffered rotation
- Verdict: CONFIRMED · severity polish · money-safety: yes · confidence 1
- Where: spawnNext, extract lines 1844-1846: 'if (buffered.rotate) this.tryRotate(buffered.rotate);' executes before 'if (buffered.hold) this.holdSwap();'; createPiece line 1819 sets 'rot: 0'.
- Repro: During the entry delay after hard drop, press C and X before the next piece spawns. For a direct fixture, use active=null, queue=['T','J','L'], hold='I', call _holdOrBuffer(), _rotateOrBuffer(1), then spawnNext().
- Expected: Both buffered actions affect the piece the player will control: hold brings in I and the buffered clockwise rotation rotates I.
- Actual: The code rotates the outgoing T, then holdSwap replaces it with an unrotated I. The rotation is lost regardless of which input was pressed first.
- Fix (minimal): In spawnNext, apply buffered hold before buffered rotation. Only rotate when the hold/spawn path leaves a valid active piece; preserve clearing _buffered before the nested spawn path.
- Test: In the real-object smoke sandbox, set running with active=null, queue=['T','J','L'], hold='I'; call _holdOrBuffer(), _rotateOrBuffer(1), spawnNext(). Assert expect([sb.active.type,sb.active.rot]).toEqual(['I',1]).
- Touches: spawnNext

### core-8 — Auto-repeat loses ARR time on every frame and moves slower at 30Hz
- Verdict: CONFIRMED · severity polish · money-safety: no · confidence 1
- Where: handleAutoShift, extract lines 1974-1976: a single 'if (now >= k.next)' moves once and then schedules 'k.next = now + this.DAS_REPEAT;'.
- Repro: After DAS is charged, set left.down=true and left.next=0 with a non-null active piece. Count calls to tryMove while calling handleAutoShift for one second at 60Hz and then 30Hz. The real method yields 21 versus 15 repeat attempts with DAS_REPEAT=48. On a real board, compare the time to traverse the same open horizontal distance.
- Expected: The configured 48ms ARR produces approximately the same repeat rate across ordinary display frame rates.
- Actual: At 30Hz each repeat waits two frames, approximately 66.7ms, because the fractional remainder is discarded. Horizontal movement is about 29% slower than in the 60Hz fixture despite matching DAS/ARR settings.
- Fix (minimal): In handleAutoShift advance next by DAS_REPEAT for each due repeat and process a small bounded number per call. Track direction transitions and rebase a reactivated direction's stale deadline to avoid a catch-up burst; discard excessive backlog after long suspension.
- Test: Run the real handleAutoShift with active={}, left held, next=0 and a tryMove spy over timestamps 0<=t<1000 at 60Hz and 30Hz; expect(Math.abs(at60-at30)).toBeLessThanOrEqual(1). Current probe differs by five.
- Touches: handleAutoShift, clearKeys

### life-2 — Opening an already-open game resets a live match without teardown
- Verdict: CONFIRMED · severity high · money-safety: yes · confidence 1
- Where: open extract lines 590-612; close lines 620-630; openGame lines 2899-2902
- Repro: During countdown or a running 1v1, invoke openGame() again, for example from the Special menu. The direct call reproduces the same path. Also try it during a running solo game.
- Expected: Repeated open focuses the existing game without resetting its board, mode, focus-return target, clock, or match lifecycle.
- Actual: There is no isOpen guard. The non-resumable branch executes 'this.mode = 'solo'; this.state = 'idle'; this.resetBoardState();' (601-603), while mpState, countdown and heartbeat survive. Split rendering context also survives although the split canvas is hidden (607). Runtime reproduction leaves mode=solo, state=idle, mpState.roomId intact, countdown alive, and ctx still pointing at the split canvas. A subsequent close skips game_leave because of 'if (this.mode === '1v1')' (626). Solo double-open also destroys the active run.
- Fix (minimal): Immediately after init in open, return when isOpen() is already true, optionally focusing the existing game surface; do this before replacing focus-return state or resetting mode.
- Test: In the smoke sandbox open and start a solo game; save active; call open again; expect(sb.active).toBe(active).
- Touches: open

### life-3 — Valid JSON with malformed score values can break game opening and the render loop
- Verdict: DOWNGRADE · severity risk · money-safety: no · confidence 1
- Where: _loadStats extract lines 1283-1288; _recordSoloResult lines 1290-1297; drawModeSelect lines 2882-2885; drawSoloGameOverCard lines 2739-2741
- Repro: Set localStorage[studyBreak._statsKey()] to JSON.stringify({best:{score:9},recent:[{valueOf:0,toString:0}]}), then open the game. A simpler corruption such as recent:['oops'] produces NaN in the displayed mean. The throwing example was reproduced against the extract.
- Expected: Malformed persisted records are discarded or repaired; the mode card, future records and animation continue working. Storage denial/quota failures should remain nonfatal.
- Actual: The loader only checks 'Array.isArray(raw.recent)' and accepts any truthy raw.best (1286). The later 'recent.reduce((a, b) => a + b, 0)' (2884) throws TypeError: Cannot convert object to primitive value outside the loader's catch. A draw failure inside loop occurs before its next requestAnimationFrame (705), stopping that chain. Invalid best values also prevent new best comparisons from recovering. Existing get/set exception catches handle malformed JSON and quota errors, but not malformed record contents.
- Fix (minimal): In _loadStats, retain best only when best.score is a finite nonnegative number. Filter recent to finite nonnegative numbers and keep its last ten values before returning. Keep the existing storage/JSON exception fallback.
- Test: In the smoke sandbox persist {best:{score:9},recent:[{valueOf:0,toString:0}]} under sb._statsKey(), with state idle. Assert expect(() => sb.draw()).not.toThrow().
- Touches: _loadStats

### life-10 — A deferred level-up sound survives closing or replacing the game
- Verdict: CONFIRMED · severity polish · money-safety: no · confidence 1
- Where: lockPiece extract line 2016; close lines 615-666
- Repro: Clear the line that advances a level, then close the game within 350ms or start another match before the delayed cue fires.
- Expected: Closing ends pending game feedback; a replacement game does not inherit a prior run's level-up sound.
- Actual: The cue uses an untracked 'setTimeout(() => SFX.play('indigo', 0.7), 350)' (2016). close clears heartbeat, countdown, challenge, auto-advance and RTC timers, but cannot cancel this callback and it has no open/run guard. It plays after exit. This is a short-lived stale callback, not an accumulating permanent listener or canvas leak.
- Fix (minimal): Store the delayed level-up timeout handle in lockPiece, replacing any previous cue. Cancel and clear that handle in close and resetBoardState so the callback cannot outlive its run.
- Test: Use the real lockPiece in the smoke sandbox with fake timers and a one-line clear advancing the level; close, clear the SFX.play spy, then advance timers 350ms. Assert expect(SFX.play).not.toHaveBeenCalledWith('indigo',0.7).
- Touches: lockPiece, close, resetBoardState

### life-11 — Lock-time garbage leaves an unreachable burial-loss branch and stale cleanup fields
- Verdict: DOWNGRADE · severity polish · money-safety: no · confidence 1
- Where: lockPiece extract lines 2066-2076; insertGarbage lines 1537-1552; startMatch line 1159; close line 622
- Repro: Trace every internal insertGarbage call: the only call is lockPiece line 2076, after 'this.active = null' at 2066. Exercise garbage reception and lock; the active-piece burial branch cannot run through any normal game path.
- Expected: Garbage handling and cleanup describe the reachable lock-time path; dead legacy branches should not masquerade as active loss handling or timer ownership.
- Actual: Both insertGarbage branches require 'this.active && !this.isValid(this.active)' (1539, 1544), which is always false at the sole call site. The buried-loss copy therefore remains unreachable despite the _endGame funnel refactor. garbageTimer is initialized/cleared but never assigned a timer now. Additional requested dead-code inventory: setupWebRTC has no caller (1334; intentionally disabled at 1193-1196), so its setupDataChannel, ICE, rtcTimeout and P2P-send paths are dormant in normal use; draw(cfg)'s optional configuration path (2331-2336) has no internal caller; _onChallengeOutcome's kind==='match' branch (1015) has no caller. The retained RTC plumbing is already documented in the prior review and is not a newly claimed connection or STUN regression.
- Fix (minimal): Remove insertGarbage's unreachable active-piece lift/burial branches and obsolete garbageTimer initialization/cleanup. Keep the explicit dormant RTC comment. Do not treat this cleanup as the overflow fix; core-1 still needs its explicit top-out check.
- Test: Using the real method source in the sandbox, add a cleanup source invariant: expect(sb.insertGarbage.toString()).not.toContain('this.active && !this.isValid(this.active)'). It fails today; no honest gameplay assertion should fail solely because this unreachable block exists.
- Touches: insertGarbage, startMatch, close

### ux-5 — Solo resume discards a live game whenever its stack is empty (also reported as life-5)
- Verdict: CONFIRMED · severity bug · money-safety: no · confidence 1
- Where: open, extract lines 599-604; close, lines 659-660
- Repro: Start solo, move or rotate the first piece, press Escape before it locks, and reopen Study Break. Runtime probe returned state='idle'. The same condition occurs after a perfect clear, despite a nonzero score and an ongoing run.
- Expected: An interrupted solo run resumes paused with its active piece, queue, score, and level intact, including when no settled cells remain.
- Actual: close preserves the run as paused, but open requires 'this.board.some((row) => row.some(Boolean))' (599). An empty stack triggers 'this.resetBoardState();' (603), silently discarding the saved run. This is an edge-case regression of implemented bigger B7's solo resume.
- Fix (minimal): In open, recognize a paused solo run without requiring settled cells; the existing paused state can represent resumability. Preserve its active piece, queue, score and pending spawn timer when reopening.
- Test: Use the real smoke object: startNewGame(), close() before any lock, then open(); expect(sb.state).toBe('paused').
- Touches: open


## Batch C — Input, accessibility, drawing

### ux-1 — Typing in another Desk input controls the open game
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 1
- Where: init keydown handler, extract lines 212-246 and 284-318; open, lines 594-609
- Repro: Start solo, focus a Desk text input while the overlay remains open (Tab is unrestricted, or focus the input programmatically), and type x, c, p, or a space. Runtime probe: dispatching x from the focused input changed active.rot from 0 to 1 and prevented the input event's default action.
- Expected: Editable targets receive typing; gameplay keys apply only when focus belongs to game controls. The modal should retain keyboard focus within its visible UI.
- Actual: The document handler checks only 'if (!this.isOpen()) return;' (213) and modifiers (216), then 'if (handled) e.preventDefault();' (246). It never checks the event target for input, textarea, select, or contenteditable. open only calls 'this.canvas.focus();' (609); it installs no focus containment. Typing can rotate, hold, pause, or hard-drop a piece.
- Fix (minimal): In init's keydown router, return for editable targets before intercepting gameplay shortcuts. Contain Tab within the visible game/dialog controls, and clear held keys when focus leaves the game input surface.
- Test: Using the smoke sandbox, start solo, focus an appended input, save active.rot, and dispatch a bubbling cancelable x on that input. Assert expect(sb.active.rot).toBe(previousRotation).
- Touches: init

### ux-2 — Native button activation is intercepted as gameplay
- Verdict: CONFIRMED · severity bug · money-safety: yes · confidence 1
- Where: init keydown handler, extract lines 229-246, 258-266 and 311-312
- Repro: Start solo, focus the mute button, and press Space. Runtime probe confirmed defaultPrevented=true and active became null from hardDrop. On the idle card, focus mute and press Enter. Also show an incoming challenge over solo, focus Decline, and press Space.
- Expected: Space and Enter activate the focused button without changing the board or starting a game.
- Actual: Only Enter on a focused challenge button gets a native-activation exception: 'if (key === 'Enter' && focused && focused.tagName === 'BUTTON' && challengeDlg.contains(focused)) return;' (231). Space elsewhere reaches 'if (!e.repeat) this.hardDrop();' (312). Enter on mute can start/resume/retry instead of activating mute. The challenge exception does not cover Space, so Decline can drop a piece without declining.
- Fix (minimal): In init's keydown listener, before gameplay preventDefault/routing, return for native Enter/Space activation on focused buttons and applicable links within the game UI. Preserve the challenge's explicit Escape handling and Enter-to-accept fallback when no button owns focus.
- Test: In the smoke DOM, start solo, save active, focus mute and dispatch a bubbling cancellable Space keydown on it; expect(sb.active).toBe(savedActive).
- Touches: init

### ux-3 — Touch rotate and hold still disappear during entry delay
- Verdict: CONFIRMED · severity medium · money-safety: no · confidence 1
- Where: _bindTouchControls, extract lines 542-551; _rotateOrBuffer/_holdOrBuffer, lines 478-485
- Repro: Tap Drop, then immediately tap rotate or Hold before the next piece spawns. Runtime probe: touch rotation left _buffered null; keyboard X in the identical state set _buffered.rotate to 1.
- Expected: Touch rotate/hold buffer during the same entry-delay window as keyboard rotate/hold.
- Actual: The touch press handler returns on 'if (this.state !== 'running' || !this.active) return;' (543), then directly calls 'this.tryRotate(1)' (549) or 'this.holdSwap()' (550). It bypasses the buffering added for keyboard controls. This is the touch-path regression of prior Q2's implemented entry buffering.
- Fix (minimal): In _bindTouchControls, gate all presses on running; route rotation/hold through the buffer helpers before checking active. Record held directions during entry delay and keep drop guarded by active.
- Test: Use smoke DOM with coarse pointer, running state, active=null and _buffered=null; dispatch pointerdown on data-act=cw; expect(sb._buffered?.rotate).toBe(1).
- Touches: _bindTouchControls

### ux-4 — Releasing one touch cancels another touch holding the same direction
- Verdict: DOWNGRADE · severity polish · money-safety: yes · confidence 1
- Where: _bindTouchControls, extract lines 545-567
- Repro: On a touch device, hold Left with pointer 1, press Left with pointer 2, then release pointer 1 while pointer 2 remains down. Runtime probe confirmed keys.left.down becomes false.
- Expected: Left remains held until the last pointer owning that action releases or is cancelled.
- Actual: Press writes one shared boolean, 'this.keys.left.down = true' (545), while every release writes 'this.keys.left.down = false' (554). pointerup, pointercancel, and lostpointercapture call release without a pointer identity (565-567). Pointer capture does not provide ownership for that shared boolean.
- Fix (minimal): In _bindTouchControls, track a Set of pointer IDs per held action. Remove only the released/cancelled ID and release the action when its set is empty; make lostpointercapture idempotent. Clear the sets in clearKeys.
- Test: In the coarse-pointer smoke sandbox, dispatch Left pointerdown(1), pointerdown(2), pointerup(1). Assert expect(sb.keys.left.down).toBe(true).
- Touches: _bindTouchControls, clearKeys

### ux-6 — First Escape's forfeit confirmation is silent to screen readers during play
- Verdict: CONFIRMED · severity medium · money-safety: no · confidence 1
- Where: _escapeNeedsConfirm, extract lines 357-365; flash, lines 2288-2291; updateHud, line 2316
- Repro: During a running 1v1, use a screen reader and press Escape once. Runtime probe confirmed the live region remained empty while the confirmation armed. Press Escape again within three seconds.
- Expected: The first Escape announces that a second Escape forfeits the match and that the bet is refunded under the existing policy.
- Actual: The confirmation only calls 'this.flash('Esc again to forfeit the match');' (364). flash delegates to updateHud, whose announcement is gated by 'this.state !== 'running'' (2316). The second Escape exits, although assistive technology received no confirmation prompt.
- Fix (minimal): In _escapeNeedsConfirm, explicitly _announce the second-Escape instruction, three-second window, and refund consequence when arming.
- Test: In a running live-match sandbox with an empty game-live element, call _escapeNeedsConfirm(); expect(document.getElementById('game-live').textContent).toMatch(/Esc.*forfeit/i).
- Touches: _escapeNeedsConfirm

### ux-7 — Live status remains Paused after resume and omits countdown progress
- Verdict: CONFIRMED · severity bug · money-safety: no · confidence 1
- Where: updateHud/_announce, extract lines 2301-2321; startMatch countdown callback, lines 1171-1189
- Repro: Start solo, pause with P, and resume with P. Read #game-live: runtime probing confirmed it still contains the paused message. Pause again without any intervening announcement. Separately start a 1v1 and observe the live region through 3, 2, 1, and game start.
- Expected: Announce pause and resume as distinct transitions, and provide a short audible countdown/start indication for a new match.
- Actual: 'if (this.state !== 'running' && prefix !== this._lastLive)' (2316) suppresses resume and leaves _lastLive equal to the paused prefix, suppressing a subsequent identical pause too. The countdown decrements and calls only 'this.draw();' (1178-1179); neither its number nor GO is announced. This leaves gaps in implemented Q19's transition announcements.
- Fix (minimal): Track the last announced game state in updateHud and announce resume once when entering running. In startMatch, announce the initial countdown, each positive tick, and game start without announcing per-move HUD updates.
- Test: With real togglePause/updateHud in the smoke sandbox, start solo, pause and resume. Assert expect(document.getElementById('game-live').textContent).toMatch(/resumed|running/i).
- Touches: updateHud, startMatch

### ux-9 — Hybrid touch devices can open a match without any usable touch controls
- Verdict: CONFIRMED · severity medium · money-safety: no · confidence 1
- Where: _bindTouchControls, extract lines 535-541; init, lines 339-342
- Repro: Initialize Study Break on a touchscreen laptop whose primary pointer is fine, then use its touchscreen or fold/detach the keyboard. Runtime probe with '(pointer: coarse)' false confirmed that the strip is not enabled; later touch input has no installation path.
- Expected: Available touch input enables the strip, including on hybrid hardware and after input-device changes.
- Actual: The one-time binding uses 'window.matchMedia('(pointer: coarse)').matches' (539) and 'if (!coarse) return;' (540), before registering any pointer handlers. init then sets initialized=true (342). This is an incomplete hybrid-device path in implemented bigger B1; the original finding explicitly proposed revealing controls on actual touch input.
- Fix (minimal): In _bindTouchControls, install handlers regardless of primary-pointer capability; reveal controls on actual touch pointerdown and optionally use any-pointer: coarse for initial visibility.
- Test: In a fresh smoke sandbox return matches=false for pointer:coarse and true for any-pointer:coarse, then init; expect(document.getElementById('game-touch').classList.contains('on')).toBe(true).
- Touches: _bindTouchControls

### ux-10 — Keyboard users cannot select a classmate in the lobby
- Verdict: CONFIRMED · severity bug · money-safety: no · confidence 1
- Where: updateLobby, extract lines 958-973; init lobby key routing, lines 241-244
- Repro: Open Study Break, press 2, and use only Tab, Enter, and Space to challenge an online Desk classmate.
- Expected: Each available classmate is a focusable, named action that can be activated by keyboard.
- Actual: The actionable row is generated as '<div ... onclick="studyBreak.sendChallenge(...)">' (970), with no tabindex, button semantics, or key handler. The lobby branch then returns for every key except Escape (242-244). Tab can reach Back, but cannot reach the classmate actions.
- Fix (minimal): In updateLobby, render available classmates as native type=button controls with their name in the accessible label. Render pending controls disabled. Preserve the existing lobby key-router return so Enter/Space activate natively.
- Test: In the smoke sandbox set DogePresence.locations.Bob.onDesk=true, mpOnlinePlayers=['Bob'], and no pending challenge; call updateLobby(). Assert expect(document.querySelector('#lobby-players button:not(:disabled)')?.textContent).toContain('Bob').
- Touches: updateLobby

### ux-11 — Narrow viewports crop both playfields instead of scaling them
- Verdict: CONFIRMED · severity bug · money-safety: no · confidence 0.99
- Where: init, extract lines 181-182; startMatch, lines 1134-1135; supporting HTML CSS lines 1071-1079 and 1314, split markup lines 2523-2531
- Repro: Open solo and 1v1 at a 320-CSS-pixel viewport, or zoom until the CSS viewport is that narrow. The game window becomes 307.2px wide, while the solo canvas remains 430px and the split row approximately 432px.
- Expected: Both complete boards and their controls fit the available viewport, through proportional scaling or an adapted split layout.
- Actual: The backing dimensions are fixed ('c1.width = 215; c1.height = 302;' at 1134), and there is no responsive CSS canvas width. '.game-content > canvas, #game-split { align-self: center; }' centers the oversized surfaces, while the window uses 'width: min(442px, 96vw)' and 'overflow-x: hidden' (HTML 1314). At 320px, clipping reaches the outer board columns in split mode and the solo side panels. This is the narrow-screen regression left by the implemented native-size geometry fix B15/bigger B1; DPR changes do not fix CSS overflow.
- Fix (minimal): Add responsive CSS max-width/height:auto for the solo canvas. Bound #game-split to available content width, permit its two wrappers to shrink, and size each canvas proportionally inside its wrapper. Keep the existing backing dimensions and pointer normalization.
- Test: Use the smoke sandbox in Vitest browser mode with the real game CSS, viewport width 320 and an open split match; expect([gameCanvas1,gameCanvas2].every(c=>{const r=c.getBoundingClientRect(),w=gameWindow.getBoundingClientRect();return r.left>=w.left&&r.right<=w.right;})).toBe(true). jsdom alone cannot validate clipping because it has no layout.
- Touches: CSS .game-content > canvas, CSS #game-split and child wrappers

### ux-13 — Series-card disconnect and rematch text can run off the split canvas
- Verdict: DOWNGRADE · severity polish · money-safety: no · confidence 0.99
- Where: drawGameOverCard, extract lines 2798-2820; opponentLeft, lines 1610-1616; _tickOutgoing, line 1010
- Repro: Play against a classmate named Alexandria, then have them disconnect, or request a rematch against a longer name. Render the resulting detail/footer on the 215px player canvas. For a deterministic fixture, pass 'Alexandria disconnected. You: 1200 | Alexandria: 980' as the flash text.
- Expected: The disconnect explanation, score, and rematch status fit inside the card and remain readable.
- Actual: The card is only 'const w = 212;' (2798), but 'ctx.fillText(detail, x + w / 2, y + 30);' (2808) and the footer fillText (2820) have no wrapping, measured truncation, or maximum width. Only seriesLine truncates the opponent name; detail and _outgoing.text retain it. Long ordinary names plus score/disconnect copy overflow the card and are cut at the canvas edge.
- Fix (minimal): In drawGameOverCard, measure and wrap or ellipsize detail/footer to w minus horizontal padding; reserve the corresponding vertical space. Keep the full strings available through the DOM help/live status.
- Test: Record fillText calls in the smoke canvas sandbox, draw the Alexandria disconnect card, and compute each detail/footer call's effective width as min(measureText(text).width, maxWidth if supplied). Assert expect(Math.max(...detailAndFooterWidths)).toBeLessThanOrEqual(196).
- Touches: drawGameOverCard

### ux-14 — Incoming-garbage count is painted over the player's score line
- Verdict: DOWNGRADE · severity polish · money-safety: no · confidence 0.98
- Where: draw 1v1 HUD, extract lines 2398-2400 and 2414-2422
- Repro: During 1v1, use level 21, 120 lines, score 1200, and pendingGarbage=6; draw the HUD. These values can also be set directly for a rendering fixture.
- Expected: Level/lines/score and the incoming-garbage warning occupy separate readable areas.
- Actual: The stats are drawn at '(this.BOARD_X, 14)' (2400); the right-aligned warning is drawn at '(this.BOARD_X + this.COLS * this.CELL, 14)' (2422), within the same 100px band. With the declared Arial fallback at 9px, the example stats measure about 90px and the warning about 22px: their combined widths exceed the band and overlap. The warning can obscure the very score it is meant to accompany.
- Fix (minimal): In draw's split HUD, put the incoming count on a separate baseline or in the existing meter gutter and reserve space for it. Keep the full stats label readable within its measured area.
- Test: Use the real draw method with a recording canvas context and deterministic measureText, level=21, lines=120, score=1200, pendingGarbage=6; compute the two labels' rectangles using recorded alignment; expect(rectanglesOverlap(statsRect,warningRect)).toBe(false).
- Touches: draw

### ux-15 — Reduced-motion preference does not suppress the decorative line-clear flash
- Verdict: DOWNGRADE · severity polish · money-safety: no · confidence 0.99
- Where: lockPiece, extract lines 2008-2009; draw, lines 2427-2437; loop, line 682
- Repro: Enable the operating system's reduced-motion preference, open Study Break, and clear one or more rows. Compare the clear animation with the preference disabled.
- Expected: A reduced-motion mode can omit the decorative bright row flash while retaining normal gameplay, scoring, and clear feedback.
- Actual: Every clear unconditionally creates 'this.clearFx = { board: snapshot, rows: fullRows, timer: 120 };' (2009). draw overlays 'rgba(255,255,255,0.85)' (2433), and loop runs its timer regardless of preference. The extracted game never queries prefers-reduced-motion; the app's CSS animation overrides cannot affect this JavaScript canvas effect.
- Fix (minimal): In draw, check the current prefers-reduced-motion preference and bypass the decorative clearFx snapshot/white overlay when requested, drawing the live board instead. Keep clearFx timing and scoring unchanged so reduced-motion users receive identical gameplay timing.
- Test: In the real-object sandbox stub matchMedia to return matches=true for prefers-reduced-motion, install a recording context, and draw with a visible clearFx row; expect(recordedWhiteFlashFillRects).toHaveLength(0).
- Touches: draw

### life-6 — Desk windows cover the game while its global keyboard handler still owns Escape
- Verdict: CONFIRMED · severity bug · money-safety: no · confidence 0.99
- Where: open extract lines 605-612; init keydown lines 212-250; Desk overlay CSS HTML lines 1014-1018, 1139-1158; _escCloseTopModal HTML lines 24418-24422
- Repro: Open Bulletin and click its title bar, then open Study Break or receive an accepted challenge. Also test receiving a match while the Do Now speed-bump is visible. Press Escape while the higher window remains on screen.
- Expected: The active game is visible and keyboard ownership follows the topmost surface. Escape on a covering modal should dismiss that surface rather than closing or arming forfeit in an obscured game.
- Actual: Game and app overlays initially share 'z-index: 250'; app markup follows the game, and the Desk raises clicked apps with 'ov.style.zIndex = ++_appTopZ' from 260 (HTML 23466-23471). Do Now is z320 (969). open only changes display and focus, so these surfaces remain above the game. The game listener checks only 'if (!this.isOpen()) return' (213), while the global modal safety net returns whenever game-overlay is visible (24420-24422). Thus a higher Do Now modal is not dismissed by that net, and Escape reaches the hidden game instead. The existing app-preservation Escape guard is present; the defect is stacking and topmost ownership, not the previously fixed blanket app destruction.
- Fix (minimal): Raise the game above ordinary app windows through the existing window stacking mechanism on open/launchMatch. Make the game listener defer to intentionally higher visible modals. Update _escCloseTopModal so its self-handled check defers only when that surface is actually topmost.
- Test: In the smoke DOM add a visible donow-bump-overlay above an open running solo game, include the real modal Escape dispatcher and dispatch Escape; expect(sb.isOpen()).toBe(true). Today the game handles Escape despite the covering modal.
- Touches: open, DogePresence.launchMatch, init, _escCloseTopModal


## Acceptance per batch
1. `npx vitest run tests/study-break-hardening.test.js tests/study-break-improvements.test.js tests/study-break-smoke.test.js tests/study-break-stakes.test.js tests/study-break-polish.test.js` all green.
2. Every item in the batch has at least one new assertion that fails on the pre-batch code.
3. Report: files changed, vitest summary verbatim, any item NOT done and why (do not silently skip).

## Outcome (2026-09-25, orchestrator)

- Batch A first attempt REJECTED and reverted: it rewrote the wire protocol (legacy relay messages ignored, round result/ack handshakes), gated the countdown on funding (free play parked forever), and changed 13 pinned behaviours. Copies kept in state/tetris-polish/batchA-rejected.*. Re-run with explicit per-item instructions (state/tetris-polish/build-A2.md) landed all 13 items in 172 lines.
- Batches B and C landed as specified (state/tetris-polish/build-B2.md, build-C2.md).
- Two adversarial reviewers (state/tetris-polish/review-1.json, review-2.json) -> 17 findings. Fixed: settlement retries no longer stop after two minutes (interval capped at 15s, report lives while the tab lives); 'Database error' and other non-allowlisted failures are retried, never shown as 'refunded'; a slow bet/open blocks the report at most 10s; stale-KO guard narrowed to game 2+ and 700ms; startMatch leaves the previous relay room before replacing state; avatar-menu challenges clear the abandonment marker; the match takes keyboard focus on start; the game-over help text keeps the Live Classroom note; funding confirmation polls at 2/5/10/20/40s.
- REJECTED (with reasons): "failed funding still starts a free 1v1" (free play is an invariant); every proposal to carry round/result metadata through game_state with peer acknowledgement or to stop applying legacy relay controls (breaks a classmate on the previous build; the relay strips fields); unbounded stacking of app windows (pre-existing Desk mechanism, not introduced here); jsdom-only layout tests (no browser harness on this host).
- Known residual: mixed builds (600ms vs 1500ms crossing window) can disagree on a tie at a simultaneous top-out; the server refunds on disagreement (money-safe) and the window closes once both students reload the new build.
