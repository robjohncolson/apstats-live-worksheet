// Interpretation rounds in the room client: number keys choose answer tiles, the relay's
// feedback reaches the screen-reader status, and the +1 key celebration waits for the
// relay's authoritative team completion (a personal "solved" is not enough).
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const noop = () => {};
const fakeContext = (canvas) => new Proxy({ canvas }, {
  get: (target, key) => (key in target ? target[key] : (key === 'measureText' ? () => ({ width: 6 }) : noop)),
  set: (target, key, value) => { target[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
const { mountParkPanel } = await import('./calculator-room.mjs');
const { CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs');
const { levelById, challengeFor } = await import('./calculator-curriculum.mjs');
const { tilesFor } = await import('./calculator-mission.mjs');

const LEVEL = levelById('one-var-stats@freq');

function mountRoom(username) {
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
    presses: { left: 0, right: 0, jump: 0, up: 0 }, username, role: 'student', api: { _camera: {} },
    viewportW: () => 1366, setBoardHeight: noop, atlas: () => null,
    createPlayer: (o) => sprite(o), createPeer: (name, pose) => sprite({ name, ...pose }) };
  const panel = mountParkPanel({ container, getSocket: () => socket, board, onClose: noop });
  const deliver = (packet) => listeners.forEach((fn) => fn({ data: JSON.stringify(packet) }));
  const status = () => container.querySelector('[role="status"]').textContent;
  return { panel, deliver, socket, status, container };
}

const lobby = { type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1', missionId: LEVEL.id,
  eligibleCount: 3, phase: 'active', blockX: 1060, pushers: [], roster: ['alpha', 'beta_fox'],
  members: [{ name: 'beta_fox', pose: { x: 800, y: 676 } }], campaignKeys: { alpha: 1 }, campaignOpen: [0] };
const state = (extra) => ({ type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1', missionId: LEVEL.id,
  revision: 20, step: LEVEL.route.length, keys: LEVEL.route, startedAt: 0, clock: 0, readyCount: 0, teamSize: 2,
  timeoutCount: 0, boxAttempts: 0, boxValues: [], lastPlot: null, solved: false, complete: false, failure: null,
  members: [{ name: 'alpha', pose: { x: 65, y: 676 }, step: LEVEL.route.length }, { name: 'beta_fox', pose: { x: 90, y: 676 }, step: 0 }],
  ...extra });

test('a number key chooses the matching answer tile and sends it to the relay', (t) => {
  const { panel, deliver, socket } = mountRoom('alpha');
  t.after(() => panel.dispose());
  panel.startMission();
  deliver(lobby);
  deliver(state());
  const tiles = tilesFor(LEVEL.route.length, LEVEL);
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: '2', bubbles: true }));
  const press = socket.sent.find(message => message.type === 'calculator_press');
  assert.ok(press, 'a press was sent');
  assert.equal(press.key, tiles[1].key);
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: '9', bubbles: true }));
  assert.equal(socket.sent.filter(message => message.type === 'calculator_press').length, 1, 'no tile 9: nothing sent');
});

test('wrong-answer feedback from the relay reaches the status line; picks clear it', (t) => {
  const { panel, deliver, status } = mountRoom('alpha');
  t.after(() => panel.dispose());
  panel.startMission();
  deliver(lobby);
  const feedback = challengeFor(LEVEL).questions[0].options.find(option => option.feedback).feedback;
  deliver(state({ revision: 22, boxAttempts: 1, lastPlot: { values: [3, '2446'], correct: false, at: 0, feedback } }));
  assert.match(status(), new RegExp('Not yet: ' + feedback.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  deliver(state({ revision: 23, step: LEVEL.route.length + 1, boxAttempts: 1, boxValues: [4],
    lastPlot: { values: [3, '2446'], correct: false, at: 0, feedback } }));
  assert.doesNotMatch(status(), /Not yet/);
});

test('the +1 key celebration appears only after the relay completes the whole team', (t) => {
  const { panel, deliver, status } = mountRoom('alpha');
  t.after(() => panel.dispose());
  panel.startMission();
  deliver(lobby);
  const done = { step: LEVEL.route.length + 2, boxValues: [4, '2446'], lastPlot: { values: [4, '2446'], correct: true, at: 0 } };
  deliver(state({ revision: 24, ...done, solved: true, readyCount: 1 }));
  assert.equal(panel.getView().keyReward, false, 'solving alone is not the reward');
  assert.doesNotMatch(status(), /\+1 key/);
  deliver({ ...lobby, campaignKeys: { alpha: 2, beta_fox: 1 } });
  deliver(state({ revision: 25, ...done, solved: true, complete: true, readyCount: 2 }));
  assert.equal(panel.getView().keyReward, true);
  assert.match(status(), /\+1 key for everyone on the team/);
  assert.deepEqual(panel.getView().keyCounts.alpha, 2, 'the gold count is the relay count');
});
