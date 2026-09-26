// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');
const start = html.indexOf('const studyBreak = {');
const source = html.slice(start, html.indexOf('\n};\n', start) + 3);
const dogeSource = html.slice(html.indexOf('const DogePresence = {'));

function fnSrc(name, src = source) {
  const start = src.indexOf('\n    ' + name + '(');
  const end = src.indexOf('\n    },', start);
  if (start < 0 || end < 0) throw new Error('Missing method ' + name);
  return src.slice(start, end + 6);
}
function method(name, src = source) {
  return new Function('return ({' + fnSrc(name, src) + '})')()[name];
}
function fixture() {
  const sb = new Function(source + '; return studyBreak;')();
  Object.assign(sb, {
    initialized: true, mode: '1v1', state: 'running', mpUsername: 'Me',
    overlay: document.getElementById('game-overlay'), canvas: document.createElement('canvas'),
    mpState: { roomId: 'r1', opponent: 'Bob', side: 'left', myWins: 2, oppWins: 0,
      gameNumber: 1, staked: false, _resolved: false, pendingGarbage: 0 },
  });
  for (const name of ['init', 'draw', 'drawOpponentBoard', 'updateHud', 'flash', 'submitLeaderboardScore',
    '_startHeartbeat', '_stopHeartbeat', 'updateLobby', '_renderMute', '_todayLessonDone']) sb[name] = vi.fn();
  sb._announce = vi.fn();
  sb.overlay.style.display = 'block';
  vi.stubGlobal('studyBreak', sb);
  return sb;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  document.body.innerHTML = ['game-overlay', 'game-split', 'game-lobby', 'game-score', 'challenge-dialog',
    'challenge-msg', 'challenge-timer', 'challenge-accept-btn', 'challenge-decline-btn', 'lobby-status',
    'p1-label', 'p2-label', 'doge-challenge-panel'].map(id => `<div id="${id}"></div>`).join('')
    + '<canvas id="gameCanvas1"></canvas><canvas id="gameCanvas2"></canvas>';
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
  vi.stubGlobal('SFX', { init: vi.fn(), play: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('_dogeWalletAction', vi.fn().mockResolvedValue({ ok: true, status: 'settled' }));
  vi.stubGlobal('_candyRefreshWalletUI', vi.fn());
  vi.stubGlobal('DogePresence', { ws: { readyState: 1, send: vi.fn() }, challengePending: null, launchMatch: vi.fn() });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Batch A', () => {
  it('mp-1: retries the identical report after offline failure, even after close and a new room', async () => {
    const sb = fixture(), ms = sb.mpState;
    _dogeWalletAction.mockRejectedValueOnce(Error('offline')).mockResolvedValue({ ok: true, status: 'settled' });
    await sb._studyBreakResolveStakes();
    expect(ms._resolved).toBe(false);
    sb.close();
    sb.mpState = { roomId: 'r2', opponent: 'Carol', myWins: 0, oppWins: 2 };
    sb.draw.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(_dogeWalletAction.mock.calls).toEqual([
      ['/wallet/bet/resolve', { matchId: 'r1', winnerUsername: 'Me' }],
      ['/wallet/bet/resolve', { matchId: 'r1', winnerUsername: 'Me' }],
    ]);
    expect(ms._resolved).toBe(true);
    expect(ms.candyOutcome).toBe('+1');
    expect(sb.draw).not.toHaveBeenCalled();
    expect(_candyRefreshWalletUI).toHaveBeenCalledOnce();
  });

  it('mp-12: pending keeps polling and redraws the matching card on refund', async () => {
    const sb = fixture();
    _dogeWalletAction.mockResolvedValueOnce({ ok: true, status: 'pending' }).mockResolvedValue({ ok: true, status: 'refunded' });
    await sb._studyBreakResolveStakes();
    expect(sb.mpState.candyOutcome).toBe('pending');
    expect(sb.mpState._resolved).toBe(false);
    expect(_candyRefreshWalletUI).not.toHaveBeenCalled();
    sb.draw.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sb.mpState.candyOutcome).toBe('refunded');
    expect(sb.draw).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('mp-1: uses 1/2/4/8/15 second backoff, keeps trying while the tab lives, and never runs two workers for one room', async () => {
    const sb = fixture(), times = [];
    _dogeWalletAction.mockImplementation(() => { times.push(Date.now()); return Promise.resolve({ ok: false, error: 'HTTP 503' }); });
    await sb._studyBreakResolveStakes();
    await vi.advanceTimersByTimeAsync(120000);
    expect(times.slice(0, 7).map(t => t - 10000)).toEqual([0, 1000, 3000, 7000, 15000, 30000, 45000]);
    // Review 2026-09-25 (R1-01): an outage longer than two minutes must NOT strand the report —
    // the honest winner would lose the pot to the sweep's refund. Only the interval is capped.
    expect(times.at(-1) - 10000).toBeGreaterThanOrEqual(105000);
    expect(vi.getTimerCount()).toBe(1);
    const count = times.length;
    sb._studyBreakResolveStakes();                      // same room: no second worker
    expect(times).toHaveLength(count);
    await vi.advanceTimersByTimeAsync(60000);
    expect(times).toHaveLength(count + 4);              // one retry per 15s, still going
    expect(sb.mpState._resolved).toBe(false);
    _dogeWalletAction.mockResolvedValue({ ok: true, status: 'settled' });
    await vi.advanceTimersByTimeAsync(15000);
    expect(sb.mpState._resolved).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('mp-1: a definitive rejection is terminal; transient and empty errors are not', async () => {
    // Review 2026-09-25 (R1-02): the roster-server answers a failed lookup/RPC with
    // {ok:false, error:'Database error'} — that is transient, never a completed refund.
    for (const error of ['offline', 'network', 'Internal Server Error', 'internal_error', 'Database error', 'HTTP 503', 'not a participant', undefined]) {
      const sb = fixture();
      _dogeWalletAction.mockResolvedValue({ ok: false, error });
      await sb._studyBreakResolveStakes();
      expect(sb.mpState._resolved, String(error)).toBe(false);
      expect(sb.mpState.candyOutcome).toBe('pending');
      vi.clearAllTimers();
    }
    // Only the server's explicit "nothing to settle" answers are terminal — and they are shown
    // as no candy moved, not as a refund.
    for (const error of ['no such match', 'unknown winner', 'winner must be a player', 'stakes disabled']) {
      const sb = fixture();
      _dogeWalletAction.mockResolvedValue({ ok: false, error });
      await sb._studyBreakResolveStakes();
      expect(sb.mpState._resolved, error).toBe(true);
      expect(sb.mpState.candyOutcome).toBe('none');
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('mp-2: settlement waits for opening, while countdown and gameplay do not', async () => {
    const sb = fixture();
    sb.mpState = null;
    let finishOpen;
    _dogeWalletAction.mockImplementation(path => path.endsWith('/open')
      ? new Promise(resolve => { finishOpen = resolve; }) : Promise.resolve({ ok: true, status: 'settled' }));
    sb.startMatch({ roomId: 'r1', opponent: 'Bob', side: 'left' });
    expect(sb.mpState._opening).toBeInstanceOf(Promise);
    await vi.advanceTimersByTimeAsync(3000);
    expect(sb.state).toBe('running');
    expect(sb.active).toBeTruthy();
    const settlement = sb._studyBreakResolveStakes();
    expect(_dogeWalletAction).toHaveBeenCalledTimes(1);
    finishOpen({ ok: true, status: 'opened' });
    await settlement;
    expect(sb.mpState._opening).toBeNull();
    expect(_dogeWalletAction.mock.calls[1][0]).toBe('/wallet/bet/resolve');
  });

  it.each(['offline', 'stakes disabled', 'insufficient candy'])('mp-2/mp-11: %s still starts free play', async error => {
    const sb = fixture(); sb.mpState = null;
    _dogeWalletAction.mockResolvedValue({ ok: false, error });
    sb.startMatch({ roomId: 'r1', opponent: 'Bob' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(sb.state).toBe('running');
    expect(sb.mpState.staked).toBe(false);
    expect(sb.active).toBeTruthy();
  });

  it('mp-11: waiting is unfunded; idempotent open retries are bounded at 2/5/10/20/40 seconds', async () => {
    const sb = fixture();
    _dogeWalletAction.mockResolvedValue({ ok: true, status: 'waiting' });
    await sb._studyBreakArmStakes();
    expect(sb.mpState.staked).toBe(false);
    expect(sb.mpState.stakePending).toBe(true);
    // Review 2026-09-25 (R1-09): a classmate whose bet/open lands ~20s in used to leave us on
    // 'pot pending' for the whole match; two more polls cover that.
    for (const [delay, count] of [[2000, 2], [5000, 3], [10000, 4], [20000, 5], [40000, 6]]) {
      await vi.advanceTimersByTimeAsync(delay);
      expect(_dogeWalletAction).toHaveBeenCalledTimes(count);
    }
    await vi.advanceTimersByTimeAsync(60000);
    expect(_dogeWalletAction).toHaveBeenCalledTimes(6);
    expect(vi.getTimerCount()).toBe(0);
    expect(fnSrc('draw')).toContain("ms.stakePending ? ' \\u00b7 pot pending'");
    expect(fnSrc('drawGameOverCard')).toContain("else if (ms.stakePending) statusLine = 'pot pending'");
  });

  it.each(['open', 'opened'])('mp-11: only confirmed %s funds the pot', async status => {
    const sb = fixture();
    _dogeWalletAction.mockResolvedValueOnce({ ok: true, status: 'waiting' }).mockResolvedValue({ ok: true, status });
    await sb._studyBreakArmStakes();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sb.mpState.staked).toBe(true);
    expect(sb.mpState.stakePending).toBe(false);
  });

  it.each(['close', 'opponentLeft', 'startMatch'])('mp-11: %s clears the opening retry timer', async action => {
    const sb = fixture(), old = sb.mpState;
    _dogeWalletAction.mockResolvedValue({ ok: true, status: 'waiting' });
    await sb._studyBreakArmStakes();
    const timer = old._stakeTimer;
    if (action === 'startMatch') { old.seriesOver = true; sb.startMatch({ roomId: 'r2', opponent: 'Carol' }); }
    else sb[action]();
    await vi.advanceTimersByTimeAsync(2000);
    expect(_dogeWalletAction.mock.calls.filter(([url, body]) => url.endsWith('/open') && body.matchId === 'r1')).toHaveLength(1);
    expect(timer).toBeTruthy();
  });

  it('mp-5: guards a stale KO at round start until opponent state is seen or 1500ms passes', () => {
    const sb = fixture();
    sb.mpState.myWins = 0;
    sb.startNewGame();
    expect(sb.mpState.roundStartedAt).toBe(Date.now());
    expect(sb.mpState.oppSeenThisRound).toBe(false);
    sb.opponentKO(0, 'r1');
    expect(sb.state).toBe('running');
    sb.updateOpponentState({ score: 0 });
    expect(sb.mpState.oppSeenThisRound).toBe(true);
    sb.opponentKO(0, 'r1');
    expect(sb.state).toBe('gameover');
    sb.mpState.gameScored = true;
    sb.startNewGame();
    vi.advanceTimersByTime(1500);
    sb.opponentKO(0, 'r1');
    expect(sb.state).toBe('gameover');
  });

  it('mp-7: an 800ms crossing KO still uses score and left-side tie-break', () => {
    const a = fixture(), b = fixture();
    for (const [sb, side] of [[a, 'left'], [b, 'right']]) {
      sb.state = 'gameover'; sb.score = 100;
      Object.assign(sb.mpState, { side, myWins: 1, oppWins: 1, gameOverAt: Date.now() });
    }
    vi.advanceTimersByTime(800);
    a._studyBreakScoreGameOnce(); b._studyBreakScoreGameOnce();
    expect(a.mpState.gameScored).not.toBe(true);
    a.opponentKO(100); b.opponentKO(100);
    a._studyBreakScoreGameOnce(); b._studyBreakScoreGameOnce();
    expect(a.mpState.myWins).toBe(2);
    expect(b.mpState.oppWins).toBe(2);
  });

  it('mp-8: P2P leave drops mismatched rooms, while legacy relay messages still work', () => {
    const sb = fixture(), channel = {};
    sb.setupDataChannel(channel);
    channel.onmessage({ data: JSON.stringify({ type: 'game_leave', roomId: 'old' }) });
    expect(sb.mpState.seriesOver).not.toBe(true);
    channel.onmessage({ data: JSON.stringify({ type: 'game_leave', roomId: 'r1' }) });
    expect(sb.mpState.seriesOver).toBe(true);
    const legacy = fixture();
    legacy.handleMpMessage({ type: 'garbage_incoming', lines: 2 });
    expect(legacy.mpState.pendingGarbage).toBe(2);
    legacy.handleMpMessage({ type: 'opponent_ko', finalScore: 0 });
    expect(legacy.state).toBe('gameover');
    legacy.handleMpMessage({ type: 'opponent_left' });
    expect(legacy.mpState.seriesOver).toBe(true);
  });

  it('mp-9: a superseded invitation disappears and its old accept closure does nothing', () => {
    const sb = fixture(); sb.mode = 'solo';
    sb.showChallengeDialog('Alice');
    const oldAccept = document.getElementById('challenge-accept-btn').onclick;
    sb.showChallengeDialog('Carol');
    expect(sb.pendingChallenger).toBeNull();
    expect(sb.mpChallengeTimer).toBeNull();
    expect(document.getElementById('challenge-dialog').style.display).toBe('none');
    expect(sb._announce).toHaveBeenLastCalledWith(expect.stringMatching(/superseded/));
    oldAccept();
    expect(DogePresence.ws.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(DogePresence.ws.send.mock.calls[0][0])).toEqual({ type: 'challenge_decline', from: 'Carol' });
  });

  it.each(['leaveLobby', 'close'])('mp-10/life-7: %s withdraws pending outgoing consent in both dispatchers', action => {
    const sb = fixture(); sb.mode = 'solo'; sb.mpState = null;
    sb.sendChallenge('Bob'); sb[action]();
    expect(sb._abandonedChallenges.Bob).toBe(Date.now() + 30000);
    sb.startMatch = vi.fn();
    const data = { type: 'match_start', roomId: 'late', opponent: 'Bob' };
    sb.handleMpMessage(data);
    method('handleMessage', dogeSource).call(DogePresence, data);
    expect(sb.startMatch).not.toHaveBeenCalled();
    expect(DogePresence.launchMatch).not.toHaveBeenCalled();
    expect(JSON.parse(DogePresence.ws.send.mock.calls.at(-1)[0])).toEqual({ type: 'game_leave', roomId: 'late' });
    vi.advanceTimersByTime(30001);
    sb.handleMpMessage(data);
    expect(action === 'close' ? DogePresence.launchMatch : sb.startMatch).toHaveBeenCalledOnce();
  });

  it('mp-10: a fresh outgoing challenge to the same classmate clears our own abandonment marker', () => {
    const sb = fixture(); sb.mode = 'solo'; sb.mpState = null;
    sb.sendChallenge('Bob'); sb.leaveLobby();
    expect(sb._abandonedChallenges.Bob).toBeGreaterThan(Date.now());
    sb.sendChallenge('Bob');
    expect(sb._abandonedChallenges.Bob).toBeUndefined();
    sb.startMatch = vi.fn();
    sb.handleMpMessage({ type: 'match_start', roomId: 'fresh', opponent: 'Bob' });
    expect(sb.startMatch).toHaveBeenCalledOnce();
  });

  it('mp-10: accepting an incoming invitation renews consent', () => {
    const sb = fixture(); sb.mode = 'solo';
    sb._abandonedChallenges = { Bob: Date.now() + 30000 };
    sb.showChallengeDialog('Bob');
    document.getElementById('challenge-accept-btn').onclick();
    expect(sb._abandonedChallenges.Bob).toBeUndefined();
  });

  it('life-1/mp-4: opponent departure stops countdown permanently', async () => {
    const sb = fixture(); sb.mpState = null;
    sb.startMatch({ roomId: 'r1', opponent: 'Bob' });
    sb.opponentLeft('quit');
    expect(sb.countdownTimer).toBeNull();
    await vi.advanceTimersByTimeAsync(3000);
    expect(sb.state).toBe('gameover');
  });

  it.each(['replace', 'seriesOver', 'state'])('life-1: countdown exits if match validity changes: %s', change => {
    const sb = fixture(); sb.mpState = null;
    sb.startMatch({ roomId: 'r1', opponent: 'Bob' });
    if (change === 'replace') sb.mpState = { roomId: 'r2' };
    if (change === 'seriesOver') sb.mpState.seriesOver = true;
    if (change === 'state') sb.state = 'gameover';
    vi.advanceTimersByTime(3000);
    expect(sb.state).not.toBe('running');
    expect(sb.countdownTimer).toBeNull();
  });

  it('life-4/mp-6: avatar challenges share the outgoing guard and only matching targets clear', () => {
    const sb = fixture();
    DogePresence.challengePending = 'Bob';
    expect(sb.sendChallenge('Carol')).toMatch(/Still waiting on Bob/);
    expect(DogePresence.ws.send).not.toHaveBeenCalled();
    sb._outgoing = { target: 'Carol' };
    sb._clearOutgoingChallenge(false);
    expect(DogePresence.challengePending).toBe('Bob');
  });

  it('life-8: open and avatar launch replay the current classroom signal', () => {
    const sb = fixture(); sb.mode = 'solo';
    vi.stubGlobal('_lastClassroomSummary', { armGate: true });
    sb.onClassroomSignal = vi.fn();
    sb.open();
    expect(sb.onClassroomSignal).toHaveBeenCalledWith(_lastClassroomSummary);
    sb.onClassroomSignal.mockClear();
    sb.startMatch = vi.fn();
    method('launchMatch', dogeSource).call({ ws: DogePresence.ws, getUsername: () => 'Me', players: [] }, {});
    expect(sb.onClassroomSignal).toHaveBeenCalledWith(_lastClassroomSummary);
  });

  it('core-6/life-9: real elapsed time runs fixed bounded steps and resets on lifecycle transitions', () => {
    const sb = fixture(); sb.mode = 'solo'; sb.mpState = null;
    sb.update = vi.fn(); sb.lastTime = 1000;
    sb.loop(1100);
    expect(sb.update).toHaveBeenCalledTimes(5);
    expect(sb.update.mock.calls.every(([delta, ts]) => delta === 16.67 && ts === 1100)).toBe(true);
    sb.update.mockClear();
    sb.loop(11100);
    expect(sb.update).toHaveBeenCalledTimes(15);
    expect(sb._acc).toBe(250);
    sb.togglePause(); expect(sb._acc).toBe(0);
    sb._acc = 100; sb.togglePause(); expect(sb._acc).toBe(0);
    sb._acc = 100; sb.startLoop(); expect(sb._acc).toBe(0);
    sb._acc = 100; sb.startNewGame(); expect(sb._acc).toBe(0);
  });

  it('ux-8: offline and occupied rematches show and announce the returned failure', () => {
    const sb = fixture(); sb.mpState.seriesOver = true;
    DogePresence.ws = null;
    sb.requestRematch();
    expect(sb.mpState._rematchNote).toMatch(/Not connected/);
    expect(sb._announce).toHaveBeenLastCalledWith(sb.mpState._rematchNote);
    DogePresence.ws = { readyState: 1, send: vi.fn() };
    DogePresence.challengePending = 'Carol';
    sb.requestRematch();
    expect(sb.mpState._rematchNote).toMatch(/Still waiting on Carol/);
    expect(sb.draw).toHaveBeenCalledTimes(2);
  });
});

describe('Batch B', () => {
  function game() {
    const sb = fixture();
    sb.resetBoardState();
    sb.mode = 'solo';
    sb.mpState = null;
    sb.ctx = new Proxy({}, {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'measureText') return text => ({ width: String(text).length * 6 });
        return () => undefined;
      },
    });
    sb.draw = method('draw');
    sb.flash = method('flash');
    return sb;
  }

  it('core-1/mp-3: ceiling overflow follows the normal top-out card and counts my loss', () => {
    const sb = game();
    sb.mode = '1v1';
    sb.mpState = { roomId: 'r1', opponent: 'Bob', myWins: 0, oppWins: 0, pendingGarbage: 6 };
    const ceiling = { kind: 'fragment' };
    sb.board[4][0] = ceiling;
    sb.sendGameMessage = vi.fn();
    sb.insertGarbage();
    expect(sb.state).toBe('gameover');
    expect(sb.mpState.pendingGarbage).toBe(0);
    expect(sb.board[4][0]).toBe(ceiling);
    expect(sb.flashText).toBe('Garbage top out');
    expect(sb.sendGameMessage).toHaveBeenCalledWith({ type: 'game_over', score: 0, lines: 0 });
    vi.advanceTimersByTime(1500);
    sb.draw();
    expect(sb.mpState.myWins).toBe(0);
    expect(sb.mpState.oppWins).toBe(1);
    sb.draw();
    expect(sb.mpState.oppWins).toBe(1);

    const opponent = game();
    opponent.mode = '1v1';
    opponent.mpState = { roomId: 'r1', opponent: 'Me', myWins: 0, oppWins: 0 };
    opponent.opponentKO(sb.score, 'r1');
    expect(opponent.state).toBe('gameover');
    expect(opponent.mpState.myWins).toBe(1);
  });

  it('core-1: a non-overflow batch retains the stack and one shared hole', () => {
    const sb = game();
    sb.mpState = { pendingGarbage: 2 };
    const cell = { kind: 'fragment' };
    sb.board[10][0] = cell;
    sb.insertGarbage();
    expect(sb.state).toBe('running');
    expect(sb.board[8][0]).toBe(cell);
    const rows = sb.board.slice(-2);
    expect(rows.map(row => row.filter(Boolean).length)).toEqual([9, 9]);
    expect(rows[0].indexOf(null)).toBe(rows[1].indexOf(null));
  });

  it('core-2: skips an exhausted overdue type', () => {
    const sb = game();
    sb.bag = ['O', 'L']; sb._since = { I: 15, O: 14 };
    expect(sb.nextFromBag()).toBe('O');
    expect(sb.bag).toEqual(['L']);
  });

  it('core-3: a held-in piece gets a fresh reset budget but hold stays locked', () => {
    const sb = game();
    sb.active = sb.createPiece('O'); sb.hold = 'O';
    for (let x = 4; x <= 6; x++) sb.board[5][x] = { kind: 'fragment' };
    for (let i = 0; i < 15; i++) sb.tryRotate(1);
    expect(sb.lockResets).toBe(15);
    sb.holdSwap();
    expect(sb.lockResets).toBe(0);
    expect(sb.holdLocked).toBe(true);
    sb.lockTimer = 490;
    sb.tryMove(1, 0);
    expect(sb.lockTimer).toBe(0);
  });

  it('core-4: 15 resets, an airborne frame, landing and rotation cannot reset accrued time', () => {
    const sb = game();
    sb.board[22][3] = { kind: 'fragment' };
    sb.active = { type: 'T', x: 3, y: 20, rot: 0, id: 1 };
    for (let i = 0; i < 15; i++) sb._resetLockTimer();
    expect(sb.lockResets).toBe(15);
    sb.lockTimer = 490;
    sb.tryRotate(1);
    expect(sb.isGrounded(sb.active)).toBe(false);
    sb.update(1, 0);
    expect(sb.lockResets).toBe(15);
    expect(sb.lockTimer).toBe(490);
    sb.tryRotate(-1);
    expect(sb.isGrounded(sb.active)).toBe(true);
    expect(sb.lockTimer).toBe(490);
    sb.lockPiece = vi.fn();
    sb.update(10, 10);
    expect(sb.lockPiece).toHaveBeenCalledOnce();
  });

  it('core-5: the completing hole needs support, including the floor', () => {
    const sb = game();
    for (let x = 0; x < 3; x++) {
      for (let y = 18; y <= 21; y++) sb.board[y][x] = { kind: 'piece', pieceId: x + 1, pieceType: 'I' };
      sb.board[22][x] = { kind: 'fragment' };
    }
    expect(sb._hintAt(0, 18)).toBeNull();
    sb.board[22][3] = { kind: 'fragment' };
    expect(sb._hintAt(0, 18)).toEqual({ x: 0, y: 18, material: 'gold' });
    sb.resetBoardState();
    for (let x = 0; x < 3; x++) {
      for (let y = 20; y <= 23; y++) sb.board[y][x] = { kind: 'piece', pieceId: x + 1, pieceType: 'I' };
    }
    expect(sb._hintAt(0, 20)).toEqual({ x: 0, y: 20, material: 'gold' });
  });

  it.each(['I', null])('core-7: hold %s precedes rotation, even through nested spawn', hold => {
    const sb = game();
    sb.queue = ['T', 'J', 'L']; sb.hold = hold;
    sb._holdOrBuffer(); sb._rotateOrBuffer(1);
    sb.spawnNext();
    expect([sb.active.type, sb.active.rot]).toEqual([hold || 'J', 1]);
    expect(sb._buffered).toBeNull();
    expect(sb.holdLocked).toBe(true);
  });

  it('core-7: a blocked held-in piece does not receive buffered rotation', () => {
    const sb = game();
    sb.queue = ['O', 'J', 'L']; sb.hold = 'I';
    sb.board[sb.SPAWN_Y + 1][3] = { kind: 'fragment' };
    sb._buffered = { hold: true, rotate: 1 };
    sb.tryRotate = vi.fn();
    sb.spawnNext();
    expect(sb.state).toBe('gameover');
    expect(sb.tryRotate).not.toHaveBeenCalled();
  });

  it('core-8: repeat rates agree at 30/60Hz, preserve remainder and bound catch-up', () => {
    const counts = [30, 60].map(hz => {
      const sb = game(); sb.active = {}; sb.tryMove = vi.fn();
      sb.keys.left = { down: true, next: 0 };
      for (let frame = 0; frame < hz; frame++) sb.handleAutoShift(frame * 1000 / hz);
      return sb.tryMove.mock.calls.length;
    });
    expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(1);
    const sb = game(); sb.active = {}; sb.tryMove = vi.fn();
    sb.keys.left = { down: true, next: 100 };
    sb.handleAutoShift(210);
    expect(sb.tryMove).toHaveBeenCalledTimes(3);
    expect(sb.keys.left.next).toBe(244);
    sb.tryMove.mockClear();
    sb.handleAutoShift(10000);
    expect(sb.tryMove.mock.calls.length).toBeLessThanOrEqual(3);
    expect(sb.keys.left.next).toBeGreaterThan(10000);
    // Both existing input paths rebase every new press, including a press after a gap.
    for (const direction of ['left', 'right']) {
      expect(fnSrc('init')).toContain(`this.keys.${direction}.next = now + this.DAS_DELAY;`);
      expect(fnSrc('_bindTouchControls')).toContain(`this.keys.${direction}.next = now + this.DAS_DELAY;`);
    }
  });

  it('life-2: opening twice cannot replace or reset an open 1v1', () => {
    const sb = game();
    sb.mode = '1v1'; sb.mpState = { roomId: 'r1' };
    sb.active = sb.createPiece('T');
    const ms = sb.mpState, active = sb.active, board = sb.board;
    const priorFocus = document.createElement('button'); sb._prevFocus = priorFocus;
    const focus = vi.spyOn(sb.canvas, 'focus');
    sb.open(); sb.open();
    expect(sb.mpState).toBe(ms);
    expect(sb.mode).toBe('1v1');
    expect(sb.state).toBe('running');
    expect(sb.active).toBe(active);
    expect(sb.board).toBe(board);
    expect(sb._prevFocus).toBe(priorFocus);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('core-8: releasing and re-pressing an arrow rebases its repeat deadline', () => {
    const sb = game();
    sb.canvas.id = 'gameCanvas'; document.body.append(sb.canvas);
    sb.initialized = false;
    sb.draw = vi.fn(); sb._bindTouchControls = vi.fn();
    const listeners = {};
    vi.spyOn(document, 'addEventListener').mockImplementation((name, fn) => { listeners[name] = fn; });
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    method('init').call(sb);
    sb.state = 'running'; sb.active = {}; sb.tryMove = vi.fn();
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    listeners.keydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    sb.handleAutoShift(1200);
    expect(sb.keys.left.next).toBe(1231);
    listeners.keyup(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));
    performance.now.mockReturnValue(5000);
    listeners.keydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(sb.keys.left.next).toBe(5000 + sb.DAS_DELAY);
    sb.tryMove.mockClear();
    sb.handleAutoShift(5000);
    expect(sb.tryMove).not.toHaveBeenCalled();
    sb.handleAutoShift(5000 + sb.DAS_DELAY);
    expect(sb.tryMove).toHaveBeenCalledOnce();
  });

  it('life-3: corrupt valid JSON is safe in open/draw and only valid scores survive', () => {
    const sb = game(); sb.overlay.style.display = 'none'; sb.state = 'idle';
    localStorage.setItem(sb._statsKey(), JSON.stringify({ best: { score: -1 }, recent: [{ valueOf: 0, toString: 0 }, 'oops', -1, null, ...Array.from({ length: 12 }, (_, i) => i)] }));
    expect(() => sb.open()).not.toThrow();
    expect(() => sb.draw()).not.toThrow();
    expect(sb._loadStats()).toEqual({ best: null, recent: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
    for (const score of ['9', null, -1, {}, Infinity]) {
      localStorage.setItem(sb._statsKey(), JSON.stringify({ best: { score } }));
      expect(sb._loadStats().best).toBeNull();
    }
    localStorage.setItem(sb._statsKey(), '{"best":{"score":0},"recent":[1e999,0]}');
    expect(sb._loadStats()).toEqual({ best: { score: 0 }, recent: [0] });
    localStorage.setItem(sb._statsKey(), '{');
    expect(sb._loadStats()).toEqual({ best: null, recent: [] });
    localStorage.removeItem(sb._statsKey());
  });

  it.each(['close', 'resetBoardState'])('life-10: %s cancels a queued level-up sound', cleanup => {
    const sb = game();
    sb.lines = sb.LINES_PER_LEVEL - 1;
    sb.active = { type: 'I', x: 3, y: 22, rot: 0, id: 1 };
    for (let x = 0; x < sb.COLS; x++) {
      if (x < 3 || x > 6) sb.board[23][x] = { kind: 'fragment' };
    }
    sb.lockPiece();
    expect(sb.level).toBe(2);
    expect(sb._levelUpTimer).toBeTruthy();
    sb[cleanup]();
    expect(sb._levelUpTimer).toBeNull();
    SFX.play.mockClear();
    vi.advanceTimersByTime(350);
    expect(SFX.play).not.toHaveBeenCalledWith('indigo', 0.7);
  });

  it('life-10: a newer level-up replaces the pending cue', () => {
    const sb = game();
    sb.clearLines = () => ({ lines: sb.LINES_PER_LEVEL, points: 1 });
    sb.active = { type: 'O', x: 3, y: 20, rot: 0, id: 1 };
    sb.lockPiece();
    vi.advanceTimersByTime(100);
    sb.active = { type: 'O', x: 6, y: 20, rot: 0, id: 2 };
    sb.lockPiece();
    SFX.play.mockClear();
    vi.advanceTimersByTime(250);
    expect(SFX.play).not.toHaveBeenCalledWith('indigo', 0.7);
    vi.advanceTimersByTime(100);
    expect(SFX.play).toHaveBeenCalledOnce();
    expect(SFX.play).toHaveBeenCalledWith('indigo', 0.7);
    expect(sb._levelUpTimer).toBeNull();
  });

  it('life-11: removes the dead lift/burial path and garbage timer fields', () => {
    expect(fnSrc('insertGarbage')).not.toContain('this.active && !this.isValid(this.active)');
    expect(source).not.toContain('garbageTimer');
    expect(fnSrc('startMatch')).toContain('WebRTC P2P is OFF');
  });

  it.each([false, true])('ux-5/life-5: an empty solo run survives close/open (entry delay: %s)', entryDelay => {
    const sb = game();
    sb.state = 'idle'; sb.startNewGame();
    sb.score = 7; sb.level = 3;
    if (entryDelay) { sb.active = null; sb.spawnTimer = 87; }
    const saved = { active: sb.active, queue: sb.queue, hold: sb.hold, score: sb.score, level: sb.level, spawnTimer: sb.spawnTimer };
    expect(sb.board.flat().every(cell => !cell)).toBe(true);
    sb.close(); sb.open();
    expect(sb.state).toBe('paused');
    for (const [key, value] of Object.entries(saved)) expect(sb[key]).toBe(value);
  });
});
describe('Batch C', () => {
  let sb, listeners;
  beforeEach(() => {
    document.body.innerHTML = `<div id="game-overlay" style="display:block;z-index:261">
      <canvas id="gameCanvas" tabindex="0"></canvas><button id="mute">Mute</button><a id="link" href="#">Help</a>
      <div id="game-split"><canvas id="gameCanvas1"></canvas><canvas id="gameCanvas2"></canvas></div>
      <div id="game-lobby" style="display:none"><div id="lobby-players"></div><div id="lobby-status"></div></div>
      <div id="challenge-dialog" style="display:none"><button id="challenge-accept-btn">Accept</button><button id="challenge-decline-btn">Decline</button></div>
      <div id="p1-label"></div><div id="p2-label"></div><div id="game-score"></div><div id="game-help"></div><div id="game-live"></div>
      <div id="game-touch">${['left', 'right', 'down', 'ccw', 'cw', 'hold', 'drop'].map(act => `<button class="game-touch-btn" data-act="${act}"></button>`).join('')}</div>
    </div><input id="outside">`;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    sb = fixture();
    sb.mode = 'solo'; sb.mpState = null; sb.initialized = false;
    sb.init = method('init');
    listeners = [];
    for (const owner of [document, window]) {
      const add = owner.addEventListener.bind(owner);
      vi.spyOn(owner, 'addEventListener').mockImplementation((name, fn, options) => {
        listeners.push([owner, name, fn, options]); add(name, fn, options);
      });
    }
    sb.init();
    sb._announce = method('_announce');
    sb.state = 'running';
    vi.stubGlobal('closeGame', vi.fn(() => sb.close()));
  });
  afterEach(() => {
    sb._touchAbort?.abort();
    for (const [owner, name, fn, options] of listeners) owner.removeEventListener(name, fn, options);
  });
  function key(target, value) {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }
  function pointer(act, type, id, pointerType = 'touch') {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: id, pointerType });
    document.querySelector(`[data-act="${act}"]`).dispatchEvent(event);
  }
  function recordingContext() {
    return new Proxy({ measureText: text => ({ width: text.length * 6 }), fillText: vi.fn(), fillRect: vi.fn() }, {
      get: (target, prop) => prop in target ? target[prop] : () => {},
    });
  }

  it('ux-1: external editable typing is untouched and focus leaving releases held input', () => {
    sb._rotateOrBuffer = vi.fn();
    for (const tag of ['input', 'textarea', 'select', 'div']) {
      const input = document.createElement(tag);
      if (tag === 'div') input.setAttribute('contenteditable', 'true');
      document.body.append(input);
      expect(key(input, 'x').defaultPrevented).toBe(false);
    }
    expect(sb._rotateOrBuffer).not.toHaveBeenCalled();
    sb.canvas.focus(); pointer('left', 'pointerdown', 1);
    document.getElementById('outside').focus();
    expect(sb.keys.left.down).toBe(false);
    expect(sb._touchPointers.left.size).toBe(0);
  });
  it('ux-2: focused buttons and links retain native Enter/Space; challenge fallback still accepts', () => {
    sb.hardDrop = vi.fn(); sb.startNewGame = vi.fn();
    for (const id of ['mute', 'link', 'challenge-decline-btn']) {
      const button = document.getElementById(id); button.focus();
      for (const value of ['Enter', ' ']) expect(key(button, value).defaultPrevented).toBe(false);
    }
    expect(sb.hardDrop).not.toHaveBeenCalled(); expect(sb.startNewGame).not.toHaveBeenCalled();
    document.getElementById('challenge-dialog').style.display = 'block';
    const accept = vi.fn(); document.getElementById('challenge-accept-btn').onclick = accept;
    sb.canvas.focus(); key(sb.canvas, 'Enter'); expect(accept).toHaveBeenCalledOnce();
  });
  it('ux-3: entry delay buffers rotation/hold and records directions but guards drops', () => {
    matchMedia.mockReturnValue({ matches: true }); sb._bindTouchControls();
    sb.active = null; sb._buffered = null; sb.hardDrop = vi.fn();
    pointer('cw', 'pointerdown', 1); expect(sb._buffered.rotate).toBe(1);
    pointer('hold', 'pointerdown', 2); expect(sb._buffered.hold).toBe(true);
    pointer('left', 'pointerdown', 3); expect(sb.keys.left.down).toBe(true);
    expect(sb.keys.left.next).toBeGreaterThan(0);
    pointer('drop', 'pointerdown', 4); expect(sb.hardDrop).not.toHaveBeenCalled();
  });
  it('ux-4: action stays held until its last pointer releases, capture loss is idempotent', () => {
    matchMedia.mockReturnValue({ matches: true }); sb._bindTouchControls();
    sb.active = {}; sb.tryMove = vi.fn();
    pointer('left', 'pointerdown', 1); pointer('left', 'pointerdown', 2);
    pointer('left', 'pointerup', 1); pointer('left', 'lostpointercapture', 1);
    expect(sb.keys.left.down).toBe(true);
    expect(sb.tryMove).toHaveBeenCalledOnce();
    pointer('left', 'pointercancel', 2); expect(sb.keys.left.down).toBe(false);
    pointer('right', 'pointerdown', 3); sb.clearKeys(); expect(sb._touchPointers.right.size).toBe(0);
    sb.keys.right.down = true; pointer('right', 'lostpointercapture', 3); expect(sb.keys.right.down).toBe(true);
  });
  it('ux-6: announces the forfeit window and refund', () => {
    sb.mode = '1v1'; sb.mpState = {};
    expect(sb._escapeNeedsConfirm()).toBe(true);
    expect(document.getElementById('game-live').textContent).toMatch(/Escape.*3 seconds.*forfeit.*refunded/);
  });
  it('ux-7: announces resume exactly once per pause and countdown 3/2/1/Go', () => {
    sb.updateHud = method('updateHud'); sb._announce = vi.fn();
    sb.state = 'paused'; sb.updateHud(); sb.state = 'running'; sb.updateHud(); sb.updateHud();
    expect(sb._announce.mock.calls.filter(([text]) => text === 'Resumed')).toHaveLength(1);
    sb.state = 'paused'; sb.updateHud(); sb.state = 'running'; sb.updateHud();
    expect(sb._announce.mock.calls.filter(([text]) => text === 'Resumed')).toHaveLength(2);
    sb._announce.mockClear(); sb._studyBreakArmStakes = vi.fn();
    sb.startMatch({ roomId: 'countdown', opponent: 'Bob', side: 'left' });
    vi.advanceTimersByTime(3000);
    expect(sb._announce.mock.calls.map(([text]) => text).filter(text => /starting|^[21]$|^Go$/.test(text))).toEqual(['Match starting in 3', '2', '1', 'Go']);
  });
  it('ux-9: hybrid controls bind while hidden, reveal on touch, and clean up/rebind across close', () => {
    const strip = document.getElementById('game-touch');
    expect(strip.classList.contains('on')).toBe(false);
    pointer('cw', 'pointerdown', 1, 'mouse'); expect(strip.classList.contains('on')).toBe(false);
    pointer('cw', 'pointerdown', 2); expect(strip.classList.contains('on')).toBe(true);
    const controller = sb._touchAbort; sb.close(); expect(controller.signal.aborted).toBe(true);
    strip.classList.remove('on'); pointer('cw', 'pointerdown', 3); expect(strip.classList.contains('on')).toBe(false);
    matchMedia.mockImplementation(query => ({ matches: query === '(any-pointer: coarse)' }));
    sb.open(); expect(strip.classList.contains('on')).toBe(true);
  });
  it('ux-10: lobby classmates are named native buttons, pending/self disabled and names stay text', () => {
    vi.stubGlobal('_deskEsc', text => { const el = document.createElement('div'); el.textContent = text; return el.innerHTML.replaceAll('"', '&quot;'); });
    const name = '<img src=x onerror=alert(1)>';
    DogePresence.locations = { Bob: { onDesk: true }, Me: { onDesk: true }, [name]: { onDesk: true } };
    sb.mpOnlinePlayers = ['Bob', 'Me', name]; sb.updateLobby = method('updateLobby'); sb.sendChallenge = vi.fn();
    sb.updateLobby();
    const buttons = document.querySelectorAll('#lobby-players button'); expect(buttons).toHaveLength(3);
    expect(buttons[0].type).toBe('button'); expect(buttons[0].textContent).toContain('Bob');
    buttons[0].click(); expect(sb.sendChallenge).toHaveBeenCalledWith('Bob');
    expect(buttons[1].disabled).toBe(true); expect(buttons[2].textContent).toContain(name);
    expect(document.querySelector('#lobby-players img')).toBeNull();
    sb._outgoing = { target: 'Bob' }; sb.updateLobby();
    expect([...document.querySelectorAll('#lobby-players button')].every(button => button.disabled)).toBe(true);
  });
  it('ux-11: responsive CSS bounds the solo/split canvases and allows wrappers to shrink', () => {
    expect(html).toMatch(/#gameCanvas\s*\{[^}]*max-width:\s*100%;[^}]*height:\s*auto/);
    expect(html).toMatch(/#game-split\s*\{[^}]*max-width:\s*100%/);
    expect(html).toMatch(/#game-split > div > div\s*\{[^}]*min-width:\s*0/);
    expect(html).toMatch(/#game-split canvas\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto/);
  });
  it('ux-13: detail/footer fit the card and retain complete DOM text', () => {
    sb.ctx = recordingContext(); sb._studyBreakScoreGameOnce = vi.fn();
    sb.mpState = { seriesOver: true }; sb.helpEl = document.getElementById('game-help');
    const detail = 'Alexandria disconnected. You: 1200 | Alexandria: 980';
    const foot = 'Waiting for Alexandria and her very long classmate name to accept the rematch';
    sb._outgoing = { text: foot }; sb.drawGameOverCard(detail);
    const calls = sb.ctx.fillText.mock.calls;
    expect(sb.ctx.measureText(calls[1][0]).width).toBeLessThanOrEqual(196);
    expect(sb.ctx.measureText(calls[4][0]).width).toBeLessThanOrEqual(196);
    expect(sb.helpEl.textContent).toContain(detail); expect(sb.helpEl.textContent).toContain(foot);
  });
  it('ux-14: split score and incoming count occupy separate baselines', () => {
    sb.draw = method('draw'); sb.ctx = recordingContext(); sb.mode = '1v1';
    Object.assign(sb, { CELL: 10, BOARD_X: 58, CANVAS_W: 215, level: 21, lines: 120, score: 1200 });
    sb.mpState = { pendingGarbage: 6 }; sb.draw();
    const stats = sb.ctx.fillText.mock.calls.find(([text]) => text.includes('1200 pts'));
    const warning = sb.ctx.fillText.mock.calls.find(([text]) => text.includes('+6'));
    expect(Math.abs(stats[2] - warning[2])).toBeGreaterThanOrEqual(10);
  });
  it('ux-15: reduced motion draws the live board without the decorative flash or changing its timer', () => {
    sb.draw = method('draw'); sb.ctx = recordingContext(); sb.drawBoardCells = vi.fn();
    sb.clearFx = { board: [], rows: [sb.HIDDEN_ROWS], timer: 120 };
    const liveBoard = sb.board, painted = [];
    sb.drawBoardCells.mockImplementation(() => painted.push(sb.board));
    sb.ctx.fillRect.mockImplementation(() => { expect(sb.ctx.fillStyle).not.toBe('rgba(255,255,255,0.85)'); });
    matchMedia.mockImplementation(query => ({ matches: query.includes('prefers-reduced-motion') }));
    matchMedia.mockClear(); sb.draw();
    expect(painted).toEqual([liveBoard]); expect(sb.clearFx.timer).toBe(120);
    expect(matchMedia).toHaveBeenCalledTimes(1);
  });
  it('life-6: open/launch raise the shared stack; higher modals own Escape', () => {
    vi.stubGlobal('_appTopZ', 280); sb.open(); expect(sb.overlay.style.zIndex).toBe('281');
    const launch = method('launchMatch', dogeSource);
    sb.startMatch = vi.fn(); launch.call({ getUsername: () => 'Me', players: [], ws: {} }, {});
    expect(sb.overlay.style.zIndex).toBe('282'); expect(_appTopZ).toBe(282);
    const modal = document.createElement('div'); modal.id = 'donow-bump-overlay';
    modal.style.cssText = 'display:block;z-index:320'; document.body.append(modal);
    const start = html.indexOf('function _escVisible('), end = html.indexOf('try { window._escCloseTopModal', start);
    const closeTop = new Function(html.slice(start, end) + ';return _escCloseTopModal;')();
    vi.stubGlobal('closeDoNowBump', vi.fn(() => { modal.style.display = 'none'; }));
    key(sb.canvas, 'Escape'); expect(closeGame).not.toHaveBeenCalled(); expect(sb.isOpen()).toBe(true);
    expect(closeTop()).toBe(true); expect(closeDoNowBump).toHaveBeenCalledOnce();
    expect(closeTop()).toBe(false);
    // At page boot the Desk dispatcher registers BEFORE init installs the game router.
    const router = listeners.find(([owner, name]) => owner === document && name === 'keydown')[2];
    document.removeEventListener('keydown', router);
    vi.stubGlobal('_escCloseTopModal', closeTop);
    const dispatcherStart = html.indexOf("document.addEventListener('keydown'", html.indexOf('// Close doge dropdown & app overlays on Escape'));
    new Function(html.slice(dispatcherStart, html.indexOf('window.DogePresence =', dispatcherStart)))();
    document.addEventListener('keydown', router);
    modal.style.display = 'block';
    expect(key(sb.canvas, 'Escape').defaultPrevented).toBe(true);
    expect(modal.style.display).toBe('none');
    expect(closeGame).not.toHaveBeenCalled(); expect(sb.isOpen()).toBe(true);
  });
});

describe('Review fixes (2026-09-25 adversarial pass)', () => {
  it('F2: the stale-KO guard only applies after an advance and for 700ms', () => {
    const sb = fixture();
    sb.state = 'running'; sb.mpState.gameNumber = 1; sb.mpState.roundStartedAt = Date.now(); sb.mpState.oppSeenThisRound = false;
    sb.opponentKO(10, sb.mpState.roomId);
    expect(sb.state).toBe('gameover');                       // game 1: a KO is always real
    const sb2 = fixture();
    sb2.state = 'running'; sb2.mpState.gameNumber = 2; sb2.mpState.roundStartedAt = Date.now(); sb2.mpState.oppSeenThisRound = false;
    sb2.opponentKO(10, sb2.mpState.roomId);
    expect(sb2.state).toBe('running');                       // 0ms into game 2: previous-round leftover
    vi.advanceTimersByTime(701);
    sb2.opponentKO(10, sb2.mpState.roomId);
    expect(sb2.state).toBe('gameover');                      // past the window: real
  });

  it('F3: starting a new match leaves the previous relay room first', () => {
    const sb = fixture();
    sb.mpState.seriesOver = true; sb.mpState.roomId = 'old-room';
    DogePresence.ws.send.mockClear();
    sb.startMatch({ roomId: 'new-room', opponent: 'Carol', side: 'left' });
    const sent = DogePresence.ws.send.mock.calls.map(c => JSON.parse(c[0]));
    expect(sent.some(m => m.type === 'game_leave' && m.roomId === 'old-room')).toBe(true);
    expect(sb.mpState.roomId).toBe('new-room');
  });

  it('F4: an avatar-menu challenge clears our own abandonment marker for that classmate', () => {
    const sb = fixture(); sb.mode = 'solo'; sb.mpState = null;
    sb._abandonedChallenges = { Bob: Date.now() + 30000 };
    DogePresence.challengePending = null;
    DogePresence.closeDropdown = DogePresence.closeDropdown || (() => {});
    DogePresence.flash = DogePresence.flash || (() => {});
    method('sendChallenge', dogeSource).call(DogePresence, 'Bob');
    expect(sb._abandonedChallenges.Bob).toBeUndefined();
  });

  it('F6: a match start moves keyboard focus onto the game surface', () => {
    const sb = fixture(); sb.mpState = null;
    const field = document.createElement('input'); document.body.appendChild(field); field.focus();
    expect(document.activeElement).toBe(field);
    sb.startMatch({ roomId: 'r-focus', opponent: 'Bob', side: 'left' });
    expect(document.activeElement).not.toBe(field);
    expect(document.activeElement && document.activeElement.tagName).toBe('CANVAS');
    field.remove();
  });

  it('F7: the game-over help text keeps the teacher\'s Live Classroom note in front', () => {
    const sb = fixture();
    sb.helpEl = sb.helpEl || document.createElement('div');
    sb._classroomNote = 'GATE ARMED';
    sb._setHelpText('SERIES WON!');
    expect(sb.helpEl.textContent.startsWith('GATE ARMED')).toBe(true);
    expect(sb.helpEl.textContent).toContain('SERIES WON!');
  });

  it('F1: a slow bet/open never blocks the settlement report for more than 10s', async () => {
    const sb = fixture();
    sb.mpState._opening = new Promise(() => {});           // never settles
    _dogeWalletAction.mockResolvedValue({ ok: true, status: 'settled' });
    const done = sb._studyBreakResolveStakes();
    await vi.advanceTimersByTimeAsync(9000);
    expect(sb.mpState._resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    await done;
    expect(sb.mpState._resolved).toBe(true);
  });
});
