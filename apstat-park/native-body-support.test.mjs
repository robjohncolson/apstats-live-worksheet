import assert from 'node:assert/strict';
import test from 'node:test';
import { queryNativeBodyNeighbors, refreshNativePlayerUpContacts, scaledNativeBounds } from './native-body-support.mjs';
import { finalizeNativeActorContacts } from './native-body-contacts.mjs';

const body = (id, x, y, width = 10, height = 10) => ({ id, flags: 1, type: 3, category: 1,
  position: { x, y }, localBounds: { x: 0, y: 0, width, height }, contacts: [] });
const world = bodies => { const collisionMatrix = new Uint8Array(1024); collisionMatrix[33] = 1; return { bodies, collisionMatrix }; };

test('UP/DOWN neighbor probes accept strict half-unit gaps and exclude existing overlap', () => {
  const query = body(1, 20, 20), above = body(2, 20, 10), below = body(3, 20, 30.25);
  const scene = world([query, above, below]);
  assert.deepEqual(queryNativeBodyNeighbors(scene, query, 0).map(item => item.id), [2]);
  assert.deepEqual(queryNativeBodyNeighbors(scene, query, 1).map(item => item.id), [3]);
  below.position.y = 30.5;
  assert.deepEqual(queryNativeBodyNeighbors(scene, query, 1), []);
  above.position.y = 11;
  assert.deepEqual(queryNativeBodyNeighbors(scene, query, 0), []);
});

test('neighbor scan preserves matrix direction, disabled-query handling, physical type and 16-body capacity', () => {
  const query = body(1, 20, 20); query.flags = 0;
  const candidates = Array.from({ length: 20 }, (_, i) => body(i + 2, 20, 10));
  const scene = world([query, ...candidates]);
  assert.deepEqual(queryNativeBodyNeighbors(scene, query, 0).map(item => item.id), candidates.slice(0, 16).map(item => item.id));
  candidates[0].flags = 0; candidates[1].type = 1;
  assert.equal(queryNativeBodyNeighbors(scene, query, 0)[0].id, candidates[2].id);
  query.category = 2;
  scene.collisionMatrix[2 * 32 + 1] = 1;
  assert.equal(queryNativeBodyNeighbors(scene, query, 0).length, 0);
  scene.collisionMatrix[1 * 32 + 2] = 1;
  assert.equal(queryNativeBodyNeighbors(scene, query, 0).length, 16);
});

test('native horizontal comparisons do not synthesize neighbors rejected by bc1d580', () => {
  const query = body(1, 20, 20), left = body(2, 10, 20), right = body(3, 30, 20);
  const scene = world([query, left, right]);
  assert.deepEqual(queryNativeBodyNeighbors(scene, query, 2), []);
  assert.deepEqual(queryNativeBodyNeighbors(scene, query, 3), []);
});

test('Player upward refresh uses half X scale, retains center contacts and rejects an edge-only overlap', () => {
  const rawBounds = { x: -16, y: -47, width: 32, height: 46 };
  const player = { ...body(1, 100, 100), flags: 5, rawBounds, localBounds: { ...rawBounds }, scale: { x: 1, y: 1 } };
  const center = body(2, 96, 43, 8, 10), edge = body(3, 110, 43, 8, 10);
  const scene = world([player, center, edge]);
  const original = JSON.stringify({ bounds: player.localBounds, scale: player.scale });
  refreshNativePlayerUpContacts(scene, player);
  assert.deepEqual(player.contacts, [{ state: 0, bodyId: 2, normal: { x: 0, y: -1 } }]);
  assert.equal(JSON.stringify({ bounds: player.localBounds, scale: player.scale }), original);
  const events = []; player.onContactBegin = other => events.push(other.id);
  finalizeNativeActorContacts(scene, player);
  assert.deepEqual(events, [2]);
  assert.equal(player.contacts.length, 1, 'second probe deduplicates the existing contact');
});

test('native descriptor scaling respects the pivot and independent axes', () => {
  assert.deepEqual(scaledNativeBounds({ x: -16, y: -47, width: 32, height: 46 },
    { x: .5, y: 2 }, { x: 4, y: -1 }), { x: -6, y: -93, width: 16, height: 92 });
});
