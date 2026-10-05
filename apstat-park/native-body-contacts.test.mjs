import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeNativeActorContacts, dispatchNativeOverlapCallbacks } from './native-body-contacts.mjs';

const body = (id, x) => ({ id, flags: 1, type: 0, category: 1, shape: 0,
  position: { x, y: 0 }, localBounds: { x: 0, y: 0, width: 10, height: 10 }, contacts: [] });
const contact = (bodyId, state = 0) => ({ bodyId, state, normal: { x: 1, y: 0 } });

test('new contact emits BEGIN then STAY, persists within .5, and emits END at the strict probe boundary', () => {
  const a = body(1, 0), b = body(2, 10.01), events = [];
  a.contacts.push(contact(2));
  for (const [callback, name] of [['onContactBegin', 'begin'], ['onContactStay', 'stay'], ['onContactEnd', 'end']]) {
    a[callback] = (other, normal, kind) => events.push([name, other.id, { ...normal }, kind]);
  }
  const world = { bodies: [a, b] };
  finalizeNativeActorContacts(world, a);
  assert.equal(a.contacts[0].state, 1);
  b.position.x = 10.49;
  finalizeNativeActorContacts(world, a);
  b.position.x = 10.5;
  finalizeNativeActorContacts(world, a);
  assert.deepEqual(events.map(event => event[0]), ['begin', 'stay', 'stay', 'end']);
  assert.ok(events.every(event => event[1] === 2 && event[2].x === 1 && event[3] === 1));
  assert.equal(a.contacts.length, 0);
});

test('unaccepted contacts and missing registry bodies disappear without END', () => {
  const a = body(1, 0), b = body(2, 20), events = [];
  a.contacts = [contact(2), contact(3, 1)];
  a.onContactEnd = () => events.push('end');
  finalizeNativeActorContacts({ bodies: [a, b] }, a);
  assert.deepEqual(events, []);
  assert.deepEqual(a.contacts, []);
});

test('disabling in BEGIN still emits STAY once, then END on the next refresh', () => {
  const a = body(1, 0), b = body(2, 10), events = [];
  a.contacts.push(contact(2));
  a.onContactBegin = () => { events.push('begin'); a.flags = 0; };
  a.onContactStay = () => events.push('stay');
  a.onContactEnd = () => events.push('end');
  const world = { bodies: [a, b] };
  finalizeNativeActorContacts(world, a);
  finalizeNativeActorContacts(world, a);
  assert.deepEqual(events, ['begin', 'stay', 'end']);
});

test('Player contact refresh invokes the required upward-probe handler first', () => {
  const a = body(1, 0), b = body(2, 10), events = [];
  a.flags |= 4;
  assert.throws(() => finalizeNativeActorContacts({ bodies: [a, b] }, a), /upward contact probe/);
  a.onContactBegin = () => events.push('begin');
  finalizeNativeActorContacts({ bodies: [a, b], refreshUpContacts: item => {
    events.push('probe'); item.contacts.push(contact(2));
  } }, a);
  assert.deepEqual(events, ['probe', 'begin']);
});

test('overlap callbacks use registered pair order and retain the accepted reciprocal callback', () => {
  const a = body(1, 0), b = body(2, 1), c = body(3, 2), events = [];
  const collisionMatrix = new Uint8Array(1024); collisionMatrix[33] = 1;
  a.onOverlap = other => { events.push([a.id, other.id]); if (other === b) b.flags = 0; };
  b.onOverlap = other => events.push([b.id, other.id]);
  c.onOverlap = other => events.push([c.id, other.id]);
  dispatchNativeOverlapCallbacks({ bodies: [a, b, c], collisionMatrix });
  assert.deepEqual(events, [[1, 2], [2, 1], [1, 3], [3, 1]]);
});

test('overlap sensors honor category direction and exact-edge exclusion without requiring physical type', () => {
  const a = body(1, 0), b = body(2, 10), events = [];
  b.category = 2;
  a.onOverlap = other => events.push(other.id);
  const world = { bodies: [a, b], collisionMatrix: new Uint8Array(1024) };
  world.collisionMatrix[1 * 32 + 2] = 1;
  dispatchNativeOverlapCallbacks(world);
  assert.deepEqual(events, []);
  b.position.x = 9;
  dispatchNativeOverlapCallbacks(world);
  assert.deepEqual(events, [2]);
  world.bodies.reverse();
  dispatchNativeOverlapCallbacks(world);
  assert.deepEqual(events, [2], 'matrix is read in registered pair order');
});
