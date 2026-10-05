import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNativeCirclePair } from './native-circle-pair.mjs';
import { nativeBodiesOverlap, nativeCircleCenter } from './native-body-overlap.mjs';
import { solveNativeBodyPairs } from './native-body-world.mjs';
import { finalizeNativeActorContacts } from './native-body-contacts.mjs';

const f = Math.fround;
const circle = (id, x, previousX = x, radius = 5) => ({ id, shape: 1, circleRadius: radius,
  flags: x === previousX ? 1 : 0x41, type: 3, category: 5,
  position: { x, y: 0 }, previousPosition: { x: previousX, y: 0 },
  localBounds: { x: -radius, y: -radius, width: radius * 2, height: radius * 2 }, contacts: [] });

test('circle pair rewinds opposing trajectories with .001 extra separation per moving body', () => {
  const a = circle(1, 6, 0), b = circle(2, 12, 14);
  const result = resolveNativeCirclePair(a, b);
  assert.equal(result.status, 'resolved');
  assert.equal(result.positionA.x, f(6 - f(3 + f(.001))));
  assert.equal(result.positionB.x, f(12 - f(-1 - f(.001))));
  assert.equal(result.contactsA[0].x, 1);
  assert.equal(result.contactsB[0].x, -1);
  assert.ok(result.positionB.x - result.positionA.x > 10);
  const reversed = resolveNativeCirclePair(b, a);
  assert.deepEqual(reversed.positionA, result.positionB);
  assert.deepEqual(reversed.positionB, result.positionA);
});

test('overtaking rewinds the approaching trajectory and leaves the other circle on its current path', () => {
  const result = resolveNativeCirclePair(circle(1, 6, 0), circle(2, 15, 14));
  assert.equal(result.positionA.x, f(6 - f(1 + f(.001))));
  assert.equal(result.positionB.x, 15);
});

test('stationary circles stay fixed and full rollback is capped at the accepted position', () => {
  const result = resolveNativeCirclePair(circle(1, 4, 0), circle(2, 12));
  assert.equal(result.positionA.x, f(4 - f(2 + f(.001))));
  assert.equal(result.positionB.x, 12);
  const coincident = resolveNativeCirclePair(circle(1, 5, 0), circle(2, 5, 10));
  assert.deepEqual(coincident.positionA, { x: 0, y: 0 });
  assert.deepEqual(coincident.positionB, { x: 10, y: 0 });
});

test('glancing circle contact keeps the native trajectory and creates a radial contact normal', () => {
  const a = circle(1, 6, 0), b = circle(2, 12, 14);
  a.position.y = 2;
  const result = resolveNativeCirclePair(a, b);
  const dx = result.positionB.x - result.positionA.x, dy = result.positionB.y - result.positionA.y;
  assert.ok(Math.hypot(dx, dy) >= 10);
  assert.ok(result.positionA.y > 0 && result.positionA.y < 2);
  assert.ok(Math.abs(result.positionA.x / 3 - result.positionA.y) < .000001);
  assert.ok(result.contactsA[0].x > 0 && result.contactsA[0].y < 0);
  assert.ok(Math.abs(Math.hypot(result.contactsA[0].x, result.contactsA[0].y) - 1) < .000001);
});

test('circle overlap preserves native scale asymmetry, offsets and strict tangency', () => {
  const a = circle(1, 0), b = circle(2, 10);
  assert.equal(nativeBodiesOverlap(a, b), false);
  assert.equal(nativeBodiesOverlap(a, b, { offsetA: { x: .01, y: 0 } }), true);
  a.scale = { x: 2, y: 1 };
  b.position.x = b.previousPosition.x = 12;
  assert.equal(nativeBodiesOverlap(a, b), false);
  assert.equal(nativeBodiesOverlap(a, b, { previous: true }), true);
  a.position = { x: 3, y: 4 };
  assert.deepEqual(nativeCircleCenter(a), { x: 6, y: 4 });
  a.flags = 0;
  assert.equal(nativeBodiesOverlap(a, b), false);
  assert.equal(nativeBodiesOverlap(a, b, { ignoreEnabled: true }), true);
});

test('mixed shapes use strict AABB overlap, including corners outside the circle radius', () => {
  const a = circle(1, 0), b = { ...circle(2, 4.5), shape: 0,
    position: { x: 4.5, y: 4.5 }, localBounds: { x: 0, y: 0, width: 2, height: 2 } };
  assert.equal(nativeBodiesOverlap(a, b), true);
  b.position.x = 5;
  assert.equal(nativeBodiesOverlap(a, b), false);
});

test('registered solver dispatches circle response even with one priority body, then maintains contact', () => {
  const a = circle(1, 6, 0), b = circle(2, 12, 14);
  a.flags |= 2;
  const collisionMatrix = new Uint8Array(1024); collisionMatrix[5 * 32 + 5] = 1;
  const world = { bodies: [a, b], collisionMatrix }, events = [];
  solveNativeBodyPairs(world);
  assert.ok(a.position.x < 6, 'circle response does not invoke rectangle priority displacement');
  assert.equal(a.contacts[0].bodyId, 2);
  a.onContactBegin = () => events.push('begin'); a.onContactStay = () => events.push('stay');
  finalizeNativeActorContacts(world, a);
  assert.deepEqual(events, ['begin', 'stay']);
});
