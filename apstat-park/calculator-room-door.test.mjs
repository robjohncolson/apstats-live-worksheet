// The solo door inside the calculator room (APSTAT_PARK_SOLO_DOOR_SPEC §2, §4): the 'auto' room
// mode, resolveRoomMode, and the switch door between the team and solo intros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const noop = () => {};
// Every caption drawn anywhere (the intro is painted once into a cached scenery canvas).
const painted = [];
const fakeContext = (canvas) => new Proxy({ canvas }, {
  get: (target, key) => (key in target ? target[key]
    : key === 'measureText' ? () => ({ width: 6 })
      : key === 'drawImage' ? (image) => { if (image.__rects) painted.push(decodeCaption(image)); }
      : key === 'fillRect' ? (x, y, w, h) => { (canvas.__rects ||= []).push([x, y, w, h]); }
        : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
const { mountParkPanel, parseRoomLink, resolveRoomMode, SWITCH_DOOR } = await import('./calculator-room.mjs');
const { pixelText } = await import('./pixel-text.mjs');
const { WORLD } = await import('./calculator-mission.mjs');

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

function mountRoom(options = {}, { live = false, section = 'PeriodB' } = {}) {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const canvas = win.document.createElement('canvas');
  container.appendChild(canvas);
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(d) { this.sent.push(JSON.parse(d)); },
    addEventListener() {}, removeEventListener() {} };
  const sprite = (extra) => Object.assign({ x: 0, y: 0, vx: 0, vy: 0, hue: 0, update: noop, render: noop }, extra);
  let player = null;
  const engine = { canvas, groundY: 700, entities: new Map(), sceneEntities: null };
  const board = { engine, input: { left: false, right: false, jump: false, up: false, run: false },
    presses: { left: 0, right: 0, jump: 0, up: 0 }, username: 'alice', role: 'student', api: { _camera: {} }, section,
    classroom: { isLive: () => live, soundAllowed: () => true },
    viewportW: () => 1366, setBoardHeight: noop, atlas: () => null,
    createPlayer: (o) => { player = sprite(o); return player; }, createPeer: (name, pose) => sprite({ name, ...pose }) };
  const panel = mountParkPanel({ container, getSocket: () => socket, board, onClose: noop, ...options });
  // The captions a frame draws, decoded from the pixel font (the intro only when it repaints).
  const drawn = () => {
    painted.length = 0;
    engine.sceneEntities.get('calculator-room').render(fakeContext(canvas));
    return [...painted];
  };
  // The cat's centre at x, standing on the floor (the sprite is 20 x 24).
  const standAt = (centreX, y = WORLD.floor - 24) => Object.assign(player, { x: centreX - 10, y });
  const up = () => player.onUpPressed();
  const click = (x, y) => canvas.dispatchEvent(new win.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  return { panel, drawn, standAt, up, click, socket };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const TEAM = { mode: 'team', skill: null, topic: null };
const SOLO = { mode: 'solo', skill: null, topic: null };
const AUTO = { mode: 'auto', skill: null, topic: null };
const DOOR_CENTRE = SWITCH_DOOR.x + SWITCH_DOOR.w / 2;
const pressUp = () => win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

test('the door stands right of the team block\'s start, on the floor, in the entry area', () => {
  assert.deepEqual(SWITCH_DOOR, { x: 480, y: WORLD.floor - 40, w: 40, h: 40 });
});

test('parseRoomLink: solo, team and auto', () => {
  assert.equal(parseRoomLink('#room=calc-solo').mode, 'solo');
  assert.equal(parseRoomLink('#room=calc-solo&topic=1.7').mode, 'solo');
  assert.equal(parseRoomLink('#room=calc-team').mode, 'team');
  assert.equal(parseRoomLink('').mode, 'auto');
  assert.equal(parseRoomLink('#calendar').mode, 'auto');
});

test('resolveRoomMode: live -> team even on a weekend; in session -> team; neither -> solo; the hash wins', () => {
  assert.equal(resolveRoomMode({ link: AUTO, isLive: true, inSession: false }), 'team');
  assert.equal(resolveRoomMode({ link: AUTO, isLive: false, inSession: true }), 'team');
  assert.equal(resolveRoomMode({ link: AUTO, isLive: true, inSession: true }), 'team');
  assert.equal(resolveRoomMode({ link: AUTO, isLive: false, inSession: false }), 'solo');
  assert.equal(resolveRoomMode({ link: AUTO }), 'solo');
  assert.equal(resolveRoomMode({ link: SOLO, isLive: true, inSession: true }), 'solo', 'an explicit solo link wins');
  assert.equal(resolveRoomMode({ link: TEAM, isLive: false, inSession: false }), 'team', 'an explicit team link wins');
});

test('an auto room paints CALCULATOR / LOADING and sends nothing until the schedule loads, then resolves', async (t) => {
  let resolve;
  const schedule = new Promise(r => { resolve = r; });
  const room = mountRoom({ link: AUTO, schedule });
  t.after(() => room.panel.dispose());
  assert.equal(room.panel.getView().mode, null);
  assert.equal(room.panel.getView().link.mode, 'auto');
  const loading = room.drawn();
  assert.ok(loading.includes('CALCULATOR') && loading.includes('LOADING...'), loading.join(' | '));
  assert.ok(!loading.some(caption => /SOLO|TOGETHER/.test(caption)), loading.join(' | '));
  await new Promise(r => setTimeout(r, 150));
  assert.equal(room.socket.sent.length, 0, 'no lobby packet, no join while loading');
  resolve({ lessons: {} });   // no class today
  await tick(); await tick();
  assert.equal(room.panel.getView().mode, 'solo');
  assert.equal(room.panel.getView().link.mode, 'auto');
  assert.equal(room.panel.getView().participating, false, 'an auto solo room starts in the entry area');
  assert.ok(room.drawn().includes('CALCULATOR SOLO'));
});

test('an auto room with the Live Classroom live opens as the team room', async (t) => {
  const room = mountRoom({ link: AUTO, schedule: { lessons: {} } }, { live: true });
  t.after(() => room.panel.dispose());
  await tick(); await tick();
  assert.equal(room.panel.getView().mode, 'team');
  assert.ok(room.drawn().includes('CALCULATOR TOGETHER'));
});

test('an auto room on the section\'s class day follows SCHOOL_HOURS', async (t) => {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  const minute = now.getHours() * 60 + now.getMinutes();
  const room = mountRoom({ link: AUTO, schedule: { lessons: { '1.1': { periods: { B: today } } } } });
  t.after(() => room.panel.dispose());
  await tick(); await tick();
  const inHours = minute >= 7 * 60 + 30 && minute < 14 * 60 + 30;
  assert.equal(room.panel.getView().mode, inHours ? 'team' : 'solo');
});

test('a failed schedule load is solo', async (t) => {
  const room = mountRoom({ link: AUTO, schedule: Promise.reject(new Error('offline')) });
  t.after(() => room.panel.dispose());
  await tick(); await tick();
  assert.equal(room.panel.getView().mode, 'solo');
});

test('the team intro has a SOLO door with the bonus line; the solo intro a TEAM door', (t) => {
  const team = mountRoom({ link: TEAM });
  t.after(() => team.panel.dispose());
  const teamCaptions = team.drawn();
  assert.ok(teamCaptions.includes('SOLO'), teamCaptions.join(' | '));
  assert.ok(teamCaptions.includes('YOUR OWN ROUND . MASTER A SKILL - BANK A BONUS POINT'), teamCaptions.join(' | '));
  const solo = mountRoom({ link: SOLO });
  t.after(() => solo.panel.dispose());
  const soloCaptions = solo.drawn();
  assert.ok(soloCaptions.includes('TEAM'), soloCaptions.join(' | '));
  assert.ok(soloCaptions.includes('PUSH THE BLOCK WITH YOUR CLASS'), soloCaptions.join(' | '));
  assert.ok(!soloCaptions.some(caption => /MASTER A SKILL/.test(caption)), 'the bonus line lives on the SOLO door only');
});

test('UP beside the door: team -> #room=calc-solo, solo -> #room=calc-team', (t) => {
  win.location.hash = '';
  t.after(() => { win.location.hash = ''; });
  const team = mountRoom({ link: TEAM });
  t.after(() => team.panel.dispose());
  team.standAt(DOOR_CENTRE);
  team.up();
  assert.equal(win.location.hash, '#room=calc-solo');
  win.location.hash = '';
  const solo = mountRoom({ link: SOLO });
  t.after(() => solo.panel.dispose());
  solo.standAt(DOOR_CENTRE + 18);   // within 20 px of the door's centre
  solo.up();
  assert.equal(win.location.hash, '#room=calc-team');
});

test('UP away from the door, or in the air above it, does nothing', (t) => {
  win.location.hash = '';
  t.after(() => { win.location.hash = ''; });
  const room = mountRoom({ link: TEAM });
  t.after(() => room.panel.dispose());
  room.standAt(300); room.up();
  room.standAt(DOOR_CENTRE + 25); room.up();
  room.standAt(DOOR_CENTRE, SWITCH_DOOR.y - 80); room.up();
  assert.equal(win.location.hash, '');
});

test('an ArrowUp keydown beside the door enters it too (a brief tap between physics steps)', (t) => {
  win.location.hash = '';
  t.after(() => { win.location.hash = ''; });
  const room = mountRoom({ link: SOLO });
  t.after(() => room.panel.dispose());
  room.standAt(DOOR_CENTRE);
  pressUp();
  assert.equal(win.location.hash, '#room=calc-team');
});

test('a click on the door enters it; a click beside it does not', (t) => {
  win.location.hash = '';
  t.after(() => { win.location.hash = ''; });
  const room = mountRoom({ link: TEAM });
  t.after(() => room.panel.dispose());
  // The entry camera starts at 0 and the room is drawn at scale 1 on a 1366 px board.
  room.click(SWITCH_DOOR.x - 30, SWITCH_DOOR.y + 20);
  assert.equal(win.location.hash, '');
  room.click(DOOR_CENTRE, SWITCH_DOOR.y + 20);
  assert.equal(win.location.hash, '#room=calc-solo');
});

test('the door does nothing while a round is active', (t) => {
  win.location.hash = '';
  t.after(() => { win.location.hash = ''; });
  const room = mountRoom({ link: { mode: 'solo', skill: 'one-var-stats', topic: null } });
  t.after(() => room.panel.dispose());
  assert.equal(room.panel.getView().participating, true, 'a skill link joins at once');
  room.standAt(DOOR_CENTRE);
  room.up();
  pressUp();
  room.click(DOOR_CENTRE, SWITCH_DOOR.y + 20);
  assert.equal(win.location.hash, '');
});

test('the door does nothing while an auto room is still loading', (t) => {
  win.location.hash = '';
  t.after(() => { win.location.hash = ''; });
  const room = mountRoom({ link: AUTO, schedule: new Promise(noop) });
  t.after(() => room.panel.dispose());
  room.standAt(DOOR_CENTRE);
  room.up();
  pressUp();
  assert.equal(win.location.hash, '');
});

test('linkChanged for an auto room: bare -> bare stays, bare -> #room=calc-team remounts', async (t) => {
  const room = mountRoom({ link: AUTO, schedule: { lessons: {} } }, { live: true });
  t.after(() => room.panel.dispose());
  await tick(); await tick();
  assert.equal(room.panel.getView().mode, 'team', 'resolved to team');
  assert.equal(room.panel.linkChanged(''), false);
  assert.equal(room.panel.linkChanged('#calendar'), false);
  assert.equal(room.panel.linkChanged('#room=calc-team'), true, 'the hash\'s mode changed, even though the room is already team');
  assert.equal(room.panel.linkChanged('#room=calc-solo'), true);
});
