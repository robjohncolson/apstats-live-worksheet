// @vitest-environment node
/**
 * tests/pico-home-study-break.test.js
 *
 * Study Break (Tetris) in the Pico Desk, teacher 2026-10-10:
 *  1. "when I do Study Break my keystrokes are still going to the Pico Park cat; they should be
 *     contained within the Study Break window." With the flag on, while Study Break is the top
 *     window every key goes to Study Break's own handler and never reaches `document`, where the
 *     board's cat (classroom-board.js) and the park scenes (apstat-park) listen. Closed, keys go
 *     back to the floor. The classic Desk is unchanged.
 *  2. "should the study break window be refactored as well in pico park style?" The window's DOM
 *     parts are restyled under the flag; the same match run through both skins shows the same
 *     buttons and text in the lobby, the bet dialog, the countdown, in game and on the result,
 *     and sends the same relay messages.
 *
 * Runs on the real Desk (tests/journeys/harness.js).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const PICO = readFileSync(resolve(__dirname, '..', 'pico-home.js'), 'utf8');
const NOW = '2026-10-07T14:00:00.000Z';
const OPEN_AT = new Date(NOW).getTime() + 30_000;   // both skins start the run at this fake time
// Every key the park scenes and the board's cat listen for (classroom-board: arrows / Space;
// campaign: arrows, WASD, Space, X/K, F/G, R, Esc; calculator room: Shift, Up, Esc).
const PARK_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'w', 'a', 's', 'd', 'x', 'k', 'f', 'g', 'G', 'X', 'r', 'Shift'];
const RELAY_TYPES = /^(game_|challenge|rematch)/;

async function boot(flagOn) {
  const harness = await bootDesk({ now: NOW, fakeTimers: true, url: DESK_URL + (flagOn ? '?home=park' : '') });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'),
    { message: 'signed-in identity chip did not render' });
  for (const name of ['closeDialog', 'closeNameFinder', 'closeSignInModal', 'closeDoNowBump']) {
    try { if (typeof harness.window[name] === 'function') harness.window[name](); } catch (_) {}
  }
  const { window: win } = harness;
  win.AudioContext = function () { return { state: 'running', resume() {}, currentTime: 0 }; };
  // jsdom has no Web Audio: the game's sound effects become no-ops (same in both skins).
  win.eval('SFX').play = () => {};
  // No free-running game loop: frames only move when a key moves them (deterministic runs).
  win.requestAnimationFrame = () => 1;
  win.cancelAnimationFrame = () => {};
  await harness.flush(4);
  expect(harness.clock.now(), 'boot took longer than the shared start time').toBeLessThan(OPEN_AT);
  harness.clock.advance(OPEN_AT - harness.clock.now());
  await harness.flush(2);
  return harness;
}

function press(win, target, key, type = 'keydown') {
  const event = new win.KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

// A listener exactly where the floor's listeners are: `document`, bubble phase.
function floorSpy(doc) {
  const seen = [];
  const listener = (e) => seen.push(e.type + ':' + e.key);
  doc.addEventListener('keydown', listener);
  doc.addEventListener('keyup', listener);
  return seen;
}

describe('Study Break owns the keyboard while it is open (Pico flag)', { timeout: 180_000 }, () => {
  it('flag on: game keys reach Tetris and never the floor; after close they reach the floor again', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const sb = win.studyBreak;
      const seen = floorSpy(doc);
      win.openGame();
      await harness.flush(1);
      expect(sb.isOpen()).toBe(true);
      const canvas = doc.getElementById('gameCanvas');

      press(win, canvas, 'Enter');                 // the mode card: Enter starts a solo game
      expect(sb.state).toBe('running');
      for (const key of PARK_KEYS) {
        press(win, canvas, key);
        press(win, canvas, key, 'keyup');
      }
      // A key aimed at the page (focus left the game) stays with Study Break too.
      press(win, doc.body, 'ArrowRight');
      expect(sb.keys.right.down).toBe(true);        // Tetris got it
      press(win, doc.body, 'ArrowRight', 'keyup');
      expect(sb.keys.right.down).toBe(false);
      press(win, canvas, 'ArrowLeft');
      expect(sb.keys.left.down).toBe(true);
      press(win, canvas, 'ArrowLeft', 'keyup');
      expect(sb.keys.left.down).toBe(false);
      expect(seen).toEqual([]);                     // the floor heard nothing

      // Esc still closes Study Break (solo: at once), and only Study Break.
      press(win, canvas, 'Escape');
      expect(sb.isOpen()).toBe(false);
      expect(seen).toEqual([]);

      // Closed: keys go back to the cat.
      press(win, doc.body, 'ArrowLeft');
      press(win, doc.body, 'ArrowLeft', 'keyup');
      expect(seen).toEqual(['keydown:ArrowLeft', 'keyup:ArrowLeft']);
    } finally {
      await harness.flush(8);   // let the sign-in's pending roster fetches settle before the window closes
      harness.teardown();
    }
  });

  it('flag on: Tab, a typing field outside the game and the Doge challenge alert are left alone', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const seen = floorSpy(doc);
      win.openGame();
      await harness.flush(1);
      press(win, doc.getElementById('gameCanvas'), 'Tab');
      const field = doc.createElement('input');
      doc.body.appendChild(field);
      press(win, field, 'a');
      win.DogePresence.incomingChallenge = { from: 'beta_fox', countdown: 25, timer: null };
      press(win, doc.body, 'Enter');
      win.DogePresence.incomingChallenge = null;
      expect(seen).toEqual(['keydown:Tab', 'keydown:a', 'keydown:Enter']);
      expect(win.PicoHome.studyBreakOwnsKey({ type: 'keydown', key: 'ArrowLeft', target: doc.body })).toBe(true);
      win.closeGame();
      expect(win.PicoHome.studyBreakOwnsKey({ type: 'keydown', key: 'ArrowLeft', target: doc.body })).toBe(false);
    } finally {
      await harness.flush(8);   // let the sign-in's pending roster fetches settle before the window closes
      harness.teardown();
    }
  });

  it('flag on: Escape in the lobby reaches Study Break (back to the mode card), even after the park scene mounted', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const sb = win.studyBreak;
      const seen = floorSpy(doc);
      win.openGame();
      await harness.flush(1);
      sb.startMultiplayer();
      expect(doc.getElementById('game-lobby').style.display).toBe('block');
      press(win, doc.getElementById('gameCanvas'), 'Escape');
      expect(doc.getElementById('game-lobby').style.display).toBe('none');
      expect(sb.mode).toBe('solo');
      expect(sb.isOpen()).toBe(true);
      expect(seen).toEqual([]);
    } finally {
      await harness.flush(8);   // let the sign-in's pending roster fetches settle before the window closes
      harness.teardown();
    }
  });

  it('flag off: the classic Desk is unchanged (no Pico key owner; keys reach document as before)', async () => {
    const harness = await boot(false);
    try {
      const { window: win, document: doc } = harness;
      const seen = floorSpy(doc);
      win.openGame();
      await harness.flush(1);
      press(win, doc.getElementById('gameCanvas'), 'ArrowLeft');
      expect(seen).toEqual(['keydown:ArrowLeft']);
      expect(win.PicoHome).toBeUndefined();
      expect(win.studyBreak.init.picoKeysWrapped).toBeUndefined();
    } finally {
      await harness.flush(8);   // let the sign-in's pending roster fetches settle before the window closes
      harness.teardown();
    }
  });
});

// Everything a student reads or can press in the window (Desk ids only).
function view(win, doc) {
  const sb = win.studyBreak;
  const shown = (id) => { const n = doc.getElementById(id); return n ? n.style.display : null; };
  const text = (id) => { const n = doc.getElementById(id); return n ? n.textContent : null; };
  const buttons = (sel) => [...doc.querySelectorAll(sel)].map((b) => [b.id, b.textContent, b.disabled]);
  return {
    state: sb.state,
    mode: sb.mode,
    open: sb.isOpen(),
    canvas: shown('gameCanvas'),
    score: [shown('game-score'), text('game-score')],
    help: text('game-help'),
    split: [shown('game-split'), text('p1-label'), text('p2-label')],
    lobby: [shown('game-lobby'), text('game-lobby')],
    lobbyButtons: buttons('#game-lobby button'),
    dialog: [shown('challenge-dialog'), text('challenge-title'), text('challenge-msg'), text('challenge-timer')],
    dialogButtons: buttons('#challenge-dialog button'),
    windowButtons: buttons('#game-overlay .game-title-bar button'),
    live: text('game-live'),
  };
}

async function runMatch(flagOn) {
  const harness = await boot(flagOn);
  const { window: win, document: doc } = harness;
  const frames = [];
  const relay = [];
  const snap = async (label) => { await harness.flush(1); frames.push({ label, view: view(win, doc) }); };
  try {
    const sb = win.studyBreak;
    win.openGame();
    await harness.flush(1);
    // The live socket the match uses (DogePresence's); record every game message it sends.
    const ws = { readyState: 1, send(data) { const m = JSON.parse(data); if (RELAY_TYPES.test(m.type)) relay.push(m); }, close() {} };
    win.DogePresence.ws = ws;
    sb.mpWs = ws;
    await snap('mode card');
    const canvas = doc.getElementById('gameCanvas');

    // Lobby.
    sb.startMultiplayer();
    win.DogePresence.ws = ws;
    sb.mpOnlinePlayers = ['alpha_otter', 'beta_fox', 'gamma_owl'];
    win.DogePresence.locations = { beta_fox: { onDesk: true }, gamma_owl: { onDesk: false } };
    sb.updateLobby();
    await snap('lobby');
    [...doc.querySelectorAll('#lobby-players button')].find((b) => b.textContent.startsWith('beta_fox')).click();
    await snap('lobby challenge sent');
    // Back to the mode card by the lobby's own Back button. (Not Escape: on the classic Desk the
    // park's calculator room, listening on document before Study Break, takes Esc first. That is
    // the leak the Pico key owner closes; see the Esc-in-lobby test above.)
    [...doc.querySelectorAll('#game-lobby button')].find((b) => b.textContent === 'Back').click();
    await snap('lobby left');

    // The in-game challenge (bet) dialog, declined.
    sb.showChallengeDialog('gamma_owl');
    await snap('bet dialog');
    doc.getElementById('challenge-decline-btn').click();
    await snap('bet dialog declined');

    // Countdown → in game → result.
    sb.mode = '1v1';
    sb.startMatch({ roomId: 'room-pico', opponent: 'beta_fox', side: 'left' });
    await snap('countdown');
    harness.clock.advance(3100);
    await snap('in game');
    sb.updateOpponentState({ roomId: 'room-pico', board: [[23, 0, 0], [23, 1, 1]], score: 40, lines: 1, level: 1, hold: 'O', queue: ['I', 'T', 'S'],
      active: { type: 'T', rot: 1, x: 3, y: 5 } });
    press(win, canvas, 'ArrowLeft');
    press(win, canvas, 'ArrowLeft', 'keyup');
    press(win, canvas, ' ');                       // hard drop
    harness.clock.advance(2000);
    await snap('in game after a drop');
    sb.opponentKO(120, 'room-pico');
    sb.draw();
    await snap('result');
    press(win, canvas, 'r');                       // rematch request
    await snap('rematch asked');
    doc.querySelector('#game-overlay .game-title-bar .close-box').click();   // series over: closes at once
    await snap('closed');
    return { frames, relay };
  } finally {
    await harness.flush(8);   // let the sign-in's pending roster fetches settle before the window closes
    harness.teardown();
  }
}

describe('Study Break in the Pico style: one match through both skins', { timeout: 240_000 }, () => {
  it('same buttons and text in every state, same relay messages', async () => {
    const classic = await runMatch(false);
    const pico = await runMatch(true);

    // The run reached every state (so the comparison is not of two empty runs).
    const at = (run, label) => run.frames.find((f) => f.label === label).view;
    expect(at(classic, 'lobby').lobby[0]).toBe('block');
    expect(at(classic, 'lobby').lobbyButtons.map((b) => b[1])).toEqual(expect.arrayContaining(['beta_foxChallenge →', 'Back']));
    expect(at(classic, 'bet dialog').dialog[0]).toBe('block');
    expect(at(classic, 'countdown').state).toBe('countdown');
    expect(at(classic, 'in game').state).toBe('running');
    expect(at(classic, 'result').state).toBe('gameover');
    expect(at(classic, 'result').help).toMatch(/R = rematch/);
    expect(at(classic, 'closed').open).toBe(false);
    const types = classic.relay.map((m) => m.type);
    expect(types).toEqual(expect.arrayContaining(['game_challenge', 'challenge_decline', 'game_leave']));

    expect(pico.frames.map((f) => f.label)).toEqual(classic.frames.map((f) => f.label));
    pico.frames.forEach((frame, i) => expect(frame.view, frame.label).toEqual(classic.frames[i].view));
    expect(pico.relay).toEqual(classic.relay);
  });

  it('the skin: flag-on CSS only, scoped to the framed overlay; never the window box or the canvas', async () => {
    const block = PICO.split('\n').filter((line) => line.includes('#game-overlay.pico-framed'));
    expect(block.length).toBeGreaterThan(10);
    block.forEach((line) => {
      expect(line).toMatch(/^\s*'html\.pico-home #game-overlay\.pico-framed/);
      expect(line).not.toMatch(/game-window|#gameCanvas|game-content canvas/);
    });
    // The fixed-height lines keep their heights; the touch strip keeps its size.
    const sized = block.filter((l) => /\.game-score|\.game-help|\.game-touch/.test(l) && !/:not\(\.game-touch-btn\)/.test(l));
    expect(sized).toHaveLength(4);
    sized.forEach((line) => expect(line).not.toMatch(/height|padding|min-|margin/));
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      win.openGame();
      await harness.flush(1);
      expect(doc.getElementById('game-overlay').classList.contains('pico-framed')).toBe(true);
    } finally {
      await harness.flush(8);   // let the sign-in's pending roster fetches settle before the window closes
      harness.teardown();
    }
  });
});
