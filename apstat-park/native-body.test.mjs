import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeBody, initializeNativeRectangleBody, initializeNativeCircleBody } from './native-body.mjs';
import { advanceNativeActorMotion, placeNativeActorBodies, syncNativeActorBodies } from './native-actor-motion.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { stepNativeBodyWorld } from './native-body-pass.mjs';
import { applyNativeBodyScale } from './native-body-scale.mjs';

const f = Math.fround;
const bounds = { x: -5, y: -10, width: 10, height: 10 };
const rectangle = () => initializeNativeRectangleBody(createNativeBody(), bounds, 3);
const actor = bodies => ({ position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
  acceleration: { x: 0, y: 0 }, bodies });

test('native body construction starts disabled, with independent scale/position snapshots', () => {
  const a = createNativeBody(), b = createNativeBody();
  assert.equal(a.flags, 0);
  assert.equal(a.contactCapacity, 0);
  assert.equal(a.contactsGrow, false);
  a.position.x = 20;
  a.scale.y = 2;
  a.contacts.push({ bodyId: 20 });
  assert.deepEqual(a.previousPosition, { x: 0, y: 0 });
  assert.deepEqual(a.passPosition, { x: 0, y: 0 });
  assert.deepEqual(a.acceptedScale, { x: 1, y: 1 });
  assert.deepEqual(a.requestedScale, { x: 1, y: 1 });
  assert.deepEqual(b.contacts, []);
});

test('shape initialization preserves body identity and contacts while enabling scaled geometry', () => {
  const body = createNativeBody();
  body.id = 17;
  body.flags = 0x50;
  body.scale = { x: 2, y: 3 };
  body.pivot = { x: 1, y: 2 };
  body.position = { x: 90, y: 40 };
  body.contacts.push({ bodyId: 5 });
  initializeNativeRectangleBody(body, bounds, 3);
  assert.deepEqual(body.localBounds, { x: -11, y: -34, width: 20, height: 30 });
  assert.equal(body.flags, 0x51);
  assert.equal(body.id, 17);
  assert.equal(body.contactCapacity, 8);
  assert.equal(body.contactsGrow, true);
  assert.deepEqual(body.contacts, [{ bodyId: 5 }]);
  assert.deepEqual(body.position, { x: 90, y: 40 });
  body.contactCapacity = 20;
  initializeNativeCircleBody(body, { x: 4, y: 6, radius: 3 }, 1);
  assert.equal(body.shape, 1);
  assert.deepEqual(body.rawBounds, { x: 1, y: 3, width: 6, height: 6 });
  assert.deepEqual(body.localBounds, { x: 1, y: 5, width: 12, height: 18 });
  assert.equal(body.contactCapacity, 20);
  initializeNativeRectangleBody(body, bounds, 0);
  assert.deepEqual(body.circleCenter, { x: 4, y: 6 });
  assert.equal(body.circleRadius, 3, 'rectangle setup leaves the inactive descriptor intact');
});

test('actor placement resets following body sweeps but does not move independent sensors', () => {
  const following = rectangle(), sensor = rectangle();
  following.flags |= 0x40;
  const item = actor([{ body: following, followsActor: true }, { body: sensor, followsActor: false }]);
  placeNativeActorBodies(item, { x: 80, y: 40 });
  assert.deepEqual(following.position, { x: 80, y: 40 });
  assert.deepEqual(following.previousPosition, following.position);
  assert.deepEqual(following.passPosition, { x: 0, y: 0 });
  assert.equal(following.flags & 0x40, 0);
  assert.deepEqual(sensor.position, { x: 0, y: 0 });
});

test('actor motion uses half acceleration for displacement and full acceleration for velocity', () => {
  const body = rectangle(), item = actor([{ body, followsActor: true }]);
  placeNativeActorBodies(item, { x: 30, y: 20 });
  item.velocity = { x: 3, y: -2 };
  item.acceleration = { x: 0, y: f(.65) };
  advanceNativeActorMotion(item);
  assert.deepEqual(item.position, { x: 33, y: f(20 + f(-2 + f(f(.65) * .5))) });
  assert.deepEqual(item.velocity, { x: 3, y: f(-2 + f(.65)) });
  assert.deepEqual(body.position, item.position);
  assert.deepEqual(body.previousPosition, { x: 30, y: 20 });
  assert.ok(body.flags & 0x40);
});

test('following-body movement bit compares accepted position with float32 epsilon', () => {
  const body = rectangle(), item = actor([{ body, followsActor: true }]);
  for (const [x, moved] of [[2 ** -23, false], [2 ** -22, true], [0, false]]) {
    item.position.x = x;
    syncNativeActorBodies(item);
    assert.equal(Boolean(body.flags & 0x40), moved);
    assert.equal(body.position.x, x, 'even sub-threshold positions are copied');
  }
});

test('constructed actor runs map resolution and publishes solver correction before its contact callback', () => {
  const scene = createNativeBodyRegistry(), body = rectangle(), events = [];
  const item = actor([{ body, followsActor: true }]);
  placeNativeActorBodies(item, { x: 25, y: 28 });
  scene.map = { width: 6, height: 6, chipSize: 10, table: Array(36).fill(1), customFlags: [] };
  for (let x = 0; x < 6; x++) scene.map.table[3 * 6 + x] = 2;
  attachNativeBody(scene, body);
  body.onPositionResolved = (position, delta) => {
    item.position = { ...position };
    events.push(['correct', delta.y]);
  };
  body.onContactBegin = (_other, normal, kind) => events.push(['begin', normal.y, kind]);
  body.onContactStay = (_other, normal) => {
    events.push(['stay', normal.y]);
    item.velocity.y = 0;
  };
  item.velocity.y = 3;
  advanceNativeActorMotion(item);
  stepNativeBodyWorld(scene);
  assert.equal(item.position.y, f(30 - f(.01)));
  assert.deepEqual(events.map(event => event[0]), ['correct', 'begin', 'stay']);
  assert.equal(item.velocity.y, 0);
  assert.deepEqual(body.previousPosition, item.position);
  syncNativeActorBodies(item);
  assert.equal(body.flags & 0x40, 0);
  item.position.x += 2; // Actor POST may move again after the accepted world pass.
  syncNativeActorBodies(item);
  assert.ok(body.flags & 0x40);
  assert.equal(body.previousPosition.x, 25);
});

test('constructed circle supports common scale finalization without handwritten fixture fields', () => {
  const scene = createNativeBodyRegistry();
  const body = initializeNativeCircleBody(createNativeBody(), { x: 0, y: 0, radius: 12 }, 3);
  attachNativeBody(scene, body);
  applyNativeBodyScale(body, { x: .5, y: .5 });
  stepNativeBodyWorld(scene);
  assert.deepEqual(body.acceptedScale, { x: .5, y: .5 });
  assert.deepEqual(body.localBounds, { x: -6, y: -6, width: 12, height: 12 });
});
