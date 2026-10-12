// Fluency in the room client (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC): fading hint rungs (§1), a
// varied round's own data (§2), the navigator round (§3) and the wrong-key display (§5).
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
const { mountParkPanel, epochHash, navigatorPlan, navigatorSteps } = await import('./calculator-room.mjs');
const { CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs');
const { levelById } = await import('./calculator-curriculum.mjs');
const { goalFor } = await import('./calculator-goals.mjs');
const { varyProblem, solveProblem } = await import('./calculator-variation.mjs');

const LEVEL = levelById('one-var-stats');
const ROSTER = ['beta_fox', 'alpha'];
// Epochs on either side of the navigator rule (hash % 3).
const epochWhere = (navigator) => {
  for (let i = 0; ; i++) if ((epochHash('round-' + i) % 3 === 0) === navigator) return 'round-' + i;
};
const PLAIN = epochWhere(false), NAVIGATOR = epochWhere(true);

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
  // Draws a frame against the fake canvas: the draw path must not throw with the new fields.
  const draw = () => engine.sceneEntities.get('calculator-room').render(fakeContext(canvas));
  return { panel, deliver, status, draw, container };
}

const lobby = (epoch, roster = ROSTER) => ({ type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch,
  missionId: LEVEL.id, eligibleCount: 3, phase: 'active', blockX: 1060, pushers: [], roster,
  members: [], campaignKeys: {}, campaignOpen: [0] });
const state = (epoch, extra = {}, roster = ROSTER) => ({ type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch,
  missionId: LEVEL.id, revision: 1, step: 0, keys: [], startedAt: 0, clock: 0, readyCount: 0, teamSize: roster.length,
  timeoutCount: 0, boxAttempts: 0, boxValues: [], lastPlot: null, solved: false, complete: false, failure: null,
  hintKeys: [], lastPress: null, clears: 0, rung: 0, problem: null,
  members: roster.map(name => ({ name, pose: { x: 65, y: 676 }, step: 0 })), ...extra });

function join(username, epoch, roster = ROSTER) {
  const room = mountRoom(username);
  room.panel.startMission();
  room.deliver(lobby(epoch, roster));
  return room;
}

test('the navigator hash is FNV-1a 32-bit over the epoch string', () => {
  assert.equal(epochHash(''), 2166136261);
  assert.equal(epochHash('a'), 0xe40c292c);
  assert.equal(epochHash('round-1'), epochHash('round-1'));
});

test('rungs 0/1/2 show the full hint, the goal, then no hint line; the tag and screen reader follow', (t) => {
  const { panel, deliver, status, draw } = join('alpha', PLAIN);
  t.after(() => panel.dispose());
  deliver(state(PLAIN, { rung: 0 }));
  assert.equal(panel.getView().hint, LEVEL.hints[0]);
  assert.equal(panel.getView().hintTag, 'HINTS: FULL');
  assert.match(status(), /^Hints: full\./);
  draw();
  deliver(state(PLAIN, { revision: 2, rung: 1, clears: 1 }));
  assert.equal(panel.getView().hint, goalFor(LEVEL.id, 0));
  assert.equal(panel.getView().hintTag, 'HINTS: GOALS');
  assert.match(status(), /^Hints: goals only\. .*Open STAT > CALC/);
  deliver(state(PLAIN, { revision: 3, rung: 1, clears: 1 }));
  assert.doesNotMatch(status(), /Hints:/, 'spoken once, when it changes');
  deliver(state(PLAIN, { revision: 4, rung: 2, clears: 2 }));
  assert.equal(panel.getView().hint, '');
  assert.equal(panel.getView().hintTag, 'NO HINTS');
  assert.match(status(), /^No hints/);
  draw();
});

test('an older relay without rung shows the full hint', (t) => {
  const { panel, deliver } = join('alpha', PLAIN);
  t.after(() => panel.dispose());
  const packet = state(PLAIN); delete packet.rung; delete packet.clears;
  deliver(packet);
  assert.equal(panel.getView().rung, 0);
  assert.equal(panel.getView().hint, LEVEL.hints[0]);
});

