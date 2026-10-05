import { findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
const down = normal => Math.abs(f(normal.x)) <= EPSILON && Math.abs(f(normal.y - 1)) <= EPSILON;

// bb69dd0/bb67850: a missing body is not airborne. Otherwise every DOWN
// contact must be another airborne category-1 body. Map support wins first.
export function isNativePlayerAirborne(actor) {
  let operations = 0;
  function visit(body) {
    if (!body) return false;
    if (++operations > 10000) throw new Error('Native player support exceeded traversal limit');
    if (body.mapContacts.some(down)) return false;
    const supports = body.world ? body.contacts.filter(contact => down(contact.normal))
      .map(contact => findNativeBody(body.world, contact.bodyId)).filter(Boolean) : [];
    // bb69dd0 supplies a fixed 16-pointer output array to bc13550.
    if (supports.length > 16) throw new Error('Native player support pointer capacity exceeded');
    for (const support of supports) {
      if (support.category !== 1 || !visit(support)) return false;
    }
    return true;
  }
  if (!visit(actor.bodies[0]?.body)) return false;
  return actor.airborneOverride ? Boolean(actor.airborneOverride()) : true;
}

// bb67da0 projects current velocity onto player+c88, caps that component at
// 19.5/frame, and returns the delta vector. It does not clamp the other axis.
export function nativePlayerGravityDelta(velocity, direction = { x: 0, y: 1 }) {
  const projection = f(f(velocity.x * direction.x) + f(velocity.y * direction.y));
  const next = Math.min(f(projection + f(.65)), f(19.5));
  const delta = f(next - projection);
  return { x: f(direction.x * delta), y: f(direction.y * delta) };
}

// bb6add0 stores the most recent correction, not a sum. bb690d0 clears it
// after controller PRE; bb691d0 applies it before controller POST when bit8
// is set, then forwards velocity through the registered component interfaces.
export function recordNativePlayerCorrection(actor, delta) {
  actor.collisionCorrection = { x: f(delta.x), y: f(delta.y) };
}

export function applyNativePlayerCorrectionVelocity(actor) {
  if (!(actor.playerFlags & 8)) return;
  const correction = actor.collisionCorrection;
  actor.velocity = { x: f(actor.velocity.x + correction.x), y: f(actor.velocity.y + correction.y) };
  for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
}
