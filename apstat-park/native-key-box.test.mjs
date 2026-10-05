import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeKeyBox } from './native-key-box.mjs';

test('BallBox needs a centered contact and command-11 acceptance before releasing its key', () => {
  const rewards = [], commands = [];
  const box = createNativeKeyBox({ kind: 'BallBox', x: 100, y: 400, releaseKey: key => rewards.push(key) });
  const ball = { x: 106, receiveCommand: (...args) => { commands.push(args); return 1; } };
  assert.equal(box.ballContact(ball), false);
  assert.deepEqual(commands, []);
  ball.x = 105;
  assert.equal(box.ballContact({ ...ball, receiveCommand: () => 0 }), false);
  assert.equal(box.ballContact(ball), true);
  assert.deepEqual(commands, [[11, 100]]);
  assert.deepEqual(rewards, [{ x: 100, y: 370 }]);
  assert.equal(box.ballContact(ball), false);
});

test('LaserKeyBox needs three qualifying hits; player-hit reset also restores pitcher speed', () => {
  const rewards = [], commands = [];
  const box = createNativeKeyBox({ kind: 'LaserKeyBox', x: 75, y: 434, target: 'LaserBallPitcher',
    multiplier: 1.8, releaseKey: key => rewards.push(key), sendCommand: (...args) => commands.push(args) });
  assert.equal(box.laserContact(0, 5), false);
  assert.equal(box.laserContact(1, 1), false);
  box.laserContact(1, 5); box.laserContact(1, 5);
  assert.deepEqual(rewards, []);
  assert.equal(box.receiveCommand(0x25), true);
  assert.equal(box.state.hits, 0);
  assert.deepEqual(commands.at(-1), ['LaserBallPitcher', 0x16]);
  for (let i = 0; i < 3; i++) box.laserContact(1, 5);
  assert.deepEqual(rewards, [{ x: 75, y: 404 }]);
  assert.equal(box.receiveCommand(0x25), false);
  assert.deepEqual(commands[0], ['LaserBallPitcher', 0x15, 1.8]);
});

test('reward boxes use the native 40-tick removal countdown and ten-tick fade window', () => {
  const box = createNativeKeyBox({ kind: 'BallBox', x: 0, y: 0, releaseKey() {} });
  box.ballContact({ x: 0, receiveCommand: () => 1 });
  for (let i = 0; i < 10; i++) box.tick();
  assert.equal(box.state.alpha, 1);
  for (let i = 0; i < 11; i++) box.tick();
  assert.equal(box.state.alpha, 0);
  assert.equal(box.state.removed, false);
  for (let i = 0; i < 19; i++) box.tick();
  assert.equal(box.state.removed, true);
});
