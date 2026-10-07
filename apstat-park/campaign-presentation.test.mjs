// Teacher 2026-10-07 (second request, supersedes the fit): "no resizing of the game stage from the
// main -- just widen and keep the centre". The campaign keeps its native scale (min(1, width / 720),
// never scaled up); a wider page widens the drawn world, split evenly so the centre never moves.
// Mounts the real campaign panel in jsdom with a recording canvas context.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const { mountCampaign } = await import('./campaign-panel.mjs');

function recordingContext(canvas) {
  const calls = [];
  const target = { canvas, calls };
  return new Proxy(target, {
    get: (t, key) => {
      if (key in t) return t[key];
      if (key === 'measureText') return () => ({ width: 6 });
      return (...args) => { calls.push([key, ...args]); };
    },
    set: (t, key, value) => { t[key] = value; return true; },
  });
}

function mount({ width, innerHeight, dpr = 1 }) {
  Object.defineProperty(win, 'innerHeight', { value: innerHeight, configurable: true });
  Object.defineProperty(win, 'devicePixelRatio', { value: dpr, configurable: true });
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const canvas = win.document.createElement('canvas');
  const heights = [];
  const engine = { canvas, sceneEntities: null };
  const board = { engine, input: {}, username: 'alpha', viewportW: () => width,
    setBoardHeight: (h) => heights.push(h), atlas: () => null, transitionFrame: null,
    createPeer: () => ({ hue: 0 }) };
  const socket = { readyState: 0, addEventListener() {}, removeEventListener() {}, send() {} };
  const panel = mountCampaign({ container, getSocket: () => socket, board, onClose() {} });
  const ctx = recordingContext(canvas);
  engine.sceneEntities.get('campaign').render(ctx);
  return { panel, ctx, heights, container };
}

test('a wide page: native scale, the world widens to the page and stays centred', (t) => {
  const { panel, ctx, heights, container } = mount({ width: 1366, innerHeight: 900 });
  t.after(() => panel.dispose());
  assert.equal(container.hasAttribute('data-park-active'), true);
  const { scale, viewW, pad } = panel.getView().presentation;
  assert.equal(scale, 1);                         // never scaled up for a tall window
  assert.equal(viewW, 1366);                      // the whole page width is world
  assert.equal(pad, (1366 - 720) / 2);            // split evenly: the old column stays centred
  const calls = ctx.calls.map(([name, ...args]) => [name, args]);
  const at = calls.findIndex(([name, args]) => name === 'setTransform' && args[0] === 1 && args[3] === 1);
  assert.ok(at >= 0, 'device transform set');
  assert.deepEqual(calls[at + 1], ['scale', [1, 1]]);
  assert.ok(!calls.some(([name]) => name === 'translate'), 'no offset: the world itself is wider');
  assert.equal(heights.at(-1), 750);              // board height = native 750
  const floor = calls.find(([name, args]) => name === 'fillRect' && args[1] === 700);
  assert.deepEqual(floor, ['fillRect', [0, 700, 1366, 50]]);   // loading floor spans the page
});

test('a narrow page keeps the old fit (min(1, width / 720)) and no extra width', (t) => {
  const { panel, heights } = mount({ width: 600, innerHeight: 900 });
  t.after(() => panel.dispose());
  const { scale, viewW, pad } = panel.getView().presentation;
  assert.equal(scale, 600 / 720);
  assert.equal(viewW, 720);
  assert.equal(pad, 0);
  assert.equal(heights.at(-1), Math.round(750 * 600 / 720));
});

test('a short window changes nothing: scale is never derived from the window height', (t) => {
  const { panel } = mount({ width: 1366, innerHeight: 600 });
  t.after(() => panel.dispose());
  const { scale, viewW } = panel.getView().presentation;
  assert.equal(scale, 1);
  assert.equal(viewW, 1366);
});

test('high-DPI: the level is drawn in CSS pixels (device transform includes the pixel ratio)', (t) => {
  const { panel, ctx } = mount({ width: 1366, innerHeight: 900, dpr: 2 });
  t.after(() => panel.dispose());
  const set = ctx.calls.find(([name, a]) => name === 'setTransform' && a === 2);
  assert.ok(set, 'setTransform(dpr, 0, 0, dpr, 0, 0) applied: ' + JSON.stringify(ctx.calls.slice(0, 6)));
});
