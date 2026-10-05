import { nativeBodyPlacementBlocked } from './native-body-placement.mjs';
import { findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
function setProbePosition(body, position) {
  const changed = Math.abs(f(body.previousPosition.x - position.x)) > EPSILON
    || Math.abs(f(body.previousPosition.y - position.y)) > EPSILON;
  body.flags = changed ? body.flags | 64 : body.flags & ~64;
  body.position = { ...position };
}

// bb6fa50 relocation branch. Pending position is controller+20; zero squared
// length is the native sentinel. Failed placement restores only the probe.
export function tryNativePlayerRelocation(actor, state, scene) {
  const target = state.pendingPosition;
  const squared = f(f(target.x * target.x) + f(target.y * target.y));
  if (!(Math.abs(squared) > EPSILON)) return false;
  const body = actor.bodies[0]?.body;
  if (!body) throw new Error('Native relocation requires a player body');
  if (scene.scrollMode !== 0) {
    const edge = f(scene.viewPosition.x + scene.viewOffset.x);
    if (target.x < f(edge - 16)) target.x = f(edge + 16);
  }
  const oldPosition = { ...body.position };
  setProbePosition(body, target);
  if (nativeBodyPlacementBlocked(body.world, body)) {
    setProbePosition(body, oldPosition);
    return false;
  }
  // bc13a50 clears this body's actor contacts, emitting END regardless of
  // accepted-state bit. Reciprocal contacts and map contacts remain intact.
  for (const contact of body.contacts) {
    if (body.world) body.onContactEnd?.(findNativeBody(body.world, contact.bodyId) ?? null, contact.normal, 1);
  }
  body.contacts.length = 0;
  actor.position = { ...target };
  actor.stepStartPosition = { ...target };
  for (const entry of actor.bodies) {
    if (!entry.followsActor) continue;
    entry.body.position = { ...target };
    entry.body.previousPosition = { ...target };
    entry.body.flags &= ~64;
  }
  actor.velocity = { x: 0, y: 0 };
  for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
  state.pendingPosition = { x: 0, y: 0 };
  if (state.flags & 4) { actor.setEnabled(true); state.flags &= ~4; }
  return true;
}
