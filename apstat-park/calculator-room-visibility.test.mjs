// Teacher report 2026-10-06: "when students are in the main APStat Park screen and I go over to the
// calculator, they disappear ... the calculator started without me pushing the block".
// Mounts the real calculator room in jsdom (the native calculator scripts attach to `window`)
// with a fake board and socket, then drives it with calculator_lobby_state / calculator_state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;   // the native calculator scripts register on window
// No canvas in jsdom: a context whose every method is a no-op.
const noop = () => {};
const fakeContext = (canvas) => new Proxy({ canvas }, {
  get: (target, key) => (key in target ? target[key] : (key === 'measureText' ? () => ({ width: 6 }) : noop)),
  set: (target, key, value) => { target[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
const { mountParkPanel } = await import('./calculator-room.mjs');
const { CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs');

function mountRoom(role, username) {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const canvas = win.document.createElement('canvas');
  container.appendChild(canvas);
  const listeners = [];
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(d) { this.sent.push(JSON.parse(d)); },
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); }, removeEventListener() {} };
  const drawn = [];
  const sprite = (extra) => Object.assign({ x: 0, y: 0, vx: 0, vy: 0, hue: 0, update: noop, render() { drawn.push(this.name || 'player'); } }, extra);
  const engine = { canvas, groundY: 700, entities: new Map(), sceneEntities: null };
  const board = { engine, input: { left: false, right: false, jump: false, up: false, run: false },
    presses: { left: 0, right: 0, jump: 0, up: 0 }, username, role, api: { _camera: {} },
    viewportW: () => 1366, setBoardHeight: noop, atlas: () => null,
    createPlayer: (o) => sprite(o), createPeer: (name, pose) => sprite({ name, ...pose }) };
  const panel = mountParkPanel({ container, getSocket: () => socket, board, onClose: noop });
  const deliver = (packet) => listeners.forEach((fn) => fn({ data: JSON.stringify(packet) }));
  const draw = () => {
    drawn.length = 0;
    engine.sceneEntities.get('calculator-room').render(fakeContext(canvas));
    return drawn.slice();
  };
  return { panel, deliver, draw, container, socket, board };
}

const lobby = (phase, roster = []) => ({ type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1',
  missionId: null, eligibleCount: 3, phase, blockX: 400, pushers: [], roster,
  members: [{ name: 'beta_fox', pose: { x: 200, y: 676 } }, { name: 'gamma_owl', pose: { x: 300, y: 676 } }] });

test('a teacher at the keypad while students gather does not join a round (no participating view)', (t) => {
  const { panel, deliver, draw, container } = mountRoom('teacher', 'teach');
  t.after(() => panel.dispose());
  panel.startMission();   // the teacher walks to x 785, past the calculator zone edge
  deliver(lobby('gathering'));
  assert.equal(panel.getView().playerX >= 740, true);
  assert.equal(panel.getView().participating, false);
  assert.equal(container.hasAttribute('data-calculator-participating'), false);
  // … and the classmates in the room are still drawn.
  const drawn = draw();
  assert.ok(drawn.includes('beta_fox') && drawn.includes('gamma_owl'), 'classmates drawn: ' + drawn.join(','));
});

// Teacher decision 2026-10-06: the teacher plays as a full peer — no spectate branch, no push ban,
// one campaign-key rule for everyone.
test('a teacher off the roster does not join an active round; on the roster they participate', (t) => {
  const { panel, deliver } = mountRoom('teacher', 'teach');
  t.after(() => panel.dispose());
  panel.startMission();
  deliver(lobby('active', ['beta_fox']));
  assert.equal(panel.getView().participating, false, 'no teacher-only spectate branch');
  deliver({ ...lobby('active', ['beta_fox', 'teach']), epoch: 'e1' });
  assert.equal(panel.getView().participating, true, 'the teacher on the roster participates like a student');
});

test('a teacher pushing right sends pushing: true, exactly like a student', async (t) => {
  for (const [role, username] of [['teacher', 'teach'], ['student', 'alpha']]) {
    const { panel, deliver, socket, board } = mountRoom(role, username);
    t.after(() => panel.dispose());
    deliver(lobby('gathering'));
    board.input.right = true;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const pushes = socket.sent.filter((m) => m.type === 'calculator_lobby' && m.pushing === true);
    assert.ok(pushes.length > 0, role + ' sent a push: ' + JSON.stringify(socket.sent.map((m) => [m.type, m.pushing])));
    board.input.right = false;
  }
});

test('campaignUnlocked has one rule: only your own key counts, for teacher and student alike', (t) => {
  for (const [role, username] of [['teacher', 'teach'], ['student', 'alpha']]) {
    const { panel, deliver } = mountRoom(role, username);
    t.after(() => panel.dispose());
    deliver({ ...lobby('gathering'), campaignKeyHolders: ['beta_fox'] });
    assert.equal(panel.getView().campaignUnlocked, false, role + ': someone else holding a key does not unlock');
    deliver({ ...lobby('gathering'), campaignKeyHolders: ['beta_fox', username] });
    assert.equal(panel.getView().campaignUnlocked, true, role + ': your own key unlocks');
  }
});

test('the calculator room has no role branches left (no teacher-only draw, push or unlock path)', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./calculator-room.mjs', import.meta.url), 'utf8');
  assert.equal(/board\.role|role\s*[!=]==?\s*'teacher'/.test(source), false);
});

test('while participating, classmates outside the team stay visible; team members are not drawn twice', (t) => {
  const { panel, deliver, draw } = mountRoom('student', 'alpha');
  t.after(() => panel.dispose());
  panel.startMission();
  deliver(lobby('active', ['alpha', 'beta_fox']));
  assert.equal(panel.getView().participating, true);
  // The round state names the team: alpha and beta_fox (gamma_owl stayed in the room).
  deliver({ type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1', revision: 0, missionId: panel.getView().missionId,
    step: 0, keys: [], startedAt: 0, clock: 0, readyCount: 0, teamSize: 2, timeoutCount: 0, boxAttempts: 0,
    members: [{ name: 'alpha', pose: { x: 65, y: 676 }, step: 0 }, { name: 'beta_fox', pose: { x: 90, y: 676 }, step: 0 }] });
  const drawn = draw();
  assert.ok(drawn.includes('gamma_owl'), 'room classmate drawn: ' + drawn.join(','));
  assert.equal(drawn.filter((name) => name === 'beta_fox').length, 1, 'team member drawn once: ' + drawn.join(','));
});
