// Level 6 in the board scene with a scripted cat (no PlayerSprite physics): terrain per party,
// re-entry, catch zones and the intents the relay receives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createParkLevel } from '../../curriculum_render/railway-server/apstat-park/levels.mjs';
import { mountBoardScene } from './board-scene.mjs';
import { toPose, fromPose } from './pico-rules.mjs';

// board-scene creates the legacy key image at mount; Node has no Image.
globalThis.Image ??= class { };

const standing = (cx, feet) => fromPose({ x: cx - 8, y: feet - 23 });

function scene({ members = ['me'], online = members, poses = {}, progress = {}, clock = 0, doc = null, presses = null } = {}) {
  const level = createParkLevel(6), queued = [], motions = [], exits = [];
  const engine = { groundY: 170, sceneEntities: null, ...(doc ? { canvas: { ownerDocument: doc } } : {}) };
  const player = { x: 0, y: 0, vx: 0, vy: 0, _airFrames: 0, standingOn: null, facingRight: true, update() {}, render() {} };
  const board = { engine, input: {}, ...(presses ? { presses } : {}), setBoardHeight() {}, viewportW: () => 800,
    api: { _camera: {}, _updateCamera() {}, _translateForCamera() {}, _restoreFromCamera() {} },
    createPlayer: options => Object.assign(player, { onUpPressed: options.onUpPressed }), createPeer: (name, pose) => ({ name, ...pose, render() {}, getLabelSpec: () => null }) };
  const anchors = {};
  const replica = {
    state: { epoch: 'e', level, members, online, poses, running: true,
      progress: { arrived: [], idle: [], holds: {}, gates: [], latches: {}, keyHolder: null, doorOpen: false, complete: false,
        lifts: { lift: { from: 201.5, to: 201.5, at: 0, duration: 0 } }, boxes: {}, ...progress } },
    remoteMotion: { sample: name => anchors[name] || null },
    motion: pose => motions.push(pose), queue(kind, target, pose, details = {}) { queued.push({ kind, target, pose, ...details }); return { status: 'queued' }; },
    clock: () => clock, now: () => clock, outbox: [] };
  const status = { textContent: '', style: {} };
  const game = mountBoardScene({ board, replica, member: 'me', onExit() { exits.push(clock); }, status, connected: () => true });
  const step = () => engine.sceneEntities.get('step').update(1 / 60);
  step();
  return { level, game, player, replica, queued, motions, step, anchors, status, board, exits, setClock: t => { clock = t; } };
}

test('solo: spawn slot, fully extended bridge, both stairs, lift solid at rest', () => {
  const { level, player, game, status } = scene();
  assert.deepEqual(toPose(player), { ...level.spawnSlots[0], vx: 0, vy: 0 });
  const terrain = game.getWorld().terrain;
  assert.ok(terrain.some(t => t.kind === 'bridge-extension' && t.x === 746 && t.w === 110));
  assert.equal(terrain.filter(t => t.kind === 'block').length, 2);
  assert.ok(terrain.some(t => t.kind === 'lift' && t.y === 201.5 && t.x === 1222 && t.w === 92 && t.h === 9.5));
  assert.equal(status.style.top, '2px', 'status moved off the floor row');
  assert.doesNotMatch(status.textContent, /friend/i);
});

test('second member gets slot 1; a party of two keeps the resting bridge until the latch', () => {
  const { level, player, game } = scene({ members: ['a', 'me'], online: ['a', 'me'] });
  assert.deepEqual(toPose(player), { ...level.spawnSlots[1], vx: 0, vy: 0 });
  assert.equal(game.getWorld().terrain.some(t => t.kind === 'bridge-extension'), false);
});

test('re-entry honours a safe saved pose, else the nearest checkpoint to its left', () => {
  const safe = { x: 1000, y: 193, vx: 0, vy: 0 };
  assert.deepEqual(toPose(scene({ poses: { me: safe } }).player), safe);
  const lift = { x: 1250, y: 100, vx: 0, vy: 0 }, level = createParkLevel(6), pit2 = level.catchZones[1].to;
  assert.deepEqual(toPose(scene({ poses: { me: lift } }).player), { ...pit2, vx: 0, vy: 0 });
});

test('catch zone: teleport before the pose is sent, stacked over a teammate dropping in', () => {
  const s = scene({ members: ['a', 'me'] });
  s.anchors.a = { x: 688, y: -40, vx: 0, vy: 300 };
  Object.assign(s.player, standing(820, 250), { _airFrames: 20 });
  s.step();
  const pit2 = s.level.catchZones[1].to;
  assert.deepEqual(toPose(s.player), { x: pit2.x, y: pit2.y - 25, vx: 0, vy: 0 });
  assert.ok(s.motions.every(p => p.y + 23 <= 240), 'the relay never saw a pose below the level');
});

