// APStat Park: the board grows to a level's height only while the level is
// open (setBoardHeight), and every exit restores the 220 px calendar strip.
import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { mountBoardScene, BASE_BOARD_H } from '../apstat-park/board-scene.mjs';

const BOARD_SRC = readFileSync(resolve(__dirname, '../classroom-board.js'), 'utf8');

function mountBoard(dpr = 2) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', { url: 'https://example.com' });
  const win = dom.window;
  function WS() { this.readyState = 0; this.sent = []; }
  WS.prototype.send = function (d) { this.sent.push(d); };
  WS.prototype.close = function () {};
  win.WebSocket = WS;
  win.setInterval = () => 0; win.clearInterval = () => {};
  win.setTimeout = () => 0; win.clearTimeout = () => {};
  Object.defineProperty(win, 'devicePixelRatio', { value: dpr, configurable: true, writable: true });
  win.requestAnimationFrame = () => {};
  function Engine(id) {
    this.canvas = win.document.getElementById(id);
    this.ctx = { setTransform() {} };
    this.entities = new Map();
    win.__engine = this;
  }
  Engine.prototype.addEntity = function (id, e) { this.entities.set(id, e); e.engine = this; };
  Engine.prototype.removeEntity = function (id) { this.entities.delete(id); };
  Engine.prototype.start = function () {}; Engine.prototype.stop = function () {};
  Engine.prototype.resize = function () {};
  // Same formula as canvas_engine.js.
  Object.defineProperty(Engine.prototype, 'groundY', { get() { return this.canvas.height / (win.devicePixelRatio || 1) - 50; } });
  win.CanvasEngine = Engine;
  win.SpriteSheet = function () { this.loaded = true; this.drawFrame = () => {}; };
  runInContext(BOARD_SRC, createContext(win));
  const host = win.document.getElementById('host');
  const handle = win.ClassroomBoard.mount(host, { wsUrl: 'wss://x', section: 'B', username: 'me', role: 'student', hue: 90 });
  const canvas = handle.getCanvas();
  return { win, handle, canvas, host, engine: win.__engine };
}

function doorButtons(host) { return [...host.querySelectorAll('[data-classroom-native]')]; }

describe('park-only board height', () => {
  it('starts at 220: CSS size, backing store at the device pixel ratio, groundY 170', () => {
    const { handle, canvas, engine } = mountBoard(2);
    expect(handle.getBoardHeight()).toBe(220);
    expect(canvas.style.height).toBe('220px');
    expect(canvas.height).toBe(440);
    expect(engine.groundY).toBe(170);
  });

  it('setBoardHeight grows the CSS and backing-store height and moves groundY', () => {
    const { handle, canvas, engine } = mountBoard(2);
    handle.setBoardHeight(240);
    expect(handle.getBoardHeight()).toBe(240);
    expect(canvas.style.height).toBe('240px');
    expect(canvas.height).toBe(480);
    expect(engine.groundY).toBe(190);
  });

  it('a window resize while a tall level is open keeps the level height', () => {
    const { win, handle, canvas } = mountBoard(1);
    handle.setBoardHeight(260);
    win.dispatchEvent(new win.Event('resize'));
    expect(canvas.style.height).toBe('260px');
    expect(canvas.height).toBe(260);
  });

  it('no argument (or a bad value) restores 220', () => {
    const { handle, canvas } = mountBoard(1);
    handle.setBoardHeight(240);
    handle.setBoardHeight();
    expect(canvas.style.height).toBe('220px');
    handle.setBoardHeight(240);
    handle.setBoardHeight(NaN);
    expect(handle.getBoardHeight()).toBe(220);
    expect(canvas.height).toBe(220);
  });

  it('the door buttons follow groundY (top = groundY - 32, the 32 px door)', () => {
    const { handle, host, engine } = mountBoard(1);
    // The calendar's park_doorway entity re-places the buttons each tick.
    const tick = () => engine.entities.get('park_doorway').update(1 / 60);
    tick();
    for (const b of doorButtons(host)) expect(b.style.top).toBe('138px');
    handle.setBoardHeight(240); tick();
    for (const b of doorButtons(host)) expect(b.style.top).toBe('158px');
    handle.setBoardHeight(); tick();
    for (const b of doorButtons(host)) expect(b.style.top).toBe('138px');
  });
});

describe('the park scene sizes the board to its level', () => {
  function level(height) {
    return { id: 'L' + height, index: 0, width: 960, height, exit: { x: 43, y: 146 }, spawn: { x: 90, y: 146 },
      goal: { x: 900, y: 40 }, key: { x: 600, y: 146 }, platforms: [{ x: 0, y: 170, w: 960, h: 50 }],
      gates: [], switches: [], weightedLifts: [], boxes: [], hazards: [], lift: null, hint: '' };
  }
  function scene(height) {
    const setBoardHeight = vi.fn();
    const engine = { groundY: 170, sceneEntities: null };
    const player = { x: 90, y: 146, vx: 0, vy: 0, update() {}, render() {} };
    const board = { engine, input: {}, setBoardHeight, viewportW: () => 800,
      api: { _camera: {}, _updateCamera() {}, _translateForCamera() {}, _restoreFromCamera() {} },
      createPlayer: () => player, createPeer: () => ({}) };
    const replica = { state: { epoch: 1, level: level(height), poses: {}, members: ['me'], online: ['me'], running: false,
        progress: { arrived: [], holds: {}, gates: [], lifts: {}, boxes: {}, keyHolder: null, doorOpen: false, complete: false } },
      remoteMotion: { sample: () => null }, motion() {}, queue: () => ({ status: 'queued' }), clock: () => 0, now: () => 0, outbox: [] };
    const game = mountBoardScene({ board, replica, member: 'me', onExit() {}, status: { textContent: '' }, connected: () => false });
    return { game, setBoardHeight, engine, player };
  }

  it('a level taller than the strip grows the board; exit restores it', () => {
    const { game, setBoardHeight, engine } = scene(240);
    engine.sceneEntities.get('step').update(1 / 60);
    expect(setBoardHeight).toHaveBeenLastCalledWith(240);
    game.dispose();
    expect(setBoardHeight).toHaveBeenLastCalledWith();
  });

  it('a level no taller than the strip keeps 220', () => {
    const { setBoardHeight, engine } = scene(200);
    engine.sceneEntities.get('step').update(1 / 60);
    expect(setBoardHeight).toHaveBeenLastCalledWith(BASE_BOARD_H);
  });

  it('before the level arrives, the spawn and the calendar floor come from groundY', () => {
    const setBoardHeight = vi.fn();
    const engine = { groundY: 190, sceneEntities: null };
    let options = null;
    const board = { engine, input: {}, setBoardHeight, viewportW: () => 800,
      api: { _camera: {}, _updateCamera() {}, _translateForCamera() {}, _restoreFromCamera() {} },
      createPlayer: o => (options = o, { ...o, update() {}, render() {} }), createPeer: () => ({}) };
    const replica = { state: null, remoteMotion: { sample: () => null }, motion() {}, queue: () => ({}), clock: () => 0, now: () => 0, outbox: [] };
    const game = mountBoardScene({ board, replica, member: 'me', onExit() {}, status: { textContent: '' }, connected: () => false });
    expect(options.y).toBe(166);
    engine.sceneEntities.get('step').update(1 / 60);
    expect(game.getWorld().terrain[0].y).toBe(190);
    expect(setBoardHeight).not.toHaveBeenCalled();
  });
});
