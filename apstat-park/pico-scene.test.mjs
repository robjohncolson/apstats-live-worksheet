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

function scene({ members = ['me'], online = members, poses = {}, progress = {}, clock = 0 } = {}) {
  const level = createParkLevel(6), queued = [], motions = [];
  const engine = { groundY: 170, sceneEntities: null };
  const player = { x: 0, y: 0, vx: 0, vy: 0, _airFrames: 0, standingOn: null, facingRight: true, update() {}, render() {} };
  const board = { engine, input: {}, setBoardHeight() {}, viewportW: () => 800,
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
  const game = mountBoardScene({ board, replica, member: 'me', onExit() {}, status, connected: () => true });
  const step = () => engine.sceneEntities.get('step').update(1 / 60);
  step();
  return { level, game, player, replica, queued, motions, step, anchors, status, setClock: t => { clock = t; } };
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
  assert.ok(lift.y + lift.h <= s.player.y + 1e-9, 'never inside the cat');
  assert.ok(s.queued.some(q => q.kind === 'hold' && q.target === 'lift-under' && q.active === true));
});
