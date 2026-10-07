// @vitest-environment node
/**
 * tests/pico-home-floor.test.js
 *
 * The Pico home's floor IS the real classroom board (teacher 2026-10-06: "the play area is a
 * separate small screen on the bottom, when instead it should feel continuous"). Flag on: the
 * board spans the page width with no box of its own, its ground line is the page's orange floor,
 * only the band from the floor up to the tallest idle thing is shown, and the band grows to the
 * whole room while a game (or a poll result) is showing and shrinks back after.
 *
 * jsdom has no layout, so pixel geometry (canvas width = page width, ground line y = floor y)
 * is checked in headless Chrome (see the report); here the sizing logic runs on the real Desk
 * against the board's own signals, and the room geometry the band is cut from is pinned.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const REPO = resolve(__dirname, '..');
const PICO = readFileSync(resolve(REPO, 'pico-home.js'), 'utf8');
const ROOM = readFileSync(resolve(REPO, 'apstat-park/calculator-room.mjs'), 'utf8');
const MISSION = readFileSync(resolve(REPO, 'apstat-park/calculator-mission.mjs'), 'utf8');
const NOW = '2026-10-07T14:00:00.000Z';

async function boot(flagOn = true) {
  const harness = await bootDesk({ now: NOW, url: DESK_URL + (flagOn ? '?home=park' : '') });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.window._classroomBoardHandle && harness.document.querySelector('#classroom-board-mount > canvas'),
    { timeoutMs: 3000, message: 'the classroom board did not mount' });
  return harness;
}

const settle = () => new Promise((r) => setTimeout(r, 60));

// Moves the page clock past the loading veil's cap (the room never mounts in jsdom) and re-lays the floor.
function skipVeil(win) {
  const now = win.performance.now.bind(win.performance);
  const shift = win.PicoHome.floorConstants.VEIL_MAX_MS + 1;
  win.performance.now = () => now() + shift;
  win.PicoHome.layoutFloor();
}

describe('Pico floor = the real board', { timeout: 120_000 }, () => {
  it('pins the room geometry the idle band is cut from (calculator-room.mjs)', () => {
    expect(MISSION).toContain('export const WORLD = { width: 720, height: 750, floor: 700 };');
    expect(MISSION).toContain('export const WORLD = { width: 720, height: 750, floor: 700 };');
    // The tallest idle thing on the room floor: the PICO PARK door label at floor - 70 …
    expect(ROOM).toContain("text(paint, 'PICO PARK', 24, WORLD.floor - 70, 14);");
    // … and the teaching text that is cropped while idle ends at y 604 (< floor - headroom).
    expect(ROOM).toContain("text(paint, 'THE PUSHERS BECOME YOUR TEAM', 85, 604, 14);");
    // The room's scale and its transparent canvas (the page shows through).
    expect(ROOM).toContain('function scale() { return Math.min(1, board.viewportW() / WORLD.width); }');
    expect(ROOM).toContain('CanvasEngine clears each frame; transparency reveals the actual calendar DOM.');
  });

  it('the real board node sits in the full-width floor, anchored at the bottom, with no box of its own', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const floor = doc.getElementById('pico-floor');
      const mount = doc.getElementById('classroom-board-mount');
      expect(floor.contains(mount)).toBe(true);
      expect(doc.querySelectorAll('#classroom-board-mount')).toHaveLength(1);
      await harness.waitFor(() => floor.classList.contains('has-board'));
      // CSS: page-wide floor, the mount filling it from the bottom edge; no border/background.
      expect(PICO).toContain("'#pico-home .scene > .floor { flex: none; margin-top: auto; position: relative; overflow: hidden;',");
      expect(PICO).toContain("'  width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); }',");
      expect(PICO).toContain("'#pico-home .floor #classroom-board-mount { position: absolute !important; left: 0; right: 0; bottom: 0;',");
      expect(PICO).toContain("'  width: 100% !important; max-width: none !important; margin: 0 !important; z-index: 1; }',");
      expect(win.getComputedStyle(mount).backgroundColor).toMatch(/^(rgba\(0, 0, 0, 0\)|transparent|)$/);
      // Under the board the Pico band continues the board's floor block to both page edges.
      expect(PICO).toContain("'#pico-home .floor.has-board .floor-band { z-index: 0; height: var(--pico-floor-block, 50px); }',");
    } finally {
      harness.teardown();
    }
  });

  it('idle band = board floor + the tallest idle thing; the ground line sits 50 px above the band bottom', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const floor = doc.getElementById('pico-floor');
      const mount = doc.getElementById('classroom-board-mount');
      const handle = win._classroomBoardHandle;
      const k = win.PicoHome.floorConstants;
      // Strip scene (no room mounted here: jsdom cannot import the room module). While loading the
      // board is veiled and the band is cut for the room it expects; once the veil gives up, the strip.
      win.PicoHome.layoutFloor();
      expect(floor.classList.contains('is-veiled')).toBe(true);
      expect(floor.style.height).toBe(Math.min(handle.getBoardHeight(), k.ROOM_IDLE_HEADROOM + k.BOARD_FLOOR_H) + 'px');
      skipVeil(win);
      expect(floor.dataset.floorMode).toBe('band');
      expect(floor.style.height).toBe(Math.min(handle.getBoardHeight(), k.STRIP_IDLE_HEADROOM + k.BOARD_FLOOR_H) + 'px');
      // The board's ground line is BOARD_FLOOR_H above its canvas bottom (canvas_engine.js),
      // and the canvas bottom is the floor's bottom, so the ground line is 50 px up the band.
      const canvas = mount.querySelector(':scope > canvas');
      expect(parseFloat(canvas.style.height) - win.eval('_classroomBoardHandle').getBoardHeight()).toBe(0);
      // The three park doors (strip) stand inside the visible band, so their buttons are clickable.
      const bandTop = handle.getBoardHeight() - parseFloat(floor.style.height);
      const doors = [...mount.querySelectorAll('[data-classroom-native]')];
      for (const d of doors) {
        if (d.style.display === 'none') continue;
        expect(parseFloat(d.style.top || '0')).toBeGreaterThanOrEqual(bandTop);
      }

      // The room, signalled the way calculator-room.mjs does: data-calculator-active and the
      // board grown to the room height.
      mount.setAttribute('data-calculator-active', '');
      handle.setBoardHeight(750);
      await settle();
      expect(floor.dataset.floorMode).toBe('band');
      expect(floor.style.height).toBe((k.ROOM_IDLE_HEADROOM + k.BOARD_FLOOR_H) + 'px');
    } finally {
      harness.teardown();
    }
  });

  it('the band grows to the whole room while a game runs and shrinks back after (board signals)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const floor = doc.getElementById('pico-floor');
      const mount = doc.getElementById('classroom-board-mount');
      const handle = win._classroomBoardHandle;
      const k = win.PicoHome.floorConstants;
      mount.setAttribute('data-calculator-active', '');
      handle.setBoardHeight(750);
      await settle();
      const band = (k.ROOM_IDLE_HEADROOM + k.BOARD_FLOOR_H) + 'px';
      expect(floor.style.height).toBe(band);
      // The team calculator round (calculator-room.mjs toggles data-calculator-participating).
      mount.setAttribute('data-calculator-participating', '');
      await settle();
      expect([floor.dataset.floorMode, floor.style.height]).toEqual(['room', '750px']);
      mount.removeAttribute('data-calculator-participating');
      await settle();
      expect([floor.dataset.floorMode, floor.style.height]).toEqual(['band', band]);
      // A campaign / park level (panel.mjs sets data-park-active).
      mount.setAttribute('data-park-active', '');
      await settle();
      expect(floor.dataset.floorMode).toBe('room');
      // Teacher 2026-10-07: a level draws its own ground with pits — the page-wide orange band
      // must not show through the gaps, so it is off while a level is active.
      expect(floor.classList.contains('is-level')).toBe(true);
      expect(PICO).toContain("'#pico-home .floor.is-level .floor-band { display: none; }',");
      mount.removeAttribute('data-park-active');
      await settle();
      expect(floor.dataset.floorMode).toBe('band');
      expect(floor.classList.contains('is-level')).toBe(false);
      // A poll result screen (pulled down at the top of the board) shows the whole room too.
      handle.showResultScreen([{ question: 'Q?', options: ['A', 'B'], tally: [1, 2] }]);
      await settle();
      expect(floor.dataset.floorMode).toBe('room');
      mount.querySelector('[data-classroom-result-close]').click();
      await settle();
      expect(floor.dataset.floorMode).toBe('band');
    } finally {
      harness.teardown();
    }
  });

  // The board's own relay socket (the one that sent classroom_join).
  function boardSocket(harness) {
    return harness.sockets.find((sock) => sock.sent.some((d) => String(d).indexOf('classroom_join') >= 0));
  }
  function deliver(harness, msg) {
    const sock = boardSocket(harness);
    sock.onmessage({ data: JSON.stringify(msg) });
  }
  const waitMode = (harness, mode) => harness.waitFor(
    () => harness.document.getElementById('pico-floor').dataset.floorMode === mode,
    { timeoutMs: 2000, message: 'floor did not become ' + mode });

  // jsdom keeps no scroll position: a clamping-aware scrollTop on the Pico root. The page is the
  // home above the floor (500 px) plus the floor; the viewport is 400 px tall. Like a browser,
  // the position is clamped to scrollHeight - clientHeight whenever the page gets shorter.
  function trackScroll(doc, win) {
    const root = doc.getElementById('pico-home');
    const floor = doc.getElementById('pico-floor');
    const CLIENT_H = 400;
    const scrollHeight = () => 500 + (parseFloat(floor.style.height) || 0);
    const clamp = (v) => Math.max(0, Math.min(v, scrollHeight() - CLIENT_H));
    let value = 0;
    const writes = [];
    Object.defineProperty(root, 'scrollTop', { configurable: true, get: () => clamp(value), set: (v) => { value = clamp(v); writes.push(v); } });
    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: scrollHeight });
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => CLIENT_H });
    return {
      writes,
      set(v) { value = v; },
      // The student's own scroll: a position change and the browser's scroll event.
      async user(v) {
        await new Promise((r) => setTimeout(r, 200));   // well after our own writes
        value = clamp(v);
        root.dispatchEvent(new win.Event('scroll'));
      },
    };
  }

  it('a whole-class poll keeps the floor expanded from open to close (voting does not end it)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc } = harness;
      expect(boardSocket(harness)).toBeTruthy();
      await waitMode(harness, 'band');
      deliver(harness, { type: 'classroom_poll', id: 'p1', question: 'Which plot?', options: ['A', 'B'] });
      await waitMode(harness, 'room');
      // The student votes: the poll is still live.
      deliver(harness, { type: 'classroom_member_update', member: { username: 'alpha_otter', status: 'voted', vote: 1 } });
      await settle(); await new Promise((r) => setTimeout(r, 400));
      expect(doc.getElementById('pico-floor').dataset.floorMode).toBe('room');
      // Closed: the result screen comes down (still expanded) …
      deliver(harness, { type: 'classroom_poll_closed', id: 'p1', tally: [3, 5] });
      await new Promise((r) => setTimeout(r, 400));
      expect(doc.getElementById('pico-floor').dataset.floorMode).toBe('room');
      // … and once it is dismissed, back to the band.
      doc.querySelector('[data-classroom-result-close]').click();
      await waitMode(harness, 'band');
    } finally {
      harness.teardown();
    }
  });

  it('a teacher activity expands the floor until it ends', async () => {
    const harness = await boot(true);
    try {
      await waitMode(harness, 'band');
      deliver(harness, { type: 'classroom_activity_start', activity: { type: 'bridge-mean', startedAt: Date.now(), durationMs: 60000, state: {} } });
      await waitMode(harness, 'room');
      deliver(harness, { type: 'classroom_activity_cancel' });
      await waitMode(harness, 'band');
    } finally {
      harness.teardown();
    }
  });

  it('the result screen keeps its chart, stepper and close button inside the board (chart capped)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const floor = doc.getElementById('pico-floor');
      win._classroomBoardHandle.showResultScreen([{ question: 'Q1?', options: ['A', 'B'], tally: [1, 2] }, { question: 'Q2?', options: ['A'], tally: [3] }]);
      await waitMode(harness, 'room');
      const canvasH = parseFloat(doc.querySelector('#classroom-board-mount > canvas').style.height);
      expect(floor.style.getPropertyValue('--pico-result-chart-max')).toBe(Math.max(60, canvasH - 100) + 'px');
      expect(PICO).toContain("'  height: min(320px, var(--pico-result-chart-max, 320px)) !important; margin: 0 auto; }',");
      // The floor is exactly the board (the result lives inside the board's own clipping container).
      expect(floor.style.height).toBe(canvasH + 'px');
      const result = doc.querySelector('[data-classroom-result-screen]');
      expect(result.contains(doc.querySelector('[data-classroom-result-close]'))).toBe(true);
      expect(doc.getElementById('classroom-board-mount').contains(result)).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it('a broadcast (passive result screen) never scrolls the page', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const scroll = trackScroll(doc, win);
      scroll.set(40);
      win._classroomBoardHandle.showResultScreen([{ question: 'Q?', options: ['A', 'B'], tally: [1, 2] }]);
      await waitMode(harness, 'room');
      doc.querySelector('[data-classroom-result-close]').click();
      await waitMode(harness, 'band');
      expect(scroll.writes).toEqual([]);
      expect(doc.getElementById('pico-home').scrollTop).toBe(40);
    } finally {
      harness.teardown();
    }
  });

  it('a floor click followed at once by a teacher poll does not scroll (the cause is the broadcast)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const scroll = trackScroll(doc, win);
      scroll.set(20);
      await waitMode(harness, 'band');
      doc.getElementById('classroom-board-mount').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
      deliver(harness, { type: 'classroom_poll', id: 'p9', question: 'Now?', options: ['A', 'B'] });
      await waitMode(harness, 'room');
      expect(scroll.writes).toEqual([]);
      deliver(harness, { type: 'classroom_state', live: false, gate: null, poll: null, members: [] });
      await waitMode(harness, 'band');
      expect(scroll.writes).toEqual([]);
    } finally {
      harness.teardown();
    }
  });

  // The calculator room as the board exposes it (getParkScene): kind, getState() (the relay's round
  // state, null while students gather) and getView() (the local player's x and the entrance edge).
  function fakeRoom(win, { state = null, playerX = 65 } = {}) {
    const room = { kind: 'calculator', state, playerX,
      getState() { return this.state; }, getView() { return { playerX: this.playerX, entranceX: 720 }; } };
    win._classroomBoardHandle.getParkScene = () => room;
    return room;
  }

  it('a game the student starts from the floor scrolls the room in, and back only if they did not scroll since', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const mount = doc.getElementById('classroom-board-mount');
      const room = fakeRoom(win, { state: { epoch: 'e1', step: 0 }, playerX: 65 });   // a real round: the relay sent its state
      const scroll = trackScroll(doc, win);
      await waitMode(harness, 'band');
      scroll.set(12);
      // The student acts on the floor (a click on the board), then their round starts.
      doc.getElementById('classroom-board-mount').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
      mount.setAttribute('data-calculator-participating', ''); room.playerX = 785;
      await waitMode(harness, 'room');
      const roomH = 500 + parseFloat(doc.getElementById('pico-floor').style.height);
      expect(scroll.writes).toEqual([roomH]);
      expect(doc.getElementById('pico-home').scrollTop).toBe(roomH - 400);   // clamped to the bottom
      mount.removeAttribute('data-calculator-participating'); room.playerX = 65;
      await waitMode(harness, 'band');
      // The page got shorter (the browser clamps), yet the student never scrolled: restored.
      expect(scroll.writes).toEqual([roomH, 12]);
      expect(doc.getElementById('pico-home').scrollTop).toBe(12);

      // Again, but the student scrolls elsewhere while the room is up: not reset.
      doc.getElementById('classroom-board-mount').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
      mount.setAttribute('data-calculator-participating', ''); room.playerX = 785;
      await waitMode(harness, 'room');
      await scroll.user(100);   // the student's own scroll
      const before = scroll.writes.length;
      mount.removeAttribute('data-calculator-participating'); room.playerX = 65;
      await waitMode(harness, 'band');
      expect(scroll.writes.length).toBe(before);   // not reset
      expect(doc.getElementById('pico-home').scrollTop).toBe(100);
    } finally {
      harness.teardown();
    }
  });

  it('teacher at the keypad while students gather: the band shows the zone, the page never scrolls', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      win.localStorage.setItem('apstats_user_role', 'teacher');
      const mount = doc.getElementById('classroom-board-mount');
      mount.setAttribute('data-calculator-active', '');
      win._classroomBoardHandle.setBoardHeight(750);
      const room = fakeRoom(win, { state: null, playerX: 65 });
      await waitMode(harness, 'band');
      const scroll = trackScroll(doc, win);
      scroll.set(15);
      // Walking with the arrow keys (keys on the page count as floor input) …
      doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      room.playerX = 785;   // … into the calculator zone
      await waitMode(harness, 'room');
      // Even if a participating marker were present, a teacher with no round state never scrolls.
      mount.setAttribute('data-calculator-participating', '');
      await new Promise((r) => setTimeout(r, 400));
      expect(scroll.writes).toEqual([]);
      mount.removeAttribute('data-calculator-participating');
      room.playerX = 65;
      await waitMode(harness, 'band');
      expect(scroll.writes).toEqual([]);
    } finally {
      harness.teardown();
    }
  });

  it('student in the calculator zone while gathering: expanded, no scroll; their round starting then scrolls', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const mount = doc.getElementById('classroom-board-mount');
      mount.setAttribute('data-calculator-active', '');
      win._classroomBoardHandle.setBoardHeight(750);
      const room = fakeRoom(win, { state: null, playerX: 65 });
      await waitMode(harness, 'band');
      const scroll = trackScroll(doc, win);
      scroll.set(15);
      doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      room.playerX = 785;
      await waitMode(harness, 'room');
      await new Promise((r) => setTimeout(r, 400));
      expect(scroll.writes).toEqual([]);   // gathering: the zone shows, the page stays
      // Their round starts: the room marks participation and the relay's state arrives.
      mount.setAttribute('data-calculator-participating', '');
      room.state = { epoch: 'e1', step: 0 };
      await harness.waitFor(() => scroll.writes.length === 1, { timeoutMs: 1500, message: 'the round did not scroll the room in' });
    } finally {
      harness.teardown();
    }
  });

  it('a pending claim dies with the student’s own scroll: late round state then never scrolls', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const mount = doc.getElementById('classroom-board-mount');
      mount.setAttribute('data-calculator-active', '');
      win._classroomBoardHandle.setBoardHeight(750);
      const room = fakeRoom(win, { state: null, playerX: 65 });
      await waitMode(harness, 'band');
      const scroll = trackScroll(doc, win);
      scroll.set(15);
      doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));   // the claim
      room.playerX = 785;
      await waitMode(harness, 'room');
      await scroll.user(60);   // the student scrolls away while the class gathers
      mount.setAttribute('data-calculator-participating', '');
      room.state = { epoch: 'e1', step: 0 };   // the round's state arrives late
      await new Promise((r) => setTimeout(r, 900));
      expect(scroll.writes).toEqual([]);
      expect(doc.getElementById('pico-home').scrollTop).toBe(60);
    } finally {
      harness.teardown();
    }
  });

  it('a pending claim dies when the expansion becomes broadcast-owned: no scroll, even after the broadcast ends', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const mount = doc.getElementById('classroom-board-mount');
      mount.setAttribute('data-calculator-active', '');
      win._classroomBoardHandle.setBoardHeight(750);
      const room = fakeRoom(win, { state: null, playerX: 65 });
      await waitMode(harness, 'band');
      const scroll = trackScroll(doc, win);
      scroll.set(15);
      doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));   // the claim
      room.playerX = 785;
      await waitMode(harness, 'room');
      deliver(harness, { type: 'classroom_poll', id: 'p7', question: 'Ready?', options: ['A', 'B'] });   // whole-class
      mount.setAttribute('data-calculator-participating', '');
      room.state = { epoch: 'e1', step: 0 };
      await new Promise((r) => setTimeout(r, 600));
      expect(scroll.writes).toEqual([]);
      // The broadcast is dismissed while participation remains: the claim stays void.
      deliver(harness, { type: 'classroom_state', live: false, gate: null, poll: null, members: [] });
      await new Promise((r) => setTimeout(r, 900));
      expect(scroll.writes).toEqual([]);
    } finally {
      harness.teardown();
    }
  });

  it('loading: the board stays hidden (no cream strip flash) until the room mounts; only the orange floor shows', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const floor = doc.getElementById('pico-floor');
      const mount = doc.getElementById('classroom-board-mount');
      const band = floor.querySelector('.floor-band');
      win.PicoHome.layoutFloor();
      // Before the room: veiled (the mount, with the strip's cream canvas, is visibility:hidden).
      expect(floor.classList.contains('is-veiled')).toBe(true);
      expect(mount.matches('#pico-home .floor.is-veiled #classroom-board-mount')).toBe(true);
      expect(PICO).toContain("'#pico-home .floor.is-veiled #classroom-board-mount { visibility: hidden; }',");
      expect(band.matches('#pico-home .floor.has-board .floor-band')).toBe(true);   // the orange line stays
      // The room mounts (calculator-room.mjs marks the mount and grows the board): revealed.
      mount.setAttribute('data-calculator-active', '');
      win._classroomBoardHandle.setBoardHeight(750);
      await harness.waitFor(() => !floor.classList.contains('is-veiled'), { timeoutMs: 1500, message: 'the veil did not lift on mount' });
      expect(mount.matches('#pico-home .floor.is-veiled #classroom-board-mount')).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('a whole-class poll still shows the strip at once (expanded), veil or not', async () => {
    const harness = await boot(true);
    try {
      const { document: doc } = harness;
      const floor = doc.getElementById('pico-floor');
      harness.window.PicoHome.layoutFloor();
      expect(floor.classList.contains('is-veiled')).toBe(true);
      deliver(harness, { type: 'classroom_poll', id: 'p3', question: 'Which?', options: ['A', 'B'] });
      await waitMode(harness, 'room');
      expect(floor.classList.contains('is-veiled')).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('the Pico band continues the room floor block page-wide: same top edge at every width', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const floor = doc.getElementById('pico-floor');
      const mount = doc.getElementById('classroom-board-mount');
      const k = win.PicoHome.floorConstants;
      mount.setAttribute('data-calculator-active', '');
      for (const width of [1920, 1366, 390]) {
        Object.defineProperty(mount, 'clientWidth', { configurable: true, get: () => width });
        const scale = Math.min(1, width / k.ROOM_WORLD_W);
        win._classroomBoardHandle.setBoardHeight(Math.round(750 * scale));   // calculator-room: WORLD.height * scale
        win.PicoHome.layoutFloor();
        const canvasH = parseFloat(mount.querySelector(':scope > canvas').style.height);
        const block = parseFloat(floor.style.getPropertyValue('--pico-floor-block'));
        // The band's top edge = the room's floor-block top (WORLD.floor * scale from the canvas top).
        expect(canvasH - block).toBeCloseTo(k.ROOM_WORLD_FLOOR * scale, 5);
      }
      expect(PICO).toContain("'#pico-home .floor-band { position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: var(--orange); }',");
    } finally {
      harness.teardown();
    }
  });

  it('the 300 ms floor watch pauses while the tab is hidden and stops for Use Original Desk', () => {
    expect(PICO).toContain("if (document.visibilityState === 'hidden') return;   // paused while the tab is hidden");
    expect(PICO).toMatch(/function useOriginalDesk\(\) \{\n    cancelPollReturn\(\);\n    stopFloorWatch\(\);/);
  });

  it('flag off: the board stays where the Desk puts it, untouched', async () => {
    const harness = await boot(false);
    try {
      const { document: doc } = harness;
      const mount = doc.getElementById('classroom-board-mount');
      expect(doc.getElementById('window-wrap').contains(mount)).toBe(true);
      expect(doc.getElementById('pico-floor')).toBeNull();
      expect(mount.getAttribute('style')).toMatch(/max-width: ?640px/);
    } finally {
      harness.teardown();
    }
  });
});
