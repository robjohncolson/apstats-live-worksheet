import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNativeBodyScale, moveNativeBodyAgainstBody, resolveNativeScaleChange } from './native-body-scale.mjs';
import { stepNativeBodyWorld, finalizeNativeBody } from './native-body-pass.mjs';

const f = Math.fround;
const body = (id, x = 30, y = 30) => ({ id, flags: 1, type: 3, shape: 0, category: 1,
  position: { x, y }, previousPosition: { x, y }, passPosition: { x, y },
  rawBounds: { x: 0, y: 0, width: 10, height: 10 }, localBounds: { x: 0, y: 0, width: 10, height: 10 },
  scale: { x: 1, y: 1 }, acceptedScale: { x: 1, y: 1 }, requestedScale: { x: 1, y: 1 }, contacts: [] });
const world = bodies => {
  const collisionMatrix = new Uint8Array(1024); collisionMatrix[33] = 1;
  return { bodies, collisionMatrix, map: { width: 20, height: 20, chipSize: 10, table: Array(400).fill(1), customFlags: [] } };
};

test('rectangle displacement probes stop against faces without moving the obstacle', () => {
  for (const [x, y, dx, dy, expectedX, expectedY] of [
    [30, 40, 8, 0, f(34.99), 40], [60, 40, -8, 0, f(55.01), 40],
    [45, 25, 0, 8, 45, f(29.99)], [45, 55, 0, -8, 45, f(50.01)],
  ]) {
    const a = body(1, x, y), obstacle = body(2, 45, 40);
    moveNativeBodyAgainstBody(a, obstacle, { x: dx, y: dy });
    assert.deepEqual(a.position, { x: expectedX, y: expectedY });
    assert.deepEqual(obstacle.position, { x: 45, y: 40 });
  }
});

test('unobstructed rectangle growth applies desired scale and restores the actor position after four probes', () => {
  const a = body(1), scene = world([a]);
  a.requestedScale = { x: 2, y: 2 };
  resolveNativeScaleChange(scene, a);
  assert.deepEqual(a.scale, { x: 2, y: 2 });
  assert.deepEqual(a.position, { x: 30, y: 30 });
  assert.deepEqual(a.localBounds, { x: 0, y: 0, width: 20, height: 20 });
});

test('growth is limited by map corners with the native .02 scale backoff', () => {
  const a = body(1), scene = world([a]);
  for (let row = 0; row < 20; row++) scene.map.table[row * 20 + 5] = 2;
  a.requestedScale = { x: 2, y: 2 };
  resolveNativeScaleChange(scene, a);
  const ratio = f(f(10 - f(.01)) / 10);
  const expected = f(f(1 + ratio) - f(.02));
  assert.deepEqual(a.scale, { x: expected, y: expected });
  assert.deepEqual(a.position, { x: 30, y: 30 });
  assert.deepEqual(a.pendingMapContacts, [{ x: 1, y: 0 }]);
});

test('growth respects other rectangles and keeps the original registered-body scale rules', () => {
  const a = body(1), obstacle = body(2, 45, 30), scene = world([a, obstacle]);
  a.requestedScale = { x: 2, y: 2 };
  resolveNativeScaleChange(scene, a);
  // The actor probe returns resolved actor X minus its start, not a direct
  // penetration delta: round 35-.01 first, then subtract the original 30.
  const expected = 1.479000210762024;
  assert.deepEqual(a.scale, { x: expected, y: expected });
  const growing = body(3), distantCircle = { ...body(4, 150, 150), shape: 1, circleRadius: 5, category: 31 };
  growing.requestedScale = { x: 2, y: 2 };
  resolveNativeScaleChange(world([growing, distantCircle]), growing);
  assert.deepEqual(growing.scale, { x: 1, y: 1 }, 'native exits for a physical non-rectangle before category or distance checks');
});

