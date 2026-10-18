// APSTAT_PARK_TRAINER_ABSORB_2_SPEC §3 in the client: the completion status line says what the
// clear did to the hint rung (relay fields rungChange / clearQuality), solo and team.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/#room=calc-solo&skill=one-var-stats', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const noop = () => {};
const fakeContext = (canvas) => new Proxy({ canvas }, {
  get: (target, key) => (key in target ? target[key] : key === 'measureText' ? () => ({ width: 6 }) : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
const { mountParkPanel } = await import('./calculator-room.mjs');
const { CALCULATOR_PROTOCOL } = await import('./calculator-lobby.mjs');
const { levelById } = await import('./calculator-curriculum.mjs');

const LEVEL = levelById('one-var-stats');

function mountRoom(username, link) {
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
  const panel = mountParkPanel({ container, getSocket: () => socket, board, onClose: noop, link });
  const deliver = (packet) => listeners.forEach((fn) => fn({ data: JSON.stringify(packet) }));
  const status = () => container.querySelector('[role="status"]').textContent;
  return { panel, deliver, status };
}

const SOLO_LINK = { mode: 'solo', skill: 'one-var-stats', topic: null };
const TEAM_LINK = { mode: 'team', skill: null, topic: null };

function packets(mode, names) {
  const lobby = { type: 'calculator_lobby_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1', mode,
    pinnedSkill: mode === 'solo' ? 'one-var-stats' : null, missionId: LEVEL.id, eligibleCount: 3, phase: 'active',
    blockX: 1060, pushers: [], roster: names, members: [], campaignKeys: {}, campaignOpen: [0] };
  const done = extra => ({ type: 'calculator_state', protocol: CALCULATOR_PROTOCOL, epoch: 'e1', mode,
    pinnedSkill: lobby.pinnedSkill, missionId: LEVEL.id, revision: 2, step: LEVEL.route.length, keys: LEVEL.route,
    startedAt: 0, clock: 0, readyCount: names.length, teamSize: names.length, timeoutCount: 0, boxAttempts: 0,
    boxValues: [], lastPlot: null, solved: true, complete: true, failure: null, hintKeys: [], lastPress: null,
    clears: 1, rung: 1, problem: null, members: names.map(name => ({ name, pose: { x: 65, y: 676 }, step: LEVEL.route.length, solved: true })),
    ...extra });
  return { lobby, done };
}

const LINES = [
  { name: 'the rung rose', extra: { rungChange: 1, clearQuality: 5 }, line: 'Hints fade next round.' },
  { name: 'a messy clear', extra: { rungChange: 0, clearQuality: 2 }, line: 'Messy clear: hints stay where they are.' },
  { name: 'a rough clear at rung 0/1', extra: { rungChange: 0, clearQuality: 1 }, line: 'Messy clear: hints stay where they are.' },
  { name: 'a rough clear at rung 2', extra: { rungChange: -1, clearQuality: 0 }, line: 'Rough clear: the goal hints come back next round.' },
];
const ALL = /Hints fade next round\.|Messy clear|Rough clear/;

for (const { name, extra, line } of LINES) {
  test('solo complete line: ' + name, (t) => {
    const room = mountRoom('alice', SOLO_LINK);
    t.after(() => room.panel.dispose());
    const p = packets('solo', ['alice']);
    room.deliver(p.lobby);
    room.deliver(p.done(extra));
    assert.ok(room.status().includes('complete. +1 key. ' + line), room.status());
    assert.match(room.status(), /Walk to the door for the next round\.$/);
  });
  test('team complete line: ' + name, (t) => {
    // The team room: the student walks in and joins (startMission).
    const room = mountRoom('alice', TEAM_LINK);
    t.after(() => room.panel.dispose());
    room.panel.startMission();
    const p = packets('team', ['alice', 'bob']);
    room.deliver(p.lobby);
    room.deliver(p.done(extra));
    assert.ok(room.status().includes('+1 key for everyone on the team. ' + line), room.status());
  });
}

test('nothing is said when a clean clear finds the rung already at 2, or the relay sent no verdict', (t) => {
  for (const extra of [{ rungChange: 0, clearQuality: 5, clears: 3, rung: 2 }, {}]) {
    const room = mountRoom('alice', SOLO_LINK);
    t.after(() => room.panel.dispose());
    const p = packets('solo', ['alice']);
    room.deliver(p.lobby);
    room.deliver(p.done(extra));
    assert.match(room.status(), /^Cleared! /);
    assert.doesNotMatch(room.status(), ALL);
  }
});
