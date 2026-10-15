// The solo room in the client (APSTAT_PARK_TRAINER_ABSORB_SPEC §3, protocol 12): one `mode`
// switch in calculator-room.mjs, the deep link parse, the topic -> skill resolution, and the
// copy that must never mention a team.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/#room=calc-solo&skill=one-var-stats', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const noop = () => {};
// Every canvas remembers the rects painted on it (pixel-text.mjs paints each caption into a
// cached canvas, then drawImage()s it); a recording main context decodes those back into text.
const fakeContext = (canvas) => new Proxy({ canvas }, {
  get: (target, key) => (key in target ? target[key]
    : key === 'measureText' ? () => ({ width: 6 })
      : key === 'fillRect' ? (x, y, w, h) => { (canvas.__rects ||= []).push([x, y, w, h]); }
        : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
// The panel reads performance.now(); tests move it forward with `skew` instead of sleeping.
const realNow = performance.now.bind(performance);
let skew = 0;
performance.now = () => realNow() + skew;
const { mountParkPanel, parseRoomLink, skillForTopic } = await import('./calculator-room.mjs');
const { pixelText } = await import('./pixel-text.mjs');

// Glyph lookup: paint each character once at unit 1 and key its pixel set.
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
const { CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs');
const { levelById, challengeFor } = await import('./calculator-curriculum.mjs');

const LESSON_MAP = JSON.parse(fs.readFileSync(new URL('../data/ti84-lesson-map.json', import.meta.url), 'utf8'));
const LEVEL = levelById('one-var-stats');

function mountRoom(username, options = {}) {
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
  const panel = mountParkPanel({ container, getSocket: () => socket, board, onClose: noop, ...options });
  const deliver = (packet) => listeners.forEach((fn) => fn({ data: JSON.stringify(packet) }));
  const status = () => container.querySelector('[role="status"]').textContent;
  const draw = () => engine.sceneEntities.get('calculator-room').render(fakeContext(canvas));
  // The captions a frame draws, decoded from the pixel font.
  const drawn = () => {
    const captions = [];
    const ctx = new Proxy(fakeContext(canvas), { get: (target, key) => (key === 'drawImage'
      ? (image) => { if (image.__rects) captions.push(decodeCaption(image)); } : target[key]) });
    engine.sceneEntities.get('calculator-room').render(ctx);
    return captions;
  };
  const update = (dt = 1 / 60) => engine.sceneEntities.get('calculator-room').update(dt);
  const joins = () => socket.sent.filter(packet => packet.type === 'calculator_join');
  return { panel, deliver, status, draw, drawn, update, container, socket, joins, canvas };
}

const lobby = (epoch, name) => ({ type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch, mode: 'solo', pinnedSkill: 'one-var-stats',
  missionId: LEVEL.id, eligibleCount: 3, phase: 'active', blockX: 1060, pushers: [], roster: [name],
  members: [], campaignKeys: {}, campaignOpen: [0] });
const state = (epoch, name, extra = {}) => ({ type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch, mode: 'solo', pinnedSkill: 'one-var-stats',
  missionId: LEVEL.id, revision: 1, step: 0, keys: [], startedAt: 0, clock: 0, readyCount: 0, teamSize: 1,
  timeoutCount: 0, boxAttempts: 0, boxValues: [], lastPlot: null, solved: false, complete: false, failure: null,
  hintKeys: [], lastPress: null, clears: 0, rung: 0, problem: null,
  members: [{ name, pose: { x: 65, y: 676 }, step: 0 }], ...extra });

test('the deep link parses to a mode, a skill and a topic; anything else is the team room', () => {
  assert.deepEqual(parseRoomLink('#room=calc-solo&skill=one-var-stats'), { mode: 'solo', skill: 'one-var-stats', topic: null });
  assert.deepEqual(parseRoomLink('room=calc-solo&topic=1.7'), { mode: 'solo', skill: null, topic: '1.7' });
  assert.deepEqual(parseRoomLink('#room=calc-solo'), { mode: 'solo', skill: null, topic: null });
  assert.deepEqual(parseRoomLink(''), { mode: 'team', skill: null, topic: null });
  assert.deepEqual(parseRoomLink('#topic=1.7&source=worksheet'), { mode: 'team', skill: null, topic: null });
  assert.deepEqual(parseRoomLink(undefined), { mode: 'team', skill: null, topic: null });
});

test('a topic resolves to the lesson map\'s first skill; bonus topics resolve too; unknown topics do not', () => {
  assert.equal(skillForTopic(LESSON_MAP, '1.7'), 'one-var-stats');
  assert.equal(skillForTopic(LESSON_MAP, '7.2'), 't-interval-stats');
  assert.equal(skillForTopic(LESSON_MAP, '4.12'), 'geometpdf', 'bonus topics are deep-link reachable (teacher decision 4)');
  assert.equal(skillForTopic(LESSON_MAP, '9.9'), null);
  assert.equal(skillForTopic(null, '1.7'), null);
  for (const [topic, skills] of Object.entries(LESSON_MAP.lessons)) assert.equal(skillForTopic(LESSON_MAP, topic), skills[0], topic);
});

test('a solo link joins at once with mode and skill, on the keypad, without a lobby packet', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  const view = room.panel.getView();
  assert.equal(view.mode, 'solo');
  assert.equal(view.skill, 'one-var-stats');
  assert.equal(view.participating, true, 'the link is the intent to practise');
  assert.ok(view.playerX >= view.entranceX, 'the student starts in the calculator zone');
  assert.equal(room.joins().length, 1);
  assert.deepEqual(room.joins()[0], { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill: 'one-var-stats' });
  assert.equal(room.socket.sent.some(packet => packet.type === 'calculator_lobby'), false, 'solo never pushes the block');
  assert.equal(room.status(), 'Starting your calculator round…');
});

test('a topic link waits for the lesson map, then joins with the resolved skill', async (t) => {
  let resolve;
  const lessonMap = new Promise(r => { resolve = r; });
  const room = mountRoom('alice', { link: { mode: 'solo', skill: null, topic: '1.10' }, lessonMap });
  t.after(() => room.panel.dispose());
  assert.equal(room.joins().length, 0, 'nothing joins before the topic resolves');
  resolve(LESSON_MAP);
  await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  // The next pump sends the join (the test drives it through the panel's own timer cadence).
  await new Promise(r => setTimeout(r, 120));
  assert.equal(room.joins().length, 1);
  assert.equal(room.joins()[0].skill, 'normalcdf');
  assert.equal(room.panel.getView().skill, 'normalcdf');
});

test('an unknown topic still joins, with no skill, so the relay\'s rotation picks', async (t) => {
  const room = mountRoom('alice', { link: { mode: 'solo', skill: null, topic: '9.9' }, lessonMap: LESSON_MAP });
  t.after(() => room.panel.dispose());
  await new Promise(r => setTimeout(r, 120));
  assert.equal(room.joins().length, 1);
  assert.equal(room.joins()[0].skill, null);
});

test('solo copy never mentions a team: status, celebration, and the drawn frame', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver(state('e1', 'alice'));
  assert.match(room.status(), /Step 1\/\d+ · solo\./);
  assert.doesNotMatch(room.status(), /team/i);
  room.draw();
  assert.equal(room.panel.getView().navigator, null, 'a roster of one is never a navigator round');
  room.deliver(state('e1', 'alice', { revision: 2, step: LEVEL.route.length, keys: LEVEL.route, solved: true, complete: true, readyCount: 1, clears: 1, rung: 1 }));
  assert.match(room.status(), /^Cleared! /);
  assert.match(room.status(), /Walk to the door for the next round\./);
  assert.doesNotMatch(room.status(), /key|team/i, 'Phase 1 pays no key and names no team');
  assert.equal(room.panel.getView().keyReward, true, 'the same clear celebration');
  assert.ok(room.panel.getView().resetDoor, 'the next-round door opens');
  room.draw();
});

test('after the door, the next solo round starts where the student stands (no walk back to the block)', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver(state('e1', 'alice', { step: LEVEL.route.length, keys: LEVEL.route, solved: true, complete: true, readyCount: 1 }));
  assert.equal(room.panel.getView().participating, true);
  room.deliver(lobby('e2', 'alice'));
  room.deliver(state('e2', 'alice'));
  const view = room.panel.getView();
  assert.equal(view.participating, true, 'still in the round');
  assert.ok(view.playerX >= view.entranceX, 'the student stays in the calculator zone');
  assert.equal(view.keyReward, false);
  assert.match(room.status(), /Step 1\//);
});

test('leaving the zone leaves the round; walking back in rejoins without a block', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver(lobby('e1', 'alice'));
  room.deliver(state('e1', 'alice'));
  room.panel.returnToStart();
  assert.equal(room.panel.getView().participating, false);
  assert.ok(room.socket.sent.some(packet => packet.type === 'calculator_leave'));
  // Walk into the zone: the update loop re-joins on its own.
  room.panel.startMission();
  room.update();
  assert.equal(room.panel.getView().participating, true);
});

test('the team room is untouched: no hash means team mode and the old join packet', async (t) => {
  const room = mountRoom('alice', { link: { mode: 'team', skill: null, topic: null } });
  t.after(() => room.panel.dispose());
  assert.equal(room.panel.getView().mode, 'team');
  assert.equal(room.panel.getView().participating, false);
  assert.equal(room.status(), 'Connecting the calculator team…');
  room.panel.startMission();
  room.deliver({ ...lobby('e1', 'alice'), mode: 'team', pinnedSkill: null, roster: ['alice', 'bob'] });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(room.joins().length, 1);
  assert.deepEqual(room.joins()[0], { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
  assert.ok(room.socket.sent.some(packet => packet.type === 'calculator_lobby'), 'the team room still pushes the block');
});

// Codex review fixes (2026-10-15): hash navigation on the same document, and the waiting snapshot.

test('linkChanged: team -> solo, solo -> team, skill A -> topic B, same link is no change', (t) => {
  const team = mountRoom('alice', { link: { mode: 'team', skill: null, topic: null } });
  t.after(() => team.panel.dispose());
  assert.equal(team.panel.linkChanged(''), false);
  assert.equal(team.panel.linkChanged('#topic=1.7&source=worksheet'), false, 'a trainer-era hash is still the team room');
  assert.equal(team.panel.linkChanged('#room=calc-solo'), true);
  assert.equal(team.panel.linkChanged('#room=calc-solo&skill=one-var-stats'), true);
  const solo = mountRoom('alice', { link: { mode: 'solo', skill: 'one-var-stats', topic: null } });
  t.after(() => solo.panel.dispose());
  assert.equal(solo.panel.linkChanged('#room=calc-solo&skill=one-var-stats'), false);
  assert.equal(solo.panel.linkChanged(''), true, 'solo -> team');
  assert.equal(solo.panel.linkChanged('#room=calc-solo&skill=normalcdf'), true, 'another skill');
  assert.equal(solo.panel.linkChanged('#room=calc-solo&topic=1.10'), true, 'skill A -> topic B');
  assert.equal(solo.panel.linkChanged('#room=calc-solo'), true, 'pinned -> rotation');
  assert.deepEqual(solo.panel.getView().link, { mode: 'solo', skill: 'one-var-stats', topic: null });
});

test('the board routes hashchange through a room transition: leave the panel, mount the requested room', () => {
  const board = fs.readFileSync(new URL('../classroom-board.js', import.meta.url), 'utf8');
  const wiring = board.slice(board.indexOf('function onRoomHashChange()'), board.indexOf('// --- public handle'));
  assert.ok(wiring.includes("nativePanel.kind !== 'calculator') return;"), 'only a mounted calculator room re-routes');
  assert.ok(wiring.includes('nativePanel.linkChanged(root.location.hash)'), 'the panel decides whether the hash means another room');
  assert.ok(/nativePanel\.dispose\(\);\s*enterPark\(-1\);/.test(wiring), 'dispose the old panel, then mount the room that reads the new hash');
  assert.ok(board.includes("root.addEventListener('hashchange', onRoomHashChange);"));
  assert.ok(board.includes("root.removeEventListener('hashchange', onRoomHashChange);"), 'destroy() unhooks it');
});

test('a waiting snapshot (no playable skill yet) is told plainly and never joins a round', async (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  room.deliver({ type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: null, mode: 'solo', pinnedSkill: 'one-var-stats',
    missionId: null, eligibleCount: 0, phase: 'waiting', blockX: 1060, pushers: [], roster: [], members: [], campaignKeys: {}, campaignOpen: [0] });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(room.panel.getState(), null);
  assert.equal(room.status(), 'No calculator skills are scheduled yet for this class.');
  room.draw();
});

// Codex review R1 (2026-10-15, protocol 13): 'waiting' after a completed round is a terminal reset.

test('a completed round followed by a waiting answer forgets the round and shows the waiting copy, still on the keypad', async (t) => {
  const room = mountRoom('alice', { link: { mode: 'solo', skill: null, topic: null } });
  t.after(() => { room.panel.dispose(); skew = 0; });
  room.deliver({ ...lobby('e1', 'alice'), pinnedSkill: null });
  room.deliver(state('e1', 'alice', { pinnedSkill: null, step: LEVEL.route.length, keys: LEVEL.route, solved: true, complete: true, readyCount: 1 }));
  assert.equal(room.panel.getView().keyReward, true);
  // The door: the rotation emptied, so the relay answers 'waiting' instead of a new round.
  room.deliver({ type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: null, mode: 'solo', pinnedSkill: null,
    missionId: null, eligibleCount: 0, phase: 'waiting', blockX: 1060, pushers: [], roster: [], members: [], campaignKeys: {}, campaignOpen: [0] });
  const view = room.panel.getView();
  assert.equal(room.panel.getState(), null, 'the round is forgotten');
  assert.equal(view.keyReward, false);
  assert.equal(view.resetDoor, null);
  assert.equal(view.participating, true, 'the student stays in the zone so the join retries');
  assert.equal(room.status(), 'No calculator skills are scheduled yet for this class.');
  await new Promise(r => setTimeout(r, 150));
  assert.equal(room.status(), 'No calculator skills are scheduled yet for this class.', 'not replaced by reconnect copy');
  // Codex P2: the waiting answer never refreshes receivedAt; past the 3 s window the frame must
  // still show the no-skills caption and never the reconnect line over it.
  skew = 3500;
  await new Promise(r => setTimeout(r, 150));
  const captions = room.drawn();
  assert.ok(captions.includes('NO SKILLS TAUGHT YET'), captions.join(' | '));
  assert.ok(!captions.some(caption => /CONNECTING/.test(caption)), 'no CONNECTING line: ' + captions.join(' | '));
  assert.equal(room.status(), 'No calculator skills are scheduled yet for this class.');
  assert.ok(room.joins().length >= 2, 'the 1.5 s retry join keeps going');
  skew = 0;
  // A skill arrives: the next round plays normally.
  room.deliver(lobby('e2', 'alice'));
  room.deliver(state('e2', 'alice'));
  assert.equal(room.panel.getState().epoch, 'e2');
  assert.match(room.status(), /Step 1\//);
});

// Codex P2 (2026-10-15): the relay's protocol error is terminal; other errors back the rejoin off.

test('the drawn-caption decoder reads the pixel font back', (t) => {
  const room = mountRoom('alice');
  t.after(() => room.panel.dispose());
  assert.ok(room.drawn().includes('SOLO PRACTICE'), room.drawn().join(' | '));
});

test('a protocol error stops the joins, draws the reload line, keeps the sr-only text; click or Enter reloads', async (t) => {
  const reloads = [];
  const room = mountRoom('alice', { reload: () => reloads.push(1) });
  t.after(() => { room.panel.dispose(); skew = 0; });
  assert.equal(room.joins().length, 1);
  room.deliver({ type: 'calculator_error', message: 'Reload the page to use the team block.' });
  await new Promise(r => setTimeout(r, 300));
  skew = 5000;
  await new Promise(r => setTimeout(r, 300));
  assert.ok(room.joins().length <= 2, 'at most one further join after the error, got ' + room.joins().length);
  assert.equal(room.panel.getView().reloadNeeded, true);
  assert.equal(room.status(), 'Reload the page to use the team block.', 'the screen reader hears the relay message');
  const captions = room.drawn();
  assert.ok(captions.includes('NEW VERSION - RELOAD THE PAGE'), captions.join(' | '));
  assert.ok(!captions.some(caption => /CONNECTING/.test(caption)), 'no reconnect line under the instruction: ' + captions.join(' | '));
  const sentBefore = room.socket.sent.length;
  room.canvas.dispatchEvent(new win.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
  assert.equal(reloads.length, 1, 'a click reloads');
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(reloads.length, 2, 'Enter reloads');
  await new Promise(r => setTimeout(r, 300));
  assert.equal(room.socket.sent.length, sentBefore, 'nothing else goes out');
});

test('any other calculator_error retries the join after the normal 1.5 s, not at once', async (t) => {
  const room = mountRoom('alice');
  t.after(() => { room.panel.dispose(); skew = 0; });
  assert.equal(room.joins().length, 1);
  room.deliver({ type: 'calculator_error', message: 'Rejoin the calculator room.' });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(room.joins().length, 1, 'no immediate rejoin');
  assert.equal(room.panel.getView().reloadNeeded, false);
  skew = 1600;
  await new Promise(r => setTimeout(r, 300));
  assert.equal(room.joins().length, 2, 'one rejoin after the backoff');
  assert.equal(room.status(), 'Rejoin the calculator room.');
});
