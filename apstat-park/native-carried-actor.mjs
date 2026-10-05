import { findNativeBody } from './native-body-registry.mjs';
import { syncNativeActorBodies } from './native-actor-motion.mjs';
const f = Math.fround;
const epsilon = 2 ** -23;
const normalize = vector => {
  const length = f(Math.sqrt(f(f(vector.x * vector.x) + f(vector.y * vector.y))));
  return length ? { x: f(vector.x / length), y: f(vector.y / length) } : { ...vector };
};

// bc16780 then bc17330. Direct attachment calls bypass the contact category
// filter; that filter applies only to subsequent contact traversal.
export function carryNativeActorWithOptions(actor, movement, direction, visited, options) {
  if (!options) throw new Error('Native attachment carry requires the originating options');
  if (visited.has(actor)) return;
  if (visited.size === 100) throw new Error('Native carry pointer capacity exceeded');
  visited.add(actor);
  const delta = { x: f(movement.x), y: f(movement.y) };
  if (options.compensateVelocity) {
    const unit = normalize(delta);
    const projection = f(f(unit.x * actor.velocity.x) + f(unit.y * actor.velocity.y));
    if (projection < 0) {
      delta.x = f(delta.x - f(unit.x * projection));
      delta.y = f(delta.y - f(unit.y * projection));
    }
  }
  actor.position = { x: f(actor.position.x + delta.x), y: f(actor.position.y + delta.y) };
  if (options.syncBodies) syncNativeActorBodies(actor);
  actor.postResetVector = { ...delta };
  actor.onCarried?.({ ...delta }, direction, visited, options);
  if (!options.recurse) return;
  const nextDirection = options.directionFromMovement ? normalize(movement) : direction;
  const body = actor.bodies[options.bodyIndex]?.body;
  if (!body?.world) return;
  const contacts = body.contacts.filter(({ normal }) =>
    Math.abs(f(normal.x - nextDirection.x)) <= epsilon && Math.abs(f(normal.y - nextDirection.y)) <= epsilon);
  if (contacts.length > 16) throw new Error('Native carry contact capacity exceeded');
  for (const contact of contacts) {
    const other = findNativeBody(body.world, contact.bodyId);
    if (!other || (other.flags & 16)) continue;
    if (options.categoryMask && !((options.categoryMask >>> (other.category & 31)) & 1)) continue;
    if (!other.actor) throw new Error('Native carry contact requires an owning actor');
    carryNativeActorWithOptions(other.actor, movement, nextDirection, visited, options);
  }
}
