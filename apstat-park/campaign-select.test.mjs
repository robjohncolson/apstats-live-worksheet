// Teacher 2026-10-07 (PICO_DESK_SPEC.md "Campaign keys as a spendable count"): the PICO PARK door
// opens on a STAGE SELECT (n/48). The relay is the authority; the select only draws its
// campaign_progress and sends campaign_join {stage} / campaign_open_stage {stage}.
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
const { stageStates, choiceFor, moveCursor, stageAt, tileRect, startCursor, describe, stageLabel } = await import('./campaign-select.mjs');
const { mountCampaign } = await import('./campaign-panel.mjs');

// Party me + bo. Open 1-1..1-3. I cleared 1-1 and 1-2; bo cleared 1-1 only.
const PROGRESS = { type: 'campaign_progress', keys: { me: 2 }, cleared: { me: [0, 1], bo: [0] }, open: [0, 1, 2],
  party: ['me', 'bo'], startable: [0, 1], team: null };

test('every stage gets one of the four states', () => {
  const states = stageStates(PROGRESS, 'me');
  assert.equal(states.length, 48);
  assert.deepEqual(states.slice(0, 5).map(entry => entry.state), ['cleared', 'cleared', 'waiting', 'locked', 'locked']);
  assert.deepEqual(states[2].needs, [{ name: 'bo', stage: 1 }], 'open 1-3 shows who still needs an earlier stage');
  assert.equal(states[3].openable, true, 'the next locked stage opens with a key');
  assert.equal(states[4].openable, false, 'never further ahead');
  const theirs = stageStates(PROGRESS, 'bo');
  assert.equal(theirs[1].state, 'startable', 'startable but not cleared by bo: no tick');
  assert.equal(theirs[3].openable, false, 'bo holds no key');
  assert.equal(stageLabel(47), '12-4');
});

test('choices map to relay messages; waiting and far-locked tiles do nothing', () => {
  const states = stageStates(PROGRESS, 'me');
  assert.deepEqual(choiceFor(states[1]), { type: 'campaign_join', stage: 1 });
  assert.equal(choiceFor(states[2]), null);
  assert.deepEqual(choiceFor(states[3]), { type: 'campaign_open_stage', stage: 3 });
  assert.equal(choiceFor(states[9]), null);
  assert.match(describe(states[2], states), /STILL NEEDED: bo 1-2/);
  assert.match(describe(states[3], states), /SPEND 1 KEY TO OPEN 1-4/);
  assert.match(describe(states[9], states), /OPEN 1-4 FIRST/);
  assert.equal(startCursor(states), 1, 'the furthest startable stage');
  assert.equal(startCursor(stageStates({ ...PROGRESS, team: { stageIndex: 0 } }, 'me')), 0, 'your team first');
});

test('the grid is 8 x 6; arrows and the mouse find tiles', () => {
  assert.equal(moveCursor(0, 'ArrowLeft'), 0);
  assert.equal(moveCursor(0, 'ArrowRight'), 1);
  assert.equal(moveCursor(1, 'ArrowDown'), 9);
  assert.equal(moveCursor(44, 'ArrowDown'), 47);
  const tile = tileRect(10, 100);
  assert.equal(stageAt(tile.x + 5, tile.y + 5, 100), 10);
  assert.equal(stageAt(5, 5, 100), -1);
  assert.ok(tileRect(47).y + tileRect(47).h < 620, 'the grid clears the info lines and the floor');
});

function mount() {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const canvas = win.document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 750 });
  const listeners = [];
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(data) { this.sent.push(JSON.parse(data)); },
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); }, removeEventListener() {} };
  const engine = { canvas, sceneEntities: null };
  let closed = 0;
  const board = { engine, input: {}, username: 'me', viewportW: () => 720, setBoardHeight: noop, atlas: () => null,
    transitionFrame: null, createPeer: () => ({ hue: 0 }) };
  const panel = mountCampaign({ container, getSocket: () => socket, board, onClose() { closed++; } });
  const deliver = packet => listeners.forEach(fn => fn({ data: JSON.stringify(packet) }));
  const key = (k, type = 'keydown') => win.document.dispatchEvent(new win.KeyboardEvent(type, { key: k, bubbles: true }));
  const render = () => engine.sceneEntities?.get('campaign').render(fakeContext(canvas));
  return { panel, socket, deliver, key, render, canvas, closed: () => closed, container };
}

test('the door opens on the stage select: it asks for progress and joins nothing', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  assert.deepEqual(m.socket.sent.map(packet => packet.type), ['campaign_select']);
  m.deliver(PROGRESS);
  m.render();
  const view = m.panel.getSelect();
  assert.equal(view.selecting, true);
  assert.equal(view.cursor, 1);
  assert.match(m.container.querySelector('[data-campaign-status]').textContent, /Stage select\. ENTER: START 1-2/);
});

