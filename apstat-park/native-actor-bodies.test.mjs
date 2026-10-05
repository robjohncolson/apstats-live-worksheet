import assert from 'node:assert/strict';
import test from 'node:test';
import { addNativeActorBody, createNativeActorRectangle, createNativeActorCircle,
  registerNativeActorBodies, unregisterNativeActorBodies, nextNativeReplicatedBodyId,
  nativeActorDisplayPosition } from './native-actor-bodies.mjs';
import { createNativeBody } from './native-body.mjs';
import { createNativeBodyRegistry, attachNativeBody, detachNativeBody } from './native-body-registry.mjs';
import { placeNativeActorBodies, advanceNativeActorMotion } from './native-actor-motion.mjs';
import { stepNativeBodyWorld } from './native-body-pass.mjs';

const bounds = { x: -5, y: -10, width: 10, height: 10 };
const actor = () => ({ bodies: [], components: [], position: { x: 20, y: 20 },
  spawnPosition: { x: 10, y: 10 }, velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 } });

test('body creation installs following callbacks only and enforces the native five-body limit', () => {
  const item = actor(), events = [];
  item.onScaleResolved = (x, y) => events.push([x, y]);
  const following = createNativeActorRectangle(item, bounds, 3, true);
  const independent = createNativeActorCircle(item, { x: 2, y: 3, radius: 4 }, 0, false);
  assert.equal(following.actor, item);
  assert.equal(following.category, 0);
  assert.equal(independent.onPositionResolved, undefined);
  following.onScaleResolved(2, 3);
  assert.deepEqual(events, [[2, 3]]);
  assert.deepEqual(following.position, { x: 0, y: 0 }, 'unregistered construction does not place the body');
  for (let i = 0; i < 3; i++) createNativeActorRectangle(item, bounds, 0, false);
  assert.equal(createNativeActorRectangle(item, bounds, 3, true), null);
  assert.equal(createNativeActorCircle(item, { x: 0, y: 0, radius: 1 }, 3, true), null);
  assert.equal(item.bodies.length, 5);
});

test('bodies created after actor insertion start at the placement snapshot and register immediately', () => {
  const item = actor(), scene = createNativeBodyRegistry();
  item.bodyWorld = scene;
  const following = createNativeActorRectangle(item, bounds, 3, true);
  const independent = createNativeActorRectangle(item, bounds, 0, false);
  assert.deepEqual(following.position, item.spawnPosition);
  assert.deepEqual(following.previousPosition, item.spawnPosition);
  assert.deepEqual(independent.position, { x: 0, y: 0 });
  assert.deepEqual(scene.bodies, [following, independent]);
  assert.deepEqual(item.position, { x: 20, y: 20 });
  assert.equal(following.flags & 0x40, 0);
});

test('replicated IDs start at 0x7fff, preserve explicit IDs and reuse gaps without advancing normal counter', () => {
  const item = actor(), scene = createNativeBodyRegistry();
  item.replication = { assignBodyIds: true };
  const a = createNativeActorRectangle(item, bounds, 3, true);
  const b = createNativeActorRectangle(item, bounds, 3, true);
  const explicit = createNativeActorRectangle(item, bounds, 3, false);
  explicit.id = 600;
  registerNativeActorBodies(item, scene);
  assert.deepEqual([a.id, b.id, explicit.id], [0x7fff, 0x8000, 600]);
  assert.ok(a.flags & 0x20);
  assert.equal(scene.bodyIdCounter, 0);
  detachNativeBody(a);
  assert.equal(nextNativeReplicatedBodyId(scene), 0x7fff);
  const ordinary = createNativeBody();
  attachNativeBody(scene, ordinary);
  assert.equal(ordinary.id, 1);
  assert.equal(nextNativeReplicatedBodyId(scene), 0x7fff, 'querying a replicated ID does not reserve it');
});

test('replication metadata sets flag 0x20 even when special ID assignment is disabled', () => {
  const item = actor(), scene = createNativeBodyRegistry();
  item.replication = { assignBodyIds: false };
  item.bodyWorld = scene;
  const body = createNativeActorRectangle(item, bounds, 3, true);
  assert.equal(body.id, 1);
  assert.ok(body.flags & 0x20);
});

test('low-level attachment preserves side effects even after five records are stored', () => {
  const item = actor(), scene = createNativeBodyRegistry();
  item.bodyWorld = scene;
  for (let i = 0; i < 5; i++) createNativeActorRectangle(item, bounds, 0, false);
  const extra = createNativeBody();
  extra.category = 12;
  addNativeActorBody(item, extra, false);
  assert.equal(extra.category, 0);
  assert.equal(extra.world, scene);
  assert.equal(scene.bodies.length, 6);
  assert.equal(item.bodies.length, 5);
  unregisterNativeActorBodies(item);
  assert.deepEqual(scene.bodies, [extra], 'unrecorded low-level attachment is not in the detach walk');
});

test('position correction orders actor hook before component display refresh and leaves sibling bodies untouched', () => {
  const item = actor(), events = [];
  const body = createNativeActorRectangle(item, bounds, 3, true);
  const sibling = createNativeActorRectangle(item, bounds, 0, true);
  item.renderOffset = { x: 4, y: 5 };
  item.cameraRelative = true;
  item.scene = { viewPosition: { x: 2, y: 3 }, viewOffset: { x: 1, y: 2 } };
  item.onPositionResolved = (position, delta) => {
    events.push(['actor', { ...item.position }, { ...delta }]);
    item.position.x += 10;
  };
  item.components.push({ syncPositions: (position, display) => events.push(['component', { ...position }, display]) });
  body.onPositionResolved({ x: 30, y: 40 }, { x: -2, y: 0 });
  assert.deepEqual(events, [['actor', { x: 30, y: 40 }, { x: -2, y: 0 }],
    ['component', { x: 30, y: 40 }, { x: 41, y: 40 }]]);
  assert.deepEqual(sibling.position, { x: 0, y: 0 });
  item.cameraRelative = false;
  assert.deepEqual(nativeActorDisplayPosition(item), { x: 44, y: 45 });
});

test('native actor attachment runs through movement, map correction and ordered detach notification', () => {
  const item = actor(), scene = createNativeBodyRegistry(), events = [];
  const body = createNativeActorRectangle(item, bounds, 3, true);
  placeNativeActorBodies(item, { x: 25, y: 28 });
  registerNativeActorBodies(item, scene);
  scene.map = { width: 6, height: 6, chipSize: 10, table: Array(36).fill(1), customFlags: [] };
  for (let x = 0; x < 6; x++) scene.map.table[18 + x] = 2;
  item.components.push({ syncPositions: () => events.push('component'), onRemoved: () => {
    assert.equal(body.world, null);
    events.push('removed');
  } });
  item.onPositionResolved = () => events.push('actor');
  body.onContactStay = () => events.push('contact');
  item.velocity.y = 3;
  advanceNativeActorMotion(item);
  stepNativeBodyWorld(scene);
  assert.equal(item.position.y, Math.fround(29.99));
  assert.deepEqual(events, ['actor', 'component', 'contact']);
  unregisterNativeActorBodies(item);
  assert.deepEqual(events, ['actor', 'component', 'contact', 'removed']);
  assert.equal(scene.bodies.length, 0);
  assert.equal(item.bodies.length, 1, 'detachment keeps actor-owned records');
});