test('a wrong key drops the step one rung, shows its cost, and the rung returns on the next step', (t) => {
  const { panel, deliver, status, draw } = join('alpha', PLAIN);
  t.after(() => panel.dispose());
  deliver(state(PLAIN, { rung: 2, step: 1, keys: ['STAT'] }));
  assert.equal(panel.getView().hint, '');
  deliver(state(PLAIN, { revision: 2, rung: 2, step: 1, keys: ['STAT', 'ENTER'],
    lastPress: { key: 'ENTER', advanced: false, wrong: true, penaltyMs: 2000 } }));
  assert.equal(panel.getView().rung, 1);
  assert.equal(panel.getView().hint, goalFor(LEVEL.id, 1));
  assert.equal(panel.getView().wrongKey, 'WRONG KEY · -2S · CLEAR BACKS OUT');
  assert.match(status(), /Wrong key: ENTER\. 2 seconds off the clock\. CLEAR backs out\./);
  draw();
  deliver(state(PLAIN, { revision: 3, rung: 2, step: 1, keys: ['STAT', 'ENTER', 'ENTER'],
    lastPress: { key: 'ENTER', advanced: false, wrong: true, penaltyMs: 0 } }));
  assert.equal(panel.getView().rung, 1, 'one rung per step, not one per wrong key');
  assert.equal(panel.getView().wrongKey, 'WRONG KEY · CLEAR BACKS OUT');
  deliver(state(PLAIN, { revision: 4, rung: 2, step: 1, keys: ['STAT', 'ENTER', 'ENTER'], hintKeys: ['RIGHT'],
    lastPress: { key: 'ENTER', advanced: false, wrong: true, penaltyMs: 0 } }));
  assert.equal(panel.getView().hint, LEVEL.hints[1], 'time-up help is always the full hint');
  deliver(state(PLAIN, { revision: 5, rung: 2, step: 2, keys: ['STAT', 'RIGHT'], lastPress: { key: 'RIGHT', advanced: true } }));
  assert.equal(panel.getView().rung, 2);
  assert.equal(panel.getView().hint, '');
  assert.equal(panel.getView().wrongKey, null);
  // A plain non-advancing press keeps the old wording.
  deliver(state(PLAIN, { revision: 6, rung: 2, step: 2, keys: ['STAT', 'RIGHT', 'UP'], lastPress: { key: 'UP', advanced: false } }));
  assert.equal(panel.getView().rung, 2);
  assert.match(status(), /Pressed UP\. The countdown keeps running/);
});

test('a navigator round splits the steps across the sorted roster, deterministically', (t) => {
  const plan = navigatorPlan(NAVIGATOR, ROSTER);
  assert.deepEqual(plan.roster, ['alpha', 'beta_fox'], 'sorted copy');
  assert.deepEqual(ROSTER, ['beta_fox', 'alpha'], 'the relay roster is untouched');
  assert.deepEqual(navigatorPlan(NAVIGATOR, ['alpha', 'beta_fox']), plan, 'order does not matter');
  assert.equal(navigatorPlan(PLAIN, ROSTER), null);
  assert.equal(navigatorPlan(NAVIGATOR, ['alpha']), null, 'solo: never');
  const mine = navigatorSteps(plan, 'alpha', LEVEL.route.length), theirs = navigatorSteps(plan, 'beta_fox', LEVEL.route.length);
  assert.deepEqual(mine, [0, 2, 4, 6]);
  assert.deepEqual(theirs, [1, 3, 5]);

  const alpha = join('alpha', NAVIGATOR), beta = join('beta_fox', NAVIGATOR);
  t.after(() => { alpha.panel.dispose(); beta.panel.dispose(); });
  // Rungs are ignored in a navigator round.
  alpha.deliver(state(NAVIGATOR, { rung: 2, clears: 5 }));
  beta.deliver(state(NAVIGATOR, { rung: 0 }));
  const view = alpha.panel.getView();
  assert.deepEqual(view.navigator.steps, [1, 3, 5, 7]);
  assert.equal(view.hintTag, null);
  assert.equal(view.hint, goalFor(LEVEL.id, 0), 'my step: its goal');
  assert.equal(beta.panel.getView().hint, 'ASK YOUR TEAM');
  assert.deepEqual(beta.panel.getView().navigator.steps, [2, 4, 6]);
  assert.deepEqual(view.navigator.groups.map(group => group.goal),
    [0, 2, 4, 6].map(step => goalFor(LEVEL.id, step)), 'my steps with their goal phrases');
  assert.match(alpha.status(), /^Navigator round: talk\. You are the navigator for steps 1, 3, 5, 7\./);
  alpha.draw(); beta.draw();
  alpha.deliver(state(NAVIGATOR, { revision: 2, step: 1, keys: ['STAT'], rung: 2 }));
  assert.equal(alpha.panel.getView().hint, 'ASK YOUR TEAM');
});

