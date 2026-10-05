import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativePitcher } from './native-pitcher.mjs';

function fixture(actorName = 'LaserBallPitcher', partySize = 2, params = [270, 7, 'LaserKeyBox']) {
  const children = [];
  const spawn = { actorName, x: 792, y: 398, raw: [0, 0, actorName, '', 792, 398, ...params] };
  const pitcher = createNativePitcher({ spawn, partySize,
    createProjectile(spec) { const child = { ...spec, removed: false }; children.push(child); return child; } });
  return { pitcher, children };
}

test('laser launch uses native rotated-up direction, 20-pixel offset and frame speed', () => {
  const { pitcher, children } = fixture();
  pitcher.tick(); assert.equal(children.length, 0);
  pitcher.tick(); assert.equal(children.length, 1);
  assert.ok(Math.abs(children[0].x - 772) < 0.001);
  assert.ok(Math.abs(children[0].y - 398) < 0.001);
  assert.ok(Math.abs(children[0].velocity.x + 7) < 0.001);
  assert.ok(Math.abs(children[0].velocity.y) < 0.001);
  for (let i = 0; i < 600; i++) pitcher.tick();
  assert.equal(children.length, 1, 'a live child prevents another launch regardless of elapsed time');
  children[0].removed = true;
  pitcher.tick(); assert.equal(children.length, 1);
  pitcher.tick(); assert.equal(children.length, 2);
});

test('box speed commands affect the next projectile and reset to the configured speed', () => {
  const { pitcher, children } = fixture();
  pitcher.receiveCommand(0x15, 1.8);
  assert.equal(pitcher.state.speed, Math.fround(7 * 1.8));
  pitcher.tick(); pitcher.tick();
  const launchedVelocity = children[0].velocity.x;
  pitcher.receiveCommand(0x16);
  assert.equal(pitcher.state.speed, 7);
  assert.equal(children[0].velocity.x, launchedVelocity);
});

test('BoundBall uses per-party launch magnitudes, not the primary player jump controls', () => {
  const params = [270, 31.6, 33, 35.5, 40, 54, 49, 45, 43, 40];
  assert.equal(fixture('BoundBallPitcher', 1, params).pitcher.state.speed, 5);
  for (let count = 2; count <= 8; count++) {
    assert.equal(fixture('BoundBallPitcher', count, params).pitcher.state.speed,
      Math.fround(Math.fround(params[count - 1]) * Math.fround(0.1)));
  }
});
