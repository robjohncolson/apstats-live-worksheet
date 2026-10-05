import { findNativeBody } from './native-body-registry.mjs';
import { syncNativeActorBodies } from './native-actor-motion.mjs';
const f = Math.fround;
const epsilon = 2 ** -23;

// bb55370 passes [1,0,1,0,0,0,0] vertically and [1,0,1,0,1,0,0]
// horizontally. Both start UP; only horizontal recursion follows movement.
export function carryNativeLiftRiders(actor, movement) {
  for (const axis of ['y', 'x']) {
    if (Math.abs(movement[axis]) <= epsilon) continue;
    const delta = { x: 0, y: 0, [axis]: f(movement[axis]) };
    const visited = new Set();
    function carry(carrier, direction) {
      const body = carrier.bodies[0]?.body;
      if (!body?.world) return;
      const contacts = body.contacts.filter(({ normal }) =>
        Math.abs(f(normal.x - direction.x)) <= epsilon && Math.abs(f(normal.y - direction.y)) <= epsilon);
      if (contacts.length > 16) throw new Error('Native lift contact capacity exceeded');
      for (const contact of contacts) {
        const other = findNativeBody(body.world, contact.bodyId);
        if (!other || (other.flags & 16)) continue;
        const rider = other.actor;
        if (!rider) throw new Error('Native lift carry requires an owning actor');
        if (visited.has(rider)) continue;
        if (visited.size === 100) throw new Error('Native lift carry capacity exceeded');
        visited.add(rider);
        rider.position = { x: f(rider.position.x + delta.x), y: f(rider.position.y + delta.y) };
        syncNativeActorBodies(rider);
        rider.postResetVector = { ...delta };
        rider.onCarried?.({ ...delta }, direction, visited, { syncBodies: true, compensateVelocity: false,
          recurse: true, directionFromMovement: axis === 'x', bodyIndex: 0, categoryMask: 0 });
        carry(rider, axis === 'x' ? { x: Math.sign(delta.x), y: 0 } : direction);
      }
    }
    carry(actor, { x: 0, y: -1 });
  }
}