test('Enter on a startable stage joins with that stage; a relay refusal greys it out and stays on the select', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  m.key('Enter');
  const join = m.socket.sent.at(-1);
  assert.equal(join.type, 'campaign_join');
  assert.equal(join.stage, 1);
  assert.equal(Number.isInteger(join.protocol), true);
  assert.equal(m.panel.getSelect().selecting, false);
  m.deliver({ type: 'campaign_error', message: 'Stage 1-2 needs everyone to finish the stages before it.' });
  const view = m.panel.getSelect();
  assert.equal(view.selecting, true);
  assert.deepEqual(view.rejected, [1]);
  assert.match(view.message, /needs everyone/);
  const sent = m.socket.sent.length;
  m.key('Enter');
  assert.equal(m.socket.sent.length, sent, 'a greyed stage is not sent again until the relay says it changed');
});

test('the next locked stage spends a key; arrows move the cursor; a state packet leaves the select', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  m.key('ArrowRight'); m.key('ArrowRight');   // 1-2 -> 1-3 (waiting) -> 1-4 (locked, openable)
  assert.equal(m.panel.getSelect().cursor, 3);
  m.key('Enter');
  assert.deepEqual(m.socket.sent.at(-1), { type: 'campaign_open_stage', stage: 3 });
  m.deliver({ ...PROGRESS, keys: { me: 1 }, open: [0, 1, 2, 3] });
  assert.equal(m.panel.getSelect().pending, null);
  assert.equal(m.panel.getSelect().states[3].state, 'waiting', 'open now, but bo still needs 1-2 and 1-3');
  m.key('ArrowLeft'); m.key('ArrowLeft');
  m.key(' ');
  assert.deepEqual([m.socket.sent.at(-1).type, m.socket.sent.at(-1).stage], ['campaign_join', 1]);
  m.deliver({ type: 'campaign_state', protocol: 15, team: 't', epoch: 'e1', stageIndex: 1, lap: 1, seed: 1, roster: ['me'],
    helpers: [], waiting: [], phase: 'playing', reason: null, from: 0, to: 0, events: [{ frame: 0, inputs: [0, 0] }], more: false });
  assert.equal(m.panel.getSelect().selecting, false);
});

test('a click on a tile chooses it', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  const tile = tileRect(0);
  m.canvas.dispatchEvent(new win.MouseEvent('click', { clientX: tile.x + 10, clientY: tile.y + 10, bubbles: true }));
  assert.deepEqual([m.socket.sent.at(-1).type, m.socket.sent.at(-1).stage], ['campaign_join', 0]);
});

test('a team that clears into a locked stage is shown the select again', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  m.key('Enter');
  const base = { type: 'campaign_state', protocol: 15, team: 't', epoch: 'e1', stageIndex: 1, lap: 1, seed: 1, roster: ['me', 'bo'],
    helpers: [], waiting: [], reason: null, from: 0, to: 0, events: [{ frame: 0, inputs: [0, 0] }], more: false };
  m.deliver({ ...base, phase: 'playing' });
  assert.equal(m.panel.getSelect().selecting, false);
  m.deliver({ ...base, epoch: 'e2', phase: 'select', reason: 'Stage 1-3 is locked. Open it with a key, or choose a stage.',
    progress: { keys: { me: 2 }, cleared: { me: [0, 1], bo: [0, 1] }, open: [0, 1], party: ['me', 'bo'], startable: [0, 1] } });
  const view = m.panel.getSelect();
  assert.equal(view.selecting, true);
  assert.match(view.message, /1-3 is locked/);
  assert.equal(view.states[2].openable, true);
});

test('Esc on the select backs out to the park', () => {
  const m = mount();
  m.deliver(PROGRESS);
  m.key('Escape');
  assert.equal(m.closed(), 1);
  assert.equal(m.socket.sent.at(-1).type, 'campaign_leave');
});

test('a refusal is reconciled by later progress: cleared -> refused -> waiting -> cleared joins again', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);   // cursor on 1-2 (cleared by me, startable)
  m.key('Enter');
  m.deliver({ type: 'campaign_error', message: 'refused' });
  assert.deepEqual(m.panel.getSelect().rejected, [1]);
  m.deliver(PROGRESS);   // the same state: still greyed
  assert.deepEqual(m.panel.getSelect().rejected, [1]);
  m.deliver({ ...PROGRESS, party: ['me', 'bo', 'cy'], startable: [0] });   // cy arrives: 1-2 waits for cy
  assert.equal(m.panel.getSelect().states[1].state, 'waiting');
  assert.deepEqual(m.panel.getSelect().rejected, [], 'the state moved on: the refusal is dropped');
  m.deliver(PROGRESS);   // cy leaves: cleared and startable again
  const sent = m.socket.sent.length;
  m.key('Enter');
  assert.equal(m.socket.sent.length, sent + 1);
  assert.deepEqual([m.socket.sent.at(-1).type, m.socket.sent.at(-1).stage], ['campaign_join', 1]);
});
