import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNativeMagnetCandidate, selectNativeMagnetTarget, nativeMagnetPullDisplacement } from './native-magnet-target.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativePushBoxActor } from './native-push-box-actor.mjs';
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };
const player = (x, y = 0) => createNativePlayer({ position: { x, y }, presentation });
const fixture = () => ({ owner: player(0), candidates: [], target: null, scene: { players: [] }, magnetFlags: 0 });

test('magnet overlap excludes owner and non-box actors, accepts either horizontal side and caps at eight', () => {
  const magnet = fixture();
  collectNativeMagnetCandidate(magnet, magnet.owner.body);
  collectNativeMagnetCandidate(magnet, { category: 2, actor: { position: { x: 1, y: 0 } } });
  collectNativeMagnetCandidate(magnet, player(10, 10).body);
  assert.equal(magnet.candidates.length, 0);
  const left = player(-100), right = player(100, 83);
  collectNativeMagnetCandidate(magnet, left.body); collectNativeMagnetCandidate(magnet, right.body);
  assert.deepEqual(magnet.candidates, [left, right]);
  for (let i = 0; i < 10; i++) collectNativeMagnetCandidate(magnet, left.body);
  assert.equal(magnet.candidates.length, 8);
});

test('nearest accepting target wins, equal distances keep overlap order, and real Player freezes', () => {
  const magnet = fixture(), first = player(10), second = player(-10);
  magnet.scene.players.push(first, second);
  const refused = { position: { x: 1, y: 0 }, onCommand: () => 0 };
  first.velocity = { x: 3, y: -2 };
  magnet.candidates.push(second, refused, first);
  assert.equal(selectNativeMagnetTarget(magnet), second);
  assert.equal(second.controller.state.flags & 8, 8);
  assert.equal(second.playerFlags & 8, 0);
  assert.deepEqual(second.velocity, { x: 0, y: 0 });
  assert.equal(first.controller.state.flags & 8, 0);
});

test('real PushBox uses its RTTI marker and accepts the magnet freeze command', () => {
  const box = createNativePushBoxActor({ spawn: { actorName: 'PushBox', label: '', x: 40, y: 0,
    raw: [0, 0, 'PushBox', '', 40, 0, 100, 32, 32] } });
  const magnet = fixture();
  collectNativeMagnetCandidate(magnet, box.body);
  assert.equal(selectNativeMagnetTarget(magnet), box);
  assert.equal(box.boxFlags & 2, 2);
});

test('pull uses separate axes, minimum two-pixel correction and persistent settled latch', () => {
  const magnet = fixture(); magnet.target = player(0);
  assert.deepEqual(nativeMagnetPullDisplacement(magnet, { x: 2, y: -3 }), { x: 2, y: -2 });
  assert.equal(magnet.magnetFlags, 0);
  assert.deepEqual(nativeMagnetPullDisplacement(magnet, { x: 1, y: 2 }), { x: 1, y: 2 });
  assert.equal(magnet.magnetFlags, 1);
  magnet.owner.velocity = { x: 3, y: -1 };
  const movement = nativeMagnetPullDisplacement(magnet, { x: 103, y: 99 });
  assert.equal(movement.x, 9); assert.equal(movement.y, 15);
  assert.equal(magnet.magnetFlags, 1);
});

test('target side and ceiling contacts suppress pull; floor does not suppress downward pull', () => {
  const magnet = fixture(); magnet.target = player(0);
  magnet.target.body.mapContacts.push({ x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 });
  assert.deepEqual(nativeMagnetPullDisplacement(magnet, { x: 20, y: -20 }), { x: 0, y: 0 });
  assert.deepEqual(nativeMagnetPullDisplacement(magnet, { x: -20, y: 20 }), { x: -2, y: 2 });
});
