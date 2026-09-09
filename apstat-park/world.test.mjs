import test from 'node:test';
import assert from 'node:assert/strict';
import { ParkWorld } from './world.mjs';

const level = { id: 'test', width: 1280, height: 600, spawn: { x: 60, y: 520 },
  platforms: [{ x: 0, y: 540, w: 1000, h: 60 }, { x: 1100, y: 540, w: 180, h: 60 }],
  bridge: { x: 1000, y: 540, w: 100, h: 18 }, switches: [], samples: [], goal: { x: 1200, y: 520 } };

test('local movement and jumping run for a minute with no network dependency', () => {
  const world = new ParkWorld(level);
  for (let i = 0; i < 60; i++) world.update(1 / 60, {}, false);
  assert.equal(world.player.grounded, true);
  const y = world.player.y;
  for (let i = 0; i < 10; i++) world.update(1 / 60, { jump: true, right: true }, false);
  assert.ok(world.player.y < y - 50);
  assert.ok(world.player.x > 90);
  for (let i = 0; i < 3600; i++) world.update(1 / 60, {}, false);
  assert.equal(world.player.y, y);
  assert.equal(world.player.grounded, true);
});

test('saved shared bridge enables crossing; a fall recovers locally', () => {
  const open = new ParkWorld(level);
  for (let i = 0; i < 340; i++) open.update(1 / 60, { right: true }, true);
  assert.ok(open.player.x > 1200);
  assert.equal(open.player.grounded, true);
  const closed = new ParkWorld(level);
  for (let i = 0; i < 290; i++) closed.update(1 / 60, { right: true }, false);
  assert.ok(closed.player.x < 500, 'Falling into the gap should respawn locally');
});
