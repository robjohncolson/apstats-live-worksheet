// Teacher 2026-10-07 (PICO_DESK_SPEC.md "Campaign keys as a spendable count"): every cat in the park
// wears its unspent key count as a gold number above its head (hidden at 0, the teacher included),
// and the PICO PARK door is no longer gated on holding a key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const noop = () => {};
// Records the fill colour of every glyph drawn (pixelText sets fillStyle, then draws).
function recordingContext(canvas, drawn) {
  const target = { canvas, fillStyle: '' };
  return new Proxy(target, {
    get: (t, key) => {
      if (key in t) return t[key];
      if (key === 'measureText') return () => ({ width: 6 });
      if (key === 'drawImage' || key === 'fillRect') return () => drawn.push(t.fillStyle);
      return noop;
    },
    set: (t, key, value) => { t[key] = value; return true; },
  });
}
// Off-screen canvases (scenery, glyph cache) get a context whose every method is a no-op.
const quiet = (canvas) => new Proxy({ canvas }, {
  get: (t, key) => (key in t ? t[key] : (key === 'measureText' ? () => ({ width: 6 }) : noop)),
  set: (t, key, value) => { t[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return quiet(this); };
const { mountParkPanel } = await import('./calculator-room.mjs');
const { CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs');

const GOLD = '#C9A227';

function mountRoom(username, role = 'student') {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const canvas = win.document.createElement('canvas');
  container.appendChild(canvas);
  const listeners = [];
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(d) { this.sent.push(JSON.parse(d)); },
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); }, removeEventListener() {} };
  const sprite = (extra) => Object.assign({ x: 0, y: 0, vx: 0, vy: 0, hue: 0, update: noop, render: noop }, extra);
  const engine = { canvas, groundY: 700, entities: new Map(), sceneEntities: null };
  const board = { engine, input: { left: false, right: false, jump: false, up: false, run: false },
    presses: { left: 0, right: 0, jump: 0, up: 0 }, username, role, api: { _camera: {} },
    viewportW: () => 1366, setBoardHeight: noop, atlas: () => null,
    createPlayer: (o) => sprite(o), createPeer: (name, pose) => sprite({ name, ...pose }) };
  const panel = mountParkPanel({ container, getSocket: () => socket, board, onClose: noop });
  const deliver = (packet) => listeners.forEach((fn) => fn({ data: JSON.stringify(packet) }));
  const goldDraws = () => {
    const drawn = [];
    engine.sceneEntities.get('calculator-room').render(recordingContext(canvas, drawn));
    return drawn.filter(colour => colour === GOLD).length;
  };
  return { panel, deliver, goldDraws };
}

const lobby = (extra) => ({ type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1',
  missionId: null, eligibleCount: 3, phase: 'gathering', blockX: 400, pushers: [], roster: [], campaignKeyHolders: [],
  members: [{ name: 'beta_fox', pose: { x: 200, y: 676 } }, { name: 'teach', pose: { x: 300, y: 676 } }], ...extra });

test('head numbers come from campaignKeys: counts for every cat, the teacher too, none at 0', (t) => {
  const { panel, deliver, goldDraws } = mountRoom('alpha');
  t.after(() => panel.dispose());
  deliver(lobby({ campaignKeys: {}, campaignCleared: {}, campaignOpen: [0] }));
  assert.equal(goldDraws(), 0, 'nobody holds a key: no gold numbers');
  deliver(lobby({ campaignKeys: { alpha: 3, teach: 12 }, campaignCleared: {}, campaignOpen: [0] }));
  assert.deepEqual(panel.getView().keyCounts, { alpha: 3, beta_fox: 0, teach: 12 });
  // One gold number each for alpha (3) and teach (12); beta_fox at 0 draws none.
  assert.equal(goldDraws(), 2);
});

test('a relay with counts opens the door to everyone; an older relay keeps the own-key rule', (t) => {
  const { panel, deliver } = mountRoom('alpha', 'teacher');
  t.after(() => panel.dispose());
  deliver(lobby({ campaignKeys: {}, campaignCleared: {}, campaignOpen: [0] }));
  assert.equal(panel.getView().campaignUnlocked, true, 'no key needed: 1-1 is always startable');
  deliver(lobby({ campaignKeyHolders: ['beta_fox'] }));
  assert.equal(panel.getView().campaignUnlocked, false);
  deliver(lobby({ campaignKeyHolders: ['alpha'] }));
  assert.equal(panel.getView().campaignUnlocked, true);
});