test('intents: switch once, key, unlock when the key has reached the door, arrive on a fresh Up', () => {
  const s = scene({ members: ['a', 'me'] });
  Object.assign(s.player, standing(960, 216));
  s.step(); s.step();
  assert.equal(s.queued.filter(q => q.kind === 'switch').length, 1);
  assert.equal(s.queued.find(q => q.kind === 'switch').target, 'bridge');
  Object.assign(s.player, standing(1176, 100), { _airFrames: 5 });
  s.step();
  assert.ok(s.queued.some(q => q.kind === 'key'));
  s.replica.state.progress.keyHolder = 'me';
  Object.assign(s.player, standing(1440, 96), { _airFrames: 0 });
  for (let i = 0; i < 4; i++) s.step();
  assert.equal(s.queued.some(q => q.kind === 'unlock'), false, 'the key is still on its way');
  for (let i = 0; i < 120; i++) s.step();
  assert.ok(s.queued.some(q => q.kind === 'unlock'));
  s.replica.state.progress.doorOpen = true;
  s.player.onUpPressed?.(s.player);
  assert.ok(s.queued.some(q => q.kind === 'arrive'));
});

test('a rider holds the lift; a cat under the descending lift leases lift-under and stops it locally', () => {
  const s = scene({ members: ['a', 'me'] });
  Object.assign(s.player, standing(1260, 201.5), { _airFrames: 0 });   // landed (PlayerSprite sets this)
  s.step();
  assert.ok(s.queued.some(q => q.kind === 'hold' && q.target === 'lift' && q.active === true));
  // Lift coming down toward a cat on the floor.
  s.queued.length = 0;
  s.replica.state.progress.lifts.lift = { from: 105.5, to: 201.5, at: 0, duration: 3200, rate: 30 };
  Object.assign(s.player, standing(1260, 216), { _airFrames: 0 });
  s.setClock(1000); s.step();
  s.setClock(2900);   // relay surface 192.5: past the head (192)
  s.step(); s.step();
  const lift = s.game.getWorld().lift;
  assert.ok(Math.abs(lift.y + lift.h - (s.player.y + 1)) < 1e-9, 'stops on the head (hitbox top, sprite y + 1), never inside the cat');
  assert.ok(s.queued.some(q => q.kind === 'hold' && q.target === 'lift-under' && q.active === true));
});

// ---- Review fixes ----
const holds = (q, target) => q.filter(x => x.kind === 'hold' && x.target === target);

test('no input for 120 s: lift leases are released once and not renewed until the next input', async () => {
  const { LEASE_IDLE_MS } = await import('./pico-scene.mjs');
  const s = scene({ members: ['a', 'me'] });
  Object.assign(s.player, standing(1260, 201.5), { _airFrames: 0 });
  s.board.input.right = true; s.step(); s.board.input.right = false;
  s.replica.state.progress.holds = { lift: ['me'] };
  for (let t = 0; t < LEASE_IDLE_MS - 1000; t += 1000) { s.setClock(t); s.step(); }
  const renewals = holds(s.queued, 'lift').filter(q => q.active).length;
  assert.ok(renewals >= 50, 'renewed every 2 s while recently active (' + renewals + ')');
  s.queued.length = 0;
  for (let t = LEASE_IDLE_MS; t < LEASE_IDLE_MS + 60000; t += 1000) {
    s.setClock(t); s.step();
    if (holds(s.queued, 'lift').some(q => q.active === false)) s.replica.state.progress.holds = {};
  }
  assert.deepEqual(holds(s.queued, 'lift').map(q => q.active), [false], 'one release, then silence');
  s.queued.length = 0;
  s.board.input.jump = true; s.setClock(LEASE_IDLE_MS + 61000); s.step(); s.board.input.jump = false;
  assert.ok(holds(s.queued, 'lift').some(q => q.active === true), 'renewed on the next input');
});

test('the same for a cat under the lift (lift-under)', async () => {
  const { LEASE_IDLE_MS } = await import('./pico-scene.mjs');
  const s = scene({ members: ['a', 'me'] });
  s.replica.state.progress.lifts.lift = { from: 105.5, to: 201.5, at: 0, duration: 1e9, rate: 30, blocked: true };
  Object.assign(s.player, standing(1260, 216), { _airFrames: 0 });
  s.step();
  assert.ok(holds(s.queued, 'lift-under').some(q => q.active));
  s.replica.state.progress.holds = { 'lift-under': ['me'] };
  s.queued.length = 0;
  for (let t = 1000; t <= LEASE_IDLE_MS + 30000; t += 1000) {
    s.setClock(t); s.step();
    if (holds(s.queued, 'lift-under').some(q => q.active === false)) s.replica.state.progress.holds = {};
  }
  const sent = holds(s.queued, 'lift-under').map(q => q.active);
  assert.equal(sent.at(-1), false);
  assert.equal(sent.filter(a => a === false).length, 1);
});

