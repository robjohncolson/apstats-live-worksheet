import test from 'node:test';
import assert from 'node:assert/strict';
import { carryNativeActorWithOptions } from './native-carried-actor.mjs';
import { carryNativeBalanceRiders } from './native-actor-carry.mjs';
import { carryNativeLiftRiders } from './native-lift-carry.mjs';
import { carryNativeScrollNeighbors } from './native-player-boundary.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativeMagnetActor } from './native-magnet-actor.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
const options = { syncBodies: true, compensateVelocity: false, recurse: true,
  directionFromMovement: false, bodyIndex: 0, categoryMask: 0 };
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };
function fixture() {
  const world = createNativeBodyRegistry();
  const players = [0, 1, 2].map(index => {
    const actor = createNativePlayer({ playerIndex: index, position: { x: index * 50, y: 100 }, presentation });
    attachNativeBody(world, actor.body);
    return actor;
  });
  const [platform, owner, target] = players;
  const magnet = createNativeMagnetActor({ owner, position: { x: 70, y: 90 }, randomFloat: () => .5 });
  attachNativeBody(world, magnet.body); magnet.target = target;
  platform.body.contacts.push({ bodyId: owner.body.id, normal: { x: 0, y: -1 } });
  // The same target is reachable through a contact as well as the attachment.
  owner.body.contacts.push({ bodyId: target.body.id, normal: { x: 0, y: -1 } });
  return { platform, owner, target, magnet };
}

test('balance carries owner, companion and grabbed Player exactly once through shared visited state', () => {
  const { platform, owner, target, magnet } = fixture();
  carryNativeBalanceRiders(platform, { x: 3, y: -4 });
  assert.deepEqual(owner.position, { x: 53, y: 96 });
  assert.deepEqual(magnet.position, { x: 73, y: 86 });
  assert.deepEqual(target.position, { x: 103, y: 96 });
  assert.deepEqual(target.body.position, target.position);
  assert.deepEqual(magnet.body.position, magnet.position);
});

test('Lift carries attachments on both axes and scroll category mask does not exclude direct attachments', () => {
  const { platform, owner, target, magnet } = fixture();
  carryNativeLiftRiders(platform, { x: 5, y: -2 });
  assert.deepEqual(target.position, { x: 105, y: 98 });
  assert.deepEqual(magnet.position, { x: 75, y: 88 });
  platform.body.contacts[0].normal = { x: 1, y: 0 };
  carryNativeScrollNeighbors(platform, { x: 2, y: 0 }, 3);
  assert.equal(owner.position.x, 57); assert.equal(magnet.position.x, 77);
  assert.equal(target.position.x, 107);
});

test('mutual attachments terminate without double movement', () => {
  const { owner, target, magnet } = fixture();
  const reverse = createNativeMagnetActor({ owner: target, position: { x: 120, y: 90 }, randomFloat: () => .5 });
  reverse.target = owner;
  carryNativeActorWithOptions(owner, { x: 1, y: 0 }, { x: 0, y: -1 }, new Set(), options);
  assert.equal(owner.position.x, 51); assert.equal(target.position.x, 101);
  assert.equal(magnet.position.x, 71); assert.equal(reverse.position.x, 121);
});

test('direct carry honors compensation, body-sync and recursion options', () => {
  const { platform, owner } = fixture(); platform.velocity = { x: -2, y: 0 };
  carryNativeActorWithOptions(platform, { x: 3, y: 0 }, { x: 0, y: -1 }, new Set(),
    { ...options, compensateVelocity: true, syncBodies: false, recurse: false });
  assert.equal(platform.position.x, 5); assert.equal(platform.body.position.x, 0);
  assert.equal(owner.position.x, 50);
});