test('a solo round is never a navigator round', (t) => {
  const { panel, deliver } = join('alpha', NAVIGATOR, ['alpha']);
  t.after(() => panel.dispose());
  deliver(state(NAVIGATOR, {}, ['alpha']));
  assert.equal(panel.getView().navigator, null);
  assert.equal(panel.getView().hint, LEVEL.hints[0]);
});

test('a varied round loads its own lists into the calculator and the caption', (t) => {
  const { panel, deliver, draw } = join('alpha', PLAIN);
  t.after(() => panel.dispose());
  assert.deepEqual(panel.getView().calculatorLists.L1, LEVEL.setup.lists.L1, 'the lobby preview is the catalogue');
  const roll = rollProblem;
  const first = roll(7);
  assert.notDeepEqual(first.setup.lists.L1, LEVEL.setup.lists.L1);
  deliver(state(PLAIN, { problem: first }));
  assert.deepEqual(panel.getView().calculatorLists.L1, first.setup.lists.L1);
  assert.match(panel.getView().caption, new RegExp('L1=\\{' + first.setup.lists.L1.join(',') + '\\}'));
  draw();
  // The next round (new epoch) brings new data: the calculator is re-initialised.
  const second = roll(99);
  deliver(lobby(PLAIN + 'x'));
  deliver(state(PLAIN + 'x', { problem: second }));
  assert.deepEqual(panel.getView().calculatorLists.L1, second.setup.lists.L1);
  // Committed keys replay on the round's data, not the catalogue's.
  deliver(state(PLAIN + 'x', { revision: 2, step: 7, keys: LEVEL.route, problem: second }));
  assert.deepEqual(panel.getView().calculatorLists.L1, second.setup.lists.L1);
  // The native result screen shows the round's own statistics, and the challenge asks for them.
  const result = panel.getView().lines.map(line => line.text).join(' | ');
  for (const name of ['minX', 'Q1', 'Med', 'Q3', 'maxX']) {
    assert.match(result, new RegExp(name + ' = ' + second.computed[name] + '(?![0-9.])'), name + ' on the result screen');
  }
  assert.deepEqual(panel.getView().challenge.answers,
    ['minX', 'Q1', 'Med', 'Q3', 'maxX'].map(name => second.computed[name]));
  draw();
});

// A varied problem for one-var-stats from a seeded generator.
function rollProblem(seed) {
  let s = seed;
  const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const varied = solveProblem(varyProblem(LEVEL, random), win.TI84Native.create);
  return { values: varied.values, setup: varied.setup, computed: varied.computed, finalView: varied.finalView, stem: varied.stem };
}

test('a timeout reset rebuilds the calculator on the round data, not the catalogue', (t) => {
  const { panel, deliver } = join('alpha', PLAIN);
  t.after(() => panel.dispose());
  const problem = rollProblem(11);
  deliver(state(PLAIN, { step: 3, keys: LEVEL.route.slice(0, 3), problem }));
  deliver(state(PLAIN, { revision: 2, step: 0, keys: [], timeoutCount: 1, problem }));
  assert.deepEqual(panel.getView().calculatorLists.L1, problem.setup.lists.L1);
  assert.equal(panel.getView().lines[0]?.text?.includes('EDIT'), false, 'the calculator is back at the start');
});

test('a gathering reset drops the old round data even when the next preview is the same skill', (t) => {
  const { panel, deliver } = join('alpha', PLAIN);
  t.after(() => panel.dispose());
  const problem = rollProblem(5);
  deliver(state(PLAIN, { problem }));
  assert.deepEqual(panel.getView().calculatorLists.L1, problem.setup.lists.L1);
  deliver({ ...lobby(PLAIN + '-next'), phase: 'gathering' });
  assert.equal(panel.getState(), null);
  assert.deepEqual(panel.getView().calculatorLists.L1, LEVEL.setup.lists.L1);
  assert.match(panel.getView().caption, new RegExp('L1=\\{' + LEVEL.setup.lists.L1.join(',') + '\\}'));
});

