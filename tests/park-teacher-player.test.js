import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { mountBoardScene, BASE_BOARD_H } from '../apstat-park/board-scene.mjs';

const BOARD_SRC = readFileSync(resolve(__dirname, '../classroom-board.js'), 'utf8');

function mountBoard(playable = true, dpr = 2) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', { url: 'https://example.com' });
  const win = dom.window;
  function WS() { this.readyState = 0; this.sent = []; win.__socket = this; }
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
  const handle = win.ClassroomBoard.mount(host, { wsUrl: 'wss://x', section: 'PeriodX', username: 'teacher', role: 'teacher', playable, hue: 90 });
  const canvas = handle.getCanvas();
  return { win, handle, canvas, host, engine: win.__engine };
}

describe('playable teacher desk', () => {
  it('mounts the regular play area and retains the teacher identity on the socket', () => {
    const { win, handle, engine, host } = mountBoard();
    expect(engine.entities.has('calculator_approach')).toBe(true);
    expect(engine.entities.has('park_doorway')).toBe(true);
    expect(host.querySelector('[data-teacher-spectator]')).toBe(null);
    win.__socket.readyState = 1; win.__socket.onopen();
    const join = win.__socket.sent.map(JSON.parse).find(packet => packet.type === 'classroom_join');
    expect(join.role).toBe('teacher'); expect(join.section).toBe('PeriodX');
    handle.destroy();
  });
  it('keeps the separate teacher control page out of gameplay unless explicitly enabled', () => {
    const { engine, handle } = mountBoard(false);
    expect(engine.entities.has('calculator_approach')).toBe(false);
    handle.destroy();
  });
});
