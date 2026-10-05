import { findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;

function above(body) {
  if (!body.world) return [];
  return body.contacts.filter(contact => Math.abs(f(contact.normal.x)) <= EPSILON
    && Math.abs(f(contact.normal.y + 1)) <= EPSILON)
    .map(contact => findNativeBody(body.world, contact.bodyId)).filter(Boolean);
}

// bc15c70/bc15dc0. Divide by maximum UP-chain depth (bc13430), not number of
// riders. Commands visit direct unique contacts in stored order; each actor's
// +90 bit16 permits propagation with another increment of the shared impulse.
// includeBody selects bb348b0's entry: the contacted actor gets the first
// share, unlike a jumping carrier which sends only to the actors above it.
export function propagateNativeJumpImpulse(body, velocity, command = 2, includeBody = false) {
  let operations = 0;
  function guard() {
    if (++operations > 10000) throw new Error('Native jump impulse exceeded traversal limit');
  }
  function depth(current) {
    guard();
    let result = 0;
    for (const next of above(current)) {
      if (above(next).length > 16) throw new Error('Native impulse depth pointer capacity exceeded');
      result = Math.max(result, 1 + depth(next));
    }
    return result;
  }
  const increment = f(f(velocity) / f(depth(body) + Number(includeBody)));
  function send(current, amount) {
    guard();
    const actor = current.actor;
    if (!actor) throw new Error('Native impulse contact requires an owning actor');
    actor.onCommand?.(command, { x: 0, y: amount });
    if (actor.motionFlags & 16) visit(current, f(amount + increment));
  }
  function visit(current, amount) {
    const direct = [];
    for (const next of above(current)) {
      if (!direct.includes(next) && direct.length < 16) direct.push(next);
    }
    for (const next of direct) send(next, amount);
  }
  if (includeBody) send(body, increment);
  else visit(body, increment);
}
