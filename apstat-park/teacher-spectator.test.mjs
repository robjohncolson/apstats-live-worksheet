// The teacher spectator sees solo calculator rounds (APSTAT_PARK_SOLO_DOOR_SPEC §9). A fake socket
// feeds park_watch_state packets shaped like the relay's (service.mjs puts calculator.watch(section)
// in `calculator`); each test draws one frame and reads the captions back from the pixel font.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const noop = () => {};
// Every canvas remembers the rects painted on it (pixel-text.mjs paints each caption into a
// cached canvas, then drawImage()s it); the main context collects those captions.
let painted = [];
const fakeContext = (canvas) => new Proxy({ canvas }, {
  get: (target, key) => (key in target ? target[key]
    : key === 'measureText' ? () => ({ width: 6 })
      : key === 'fillRect' ? (x, y, w, h) => { (canvas.__rects ||= []).push([x, y, w, h]); }
        : key === 'drawImage' ? (image) => { if (image?.__rects) painted.push(image); }
          : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
// The spectator draws from requestAnimationFrame; the tests run one frame at a time instead.
let nextFrame = null;
win.requestAnimationFrame = (fn) => { nextFrame = fn; return 1; };
win.cancelAnimationFrame = () => { nextFrame = null; };
// One fake relay connection per mount; the test delivers packets through onmessage.
const sockets = [];
win.WebSocket = class {
  constructor() { this.readyState = 1; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
};

const { mountTeacherSpectator } = await import('./teacher-spectator.mjs');
const { pixelText } = await import('./pixel-text.mjs');
const { levelById } = await import('./calculator-curriculum.mjs');
const { createMission } = await import('./calculator-mission.mjs');

// Every key the spectator replays into a native calculator, one list per calculator instance.
const created = [];
const realCreate = win.TI84Native.create;
win.TI84Native.create = (...args) => {
  const calculator = realCreate(...args), pressed = [], press = calculator.pressKey.bind(calculator);
  calculator.pressKey = (key) => { pressed.push(key); return press(key); };
  created.push(pressed);
  return calculator;
};

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

const ONE_VAR = levelById('one-var-stats');
const NORMAL = levelById('normalcdf');
// pixel-text prints titles upper-case with '·' as '.'.
const caps = (value) => value.toUpperCase().replace(/·/g, '.');

function mount() {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const spectator = mountTeacherSpectator(container, { wsUrl: 'wss://relay.test', username: 'mr_colson', section: 'B' });
  const socket = sockets.at(-1);
  socket.onopen();
  const deliver = (calculator) => socket.onmessage({ data: JSON.stringify({ type: 'park_watch_state', section: 'PeriodB',
    gameLabel: null, students: [{ username: 'alice', hue: 90, pos: null }, { username: 'bob', hue: 200, pos: null }],
    campaign: { teams: [], state: null }, calculator }) });
  // One frame; returns its decoded captions.
  const frame = () => { painted = []; nextFrame(performance.now()); return painted.map(decodeCaption); };
  const [, scenes, focus] = container.querySelectorAll('select');
  return { spectator, deliver, frame, focus, scenes };
}

// A round's state as the relay keeps it: createMission, then the keys pressed so far.
function mission(level, keys, extra = {}) {
  return { ...createMission(1000, level), keys, step: keys.length, ...extra };
}
const soloRound = (name, epoch, level, state, failure = null) => ({ name, epoch, level, failure, state });
// The relay's solo-only shape (calculator-service watch() when no team room is live).
const soloOnly = (solo) => ({ epoch: null, clock: 2000, level: null, lobby: null, failure: null, members: [], solo });

test('a solo-only packet draws the solo title, one row per round (newest first) and the focus options', (t) => {
  const view = mount();
  t.after(() => view.spectator.destroy());
  view.deliver(soloOnly([soloRound('alice', 'a1', ONE_VAR, mission(ONE_VAR, ONE_VAR.route.slice(0, 2)))]));
  view.frame();
  view.deliver(soloOnly([
    soloRound('alice', 'a1', ONE_VAR, mission(ONE_VAR, ONE_VAR.route.slice(0, 2))),
    soloRound('bob', 'b1', NORMAL, mission(NORMAL, NORMAL.route, { complete: true, solved: true })),
    soloRound('cara', 'c1', ONE_VAR, mission(ONE_VAR, []), { name: 'cara', at: 1500, until: 4000 }),
  ]));
  const captions = view.frame();
  assert.ok(captions.includes('CALCULATOR . SOLO'), captions.join(' | '));
  assert.ok(!captions.some(caption => /NO ACTIVE CALCULATOR TEAM/.test(caption)), 'solo practice is an active scene');
  const rows = captions.filter(caption => /^(ALICE|BOB|CARA) \. .+ \. (COMPLETE|FAILED|\d+\/\d+)$/.test(caption));
  assert.deepEqual(rows, [
    'CARA . ' + caps(ONE_VAR.title) + ' . FAILED',
    'BOB . ' + caps(NORMAL.title) + ' . COMPLETE',
    'ALICE . ' + caps(ONE_VAR.title) + ' . 2/' + ONE_VAR.route.length,
  ], 'newest first: alice was seen a packet earlier; within one packet the later entry is newer');
  assert.deepEqual([...view.focus.options].map(option => option.value), ['cara', 'bob', 'alice']);
});

test('auto shows a solo-only packet as the calculator scene, not the classroom', (t) => {
  const view = mount();
  t.after(() => view.spectator.destroy());
  assert.equal(view.scenes.value, 'auto');
  view.deliver(soloOnly([soloRound('alice', 'a1', ONE_VAR, mission(ONE_VAR, []))]));
  const captions = view.frame();
  assert.ok(captions.includes('CALCULATOR . SOLO'), captions.join(' | '));
  assert.ok(!captions.includes('CLASSROOM'));
});

test('a team round in progress is unchanged, plus a + N SOLO footer', (t) => {
  const view = mount();
  t.after(() => view.spectator.destroy());
  const team = { epoch: 'team-1', clock: 2000, level: ONE_VAR, lobby: { blockX: 400, members: [] }, failure: null,
    members: [{ name: 'dan', pose: { x: 200, y: 676 }, state: mission(ONE_VAR, ONE_VAR.route.slice(0, 1)) }],
    solo: [soloRound('alice', 'a1', ONE_VAR, mission(ONE_VAR, [])), soloRound('bob', 'b1', NORMAL, mission(NORMAL, []))] };
  view.deliver(team);
  const captions = view.frame();
  assert.ok(captions.includes(caps(ONE_VAR.title)), 'the team title is the level');
  assert.ok(captions.includes('+ 2 SOLO'), captions.join(' | '));
  assert.ok(!captions.includes('CALCULATOR . SOLO'));
  assert.deepEqual([...view.focus.options].map(option => option.value), ['dan'], 'focus lists the team, as before');
  view.deliver({ ...team, solo: [] });
  assert.ok(!view.frame().some(caption => / SOLO$/.test(caption)), 'no footer without solo rounds');
});

test('switching focus replays that solo student\'s keys into a fresh calculator', (t) => {
  const view = mount();
  t.after(() => view.spectator.destroy());
  const aliceKeys = ONE_VAR.route.slice(0, 3), bobKeys = NORMAL.route.slice(0, 2);
  const packet = (keys) => soloOnly([
    soloRound('alice', 'a1', ONE_VAR, mission(ONE_VAR, keys)),
    soloRound('bob', 'b1', NORMAL, mission(NORMAL, bobKeys)),
  ]);
  view.deliver(packet(aliceKeys));
  view.frame();
  // Both seen in the same packet: the later entry counts as newer, so bob leads and is followed first.
  assert.equal(view.focus.value, 'bob');
  assert.deepEqual(created.at(-1), bobKeys);
  view.focus.value = 'alice';
  const before = created.length;
  const captions = view.frame();
  assert.equal(created.length, before + 1, 'a new calculator for alice\'s round');
  assert.deepEqual(created.at(-1), aliceKeys);
  assert.ok(captions.some(caption => /^ALICE \. \d+S$/.test(caption)), captions.join(' | '));
  // Her next key is pressed on the same calculator, not replayed from scratch.
  view.deliver(packet(ONE_VAR.route.slice(0, 4)));
  view.frame();
  assert.equal(created.length, before + 1);
  assert.deepEqual(created.at(-1), ONE_VAR.route.slice(0, 4));
});
