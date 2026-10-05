import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeRect } from './native-rect.mjs';

test('native Rect preserves bottom anchor, zero dimensions and full body height', () => {
  const spawn = { x: 24, y: 355.2, raw: ['Rect', '', 0, 0, 24, 355.2, 81.6, 336] };
  const body = nativeRect(spawn, 2);
  assert.equal(body.x, 24);
  assert.ok(Math.abs(body.y - 19.2) < .0001);
  assert.equal(body.height, 336);
  assert.equal(nativeRect({ ...spawn, raw: [] }, 2).width, 0);
});

test('party adjustments precede negative-width normalization', () => {
  const spawn = { x: 100, y: 200, raw: ['Rect', '', 0, 0, 100, 200, 20, 40, -10, 5, 3, -2] };
  assert.deepEqual(nativeRect(spawn, 2), { x: 100, y: 160, width: 20, height: 40 });
  assert.deepEqual(nativeRect(spawn, 8), { x: 78, y: 118, width: 40, height: 70 });
});
