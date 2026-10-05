import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeKeyActor } from './native-key-actor.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativeGoalActor } from './native-goal-actor.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { dispatchNativeOverlapCallbacks } from './native-body-contacts.mjs';

const fixture = (options = {}) => {
  const events = [];
  const scene = { bodyWorld: createNativeBodyRegistry(), actorManager: createNativeActorManager(1),
    viewPosition: { x: 0, y: 0 }, viewOffset: { x: 0, y: 0 },
    playSound: value => events.push(['sound', value]), sendCommand: (...args) => events.push(['command', ...args]) };
  scene.bodyWorld.map = { width: 1, height: 1, table: [1] };
  const key = createNativeKeyActor({ position: { x: 100, y: 100 }, ...options });
  queueNativeActor(scene.actorManager, key, 0, scene);
  const player = createNativePlayer({ position: { x: 100, y: 100 }, presentation: {} });
  queueNativeActor(scene.actorManager, player, 0, scene);
  return { key, player, scene, events };
};

test('Key pickup samples scaled carrier bounds, follows facing, and retains one handoff per overlap pass', () => {
  const { key, player, events } = fixture({ params: [0, 0, 0, 'target'] });
  key.onOverlap(player.body);
  assert.equal(key.carrier, player);
  assert.deepEqual(events, [['command', 'target', 9], ['sound', 'get']]);
  assert.deepEqual(key.carrierBounds, { x: -16, y: -47, width: 32, height: 46 });
  const other = createNativePlayer({ playerIndex: 1, position: { x: 120, y: 100 }, presentation: {} });
  key.onOverlap(other.body);
  assert.equal(key.carrier, player);
  key.beforeMotion();
  assert.equal(key.position.x, Math.fround(98.4));
  assert.equal(key.position.y, Math.fround(95.3));
  key.onOverlap(other.body);
  assert.equal(key.carrier, other);
  key.beforeMotion();
  key.onOverlap(player.body);
  assert.equal(key.carrier, other);
  assert.equal(key.handoffTicks, 2);
  key.beforeMotion(); key.beforeMotion();
  key.onOverlap(player.body);
  assert.equal(key.carrier, player);
  player.scale.x = -1;
  key.position = { x: 100, y: 100 };
  key.beforeMotion();
  assert.equal(key.position.x, Math.fround(101.6));
});

test('Key and Goal native overlap opens immediately and consumes Key on following PRE', () => {
  const { key, player, scene, events } = fixture();
  key.onOverlap(player.body);
  const goal = createNativeGoalActor({ position: { x: 100, y: 100 } });
  queueNativeActor(scene.actorManager, goal, 0, scene);
  scene.bodyWorld.collisionMatrix[8 * 32 + 10] = scene.bodyWorld.collisionMatrix[10 * 32 + 8] = 1;
  dispatchNativeOverlapCallbacks(scene.bodyWorld);
  assert.equal(goal.opened, true);
  assert.equal(key.state, 2);
  assert.equal(key.body.flags & 1, 1);
  const commands = [];
  player.onCommand = command => commands.push(command);
  key.beforeMotion();
  assert.equal(key.state, 3);
  assert.equal(key.body.flags & 1, 0);
  assert.equal(key.spriteFlags & 8, 0);
  assert.equal(key.carrier, null);
  assert.deepEqual(commands, [0x18]);
  assert.equal(key.position.y, Math.fround(95.3), 'consumption frame uses target sampled before release');
  assert.equal(events.filter(event => event[0] === 'sound').length, 2);
});

test('Key release returns toward spawn, then accepts reveal commands only in idle state', () => {
  const { key, player } = fixture({ params: [0, 0, 1] });
  assert.equal(key.keyFlags & 1, 0);
  key.onCommand(9);
  assert.equal(key.keyFlags & 1, 1);
  key.onOverlap(player.body);
  key.position = { x: 200, y: 200 };
  key.onCommand(0x14, player);
  assert.equal(key.state, 1);
  for (let i = 0; i < 100; i++) key.beforeMotion();
  assert.equal(key.state, 0);
  assert.deepEqual(key.position, key.spawnPosition);
  key.state = 3; key.setVisible(false); key.onCommand(13);
  assert.equal(key.keyFlags & 1, 0);
});

test('BreakoutKey waits for tiles30 through34, but tile35 does not block appearance', () => {
  const { key, scene } = fixture({ mode: 1 });
  scene.bodyWorld.map.table[0] = 34;
  key.beforeMotion();
  assert.equal(key.keyFlags & 1, 0);
  scene.bodyWorld.map.table[0] = 35;
  key.beforeMotion();
  assert.equal(key.keyFlags & 1, 1);
  assert.equal(scene.scrollFlags & 0x40, 0x40);
});

test('Key constructor preserves party offsets and replicated clients ignore local carrier overlaps', () => {
  const { key, player, scene } = fixture({ partySize: 5, params: [3.9, 2.9, 0, '', -5] });
  assert.deepEqual(key.spawnPosition, { x: 109, y: 108 });
  assert.equal(key.verticalOffset, -5);
  key.networkOwner = {}; scene.networkMode = 1;
  key.onOverlap(player.body);
  assert.equal(key.carrier, null);
  key.onOverlap({ category: 10 });
  assert.equal(key.state, 0);
});

test('replicated Key flags change visibility and play get only on flag2 rising edge; release drops carrier reference', () => {
  const { key, player, events } = fixture();
  key.applyKeyFlags(2);
  key.applyKeyFlags(2);
  assert.equal(key.body.flags & 1, 0);
  assert.equal(events.length, 1);
  key.applyKeyFlags(1);
  assert.equal(key.body.flags & 1, 1);
  key.onOverlap(player.body);
  const refs = player.references;
  key.onReleased();
  assert.equal(player.references, refs - 1);
  assert.equal(key.carrier, null);
});
