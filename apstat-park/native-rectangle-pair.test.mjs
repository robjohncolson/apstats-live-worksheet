import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNativeRectanglePair } from './native-rectangle-pair.mjs';

const f = Math.fround;
const body = (x, y, previousX = x, previousY = y, width = 10, height = 10) => ({
  position: { x, y }, previousPosition: { x: previousX, y: previousY },
  localBounds: { x: 0, y: 0, width, height },
});

test('native rectangle contact rewinds the moving body with a .01 gap on all four sides', () => {
  const stationary = body(10, 10);
  const fixtures = [
    [body(2, 10, -2, 10), { x: f(-.01), y: 10 }, { x: 1, y: 0 }],
    [body(18, 10, 22, 10), { x: f(20.01), y: 10 }, { x: -1, y: 0 }],
    [body(10, 2, 10, -2), { x: 10, y: f(-.01) }, { x: 0, y: 1 }],
    [body(10, 18, 10, 22), { x: 10, y: f(20.01) }, { x: 0, y: -1 }],
  ];
  for (const [moving, expected, normal] of fixtures) {
    const result = resolveNativeRectanglePair(moving, stationary);
    assert.equal(result.status, 'resolved');
    assert.deepEqual(result.positionA, expected);
    assert.deepEqual(result.positionB, stationary.position);
    assert.deepEqual(result.contactsA, [normal]);
    const reverse = resolveNativeRectanglePair(stationary, moving);
    assert.deepEqual(reverse.positionB, expected);
    assert.deepEqual(reverse.positionA, stationary.position);
    assert.deepEqual(reverse.contactsB, [normal]);
  }
});

test('previous exact-edge support clamps the gap instead of lifting a resting player', () => {
  const result = resolveNativeRectanglePair(body(10, 1, 10, 0), body(10, 10));
  assert.equal(result.positionA.y, 0);
  assert.deepEqual(result.contactsA, [{ x: 0, y: 1 }]);
});

test('opposing movers roll back their trajectories, without equal penetration splitting', () => {
  // A travels six units and B travels two; their original gap was four.
  // Collision occurs halfway through the frame, so A rewinds 3 and B 1.
  const result = resolveNativeRectanglePair(body(6, 0, 0, 0), body(12, 0, 14, 0));
  assert.equal(result.positionA.x, f(2.99));
  assert.equal(result.positionB.x, 13);
  assert.deepEqual(result.contactsA, [{ x: 1, y: 0 }]);
});

test('same-direction overtaking rewinds only the faster trajectory', () => {
  const result = resolveNativeRectanglePair(body(6, 0, 0, 0), body(15, 0, 14, 0));
  assert.equal(result.positionA.x, f(4.99));
  assert.equal(result.positionB.x, 15);
  const leftward = resolveNativeRectanglePair(body(14, 0, 20, 0), body(5, 0, 6, 0));
  assert.equal(leftward.positionA.x, f(15.01));
  assert.equal(leftward.positionB.x, 5);
});

test('diagonal first contact records X before Y and keeps native tangent acceptance', () => {
  const result = resolveNativeRectanglePair(body(2, 2, -2, -2), body(10, 10));
  assert.deepEqual(result.positionA, { x: f(-.01), y: f(-.01) });
  assert.deepEqual(result.contactsA, [{ x: 1, y: 0 }]);
  assert.equal(result.contactsB.length, 1);
});

test('pair eligibility preserves separated, pre-overlapping and recursive-priority bodies', () => {
  assert.equal(resolveNativeRectanglePair(body(0, 0), body(10, 0)).status, 'separate');
  const alreadyOverlapping = resolveNativeRectanglePair(body(2, 0, 1, 0), body(10, 0));
  assert.equal(alreadyOverlapping.status, 'previous-overlap');
  assert.deepEqual(alreadyOverlapping.positionA, { x: 2, y: 0 });
  const priority = { ...body(10, 0), flags: 3 };
  assert.equal(resolveNativeRectanglePair(body(2, 0, -2, 0), priority).status, 'recursive-required');
  assert.equal(resolveNativeRectanglePair(body(2, 0, -2, 0), { ...priority, flags: 11 }).status, 'resolved');
});

test('actor anchors remain independent from world bounds', () => {
  const player = { position: { x: 26, y: 149 }, previousPosition: { x: 26, y: 140 },
    localBounds: { x: -16, y: -47, width: 32, height: 46 } };
  const floor = body(0, 144, 0, 144, 100, 32);
  const result = resolveNativeRectanglePair(player, floor);
  assert.equal(result.positionA.y, f(144.99));
  assert.equal(result.positionA.x, 26);
  assert.deepEqual(result.positionB, floor.position);
});

test('a diagonal trajectory rejects an axis whose first-contact intervals do not overlap', () => {
  const result = resolveNativeRectanglePair(body(2, 8, -2, -12), body(10, 10));
  assert.deepEqual(result.positionA, { x: 2, y: f(-.01) });
  assert.deepEqual(result.contactsA, [{ x: 0, y: 1 }]);
});

test('a trajectory that passed completely through is outside the native final-overlap pair pass', () => {
  const result = resolveNativeRectanglePair(body(40, 0, 0, 0), body(20, 0));
  assert.equal(result.status, 'separate');
  assert.deepEqual(result.positionA, { x: 40, y: 0 });
});
