import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { createNativeActorRectangle } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { nativePushBoxRequiredPlayers, nativePushBoxPathClear, stepNativePushBoxMotion } from './native-push-box-motion.mjs';

const f = Math.fround;
function fixture(playerCount = 2) {
  const world = createNativeBodyRegistry();
  const scene = { players: Array.from({ length: playerCount }, () => ({})) };
  function actor(category = 2, x = 0) {
    const value = { bodies: [], components: [], scene, velocity: { x: 0, y: 0 },
      boxFlags: 0, requiredPercent: 100, requiredOffset: 0, pusherCount: 0,
      externalVelocity: { x: 0, y: 0 }, isNativePushBox: category === 2 };
    value.body = createNativeActorRectangle(value, { x: -10, y: -20, width: 20, height: 20 }, 3, true);
    value.body.category = category;
    attachNativeBody(world, value.body);
    placeNativeActorBodies(value, { x, y: 100 });
    return value;
  }
  function link(a, b, direction) {
    a.body.contacts.push({ bodyId: b.body.id, normal: { x: direction, y: 0 } });
  }
  return { actor, link, scene };
}

test('push thresholds round up float32 percentages of actual players and preserve signed offsets', () => {
  const { actor, scene } = fixture(5);
  const box = actor();
  for (const [percent, expected] of [[30, 2], [50, 3], [100, 5], [150, 8]]) {
    box.requiredPercent = percent;
    assert.equal(nativePushBoxRequiredPlayers(box), expected);
  }
  box.requiredPercent = 100; box.requiredOffset = -6;
  assert.equal(nativePushBoxRequiredPlayers(box), -1);
  scene.players.push({});
  assert.equal(nativePushBoxRequiredPlayers(box), 0);
});

test('push motion prioritizes left pushers, then uses right pushers when the left team is too small', () => {
  const { actor, link } = fixture(2);
  const box = actor(), left = actor(1), right = actor(1);
  link(box, left, -1); link(box, right, 1);
  left.velocity.x = 3; right.velocity.x = -3;
  box.body.mapContacts.push({ x: 0, y: 1 });
  stepNativePushBoxMotion(box);
  assert.equal(box.velocity.x, 0);
  assert.equal(box.pusherCount, 1);
  box.requiredPercent = 50;
  stepNativePushBoxMotion(box);
  assert.equal(box.velocity.x, 1);
  assert.equal(right.position.x, 1);
  assert.equal(right.body.position.x, 1);
  left.velocity.x = 0;
  stepNativePushBoxMotion(box);
  assert.equal(box.velocity.x, -1);
  assert.equal(left.position.x, -1);
  assert.equal(left.body.position.x, -1);
});

test('blocked paths preserve block velocity but suppress carry across a player chain', () => {
  const { actor, link } = fixture(1);
  const box = actor(), pusher = actor(1), rider = actor(1), wallNeighbor = actor(1);
  pusher.velocity.x = 3;
  link(box, pusher, -1); link(box, rider, 1); link(rider, wallNeighbor, 1);
  wallNeighbor.body.mapContacts.push({ x: 1, y: 0 });
  stepNativePushBoxMotion(box);
  assert.equal(box.velocity.x, 1);
  assert.equal(rider.position.x, 0);
  assert.equal(wallNeighbor.position.x, 0);
  wallNeighbor.body.mapContacts.length = 0;
  stepNativePushBoxMotion(box);
  assert.equal(rider.position.x, 1);
  assert.equal(wallNeighbor.position.x, 1);
});

test('neighbor PushBoxes gate propagation using same-direction pushers and update their displayed count', () => {
  const { actor, link } = fixture(2);
  const box = actor(), next = actor(), pusher = actor(1);
  link(box, next, 1); link(next, pusher, 1);
  pusher.velocity.x = -3;
  assert.equal(nativePushBoxPathClear(box, 3), false);
  assert.equal(next.pusherCount, 1);
  next.requiredPercent = 50;
  assert.equal(nativePushBoxPathClear(box, 3), true);
  pusher.body.mapContacts.push({ x: 1, y: 0 });
  assert.equal(nativePushBoxPathClear(box, 3), false);
});

test('external impulses persist in air, are suppressed under ceilings, and clear on landing', () => {
  const { actor } = fixture();
  const box = actor();
  box.externalVelocity = { x: 2, y: -4 }; box.boxFlags = 1;
  stepNativePushBoxMotion(box);
  assert.deepEqual(box.velocity, { x: 2, y: f(f(.65) - 4) });
  assert.equal(box.boxFlags, 0);
  box.body.mapContacts.push({ x: 0, y: -1 });
  stepNativePushBoxMotion(box);
  assert.equal(box.velocity.x, 0);
  assert.equal(box.velocity.y, f(f(f(.65) - 4) + f(.65)));
  box.body.mapContacts = [{ x: 0, y: 1 }];
  stepNativePushBoxMotion(box);
  assert.deepEqual(box.velocity, { x: 2, y: 0 });
  assert.deepEqual(box.externalVelocity, { x: 0, y: 0 });
  box.boxFlags = 1; box.externalVelocity = { x: 2, y: -4 };
  stepNativePushBoxMotion(box);
  assert.deepEqual(box.velocity, { x: 2, y: -4 });
  assert.deepEqual(box.externalVelocity, { x: 2, y: -4 });
});

test('frozen blocks reset counts and notify components once without applying gravity or impulses', () => {
  const { actor } = fixture();
  const box = actor(), observed = [];
  box.components.push({ consumeVelocity: velocity => observed.push({ ...velocity }) });
  box.boxFlags = 3; box.pusherCount = 7; box.velocity = { x: 3, y: 4 };
  box.externalVelocity = { x: 5, y: -6 };
  stepNativePushBoxMotion(box);
  assert.deepEqual(observed, [{ x: 0, y: 0 }]);
  assert.equal(box.pusherCount, 0);
  assert.equal(box.boxFlags, 3);
});

test('zero threshold favors right movement; negative threshold retains native unsigned comparison', () => {
  const { actor } = fixture(1);
  const box = actor();
  box.requiredOffset = -1;
  stepNativePushBoxMotion(box);
  assert.equal(box.velocity.x, 1);
  box.requiredOffset = -2;
  stepNativePushBoxMotion(box);
  assert.equal(box.velocity.x, 0);
});
