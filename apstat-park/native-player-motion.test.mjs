import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBody } from './native-body.mjs';
import { createNativeBodyRegistry, attachNativeBody, detachNativeBody } from './native-body-registry.mjs';
import { isNativePlayerAirborne, nativePlayerGravityDelta, recordNativePlayerCorrection,
  applyNativePlayerCorrectionVelocity } from './native-player-motion.mjs';
const f = Math.fround;

function fixture() {
  const world = createNativeBodyRegistry();
  const bodies = [1, 1, 1, 0].map(category => {
    const body = createNativeBody(); body.category = category; attachNativeBody(world, body); return body;
  });
  return { world, bodies, actor: { bodies: [{ body: bodies[0] }] } };
}
function supportedBy(body, support, normal = { x: 0, y: 1 }) {
  body.contacts.push({ bodyId: support.id, normal });
}

test('player stack is airborne until any DOWN chain reaches map or a non-player body', () => {
  const { bodies: [top, middle, bottom, platform], actor } = fixture();
  supportedBy(top, middle); supportedBy(middle, bottom);
  assert.equal(isNativePlayerAirborne(actor), true);
  bottom.mapContacts.push({ x: 0, y: 1 });
  assert.equal(isNativePlayerAirborne(actor), false);
  bottom.mapContacts.length = 0;
  supportedBy(bottom, platform);
  assert.equal(isNativePlayerAirborne(actor), false);
  detachNativeBody(platform);
  assert.equal(isNativePlayerAirborne(actor), true, 'missing registry IDs do not leave phantom support');
  supportedBy(top, middle, { x: 1, y: 0 });
  middle.contacts.length = 0;
  middle.mapContacts.push({ x: 1, y: 0 });
  assert.equal(isNativePlayerAirborne(actor), true, 'walls do not establish ground support');
});

test('airborne override only runs after the body graph says airborne; missing body returns false', () => {
  const { actor, bodies } = fixture();
  let calls = 0;
  actor.airborneOverride = () => { calls++; return false; };
  assert.equal(isNativePlayerAirborne(actor), false);
  assert.equal(calls, 1);
  bodies[0].mapContacts.push({ x: 0, y: 1 });
  assert.equal(isNativePlayerAirborne(actor), false);
  assert.equal(calls, 1);
  actor.bodies.length = 0;
  assert.equal(isNativePlayerAirborne(actor), false);
  assert.equal(calls, 1);
});

test('gravity limits the projected component and corrects velocities already beyond terminal speed', () => {
  assert.deepEqual(nativePlayerGravityDelta({ x: 3, y: 0 }), { x: 0, y: f(.65) });
  assert.deepEqual(nativePlayerGravityDelta({ x: 100, y: 19.25 }), { x: 0, y: .25 });
  assert.deepEqual(nativePlayerGravityDelta({ x: 100, y: 20 }), { x: -0, y: -.5 });
  assert.deepEqual(nativePlayerGravityDelta({ x: 20, y: 100 }, { x: 1, y: 0 }), { x: -.5, y: -0 });
});

test('POST adds only the latest correction and forwards corrected velocity to components in order', () => {
  const seen = [];
  const actor = { playerFlags: 8, velocity: { x: 3, y: 5 }, components: [
    { consumeVelocity(value) { seen.push({ ...value }); value.y = 0; } },
    { consumeVelocity(value) { seen.push({ ...value }); } },
  ] };
  recordNativePlayerCorrection(actor, { x: -3, y: -5 });
  recordNativePlayerCorrection(actor, { x: -.25, y: -2 });
  applyNativePlayerCorrectionVelocity(actor);
  assert.deepEqual(seen, [{ x: 2.75, y: 3 }, { x: 2.75, y: 0 }]);
  actor.playerFlags = 0;
  actor.velocity = { x: 1, y: 2 };
  applyNativePlayerCorrectionVelocity(actor);
  assert.deepEqual(actor.velocity, { x: 1, y: 2 });
  assert.equal(seen.length, 2);
});
