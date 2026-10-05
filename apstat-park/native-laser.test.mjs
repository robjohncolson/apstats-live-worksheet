import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeLaser, laserTouchesRect } from './native-laser.mjs';

test('laser moves per frame, broadcasts on player contact, and removes after 30 PRE ticks', () => {
  const commands = [];
  const laser = createNativeLaser({ x: 100, y: 40, velocity: { x: -7, y: 0 }, target: 'LaserKeyBox',
    sendCommand: (...args) => commands.push(args) });
  laser.tick();
  assert.equal(laser.state.x, 93);
  assert.equal(laser.contact(1), true);
  assert.equal(laser.contact(1), false);
  assert.deepEqual(commands, [['LaserKeyBox', 37]]);
  assert.equal(laser.state.remaining, 30);
  for (let i = 0; i < 11; i++) laser.tick();
  assert.equal(laser.state.alpha, 0);
  assert.equal(laser.state.x, 93);
  for (let i = 0; i < 18; i++) laser.tick();
  assert.equal(laser.removed, false);
  laser.tick();
  assert.equal(laser.removed, true);
});

test('native mixed circle/rectangle contacts use bounds, with strict edge exclusion', () => {
  const ball = { x: 0, y: 0, radius: 12 };
  assert.equal(laserTouchesRect(ball, { x: 10, y: 10, width: 5, height: 5 }), true);
  assert.equal(laserTouchesRect(ball, { x: 12, y: -5, width: 5, height: 10 }), false);
});
