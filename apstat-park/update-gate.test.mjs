import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateGate } from './update-gate.mjs';
import { createPoseSmoothing } from './pose-smoothing.mjs';

test('idle presence uses one heartbeat per second; motion and pushing retain 10 Hz', () => {
  let time = 0, writes = 0;
  const gate = createUpdateGate({ now: () => time });
  const send = () => { writes++; return true; };
  for (time = 0; time < 10000; time += 50) gate.publish('lobby', { x: 65 }, send);
  assert.equal(writes, 10);
  writes = 0; gate.reset();
  for (time = 0; time < 1000; time += 50) gate.publish('lobby', { x: time }, send);
  assert.equal(writes, 10);
  writes = 0; gate.reset();
  for (time = 0; time < 1000; time += 50) gate.publish('lobby', { x: 65 }, send, true);
  assert.equal(writes, 10, 'pushing a stationary block needs frequent intent');
});

test('backpressure retains updates; readiness, revision and reconnect break idle suppression', () => {
  let time = 0;
  const gate = createUpdateGate({ now: () => time });
  const value = { pose: { x: 65, y: 676 }, ready: false, revision: 0 };
  assert.equal(gate.publish('pose', value, () => false), false);
  assert.equal(gate.publish('pose', value, () => true), true);
  time = 100;
  assert.equal(gate.publish('pose', { ...value, ready: true }, () => true), true);
  time = 200;
  assert.equal(gate.publish('pose', { ...value, ready: true, revision: 1 }, () => true), true);
  gate.reset();
  assert.equal(gate.publish('pose', value, () => true), true);
});

test('peer motion is smoothed without extrapolation; resets, teleports and deaths snap', () => {
  let time = 0;
  const motion = createPoseSmoothing({ now: () => time });
  const options = { epoch: 'one', direct: true };
  assert.deepEqual(motion.sample('a', { x: 0, y: 676 }, options), { x: 0, y: 676 });
  time = 50; motion.sample('a', { x: 10, y: 676 }, options);
  time = 75; assert.equal(motion.sample('a', { x: 10, y: 676 }, options).x, 5);
  time = 5000; assert.equal(motion.sample('a', { x: 10, y: 676 }, options).x, 10);
  assert.equal(motion.sample('a', { x: 500, y: 676 }, options).x, 500);
  assert.equal(motion.sample('a', { x: 520, y: 676 }, { epoch: 'two' }).x, 520);
  assert.equal(motion.sample('a', { x: 530, y: 676 }, { epoch: 'two', snap: true }).x, 530);
  motion.retain(new Set());
  assert.equal(motion.sample('a', { x: 540, y: 676 }, { epoch: 'two' }).x, 540);
});
