import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBody, initializeNativeRectangleBody } from './native-body.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { nativeBodyOverlapsMap, nativeBodyPlacementBlocked } from './native-body-placement.mjs';
import { tryNativePlayerRelocation } from './native-player-relocation.mjs';

function fixture() {
  const world = createNativeBodyRegistry();
  const make = (x, category) => {
    const body = initializeNativeRectangleBody(createNativeBody(), { x: 0, y: 0, width: 8, height: 8 }, 2);
    body.category = category; body.position = { x, y: 10 }; body.previousPosition = { ...body.position };
    attachNativeBody(world, body); return body;
  };
  const body = make(10, 1), blocker = make(50, 2);
  world.collisionMatrix[2 * 32 + 1] = 1;
  const actor = { position: { ...body.position }, stepStartPosition: { ...body.position },
    bodies: [{ body, followsActor: true }], velocity: { x: 3, y: 4 }, components: [] };
  const state = { pendingPosition: { x: 50, y: 10 }, flags: 0 };
  const scene = { scrollMode: 0, viewPosition: { x: 0, y: 0 }, viewOffset: { x: 0, y: 0 } };
  return { world, body, blocker, actor, state, scene };
}

test('pending relocation retries occupancy, preserves failed state, then clears motion and actor contacts', () => {
  const { body, blocker, actor, state, scene } = fixture();
  const events = [];
  body.contacts.push({ bodyId: blocker.id, state: 0, normal: { x: 1, y: 0 } });
  blocker.contacts.push({ bodyId: body.id, state: 1, normal: { x: -1, y: 0 } });
  body.mapContacts.push({ x: 0, y: 1 });
  body.onContactEnd = (other, normal, kind) => events.push([other.id, normal.x, kind]);
  assert.equal(tryNativePlayerRelocation(actor, state, scene), false);
  assert.deepEqual(body.position, { x: 10, y: 10 });
  assert.equal(body.flags & 64, 0);
  assert.deepEqual(actor.velocity, { x: 3, y: 4 });
  assert.equal(state.pendingPosition.x, 50);
  assert.deepEqual(events, []);
  blocker.flags &= ~1;
  state.flags = 4;
  actor.setEnabled = enabled => events.push(['enabled', enabled]);
  actor.components.push({ consumeVelocity: value => events.push(['velocity', { ...value }]) });
  assert.equal(tryNativePlayerRelocation(actor, state, scene), true);
  assert.deepEqual(actor.position, { x: 50, y: 10 });
  assert.deepEqual(actor.stepStartPosition, actor.position);
  assert.deepEqual(body.previousPosition, actor.position);
  assert.deepEqual(events, [[blocker.id, 1, 1], ['velocity', { x: 0, y: 0 }], ['enabled', true]]);
  assert.equal(body.contacts.length, 0);
  assert.equal(blocker.contacts.length, 1, 'reciprocal contacts are not cleared by this routine');
  assert.equal(body.mapContacts.length, 1);
  assert.deepEqual(state.pendingPosition, { x: 0, y: 0 });
  assert.equal(state.flags & 4, 0);
});

test('scroll relocation adjusts a stale destination even if placement remains blocked', () => {
  const { blocker, actor, state, scene } = fixture();
  scene.scrollMode = 1; scene.viewPosition.x = 100;
  state.pendingPosition.x = 1;
  blocker.position.x = blocker.previousPosition.x = 116;
  assert.equal(tryNativePlayerRelocation(actor, state, scene), false);
  assert.equal(state.pendingPosition.x, 116);
  assert.equal(actor.position.x, 10);
  state.pendingPosition = { x: 0, y: 0 };
  assert.equal(tryNativePlayerRelocation(actor, state, scene), false, 'zero vector is a sentinel, not a warp to the origin');
});

test('placement uses candidate-first matrix direction and both accepted and current body poses', () => {
  const { world, body, blocker } = fixture();
  body.position.x = 50;
  body.flags = 0;
  assert.equal(nativeBodyPlacementBlocked(world, body), true, 'queried body need not be enabled');
  world.collisionMatrix[2 * 32 + 1] = 0;
  world.collisionMatrix[1 * 32 + 2] = 1;
  assert.equal(nativeBodyPlacementBlocked(world, body), false);
  world.collisionMatrix[2 * 32 + 1] = 1;
  body.position.x = 100;
  blocker.previousPosition.x = body.previousPosition.x;
  assert.equal(nativeBodyPlacementBlocked(world, body), true);
});

test('map placement scans inclusive far edges, custom solidity flags, and extended edge cells', () => {
  const body = initializeNativeRectangleBody(createNativeBody(), { x: 0, y: 0, width: 32, height: 8 }, 1);
  const map = { width: 2, height: 1, chipSize: 32, table: [1, 26], customFlags: [1] };
  assert.equal(nativeBodyOverlapsMap(map, body), true, 'right edge exactly at 32 includes column1');
  body.localBounds.width = 31;
  assert.equal(nativeBodyOverlapsMap(map, body), false);
  body.position.x = 500;
  assert.equal(nativeBodyOverlapsMap(map, body), true);
  map.customFlags[0] = 0;
  assert.equal(nativeBodyOverlapsMap(map, body), false);
});