test('both-axis shrink bypasses growth probes; tiny changes and growing circles retain old scale', () => {
  const a = { ...body(1), shape: 1, circleRadius: 5 };
  a.requestedScale = { x: .5, y: .75 };
  resolveNativeScaleChange({ bodies: [a] }, a);
  assert.deepEqual(a.scale, { x: .5, y: .75 });
  const b = body(2); b.requestedScale = { x: f(1.0005), y: 1 };
  resolveNativeScaleChange({ bodies: [b] }, b);
  assert.deepEqual(b.scale, { x: 1, y: 1 });
  const c = { ...body(3), shape: 1, circleRadius: 5 }; c.requestedScale = { x: 2, y: 2 };
  resolveNativeScaleChange({ bodies: [c] }, c);
  assert.deepEqual(c.scale, { x: 1, y: 1 });
});

test('full world pass resolves pairs before transform/contact callbacks and runs overlap callbacks last', () => {
  const a = body(1, 6, 0), b = body(2, 12, 0), sensor = body(3, 0, 0);
  a.previousPosition.x = 0; b.previousPosition.x = 14; a.flags |= 0x40; b.flags |= 0x40;
  sensor.type = 0; sensor.localBounds.width = 100;
  const scene = world([a, b, sensor]), events = [], corrections = [];
  scene.afterPairs = () => events.push('pairs');
  for (const item of [a, b]) {
    item.onPositionResolved = (_position, delta) => { events.push('position' + item.id); corrections.push({ ...delta }); };
    item.onContactBegin = () => events.push('begin' + item.id);
    item.onContactStay = () => events.push('stay' + item.id);
  }
  for (const item of scene.bodies) item.onOverlap = other => events.push('overlap' + item.id + other.id);
  stepNativeBodyWorld(scene);
  assert.deepEqual(events, ['pairs', 'position1', 'begin1', 'stay1', 'position2', 'begin2', 'stay2', 'overlap13', 'overlap31', 'overlap23', 'overlap32']);
  assert.equal(corrections[0].x, f(f(2.99) - 6));
  assert.deepEqual(a.previousPosition, a.position);
  assert.equal(a.flags & 0x40, 0);
});

test('world pass queues only 32 scale changes and reports the unapplied correction', () => {
  const bodies = Array.from({ length: 33 }, (_, i) => {
    const item = body(i + 1, 30, 30); item.type = 0; applyNativeBodyScale(item, { x: 2, y: 2 }); return item;
  });
  const last = bodies[32], corrections = [];
  last.onScaleResolved = (x, y) => corrections.push([x, y]);
  stepNativeBodyWorld(world(bodies));
  assert.ok(bodies.slice(0, 32).every(item => item.scale.x === 2));
  assert.deepEqual(last.scale, { x: 1, y: 1 });
  assert.deepEqual(corrections, [[1, 1]]);
  assert.deepEqual(last.requestedScale, last.scale);
});

test('body finalization uses squared correction threshold and commits before invoking callbacks', () => {
  const a = body(1), scene = world([a]), events = [];
  a.position.x = f(30.0001);
  a.onPositionResolved = () => events.push('position');
  finalizeNativeBody(scene, a);
  assert.deepEqual(events, []);
  assert.equal(a.passPosition.x, 30);
  a.position.x = 31;
  a.onPositionResolved = () => { assert.equal(a.previousPosition.x, 31); a.position.x = 32; };
  finalizeNativeBody(scene, a);
  assert.equal(a.previousPosition.x, 31);
  assert.equal(a.passPosition.x, 32);
});

test('full world pass performs map correction before map BEGIN/STAY callbacks', () => {
  const a = body(1, 30, 45), scene = world([a]), events = [];
  a.previousPosition.y = 30; a.flags |= 0x40;
  for (let column = 0; column < 20; column++) scene.map.table[5 * 20 + column] = 2;
  a.onPositionResolved = () => events.push('position');
  a.onContactBegin = (_other, normal, kind) => { assert.equal(kind, 0); assert.equal(normal.y, 1); events.push('begin'); };
  a.onContactStay = () => events.push('stay');
  stepNativeBodyWorld(scene);
  assert.equal(a.position.y, f(30 + f(10 - f(.01))));
  assert.deepEqual(events, ['position', 'begin', 'stay']);
  assert.deepEqual(a.mapContacts, [{ x: 0, y: 1 }]);
});
