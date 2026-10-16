// The handheld check on the client (APSTAT_PARK_TRAINER_ABSORB_SPEC §7, protocol 16): the shared
// matcher mirrors the relay; the room shows the box after a solo clear while the relay offers it,
// sends calculator_handheld on Enter, and reads the verdict back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/#room=calc-solo&skill=one-var-stats', pretendToBeVisual: true });
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
const { levelById } = await import('./calculator-curriculum.mjs');
const { handheldMatches } = await import('./calculator-handheld.mjs');

const relay = file => new URL('../../curriculum_render/railway-server/apstat-park/' + file, import.meta.url);
const relayPresent = fs.existsSync(relay('calculator-service.mjs'));

test('calculator-handheld.mjs is byte-identical on both sides; the tolerance is the trainer\'s', { skip: !relayPresent }, () => {
  assert.equal(fs.readFileSync(new URL('./calculator-handheld.mjs', import.meta.url), 'utf8'), fs.readFileSync(relay('calculator-handheld.mjs'), 'utf8'));
  assert.equal(handheldMatches('3.61', 3.6055), true);
  assert.equal(handheldMatches('0', 0.17), false);
});

const LEVEL = levelById('one-var-stats');
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
  const box = () => container.querySelector('[data-calculator-handheld]');
  const draw = () => engine.sceneEntities.get('calculator-room').render(fakeContext(canvas));
  return { panel, deliver, status, box, draw, container, socket, sent: type => socket.sent.filter(p => p.type === type) };
}
const lobby = (epoch, name) => ({ type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch, mode: 'solo', pinnedSkill: 'one-var-stats', recognition: true,
  missionId: LEVEL.id, eligibleCount: 3, phase: 'active', blockX: 1060, pushers: [], roster: [name], members: [], campaignKeys: { [name]: 1 }, campaignOpen: [0] });
const done = (epoch, name, extra = {}) => ({ type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch, mode: 'solo', pinnedSkill: 'one-var-stats',
  missionId: LEVEL.id, revision: 9, step: LEVEL.route.length + 5, keys: LEVEL.route, startedAt: 0, clock: 0, readyCount: 1, teamSize: 1,
  timeoutCount: 0, boxAttempts: 0, boxValues: [4, 7, 11, 14, 20], lastPlot: null, solved: true, complete: true, failure: null,
  hintKeys: [], lastPress: null, clears: 1, rung: 0, problem: null, recognition: null, wrongKeys: 0,
  review: { quality: 5, intervalDays: 1, nextReview: '2026-10-17', mastered: false, masteredNow: false },
  handheld: { label: 'Minimum', attempts: 0, status: null },
  members: [{ name, pose: { x: 65, y: 676 }, step: LEVEL.route.length + 5 }], ...extra });

test('after a solo clear the box appears with the label, Enter sends calculator_handheld, the verdict shows', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  assert.equal(room.box().style.display, 'none');
  room.deliver(done('e1', 'alice'));
  assert.equal(room.box().style.display, 'block');
  assert.match(room.box().querySelector('label').textContent, /real TI-84, same data: Minimum = \?/);
  assert.match(room.status(), /Optional: enter the same data on your real TI-84 and type Minimum in the box\./);
  assert.deepEqual(room.panel.getView().handheld, { label: 'Minimum', attempts: 0, status: null });
  const input = room.box().querySelector('input');
  input.value = ' 4.0 ';
  room.box().dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(room.sent('calculator_handheld').at(-1), { type: 'calculator_handheld', epoch: 'e1', revision: 9, value: '4.0' });
  assert.equal(input.value, '');
  room.deliver(done('e1', 'alice', { revision: 10, handheld: { label: 'Minimum', attempts: 1, status: null } }));
  assert.match(room.status(), /Not a match; one more try\./);
  assert.equal(room.box().style.display, 'block');
  room.deliver(done('e1', 'alice', { revision: 11, handheld: { label: 'Minimum', attempts: 2, status: 'passed' },
    review: { quality: 5, intervalDays: 1, nextReview: '2026-10-17', mastered: true, masteredNow: true } }));
  assert.equal(room.box().style.display, 'none');
  assert.match(room.status(), /Mastered! One bonus point banked\./);
  assert.match(room.status(), /Handheld check passed\./);
  room.draw();
});

test('a closed check hides the box and says nothing was recorded; a round without the check shows no box', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver(done('e1', 'alice', { handheld: { label: 'Minimum', attempts: 2, status: 'failed' } }));
  assert.equal(room.box().style.display, 'none');
  assert.match(room.status(), /Handheld check closed after two tries; nothing recorded\./);
  room.deliver(lobby('e2', 'alice'));
  room.deliver(done('e2', 'alice', { handheld: null }));
  assert.equal(room.box().style.display, 'none');
  assert.doesNotMatch(room.status(), /Handheld|real TI-84/);
  assert.equal(room.panel.getView().handheld, null);
  room.panel.dispose();
  assert.equal(room.container.querySelector('[data-calculator-handheld]'), null, 'removed on dispose');
});
