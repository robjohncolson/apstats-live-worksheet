// The client's side of the recognition step (APSTAT_PARK_TRAINER_ABSORB_SPEC §4, protocol 14):
// the word problem and four procedure tiles are drawn from the round packet, a click or number
// key sends calculator_pick, the verdict is shown, and nothing gives the answer away meanwhile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/#room=calc-solo&skill=one-propztest', pretendToBeVisual: true });
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
const { pixelText } = await import('./pixel-text.mjs');
const { skillTitle } = await import('./calculator-recognition.mjs');

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

const LEVEL = levelById('one-propztest');

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
  const drawn = () => {
    const captions = [];
    const ctx = new Proxy(fakeContext(canvas), { get: (target, key) => (key === 'drawImage'
      ? (image) => { if (image.__rects) captions.push(decodeCaption(image)); } : target[key]) });
    engine.sceneEntities.get('calculator-room').render(ctx);
    return captions;
  };
  const sent = type => socket.sent.filter(packet => packet.type === type);
  return { panel, deliver, status, drawn, socket, sent, canvas };
}

const OPTIONS = ['t-test-stats', 'one-propztest', 'one-propzint', 'two-propztest'];
const STEM = 'A company claims that at least 70% of its customers are satisfied. In a random sample of 200 customers, 126 reported satisfaction. Test the claim.';
const recognition = (extra = {}) => ({ skill: null, stem: STEM, options: OPTIONS, picked: null, correct: null, message: null, ...extra });
const lobby = (epoch, name) => ({ type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch, mode: 'solo', pinnedSkill: 'one-propztest', recognition: true,
  missionId: LEVEL.id, eligibleCount: 3, phase: 'active', blockX: 1060, pushers: [], roster: [name], members: [], campaignKeys: {}, campaignOpen: [0] });
const state = (epoch, name, extra = {}) => ({ type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch, mode: 'solo', pinnedSkill: 'one-propztest',
  missionId: LEVEL.id, revision: 1, step: 0, keys: [], startedAt: 0, clock: 0, readyCount: 0, teamSize: 1,
  timeoutCount: 0, boxAttempts: 0, boxValues: [], lastPlot: null, solved: false, complete: false, failure: null,
  hintKeys: [], lastPress: null, clears: 0, rung: 0, problem: null, recognition: recognition(),
  members: [{ name, pose: { x: 65, y: 676 }, step: 0 }], ...extra });

test('while the word problem is open: the stem and four titled tiles are drawn, no keypad, no skill name, no clock', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver(state('e1', 'alice'));
  const view = room.panel.getView();
  assert.deepEqual(view.recognition.options, OPTIONS);
  assert.equal(view.recognition.picked, null);
  assert.equal(view.caption, null, 'the data lists stay hidden');
  const captions = room.drawn();
  assert.ok(captions.includes('WHICH PROCEDURE?'), captions.join(' | '));
  assert.ok(captions.includes('RECOGNITION ROUND'), 'the skill title is not drawn');
  assert.ok(!captions.includes('1-PROPZTEST') || captions.filter(c => c === '1-PROPZTEST').length === 1, 'the title appears only as a tile');
  for (const id of OPTIONS) assert.ok(captions.includes(skillTitle(id).toUpperCase().replace(/[()]/g, m => m)), skillTitle(id) + ' tile: ' + captions.join(' | '));
  assert.ok(captions.some(c => c.startsWith('A COMPANY CLAIMS')), 'the stem is drawn');
  assert.ok(captions.includes('NO TIMER - CHOOSE THE PROCEDURE') || captions.includes('NO TIMER . CHOOSE THE PROCEDURE'), captions.join(' | '));
  assert.ok(!captions.includes('STAT'), 'no keypad');
  // No route step yet, so no hint rung: the HINTS: FULL tag and the hint line wait for the pick.
  assert.ok(!captions.some(c => /^(HINTS: |NO HINTS)/.test(c)), 'no rung tag while recognising: ' + captions.join(' | '));
  assert.equal(view.hintTag, null);
  assert.equal(view.hint, null);
  assert.doesNotMatch(room.status(), /Hints:/);
  assert.match(room.status(), /^Which procedure\? A company claims/);
  assert.match(room.status(), /Choices: 1 T-Test \(Stats input\), 2 1-PropZTest/);
});

