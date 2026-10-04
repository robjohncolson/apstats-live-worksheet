import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageClear, CLEAR_WHITENING } from './stage-clear.mjs';

test('the clear title waits, enters from the left, and holds in the responsive center', () => {
  const clear = createStageClear();
  assert.equal(clear.sample(false, 'round', 0, 720, 750), null);
  const first = clear.sample(true, 'round', 100, 720, 750);
  assert.equal(first.whitening, 0);
  assert.equal(first.visible, false);
  const start = clear.sample(true, 'round', 900, 720, 750);
  assert.equal(start.whitening, CLEAR_WHITENING);
  assert.equal(start.visible, true);
  assert.ok(start.x < 0);
  const middle = clear.sample(true, 'round', 1400, 720, 750);
  assert.ok(middle.x > start.x && middle.x < 360);
  assert.equal(clear.sample(true, 'round', 1900, 720, 750).x, 360);
  assert.equal(clear.sample(true, 'round', 6000, 390, 406).x, 195);
});

test('new rounds and retries clear both the title and whitening', () => {
  const clear = createStageClear();
  clear.sample(true, 'one', 0, 720, 750);
  assert.equal(clear.sample(true, 'one', 2000, 720, 750).whitening, CLEAR_WHITENING);
  assert.equal(clear.sample(false, 'two', 3000, 720, 750), null);
  assert.equal(clear.sample(true, 'two', 4000, 720, 750).whitening, 0);
  assert.equal(clear.sample(true, 'three', 5000, 720, 750).visible, false);
});
