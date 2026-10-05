import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativePlayerBody, setNativePlayerEnabled } from './native-player-body.mjs';
import { scaledNativeBounds } from './native-body-support.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';

test('ordinary Player body has native collision mask, priority, pivot and controller BEGIN forwarding', () => {
  const calls = [];
  const actor = { bodies: [], controller: { contact: (...args) => calls.push(args) } };
  const body = createNativePlayerBody(actor);
  assert.equal(body.type, 3);
  assert.equal(body.category, 1);
  assert.equal(body.flags, 5);
  assert.equal(body.priority, -1);
  assert.deepEqual(body.localBounds, { x: -16, y: -47, width: 32, height: 46 });
  assert.deepEqual(scaledNativeBounds(body.rawBounds, { x: .5, y: .5 }, body.pivot),
    { x: -8, y: -24, width: 16, height: 23 });
  const other = {}, normal = { x: 0, y: 1 };
  body.onContactBegin(other, normal, 0);
  assert.deepEqual(calls, [[actor, other, normal, 0]]);
  const attached = { bodies: [], bodyWorld: createNativeBodyRegistry(), spawnPosition: { x: 10, y: 20 } };
  const registered = createNativePlayerBody(attached);
  assert.equal(registered.world, attached.bodyWorld);
  assert.equal(registered.priority, 0, 'native only writes -1 before world registration');
});

test('enable forwards component state before primary-body and scheduler updates', () => {
  const events = [];
  const actor = { bodies: [], flags: 4, spriteFlags: 9, manager: {},
    onStopped: () => events.push(['stop', actor.flags, actor.bodies[0].body.flags]),
    onResumed: () => events.push(['resume', actor.flags, actor.bodies[0].body.flags]) };
  createNativePlayerBody(actor);
  actor.components = [{ setEnabled: enabled => events.push(['component', enabled, actor.spriteFlags, actor.bodies[0].body.flags]) }];
  setNativePlayerEnabled(actor, false);
  setNativePlayerEnabled(actor, true);
  assert.deepEqual(events, [['component', false, 1, 5], ['stop', 5, 4],
    ['component', true, 9, 4], ['resume', 4, 5]]);
  actor.manager = null; events.length = 0;
  setNativePlayerEnabled(actor, false);
  assert.equal(events.length, 1);
  assert.equal(actor.flags, 4);
});