test('a number key or a click sends calculator_pick for that tile; keypad presses are not sent', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver(state('e1', 'alice'));
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: '2', bubbles: true }));
  assert.deepEqual(room.sent('calculator_pick').at(-1), { type: 'calculator_pick', epoch: 'e1', revision: 1, skill: 'one-propztest' });
  // A click on the third tile (x 60, y 604 in the calculator zone), placed through the view's camera.
  const rect = room.canvas.getBoundingClientRect(), view = room.panel.getView();
  room.canvas.dispatchEvent(new win.MouseEvent('click', { bubbles: true,
    clientX: rect.left + 60 + 150 + view.entranceX - Math.round(view.cameraX), clientY: rect.top + 604 + 10 }));
  assert.equal(room.sent('calculator_pick').at(-1).skill, 'one-propzint');
  assert.equal(room.sent('calculator_press').length, 0, 'no key press leaves the page while recognising');
});

test('a wrong pick shows its sentence and the route starts; a right pick says so; then the keypad is back', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver(state('e1', 'alice'));
  room.deliver(state('e1', 'alice', { revision: 2, recognition: recognition({ skill: 'one-propztest', picked: 't-test-stats', correct: false, message: 'This asks about a proportion, not a mean.' }) }));
  assert.match(room.status(), /^Not T-Test \(Stats input\)\. This asks about a proportion, not a mean\. The route starts on 1-PropZTest\. /);
  assert.match(room.status(), /Step 1\//);
  let captions = room.drawn();
  assert.ok(captions.some(c => c.startsWith('NOT T-TEST (STATS INPUT): THIS ASKS ABOUT A')), captions.join(' | '));
  assert.ok(captions.includes('PROPORTION, NOT A MEAN.'), 'the sentence wraps onto a second row');
  assert.ok(captions.includes('STAT'), 'the keypad is drawn again');
  assert.ok(captions.includes('HINTS: FULL'), 'the rung tag appears once the route starts: ' + captions.join(' | '));
  assert.equal(room.panel.getView().hintTag, 'HINTS: FULL');
  assert.match(room.status(), /Hints: full\. Step 1\//);
  assert.ok(captions.includes('1-PROPZTEST'), 'the title shows once picked');
  assert.equal(room.panel.getView().recognition.correct, false);
  // A fresh round, right pick.
  room.deliver(lobby('e2', 'alice'));
  room.deliver(state('e2', 'alice', { revision: 2, recognition: recognition({ skill: 'one-propztest', picked: 'one-propztest', correct: true }) }));
  assert.match(room.status(), /^Right: 1-PropZTest\. /);
  captions = room.drawn();
  assert.ok(captions.includes('RIGHT PROCEDURE . NOW THE KEYS'), captions.join(' | '));
  // After the first key the verdict row makes way for the usual press feedback.
  room.deliver(state('e2', 'alice', { revision: 3, step: 1, keys: [LEVEL.route[0]], lastPress: { key: LEVEL.route[0], advanced: true }, recognition: recognition({ skill: 'one-propztest', picked: 'one-propztest', correct: true }) }));
  assert.doesNotMatch(room.status(), /^Right:/);
});

test('a round without the step (older relay or a skill with no problem) is unchanged', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver({ ...lobby('e1', 'alice'), recognition: false });
  room.deliver(state('e1', 'alice', { recognition: null }));
  assert.equal(room.panel.getView().recognition, null);
  assert.match(room.status(), /Step 1\//);
  assert.doesNotMatch(room.status(), /procedure/i);
  assert.ok(room.drawn().includes('STAT'));
  assert.equal(typeof room.panel.setRecognition, 'function');
  room.panel.setRecognition(true);
  assert.deepEqual(room.sent('calculator_recognition').at(-1), { type: 'calculator_recognition', epoch: 'e1', revision: 1, on: true });
});

// ABSORB_2_SPEC §1: a solo wrong pick plays the picked skill once (a branch round), then the
// original problem comes back with that tile gone; neither walks the student back to the door.
const T_STATS = levelById('t-test-stats');
const SENTENCE = 'This asks about a proportion, not a mean.';
const BRANCH = { skillId: 't-test-stats', picked: 't-test-stats', message: SENTENCE, returnTitle: LEVEL.title, depth: 1 };

test('branch round: title, the two caption lines, the status line; the player stays at the calculator', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver(state('e1', 'alice'));
  assert.equal(room.panel.getView().participating, true);
  room.deliver({ ...lobby('e2', 'alice'), missionId: T_STATS.id });
  room.deliver(state('e2', 'alice', { missionId: T_STATS.id, recognition: null, branch: BRANCH,
    resetReason: { type: 'branch', skillId: 't-test-stats' } }));
  const view = room.panel.getView();
  assert.equal(view.participating, true, 'still playing: no walk back to the door');
  assert.equal(view.playerX, view.entranceX + 65, 'placed at the calculator like a time-up restart');
  assert.deepEqual(view.branch, { skillId: 't-test-stats', title: skillTitle('t-test-stats'), depth: 1 });
  assert.equal(view.recognition, null);
  assert.match(room.status(), /^Not T-Test \(Stats input\)\. This asks about a proportion, not a mean\. Run T-Test \(Stats input\) once, then your problem comes back\. /);
  assert.match(room.status(), /Step 1\//);
  const captions = room.drawn();
  assert.ok(captions.includes('BRANCH . T-TEST (STATS INPUT)'), captions.join(' | '));
  assert.ok(captions.includes('NOT T-TEST (STATS INPUT). THIS ASKS ABOUT A PROPORTION, NOT A MEAN.'), captions.join(' | '));
  assert.ok(captions.includes('RUN IT ONCE, THEN BACK TO YOUR PROBLEM.'), captions.join(' | '));
  assert.ok(captions.includes('STAT'), 'the keypad: no recognition step in a branch');
  assert.equal(room.sent('calculator_restart').length, 0);
});

test('branch return: the original problem with the remaining tiles, without the door', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver({ ...lobby('e2', 'alice'), missionId: T_STATS.id });
  room.deliver(state('e2', 'alice', { missionId: T_STATS.id, recognition: null, branch: BRANCH,
    resetReason: { type: 'branch', skillId: 't-test-stats' } }));
  const remaining = OPTIONS.filter(id => id !== 't-test-stats');
  room.deliver(lobby('e3', 'alice'));
  room.deliver(state('e3', 'alice', { recognition: recognition({ options: remaining, branches: 1 }),
    branch: null, resetReason: { type: 'branch-return' } }));
  const view = room.panel.getView();
  assert.equal(view.participating, true);
  assert.equal(view.playerX, view.entranceX + 65);
  assert.equal(view.branch, null);
  assert.deepEqual(view.recognition.options, remaining);
  assert.equal(view.recognition.branches, 1);
  assert.match(room.status(), /^Back to your problem\. Which procedure\? A company claims/);
  assert.match(room.status(), /Choices: 1 1-PropZTest/);
  const captions = room.drawn();
  assert.ok(captions.includes('RECOGNITION ROUND'), captions.join(' | '));
  assert.ok(!captions.some(c => c.startsWith('BRANCH')), 'the branch title is gone');
  assert.ok(!captions.includes(skillTitle('t-test-stats').toUpperCase()), 'the wrong tile is gone');
});
