import assert from 'node:assert/strict';
import test from 'node:test';
import { runNativeCommonActorPre, runNativeCommonActorPost, runNativeCommonActorAlternatePre,
  runNativeCommonActorAdded } from './native-actor-lifecycle.mjs';
import { createNativeActorManager, queueNativeActor, runNativeActorPre, runNativeActorPost } from './native-actor-manager.mjs';
import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { stepNativeBodyWorld } from './native-body-pass.mjs';

const actor = () => ({ position: { x: 10, y: 20 }, velocity: { x: 3, y: 4 },
  acceleration: { x: 0, y: 2 }, bodies: [], components: [], renderOffset: { x: 8, y: 9 },
  stepStartPosition: { x: 10, y: 20 }, manager: { flags: 0 }, flags: 0 });

test('normal PRE snapshots before actor hook and clears display offset before integrating motion', () => {
  const item = actor(), events = [];
  item.beforeMotion = dt => {
    assert.equal(dt, .25);
    assert.deepEqual(item.renderOffset, { x: 0, y: 0 });
    assert.deepEqual(item.previousVelocity, { x: 3, y: 4 });
    item.velocity.x = 5;
    item.renderOffset.x = 2;
    events.push('hook');
  };
  item.components.push({ syncPositions: (position, display) => events.push([position, display]) });
  runNativeCommonActorPre(item, .25);
  assert.deepEqual(item.position, { x: 15, y: 25 });
  assert.deepEqual(item.velocity, { x: 5, y: 6 });
  assert.deepEqual(item.stepStartPosition, { x: 10, y: 20 });
  assert.deepEqual(item.previousVelocity, { x: 3, y: 4 });
  assert.deepEqual(events, ['hook', [{ x: 15, y: 25 }, { x: 17, y: 25 }]]);
});

test('POST records corrected displacement after the actor hook, then resets scratch state', () => {
  const item = actor();
  const body = createNativeActorRectangle(item, { x: 0, y: 0, width: 10, height: 10 }, 3, true);
  item.position = { x: 13, y: 22 };
  item.alternateTicks = 7;
  item.postResetVector = { x: 4, y: 5 };
  item.afterMotion = () => { item.position.x += 2; };
  item.components.push({ syncPositions: () => {
    assert.deepEqual(item.frameDisplacement, { x: 5, y: 2 });
    assert.deepEqual(item.postResetVector, { x: 4, y: 5 });
    assert.equal(item.alternateTicks, 7);
  } });
  runNativeCommonActorPost(item, 1);
  assert.deepEqual(body.position, { x: 15, y: 22 });
  assert.ok(body.flags & 0x40);
  assert.deepEqual(item.postResetVector, { x: 0, y: 0 });
  assert.equal(item.alternateTicks, 0);
});

test('alternate PRE advances twice-counted ticks only inside the native motion limit and preserves display offset', () => {
  const item = actor(), events = [];
  item.flags = 4;
  item.motionFlags = 0x20;
  item.alternateLimit = 3;
  item.beforeAlternateMotion = () => events.push('alternate');
  item.components.push({ syncPositions: () => events.push('component') });
  runNativeCommonActorAlternatePre(item, 1);
  assert.equal(item.alternateTicks, 2);
  assert.deepEqual(item.position, { x: 13, y: 25 });
  assert.deepEqual(item.renderOffset, { x: 8, y: 9 });
  runNativeCommonActorAlternatePre(item, 1);
  assert.equal(item.alternateTicks, 4);
  assert.deepEqual(item.position, { x: 16, y: 32 });
  runNativeCommonActorAlternatePre(item, 1);
  assert.equal(item.alternateTicks, 5);
  assert.deepEqual(item.position, { x: 16, y: 32 });
  assert.deepEqual(events, ['alternate', 'component', 'alternate', 'component', 'alternate']);
});

test('alternate PRE without both motion flags calls only the actor hook; history POST keeps its counter', () => {
  for (const [flags, motionFlags] of [[0, 0x20], [4, 0]]) {
    const item = actor();
    Object.assign(item, { flags, motionFlags, alternateLimit: 20 });
    item.beforeAlternateMotion = () => { item.renderOffset.x++; };
    runNativeCommonActorAlternatePre(item, 1);
    assert.deepEqual(item.position, { x: 10, y: 20 });
    assert.equal(item.alternateTicks, 1);
    assert.equal(item.renderOffset.x, 9);
    item.manager.flags = 8;
    runNativeCommonActorPost(item, 1);
    assert.equal(item.alternateTicks, 1);
  }
});

test('on-added registers all bodies before components and recomputes position for each component', () => {
  const item = actor(), scene = { bodyWorld: createNativeBodyRegistry() }, events = [];
  const body = createNativeActorRectangle(item, { x: 0, y: 0, width: 10, height: 10 }, 3, true);
  item.components.push({ onAdded: (receivedScene, position, mode) => {
    assert.equal(body.world, scene.bodyWorld);
    assert.equal(receivedScene, scene);
    events.push([position, mode]);
    item.position.x = 40;
  } }, { onAdded: (_scene, position, mode) => events.push([position, mode]) });
  runNativeCommonActorAdded(item, scene);
  assert.deepEqual(events, [[{ x: 10, y: 20 }, 0], [{ x: 40, y: 20 }, 0]]);
});

test('scheduler, common lifecycle and body world preserve component updates around map correction', () => {
  const item = actor(), manager = createNativeActorManager(2);
  item.manager = null;
  const scene = { bodyWorld: createNativeBodyRegistry() }, events = [];
  const body = createNativeActorRectangle(item, { x: -5, y: -10, width: 10, height: 10 }, 3, true);
  placeNativeActorBodies(item, { x: 25, y: 28 });
  item.velocity = { x: 0, y: 3 };
  item.acceleration = { x: 0, y: 0 };
  scene.bodyWorld.map = { width: 6, height: 6, chipSize: 10, table: Array(36).fill(1), customFlags: [] };
  for (let x = 0; x < 6; x++) scene.bodyWorld.map.table[18 + x] = 2;
  item.onAdded = value => runNativeCommonActorAdded(item, value);
  item.onPre = dt => runNativeCommonActorPre(item, dt);
  item.onPost = dt => runNativeCommonActorPost(item, dt);
  item.onRemoved = () => unregisterNativeActorBodies(item);
  item.beforeMotion = () => events.push('pre');
  item.afterMotion = () => events.push('post');
  item.onPositionResolved = () => events.push('correct');
  body.onContactStay = () => { events.push('contact'); item.velocity.y = 0; };
  item.components.push({ syncPositions: position => events.push(['component', position.y]) });
  queueNativeActor(manager, item, 1, scene);
  runNativeActorPre(manager, 1);
  stepNativeBodyWorld(scene.bodyWorld);
  runNativeActorPost(manager, 1);
  const floor = Math.fround(29.99);
  assert.deepEqual(events, ['pre', ['component', 31], 'correct', ['component', floor], 'contact',
    'post', ['component', floor]]);
  assert.equal(item.frameDisplacement.y, Math.fround(floor - 28));
  assert.deepEqual(item.previousVelocity, { x: 0, y: 3 });
  assert.equal(item.velocity.y, 0);
  assert.equal(body.flags & 0x40, 0);
});
