import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBody } from './native-body.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { propagateNativeJumpImpulse } from './native-player-impulse.mjs';

test('jump impulse divides by maximum stack depth and preserves branch visits', () => {
  const world = createNativeBodyRegistry(), events = [];
  const bodies = ['base', 'left', 'right', 'top'].map(name => {
    const body = createNativeBody();
    body.actor = { motionFlags: 16, onCommand(command, vector) { events.push([name, command, vector.y]); } };
    attachNativeBody(world, body); return body;
  });
  const up = (from, to) => bodies[from].contacts.push({ bodyId: bodies[to].id, normal: { x: 0, y: -1 } });
  up(0, 1); up(0, 1); up(0, 2); up(1, 3); up(2, 3);
  propagateNativeJumpImpulse(bodies[0], -6);
  assert.deepEqual(events, [['left', 2, -3], ['top', 2, -6], ['right', 2, -3], ['top', 2, -6]]);
  events.length = 0;
  bodies[1].actor.motionFlags = bodies[2].actor.motionFlags = 0;
  propagateNativeJumpImpulse(bodies[0], -6);
  assert.deepEqual(events, [['left', 2, -3], ['right', 2, -3]], 'depth counts the graph even where propagation is disabled');
});

test('no overhead actors emits no impulse even when an UP map normal exists', () => {
  const body = createNativeBody();
  body.mapContacts.push({ x: 0, y: -1 });
  assert.doesNotThrow(() => propagateNativeJumpImpulse(body, -5.1));
});
