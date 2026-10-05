import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBody } from './native-body.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { prepareNativePlayerWalk } from './native-player-walk.mjs';
import { nativeDirectionalContactResponse } from './native-body-query.mjs';
const f = Math.fround;
function fixture() {
  const events = [], body = createNativeBody(), world = createNativeBodyRegistry();
  attachNativeBody(world, body);
  const options = { body, velocity: { x: 5, y: -2 }, playerFlags: 1,
    clipMovement: speed => { events.push(['clip', speed]); return speed; },
    faceDirection: direction => events.push(['face', direction]),
    setAnimation: state => events.push(['animation', state]) };
  return { options, events, world };
}

test('Right wins simultaneous input and scene clipping runs before walk animation', () => {
  const { options, events } = fixture();
  prepareNativePlayerWalk({ ...options, right: true, left: true });
  assert.deepEqual(options.velocity, { x: 3, y: -2 });
  assert.deepEqual(events, [['face', 1], ['clip', 3], ['animation', 1]]);
});

test('disabled steering retains damped momentum even while input changes facing', () => {
  const { options, events } = fixture();
  prepareNativePlayerWalk({ ...options, playerFlags: 0, left: true });
  assert.equal(options.velocity.x, f(5 * f(.98)));
  assert.deepEqual(events, [['face', -1], ['animation', 1]]);
});

test('contact sets pushing animation but only response bit1 blocks steering', () => {
  for (const responseFlags of [0, 1, 2]) {
    const { options, events, world } = fixture();
    const wall = createNativeBody(); wall.responseFlags = responseFlags; attachNativeBody(world, wall);
    options.body.contacts.push({ bodyId: wall.id, normal: { x: 1, y: 0 } });
    prepareNativePlayerWalk({ ...options, right: true });
    assert.equal(options.velocity.x, responseFlags === 1 ? 0 : 3);
    assert.deepEqual(events.at(-1), ['animation', 3]);
  }
});

test('contact flags combine across resolved bodies while stale IDs retain the hit', () => {
  const { options, world } = fixture();
  for (const flags of [2, 4]) {
    const body = createNativeBody(); body.responseFlags = flags; attachNativeBody(world, body);
    options.body.contacts.push({ bodyId: body.id, normal: { x: -1, y: 0 } });
  }
  assert.deepEqual(nativeDirectionalContactResponse(options.body, { x: -1, y: 0 }), { hit: true, responseFlags: 6 });
  world.bodiesById.clear();
  assert.deepEqual(nativeDirectionalContactResponse(options.body, { x: -1, y: 0 }), { hit: true, responseFlags: 0 });
});

test('input mode5 bypasses clipping; no-input animations preserve airborne and special states', () => {
  const { options, events } = fixture();
  prepareNativePlayerWalk({ ...options, left: true, inputMode: 5, clipMovement: undefined });
  assert.equal(options.velocity.x, -3);
  assert.deepEqual(events, [['face', -1], ['animation', 1]]);
  for (const [animation, inputEnabled, expected] of [[1, true, 0], [3, true, 0], [5, true, 0], [2, true, null], [7, true, null], [0, false, 5], [5, false, null]]) {
    events.length = 0;
    prepareNativePlayerWalk({ ...options, animation, inputEnabled });
    assert.deepEqual(events, expected === null ? [] : [['animation', expected]]);
  }
});
