// @vitest-environment jsdom
/**
 * tests/study-break-smoke.test.js — runtime smoke of the REAL studyBreak object.
 *
 * The object literal is evaluated as-is inside jsdom with a no-op 2D context (every canvas call
 * records nothing, measureText returns a width), then driven through a full solo game, a best-of-3
 * 1v1 series (garbage, simultaneous top-out, rematch card), the incoming-challenge dialog, Esc-resume,
 * and the touch strip. Anything that throws inside draw()/update()/the key router fails here — the
 * source-pin suites can't see runtime errors.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 6 });
      if (typeof k === 'string') return () => undefined;
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

let sbSrc;
beforeAll(() => {
  const start = html.indexOf('const studyBreak = {');
  const end = html.indexOf('\n};\n', start);
  sbSrc = html.slice(start, end) + '\n};\nwindow.studyBreak = studyBreak; window.closeGame = function () { studyBreak.close(); };';

  document.body.innerHTML = `
    <div id="game-overlay" style="display:none"><div class="game-window">
      <button id="mute-btn"></button>
      <canvas id="gameCanvas" width="430" height="302" tabindex="0"></canvas>
      <div id="game-split" style="display:none"><div id="p1-label"></div><canvas id="gameCanvas1"></canvas><div id="p2-label"></div><canvas id="gameCanvas2"></canvas></div>
      <div id="game-lobby" style="display:none"><div id="lobby-casino"></div><div id="lobby-players"></div><div id="lobby-status"></div></div>
      <div id="challenge-dialog" style="display:none"><div id="challenge-msg"></div><span id="challenge-timer"></span><button id="challenge-accept-btn"></button><button id="challenge-decline-btn"></button></div>
      <div id="game-score"></div><div id="game-help"></div>
      <div id="game-touch"><button class="game-touch-btn" data-act="left"></button><button class="game-touch-btn" data-act="right"></button><button class="game-touch-btn" data-act="down"></button><button class="game-touch-btn" data-act="ccw"></button><button class="game-touch-btn" data-act="cw"></button><button class="game-touch-btn" data-act="hold"></button><button class="game-touch-btn" data-act="drop"></button></div>
      <div id="game-live"></div>
    </div></div>`;
  window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };
  window.matchMedia = () => ({ matches: true });          // pretend coarse pointer → touch strip binds
  window.requestAnimationFrame = () => 1;                 // no free-running loop; frames are driven by hand
  window.cancelAnimationFrame = () => {};
  globalThis.SFX = { muted: false, init() {}, ensureCtx() {}, play() {}, toggleMute() { this.muted = !this.muted; return this.muted; } };
  globalThis.MacSFX = { muted: false, init() {}, play() {} };
  globalThis._deskEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));
  globalThis.__errors = errors;
  globalThis.eval(sbSrc);
  vi.useFakeTimers();
});
afterAll(() => { vi.useRealTimers(); });

const key = (k, opts = {}) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
const keyup = (k) => document.dispatchEvent(new window.KeyboardEvent('keyup', { key: k, bubbles: true }));
const frames = (sb, n, delta = 16) => { for (let i = 0; i < n; i++) { if (sb.state === 'running') sb.update(delta, performance.now()); sb.draw(); } };

describe('solo game', () => {
  it('opens on the mode card, starts with Enter, takes every key, plays to game over, shows the solo card', () => {
    const sb = window.studyBreak;
    sb.open();
    expect(sb.isOpen()).toBe(true);
    expect(sb.state).toBe('idle');
    expect(document.getElementById('game-touch').classList.contains('on')).toBe(true);
    key('Enter');
    expect(sb.state).toBe('running');
    expect(sb.active).toBeTruthy();
    expect(sb.hold).toBeTruthy();
    // every control at least once
    for (const k of ['ArrowLeft', 'ArrowRight', 'z', 'x', 'c', 'ArrowDown']) key(k);
    expect(sb.keys.down.down).toBe(true);
    frames(sb, 5);
    keyup('ArrowDown'); keyup('ArrowLeft'); keyup('ArrowRight');
    key('ArrowUp');                    // firm drop
    expect(sb.isGrounded(sb.active)).toBe(true);
    key('ArrowUp');                    // second tap locks
    expect(sb.active).toBe(null);
    frames(sb, 20);                    // entry delay → next piece
    expect(sb.active).toBeTruthy();
    key(' ');                          // hard drop
    expect(sb.active).toBe(null);
    key('r');                          // R mid-game must NOT restart
    expect(sb.state).toBe('running');
    key('p'); expect(sb.state).toBe('paused');
    key('p'); expect(sb.state).toBe('running');
    key('m'); expect(SFX.muted).toBe(true); key('m'); expect(SFX.muted).toBe(false);
    key('r', { ctrlKey: true });       // browser shortcut: ignored
    expect(sb.state).toBe('running');
    // play it out: alternate rotations + hard drops until the stack tops out
    let guard = 0;
    while (sb.state === 'running' && guard++ < 600) {
      frames(sb, 12);
      if (sb.active) { if (guard % 3 === 0) key('x'); if (guard % 5 === 0) key('ArrowLeft'), keyup('ArrowLeft'); key(' '); }
    }
    expect(sb.state).toBe('gameover');
    expect(Object.values(sb.pieceCounts).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(5);
    expect(sb._lastResult).toBeTruthy();
    sb.draw();                         // solo game-over card + histogram
    expect(document.getElementById('game-help').textContent).toMatch(/Game over/);
    expect(document.getElementById('game-live').textContent).toMatch(/game over, score \d+/);
    expect(globalThis.__errors).toEqual([]);
  });
  it('Esc mid-game keeps the board; reopening resumes PAUSED; Enter resumes', () => {
    const sb = window.studyBreak;
    key('Enter');                      // new game from the game-over card
    expect(sb.state).toBe('running');
    frames(sb, 3); key(' '); frames(sb, 20); key(' ');
    const linesBefore = sb.board.flat().filter(Boolean).length;
    expect(linesBefore).toBeGreaterThan(0);
    key('Escape');
    expect(sb.isOpen()).toBe(false);
    expect(sb.state).toBe('paused');
    sb.open();
    expect(sb.state).toBe('paused');
    expect(sb.board.flat().filter(Boolean).length).toBe(linesBefore);
    sb.draw();
    key('Enter');
    expect(sb.state).toBe('running');
    key('Escape');
    expect(globalThis.__errors).toEqual([]);
  });
  it('touch strip drives the same input path', () => {
    const sb = window.studyBreak;
    sb.open();
    sb.state = 'idle'; sb.resetBoardState();   // a fresh game (the previous test left a resumable board)
    key('Enter');
    frames(sb, 20);
    expect(sb.active).toBeTruthy();
    const btn = (act) => document.querySelector(`.game-touch-btn[data-act="${act}"]`);
    const x0 = sb.active.x;
    btn('left').dispatchEvent(new window.Event('pointerdown'));
    btn('left').dispatchEvent(new window.Event('pointerup'));
    expect(sb.active.x).toBe(x0 - 1);
    btn('down').dispatchEvent(new window.Event('pointerdown'));
    expect(sb.keys.down.down).toBe(true);
    btn('down').dispatchEvent(new window.Event('pointerup'));
    btn('drop').dispatchEvent(new window.Event('pointerdown'));
    expect(sb.active).toBe(null);
    key('Escape');
    expect(globalThis.__errors).toEqual([]);
  });
});

describe('incoming challenge dialog', () => {
  it('Enter/Escape route to accept/decline; Esc on the game declines a still-open dialog', () => {
    const sb = window.studyBreak;
    sb.open(); sb.state = 'idle';
    sb.showChallengeDialog('Carol');
    expect(document.getElementById('challenge-dialog').style.display).toBe('block');
    expect(document.getElementById('challenge-msg').textContent).toMatch(/1 candy at stake/);
    expect(sb.pendingChallenger).toBe('Carol');
    key('Escape');
    expect(document.getElementById('challenge-dialog').style.display).toBe('none');
    expect(sb.pendingChallenger).toBe(null);
    expect(sb.isOpen()).toBe(true);    // the dialog ate the Escape; the game stays open
    sb.showChallengeDialog('Dave');
    key('Escape');                     // (decline) …
    key('Escape');                     // … then this one closes the game
    expect(sb.isOpen()).toBe(false);
    sb.open(); sb.state = 'idle';
    sb.showChallengeDialog('Erin');
    vi.advanceTimersByTime(26000);     // client-side 25s timeout declines
    expect(document.getElementById('challenge-dialog').style.display).toBe('none');
    expect(sb.pendingChallenger).toBe(null);
    key('Escape');
    expect(globalThis.__errors).toEqual([]);
  });
});

describe('1v1 series', () => {
  it('countdown → running; garbage lands at lock; opponent KO scores; tie-break; series over → rematch card; Esc×2 forfeit', () => {
    const sb = window.studyBreak;
    sb.open();
    sb.mode = '1v1';
    sb.startMatch({ roomId: 'room-1', opponent: 'Bob', side: 'left' });
    expect(sb.state).toBe('countdown');
    sb.draw();
    vi.advanceTimersByTime(3100);
    expect(sb.state).toBe('running');
    expect(sb._inLiveMatch()).toBe(true);
    expect(sb.CELL).toBe(10);          // split-mode context
    // opponent traffic
    sb.updateOpponentState({ roomId: 'room-1', board: [[23, 0, 0], [23, 1, 1]], score: 40, lines: 1, level: 1, hold: 'O', queue: ['I', 'T', 'S'],
      active: { type: 'T', rot: 1, x: 3, y: 5 } });
    sb.updateOpponentState({ roomId: 'room-1', active: { type: 'T', rot: 2, x: 4, y: 6 } });   // light update
    expect(sb.mpState.opponentBoard[23][1]).toBeTruthy();
    sb.receiveGarbage(3, 'room-1');
    expect(sb.mpState.pendingGarbage).toBe(3);
    frames(sb, 3);
    key(' ');                           // a non-clearing lock → garbage lands now
    expect(sb.mpState.pendingGarbage).toBe(0);
    expect(sb.board[23].filter(Boolean).length).toBe(9);   // one hole
    frames(sb, 20);
    sb.draw();
    // game 1: opponent tops out first → I win
    sb.opponentKO(120, 'room-1');
    expect(sb.state).toBe('gameover');
    sb.draw();                          // card → scores the game
    expect(sb.mpState.myWins).toBe(1);
    expect(sb.mpState.gameNumber).toBe(1);
    vi.advanceTimersByTime(3100);       // auto-advance
    expect(sb.state).toBe('running');
    expect(sb.mpState.gameNumber).toBe(2);
    // game 2: I top out; the opponent's KO crosses within 600ms with a HIGHER score → I lose game 2
    sb.score = 10;
    sb._endGame('Top out');
    sb.draw();
    expect(sb.mpState.gameScored).toBe(false);   // deferred
    sb.opponentKO(999, 'room-1');
    sb.draw();
    expect(sb.mpState.gameScored).toBe(true);
    expect(sb.mpState.oppWins).toBe(1);
    expect(sb.mpState.myWins).toBe(1);
    vi.advanceTimersByTime(3100);
    expect(sb.mpState.gameNumber).toBe(3);
    // game 3: a plain self top-out with no crossing KO counts after the window
    sb._endGame('Stack jammed');
    sb.draw();
    expect(sb.mpState.gameScored).toBe(false);
    vi.advanceTimersByTime(700);
    sb.draw();
    expect(sb.mpState.gameScored).toBe(true);
    expect(sb.mpState.seriesOver).toBe(true);
    expect(sb.mpState.oppWins).toBe(2);
    sb.draw();                          // series card
    expect(document.getElementById('game-help').textContent).toMatch(/R = rematch/);
    sb.opponentLeft('quit');            // late leave: ignored
    expect(sb.mpState._forfeit).toBe(false);
    key('r');                           // rematch request (no socket here → status only, no throw)
    expect(sb._outgoing).toBe(null);
    key('Escape');                      // series over → no confirm needed, closes
    expect(sb.isOpen()).toBe(false);
    expect(sb.mpState).toBe(null);
    expect(sb.state).toBe('idle');      // a 1v1 board never resumes as solo
    // live match: first Esc only arms the forfeit
    sb.open(); sb.mode = '1v1';
    sb.startMatch({ roomId: 'room-2', opponent: 'Bob', side: 'right' });
    vi.advanceTimersByTime(3100);
    expect(sb.state).toBe('running');
    key('p');
    expect(sb.state).toBe('running');   // no pausing inside a live match
    key('Escape');
    expect(sb.isOpen()).toBe(true);
    key('Escape');
    expect(sb.isOpen()).toBe(false);
    expect(globalThis.__errors).toEqual([]);
  });
  it('the lobby swallows Enter/1/2/R and Escape steps back to the mode card', () => {
    const sb = window.studyBreak;
    sb.open();
    sb.mode = '1v1'; sb.state = 'idle';
    sb.canvas.style.display = 'none';
    document.getElementById('game-lobby').style.display = 'block';
    key('Enter'); key('1'); key('r');
    expect(sb.state).toBe('idle');
    key('Escape');
    expect(document.getElementById('game-lobby').style.display).toBe('none');
    expect(sb.isOpen()).toBe(true);
    expect(sb.mode).toBe('solo');
    key('Escape');
    expect(sb.isOpen()).toBe(false);
    expect(globalThis.__errors).toEqual([]);
  });
});
