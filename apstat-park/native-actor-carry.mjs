import { findNativeBody } from './native-body-registry.mjs';
import { syncNativeActorBodies } from './native-actor-motion.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
const DIRECTIONS = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
const sameNormal = (a, b) => Math.abs(f(a.x - b.x)) <= EPSILON && Math.abs(f(a.y - b.y)) <= EPSILON;
const dot = (a, b) => f(f(a.x * b.x) + f(a.y * b.y));
function normalized(value) {
  const length = f(Math.sqrt(f(f(value.x * value.x) + f(value.y * value.y))));
  return length === 0 ? { ...value } : { x: f(value.x / length), y: f(value.y / length) };
}

// bc13550 preserves stored contact order and ignores missing registry IDs.
function contactsInDirection(body, direction) {
  if (!body?.world) return [];
  return body.contacts.filter(contact => sameNormal(contact.normal, direction))
    .map(contact => findNativeBody(body.world, contact.bodyId)).filter(Boolean);
}

// bc16f50. No movement is applied here; use existing contact chains to test
// whether the actor's requested displacement is allowed. param3 is UP for Balance.
export function canMoveNativeActor(actor, movement, preferredDirection = 0, bodyIndex = 0) {
  const delta = { x: f(movement.x), y: f(movement.y) };
  if (Math.abs(delta.x) <= 2 ** -52 && Math.abs(delta.y) <= 2 ** -52) return false;
  const direction = normalized(delta);
  const stack = [actor.bodies[bodyIndex]?.body];
  let operations = 0;
  while (stack.length) {
    if (++operations > 10000) throw new Error('Native movement gate exceeded traversal limit');
    const body = stack.pop();
    for (const other of contactsInDirection(body, direction)) {
      if (other.flags & 16) {
        if (dot(DIRECTIONS[preferredDirection], direction) >= 0) return false;
        continue;
      }
      if (other.mapContacts.some(normal => sameNormal(normal, direction))) return false;
      if (!other.actor) throw new Error('Native movement contact requires an owning actor');
      stack.push(other.actor.bodies[0]?.body);
    }
  }
  return true;
}

// bc17330 -> bc16780 for Balance's [syncBodies=1, compensateVelocity=0,
// recurse=1, ..., directionFromMovement=0, bodyIndex=0, categoryMask=0].
// This named entry point intentionally does not stand in for other option sets.
export function carryNativeBalanceRiders(actor, movement) {
  const direction = DIRECTIONS[0];
  const visited = new Set();
  const delta = { x: f(movement.x), y: f(movement.y) };
  function carryFrom(carrier) {
    for (const body of contactsInDirection(carrier.bodies[0]?.body, direction)) {
      if (body.flags & 16) continue;
      const rider = body.actor;
      if (!rider) throw new Error('Native carry contact requires an owning actor');
      if (visited.has(rider)) continue;
      // Native uses a 100-pointer sorted container. Overflow replacement
      // depends on allocation addresses; reject it until that model exists.
      if (visited.size === 100) throw new Error('Native carry pointer capacity exceeded');
      visited.add(rider);
      rider.position = { x: f(rider.position.x + delta.x), y: f(rider.position.y + delta.y) };
      syncNativeActorBodies(rider);
      rider.postResetVector = { ...delta }; // +120, cleared by common POST
      rider.onCarried?.({ ...delta }, direction, visited); // actor virtual +f0 gets a local copy
      carryFrom(rider);
    }
  }
  carryFrom(actor);
}
