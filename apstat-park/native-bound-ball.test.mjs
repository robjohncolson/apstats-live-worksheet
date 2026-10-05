import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeBoundBall, boundContactVelocity, boundBodyResponse, boundMapResponse } from './native-bound-ball.mjs';

test('native actor integration uses half acceleration for position and full acceleration for velocity', () => {
  const ball = createNativeBoundBall({ x: 100, y: 200, velocity: { x: -3, y: 0 }, partySize: 2 });
  ball.tick();
  assert.equal(ball.state.x, 97);
  assert.equal(ball.state.y, Math.fround(200 + Math.fround(.65) / 2));
  assert.equal(ball.state.velocity.y, Math.fround(.65));
  const recovered = boundContactVelocity({ velocity: { x: -3, y: 5 }, y: 200, previousY: 200, previousVelocityY: 4 });
  assert.deepEqual(recovered, { x: -3, y: 4 });
});

test('body response uses native mass 50, relative motion and the minimum bounce threshold', () => {
  const n = { x: 0, y: 1 };
  const v = { x: -3, y: 10 };
  const stationary = { x: 0, y: 0 };
  assert.ok(Math.abs(boundBodyResponse(v, n, stationary, 100, Math.fround(1.2)).y + 14 / 3) < .00001);
  assert.ok(Math.abs(boundBodyResponse(v, n, stationary, 100, 1).y + 10 / 3) < .00001);
  assert.deepEqual(boundBodyResponse({ x: 2, y: -5 }, n, stationary, 100, 1), { x: 2, y: -5 });
  assert.equal(boundBodyResponse({ x: 2, y: 1 }, n, stationary, 100, 1).y, 0);
  assert.deepEqual(boundMapResponse({ x: 3, y: 4 }, { x: 1, y: 0 }), { x: -3, y: 4 });
});

test('command 11 centers the captured ball and keeps its native downward motion during removal', () => {
  const ball = createNativeBoundBall({ x: 100, y: 200, velocity: { x: -3, y: 0 }, partySize: 2 });
  assert.equal(ball.receiveCommand(37), 0);
  assert.equal(ball.receiveCommand(11, 64), 1);
  assert.equal(ball.state.remaining, 30);
  assert.equal(ball.state.x, 64);
  ball.tick();
  assert.ok(ball.state.y > 203);
  for (let i = 0; i < 29; i++) ball.tick();
  assert.equal(ball.removed, true);
});
