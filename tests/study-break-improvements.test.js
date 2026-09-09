/**
 * tests/study-break-improvements.test.js — Study Break (Square Mode) improvement pass, 2026-09-08/09.
 *
 * Behaviour tests run the REAL method bodies extracted from the Desk source against small fixtures
 * (same technique as study-break-hardening.test.js); source pins guard the wiring that only makes
 * sense in the full page (key routing, Desk-side guards). Digest of the review these implement:
 * state/study-break-tetris-review-2026-09-08.md
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

const SB_START = html.indexOf('const studyBreak = {');
const SB_END = html.indexOf('\n};\n', SB_START);
const sb = html.slice(SB_START, SB_END);

/** Extract `    name(args) { ... }` from the studyBreak object literal as a callable Function. */
function method(name) {
  const m = new RegExp('\\n    ' + name.replace(/\$/g, '\\$') + '\\(([^)]*)\\) \\{').exec(sb);
  if (!m) throw new Error('method not found: ' + name);
  let i = m.index + m[0].length - 1, depth = 0;
  for (; i < sb.length; i++) {
    if (sb[i] === '{') depth++;
    else if (sb[i] === '}') { depth--; if (depth === 0) break; }
  }
  const body = sb.slice(m.index + m[0].length, i);
  const args = m[1].split(',').map((s) => s.trim().split('=')[0].trim()).filter(Boolean);
  return new Function(...args, body);
}

beforeAll(() => {
  globalThis.SFX = { play() {}, init() {}, muted: false };
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
});

