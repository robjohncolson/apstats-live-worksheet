import { findNativeBody } from './native-body-registry.mjs';

const f = Math.fround;
const EPSILON = 2 ** -23;
const DIRECTIONS = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

// bb34530, using bc13550's ordered registry lookup. All actor categories
// contribute, and a shared descendant contributes once per contact path.
// Native has a 16-pointer local array and no cycle protection. Invalid graphs
// fail explicitly here instead of overflowing storage or silently deduplicating.
export function countNativePushBoxPushers(actor, direction) {
  const normal = DIRECTIONS[direction];
  if (!normal) throw new Error('Invalid native push direction');
  const path = new Set();

  function count(current) {
    const body = current.bodies?.[0]?.body;
    if (!body?.world) return 0;
    if (path.has(current)) throw new Error('Cyclic native push contact chain');
    path.add(current);
    const neighbors = [];
    for (const contact of body.contacts) {
      if (!(Math.abs(f(contact.normal.x - normal.x)) <= EPSILON &&
        Math.abs(f(contact.normal.y - normal.y)) <= EPSILON)) continue;
      const neighbor = findNativeBody(body.world, contact.bodyId);
      if (neighbor) neighbors.push(neighbor);
    }
    if (neighbors.length > 16) throw new Error('Native push contact pointer capacity exceeded');
    let total = 0;
    for (const neighbor of neighbors) {
      const velocity = neighbor.actor.velocity;
      const moving = direction === 0 ? velocity.y > EPSILON :
        direction === 1 ? velocity.y < -EPSILON :
        direction === 2 ? velocity.x > EPSILON : velocity.x < -EPSILON;
      total = (total + Number(moving) + count(neighbor.actor)) | 0;
    }
    path.delete(current);
    return total;
  }
  return count(actor);
}
