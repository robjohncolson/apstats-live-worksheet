// Teacher 2026-10-07: "the level is anchored to the left; stretch it across the bottom of the
// screen (or centre it)". The campaign scales its 720 x 750 world to the page width, capped by
// the window height, never below the old min(1, width / 720), and centres what is left over.
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

test('a wide page: the level is scaled up to fit the window height and centred', (t) => {
  const { panel, ctx, heights, container } = mount({ width: 1366, innerHeight: 900 });
  t.after(() => panel.dispose());
  assert.equal(container.hasAttribute('data-park-active'), true);
  const { scale, offsetX } = panel.getView().presentation;
  assert.equal(scale, 1.2);                       // min(1366 / 720, max(1, 900 / 750))
  assert.equal(offsetX, (1366 - 720 * 1.2) / 2);  // centred
  const calls = ctx.calls.map(([name, ...args]) => [name, args]);
  const at = calls.findIndex(([name, args]) => name === 'setTransform' && args[0] === 1 && args[3] === 1);
  assert.ok(at >= 0, 'device transform set');
  assert.deepEqual(calls[at + 1], ['translate', [offsetX, 0]]);
  assert.deepEqual(calls[at + 2], ['scale', [1.2, 1.2]]);
  assert.equal(heights.at(-1), 900);              // board height = 750 * scale
});

test('a narrow page keeps the old fit (min(1, width / 720)) with no offset', (t) => {
  const { panel, heights } = mount({ width: 600, innerHeight: 900 });
  t.after(() => panel.dispose());
  const { scale, offsetX } = panel.getView().presentation;
  assert.equal(scale, 600 / 720);
  assert.equal(offsetX, 0);
  assert.equal(heights.at(-1), Math.round(750 * 600 / 720));
});

test('a short window never shrinks the level below the old scale; it is centred instead', (t) => {
  const { panel } = mount({ width: 1366, innerHeight: 600 });
  t.after(() => panel.dispose());
  const { scale, offsetX } = panel.getView().presentation;
  assert.equal(scale, 1);
  assert.equal(offsetX, (1366 - 720) / 2);
});

test('high-DPI: the level is drawn in CSS pixels (device transform includes the pixel ratio)', (t) => {
  const { panel, ctx } = mount({ width: 1366, innerHeight: 900, dpr: 2 });
  t.after(() => panel.dispose());
  const set = ctx.calls.find(([name, a]) => name === 'setTransform' && a === 2);
  assert.ok(set, 'setTransform(dpr, 0, 0, dpr, 0, 0) applied: ' + JSON.stringify(ctx.calls.slice(0, 6)));
});
