// classroom-board-park-camera.test.js — integration regression guard pinning the real
// ClassroomBoard camera API consumed by apstat-park/calculator-room.mjs, board-scene.mjs,
// and pico-scene.mjs. Unit tests inside apstat-park/ pass mock `{ _camera: {} }` stubs, so
// stripping _camera from classroom-board.js broke the calculator room and caused
// calculator_approach to retry enterPark(-1) every tick (wiping playerInput).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CB_SRC = readFileSync(resolve(ROOT, 'classroom-board.js'), 'utf8');

function loadRealClassroomBoard() {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: 'https://desk.test/ap_stats_roadmap_square_mode.html',
    runScripts: 'outside-only',
  });
  dom.window.eval(CB_SRC);
  return { dom, api: dom.window.ClassroomBoard };
}

describe('ClassroomBoard camera contract for APStat Park & Calculator room', () => {
  it('exposes the full camera API expected by calculator-room.mjs, board-scene.mjs, and pico-scene.mjs', () => {
    const { dom, api } = loadRealClassroomBoard();
    try {
      expect(api._camera).toBeTypeOf('object');
      expect(api._camera).not.toBeNull();
      expect(api._updateCamera).toBeTypeOf('function');
      expect(api._translateForCamera).toBeTypeOf('function');
      expect(api._restoreFromCamera).toBeTypeOf('function');
      expect(api._projectWorldX).toBeTypeOf('function');
      expect(api._resetCamera).toBeTypeOf('function');
      expect(api._CameraController).toBeTypeOf('function');
    } finally {
      dom.window.close();
    }
  });

  it('mounts the real apstat-park/calculator-room.mjs against the real ClassroomBoard API without throwing', async () => {
    const { dom, api } = loadRealClassroomBoard();
    try {
      const noop = () => {};
      const fakeCtx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 6 }) : noop),
        set: (t, k, v) => { t[k] = v; return true; },
      });
      dom.window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
      const { mountParkPanel } = await import('../apstat-park/calculator-room.mjs');
      if (typeof window !== 'undefined' && window.TI84Native) dom.window.TI84Native = window.TI84Native;
      const host = dom.window.document.getElementById('host');
      const canvas = dom.window.document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 240;
      host.appendChild(canvas);
      const engine = {
        canvas,
        groundY: 200,
        entities: new Map(),
        sceneEntities: null,
        start() {},
        stop() {},
      };
      const player = { x: 40, y: 180, vx: 0, vy: 0, _spriteSize: 24, update() {}, render() {}, setPhysicsProfile() {} };
      const panel = mountParkPanel({
        container: host,
        getSocket: () => null,
        levelIndex: -1,
        mode: 'solo',
        onPark: () => {},
        onClose: () => {},
        board: {
          engine,
          input: { left: false, right: false, jump: false, up: false, run: false },
          presses: { left: 0, right: 0, jump: 0, up: 0 },
          username: 'alice',
          role: 'student',
          api,
          section: 'PeriodB',
          classroom: { isLive: () => false, soundAllowed: () => true },
          viewportW: () => 720,
          setBoardHeight: () => {},
          atlas: () => null,
          createPlayer: (opts) => Object.assign({}, player, opts),
          createPeer: () => ({ x: 0, y: 0, update() {}, render() {} }),
        },
      });
      expect(panel).toBeTruthy();
      expect(panel.kind).toBe('calculator');
      expect(api._camera.enabled).toBe(false);
      panel.dispose();
    } finally {
      dom.window.close();
    }
  });
});
