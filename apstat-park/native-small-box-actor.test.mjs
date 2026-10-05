import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSmallBoxActor } from './native-small-box-actor.mjs';
const box = amount => createNativeSmallBoxActor({ spawn: { actorName: 'SmallBox', label: '1', x: 100, y: 200,
  raw: [0, 0, 'SmallBox', '1', 100, 200, amount, 999, 999] } });

test('SmallBox uses fixed offset bounds despite extra Lua parameters and has native heavy motion flag', () => {
  const actor = box(-1);
  assert.deepEqual(actor.spriteBounds, { x: -25, y: -48, width: 48, height: 48 });
  assert.deepEqual(actor.body.rawBounds, { x: -24, y: -47, width: 46, height: 46 });
  assert.deepEqual(actor.body.localBounds, actor.body.rawBounds);
  assert.equal(actor.motionFlags, 28); assert.equal(actor.mass, 100);
  assert.equal(actor.requiredPercent, 100); assert.equal(actor.requiredOffset, -1);
  assert.equal(box(50).requiredPercent, 50);
});

test('SmallBox retains native PushBox magnet freeze and release behavior', () => {
  const actor = box(100); actor.velocity = { x: 3, y: 4 };
  assert.equal(actor.onCommand(0x1e, 1), 1);
  assert.deepEqual(actor.velocity, { x: 0, y: 0 });
  assert.equal(actor.boxFlags & 2, 2);
  actor.onCommand(0x1e, 0); assert.equal(actor.boxFlags & 2, 0);
  assert.equal(actor.isNativePushBox, true);
});
