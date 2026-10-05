import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeBodyRegistry, attachNativeBody, detachNativeBody,
  insertNativeBody, removeNativeBody, clearNativeBodyContacts, findNativeBody } from './native-body-registry.mjs';
import { finalizeNativeActorContacts, dispatchNativeOverlapCallbacks } from './native-body-contacts.mjs';

const body = (priority = 0, id = 0) => ({ id, priority, flags: 1, category: 0,
  shape: 0, type: 0, position: { x: 0, y: 0 },
  localBounds: { x: 0, y: 0, width: 10, height: 10 }, contacts: [], world: null });
const contact = (other, state = 1) => ({ bodyId: other.id, state, normal: { x: 1, y: 0 } });

test('native registry orders signed priorities descending and equal priorities by attachment time', () => {
  const scene = createNativeBodyRegistry();
  const a = body(), b = body(7), c = body(), d = body(0xffffffff), e = body(7);
  for (const item of [a, b, c, d, e]) attachNativeBody(scene, item);
  assert.deepEqual(scene.bodies, [b, e, a, c, d]);
  assert.deepEqual([a.id, b.id, c.id, d.id, e.id], [1, 2, 3, 4, 5]);
  detachNativeBody(a);
  attachNativeBody(scene, a);
  assert.deepEqual(scene.bodies, [b, e, c, a, d]);
  assert.equal(a.id, 1);
  assert.equal(scene.bodyCount, 5);
  assert.equal(scene.collisionMatrix.reduce((sum, value) => sum + value), 1);
});

test('sensor callbacks follow stable registration order rather than actor IDs', () => {
  const scene = createNativeBodyRegistry(), events = [];
  const sensor = body(1, 90), first = body(0, 20), second = body(0, 10);
  sensor.onOverlap = other => events.push(other.id);
  for (const item of [second, sensor, first]) attachNativeBody(scene, item);
  dispatchNativeOverlapCallbacks(scene);
  assert.deepEqual(events, [10, 20]);
  detachNativeBody(second);
  attachNativeBody(scene, second);
  events.length = 0;
  dispatchNativeOverlapCallbacks(scene);
  assert.deepEqual(events, [20, 10]);
});

test('ID insertion does not replace an explicit ID when the automatic counter collides', () => {
  const scene = createNativeBodyRegistry(), explicit = body(0, 1), automatic = body();
  attachNativeBody(scene, explicit);
  attachNativeBody(scene, automatic);
  assert.equal(automatic.id, 1);
  assert.equal(findNativeBody(scene, 1), explicit);
  assert.equal(scene.bodyCount, 2);
  detachNativeBody(automatic);
  assert.deepEqual(scene.bodies, [explicit]);
  assert.equal(findNativeBody(scene, 1), undefined, 'removal erases the dictionary key, not a matching pointer');
});

test('native dictionary capacity can leave registered bodies unavailable to contact lookup', () => {
  const scene = createNativeBodyRegistry();
  for (let index = 0; index < 129; index++) attachNativeBody(scene, body());
  assert.equal(scene.bodyCount, 129);
  assert.equal(scene.bodiesById.size, 128);
  const a = scene.bodies[0], missing = scene.bodies[128];
  a.contacts.push(contact(missing));
  a.onContactEnd = () => assert.fail('missing ID must not emit END');
  finalizeNativeActorContacts(scene, a);
  assert.deepEqual(a.contacts, []);
});

test('attachment and removal wrappers preserve native ownership sequencing', () => {
  const scene = createNativeBodyRegistry(), a = body(0, 5), duplicate = body(0, 5);
  assert.equal(insertNativeBody(scene, a), true);
  assert.equal(a.world, null);
  assert.equal(removeNativeBody(scene, a), false);
  a.world = scene;
  assert.equal(attachNativeBody(scene, a), false);
  assert.equal(attachNativeBody(scene, duplicate), true);
  assert.equal(duplicate.world, scene);
  assert.deepEqual(scene.bodies, [a]);
  assert.throws(() => detachNativeBody(duplicate), /no registered list entry/);
  assert.equal(detachNativeBody(a), true);
  assert.equal(detachNativeBody(a), false);
});

test('attached contact cleanup notifies accepted neighbors only, retaining pending map normals', () => {
  const scene = createNativeBodyRegistry(), a = body(), b = body(), c = body(), events = [];
  for (const item of [a, b, c]) attachNativeBody(scene, item);
  a.contacts.push(contact(b), contact(c));
  b.contacts.push(contact(a));
  c.contacts.push(contact(a, 0));
  a.onContactEnd = () => assert.fail('no own END');
  b.onContactEnd = (other, normal, kind) => events.push([other.id, normal.x, kind]);
  c.onContactEnd = () => assert.fail('unaccepted reciprocal contact');
  a.mapContacts = [{ x: 0, y: 1 }];
  a.pendingMapContacts = [{ x: 1, y: 0 }];
  a.contactMap = {};
  clearNativeBodyContacts(a);
  assert.deepEqual(events, [[a.id, 1, 1]]);
  assert.deepEqual([a.contacts, b.contacts, c.contacts, a.mapContacts], [[], [], [], []]);
  assert.deepEqual(a.pendingMapContacts, [{ x: 1, y: 0 }]);
  assert.equal(a.contactMap, null);
});

test('detach leaves reciprocal contacts for silent removal during neighbor finalization', () => {
  const scene = createNativeBodyRegistry(), a = body(), b = body();
  attachNativeBody(scene, a);
  attachNativeBody(scene, b);
  a.contacts.push(contact(b));
  b.contacts.push(contact(a));
  b.onContactEnd = () => assert.fail('detach must not manufacture END');
  detachNativeBody(a);
  assert.equal(b.contacts.length, 1);
  finalizeNativeActorContacts(scene, b);
  assert.deepEqual(b.contacts, []);
});
