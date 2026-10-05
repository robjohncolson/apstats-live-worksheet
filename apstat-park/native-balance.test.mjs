import assert from 'node:assert/strict';
import test from 'node:test';
import { updateNativeBalance, refreshNativeBalanceLoad } from './native-balance.mjs';
import { createNativeBody } from './native-body.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
const makeBalance = () => ({ name: 'BalanceSeesawParent', span: 900,
  left: { supportCount: 0, currentOffset: 0 }, right: { supportCount: 0, currentOffset: 0 } });

test('Balance normalizes load by half the team, clamps tilt, and addresses the row-label target', () => {
  const balance = makeBalance(), messages = [];
  balance.right.supportCount = 4;
  updateNativeBalance(balance, { playerCount: 8, sendCommand: (...message) => messages.push(message) });
  assert.ok(Math.abs(balance.right.targetOffset - Math.tan(7 * Math.PI / 180) * 450) < 1e-5);
  assert.equal(balance.left.targetOffset, -balance.right.targetOffset);
  assert.equal(balance.left.speed, 1);
  assert.deepEqual(messages, [['SeesawParent', 12, 0]]);
  const maximum = balance.right.targetOffset;
  balance.right.supportCount = 8;
  updateNativeBalance(balance, { playerCount: 8, sendCommand() {} });
  assert.equal(balance.right.targetOffset, maximum);
  balance.right.supportCount = 1;
  updateNativeBalance(balance, { playerCount: 8, sendCommand() {} });
  assert.ok(Math.abs(balance.right.targetOffset - maximum / 4) < 1e-5);
  assert.equal(balance.left.speed, .25);
});

test('Balance slows overshoot correction and sends angle from actual offsets rather than target heights', () => {
  const balance = makeBalance();
  balance.left.supportCount = 2;
  balance.left.currentOffset = 100;
  balance.right.currentOffset = -20;
  let angle;
  updateNativeBalance(balance, { playerCount: 2, sendCommand: (_, command, value) => {
    assert.equal(command, 12); angle = value;
  } });
  assert.equal(balance.left.speed, Math.fround(.2));
  assert.equal(angle, Math.fround(Math.atan2(-100, 450)));
  balance.right.supportCount = 2;
  updateNativeBalance(balance, { playerCount: 2, sendCommand() {} });
  assert.equal(balance.left.targetOffset, 0);
  assert.equal(balance.left.speed, Math.fround(.2));
});

test('Balance load counts supported player stacks once and skips wrong normals, missing IDs and non-player bridges', () => {
  const world = createNativeBodyRegistry();
  const bodies = Array.from({ length: 6 }, (_, index) => {
    const body = createNativeBody(); body.category = index === 0 || index === 4 ? 0 : 1;
    attachNativeBody(world, body); return body;
  });
  const up = index => ({ bodyId: bodies[index].id, normal: { x: 0, y: -1 } });
  bodies[0].contacts = [up(1), up(2), up(4), { bodyId: 9999, normal: { x: 0, y: -1 } }];
  bodies[1].contacts = [up(2), { bodyId: bodies[3].id, normal: { x: 1, y: 0 } }];
  bodies[2].contacts = [up(1)]; // cycle is deduplicated
  bodies[4].contacts = [up(5)]; // category mask prevents traversal through this body
  const platform = { body: bodies[0] };
  refreshNativeBalanceLoad(platform);
  assert.equal(platform.supportCount, 2);
});