test('a registered lift rider keeps its latched stack level while its 2 Hz pose lags', () => {
  const s = scene({ members: ['a', 'b', 'me'] });
  // b stands one up on a; both hold the lift; then the lift rises.
  s.anchors.a = { x: 1240, y: 201.5 - 23, vx: 0, vy: 0 };
  s.anchors.b = { x: 1242, y: 201.5 - 46, vx: 0, vy: 0 };
  s.replica.state.progress.holds = { lift: ['a', 'b'] };
  s.step();
  const peers = s.game.getWorld().peers;
  assert.equal(peers.b.y, 201.5 - 24 - 23);
  s.replica.state.progress.lifts.lift = { from: 201.5, to: 105.5, at: 0, duration: 3200, rate: 30 };
  s.setClock(2000);   // lift at 141.5; the samples are still from the bottom (60 px below)
  s.step();
  assert.equal(peers.a.y, 141.5 - 24, 'rider drawn on the lift, not inside it');
  assert.equal(peers.b.y, 141.5 - 24 - 23, 'second rider keeps level 1');
  // We stand on b: we follow the lift with it.
  Object.assign(s.player, { x: peers.b.x, y: peers.b.y - 23, standingOn: peers.b, _airFrames: 0 });
  s.setClock(2500); s.step();
  assert.equal(s.player.y, 126.5 - 24 - 46);
  // Off the lift (holds released): the latch clears and the samples are used again.
  s.replica.state.progress.holds = {};
  s.step();
  assert.equal(peers.b.y, s.anchors.b.y - 1);
});

test('a tab hidden for 15 s leaves the park (Escape path); coming back sooner does not', () => {
  const listeners = {}, timers = [];
  const win = { setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; }, clearTimeout(id) { timers[id - 1].fn = null; } };
  const doc = { hidden: false, defaultView: win, addEventListener(t, fn) { listeners[t] = fn; }, removeEventListener() {} };
  const s = scene({ doc });
  doc.hidden = true; listeners.visibilitychange();
  assert.equal(timers.at(-1).ms, 15000);
  doc.hidden = false; listeners.visibilitychange();
  assert.equal(timers[0].fn, null, 'returning cancels it');
  doc.hidden = true; listeners.visibilitychange();
  timers.at(-1).fn();
  assert.equal(s.exits.length, 1, 'left the park');
});

test('the top stair with a teammate beside it teaches the crossing', () => {
  const s = scene({ members: ['a', 'me'] });
  Object.assign(s.player, standing(752, 168), { _airFrames: 0 });
  s.anchors.a = { x: 700, y: 400, vx: 0, vy: 0 };
  s.step();
  assert.doesNotMatch(s.status.textContent, /edge/);
  s.anchors.a = { ...toPose(standing(735, 168)) };
  s.step();
  assert.equal(s.status.textContent, 'Stand at the edge. A friend jumps from your head.');
  s.replica.state.progress.latches = { bridge: -99999 };
  s.step();
  assert.doesNotMatch(s.status.textContent, /edge/, 'not once the bridge is out');
});

test('a key tap that starts and ends between two fixed steps still jumps, and a re-press while held is fresh', () => {
  const presses = { left: 0, right: 0, jump: 0, up: 0 };
  const s = scene({ presses });
  const seen = [];
  s.player.update = function () { seen.push({ jump: s.board.input.jump, handled: this._jumpHandled }); this._jumpHandled = !!s.board.input.jump; };
  presses.jump++;                       // keydown + keyup inside one task: the flag is already false
  s.step(); s.step();
  assert.deepEqual(seen.map(x => x.jump), [true, false], 'held for exactly one step');
  assert.equal(s.board.input.jump, false);
  seen.length = 0;
  s.board.input.jump = true; presses.jump++; s.step(); s.step();      // a real press, held
  presses.jump++; s.step();                                           // release + re-press in one frame
  assert.deepEqual(seen.map(x => x.handled), [false, true, false], 'the re-press is a fresh edge');
});

test('an Up tap inside one task at the calendar door leaves the park', () => {
  const presses = { left: 0, right: 0, jump: 0, up: 0 };
  const s = scene({ presses });
  s.player.update = function () { if (s.board.input.up && !this._upHandled) this.onUpPressed(this); this._upHandled = !!s.board.input.up; };
  Object.assign(s.player, { x: 22, y: 192 });
  presses.up++; s.step();
  assert.equal(s.exits.length, 1);
});
