// ABSORB_2_SPEC §2 in the client: while a rung-1+ solo round types its data, the title row says
// ENTER THE DATA, a progress line counts the values in, the status line leads with the count, and
// getView().dataEntry carries the same. After the prefix the round looks as it always did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/#room=calc-solo&skill=one-var-stats', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const noop = () => {};
const fakeContext = (canvas) => new Proxy({ canvas }, {
  get: (target, key) => (key in target ? target[key]
    : key === 'measureText' ? () => ({ width: 6 })
      : key === 'fillRect' ? (x, y, w, h) => { (canvas.__rects ||= []).push([x, y, w, h]); }
        : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
const { mountParkPanel } = await import('./calculator-room.mjs');
const { CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs');
const { levelById } = await import('./calculator-curriculum.mjs');
const { createMission } = await import('./calculator-mission.mjs');
const { withDataEntry } = await import('./calculator-data-entry.mjs');
const { pixelText } = await import('./pixel-text.mjs');

const GLYPHS = new Map();
for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-+=.:,<>/!?'()") {
  const rects = [];
  pixelText({ fillRect: (x, y) => rects.push([x, y + 7]) }, character, 0, 0, 7);
  GLYPHS.set(rects.map(([x, y]) => x + ',' + y).sort().join(' '), character);
}
function decodeCaption(image) {
  const unit = image.height / 7, slots = Math.round((image.width / unit + 1) / 6), cells = Array.from({ length: slots }, () => []);
  for (const [x, y] of image.__rects || []) cells[Math.floor(x / (6 * unit))].push((x / unit) % 6 + ',' + y / unit);
  return cells.map(cell => cell.length ? GLYPHS.get(cell.sort().join(' ')) || '?' : ' ').join('');
}

const CATALOGUE = levelById('one-var-stats');
const LEVEL = withDataEntry(CATALOGUE);
const PROBLEM = createMission(0, LEVEL).problem;
const L1 = CATALOGUE.setup.lists.L1;

function mountRoom() {
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
    presses: { left: 0, right: 0, jump: 0, up: 0 }, username: 'alice', role: 'student', api: { _camera: {} },
    viewportW: () => 1366, setBoardHeight: noop, atlas: () => null,
    createPlayer: (o) => sprite(o), createPeer: (name, pose) => sprite({ name, ...pose }) };
  const panel = mountParkPanel({ container, getSocket: () => socket, board, onClose: noop,
    link: { mode: 'solo', skill: 'one-var-stats', topic: null } });
  const deliver = (packet) => listeners.forEach((fn) => fn({ data: JSON.stringify(packet) }));
  const status = () => container.querySelector('[role="status"]').textContent;
  const drawn = () => {
    const captions = [];
    const ctx = new Proxy(fakeContext(canvas), { get: (target, key) => (key === 'drawImage'
      ? (image) => { if (image.__rects) captions.push(decodeCaption(image)); } : target[key]) });
    engine.sceneEntities.get('calculator-room').render(ctx);
    return captions;
  };
  return { panel, deliver, status, drawn };
}

const lobby = { type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1', mode: 'solo', pinnedSkill: 'one-var-stats',
  recognition: true, missionId: CATALOGUE.id, eligibleCount: 3, phase: 'active', blockX: 1060, pushers: [], roster: ['alice'],
  members: [], campaignKeys: {}, campaignOpen: [0] };
const packet = (step, extra = {}) => ({ type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1', mode: 'solo',
  pinnedSkill: 'one-var-stats', missionId: CATALOGUE.id, revision: step + 1, step, keys: LEVEL.route.slice(0, step),
  startedAt: 0, clock: 0, readyCount: 0, teamSize: 1, timeoutCount: 0, boxAttempts: 0, boxValues: [], lastPlot: null,
  solved: false, complete: false, failure: null, hintKeys: [], lastPress: null, clears: 1, rung: 1, problem: PROBLEM,
  recognition: { skill: 'one-var-stats', stem: 'x', options: ['one-var-stats'], picked: 'one-var-stats', correct: true, message: null },
  members: [{ name: 'alice', pose: { x: 65, y: 676 }, step }], ...extra });
// The step right after the first three values (STAT ENTER, then each value's keys and ENTER).
const afterThree = 2 + L1.slice(0, 3).reduce((sum, value) => sum + String(value).length + 1, 0);

test('while typing: ENTER THE DATA, the progress line, the data caption and the status lead', (t) => {
  const room = mountRoom();
  t.after(() => room.panel.dispose());
  room.deliver(lobby);
  room.deliver(packet(afterThree));
  const captions = room.drawn();
  assert.ok(captions.includes('ENTER THE DATA'), captions.join(' | '));
  assert.ok(captions.includes('L1: 3/' + L1.length), 'the progress line counts the values in: ' + captions.join(' | '));
  assert.ok(captions.some(caption => caption.startsWith('TYPE L1=')), 'the caption shows the data to type');
  assert.match(room.status(), new RegExp('Enter the data\\. L1: 3 of ' + L1.length + '\\. '));
  const view = room.panel.getView();
  assert.deepEqual(view.dataEntry, { active: true, lists: { L1: { entered: 3, total: L1.length } } });
  assert.deepEqual(view.calculatorLists.L1, L1.slice(0, 3), 'the local calculator holds what was typed');
  assert.equal(view.hint, 'Enter the next L1 value.', 'rung 1: the goal for the data steps');
});

test('rung 0 (time-up help) shows the typing hint for the value', (t) => {
  const room = mountRoom();
  t.after(() => room.panel.dispose());
  room.deliver(lobby);
  room.deliver(packet(afterThree, { rung: 0, clears: 0 }));
  assert.equal(room.panel.getView().hint, 'Type ' + L1[3] + ', then ENTER.');
});

test('after the prefix: the usual title, no progress line, the catalogue route and its goals', (t) => {
  const room = mountRoom();
  t.after(() => room.panel.dispose());
  room.deliver(lobby);
  room.deliver(packet(LEVEL.dataSteps));
  const captions = room.drawn();
  assert.ok(!captions.includes('ENTER THE DATA'));
  assert.ok(captions.includes('SOLO PRACTICE'));
  assert.doesNotMatch(room.status(), /Enter the data/);
  const view = room.panel.getView();
  assert.deepEqual(view.dataEntry, { active: false, lists: { L1: { entered: L1.length, total: L1.length } } });
  assert.deepEqual(view.calculatorLists.L1, L1, 'the data is in');
  assert.ok(view.caption.startsWith('L1={' + L1.join(',') + '}'), 'the caption shows the data as before: ' + view.caption);
  assert.equal(view.hint, LEVEL.goals[LEVEL.dataSteps], 'the first catalogue goal, not one shifted by the prefix');
});

test('a round without data entry reports dataEntry null', (t) => {
  const room = mountRoom();
  t.after(() => room.panel.dispose());
  room.deliver(lobby);
  room.deliver(packet(0, { problem: null, keys: [], rung: 0, clears: 0 }));
  assert.equal(room.panel.getView().dataEntry, null);
  assert.ok(!room.drawn().includes('ENTER THE DATA'));
});
