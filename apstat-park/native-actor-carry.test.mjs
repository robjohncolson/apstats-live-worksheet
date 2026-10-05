import assert from 'node:assert/strict';
import test from 'node:test';
import { canMoveNativeActor, carryNativeBalanceRiders } from './native-actor-carry.mjs';
import { stepNativeBalancePlatform } from './native-balance.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { createNativeBody } from './native-body.mjs';
function fixture(count = 4) {
  const world = createNativeBodyRegistry();
  const actors = Array.from({ length: count }, (_, i) => {
    const body = createNativeBody(); body.category = i === 0 ? 0 : 1;
    const actor = { body, bodies: [{ body, followsActor: true }],
      position: { x: 0, y: -i * 10 }, spawnPosition: { x: 0, y: -i * 10 } };
    body.actor = actor;
    attachNativeBody(world, body);
    return actor;
  });
  const link = (from, to, y = -1) => actors[from].body.contacts.push({ bodyId: actors[to].body.id, normal: { x: 0, y } });
  return { actors, link };
}

test('movement gate follows directional contacts and rejects a map-blocked actor in the stack', () => {
  const { actors, link } = fixture();
  link(0, 1); link(1, 2);
  assert.equal(canMoveNativeActor(actors[0], { x: 0, y: -1 }), true);
  actors[2].body.mapContacts.push({ x: 0, y: -1 });
  assert.equal(canMoveNativeActor(actors[0], { x: 0, y: -1 }), false);
  assert.equal(canMoveNativeActor(actors[0], { x: 0, y: 1 }), true);
  assert.equal(canMoveNativeActor(actors[0], { x: 0, y: 0 }), false);
});

test('fixed-contact gate uses preferred-direction dot product and carrying excludes fixed bodies', () => {
  const { actors, link } = fixture();
  actors[1].body.flags |= 16;
  link(0, 1);
  assert.equal(canMoveNativeActor(actors[0], { x: 0, y: -1 }), false);
  actors[0].body.contacts[0].normal.y = 1;
  assert.equal(canMoveNativeActor(actors[0], { x: 0, y: 1 }), true);
  actors[0].body.contacts[0].normal.y = -1;
  carryNativeBalanceRiders(actors[0], { x: 0, y: -1 });
  assert.equal(actors[1].position.y, -10);
});

test('shared rider is moved once, body sync precedes hook, and hook delta edits do not change descendant carry', () => {
  const { actors, link } = fixture();
  link(0, 1); link(0, 2); link(1, 3); link(2, 3);
  const order = [];
  actors.forEach((actor, i) => { actor.onCarried = delta => {
    order.push(i);
    assert.deepEqual(actor.body.position, actor.position);
    delta.y = 99;
  }; });
  carryNativeBalanceRiders(actors[0], { x: 0, y: -.5 });
  assert.deepEqual(order, [1, 3, 2]);
  assert.deepEqual(actors.map(actor => actor.position.y), [-0, -10.5, -20.5, -30.5]);
  assert.deepEqual(actors[3].postResetVector, { x: 0, y: -.5 });
});

test('Balance platform samples stacked loads before moving and waits when its rider hits the ceiling', () => {
  const { actors, link } = fixture();
  link(0, 1); link(1, 2);
  const platform = Object.assign(actors[0], { targetOffset: -2, currentOffset: 0, speed: .5 });
  actors[2].body.mapContacts.push({ x: 0, y: -1 });
  assert.equal(stepNativeBalancePlatform(platform), false);
  assert.equal(platform.supportCount, 2);
  assert.equal(platform.currentOffset, 0);
  actors[2].body.mapContacts.length = 0;
  assert.equal(stepNativeBalancePlatform(platform), true);
  assert.equal(platform.currentOffset, -.5);
  assert.equal(platform.position.y, -.5);
  assert.equal(platform.body.position.y, 0, 'common PRE sync follows this actor hook');
  assert.equal(actors[1].position.y, -10.5);
  assert.equal(actors[2].position.y, -20.5);
});