describe('feel — soft drop, DAS, firm drop, buffered input', () => {
  it('B1: pressing Down zeroes the banked gravity timer BEFORE the first soft-drop step (keyboard + touch)', () => {
    expect(sb).toMatch(/key === 'ArrowDown'\)\s*\{\s*if \(!this\.keys\.down\.down\)\s*\{[\s\S]*?this\.fallTimer = 0;[\s\S]*?this\.tryMove\(0, 1\)/);
    expect(sb).toMatch(/act === 'down'\)\s*\{\s*this\.keys\.down\.down = true;\s*this\.fallTimer = 0;\s*this\.tryMove\(0, 1\)/);
  });
  it('B17: modifier combos never reach the game; one-shot keys ignore key repeat', () => {
    expect(sb).toMatch(/if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return;/);
    expect(sb).toMatch(/if \(e\.repeat && \['Enter', 'r', 'R', 'p', 'P', '1', '2', 'Escape', 'm', 'M'\]\.includes\(key\)\) return;/);
  });
  it('Q2: with both arrows held, the LAST direction pressed auto-shifts', () => {
    const handleAutoShift = method('handleAutoShift');
    const moves = [];
    const ctx = {
      active: {}, DAS_REPEAT: 48,
      keys: { left: { down: true, next: 0 }, right: { down: true, next: 0 }, lastDir: 'right' },
      tryMove: (dx) => { moves.push(dx); return true; },
    };
    handleAutoShift.call(ctx, 1000);
    expect(moves).toEqual([1]);
    ctx.keys.lastDir = 'left'; ctx.keys.left.next = 0;
    handleAutoShift.call(ctx, 2000);
    expect(moves).toEqual([1, -1]);
    ctx.keys.right.down = false; ctx.keys.left.next = 0;   // only left held → left, whatever lastDir says
    ctx.keys.lastDir = 'right';
    handleAutoShift.call(ctx, 3000);
    expect(moves).toEqual([1, -1, -1]);
  });
  it('B5: firm drop on an already-grounded piece LOCKS it (no infinite lock-timer reset)', () => {
    const firmDrop = method('firmDrop');
    let locked = 0;
    const ctx = { active: { y: 10 }, getGhostY: () => 10, lockPiece: () => { locked++; }, updateHud() {}, fallTimer: 5, lockTimer: 400 };
    firmDrop.call(ctx);
    expect(locked).toBe(1);
    expect(ctx.lockTimer).toBe(400);   // untouched — no free reset
    const ctx2 = { active: { y: 3 }, getGhostY: () => 10, lockPiece: () => { locked++; }, updateHud() {}, fallTimer: 5, lockTimer: 400 };
    firmDrop.call(ctx2);
    expect(locked).toBe(1);
    expect(ctx2.active.y).toBe(10);
    expect(ctx2.lockTimer).toBe(0);
  });
  it('Q2: rotate/hold pressed with no active piece are buffered and applied at spawn', () => {
    const rot = method('_rotateOrBuffer'), hold = method('_holdOrBuffer');
    const ctx = { active: null, _buffered: null, tryRotate() { throw new Error('no'); }, holdSwap() { throw new Error('no'); } };
    rot.call(ctx, 1); hold.call(ctx);
    expect(ctx._buffered).toEqual({ rotate: 1, hold: true });
    expect(sb).toMatch(/const buffered = this\._buffered; this\._buffered = null;\s*if \(buffered\) \{\s*if \(buffered\.rotate\) this\.tryRotate\(buffered\.rotate\);\s*if \(buffered\.hold\) this\.holdSwap\(\);/);
  });
});

describe('rules — bag, level curve, garbage', () => {
  it('Q3: a type unseen for 14+ pieces jumps the queue; the hold is drawn from the bag', () => {
    const nextFromBag = method('nextFromBag');
    const types = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const ctx = { types, bag: ['I', 'O', 'T'], _since: { I: 14, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 }, refillBag() {} };
    expect(nextFromBag.call(ctx)).toBe('I');      // pop() takes the END; I was moved there
    expect(ctx._since.I).toBe(0);
    expect(ctx._since.O).toBe(1);
    const ctx2 = { types, bag: ['I', 'O', 'T'], _since: null, refillBag() {} };
    expect(nextFromBag.call(ctx2)).toBe('T');     // no drought → normal order
    expect((sb.match(/this\.hold = this\.nextFromBag\(\)/g) || []).length).toBe(2);
    expect(sb).not.toMatch(/this\.hold = this\.randomType\(\)/);
  });
  it('Q4: geometric gravity curve, floor 90ms, a level every LINES_PER_LEVEL lines', () => {
    const gravity = method('gravityInterval');
    expect(gravity.call({ level: 1 })).toBe(920);
    expect(gravity.call({ level: 5 })).toBe(416);
    expect(gravity.call({ level: 13 })).toBe(90);
    expect(gravity.call({ level: 30 })).toBe(90);
    for (let l = 1; l < 20; l++) expect(gravity.call({ level: l + 1 })).toBeLessThanOrEqual(gravity.call({ level: l }));
    expect(sb).toMatch(/LINES_PER_LEVEL: 6,/);
    expect(sb).toMatch(/this\.level = 1 \+ Math\.floor\(this\.lines \/ this\.LINES_PER_LEVEL\);/);
  });
  it('Q8: the 1v1 piece RNG is seeded per game from the roomId and is deterministic', () => {
    const seed = method('_seedRng');
    const a = {}, b = {}, c = {};
    seed.call(a, 'room:1'); seed.call(b, 'room:1'); seed.call(c, 'room:2');
    const seqA = Array.from({ length: 20 }, () => a._rand());
    const seqB = Array.from({ length: 20 }, () => b._rand());
    const seqC = Array.from({ length: 20 }, () => c._rand());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    seqA.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
  });
  it('B7: inbound garbage is clamped to MAX_GARBAGE per message and the queue is bounded', () => {
    const receiveGarbage = method('receiveGarbage');
    const ctx = { MAX_GARBAGE: 6, mpState: { roomId: 'r', pendingGarbage: 0 } };
    receiveGarbage.call(ctx, 24, 'r');
    expect(ctx.mpState.pendingGarbage).toBe(6);
    receiveGarbage.call(ctx, 24, 'r');
    expect(ctx.mpState.pendingGarbage).toBe(12);
    receiveGarbage.call(ctx, 24, 'r');
    expect(ctx.mpState.pendingGarbage).toBe(12);   // bounded
    receiveGarbage.call(ctx, 'abc', 'r');
    receiveGarbage.call(ctx, -3, 'r');
    expect(ctx.mpState.pendingGarbage).toBe(12);
    receiveGarbage.call(ctx, 2, 'other-room');     // SB-4 stale-room guard still in force
    expect(ctx.mpState.pendingGarbage).toBe(12);
  });
  it('Q6 (teacher decision 2026-09-09): a row through a square pays and the REST of the square stays a square', () => {
    const clearLines = method('clearLines');
    const TOTAL_ROWS = 24, COLS = 10;
    const board = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
    // a gold square at cols 0-3, rows 20-23; row 23 is otherwise full (fragments) → one single through it
    for (let y = 20; y < 24; y++) for (let x = 0; x < 4; x++) board[y][x] = { kind: 'square', pieceId: null, pieceType: null, squareId: 7, material: 'gold', color: '#d8b44b' };
    for (let x = 4; x < COLS; x++) board[23][x] = { kind: 'fragment', pieceId: null, pieceType: null, squareId: null, material: null, color: '#888' };
    const ctx = { board, TOTAL_ROWS, COLS };
    const r1 = clearLines.call(ctx);
    expect(r1).toEqual({ lines: 1, points: 11, goldStrips: 1, silverStrips: 0 });
    const remainder = ctx.board.flat().filter((c) => c && c.squareId === 7);
    expect(remainder.length).toBe(12);
    remainder.forEach((c) => { expect(c.kind).toBe('square'); expect(c.material).toBe('gold'); });   // NOT fragments
    // the 4x3 remainder collapsed to rows 21-23; another single through its bottom row pays again
    for (let x = 4; x < COLS; x++) ctx.board[23][x] = { kind: 'fragment', pieceId: null, pieceType: null, squareId: null, material: null, color: '#888' };
    const r2 = clearLines.call(ctx);
    expect(r2).toEqual({ lines: 1, points: 11, goldStrips: 1, silverStrips: 0 });
    expect(ctx.board.flat().filter((c) => c && c.squareId === 7).length).toBe(8);
    expect(sb).not.toMatch(/brokenSquareIds/);
  });
  it('Q7: squares send garbage in 1v1 (gold +2, silver +1), capped at MAX_GARBAGE', () => {
    expect(sb).toMatch(/const garbageToSend = Math\.min\(this\.MAX_GARBAGE, \(garbageTable\[clear\.lines\] \|\| 0\) \+ \(clear\.goldStrips \|\| 0\) \* 2 \+ \(clear\.silverStrips \|\| 0\)\);/);
  });
});

describe('1v1 — simultaneous top-out, late leave, rematch', () => {
  function koCtx(state, score, side) {
    return {
      state, score, flash() {}, updateHud() {}, draw() {}, clearFx: null,
      mpState: { roomId: 'r', opponent: 'Bob', side, gameScored: false, _forfeit: false, seriesOver: false, _wonThisGame: false },
    };
  }
  it('B14: both topped out → higher score wins on BOTH screens; a tie goes to the left side', () => {
    const opponentKO = method('opponentKO');
    const a = koCtx('gameover', 100, 'left');  opponentKO.call(a, 100, 'r');
    expect(a.mpState._wonThisGame).toBe(true);
    const b = koCtx('gameover', 100, 'right'); opponentKO.call(b, 100, 'r');
    expect(b.mpState._wonThisGame).toBe(false);
    const c = koCtx('gameover', 50, 'left');   opponentKO.call(c, 100, 'r');
    expect(c.mpState._wonThisGame).toBe(false);
    const d = koCtx('running', 50, 'right');   opponentKO.call(d, 100, 'r');   // normal KO: they died first
    expect(d.mpState._wonThisGame).toBe(true);
    expect(d.state).toBe('gameover');
  });
  it('B14: a self top-out waits 600ms for a crossing KO before it counts; fixtures without gameOverAt count at once', () => {
    const score = method('_studyBreakScoreGameOnce');
    const mk = (gameOverAt) => ({
      mode: '1v1', state: 'gameover', isOpen: () => true, startNewGame() {}, _studyBreakResolveStakes() {},
      mpState: { gameScored: false, seriesOver: false, _wonThisGame: false, _forfeit: false, myWins: 0, oppWins: 0, gameOverAt },
    });
    const fresh = mk(Date.now());
    score.call(fresh);
    expect(fresh.mpState.gameScored).toBe(false);   // deferred
    const old = mk(Date.now() - 1000);
    score.call(old);
    expect(old.mpState.gameScored).toBe(true);
    expect(old.mpState.oppWins).toBe(1);
    const legacy = mk(undefined);
    score.call(legacy);
    expect(legacy.mpState.gameScored).toBe(true);
    clearTimeout(old.mpState._advanceTimer); clearTimeout(legacy.mpState._advanceTimer);
  });
  it('B13: a decided series ignores a late opponent_left (no second win jingle, no rewritten card)', () => {
    const opponentLeft = method('opponentLeft');
    const ctx = { state: 'gameover', score: 10, flash: () => { throw new Error('must not flash'); }, updateHud() {}, draw() {},
      mpState: { seriesOver: true, opponent: 'Bob', _wonThisGame: false, _forfeit: false } };
    expect(() => opponentLeft.call(ctx, 'quit')).not.toThrow();
    expect(ctx.mpState._forfeit).toBe(false);
  });
  it('Q13: R/Enter on the series-over card requests a rematch instead of a phantom game', () => {
    expect(sb).toMatch(/\(key === 'Enter' \|\| key === 'r' \|\| key === 'R'\) && this\._inLiveMatch\(\) && this\.mpState\.seriesOver\)\s*\{\s*this\.requestRematch\(\);/);
    const requestRematch = method('requestRematch');
    const sent = [];
    const ctx = { mpState: { seriesOver: true, opponent: 'Bob' }, _outgoing: null, sendChallenge: (t) => sent.push(t), draw() {} };
    requestRematch.call(ctx);
    expect(sent).toEqual(['Bob']);
    ctx._outgoing = { target: 'Bob' };
    requestRematch.call(ctx);
    expect(sent).toEqual(['Bob']);   // single-pending guard
  });
  it('B9: one outgoing challenge at a time; the shared DogePresence guard is mirrored', () => {
    const sendChallenge = method('sendChallenge');
    const sent = [];
    globalThis.DogePresence = { challengePending: null };
    const ctx = {
      _liveWs: () => ({ send: (j) => sent.push(JSON.parse(j)) }), _outgoing: null, _setLobbyStatus() {}, updateLobby() {}, _tickOutgoing() {},
    };
    sendChallenge.call(ctx, 'Bob');
    sendChallenge.call(ctx, 'Carol');
    expect(sent.map((m) => m.target)).toEqual(['Bob']);
    expect(globalThis.DogePresence.challengePending).toBe('Bob');
    clearInterval(ctx._outgoingTimer);
    delete globalThis.DogePresence;
  });
  it('B3: close() declines a still-open incoming challenge so the challenger is not stranded', () => {
    const decline = method('_declinePendingChallenge');
    const sent = [];
    const ctx = { pendingChallenger: 'Bob', mpChallengeTimer: null, _liveWs: () => ({ send: (j) => sent.push(JSON.parse(j)) }) };
    decline.call(ctx);
    expect(sent).toEqual([{ type: 'challenge_decline', from: 'Bob' }]);
    expect(ctx.pendingChallenger).toBe(null);
    decline.call(ctx);
    expect(sent.length).toBe(1);
    expect(sb).toMatch(/close\(\) \{[\s\S]*?this\._declinePendingChallenge\(\);/);
  });
});

describe('wire — palette + inbound validation', () => {
  it('B16: encode and decode share ONE palette (colors + garbage grey, append-only)', () => {
    const colorsSrc = /colors: \{([\s\S]*?)\n    \},/.exec(sb)[1];
    const colors = new Function('return {' + colorsSrc + '}')();
    const palette = method('_palette').call({ colors });
    expect(palette.length).toBe(Object.keys(colors).length + 1);
    expect(palette[palette.length - 1]).toBe('#888888');
    expect((sb.match(/const colorPalette = this\._palette\(\);/g) || []).length).toBe(2);
    expect(sb).not.toMatch(/const colorPalette = \['#/);
  });
  it('B7: opponent state decode range-checks coords, drops a bad active piece, keeps the board on a light update', () => {
    const update = method('updateOpponentState');
    const pieces = { O: [[[1, 0], [2, 0], [1, 1], [2, 1]]] };
    const ctx = { TOTAL_ROWS: 24, COLS: 10, pieces, _palette: () => ['#aaa', '#bbb'], drawOpponentBoard() {},
      mpState: { roomId: 'r', opponentBoard: 'OLD' } };
    update.call(ctx, { roomId: 'r', board: [[23, 9, 1], [24, 0, 0], [0, 10, 0], 'junk', [-1, 0, 0], [1, 1, 99]],
      active: { type: 'X', rot: 0, x: 0, y: 0 }, score: 'nope', level: -4, hold: 'O', queue: ['O', 'nope', 'O', 'O', 'O'] });
    const b = ctx.mpState.opponentBoard;
    expect(b[23][9].color).toBe('#bbb');
    expect(b[1][1].color).toBe('#888888');
    expect(b.flat().filter(Boolean).length).toBe(2);
    expect(ctx.mpState.opponentActive).toBe(null);
    expect(ctx.mpState.opponentScore).toBe(0);
    expect(ctx.mpState.opponentLevel).toBe(1);
    expect(ctx.mpState.opponentHold).toBe('O');
    expect(ctx.mpState.opponentQueue).toEqual(['O', 'O', 'O']);
    update.call(ctx, { roomId: 'r', active: { type: 'O', rot: 0, x: 3, y: 4 } });   // light update
    expect(ctx.mpState.opponentBoard).toBe(b);
    expect(ctx.mpState.opponentActive).toEqual({ type: 'O', rot: 0, x: 3, y: 4 });
  });
  it('every inbound JSON.parse on the game/presence sockets is guarded', () => {
    const parses = html.match(/JSON\.parse\((event|e)\.data\)/g) || [];
    const guarded = html.match(/try \{ data = JSON\.parse\((event|e)\.data\); \} catch \(_\) \{ return; \}/g) || [];
    expect(parses.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(parses.length);
  });
});

describe('square aids — hint + ghost material', () => {
  const O = [[1, 0], [2, 0], [1, 1], [2, 1]];
  const pieces = { O: [O, O, O, O] };
  function emptyBoard() { return Array.from({ length: 24 }, () => Array(10).fill(null)); }
  function placeO(board, id, x, y) { for (const [dx, dy] of O) board[y + dy][x + dx] = { kind: 'piece', pieceId: id, pieceType: 'O' }; }
  // Region (0..3, 18..21): O pieces top-left, bottom-left, bottom-right; the hole is top-right (open sky).
  function threeOs(board) { placeO(board, 1, -1, 18); placeO(board, 2, -1, 20); placeO(board, 3, 1, 20); }   // x=-1 → cells 0,1
  it('B3(feature): three whole O pieces + an open 2x2 hole is a GOLD hint; the ghost of the 4th O turns gold', () => {
    const board = emptyBoard();
    threeOs(board);
    const ctx = { board, COLS: 10, TOTAL_ROWS: 24, HIDDEN_ROWS: 4, pieces, _boardVersion: 1,
      getCells: method('getCells'), _regionMaterial: method('_regionMaterial'), _hintAt: method('_hintAt'), _ghostMaterial: method('_ghostMaterial') };
    expect(ctx._hintAt(0, 18)).toEqual({ x: 0, y: 18, material: 'gold' });
    ctx.active = { type: 'O', rot: 0, x: 1, y: 5, id: 4 };
    expect(ctx._ghostMaterial(18)).toBe('gold');        // dropping the O into the hole completes it
    expect(ctx._ghostMaterial(5)).toBe(null);           // mid-air: nothing
    ctx.active = { type: 'O', rot: 0, x: 5, y: 5, id: 5 };
    expect(ctx._ghostMaterial(22)).toBe(null);
  });
  it('a hole that is roofed over (or sits under another piece) is not a hint', () => {
    const roofed = emptyBoard();
    threeOs(roofed);
    roofed[16][2] = { kind: 'fragment', pieceId: null };   // roof over the hole column
    expect(method('_hintAt').call({ board: roofed, COLS: 10, TOTAL_ROWS: 24, HIDDEN_ROWS: 4 }, 0, 18)).toBe(null);
    const under = emptyBoard();
    placeO(under, 1, -1, 18); placeO(under, 2, 1, 18); placeO(under, 3, -1, 20);   // hole is UNDER piece 2
    expect(method('_hintAt').call({ board: under, COLS: 10, TOTAL_ROWS: 24, HIDDEN_ROWS: 4 }, 0, 18)).toBe(null);
  });
});

describe('Desk-side guards + a11y + sound (source pins)', () => {
  it('B2: the Live Classroom capture-phase ↑/↓ handler yields to an open game', () => {
    expect(html).toMatch(/if \(e\.key !== 'ArrowUp' && e\.key !== 'ArrowDown'\) return;\s*\/\/[^\n]*\n\s*if \(typeof studyBreak !== 'undefined' && studyBreak\.isOpen && studyBreak\.isOpen\(\)\) return;/);
  });
  it('B2: the Desk Escape router does not destroy app windows under the game', () => {
    expect(html).toMatch(/var gameOpen = !!\(typeof studyBreak[\s\S]*?querySelectorAll\('\.app-overlay'\)\.forEach\(function\(el\) \{\s*if \(gameOpen\) return;/);
  });
  it('B3: the lobby swallows Enter/1/2/R (no invisible game) and Escape steps back; focused buttons keep native activation', () => {
    expect(sb).toMatch(/lobbyEl && lobbyEl\.style\.display === 'block'\)\s*\{\s*if \(key === 'Escape'\) \{ e\.preventDefault\(\); this\.leaveLobby\(\); \}\s*return;/);
    // preventDefault for game keys runs AFTER the dialog/lobby branches, so a focused DOM button still works
    const kd = sb.slice(sb.indexOf("document.addEventListener('keydown'"), sb.indexOf("document.addEventListener('keyup'"));
    expect(kd.indexOf('if (handled) e.preventDefault();')).toBeGreaterThan(kd.indexOf('this.leaveLobby()'));
    expect(kd).toMatch(/focused\.tagName === 'BUTTON' && challengeDlg\.contains\(focused\)\) return;/);
  });
  it('review: skipping ahead (R/Enter/click) inside the cross-KO window counts the game FIRST', () => {
    expect(sb).toMatch(/if \(!ms\.gameScored && this\.state === 'gameover'\) \{\s*ms\.gameOverAt = 0;\s*this\._studyBreakScoreGameOnce\(\);\s*if \(ms\.seriesOver\) return;/);
    expect(sb).toMatch(/if \(this\._inLiveMatch\(\)\) this\.sendGameState\(\);/);   // games 2/3 start with a fresh board on the rival's screen
  });
  it('review: one mute press flips BOTH sound systems from the combined state', () => {
    const toggleMute = method('toggleMute');
    globalThis.SFX.muted = false;
    globalThis.MacSFX = { muted: true, init() {} };
    const ctx = { _renderMute() {}, _announce() {} };
    toggleMute.call(ctx);
    expect(globalThis.SFX.muted).toBe(false);
    expect(globalThis.MacSFX.muted).toBe(false);
    toggleMute.call(ctx);
    expect(globalThis.SFX.muted).toBe(true);
    expect(globalThis.MacSFX.muted).toBe(true);
    delete globalThis.MacSFX;
  });
  it('review: a second challenger while a dialog is up is declined at once', () => {
    expect(sb).toMatch(/if \(this\.pendingChallenger && this\.pendingChallenger !== fromUser\) \{ reply\('challenge_decline'\); return; \}/);
  });
  it('B8: the doge challenge panel states the stake and escapes the challenger name', () => {
    expect(html).toMatch(/\$\{_deskEsc\(this\.incomingChallenge\.from\)\} wants to play/);
    expect(html).toMatch(/1 candy at stake, winner takes 2/);
  });
  it('B10: the dead Hall of Fame is gone (the relay never handled leaderboard_*)', () => {
    expect(html).not.toMatch(/leaderboard_(get|submit|data)/);
    expect(html).not.toMatch(/submitLeaderboardScore|leaderboardEntries/);
  });
  it('R2: the never-connecting WebRTC attempt is no longer started per match', () => {
    expect(sb).not.toMatch(/this\.setupWebRTC\(\);/);
  });
  it('Q15: one mute — SFX honours the Desk mute; the game button/M key toggle both', () => {
    expect(html).toMatch(/play\(name, volume = 0\.5\) \{\s*if \(this\.muted \|\| \(typeof MacSFX !== 'undefined' && MacSFX\.muted\)\) return;/);
    expect(html).toMatch(/<button type="button" class="mute-btn" id="mute-btn" aria-label="Mute game sounds" aria-pressed="false"/);
    expect(sb).toMatch(/if \(key === 'm' \|\| key === 'M'\) \{ this\.toggleMute\(\); return; \}/);
  });
  it('Q19: dialog semantics + a polite live region', () => {
    expect(html).toMatch(/<div class="game-window" role="dialog" aria-modal="true"/);
    expect(html).toMatch(/<div id="game-live" class="sr-only" aria-live="polite"><\/div>/);
  });
  it('Q14: Live Classroom state changes are mirrored into an open game', () => {
    expect(html).toMatch(/_lastClassroomSummary = summary;[\s\S]{0,300}studyBreak\.onClassroomSignal\(summary\)/);
    const on = method('onClassroomSignal');
    const ctx = { state: 'running', _classroomNote: '', flashes: [], flash(m) { this.flashes.push(m); }, updateHud() {} };
    on.call(ctx, { gate: { armed: true }, greenlight: false });
    expect(ctx._classroomNote).toMatch(/armed the gate/);
    on.call(ctx, { gate: { armed: true }, greenlight: true });
    expect(ctx._classroomNote).toMatch(/GREEN LIGHT/);
    on.call(ctx, { gate: null, greenlight: false });
    expect(ctx._classroomNote).toBe('');
    expect(ctx.flashes.length).toBe(2);
  });
  it('B7(feature): a solo board survives Esc and resumes PAUSED; a 1v1 board never does', () => {
    expect(sb).toMatch(/const resumable = this\.mode === 'solo' && this\.state === 'paused'/);
    expect(sb).toMatch(/if \(was1v1\) \{ this\.state = 'idle'; this\.resetBoardState\(\); \}/);
  });
  it('B10(feature): the teacher dashboard shows Study Break bets (W–L, net candy) from /class/casino', () => {
    const dash = fs.readFileSync(path.join(__dirname, '..', 'teacher-dashboard.html'), 'utf8');
    expect(dash).toMatch(/<th[^>]*>Bets W–L<\/th><th>Address \/ actions<\/th>/);
    expect(dash).toContain("fetchJson('/class/casino' + qs, teacherSecret())");
    expect(dash).toContain('function _fetchRewardCasino');
    expect(dash).toMatch(/_rewardCasino === null\) \{ _fetchRewardCasino\(\)/);
    expect(dash).toContain("'W–' + (cz.losses || 0) + 'L ('");
  });
  it('B15: the window is wide enough for the native canvas and the split row is centered', () => {
    expect(html).toMatch(/\.game-window \{ width: min\(442px, 96vw\); max-height: 96vh; overflow-y: auto; overflow-x: hidden; \}/);
    expect(html).toMatch(/\.game-content > canvas, #game-split \{ align-self: center; \}/);
  });
});
