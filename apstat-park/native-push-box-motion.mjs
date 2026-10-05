import { countNativePushBoxPushers } from './native-push-box-contacts.mjs';
import { findNativeBody } from './native-body-registry.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { carryNativeScrollNeighbors } from './native-player-boundary.mjs';

const f = Math.fround;
const EPSILON = 2 ** -23;
const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 };

// bb34820. Verified import bc4cd1e / IAT 1ec5d8 is CRT ceil.
// Use actual scene player count, not the configured party cap.
export function nativePushBoxRequiredPlayers(actor) {
  const proportion = f(f(actor.requiredPercent >>> 0) / 100);
  return (Math.ceil(f(proportion * f(actor.scene.players.length))) + actor.requiredOffset) | 0;
}

// bb343e0: any map contact stops propagation. Actor contacts recurse through
// all categories, with an additional same-direction threshold for PushBoxes.
export function nativePushBoxPathClear(actor, direction) {
  if (direction !== 2 && direction !== 3) throw new Error('Invalid native horizontal push direction');
  const x = direction === 2 ? -1 : 1;
  const matches = normal => Math.abs(f(normal.x - x)) <= EPSILON && Math.abs(f(normal.y)) <= EPSILON;
  const path = new Set();
  function clear(current) {
    const body = current.bodies[0]?.body;
    if (!body) throw new Error('Native push path requires a primary body');
    if (body.mapContacts.some(matches)) return false;
    if (path.has(current)) throw new Error('Cyclic native push clearance chain');
    path.add(current);
    const neighbors = body.world ? body.contacts.filter(contact => matches(contact.normal))
      .map(contact => findNativeBody(body.world, contact.bodyId)).filter(Boolean) : [];
    if (neighbors.length > 16) throw new Error('Native push clearance pointer capacity exceeded');
    for (const neighbor of neighbors) {
      const next = neighbor.actor;
      if (next.isNativePushBox) {
        const count = countNativePushBoxPushers(next, direction) >>> 0;
        next.pusherCount = Math.max(next.pusherCount >>> 0, count);
        if (count < (nativePushBoxRequiredPlayers(next) >>> 0)) return false;
      }
      if (!clear(next)) return false;
    }
    path.delete(current);
    return true;
  }
  return clear(actor);
}

// bb33890. Speed c61f320 is 1, gravity bcb69bc is float32(.65).
// A blocked path suppresses neighbor carry, not the block's own velocity.
export function stepNativePushBoxMotion(actor) {
  actor.pusherCount = 0;
  if (actor.boxFlags & 2) {
    actor.velocity = { x: 0, y: 0 };
    notifyVelocity(actor);
    return;
  }
  const body = actor.bodies[0]?.body;
  if (!body) return;
  actor.velocity.x = 0;
  notifyVelocity(actor);
  const required = nativePushBoxRequiredPlayers(actor) >>> 0;
  const left = countNativePushBoxPushers(actor, 2) >>> 0;
  actor.pusherCount = left;
  let movement = 0;
  if (left >= required) {
    movement = 1;
  } else {
    const right = countNativePushBoxPushers(actor, 3) >>> 0;
    actor.pusherCount = Math.max(left, right);
    if (right >= required) movement = -1;
  }
  if (movement) {
    actor.velocity.x = movement;
    notifyVelocity(actor);
    const direction = movement > 0 ? 3 : 2;
    if (nativePushBoxPathClear(actor, direction)) {
      carryNativeScrollNeighbors(actor, { x: movement, y: 0 }, direction);
    }
  }
  if (!hasNativeDirectionalContact(body, UP) && Math.abs(actor.externalVelocity.x) > EPSILON) {
    addVelocity(actor, actor.externalVelocity.x, 0);
  }
  if (!hasNativeDirectionalContact(body, DOWN)) {
    addVelocity(actor, 0, f(.65));
  } else {
    actor.velocity.y = 0;
    notifyVelocity(actor);
    if (!(actor.boxFlags & 1)) actor.externalVelocity = { x: 0, y: 0 };
  }
  if (actor.boxFlags & 1) {
    addVelocity(actor, 0, actor.externalVelocity.y);
    actor.boxFlags &= ~1;
  }
}

function notifyVelocity(actor) {
  for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
}

function addVelocity(actor, x, y) {
  actor.velocity.x = f(actor.velocity.x + x);
  actor.velocity.y = f(actor.velocity.y + y);
  notifyVelocity(actor);
}