test('a lobby preview of a different mission loads that mission before the round starts', (t) => {
  const room = mountRoom('alpha');
  t.after(() => room.panel.dispose());
  room.deliver({ ...lobby(PLAIN), phase: 'gathering' });
  assert.deepEqual(room.panel.getView().calculatorLists.L1, LEVEL.setup.lists.L1);
  const other = levelById('histogram');
  room.deliver({ ...lobby(PLAIN), phase: 'gathering', missionId: other.id });
  assert.equal(room.panel.getView().missionId, other.id);
  assert.deepEqual(room.panel.getView().calculatorLists.L1, other.setup.lists.L1);
});

test('a long navigator route: every assigned goal is listed and the window follows the team', (t) => {
  const long = levelById('two-samp-ttest@1');
  const stateFor = (alphaStep, betaStep, extra = {}) => state(NAVIGATOR, { missionId: long.id, step: alphaStep,
    keys: long.route.slice(0, Math.min(alphaStep, long.route.length)),
    members: [{ name: 'beta_fox', pose: { x: 65, y: 676 }, step: betaStep }, { name: 'alpha', pose: { x: 90, y: 676 }, step: alphaStep }],
    ...extra });
  const { panel, deliver, draw, container } = mountRoom('alpha');
  t.after(() => panel.dispose());
  panel.startMission();
  deliver({ ...lobby(NAVIGATOR), missionId: long.id });
  deliver(stateFor(0, 0));
  const view = panel.getView().navigator;
  const mine = navigatorSteps(navigatorPlan(NAVIGATOR, ROSTER), 'alpha', long.route.length);
  assert.deepEqual(view.steps, mine.map(step => step + 1));
  assert.ok(view.steps.includes(37), 'the last step is assigned');
  for (const step of mine) {
    const group = view.groups.find(group => group.steps.includes(step + 1));
    assert.equal(group?.goal, goalFor(long.id, step), 'goal for step ' + (step + 1));
  }
  // Screen readers get the whole list, whatever the drawing shows.
  const items = [...container.querySelectorAll('ul[aria-label="Your navigator steps"] li')].map(li => li.textContent);
  assert.equal(items.length, view.groups.length);
  assert.equal(items[0], 'Steps 1, 3: ' + goalFor(long.id, 0), 'consecutive equal phrases collapse');
  assert.ok(items.some(item => /\b37: /.test(item)), 'step 37 is in the accessible list');
  draw();

  // The teammate is on step 31 (0-based 30, mine): the window starts there, earlier groups hidden.
  deliver(stateFor(0, 30, { revision: 2 }));
  let shown = panel.getView().navigator.window;
  assert.equal(shown.from, 31);
  assert.equal(shown.hiddenBefore, true);
  assert.ok(shown.groups[0].steps.includes(31));
  assert.equal(shown.lines[0].text, '...');
  draw();
  // The teammate on the last step: step 37's goal is reachable.
  deliver(stateFor(0, 36, { revision: 3 }));
  shown = panel.getView().navigator.window;
  assert.ok(shown.groups.some(group => group.steps.includes(37)));
  assert.equal(shown.hiddenAfter, false);

  // I am answering (or solved): the card stays, compact in the status column, until the team is done.
  deliver(stateFor(long.route.length, 20, { revision: 40 }));
  shown = panel.getView().navigator.window;
  assert.ok(shown.groups[0].steps.includes(21));
  assert.deepEqual(shown.lines.map(line => line.y), [254, 282]);
  assert.match(shown.lines[0].text, /^\.\.\. STEPS? [0-9, ]*\b21: /);
  draw();
  deliver(stateFor(long.route.length, 20, { revision: 41, solved: true }));
  assert.ok(panel.getView().navigator.window, 'still shown while a teammate needs it');
  deliver(stateFor(long.route.length, long.route.length, { revision: 42, solved: true, complete: true }));
  assert.equal(panel.getView().navigator.window, null, 'gone once the team completes');
});
