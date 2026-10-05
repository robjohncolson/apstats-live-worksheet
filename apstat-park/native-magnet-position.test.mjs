import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeMagnetHeldPosition, followNativeMagnetOwner, releaseNativeMagnetTarget } from './native-magnet-position.mjs';
import { selectNativeMagnetTarget } from './native-magnet-target.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativePushBoxActor } from './native-push-box-actor.mjs';
const player = x => createNativePlayer({ position: { x, y: 100 },
  presentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } });
const fixture = () => {
  const owner = player(200), target = player(246);
  return { owner, target, scene: { players: [owner, target] }, candidates: [target],
    position: { x: 0, y: 0 }, gripOffset: { x: 0, y: 0 }, magnetFlags: 0, spriteFlags: 9 };
};

test('magnet follows both facings and aligns held Player symmetrically', () => {
  const magnet = fixture(); followNativeMagnetOwner(magnet);
  assert.deepEqual(magnet.position, { x: 220, y: 90 });
  assert.deepEqual(nativeMagnetHeldPosition(magnet), { x: 246, y: 100 });
  magnet.owner.scale.x = -1; followNativeMagnetOwner(magnet);
  assert.deepEqual(magnet.position, { x: 30, y: 90 });
  assert.deepEqual(magnet.gripOffset, { x: 150, y: 0 });
  assert.deepEqual(nativeMagnetHeldPosition(magnet), { x: 154, y: 100 });
  assert.deepEqual(magnet.scale, { x: -1, y: 1 });
});

test('held position respects body scaling about a nonzero pivot', () => {
  const magnet = fixture(); followNativeMagnetOwner(magnet);
  magnet.target.body.pivot.x = 4; magnet.target.body.scale.x = 2;
  assert.deepEqual(nativeMagnetHeldPosition(magnet), { x: 266, y: 100 });
  magnet.owner.scale.x = -1; followNativeMagnetOwner(magnet);
  assert.deepEqual(nativeMagnetHeldPosition(magnet), { x: 142, y: 100 });
});

test('POST keeps latch at distance32, clears it above32, and leaves target frozen', () => {
  const magnet = fixture(); selectNativeMagnetTarget(magnet);
  magnet.magnetFlags = 3; magnet.target.position.x = 278;
  followNativeMagnetOwner(magnet); assert.equal(magnet.magnetFlags, 3);
  magnet.target.position.x = 279;
  followNativeMagnetOwner(magnet); assert.equal(magnet.magnetFlags, 2);
  assert.equal(magnet.target.controller.state.flags & 8, 8);
  assert.equal(magnet.target.playerFlags & 8, 0);
  magnet.owner.spriteFlags &= ~8; followNativeMagnetOwner(magnet);
  assert.equal(magnet.spriteFlags, 1);
});

test('release unfreezes real Player and PushBox and restores Player flag8', () => {
  const magnet = fixture(), target = magnet.target;
  selectNativeMagnetTarget(magnet); magnet.magnetFlags = 3;
  releaseNativeMagnetTarget(magnet);
  assert.equal(magnet.target, null); assert.equal(magnet.magnetFlags, 2);
  assert.equal(target.controller.state.flags & 8, 0); assert.equal(target.playerFlags & 8, 8);
  const box = createNativePushBoxActor({ spawn: { actorName: 'PushBox', x: 20, y: 100,
    raw: [0, 0, 'PushBox', '', 20, 100, 100, 64, 32] } });
  magnet.candidates = [box]; selectNativeMagnetTarget(magnet);
  assert.equal(box.boxFlags & 2, 2);
  releaseNativeMagnetTarget(magnet); assert.equal(box.boxFlags & 2, 0);
});
