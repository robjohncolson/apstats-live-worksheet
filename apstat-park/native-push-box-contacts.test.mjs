import test from 'node:test';
import assert from 'node:assert/strict';
import { countNativePushBoxPushers } from './native-push-box-contacts.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { createNativeActorRectangle } from './native-actor-bodies.mjs';

const normals = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
function fixture() {
  const world = createNativeBodyRegistry();
  function actor(x = 0, y = 0, category = 1) {
    const value = { bodies: [], velocity: { x, y } };
    value.body = createNativeActorRectangle(value, { x: 0, y: 0, width: 10, height: 10 }, 3, false);
    value.body.category = category;
    attachNativeBody(world, value.body);
    return value;
  }
  function link(a, b, direction = 2) {
    a.body.contacts.push({ bodyId: b.body.id, normal: normals[direction], state: 0 });
  }
  return { world, actor, link };
}

test('push counts use all four velocity directions with strict native epsilon boundaries', () => {
  for (let direction = 0; direction < 4; direction++) {
    const { actor, link } = fixture();
    const root = actor();
    const sign = direction % 2 ? -1 : 1;
    for (const speed of [0, 2 ** -23, 2 ** -22, -1]) {
      const value = speed * sign;
      link(root, actor(direction > 1 ? value : 0, direction < 2 ? value : 0), direction);
    }
    assert.equal(countNativePushBoxPushers(root, direction), 1);
  }
});

test('push counting traverses stationary actors and counts shared descendants along each path', () => {
  const { actor, link } = fixture();
  const root = actor(), left = actor(), right = actor(), shared = actor(3, 0, 6);
  link(root, left); link(root, right); link(left, shared); link(right, shared);
  assert.equal(countNativePushBoxPushers(root, 2), 2);
  shared.velocity.x = 0;
  assert.equal(countNativePushBoxPushers(root, 2), 0);
});

test('push counting uses registry IDs and direction, not map contacts or enabled/category filters', () => {
  const { world, actor, link } = fixture();
  const root = actor(), accepted = actor(3, 0, 9), missing = actor(3), opposite = actor(3);
  accepted.body.flags &= ~1;
  link(root, accepted); link(root, missing); link(root, opposite, 3);
  world.bodiesById.delete(missing.body.id);
  root.body.mapContacts.push(normals[2]);
  assert.equal(countNativePushBoxPushers(root, 2), 1);
  assert.equal(countNativePushBoxPushers({ bodies: [] }, 2), 0);
});

test('invalid cyclic and overflowing push graphs fail explicitly', () => {
  const { actor, link } = fixture();
  const root = actor(), neighbor = actor(3);
  link(root, neighbor); link(neighbor, root);
  assert.throws(() => countNativePushBoxPushers(root, 2), /Cyclic/);
  neighbor.body.contacts.length = 0;
  for (let i = 0; i < 16; i++) link(root, actor(3));
  assert.throws(() => countNativePushBoxPushers(root, 2), /capacity/);
});
